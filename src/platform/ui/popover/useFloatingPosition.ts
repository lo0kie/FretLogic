/**
 * floating-ui 定位的 Vue 胶水层：把 `computePosition` + `autoUpdate` 接成组件可消费的响应式值。
 *
 * 为何不引入 @floating-ui/vue 的 useFloating：那层不到 6KB（未压缩）的封装对本库可用的
 * 部分只有三件事——依赖变化时重算、DPR 取整、挂载期启停 autoUpdate；其余（open 语义与
 * isPositioned、组件实例 `.$el` / 注释节点的解包、非 transform 的 left/top 分支）全是空转。
 * 替换后 BasePopover 与 vTooltip 同走 `computePosition`，定位编排只剩一种范式。
 *
 * 与封装刻意的两点差异：
 * 1. 竞态守卫 —— computePosition 是异步的，若计算期间锚点/浮层已切换，本次结果对应的是旧元素，
 *    写回会让浮层闪到旧位置。封装无此守卫，慢帧（首开 + 布局未定）下会抖一下；
 * 2. 浮层只接受普通元素 —— 本库所有调用方传的都是元素，不需要 `.contextElement` 解包。
 */
import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue';

import { autoUpdate, computePosition } from '@floating-ui/dom';

import type { Middleware, MiddlewareData, Placement, ReferenceElement, Strategy } from '@floating-ui/dom';
import type { CSSProperties, MaybeRef, MaybeRefOrGetter } from 'vue';

export interface UseFloatingPositionOptions {
  /** 锚点：真实元素或虚拟元素（如鼠标坐标构造的定位点）。
   *  虚拟锚点 autoUpdate 无法观察（内部会降级为只观察浮层），跟随需调用方自行触发 update */
  reference: MaybeRefOrGetter<ReferenceElement | null | undefined>;
  /** 浮层元素 */
  floating: MaybeRef<HTMLElement | null | undefined>;
  /** 期望方位；flip 后的实际方位请读返回值的 placement */
  placement: MaybeRefOrGetter<Placement>;
  /** 中间件链（如 buildFloatingMiddlewares 的产物） */
  middleware: MaybeRefOrGetter<Middleware[]>;
  /** 定位策略，默认 fixed */
  strategy?: Strategy;
}

/**
 * 计算并跟随浮层位置。返回：
 * - floatingStyles：写进浮层宿主 style 的定位样式（transform 定位 + DPR 对齐）
 * - placement：flip 之后的实际方位（用于入场缩放原点、箭头朝向）
 * - middlewareData：中间件产出（箭头坐标等）
 * - update：手动触发一次重算（打开时先定位后显隐，避免从 (0,0) 闪入）
 */
export const useFloatingPosition = (options: UseFloatingPositionOptions) => {
  const { reference, floating, placement, middleware, strategy = 'fixed' } = options;

  const x = ref(0);
  const y = ref(0);
  /** flip 后回写的实际方位；初值取入参，保证首帧渲染前 transformOrigin 可用 */
  const resolvedPlacement = ref<Placement>(toValue(placement));
  const middlewareData = shallowRef<MiddlewareData>({});

  /** autoUpdate 的停用函数；锚点或浮层缺失（未挂载 / 已卸载）时为 undefined */
  let stopAutoUpdate: (() => void) | undefined;

  const runUpdate = async (): Promise<void> => {
    const referenceEl = toValue(reference);
    const floatingEl = toValue(floating);
    if (!referenceEl || !floatingEl) return;

    let result: Awaited<ReturnType<typeof computePosition>>;
    try {
      result = await computePosition(referenceEl, floatingEl, {
        placement: toValue(placement),
        strategy,
        middleware: toValue(middleware),
      });
    } catch {
      // 计算期间锚点/浮层被移除等极端场景会 reject。这里吞掉而非上抛：本函数会被
      // autoUpdate 回调、打开流程等多处 fire-and-forget 调用，上抛会留下未处理的 rejection
      return;
    }

    // 竞态守卫：异步计算期间锚点或浮层已换，本次结果对应旧元素，写回会把浮层闪回旧位置。
    // 丢弃是安全的——元素变化会触发 attach()，autoUpdate 随即发起一次新计算
    if (toValue(reference) !== referenceEl || toValue(floating) !== floatingEl) return;

    x.value = result.x;
    y.value = result.y;
    resolvedPlacement.value = result.placement;
    middlewareData.value = result.middlewareData;
  };

  /**
   * 手动触发一次重算。对外保持 void（与 useFloating 的 update 同形）：调用点既有
   * ResizeObserver 回调也有裸语句调用，返回 Promise 会引出未处理 rejection 与
   * 误用 async 回调的告警，而内部本就吞掉了 rejection、无需调用方等待
   */
  const update = (): void => void runUpdate();

  /** 两端元素齐备才交接给 autoUpdate（滚动/resize 跟随）；任一缺失则停用 */
  const attach = () => {
    stopAutoUpdate?.();
    stopAutoUpdate = undefined;
    const referenceEl = toValue(reference);
    const floatingEl = toValue(floating);
    if (!referenceEl || !floatingEl) return;
    stopAutoUpdate = autoUpdate(referenceEl, floatingEl, update);
  };

  // flush: sync 与 @floating-ui/vue 对齐——定位须在同一 tick 内发起，否则首帧会停在 (0,0)
  watch([() => toValue(reference), () => toValue(floating)], attach, { flush: 'sync' });
  watch([() => toValue(placement), () => toValue(middleware)], update, { flush: 'sync' });

  onScopeDispose(() => stopAutoUpdate?.());

  /** 读取浮层所在文档的设备像素比（无 window 时按 1 处理） */
  const resolveDpr = (el: HTMLElement): number => el.ownerDocument.defaultView?.devicePixelRatio || 1;

  const floatingStyles = computed<CSSProperties>(() => {
    const base: CSSProperties = { position: strategy, left: '0', top: '0' };
    const floatingEl = toValue(floating);
    if (!floatingEl) return base;

    // 坐标按设备像素比取整：亚像素位移在 HiDPI 下会被浏览器插值，导致边框/文字发虚
    const dpr = resolveDpr(floatingEl);
    const tx = Math.round(x.value * dpr) / dpr;
    const ty = Math.round(y.value * dpr) / dpr;

    return {
      ...base,
      transform: `translate(${tx}px, ${ty}px)`,
      // HiDPI 下同样因为亚像素重绘更贵，提前提升为合成层
      ...(dpr >= 1.5 ? { willChange: 'transform' } : {}),
    };
  });

  return { floatingStyles, middlewareData, placement: resolvedPlacement, update };
};
