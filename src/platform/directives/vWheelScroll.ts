/**
 * v-wheel-scroll 指令：横向滚轮劫持滚动（触控板/鼠标滚轮自适应）。
 * 位移按真实滚动距离 1:1 映射：先按 WheelEvent.deltaMode 把滚轮增量换算为像素
 * （行/页单位乘容器行高、可视高度），再乘方向与倍率；不做单次位移上限钳制。
 * 支持速度倍率（speed 选项 / .double、.triple 修饰符 / { double: true }、{ triple: true } 选项三通道）、
 * 平滑惯性缓动、方向反转与边界穿透策略（contain 恒拦截 / auto 以「一轮手势」为界交接，见 edgeLock）。
 *
 * 交接（overscroll:'auto' 的让位）由本容器自己驱动外层滚动容器，**不走浏览器原生滚动链**：
 * 原生一旦接手，这一轮输入序列就归浏览器所有（后续事件不再可取消），本容器的 preventDefault
 * 随即失效——外层照样跟着滚，「独占」形同虚设。详见 handOffToOuter。
 * 交接的时间曲线跟随 smooth 档（见 scrollBy）：宿主横移是缓动的而交接整段瞬移，
 * 观感就是「横滚结束的一瞬竖向闪现一段」，两条动线必须同档。
 *
 * 另有一道不依赖 preventDefault 的保险：接管期间在宿主上挂 `overscroll-behavior: contain`
 * （见 applyOverscrollGuard），由浏览器在合成器层直接掐断原生滚动链。独占与让位都靠
 * preventDefault，而事件可取消性并非任何时候都成立（浏览器锁定输入序列后即不可取消），
 * 这道 CSS 兜底能在那些时刻仍然保证「位移只走本容器指定的那条路」。
 *
 * 重要：所有程序化写入一律经 setScrollOffset()（唯一出口，本轴与交接写外层都走它），
 * 显式指定 behavior:'instant'——smooth 档的缓动也是逐帧经它落地的，不另开写入通道。
 * 若容器带 CSS `scroll-behavior: smooth`（如本项目内 class="scroll-smooth" 的横滚条），
 * 普通 scrollLeft 赋值不会同步生效——回读仍是动画中的旧值，
 * 会造成「位移不按真实距离映射」且「倍率被动画吞掉看不出差别」。
 */
import { clamp } from '@/platform/utils/common';
import { resolveWheelDeltaPx, toPixelDelta } from '@/platform/utils/dom';

import type { Directive } from 'vue';

/**
 * 指令修饰符：smooth（平滑惯性）/ reverse（反向）/ prevent / stop / contain / auto（边界穿透策略）
 * / double、triple（位移翻倍 / 三倍，等价选项 { double: true } / { triple: true }；
 *   triple 另收常见拼写 —— 未知修饰符只会静默失效，拼错比多收一个拼写更难排查）
 * / disabled（静态禁用，动态禁用请用绑定值 { disabled }）。
 *
 * 字面量联合用于模板编辑器补全提示；末尾 `(string & Record<never, never>)` 保留宽松兼容——
 * Vue 传入的 modifiers 本质是任意字符串键，且该交叉类型带索引签名，
 * 可安全赋值给内部使用的 Record<string, boolean> 参数（与其他指令同一写法）。
 */
export type WheelScrollModifiers =
  | 'smooth'
  | 'reverse'
  | 'prevent'
  | 'stop'
  | 'contain'
  | 'auto'
  | 'double'
  | 'triple'
  | 'disabled'
  | (string & Record<never, never>);

export interface WheelScrollOptions {
  /** 滚动灵敏度/倍率，默认 1 */
  speed?: number;
  /**
   * 位移翻倍，等价 .double 修饰符；与 speed 相乘叠加（speed: 1.5 + double: true → 3 倍）。
   * 修饰符补全的是模板里的直写场景，本字段补的是绑定值通道——BaseScrollArea 这类封装
   * 只透传 wheel 选项对象、修饰符穿不过去，{ double: true } 是它们唯一能表达翻倍的方式。
   * 归一化时折进 speed，运行态只认 speed（本字段保留供配置回读）。
   */
  double?: boolean;
  /**
   * 位移三倍，等价 .triple 修饰符；语义与叠加方式同 double（与 speed 相乘）。
   * 同样补的是绑定值通道：封装组件只透传 options，模板修饰符穿不过去。
   */
  triple?: boolean;
  /** 是否启用平滑惯性滚动动画，默认 false（使用 .smooth 开启） */
  smooth?: boolean;
  /** 是否反转滚动方向 */
  reverse?: boolean;
  /** 是否禁用滚轮劫持 */
  disabled?: boolean;
  /** 是否阻止默认事件，默认 true */
  prevent?: boolean;
  /** 是否阻止事件冒泡，默认 false */
  stop?: boolean;
  /**
   * 到达边界时的穿透策略：'contain' 始终拦截（外层容器永远拿不到这一轴的滚动）
   * | 'auto' 边界放行给外层滚动容器。
   * 'auto' 的放行不是「触边即让位」：滚到末尾时本容器会先独占完当前这轮连续手势（见 edgeLock），
   * 只有新手势才真正交给外层——否则单次滚动尚未停手，外层纵向容器就被同一批事件带着往下走了。
   * 放行也**不走浏览器原生滚动链**，而是由本容器自己把位移写进上层容器（见 handOffToOuter）：
   * 原生链一旦接手，这一轮输入序列就被浏览器锁住、后续事件不再可取消，本容器再想反向收回就晚了。
   * 交接的时间曲线跟随 smooth 档：开了 smooth 就同样缓动上去，不开才瞬时到位——宿主横移是缓动的
   * 而交接整段瞬移，观感就是「横滚结束的一瞬竖向闪现一段」（见 scrollBy）。
   */
  overscroll?: 'contain' | 'auto';
  /**
   * 连续滚动判定窗口（ms，默认 300）：与上一条滚轮事件的间隔小于该值即视为「同一轮连续滚动」，
   * 超过即视为用户停手后重新开滚的新手势。它同时决定边界处的两条对称行为：
   *  - 触边后：本轮手势内继续由本容器独占（拦截但不再位移），只有新手势才让位给外层滚动容器；
   *  - 让位后：本轮余下事件（**含反向回滑**）一律不回收，避免外层正滚着却被本容器重新抓走。
   * 连滚与触控板惯性的事件间隔约 16~150ms，远小于该窗口；「停手再滚」普遍 ≥400ms。
   * 传 0 关闭独占（每条事件都当新手势），回到「触边立刻放行、且反向可立即回滚」的旧行为。
   * 仅对 overscroll:'auto' 生效（'contain' 永远独占，与本项无关）。
   */
  edgeLock?: number;
  /**
   * 滚动回调：progress 为当前横向滚动进度 0~1。
   * 注意：smooth 模式下缓动动画的每一帧都会触发本回调，其 e 始终是触发本轮滚动的那个原始 WheelEvent
   *（非逐帧事件），如果有逐帧计算需求请只依赖 progress，勿用 e.deltaX 等推断当前帧。
   */
  onScroll?: (e: WheelEvent, progress: number) => void;
  /** 贴边回调：内容横向滚到最左/最右时触发（与 wheel-scroll-edge 事件同源） */
  onEdge?: (edge: 'left' | 'right') => void;
}

export type WheelScrollBinding = number | boolean | WheelScrollOptions | undefined;

/** 归一化指令配置：绑定值支持速度倍率/开关/选项对象，修饰符叠加并补齐默认值。 */
const normalize = (value: WheelScrollBinding, modifiers?: Record<string, boolean>): WheelScrollOptions => {
  let opts: WheelScrollOptions = {};
  if (typeof value === 'number') opts.speed = value;
  else if (typeof value === 'boolean') opts.disabled = !value;
  else if (value && typeof value === 'object') opts = { ...value };

  if (modifiers) {
    if (modifiers['smooth'] !== undefined) opts.smooth = Boolean(modifiers['smooth']);
    if (modifiers['reverse'] !== undefined) opts.reverse = Boolean(modifiers['reverse']);
    if (modifiers['prevent'] !== undefined) opts.prevent = Boolean(modifiers['prevent']);
    if (modifiers['stop'] !== undefined) opts.stop = Boolean(modifiers['stop']);
    if (modifiers['contain']) opts.overscroll = 'contain';
    if (modifiers['auto']) opts.overscroll = 'auto';
    // 静态修饰符 .disabled（编译期固定，动态禁用请用绑定值 { disabled }）
    if (modifiers['disabled']) opts.disabled = true;
    // .double / .triple 与 { double: true } / { triple: true } 归一为同一字段，下方只在一处折进倍率，
    // 两条通道不会各算一次；修饰符始终置真（与 smooth/reverse 同款：修饰符覆盖选项，无法用修饰符取消）
    if (modifiers['double']) opts.double = true;
    if (modifiers['triple']) opts.triple = true;
  }

  opts.speed ??= 1;
  // double / triple：滚动位移的倍率加成，叠加在最终倍率上（含绑定值 speed），
  // 故 speed=1.5 + double 得 3；两者按乘法复合（同时给出得 6 倍）——乘法可交换、次序无关，
  // 且不会静默丢弃其中之一；与 smooth / reverse 正交，可自由组合
  if (opts.double) opts.speed = (opts.speed ?? 1) * 2;
  if (opts.triple) opts.speed = (opts.speed ?? 1) * 3;
  opts.prevent ??= true;
  opts.overscroll ??= 'contain';
  // edgeLock 只对 'auto' 有意义，但仍无条件补默认值：运行态不必再判 undefined，
  // 且 'contain' 途中切成 'auto' 的那一帧就已经有窗口值可用（updated 只做整体替换）
  opts.edgeLock ??= EDGE_LOCK_MS;
  return opts;
};

/**
 * 位移倍率：方向反转 × 速度（`.double` / `.triple` / `{ double }` / `{ triple }` 已在 normalize 折进 speed）。
 * 条带内部位移与「边界让位交接」共用同一倍率——否则让位到外层的那段会丢掉用户的倍率 / 方向配置，
 * 出现「条带内带倍率、出去后不带」的手感割裂（审计 四·1）。
 */
const scrollMultiplier = (opts: WheelScrollOptions): number => (opts.reverse ? -1 : 1) * (opts.speed ?? 1);

interface WheelScrollHandler {
  opts: WheelScrollOptions;
  /**
   * 上一条滚轮事件的时刻（performance.now 时钟；null = 本次挂载尚未收到过事件）。
   * 用于判定「这仍是同一轮连续滚动」——见 onWheel。
   * 刻意记「收到的事件」而不是「被本容器消费的事件」：让位之后本轮余下的事件也必须继续算作同一轮，
   * 否则反向回滑时会被重新捕获（正是「末尾让位后快速往回滑，条带又横着动」的成因）。
   * 也不取 e.timeStamp：该字段在部分环境里是 epoch 毫秒，与 performance.now 不同基准，
   * 混用会让窗口判定直接失真；统一读同一只钟。
   */
  lastWheelAt: number | null;
  /**
   * 本轮连续滚动是否已让位给外层滚动容器（语义见 edgeLock）：置真后，本轮余下事件（**含反向**）
   * 一律不再回收捕获，直到判定出新一轮手势才复位。
   */
  handedOff: boolean;
  onWheel: (e: WheelEvent) => void;
  onPointerDown: () => void;
}

interface SmoothScrollState {
  /**
   * 本轮缓动作用的轴。换成另一轴时整体重置（见 performSmoothScroll）——同一个元素既可能是
   * 被自己托管的横向宿主，也可能是别人的纵向交接目标（外层容器），两条动线各有各的目标值，
   * 不能共用一份 state 的 target 还共用一个 rafId。
   */
  axis: 'x' | 'y';
  target: number;
  rafId: number | null;
}

const handlerMap = new WeakMap<HTMLElement, WheelScrollHandler>();
const smoothStateMap = new WeakMap<HTMLElement, SmoothScrollState>();

/**
 * 「已进入某处生效中的 v-wheel-scroll 策略」的滚轮事件登记表。
 *
 * 唯一消费方是 v-scrollbar 的 overlay 兜底转发：自绘滚动条的拇指/轨道是宿主的**兄弟**节点
 * （不随内容滚走，见该指令的 overlay 结构），指针落在其上时 wheel 不会冒泡到宿主，
 * 故那里会合成一条事件重派发给宿主，并以 defaultPrevented 判定宿主是否消费。
 * 但「没被拦截」不等于「宿主不管」——`overscroll:'auto'` 在边界处让位、本轮已让位等路径
 * 都会**刻意不拦截**（要把默认行为留给外层滚动链）。若兜底据此再去驱动宿主轴，就会出现
 * 「宿主被兜底拖着动、外层同时也在滚」的双重位移；而原生在同一条事件上只会二选一
 * （能吸收就吸收，吸收不了才向上链）。
 * 故此处登记「有策略裁决过它」，兜底只在未登记时才接手（宿主未挂指令，或挂了但 disabled）。
 *
 * 用 WeakSet 而非在事件对象上挂字段：不污染事件、不参与序列化，事件被回收即自动出表。
 */
const wheelScrollSeenEvents = new WeakSet<WheelEvent>();

/** 登记「本事件已进入某处生效中的 v-wheel-scroll 策略」——策略的取舍（消费或放行）即最终结论 */
export const markWheelScrollSeen = (e: WheelEvent): void => void wheelScrollSeenEvents.add(e);

/** 本事件是否已被某处生效中的 v-wheel-scroll 策略看过（v-scrollbar 的 overlay 兜底据此决定是否接手） */
export const isWheelScrollSeen = (e: WheelEvent): boolean => wheelScrollSeenEvents.has(e);

/**
 * 连续滚动判定窗口默认值（ms，edgeLock 的默认档）：两条滚轮事件间隔小于它即视为同一轮连续滚动
 * ——边界独占与「让位后不回收」都以这轮为界；间隔超过即视为用户停手后重新开滚的新手势。
 *
 * 300ms 取在两侧之间：连滚与触控板惯性的事件间隔约 16~150ms（远小于它，故整轮算一轮），
 * 而用户「明显停手后再次滚动」的间隔普遍 ≥400ms（故新手势立刻按新意图分配），
 * 与浏览器 scroll latching 的百毫秒级窗口同量级。
 */
export const EDGE_LOCK_MS = 300;

/**
 * 把一次滚轮事件在**本容器主轴**（横向）上应产生的位移换算为像素（即真实滚动距离）。
 * 实现见 @/platform/utils/dom（toPixelDelta / resolveWheelDeltaPx，与 v-scrollbar 共用）。
 */

/** 读某轴当前的滚动位置 */
const readOffset = (el: HTMLElement, axis: 'x' | 'y'): number => (axis === 'y' ? el.scrollTop : el.scrollLeft);

/** 某轴的可滚余量（判余量处都自带 1px 容差，不必在此收敛负值） */
const maxOffset = (el: HTMLElement, axis: 'x' | 'y'): number =>
  axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;

/**
 * 提交某轴的滚动位置（指令内唯一写入出口，含交接时写入外层容器）。
 *
 * 必须显式传 behavior:'instant'：'auto' 会继承容器的 CSS `scroll-behavior`，
 * 一旦容器带 scroll-smooth，赋值被浏览器转成动画，回读不会同步更新。
 * 后果有二：① 连续滚轮事件的「累加位移」每轮都从动画中的滞后位置起算，位移与真实距离脱节；
 * ② 缓动循环帧内回读值与写入前相同，被误判为「已到边界无法位移」而立刻收尾，
 * smooth 模式退化成每个事件只挪一小步。'instant' 强制瞬时到位，绕开 CSS 动画，
 * 使「像素位移 × 倍率」成为确定结果（自带 rAF 缓动也才能正确插值）。
 */
const setScrollOffset = (el: HTMLElement, axis: 'x' | 'y', value: number) =>
  void el.scrollTo(axis === 'y' ? { top: value, behavior: 'instant' } : { left: value, behavior: 'instant' });

/** 该容器在该轴上还能否按 delta 的方向继续位移（余量判据与 onWheel 内的一致，留 1px 子像素容差）。 */
const canScrollBy = (el: HTMLElement, axis: 'x' | 'y', delta: number): boolean => {
  const pos = readOffset(el, axis);
  return (delta > 0 && pos < maxOffset(el, axis) - 1) || (delta < 0 && pos > 1);
};

/**
 * 按轴位移一个容器（外层容器的交接写入走这里）。
 *
 * smooth 时必须走同款 rAF 缓动而不是直接设位：宿主的横移动线本身就是缓动的（smooth 档），
 * 交接处若整段瞬移，读起来就是「横滚结束的一瞬竖向整段闪现」——两条动线的时间曲线必须同档。
 * 这也让「连续交接」自然成立：每条事件只是往同一个缓动目标上累加，外层按自己的节奏追上去。
 */
const scrollBy = (el: HTMLElement, axis: 'x' | 'y', delta: number, smooth?: boolean) => {
  if (smooth) performSmoothScroll(el, axis, delta);
  else setScrollOffset(el, axis, readOffset(el, axis) + delta);
};

/**
 * 把本条滚轮事件的位移交接给外层滚动容器（overscroll:'auto' 在边界处的让位）。
 *
 * **不走浏览器原生滚动链**，而是由本容器自己写外层容器。原生链接手会毁掉本容器的裁决权：
 * 浏览器一旦把这一轮输入序列锁给某个滚动容器，序列内后续事件的 cancelable 就变为 false，
 * 本容器再调 preventDefault() 也照样不生效（静默失败），外层于是照滚不误。这正是
 * 「横向条带在滚、外层竖向容器也同时滚」的成因——本容器按 HOLD 写了自己的轴，外层又按
 * 原生链走了它那一轴，两条通道各滚各的。故这里反过来做：让位期间本容器**始终**
 * preventDefault（序列不被浏览器锁定，事件恒可取消），位移改由自己写进外层——
 * 让位照做，而「这一轮归谁」的裁决权始终留在本容器手里（反向回滑才收得回来）。
 *
 * 目标容器：自 el 向上找第一个「该轴还有余量可走」的祖先滚动容器，由近及远逐层尝试，
 * 与原生链的穿透顺序一致——外层到头时自动落到更外层，含 body（本项目窄视口下 body 横向
 * 可滚，正是原生链会去的地方）。每层按「先纵后横」试轴：横向条带嵌在纵向容器里是绝大多数
 * 形态，且触边后用户继续滚时的鼠标滚轮增量本就落在 deltaY 上（原生链也是这么穿透的）；
 * 横向那条留给「横向轮播嵌在横向页面里」的形态。全靠 canScrollBy 判定，走不动就继续往上。
 * 例外是**文档级节点**（html / body / scrollingElement）：它们的 computed overflow 常是 hidden
 * （本项目 body 就是 `overflow-y: hidden`），故改按实际可滚性判定，否则整条文档链永不入选。
 *
 * 取舍：不缓存祖先节点——内容增删会在一次手势中途改变链上可滚性，逐条事件重走一遍最稳；
 * 只在让位 / 无货可滚这两条路径触发，且每层的判定都是布局读，量级可控。
 *
 * @param opts 宿主选项：缓动档（smooth）与倍率 / 方向（speed、reverse，经 scrollMultiplier）一并取自此，
 *   使让位交接与条带内部位移用同一倍率（审计 四·1——旧实现交接段丢了 speed / double / triple / reverse）
 * @returns 是否真的交出去了（false = 上级整条链都无处可滚，调用方应继续独占）
 */
const handOffToOuter = (el: HTMLElement, e: WheelEvent, opts: WheelScrollOptions): boolean => {
  const { smooth } = opts;
  const multiplier = scrollMultiplier(opts);
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    // 文档级滚动容器（html / body / scrollingElement）必须按**实际可滚性**判定，不能看 computed
    // overflow：本项目 main.scss 给 body 设了 `overflow-y: hidden`（横向留给窄视口），
    // 只看 overflow 会让整条文档链永不入选 —— 纵向滚轮于是既交不出去、默认行为又被上面
    // preventDefault 拦掉，形成「滚轮压在条带上什么都不动」的死区。
    // 非文档级祖先仍按 overflow 判定：`overflow: hidden` 的节点原生链也不会滚它，不该成为交接目标。
    const isDocScroller =
      node === document.scrollingElement || node === document.body || node === document.documentElement;
    const style = isDocScroller ? null : getComputedStyle(node);
    if (isDocScroller || style!.overflowY === 'auto' || style!.overflowY === 'scroll') {
      const delta = toPixelDelta(e, e.deltaY, node, 'y') * multiplier;
      if (delta !== 0 && canScrollBy(node, 'y', delta)) {
        scrollBy(node, 'y', delta, smooth);
        return true;
      }
    }
    if (style && (style.overflowX === 'auto' || style.overflowX === 'scroll')) {
      const delta = toPixelDelta(e, e.deltaX, node, 'x') * multiplier;
      if (delta !== 0 && canScrollBy(node, 'x', delta)) {
        scrollBy(node, 'x', delta, smooth);
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
};

/**
 * 声明式兜底：把本容器的原生滚动链在**合成器层**就掐断（overscroll-behavior: contain）。
 *
 * 这是「本容器独占这一轴」的 CSS 对应物，也是本指令里唯一不依赖事件可取消性的那道保险。
 * 独占与让位都靠 preventDefault 实现，而浏览器在某些时刻会把 wheel 事件标成不可取消
 * （见 handOffToOuter 的说明），此时 preventDefault 静默失效——原生链照样把位移带给外层，
 * 于是本容器写了自己的轴、外层也跟着动。overscroll-behavior 由浏览器处理输入时直接判定，
 * 不经主线程、不看 cancelable，能兜住这一整类失效（也是本项目里「横向条带滚、外层竖向
 * 容器也同时滚」的最终防线）。
 *
 * 只在本容器**真的接管这一轴**时设置：
 *  - disabled：本容器不接管滚轮，链必须留着——overlay 兜底与原生滚动都靠它；
 *  - prevent:false：显式声明「不抑制默认行为、交原生链」，同理不能掐断（见 onWheel 里两处
 *    prevent:false 分支，那里正是刻意让原生链接手）。
 *
 * 与 setScrollOffset 同理走内联样式而非类：宿主 className 会被 Vue patch 重写，内联不受影响；
 * 且 v-scrollbar 注入的是 overflow-*，属性不同、互不覆盖。
 */
const OVERSCROLL_GUARD = 'overscroll-behavior';

/** 按当前策略设置/撤销滚动链阻断（enabled 时 contain、否则删除，保证中途失效能整体回收）。 */
const applyOverscrollGuard = (el: HTMLElement, opts: WheelScrollOptions): void => {
  if (!opts.disabled && opts.prevent) el.style.setProperty(OVERSCROLL_GUARD, 'contain');
  else el.style.removeProperty(OVERSCROLL_GUARD);
};

/** 取消元素上未完成的平滑滚动动画帧。 */
const cancelSmoothScroll = (el: HTMLElement) => {
  const state = smoothStateMap.get(el);
  if (state?.rafId !== null && state?.rafId !== undefined) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
};

/**
 * 基于 requestAnimationFrame 的动量平滑缓动滚动
 * 每次滚轮事件累加目标位移，在每一帧通过 lerp 插值逼近目标位置，
 * 解决浏览器原生 smooth 在高频滚轮连续触发时被频繁打断和卡顿的问题。
 *
 * 按轴参数化：宿主的横移动线与交接给外层容器的纵向动线共用这一套缓动
 * （见 scrollBy），两者的时间曲线才会同档，交接处不会出现「整段瞬移」的观感。
 */
const performSmoothScroll = (el: HTMLElement, axis: 'x' | 'y', scrollAmount: number, onProgress?: () => void) => {
  let state = smoothStateMap.get(el);
  if (!state) {
    state = { axis, target: readOffset(el, axis), rafId: null };
    smoothStateMap.set(el, state);
  } else if (state.axis !== axis) {
    // 同一元素换了轴（它既是自己的横向宿主，又成了别人的纵向交接目标）：掐掉上一轮的帧再重置基准，
    // 否则两条动画会同时写这个元素，且共用一个 rafId 还会互相踩掉对方的收尾
    cancelSmoothScroll(el);
    state.axis = axis;
    state.target = readOffset(el, axis);
  } else if (state.rafId === null)
    // 若上一轮缓动已彻底停止，滚动位置可能已被外部点击或拖动改变，需以当前 DOM 实际位置重置基准
    state.target = readOffset(el, axis);

  // 累加位移并限制在合法滚动区间
  state.target = clamp(state.target + scrollAmount, 0, maxOffset(el, axis));

  if (state.rafId !== null) return;

  /** 单帧缓动循环：向目标位置 lerp 逼近，差值 ≤1px 或位移停滞时立即收尾停止。 */
  const animate = () => {
    if (!state) return;
    const current = readOffset(el, axis);
    const diff = state.target - current;

    // 当差值小于等于 1px 时直接就位并结束 rAF，防止 DOM 整数像素截断导致差值停在 2~4px 陷入无限死循环
    if (Math.abs(diff) <= 1) {
      setScrollOffset(el, axis, state.target);
      state.rafId = null;
      onProgress?.();
      return;
    }

    // 保证单帧步长在整数像素级别至少有 1px 变化，避免子像素被浏览器截断舍弃
    const rawStep = diff * 0.2;
    const step = Math.abs(rawStep) < 1 ? Math.sign(rawStep) : rawStep;
    setScrollOffset(el, axis, current + step);

    // 若受边界约束未能产生任何位移，立即停止防止死循环
    if (readOffset(el, axis) === current) {
      state.rafId = null;
      onProgress?.();
      return;
    }

    onProgress?.();
    state.rafId = requestAnimationFrame(animate);
  };

  state.rafId = requestAnimationFrame(animate);
};

/**
 * 本条滚轮事件是否仍属「同一轮连续滚动」（见 edgeLock）：与上一条滚轮事件（无论当场是否被本容器
 * 消费）的间隔小于窗口即为继续，间隔超时即为用户停手后重新开滚的新手势。
 * edgeLock 传 0 时恒为 false，即每条事件都当新手势（触边立刻放行、让位后也不再保持）。
 */
const isSameGesture = (handler: WheelScrollHandler, now: number): boolean =>
  handler.lastWheelAt !== null && now - handler.lastWheelAt < (handler.opts.edgeLock ?? EDGE_LOCK_MS);

export const vWheelScroll: Directive<HTMLElement, WheelScrollBinding, WheelScrollModifiers> = {
  mounted(el, binding) {
    const opts = normalize(binding.value, binding.modifiers);

    const handler: WheelScrollHandler = {
      opts,
      lastWheelAt: null,
      handedOff: false,
      onPointerDown: () => cancelSmoothScroll(el),
      onWheel: (e: WheelEvent) => {
        if (handler.opts.disabled) return;
        // 登记「本事件由生效中的策略裁决」——含下方各条**刻意不拦截**的放行路径（如「本轮已让位」）。
        // 放在 disabled 之后：disabled 表示本容器不接管滚轮，此时宿主侧无策略，
        // 自绘滚动条的 overlay 兜底仍应照旧接手驱动本轴（见 markWheelScrollSeen）
        markWheelScrollSeen(e);
        // 组合键放行：ctrl/meta/alt + 滚轮是浏览器缩放等原生手势，交还默认行为，不劫持、不 preventDefault
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const maxScrollLeft = el.scrollWidth - el.clientWidth;
        // 本容器这一轴无货可滚：位移该由外层承接。但原生链已被 overscroll-guard 在合成器层掐断
        // （见 applyOverscrollGuard），故这里也必须由本容器自己写进外层——否则滚轮悬在这块没有
        // 横向内容可滚的条带上会「什么都不动」。prevent:false 时无权代驱动（guard 也不会设置），
        // 照旧把默认行为留给原生链
        if (maxScrollLeft <= 1) {
          // 只有真的交出去了才 preventDefault：handOffToOuter 返回 false 表示上层整条链都无处可滚，
          // 此时拦掉默认行为就成了「滚轮压在条带上什么都不动」的死区。交不出去就把这条还给原生链。
          if (handler.opts.prevent && handOffToOuter(el, e, handler.opts)) e.preventDefault();
          return;
        }

        // 真实距离映射：deltaMode 归一化为像素后，再乘方向与倍率（.double / .triple / 绑定值 speed）。
        // 此处不做单次位移上限钳制——钳制会把大 delta 压成「可视宽度 60%」，
        // 使位移与真实滚动距离脱节，倍率（尤其 .double / .triple）也会被一并削平而看不出差别。
        const deltaPx = resolveWheelDeltaPx(e, el);
        if (deltaPx === 0) return;

        const multiplier = scrollMultiplier(handler.opts);
        const scrollAmount = deltaPx * multiplier;

        const canScrollMore =
          (scrollAmount > 0 && el.scrollLeft < maxScrollLeft - 1) || (scrollAmount < 0 && el.scrollLeft > 1);

        // 手势连续性：与上一条滚轮事件（无论当场是否被本容器消费）间隔小于窗口即视为同一轮连续滚动。
        // 时间戳无条件刷新——让位之后本轮余下的事件也必须继续算作同一轮，否则反向回滑时
        // （canScrollMore 由假变真）会被本容器重新抓走：外层正滚着，横向条带却横着动了
        const now = performance.now();
        const continuing = isSameGesture(handler, now);
        handler.lastWheelAt = now;

        // 本轮已让位给外层容器：余下事件一律不拦截、不再位移，**含反向**。捕获资格只在判定出新手势时
        // 恢复（这里刻意用 'auto' 收口：handoff 只存在于边界放行那条策略里，'contain' 恒独占）
        if (handler.opts.overscroll === 'auto' && handler.handedOff) {
          if (continuing) {
            // 让位期间由本容器继续把位移写进外层（见 handOffToOuter）。**仍要 preventDefault**：
            // 一旦放行给原生链，这一轮序列就被浏览器锁定、后续事件不可取消，
            // 下面判出新手势（反向回滑）时本容器再也收不回横向条带
            if (handler.opts.prevent) {
              handOffToOuter(el, e, handler.opts);
              e.preventDefault();
            }
            return;
          }
          handler.handedOff = false;
        }

        // 触边且 'auto'，且这是本轮手势的第一条 → 让位：由本容器自己把位移写进外层（见 handOffToOuter），
        // 并照常 preventDefault 使事件保持可取消。同一轮内（continuing）跳过本分支继续独占——旧写法在
        // 触边处无条件让位给原生链，单次滚动尚未停手，外层纵向容器就被同一批事件带着往下走了
        if (handler.opts.overscroll === 'auto' && !canScrollMore && !continuing) {
          if (!handler.opts.prevent) {
            // prevent:false 是显式声明「本容器不抑制默认行为」，此时照旧交原生链（本容器无权代驱动，
            // 否则原生链 + 代驱动会各滚一次，反而制造双重位移）
            handler.handedOff = true;
            return;
          }
          if (handOffToOuter(el, e, handler.opts)) {
            handler.handedOff = true;
            e.preventDefault();
            return;
          }
          // 外层整条链都无处可滚 → 不让位：落到下方 HOLD，本容器继续独占（拦截且不再位移）
        }

        // 走到这里代表本轮由本容器独占（含 'auto' 的边界滞留），默认行为一律抑制——
        // 否则即便不再位移，事件仍会把滚动链交给外层容器，独占形同虚设
        if (handler.opts.prevent) e.preventDefault();

        if (handler.opts.stop) e.stopPropagation();

        const notifyScroll = () => {
          const currentProgress = maxScrollLeft > 0 ? clamp(el.scrollLeft / maxScrollLeft, 0, 1) : 0;

          if (handler.opts.onScroll) handler.opts.onScroll(e, currentProgress);

          el.dispatchEvent(
            new CustomEvent('wheel-scroll', {
              detail: { scrollLeft: el.scrollLeft, progress: currentProgress },
              bubbles: false,
            })
          );

          if (el.scrollLeft <= 0) {
            el.dispatchEvent(new CustomEvent('wheel-scroll-edge', { detail: { edge: 'left' }, bubbles: false }));
            handler.opts.onEdge?.('left');
          } else if (el.scrollLeft >= maxScrollLeft - 1) {
            el.dispatchEvent(new CustomEvent('wheel-scroll-edge', { detail: { edge: 'right' }, bubbles: false }));
            handler.opts.onEdge?.('right');
          }
        };

        if (handler.opts.smooth) performSmoothScroll(el, 'x', scrollAmount, notifyScroll);
        else {
          cancelSmoothScroll(el);
          // 瞬时写入（见 setScrollOffset）：保证单次滚轮位移 = 真实像素距离 × 倍率
          setScrollOffset(el, 'x', el.scrollLeft + scrollAmount);
          notifyScroll();
        }
      },
    };

    handlerMap.set(el, handler);
    el.addEventListener('wheel', handler.onWheel, { passive: false });
    el.addEventListener('pointerdown', handler.onPointerDown, { passive: true });
    // 合成器层的滚动链阻断（见 applyOverscrollGuard）：与事件监听同生命周期挂上
    applyOverscrollGuard(el, opts);
  },
  updated(el, binding) {
    const handler = handlerMap.get(el);
    if (!handler) return;
    const next = normalize(binding.value, binding.modifiers);
    // 中途被禁用或退出平滑模式时掐断未完成的缓动，避免动画继续跑完产生幽灵滚动
    if (next.disabled || !next.smooth) cancelSmoothScroll(el);
    handler.opts = next;
    // 策略可中途翻转（如 ScorePreviewPane 按「是否高于视口」切换 disabled）：
    // 阻断必须跟着回收，否则被禁用的容器仍会掐断滚轮链、变成滚不动的死区
    applyOverscrollGuard(el, next);
  },
  unmounted(el) {
    cancelSmoothScroll(el);
    smoothStateMap.delete(el);
    el.style.removeProperty(OVERSCROLL_GUARD);
    const handler = handlerMap.get(el);
    if (handler) {
      el.removeEventListener('wheel', handler.onWheel);
      el.removeEventListener('pointerdown', handler.onPointerDown);
      handlerMap.delete(el);
    }
  },
};
