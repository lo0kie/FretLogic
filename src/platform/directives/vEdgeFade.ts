/**
 * v-edge-fade 边缘羽化指令：给可滚动内容加自适应双端渐隐（方向可选）。
 * 与 vMarquee 共用 platform 的双端羽化 mask 模板（buildEdgeFadeMask），
 * 语义一致：贴住内容的一侧不渐隐，被裁切的一侧羽化柔化切口；滚动时渐隐跟随位置实时翻转。
 *
 * 方向由修饰符指定；省略时自动按溢出独立检测两轴：单轴溢出按该轴羽化，两轴均有溢出时双轴羽化
 * （mask 两层 intersect 合成，角落处两个方向的渐隐同时生效）：
 *   <div v-edge-fade.y="40">…可纵向滚动内容…</div>  // .y 纵向，40 为羽化带宽（px）
 *   <div v-edge-fade.x="24">…可横向滚动内容…</div>  // .x 横向
 *   <div v-edge-fade="40">…</div>                    // 无修饰符：自动检测溢出轴（含双轴）
 *   <div v-edge-fade.y="{ size: 24, flushEps: 2 }">…</div>
 *   <div v-edge-fade="{ direction: 'y' }">…</div>    // 选项定向（包装组件按 prop 传方向，修饰符优先）
 *   <div v-edge-fade.y="'1.5rem'">…</div>            // 带宽支持任意 CSS 长度字符串
 *   <div v-edge-fade.y="{ offset: '2.4rem' }">…</div> // 起始缘内缩：羽化从 2.4rem 处才开始
 *   <div v-edge-fade>…</div>                         // 默认带宽 20px
 *   <div v-edge-fade="false">…</div>                 // 显式关闭
 *
 * 行为：
 * - 内容未溢出（对应轴 scroll{Width,Height} - client 尺寸 <= 容差）：不挂遮罩，零开销；
 * - 溢出且未滚动：起始缘贴内容不渐隐，仅末端羽化；
 * - 滚动到中间/末尾：对应被裁切的一侧羽化；贴边侧自动收起渐隐。
 *
 * 重测时机（全量覆盖动态内容场景）：
 * - 滚动（scroll 事件，passive）；
 * - 容器自身尺寸变化（ResizeObserver，如窗口缩放/容器换绑）；
 * - 直接子元素尺寸变化（ResizeObserver 逐个观察子节点，如手风琴折叠展开、列表项高度变化
 *   —— 这类变化不改变容器自身盒尺寸，也不产生 childList/characterData 变更，必须单独观察）；
 * - 子元素增删 / 文本增删（MutationObserver，如搜索过滤、contenteditable 输入）。
 */
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import {
  buildDualEdgeFadeMask,
  buildEdgeFadeMask,
  ensureFadeProperties,
  FADE_OFFSET_PROP,
  FADE_OFFSET_TARGET_PROP,
  fadeTransition,
} from '@/platform/utils/fadeMask';
import { mergeTransitionItem, removeTransitionItems } from '@/platform/utils/motion';

import type { Directive } from 'vue';

export interface EdgeFadeOptions {
  /** 羽化带宽（px 数值或 CSS 长度字符串，如 24 / '1.5rem'），缺省 20 */
  size?: number | string;
  /** 起始缘内缩量（px 数值或 CSS 长度字符串，如 '2.4rem'），缺省 0。
   *  0~offset 一段不羽化，羽化带从 offset 处开始——容器上沿有常驻吸附头（sticky 分组标题）时
   *  传它的高度，羽化才会落在标题下沿而不是被标题盖住。
   *  值可以是引用宿主变量的 var() 串（如 'var(--sticky-head-offset, 0px)'）：内缩量写在
   *  注册过的 --fade-offset 上，可参与 transition，宿主改写时羽化带平滑移动而非瞬跳 */
  offset?: number | string;
  /** 贴边判定容差（px）：内容与边缘间距小于该值视为贴边不渐隐，缺省 1 */
  flushEps?: number;
  /** 羽化轴向：等价于 .x / .y 修饰符，供包装组件按 prop 定向时使用（修饰符优先于本项）。
   *  省略时按溢出自动判定——两轴均有溢出即双轴羽化（见 resolveFadeMode） */
  direction?: EdgeFadeDirection;
}

/** 羽化方向：'.x' 横向 / '.y' 纵向；无修饰符时自动按溢出主轴判断 */
export type EdgeFadeDirection = 'x' | 'y';

export type EdgeFadeModifiers = EdgeFadeDirection | (string & Record<never, never>);

export type EdgeFadeBinding = EdgeFadeOptions | number | string | boolean | undefined;

const DEFAULT_FADE_SIZE = 20;
const DEFAULT_FLUSH_EPS = 1;
const FADE_TRANSITION_MS = 150;

interface ResolvedOptions {
  enabled: boolean;
  size: number | string;
  /** 起始缘内缩量：0~offset 不羽化。省略则不下发 --fade-offset（宿主可自行在元素上改写它） */
  offset?: number | string;
  flushEps: number;
  /** 用户显式指定的方向；undefined = 自动按溢出主轴判断 */
  direction?: EdgeFadeDirection;
}

/** 已挂遮罩模式：单轴 'x'/'y'，双轴 'dual'（auto 模式下两轴均有溢出） */
type FadeMode = 'x' | 'y' | 'dual';

interface EdgeFadeState {
  options: ResolvedOptions;
  /** 羽化端点量签名（各端点值拼接）：相同则跳过重复样式写入；null=未挂遮罩 */
  lastFade: string | null;
  /** 已挂 mask 模板的模式：模式切换（溢出轴增减）时重建模板 */
  lastMode?: FadeMode;
  /** 已挂模板的带宽签名：带宽变化需重建模板（内缩量不走模板，写 --fade-offset，无需重建） */
  lastTemplate: string | null;
  /** 已下发的内缩量（--fade-offset）原文 */
  lastOffset: string | null;
  /** 内缩量切换时序的延时句柄：非空表示当前处于「已淡出、等待淡入」的中间态 */
  offsetSwitchTimer: ReturnType<typeof setTimeout> | null;
  /** 已应用的内缩量目标值（与宿主写的 --fade-offset-target 比对，不同才启动切换时序） */
  appliedOffset: string;
  /** 平滑卸载的延时句柄：端点过渡回 0 后再摘 mask；重新挂载时取消 */
  clearTimer: ReturnType<typeof setTimeout> | null;
  observer: ResizeObserver;
  mutationObserver: MutationObserver;
  /** 已被 observer 观察的直接子元素集合：childList 变化时增量增删，避免重复 observe */
  observedChildren: Set<Element>;
  cleanups: (() => void)[];
  /** 合帧重测排帧器：mounted 内创建后回填（排帧器需引用 state，只能等 state 建好），供 updated 复用同一份帧 */
  scheduleSync: () => void;
}

/** 全部羽化端点属性（单轴 + 双轴）：重置/清理时统一遍历，避免按模式挑拣遗漏 */
const ALL_FADE_PROPS = [
  '--fade-start',
  '--fade-end',
  '--fade-x-start',
  '--fade-x-end',
  '--fade-y-start',
  '--fade-y-end',
] as const;

const STATES = new WeakMap<HTMLElement, EdgeFadeState>();

/** 合并绑定值与修饰符：数字/字符串即带宽，true/缺省用默认带宽，false 显式关闭 */
function resolveOptions(binding: EdgeFadeBinding, modifiers: Record<string, boolean>): ResolvedOptions {
  // 方向优先级：.y / .x 修饰符 > 选项对象 direction > undefined（按溢出自动判定两轴）
  const optionDirection = binding && typeof binding === 'object' ? binding.direction : undefined;
  const direction = modifiers['y'] ? 'y' : modifiers['x'] ? 'x' : optionDirection;
  if (binding === false) {
    return { enabled: false, size: DEFAULT_FADE_SIZE, flushEps: DEFAULT_FLUSH_EPS, direction };
  }
  if (typeof binding === 'number' || typeof binding === 'string') {
    return { enabled: true, size: binding, flushEps: DEFAULT_FLUSH_EPS, direction };
  }
  if (binding && typeof binding === 'object') {
    const { size = DEFAULT_FADE_SIZE, offset, flushEps = DEFAULT_FLUSH_EPS } = binding;
    return { enabled: true, size, offset, flushEps, direction };
  }
  return { enabled: true, size: DEFAULT_FADE_SIZE, flushEps: DEFAULT_FLUSH_EPS, direction };
}

/** 写入羽化端点量（0~1）到注册自定义属性，签名与上次相同则跳过重复写入 */
function writeFade(el: HTMLElement, state: EdgeFadeState, values: Record<string, number>): void {
  const sig = Object.values(values).join('|');
  if (state.lastFade === sig) return;
  state.lastFade = sig;
  for (const [prop, value] of Object.entries(values)) {
    el.style.setProperty(prop, String(value));
  }
}

/** 下发起始缘内缩量：写在注册过的 --fade-offset 上，值变化由 transition 平滑过渡。
 *  options.offset 允许是 var() 串（宿主变量），此时原文不变、由被引用的宿主变量驱动过渡；
 *  省略时完全不写该属性——宿主可以直接在元素上改写它（长度值），指令不与之争夺 */
function writeFadeOffset(el: HTMLElement, state: EdgeFadeState): string {
  const value = state.options.offset;
  if (value === undefined) return '';
  const text = typeof value === 'number' ? `${value}px` : value;
  if (state.lastOffset === text) return text;
  state.lastOffset = text;
  el.style.setProperty(FADE_OFFSET_PROP, text);
  return text;
}

/**
 * 平滑卸载遮罩：先把端点过渡回 0（羽化在过渡时长内收起），过渡结束后再移除 mask 模板。
 * 直接同步清掉 mask 会瞬间失去羽化（生硬消失）；期间重新溢出会走挂载路径并取消本延时。
 */
function clearFade(el: HTMLElement, state: EdgeFadeState): void {
  if (state.lastFade === null) return;
  const zeros: Record<string, number> = {};
  for (const prop of ALL_FADE_PROPS) zeros[prop] = 0;
  writeFade(el, state, zeros);
  state.lastFade = null;
  if (state.clearTimer) clearTimeout(state.clearTimer);
  state.clearTimer = setTimeout(() => {
    state.clearTimer = null;
    if (state.lastFade !== null) return; // 延时期间已重新挂载，不摘遮罩
    el.style.maskImage = '';
    el.style.setProperty('-webkit-mask-image', '');
    el.style.maskComposite = '';
    el.style.setProperty('-webkit-mask-composite', '');
    for (const prop of ALL_FADE_PROPS) el.style.removeProperty(prop);
    // 刻意不清 --fade-offset：它可能由宿主直接维护（元素上改写内缩量的用法），
    // 摘掉 mask 后残留值不产生任何视觉；下次挂载时正好延续宿主最后写的值。
    // 只摘 fade 条目而非整条清空：同元素上其它指令（v-auto-height 等）的过渡条目要存活
    el.style.transition = removeTransitionItems(el.style.transition, ...ALL_FADE_PROPS);
  }, FADE_TRANSITION_MS + 30);
}

/** 当前轴上的溢出量（px），未溢出返回 <= flushEps */
function overflowSize(el: HTMLElement, axis: EdgeFadeDirection): number {
  return axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
}

/** 单轴两端羽化量：贴边一侧 0（不渐隐），被裁切一侧 1 */
function endFades(el: HTMLElement, axis: EdgeFadeDirection, flushEps: number): [number, number] {
  const offset = axis === 'x' ? el.scrollLeft : el.scrollTop;
  const client = axis === 'x' ? el.clientWidth : el.clientHeight;
  const total = axis === 'x' ? el.scrollWidth : el.scrollHeight;
  const atStart = offset <= flushEps;
  const atEnd = Math.ceil(offset + client) >= Math.floor(total) - flushEps;
  return [atStart ? 0 : 1, atEnd ? 0 : 1];
}

/**
 * 解析本次应挂的遮罩模式：显式方向固定单轴（该轴未溢出则不挂）；
 * auto 按两轴溢出独立判定——两轴均有溢出时双轴羽化，单轴溢出按该轴，均未溢出返回 false。
 */
function resolveFadeMode(el: HTMLElement, options: ResolvedOptions): FadeMode | false {
  if (options.direction) {
    return overflowSize(el, options.direction) <= options.flushEps ? false : options.direction;
  }
  const overX = overflowSize(el, 'x') > options.flushEps;
  const overY = overflowSize(el, 'y') > options.flushEps;
  if (overX && overY) return 'dual';
  if (overX) return 'x';
  if (overY) return 'y';
  return false;
}

/**
 * 增量维护直接子元素的 ResizeObserver 观察：
 * 手风琴折叠展开、列表项高度变化只改子元素盒尺寸（容器盒尺寸与 childList 均不变），
 * 仅观察容器会漏测，必须逐子节点观察；childList 变化时在此增量增删。
 *
 * 只处理本次 mutation 记录里的增删节点，不做「全量快照 + diff」：addedNodes / removedNodes
 * 对「成为 / 离开宿主直接子元素」这个事实是完备的（初始挂载由 mounted 的全量循环覆盖），
 * 而全量快照是 O(子元素数) 的 Set 构造 + 逐项比对，长列表（和弦库展开后上百张卡）批量渲染、
 * 拖拽排序时每帧都要付一次。
 */
function updateObservedChildren(el: HTMLElement, state: EdgeFadeState, mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes) {
      if (node instanceof Element && state.observedChildren.has(node)) {
        state.observer.unobserve(node);
        state.observedChildren.delete(node);
      }
    }
    for (const node of mutation.addedNodes) {
      // 只收直接子元素：subtree 下深层后代的增删不归本层观察，其宿主盒尺寸变化会经由
      // 已观察的直接子元素间接体现
      if (node.parentNode === el && node instanceof Element && !state.observedChildren.has(node)) {
        state.observer.observe(node);
        state.observedChildren.add(node);
      }
    }
  }
}

/** 当前模板几何签名：模式 + 带宽，任一变化都需要重建 mask 模板 */
const templateKey = (mode: FadeMode, options: ResolvedOptions): string => `${mode}|${String(options.size)}`;
/**
 * 内缩量的**时序切换**：先把端点归零让羽化淡出 → 在羽化不可见时改内缩量 → 再淡入到目标端点。
 *
 * 位置变化本身无法既正确又无感：直接改会瞬跳（回顶时闪一下），加过渡则整条羽化带平移过去
 * （比闪更显眼）。利用「两端点均为 0 时整条渐变不透明、内缩量怎么动都看不见」这一点，
 * 把位置变化藏在羽化的淡出—淡入之间：看到的是羽化在原处收起、在新处展开，中间没有平移。
 *
 * @returns 本次端点已由时序接管（调用方不要再写端点）
 */
function switchFadeOffset(el: HTMLElement, state: EdgeFadeState, mode: FadeMode): boolean {
  if (state.offsetSwitchTimer !== null) return true; // 时序进行中，端点归它管
  const target = el.style.getPropertyValue(FADE_OFFSET_TARGET_PROP).trim();
  if (!target || target === state.appliedOffset) return false;

  state.appliedOffset = target;

  const values = computeFadeValues(el, mode, state.options.flushEps);
  // 当前根本没有羽化（两端点都是 0）：位置变化不可见，直接改、不必走时序
  if (Object.values(values).every(v => v === 0)) {
    applyFadeOffsetInstantly(el, target);
    return false;
  }

  const zeros: Record<string, number> = {};
  for (const prop of Object.keys(values)) zeros[prop] = 0;
  writeFade(el, state, zeros); // 端点归零：羽化收起
  // 位置必须等羽化**彻底**收起后再动：淡出是渐进的，前段羽化仍可见，
  // 若位置与淡出同时开始，就会看到羽化带一边变淡一边平移——这正是要避免的观感
  state.offsetSwitchTimer = setTimeout(() => {
    state.offsetSwitchTimer = null;
    // 此刻羽化不可见，位置瞬时到位（过渡与否都看不见，瞬时最省事也最保险）
    applyFadeOffsetInstantly(el, target);
    writeFade(el, state, computeFadeValues(el, mode, state.options.flushEps)); // 在新位置淡入
  }, FADE_TRANSITION_MS + 20);
  return true;
}

/** 写入 fade 条目过渡：条目级合并而非整条覆盖——宿主元素可能同时挂 v-auto-height 等
 *  其它写 transition 的指令（典型：BaseScrollArea 根元素），覆盖会把它们的过渡吞掉，
 *  且吞没与否随触发时序摇摆（变高瞬变、变矮正常这类不对称都源于此） */
const writeFadeTransition = (el: HTMLElement, ms: number): void => {
  el.style.transition = mergeTransitionItem(el.style.transition, fadeTransition(ms));
};

/** 内缩量瞬时到位：临时关掉过渡 → 写入 → 强制重算固化 → 恢复过渡。
 *  只在羽化不可见时调用（端点全 0），否则会是一次可见的瞬跳 */
function applyFadeOffsetInstantly(el: HTMLElement, value: string): void {
  writeFadeTransition(el, 0);
  el.style.setProperty(FADE_OFFSET_PROP, value);
  void el.offsetWidth; // 强制样式重算：把新位置固化成已计算值，恢复过渡后不再补一次动画
  writeFadeTransition(el, FADE_TRANSITION_MS);
}

function computeFadeValues(el: HTMLElement, mode: FadeMode, flushEps: number): Record<string, number> {
  if (mode === 'dual') {
    const [xStart, xEnd] = endFades(el, 'x', flushEps);
    const [yStart, yEnd] = endFades(el, 'y', flushEps);
    return { '--fade-x-start': xStart, '--fade-x-end': xEnd, '--fade-y-start': yStart, '--fade-y-end': yEnd };
  }
  const [start, end] = endFades(el, mode, flushEps);
  return { '--fade-start': start, '--fade-end': end };
}

/** 挂载/重建 mask 模板，并让端点从 0 平滑过渡到目标值：
 *  先写入全 0 端点（遮罩全不透明，等价无羽化）并强制样式重算，使「transition 已生效且端点为 0」
 *  成为已计算的旧值；随后写入目标端点才会触发 0→1 过渡——同一帧内直接写入不会产生动画，
 *  这是羽化出场瞬变的根因。 */
function mountFadeMask(el: HTMLElement, state: EdgeFadeState, mode: FadeMode): void {
  // 取消未完成的平滑卸载：重新溢出要立即接管遮罩
  if (state.clearTimer) {
    clearTimeout(state.clearTimer);
    state.clearTimer = null;
  }
  ensureFadeProperties();
  const mask =
    mode === 'dual'
      ? buildDualEdgeFadeMask(state.options.size, state.options.size)
      : buildEdgeFadeMask(mode, state.options.size);
  el.style.maskImage = mask;
  el.style.setProperty('-webkit-mask-image', mask);
  if (mode === 'dual') {
    // 双层 mask 必须取交集：默认 add 为并集，角落处只取较亮一层，两个方向的渐隐无法同时生效
    el.style.maskComposite = 'intersect';
    el.style.setProperty('-webkit-mask-composite', 'source-in');
  } else {
    // 从 dual 降回单轴时清理 composite，避免残留 intersect 改变单层 mask 语义
    el.style.maskComposite = '';
    el.style.setProperty('-webkit-mask-composite', '');
  }
  writeFadeTransition(el, FADE_TRANSITION_MS);
  for (const prop of ALL_FADE_PROPS) el.style.setProperty(prop, '0');
  // 内缩量在固化起点之前写入：首次挂载时羽化带不该从 0 位置「滑」到 offset，
  // 之后的宿主改写才交给切换时序（淡出→改位置→淡入）。
  // 宿主若已声明目标值，挂载即按它定位，并记为「已应用」，避免首帧多走一次淡出—淡入
  const hostTarget = el.style.getPropertyValue(FADE_OFFSET_TARGET_PROP).trim();
  const optionText = writeFadeOffset(el, state);
  if (!optionText && hostTarget) el.style.setProperty(FADE_OFFSET_PROP, hostTarget);
  state.appliedOffset = optionText || hostTarget;
  void el.offsetWidth; // 强制样式重算：固化为过渡起点
  state.lastFade = null;
  state.lastMode = mode;
  state.lastTemplate = templateKey(mode, state.options);
  writeFade(el, state, computeFadeValues(el, mode, state.options.flushEps));
}

/**
 * 按当前滚动位置与溢出轴同步羽化：
 * - 未溢出：清除遮罩（内容完整可见，无需羽化）；
 * - 单轴溢出：该轴贴边一侧渐隐量 0，被裁切一侧 1；
 * - 双轴溢出：两轴各自独立按滚动位置驱动端点，mask 以 intersect 合成。
 */
function syncEdgeFade(el: HTMLElement, state: EdgeFadeState): void {
  const { options } = state;
  if (!options.enabled) {
    clearFade(el, state);
    return;
  }

  const mode = resolveFadeMode(el, options);
  if (mode === false) {
    clearFade(el, state);
    return;
  }

  // 铺遮罩前记录所用几何：模式切换（溢出轴增减）或带宽变化时重建模板
  if (state.lastFade === null || state.lastMode !== mode || state.lastTemplate !== templateKey(mode, options)) {
    mountFadeMask(el, state, mode);
    return;
  }

  // 内缩量变化交给时序（淡出→改位置→淡入），期间端点由它接管
  if (switchFadeOffset(el, state, mode)) return;

  // 内缩量走 --fade-offset，不进模板，故无需因它重建 mask
  writeFadeOffset(el, state);
  writeFade(el, state, computeFadeValues(el, mode, options.flushEps));
}

export const vEdgeFade: Directive<HTMLElement, EdgeFadeBinding, EdgeFadeModifiers> = {
  mounted(el, binding) {
    const state: EdgeFadeState = {
      options: resolveOptions(binding.value, binding.modifiers),
      lastFade: null,
      lastMode: undefined,
      lastTemplate: null,
      lastOffset: null,
      offsetSwitchTimer: null,
      appliedOffset: '',
      clearTimer: null,
      observer: undefined as unknown as ResizeObserver,
      mutationObserver: undefined as unknown as MutationObserver,
      observedChildren: new Set(),
      cleanups: [],
      // 占位：排帧器回调要引用 state 自身，故只能在 state 建好后创建再回填，见下方赋值处
      scheduleSync: () => {},
    };
    STATES.set(el, state);

    /**
     * 重测一律走帧末合帧：scroll / ResizeObserver / MutationObserver 在同一帧内都能触发多次
     * （批量增删子节点、折叠动画期间子元素连续改尺寸、动量滚动的成串 scroll），
     * 而每次 syncEdgeFade 都要读一批布局属性，走挂载路径时还会在 mountFadeMask 里强制样式重算。
     * 合并成每帧一次后，读数也落在布局已干净时，且反复写同一份端点量被签名判等直接跳过。
     * `updated`（选项变更触发的重测）同样复用这一份帧：它一样发生在 patch 期间，就地重测的
     * 代价与 observer 路径没有区别。
     */
    const { schedule: scheduleSync, cancel: cancelSync } = useRafThrottle(() => syncEdgeFade(el, state));
    state.scheduleSync = scheduleSync;

    const onScroll = () => scheduleSync();
    el.addEventListener('scroll', onScroll, { passive: true });

    // 容器自身与直接子元素共用同一个 observer：任一盒尺寸变化都触发重测
    const observer = new ResizeObserver(() => scheduleSync());
    observer.observe(el);
    for (const child of Array.from(el.children)) {
      observer.observe(child);
      state.observedChildren.add(child);
    }
    state.observer = observer;

    // 子元素增删（搜索过滤/路由切换）需增量维护子观察并重测；
    // 文本增删（contenteditable）只改变 scrollWidth、不改变任何盒尺寸，ResizeObserver 捕获不到，
    // 需 MutationObserver 兜底重测
    const mutationObserver = new MutationObserver(mutations => {
      updateObservedChildren(el, state, mutations);
      scheduleSync();
    });
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true });
    state.mutationObserver = mutationObserver;

    state.cleanups.push(() => {
      el.removeEventListener('scroll', onScroll);
      cancelSync();
      observer.disconnect();
      mutationObserver.disconnect();
    });

    syncEdgeFade(el, state);
  },

  updated(el, binding) {
    const state = STATES.get(el);
    if (!state) return;
    state.options = resolveOptions(binding.value, binding.modifiers);
    // 与 scroll / observer 路径共用同一份帧，而非就地同步重测：updated 发生在组件 patch 期间，
    // 此刻同一轮 patch 的其它节点尚未落定，就地读一批布局会强制一次**中间态**样式重算，
    // 且很可能被紧随其后的 DOM 变更作废、下一轮 patch 再算一次——正是本文件开头
    // 「重测一律走帧末合帧」要避免的情形。选项变更属低频事件，延后一帧在视觉上不可辨；
    // rAF 回调仍早于下一帧绘制，不会出现无羽化的闪帧。
    state.scheduleSync();
  },

  unmounted(el) {
    const state = STATES.get(el);
    if (!state) return;
    if (state.clearTimer) clearTimeout(state.clearTimer);
    if (state.offsetSwitchTimer) clearTimeout(state.offsetSwitchTimer);
    state.cleanups.forEach(fn => fn());
    STATES.delete(el);
  },
};
