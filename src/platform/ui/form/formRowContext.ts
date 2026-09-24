/**
 * BaseFormRow 的两类上下文（均通过 provide / inject 下发）：
 *
 * ① 密度上下文：BaseForm 容器下发默认的标签样式（弱化 + 缩小）与标签列宽，
 *    行内显式 props（labelTone / labelSize / labelWidth）优先于上下文值。
 *
 * ② 标签关联绑定：BaseFormRow 只拥有 label 这一半，另一半（控件的 id / 无障碍名）在插槽里的
 *    控件身上，行够不着——故由本文约定双向绑定：行下发标签元素 id 并接收控件上报的实际 id，
 *    行据此输出 label 的 for。控件按「能否被 label 指到」分两档接入：
 *    - 可标签化元素（input / textarea / button）→ useFormRowControlId 上报自身 id；
 *    - 其余 ARIA 控件（role=slider / radiogroup / combobox / spinbutton）label 指不到，
 *      → useFormRowLabelId 取标签 id 作 aria-labelledby。
 *    两档都不接入的控件不会让 for 悬空（行仅在收到上报后才输出 for）；此时行还会把标签元素
 *    从 <label> 降级为 <span>——label 若既无 for 又未包裹控件，Chrome 会报
 *    「FormLabelHasNeitherForNorNestedInput」，而 aria-labelledby 指向 span 同样成立，
 *    故降级对无障碍名零影响（详见 BaseFormRow 的 labelTag）。
 *
 * ③ 标签交互委托（仅单一点击块控件）：把「行标签被按下 / 被点击」交回控件自己处理，两种用途按**时机**
 *    分成两档 —— `press` 挂 pointerdown 补波纹（波纹指令只监听所在元素上的指针事件，标签与控件是兄弟
 *    节点，点标签收不到反馈；且墨水必须在指针落下那刻起）；`activate` 挂 click 补激活（触发器不是可
 *    标签化元素时 label 的 for 指不到它，只能由控件自己开面板，如 BaseSelector 的 role=combobox div；
 *    激活是点击语义，「按住标签拖走后松手」不该触发）。两档**不可合并** —— 合成一档会出现「一按就开
 *    面板」。是否需要「标签退化为 span 也要委托」由控件的 selfActivating 声明（详见 useFormRowLabelPress）。
 *    与 ② 共用同一批控件：只有一个点击块、且点标签本就该激活控件的那些。
 */
import { inject, onScopeDispose, watchEffect } from 'vue';

import type { InjectionKey } from 'vue';

export interface FormRowDensityContext {
  /** 标签亮度：'body' 常规（默认）| 'muted' 次级弱化（让所在分组的标题更突出） */
  labelTone?: 'body' | 'muted';
  /** 标签列宽（数值补 px）；容器级默认，行内 label-width 可覆盖 */
  labelWidth?: string | number;
  /**
   * 标签字号：与控件尺寸标尺（sm/md/lg）同构，调用方无需在两套命名间切换。
   * 2xs(10px) < xs(12px，默认) < sm(14px) < md(16px) < lg(20px)
   * 注：@theme 无 --text-md 令牌，md 档映射 --text-base（16px）。
   */
  labelSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg';
}

export const FORM_ROW_DENSITY_KEY: InjectionKey<FormRowDensityContext> = Symbol('form-row-density');

/**
 * 控件登记给所在行的「标签交互」处理（③）。
 *
 * 两个回调对应**两个不同的时机**，分工不可互换：
 *  - `press` 跟「按下」（pointerdown）：专供**补波纹** —— 墨水必须在指针落下那刻起；
 *  - `activate` 跟「点击」（click，同点按下并松开）：专供**补激活** —— 激活是点击语义。
 *
 * 为什么必须分开：按住标签往外一拖再松手，应当**不激活**控件（这与直接点控件一致，是用户取消
 * 一次点击的常规手法），但墨水该在按下时就已晕开。合成一档会出现「一按就开面板」——
 * 与直接点触发器的时机不一致，是真实出现过的缺陷。
 */
export interface FormRowLabelPress {
  /** 行标签被**按下**时执行：补波纹（按下即应有反馈的事） */
  press: () => void;
  /** 行标签被**点击**时执行：补激活（开面板等）。缺省不登记 —— 激活若已由浏览器经 `for` 完成，则无需再补 */
  activate?: () => void;
  /**
   * 控件**自己实现激活**、不依赖 label 的 for（默认 false）。
   * - 缺省 false：行只在标签确实是 `<label>` 时委托 —— 那条路径的激活由浏览器经 `for` 完成
   *   （BaseSwitch / BaseCheckbox）；
   * - true：标签退化为 `<span>` 时同样委托（触发器不可标签化、`for` 指不到，如 BaseSelector 的
   *   role=combobox div），行据此外也给出可点击光标。
   */
  selfActivating?: boolean;
}

export interface FormRowLabelling {
  /**
   * 行标签元素的 id（该行为非可标签化控件提供 aria-labelledby 的指向目标）。
   * 该元素可能是 <label>，也可能是降级后的 <span>——aria-labelledby 两者都认，取用方无需区分。
   */
  readonly labelId: string;
  /**
   * 行内控件上报承载标签的元素 id；传 undefined 即撤销上报
   * （控件卸载、本次渲染无对应元素，或控件自身已有可见标签、无需依赖行标签取名）。
   */
  report(id: string | undefined): void;
  /**
   * 标签交互委托登记（③）：控件把「点行标签时该做什么」交回来 —— 按下补波纹、点击补激活两个时机；
   * 传 undefined 即撤销登记（控件卸载）。仅「单一点击块」控件登记，判据与适用范围见 useFormRowLabelPress。
   */
  reportLabelPress(target: FormRowLabelPress | undefined): void;
}

export const FORM_ROW_LABELLING_KEY: InjectionKey<FormRowLabelling> = Symbol('form-row-labelling');

/**
 * 可标签化控件接入（input / textarea / button 等 label 能指向的元素）：
 * 把自身元素 id 上报给所在行，行据此输出 label 的 for。
 *
 * 上报的是控件**自己的** id（而非行下发的），故控件显式指定 id 时同样生效；行内无控件上报时
 * for 不输出，不会产生「for 指向不存在的元素」的悬空关联。行外使用（无 BaseFormRow 祖先）为空操作。
 * 控件若自身已有可见标签（如 BaseCheckbox 的 <label for> 包着 input），应上报 undefined 主动退出 ——
 * 否则行标签会与自身标签拼成一个重复的无障碍名（同一件事被念两遍）。
 */
export function useFormRowControlId(resolveId: () => string | undefined): void {
  const labelling = inject(FORM_ROW_LABELLING_KEY, null);
  if (!labelling) return;
  watchEffect(() => labelling.report(resolveId()));
  onScopeDispose(() => labelling.report(undefined));
}

/**
 * 非可标签化控件接入（role=slider / radiogroup / combobox / spinbutton）：
 * 这类元素 label 的 for 指不到，无障碍名只能靠 ARIA 关联建立，故取所在行的标签元素 id
 * 用作 aria-labelledby（该标签元素在此时会降级为 span，aria-labelledby 对此不敏感）。
 * 行外使用返回 undefined（调用方据此不输出该 attribute）。
 */
export function useFormRowLabelId(): string | undefined {
  return inject(FORM_ROW_LABELLING_KEY, null)?.labelId;
}

/**
 * 标签交互委托接入 —— **仅「单一点击块」控件适用**（button / switch / checkbox / selector）。
 *
 * 缺口：同一个动作（激活控件）有两条入口，却只有一条有反馈 —— 波纹指令只监听**所在元素**上的指针事件，
 * 而行标签与控件是兄弟节点。若标签不可点击（行已把它降级为 span）则两条入口都不存在，也就没有缺口 ——
 * 除非控件**自己实现激活**（见下）。
 *
 * 接入后行会代调两个回调，它们挂在**不同事件**上（口径详见 FormRowLabelPress）：
 *  - `press` 挂 pointerdown —— 补波纹。起点取点击块中心，与波纹指令自身处理合成 / 键盘激活时同口径
 *    （那种场景没有指针坐标，指令也取元素中心）；标签不是控件，指针落在标签上，拿标签坐标当圆心
 *    只会把波纹甩到点击块之外；
 *  - `activate` 挂 click —— 补激活。**不要**把它并进 press：press 在按下瞬间就触发，并进去会让
 *    「按住标签拖走后松手」也把控件激活，与直接点控件的时机不一致（BaseSelector 曾如此）。
 *
 * `selfActivating`：控件自己不靠 label 的 for 就能被激活时传 true（如 BaseSelector 的 role=combobox
 * 触发器 —— 它不是可标签化元素，行标签因此退化为 span，行只会在收到该声明后才把 span 标签的委托也
 * 接过来，并给出可点击光标）。缺省 false：只在标签确实是 `<label>` 时委托，激活交给浏览器的 for。
 *
 * 为什么这些控件**不**接入：
 *  - **点击块不唯一**：分段控件每段一块、BaseNumberInput 两个步进钮、BaseInput 还有一个清空钮 ——
 *    点标签时没有唯一落点可放，波纹画在哪一块都是错的；
 *  - **点标签本就无事发生**：BaseCheckbox 自带文案时不上报 id（行标签退化为 span、点它激活不了控件），
 *    此时既不该补波纹、也不该给手型 —— 故它按缺省（selfActivating 不传）接入即可自动排除；
 *  - **没有点击块**的（BaseTextarea 之类纯输入区）：点标签只是聚焦，无按下语义。
 *
 * 行外使用（无 BaseFormRow 祖先）为空操作。
 */
export function useFormRowLabelPress(
  press: () => void,
  options?: { selfActivating?: boolean; activate?: () => void }
): void {
  const labelling = inject(FORM_ROW_LABELLING_KEY, null);
  if (!labelling) return;
  labelling.reportLabelPress({ press, ...options });
  onScopeDispose(() => labelling.reportLabelPress(undefined));
}
