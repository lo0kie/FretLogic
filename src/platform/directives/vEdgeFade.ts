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
  fadeTransition,
} from '@/platform/utils/fadeMask';

import type { Directive } from 'vue';

export interface EdgeFadeOptions {
  /** 羽化带宽（px 数值或 CSS 长度字符串，如 24 / '1.5rem'），缺省 20 */
  size?: number | string;
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
  /** 已挂遮罩模式：模式切换（溢出轴增减）时重建模板 */
  lastMode?: FadeMode;
  /** 平滑卸载的延时句柄：端点过渡回 0 后再摘 mask；重新挂载时取消 */
  clearTimer: ReturnType<typeof setTimeout> | null;
  observer: ResizeObserver;
  mutationObserver: MutationObserver;
  /** 已被 observer 观察的直接子元素集合：childList 变化时增量增删，避免重复 observe */
  observedChildren: Set<Element>;
  cleanups: (() => void)[];
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
    const { size = DEFAULT_FADE_SIZE, flushEps = DEFAULT_FLUSH_EPS } = binding;
    return { enabled: true, size, flushEps, direction };
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
    el.style.transition = '';
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

/** 当前模式下的端点透明度值：双轴四端点 / 单轴两端点 */
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
  el.style.transition = fadeTransition(FADE_TRANSITION_MS);
  for (const prop of ALL_FADE_PROPS) el.style.setProperty(prop, '0');
  void el.offsetWidth; // 强制样式重算：固化为过渡起点
  state.lastFade = null;
  state.lastMode = mode;
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

  // 铺遮罩前记录所用模式，模式切换（溢出轴增减）时重建模板
  if (state.lastFade === null || state.lastMode !== mode) {
    mountFadeMask(el, state, mode);
    return;
  }

  writeFade(el, state, computeFadeValues(el, mode, options.flushEps));
}

export const vEdgeFade: Directive<HTMLElement, EdgeFadeBinding, EdgeFadeModifiers> = {
  mounted(el, binding) {
    const state: EdgeFadeState = {
      options: resolveOptions(binding.value, binding.modifiers),
      lastFade: null,
      lastMode: undefined,
      clearTimer: null,
      observer: undefined as unknown as ResizeObserver,
      mutationObserver: undefined as unknown as MutationObserver,
      observedChildren: new Set(),
      cleanups: [],
    };
    STATES.set(el, state);

    /**
     * 重测一律走帧末合帧：scroll / ResizeObserver / MutationObserver 在同一帧内都能触发多次
     * （批量增删子节点、折叠动画期间子元素连续改尺寸、动量滚动的成串 scroll），
     * 而每次 syncEdgeFade 都要读一批布局属性，走挂载路径时还会在 mountFadeMask 里强制样式重算。
     * 合并成每帧一次后，读数也落在布局已干净时，且反复写同一份端点量被签名判等直接跳过。
     */
    const { schedule: scheduleSync, cancel: cancelSync } = useRafThrottle(() => syncEdgeFade(el, state));

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
    syncEdgeFade(el, state);
  },

  unmounted(el) {
    const state = STATES.get(el);
    if (!state) return;
    if (state.clearTimer) clearTimeout(state.clearTimer);
    state.cleanups.forEach(fn => fn());
    STATES.delete(el);
  },
};
