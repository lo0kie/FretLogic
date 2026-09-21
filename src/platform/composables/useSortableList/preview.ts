/**
 * useSortableList 的自建拖拽影像控制器。
 *
 * 从 useSortableList.ts 抽出（原 152~199、341~355、358~394、397~554、600~610 行）。
 *
 * 影像相关状态（影像节点 / 被拖元素 / 原位还原值 / 抓取点偏移 / 落定动画句柄 / 逻辑位置）
 * 自成一组闭包：只被「起拖激活 → 指针跟随 → 松手落定 → 清理」这条链读写，与顺序解析、
 * Sortable 实例管理互不重叠，故独立成工厂函数；组合式持有它的一个实例，不再展开这些字段。
 */

import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import {
  ACTIVE_CLASS,
  CHOSEN_CLASS,
  DRAG_ACTIVATE_THRESHOLD,
  GLOBAL_DRAGGING_CLASS,
  PLACEHOLDER_CLASS,
  PREVIEW_CLASS,
  PREVIEW_SCALE,
  PREVIEW_SETTLE_EASING,
  WAVE_CONTAINER_SELECTOR,
} from './constants';

export interface PreviewController {
  /** 当前被拖元素；非拖拽期为 null */
  readonly draggingItem: HTMLElement | null;
  /** 标记本次拖拽的元素（onStart 时调用） */
  begin(item: HTMLElement): void;
  /** 是否处于松手落定期（期间指针跟随已交棒给动画） */
  isSettling(): boolean;
  handlePointerDown(event: PointerEvent): void;
  handlePointerMove(event: PointerEvent): void;
  /** 摘掉影像与全局拖拽态：落定、实例销毁、拖拽中途卸载都走这里 */
  clear(): void;
  /** 松手复位：影像平滑落回被拖元素的最终位置，而不是原地消失 */
  settle(item: HTMLElement): void;
}

/**
 * 构建影像节点：克隆被拖元素并做「去掉不该进副本的东西」的清理。
 * 返回尚未挂载的影像容器，由调用方决定何时 append（挂载是可见副作用，留在控制器里）。
 */
const buildPreviewNode = (item: HTMLElement, width: number, height: number): HTMLElement => {
  const clone = item.cloneNode(true) as HTMLElement;
  // 副本必须先摘掉 Sortable 在 start 时挂上的拖拽态类，将来给它们加样式也会连带进副本
  clone.classList.remove(PLACEHOLDER_CLASS, CHOSEN_CLASS, ACTIVE_CLASS);
  // 副本只作视觉：抹掉 id 免得文档里出现重复 id，并移出无障碍树
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  // 副本里的波纹一并摘掉：它是起拖那一按激起的，克隆进来后被 .drag-preview 的
  // transition: none 冻在扩散完成态 —— 影像上会凭空多一个静态圆
  clone.querySelectorAll(WAVE_CONTAINER_SELECTOR).forEach(node => node.remove());
  // canvas 的位图不在 DOM 里：cloneNode 只复制出一个等尺寸的空白画布
  // （「导出图片」面板里那张离屏指板图就会在影像上凭空消失）。
  // 把源画布当前内容逐个 drawImage 过去 —— 副本与源结构同源，取到的顺序一一对应。
  // 先写 width/height 再画：写这两个属性本身会清空画布。
  const sourceCanvases = item.querySelectorAll('canvas');
  const clonedCanvases = clone.querySelectorAll('canvas');
  sourceCanvases.forEach((source, index) => {
    const target = clonedCanvases[index];
    if (!(source instanceof HTMLCanvasElement) || !(target instanceof HTMLCanvasElement)) return;
    target.width = source.width;
    target.height = source.height;
    target.getContext('2d')?.drawImage(source, 0, 0);
  });
  clone.setAttribute('aria-hidden', 'true');
  // 宽高显式撑满外框：原元素尺寸由父级 flex / grid 决定，副本脱离文档流后拿不到
  clone.style.width = '100%';
  clone.style.height = '100%';
  clone.style.opacity = '';

  const previewEl = document.createElement('div');
  previewEl.className = PREVIEW_CLASS;
  previewEl.style.width = `${width}px`;
  previewEl.style.height = `${height}px`;
  previewEl.appendChild(clone);
  return previewEl;
};

export const createPreviewController = (animation: number): PreviewController => {
  /** 拖拽影像节点；非拖拽期为 null */
  let previewEl: HTMLElement | null = null;
  /** 被拖元素：start 时记录，落定时清空；未越阈值前不动任何视觉 */
  let draggingItem: HTMLElement | null = null;
  /**
   * 被拖元素原有的内联 opacity 与 pointer-events。
   * 隐藏原位只能用内联样式：Vue 重渲染列表时会整段重设 className（patchClass），
   * 手动加的类会被抹掉，元素就会在影像落地前提前显形，看着像重影。
   *
   * 必须同时关掉 pointer-events：opacity: 0 的元素照样参与命中测试，松手位置往往
   * 就压在这张卡片（或它的把手）上——整个拖拽期间它其实一直满足 :hover，只是透明看不出。
   * 只还 opacity 的话，还原那一刻「隐藏的 hover 突然显形」，配合 hover transition 就是可见的一闪。
   */
  let draggingItemOpacity = '';
  let draggingItemPointerEvents = '';
  /** 抓取点：按下位置相对被拖元素左上角的偏移，让影像贴着抓取处而不是跳到元素中心 */
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  /** 最近一次按下位置：start 事件里的坐标在 fallback 通道下不可靠，改由 pointerdown 记录 */
  let pressX = 0;
  let pressY = 0;
  /** 复位动画的收尾定时器：再次起拖 / 实例销毁时必须取消，否则它会把新影像一起摘掉 */
  let settleTimer = 0;
  /** 复位动画句柄：落定期影像由它驱动，再次起拖 / 销毁时取消 */
  let settleAnimation: Animation | null = null;
  /** 是否处于松手落定期：期间指针跟随已交棒给动画，任何 transform 写入都会把影像拽回指针处 */
  let isSettling = false;
  /**
   * 影像的逻辑位置（未缩放盒子的左上角，即 transform 的 translate 分量）。
   * 不能拿 getBoundingClientRect 当起止值：它含 1.02 缩放，关键帧会跟着偏；
   * 而在每帧写 transform 时顺手记一下是零成本的。
   */
  let previewX = 0;
  let previewY = 0;

  const cancelSettle = () => {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = 0;
    }
    settleAnimation?.cancel();
    settleAnimation = null;
  };

  /**
   * 把影像摆到 (previewX, previewY) 并套上抬起放大。
   * 放大倍数写在 transform 里而不是用独立 scale 属性：两者的合成顺序不同（见 .drag-preview
   * 注释），只有写成 `translate3d(...) scale(...)` 才是「先关于中心缩放、再平移」——
   * 这正是抓取点补偿公式（grabOffset 那段）的前提，抓取点才会精确落在指针下。
   */
  const applyPreviewTransform = () => {
    if (!previewEl) return;
    previewEl.style.transform = `translate3d(${previewX}px, ${previewY}px, 0) scale(${PREVIEW_SCALE})`;
  };

  // 影像位置按帧合帧：同一帧内的多次指针移动只写一次 transform
  const { schedule: schedulePreviewPos, cancel: cancelPreviewPos } = useRafThrottle<{
    x: number;
    y: number;
  }>(pos => {
    // 落定态下这帧属于「松手前最后一帧」的残留：放它写下去就会把影像拽回指针处
    if (!previewEl || isSettling) return;
    previewX = pos.x - grabOffsetX;
    previewY = pos.y - grabOffsetY;
    applyPreviewTransform();
  });

  /**
   * 揭出原位元素：还原 opacity 与 pointer-events。
   * 两者总是成对切换——只还原 opacity 会让「透明期间一直 hover 着」的元素突然显形，
   * 若其上有 hover transition，就表现为复位结束后闪一次 hover。
   */
  const revealDraggedItem = () => {
    if (!draggingItem) return;
    draggingItem.style.opacity = draggingItemOpacity;
    draggingItem.style.pointerEvents = draggingItemPointerEvents;
    draggingItemOpacity = '';
    draggingItemPointerEvents = '';
  };

  /**
   * 越过阈值：隐藏原位元素（列表靠它让位，视觉交给影像）+ 挂上影像与全局拖拽态。
   * 隐藏原位的类名由我们自己控制时机，Sortable 拿到的只是无样式的占位类（见 PLACEHOLDER_CLASS）。
   */
  const activatePreview = (item: HTMLElement, pointerX: number, pointerY: number) => {
    // 复位动画途中再次起拖：先收掉上一轮的收尾定时器、待写的位置帧与旧影像
    cancelSettle();
    cancelPreviewPos();
    isSettling = false;
    previewEl?.remove();
    const rect = item.getBoundingClientRect();
    previewEl = buildPreviewNode(item, rect.width, rect.height);
    document.body.appendChild(previewEl);

    // 抓取点取「激活时」的指针位置而非按下位置：越阈值前的移动量不该体现为影像跳变
    // （此前用 pressX/pressY，阈值内的移动会在影像出现的第一帧变成一次可见的位移）
    grabOffsetX = pointerX - rect.left;
    grabOffsetY = pointerY - rect.top;
    // 影像带 PREVIEW_SCALE 缩放（围绕盒心放大）：直接用未缩放偏移摆放，抓取点下的内容会
    // 偏出指针（最多约边长的 1%）。换算成缩放后仍落在指针下的等效偏移：
    // 缩放中心为盒心时，内容点 g 渲染于 w/2 + (g - w/2) * s，反解即得下式。
    // 该式成立的前提是「先关于中心缩放、再平移」，故 scale 必须由 applyPreviewTransform
    // 写进 transform；若用独立 scale 属性，合成顺序反过来、平移被一并放大，影像会整体下坠
    grabOffsetX = grabOffsetX * PREVIEW_SCALE + (rect.width / 2) * (1 - PREVIEW_SCALE);
    grabOffsetY = grabOffsetY * PREVIEW_SCALE + (rect.height / 2) * (1 - PREVIEW_SCALE);
    // 首帧按指针落位，避免从 (0,0) 闪一下；不能直接摆 rect.left/top——
    // 那是未缩放坐标，与上面的缩放补偿偏移不一致，影像出现的瞬间会跳一次
    previewX = pointerX - grabOffsetX;
    previewY = pointerY - grabOffsetY;
    applyPreviewTransform();
    // 影像挂好之后再隐藏原位元素：反过来的话隐藏态会被克隆进副本。
    // 一并关掉命中测试：透明元素仍在 :hover 链上，显形时会「突然亮一下」
    draggingItemOpacity = item.style.opacity;
    draggingItemPointerEvents = item.style.pointerEvents;
    item.style.opacity = '0';
    item.style.pointerEvents = 'none';
    // 抹掉起拖那一按在把手上激起的波纹（把手同时是按钮，v-wave 挂在上面）。
    // 时序决定了它必然漏出来：v-wave 在 pointerdown 激活波纹、要等 pointerup 才 dissolve，
    // 而原位元素要到松手后 animation 毫秒（复位动画落点）才显形 —— 那时波纹仍盖在把手上淡出，
    // 复位结束后看就是「闪一下」。此时卡片已透明，摘掉它没有可见痕迹；
    // v-wave 后续 release 操作的仍是其闭包持有的节点（remove 幂等），不会出错。
    item.querySelectorAll(WAVE_CONTAINER_SELECTOR).forEach(node => node.remove());
    document.body.classList.add(GLOBAL_DRAGGING_CLASS);
  };

  /**
   * 松手复位：影像平滑落回被拖元素的最终位置，而不是原地消失。
   *
   * 用 Web Animations 而不是 CSS transition，两个原因：
   * 1. 松手与最后一次 pointermove 常落在同一帧，此时合帧队列里还压着一次未执行的写入，
   *    它会紧跟在本函数之后把 transform 写回指针位置 —— 过渡的起止值因此相同，动画压根不发生；
   * 2. WAAPI 在层叠里高于内联样式，即便再有指针写入也拽不回影像，顺带也绕开了
   *    prefers-reduced-motion 那条把 transition-duration 压成 0.01ms 的 !important。
   *
   * 原位元素在影像飞行期间保持「透明 + 不参与命中测试」：一个 opacity: 0 的元素若同时
   * 能命中，就会在它显形前把指针下的 hover 目标悄悄换成自己，随后又因 DOM 搬动/重排
   * 让 hover 落回别处 —— 表现为复位结束后「亮一下又灭」。两者由 clear 同时还原，
   * 元素从「不可见且不可命中」一步切到「可见且可命中」，中间不存在半激活态。
   */
  const settlePreview = (item: HTMLElement) => {
    const el = previewEl;
    if (!el) {
      clearPreview();
      return;
    }
    // 指针跟随到此为止：先丢弃压着的那帧，再置落定态（handlePointerMove 据此不再消费指针）
    cancelPreviewPos();
    isSettling = true;
    cancelSettle();
    // 终点取 DOM 实际位置：此时 Sortable 已搬完 DOM，量到的就是最终位置
    const target = item.getBoundingClientRect();
    // 阴影随落位渐隐：与起拖时的 drag-preview-in 渐入对称，影像在落点消失时阴影不再瞬间蒸发。
    // 起值取计算样式（浮起阴影），终值为全透明零阴影——显式写出以保证可插值。
    // 不透明度同理：从拖拽值（0.92）升回 1，落点那一帧影像与原位元素完全同亮度，
    // clearPreview 摘掉影像、揭出原位元素时就没有那 8% 的跳变。
    const computed = getComputedStyle(el);
    const floatingShadow = computed.boxShadow;
    const startOpacity = computed.opacity;
    settleAnimation = el.animate(
      [
        {
          transform: `translate3d(${previewX}px, ${previewY}px, 0) scale(${PREVIEW_SCALE})`,
          boxShadow: floatingShadow,
          opacity: startOpacity,
        },
        {
          transform: `translate3d(${target.left}px, ${target.top}px, 0) scale(1)`,
          boxShadow: '0 0 0 0 rgb(0 0 0 / 0%)',
          opacity: '1',
        },
      ],
      { duration: animation, easing: PREVIEW_SETTLE_EASING, fill: 'forwards' }
    );
    // 时长复用 Sortable 的让位动画，与之同拍；跑完才摘影像
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      clearPreview();
    }, animation);
  };

  /** 摘掉影像与全局拖拽态：落定、实例销毁、拖拽中途卸载都走这里 */
  const clearPreview = () => {
    cancelSettle();
    cancelPreviewPos();
    isSettling = false;
    previewEl?.remove();
    previewEl = null;
    // 显形：opacity 与 pointer-events 一起复原（透明元素若留在 :hover 链上，
    // 显形时会被判定为「刚进入 hover」而播一次过渡）
    revealDraggedItem();
    draggingItem = null;
    document.body.classList.remove(GLOBAL_DRAGGING_CLASS);
  };

  const handlePointerDown = (event: PointerEvent) => {
    pressX = event.clientX;
    pressY = event.clientY;
  };

  const handlePointerMove = (event: PointerEvent) => {
    const item = draggingItem;
    // 落定动画期间指针跟随已交棒给动画：此时再写 transform 会把影像拽回指针处
    if (!item || isSettling) return;
    if (!previewEl) {
      // 阈值前不产生任何视觉：把手同时是点击目标时，按下即浮起会让人以为「点一下就把卡片拿起来了」
      if (Math.hypot(event.clientX - pressX, event.clientY - pressY) < DRAG_ACTIVATE_THRESHOLD) return;
      activatePreview(item, event.clientX, event.clientY);
    }
    schedulePreviewPos({ x: event.clientX, y: event.clientY });
  };

  return {
    get draggingItem() {
      return draggingItem;
    },
    begin(item: HTMLElement) {
      draggingItem = item;
    },
    isSettling() {
      return isSettling;
    },
    handlePointerDown,
    handlePointerMove,
    clear: clearPreview,
    settle: settlePreview,
  };
};
