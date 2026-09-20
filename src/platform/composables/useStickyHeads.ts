import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { findScrollParent, resolveLengthToPx } from '@/platform/utils/dom';
import { FADE_OFFSET_TARGET_PROP } from '@/platform/utils/fadeMask';

import { useRafThrottle } from './useRafThrottle';

import type { Ref } from 'vue';

/**
 * 一组吸附头的**宿主环境适配**：发现滚动容器、监听滚动与尺寸变化、判定「哪些头此刻正被吸附」、
 * 按需让开容器顶部羽化带（options.fadeOffset）。
 *
 * 这类逻辑与具体容器强相关（容器是谁、padding 多少、什么时候才有 overflow），放在通用折叠组件里
 * 等于让展示组件去窥探宿主布局——既不可复用，也让每个头各自持有一套滚动监听与 ResizeObserver
 * （N 个头 = N 份监听）。放在业务侧统一做：一次发现容器、一次监听，批量判定后回传结果。
 *
 * 组件侧只保留两个纯输入：`stuckIds`（我吸附了吗）与 `insetPx`（容器让出多少 padding）。
 * 定位几何（sticky / top / z / 底色 / 露出带）与羽化内缩量都由业务经 class / 本 composable 下发。
 */
export interface UseStickyHeadsOptions {
  /** 列表根元素（全部吸附头的共同祖先）：滚动容器沿其祖先链查找，尺寸变化也观察它 */
  listRef: Ref<HTMLElement | null>;
  /** 吸附头选择器：命中的元素即 position: sticky 的头本体。
   *  默认用 BaseCollapse 暴露的稳定钩子 `[data-collapse-head]`，不要写组件内部类名 */
  headSelector?: string;
  /** 吸附头上承载业务 id 的属性名（如 'data-group-id'）：回传哪些头处于吸附态时用它的值作键 */
  idAttribute: string;
  /** 吸附头所在的段容器选择器（即 sticky 的 containing block）；默认 `[data-collapse]` */
  sectionSelector?: string;
  /** 吸附间隙（CSS 长度）：头吸附后与滚动容器可视上沿的距离，须与 BaseCollapse 的 sticky-offset 一致。
   *  它决定吸附线位置（容器可视上沿 + 间隙），与容器 padding 无关 */
  offset: string;
  /** 让开容器顶部羽化带：有头吸附时把**该头的实测高度**写到容器的 `--fade-offset-target`（无吸附则
   *  归零），羽化带因此从吸附头下沿才开始，不会把吸附中的头冲淡。需容器顶部挂了 v-edge-fade 才有效果。
   *  取实测高度而非常量：各宿主的折叠头高度不同（侧栏固定行高、抽屉里是内容行高），写死必然漂移 */
  fadeOffset?: boolean;
}

/** 两个集合内容相同则不回写，避免每次滚动都触发一整列表的重渲染 */
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};

export function useStickyHeads(options: UseStickyHeadsOptions) {
  /** 当前处于吸附态的头的业务 id 集合 */
  const stuckIds = ref<ReadonlySet<string>>(new Set<string>());
  /** 滚动容器的 padding-top（px）：业务据此把吸附头的 top 上移，抵消那条会漏内容的 padding 带 */
  const insetPx = ref(0);
  /** 发现到的滚动容器：业务可注入给折叠组件的收起补偿，免得它们各自再找一遍 */
  const containerRef = ref<HTMLElement | null>(null);

  let container: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let retryRafId = 0;
  let offsetPx = 0;
  /** 已下发的羽化内缩量原文：相同则跳过重复写入（滚动时每帧都会走到 update） */
  let appliedFadeOffset = '';

  /**
   * 让开容器顶部羽化带（options.fadeOffset）：写的是**目标值** `--fade-offset-target`，
   * 实际位置切换由 v-edge-fade 按「羽化淡出 → 改位置 → 淡入」的时序接管——位置变化本身
   * 无法既正确又无感（直接改是瞬跳、加过渡是整条羽化带平移），只能藏在淡出与淡入之间。
   */
  const applyFadeOffset = (stuckHeadHeight: number) => {
    if (!options.fadeOffset || !container) return;
    const next = stuckHeadHeight > 0 ? `${stuckHeadHeight}px` : '0px';
    if (next === appliedFadeOffset) return;
    appliedFadeOffset = next;
    container.style.setProperty(FADE_OFFSET_TARGET_PROP, next);
  };

  const update = () => {
    const list = options.listRef.value;
    if (!list || !container) {
      if (stuckIds.value.size) stuckIds.value = new Set();
      applyFadeOffset(0);
      return;
    }
    // 吸附线 = 容器可视上沿 + 间隙（top 的 padding 补偿已在组件侧抵消，这里不再重复计 padding）
    const line = container.getBoundingClientRect().top + offsetPx;
    const next = new Set<string>();
    let stuckHeadHeight = 0;
    for (const head of list.querySelectorAll<HTMLElement>(options.headSelector ?? '[data-collapse-head]')) {
      const id = head.getAttribute(options.idAttribute);
      if (!id) continue;
      const section = head.closest(options.sectionSelector ?? '[data-collapse]') ?? head.parentElement;
      if (!section) continue;
      const headRect = head.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      // 「被顶起」而非「恰在吸附线上」：段顶已越过吸附线，且段底仍把头留在吸附线上。
      // 只判头是否落在线上会把列表第一项误判为常驻吸附（它天然就在线上）
      if (sectionRect.top < line - 0.5 && sectionRect.bottom > line + headRect.height - 0.5) {
        next.add(id);
        stuckHeadHeight = headRect.height;
      }
    }
    if (!sameSet(next, stuckIds.value)) stuckIds.value = next;
    applyFadeOffset(stuckHeadHeight);
  };

  const { schedule, cancel } = useRafThrottle<null>(() => update());
  const scheduleUpdate = () => schedule(null);

  const detach = () => {
    container?.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    resizeObserver?.disconnect();
    resizeObserver = null;
    container = null;
    containerRef.value = null;
    // 重置内缩量缓存：重新绑定的可能是另一个容器，需在它上面重新下发一次
    appliedFadeOffset = '';
    if (retryRafId) cancelAnimationFrame(retryRafId);
    retryRafId = 0;
    cancel();
  };

  /** 绑定滚动/尺寸监听并完成首次判定；容器尚未就绪（overflow 由指令稍后注入）时返回 false */
  const bind = (): boolean => {
    const list = options.listRef.value;
    container = list ? findScrollParent(list) : null;
    if (!container) return false;
    containerRef.value = container;
    insetPx.value = Number.parseFloat(window.getComputedStyle(container).paddingTop) || 0;
    offsetPx = resolveLengthToPx(options.offset);
    container.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    // 展开/收起改高度、分组增删、内容异步填充都不产生 scroll 事件，靠尺寸观察补判定
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(list as HTMLElement);
      resizeObserver.observe(container);
    }
    scheduleUpdate();
    return true;
  };

  /** 容器可能晚于本组件挂载才具备 overflow（v-scrollbar 内联注入），按帧重试到就绪为止 */
  const bindWithRetry = () => {
    let retries = 0;
    const tick = () => {
      if (bind() || ++retries > 60) return;
      retryRafId = requestAnimationFrame(tick);
    };
    tick();
  };

  onMounted(bindWithRetry);

  // 列表根可能晚于 composable 初始化才出现（空态 → 列表的 v-if 切换）：
  // el 为空（列表被卸载）时解绑旧根；el 存在时才重新绑定——原实现早退方向写反
  //（el 为空时 return、非空且已绑定也 return），新根永远不会进 RO，吸附头长期陈旧
  watch(options.listRef, el => {
    detach();
    if (!el) return;
    bindWithRetry();
  });

  onBeforeUnmount(detach);

  return { stuckIds, insetPx, container: containerRef, refresh: scheduleUpdate };
}
