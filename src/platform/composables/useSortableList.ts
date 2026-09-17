/**
 * 列表拖拽排序 composable：把 sortablejs 的接入样板收敛到一处。
 *
 * 直接依赖 sortablejs 而不是它上面的 Vue 封装（vue-draggable-plus / useDraggable）：
 * 那层封装对本场景可用的部分只有「建实例 + 卸载销毁 + 选项透传」，其余能力
 * （数组双向同步、拖拽克隆、options 差分同步）在本场景全是空转——本组合式自持
 * onEnd、传的是普通选项对象、也不消费 v-model。而它的额外代价是真实的：
 * 实例创建前的 option() 是静默 no-op，容器就绪前改过的 disabled 会被丢掉。
 * 自己持有实例后这类「幽灵状态」不存在了。
 *
 * 收掉的是每次手写都会重复（且踩过坑）的五件事：
 * 1. 拖拽态三件套类名集中定义，不再各处硬编码 ghost / chosen / drag；
 * 2. `disabled` 不是响应式选项——外部条件（排序方式、折叠态）变化时经 option() 跟随；
 * 3. 容器守卫：空列表走 Feedback 分支时容器根本不存在，此时不能建实例；改为
 *    容器就绪且列表非空后再建，列表清空即销毁、重建时重新初始化（元素被换掉也会重建，
 *    避免实例挂在已脱离文档的节点上）；
 * 4. 索引重排：Sortable 直接搬 DOM，落定后据 DOM 实际顺序生成新数组交给宿主持久化
 *    （不拿 oldIndex/newIndex 做下标运算，理由见 resolveNextOrder）；
 * 5. 拖拽影像自建：关掉浏览器原生 DnD（原生影像由浏览器绘制、DOM 摸不到）与 Sortable
 *    默认 fallback 视觉，改为克隆被拖元素挂到 body、保持抓取点跟随指针，松手用 Web Animations
 *    落回原位（不走 CSS transition，原因见 settlePreview），样式见 .drag-preview；
 *    原位隐藏走内联 opacity（Vue 重渲染会整段重设 className，类会被抹掉）；
 * 6. 所有位移动画统一由本组合式做 FLIP：Sortable 的 animation 被压成 0，它只搬 DOM；
 *    换位（onMove 缓存起点 → onChange 播）与落定（松手时缓存 → Vue patch 后播）走同一个
 *    playFlip，一个时长、一个缓动、一种起点定义。此前 Sortable 的换位动画、被打断后的
 *    补动画、宿主 TransitionGroup 的 move 三套并存，起点分别取自「布局位置」「松手瞬间的
 *    视觉位置」「重渲染那一刻的位置」，互相覆盖 —— 闪烁、瞬移、random 顺序都源于此。
 *    见 capturePositions / playFlip。
 *
 * 宿主只需给出容器 ref、数据源、启用条件与落定回调：
 *
 *   const listRef = useTemplateRef<HTMLElement>('listRef');
 *   useSortableList({
 *     target: listRef,
 *     items: () => store.items,
 *     enabled: computed(() => store.sortMethod === 'manual'),
 *     onReorder: next => store.reorder(next),
 *   });
 */
import { nextTick, onUnmounted, toValue, watch } from 'vue';

import Sortable from 'sortablejs';

import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import type { ComponentPublicInstance, MaybeRefOrGetter } from 'vue';

/** 交给 Sortable 的占位类名契约：它在 start 时必定往被拖元素上挂一个类，这里给无样式类，视觉由内联 opacity 控制 */
const PLACEHOLDER_CLASS = 'drag-placeholder';
/** 被拖元素本体（跟随指针的那个）；Sortable 的 chosenClass，无样式定义 */
const CHOSEN_CLASS = 'drag-chosen-style';
/** 拖拽激活态；Sortable 的 dragClass，无样式定义 */
const ACTIVE_CLASS = 'drag-active-style';
/**
 * 起拖阈值（px）：越过它才认定为拖拽。
 * fallback 通道下 mousedown 会立刻触发 start，而把手往往同时是点击目标
 * （面板折叠头、分组标题行），不设阈值就会「点一下」闪出幽灵影像。
 */
const DRAG_ACTIVATE_THRESHOLD = 5;
/** 自建拖拽影像：拖拽期间挂在 body 上跟随指针，样式见 main.scss 的 .drag-preview */
const PREVIEW_CLASS = 'drag-preview';
/** 复位动画缓动，与 tokens.scss 的 $bezier-standard 一致（JS 侧拿不到 SCSS 变量，只能落字面量） */
const PREVIEW_SETTLE_EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
/** 拖拽时影像的放大倍数；由 applyPreviewTransform 写进 transform，main.scss 不再设独立 scale 属性 */
const PREVIEW_SCALE = 1.02;
/** Sortable 自带 fallback 克隆的隐藏类：只用它做几何载体，视觉一律交给 .drag-preview */
const FALLBACK_HIDDEN_CLASS = 'drag-fallback-hidden';
/** 拖拽期间的全局类：光标与文本选择（main.scss 已有对应样式，供各处拖拽共用） */
const GLOBAL_DRAGGING_CLASS = 'is-global-dragging';
/**
 * v-wave 注入的波纹容器（它自己的内部标记）。
 * 折叠头既是按钮又是拖拽把手，按下时 v-wave 已经起了波纹，见 activatePreview。
 */
const WAVE_CONTAINER_SELECTOR = '[data-v-wave-container-internal]';

export interface UseSortableListOptions<T> {
  /**
   * 拖拽容器 ref：其直接子元素即为可排序项。
   * 元素 ref 与组件实例 ref 都可以 —— 组件（如 TransitionGroup）会自动取 $el；
   * 若组件是 Fragment 根（$el 非 Element）则解析不出，建不了实例。
   */
  target: MaybeRefOrGetter<HTMLElement | ComponentPublicInstance | null | undefined>;
  /** 当前数据源（同时用于空列表守卫） */
  items: MaybeRefOrGetter<T[]>;
  /** 是否允许拖拽（响应式）：false 时 Sortable 整体禁用 */
  enabled: MaybeRefOrGetter<boolean>;
  /** 拖拽落定后的新顺序（已按 oldIndex / newIndex 重排），由宿主持久化 */
  onReorder: (next: T[], event: Sortable.SortableEvent) => void;
  /** 拖拽把手选择器；不传则整项可拖 */
  handle?: string;
  /** 动画时长（ms），默认 200 */
  animation?: number;
  /**
   * 交换阈值（占目标尺寸的比例）。保持 Sortable 官方默认 1：指针进入目标即交换。
   * 不要调小（如 0.5）——那会给每个条目上下各留 25% 的「死区」（_getSwapDirection
   * 的正则判定带收缩到中间 50%），横向绕远拖回来悬停在条目顶部/底部时永远不触发交换，
   * 表现为「移回上一个 Item 的顶部却挤不下去」。
   */
  swapThreshold?: number;
}

/** 初始化列表拖拽排序，返回生命周期句柄（多数宿主无需消费返回值） */
export const useSortableList = <T>(options: UseSortableListOptions<T>) => {
  // swapThreshold 保持 Sortable 官方默认 1（指针进入目标即交换）；调小会产生条目边缘死区，理由见接口注释
  const { target, items, enabled, onReorder, handle, animation = 200, swapThreshold = 1 } = options;

  const readItems = () => toValue(items);
  const isEnabled = () => toValue(enabled);

  /**
   * 解析容器：元素 ref 直接返回；组件实例 ref（如挂在 TransitionGroup 上）取 $el。
   * Sortable 只认 HTMLElement，裸传实例会在构造时抛 "el must be an HTMLElement"。
   */
  const resolveTarget = (): HTMLElement | null => {
    const value = toValue(target);
    if (value instanceof HTMLElement) return value;
    if (value) {
      const el = (value as ComponentPublicInstance).$el;
      if (el instanceof HTMLElement) return el;
    }
    return null;
  };

  /** 当前实例；容器未就绪 / 列表为空 / 未挂载时为 null */
  let instance: Sortable | null = null;

  // ==================== 自建拖拽影像 ====================

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
  /** 起拖时的指针位置：onEnd 用于区分「真拖」与「把手上的纯点击」 */
  let dragStartX = 0;
  let dragStartY = 0;
  /**
   * 真拖拽落定后，浏览器仍会补派一次 click（mousedown 与 mouseup 的公共祖先）。
   * sortablejs 本会吞掉它，但它内部的忽略标志在拖拽过程中被 _onDragOver 反复复位，
   * 松手时已是 false——click 就漏到落点元素上，拖完顺手「点」了别人。
   * 置位此标志后在 document 捕获层拦掉这一次（我们的监听晚于 sortable 注册，
   * 排在它后面；它放行后由我们终止传播）。
   */
  let swallowNextClick = false;
  /** 起拖时的子元素顺序快照：落定时据此把 DOM 顺序换回数据顺序（见 resolveNextOrder） */
  let originElements: Element[] | null = null;
  /** 与 originElements 同序的起拖数据快照 */
  let originItems: T[] | null = null;
  /** 一次位置快照：元素的视觉位置（含正在进行的 transform），用作下一段过渡的起点 */
  interface PositionSnapshot {
    el: HTMLElement;
    left: number;
    top: number;
  }

  /**
   * 最近一次 onMove 缓存的视觉位置。Sortable 的 onMove 早于它搬 DOM（三处插入路径都在
   * insertBefore 之前），所以这份快照就是「换位前的视觉位置」，onChange 时据此播过渡。
   * 之所以不在每帧轮询里取：onMove 每次 dragover 都刷新，列表自动滚动时也不会读到过期值。
   */
  let moveSnapshot: PositionSnapshot[] | null = null;
  /** FLIP 收尾定时器：以元素为键，新一轮动画顶掉上一轮的清理 */
  const flipTimers = new Map<HTMLElement, number>();

  /**
   * 落定后的新顺序：以 DOM 为真源，而不是拿 oldIndex/newIndex 去数组里做下标运算。
   *
   * 下标运算隐含一个前提——容器的子元素与数组一一对应。这个前提很脆：
   * 列表里只要掺入任何非数据项（拼音分组的小标题行、末尾的「新建」行、指令注入的
   * overlay），DOM 下标就整体偏移，一次拖拽算出的新顺序与用户所见完全不同，
   * 且 DOM 与数组从此各自漂移，之后每拖一次错一次——表现就是「像被 random 洗过」。
   *
   * 改成读 DOM：起拖时把子元素与数组同序快照，落定时按容器当前子元素顺序把元素换回
   * 数据项。DOM 是用户刚拖出来的结果，这样得到的顺序必然与他松手时看到的一致。
   *
   * @returns 新顺序；数量对不上（拖拽期间列表被增删过，DOM 已不能当真源）时返回 null，
   *          由调用方退回下标运算
   */
  const resolveNextOrder = (): T[] | null => {
    const container = resolveTarget();
    if (!container || !originElements || !originItems) return null;
    // 元素数与数据条数不相等说明列表里掺了非数据项，下标映射不可信
    if (originElements.length !== originItems.length) return null;
    const indexOfChild = new Map<Element, number>();
    originElements.forEach((child, index) => indexOfChild.set(child, index));
    const order: T[] = [];
    for (const child of Array.from(container.children)) {
      const index = indexOfChild.get(child);
      if (index === undefined) continue;
      const item = originItems[index];
      if (item !== undefined) order.push(item);
    }
    return order.length === originItems.length ? order : null;
  };

  /**
   * 记录容器子元素的视觉位置。
   *
   * 取 getBoundingClientRect（含正在进行的 transform）而不是布局位置：换位常常在上一段
   * 过渡还没跑完时就再次发生，只有以视觉位置为起点才能接住它继续跑完，否则每次换位都会
   * 先把元素瞬移回布局位置再重新起跳——快速连续拖动时那是一串可见的跳变。
   *
   * @param skip 被拖元素：它的视觉由 .drag-preview 接管、本体透明，不参与位移动画
   */
  const capturePositions = (skip: HTMLElement | null): PositionSnapshot[] => {
    const container = resolveTarget();
    if (!container) return [];
    // 全是读操作、中间没有写，逐个取不会触发强制重排
    const snapshots: PositionSnapshot[] = [];
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement) || child === skip) continue;
      const rect = child.getBoundingClientRect();
      snapshots.push({ el: child, left: rect.left, top: rect.top });
    }
    return snapshots;
  };

  /**
   * Sortable 打在元素上的动画标记（见 sortable.esm.js 的 animate 与 _onDragOver）。
   * 它自己开 animation 时会写这三个字段，并在 _onDragOver 开头用
   * `target.animated && target.animatingX && target.animatingY` 判定：正在动画的元素
   * 直接跳过换位判定。我们把 animation 设为 0 之后它不再写，这份保护就没了——必须自己补。
   */
  type SortableAnimating = HTMLElement & {
    animated?: number | false;
    animatingX?: boolean;
    animatingY?: boolean;
  };

  /** 打上 / 抹掉「本元素正在动画」的标记，告诉 Sortable 别拿它当交换目标 */
  const setAnimating = (el: HTMLElement, on: boolean, timer = 0) => {
    const target = el as SortableAnimating;
    target.animated = on ? timer : false;
    target.animatingX = on;
    target.animatingY = on;
  };

  /**
   * 把快照里的元素平滑移动到它们当前的布局位置（FLIP）。
   * 位移不足半像素的不动——不给「其实没动」的元素白挂一段过渡。
   *
   * 用 CSS 过渡而不是 WAAPI：起始值必须先真正落地一次再切换，WAAPI 在首帧采样前可能
   * 先绘制一帧终态，那正是「动画没发生」。中间的强制回流是让起始值生效的关键。
   */
  const playFlip = (snapshots: PositionSnapshot[], duration = animation) => {
    const transition = `transform ${duration}ms ${PREVIEW_SETTLE_EASING}`;
    // 先全读再全写：读写交错会把一次布局变成 N 次强制重排
    const live = snapshots.map(snap => snap.el.getBoundingClientRect());
    const moves: HTMLElement[] = [];
    snapshots.forEach((snap, index) => {
      const el = snap.el;
      const rect = live[index];
      if (!rect || !el.isConnected) return;
      const dx = snap.left - rect.left;
      const dy = snap.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      moves.push(el);
    });
    if (!moves.length) return;
    void document.body.offsetHeight; // 一次性强制回流：让所有起点真正落地
    for (const el of moves) {
      el.style.transition = transition;
      el.style.transform = '';
      // 收尾清掉内联 transition，别让它长期盖住元素自身的过渡；
      // 期间若已被新一轮动画改写则让位（比对写入值即可，不必额外记账）
      const previous = flipTimers.get(el);
      if (previous) clearTimeout(previous);
      // 动画期间必须把自己标成「正在动画」，否则 Sortable 会继续拿它当交换目标：
      // 它的换位判定读 getRect，而我们正用 transform 把这个元素从旧位搬向新位，
      // 读到的是漂移中的中间位置——方向判定随之反转，立刻又换回来，来回往复就是那阵闪烁。
      // Sortable 自己开 animation 时由它写这三个字段；animation: 0 后只能我们自己补。
      const timer = window.setTimeout(() => {
        flipTimers.delete(el);
        setAnimating(el, false);
        if (el.style.transition !== transition) return;
        el.style.transition = '';
        el.style.transform = '';
      }, duration + 100);
      setAnimating(el, true, timer);
      flipTimers.set(el, timer);
    }
  };

  /** 收掉所有 FLIP 定时器并抹平残留的内联 transform（再次起拖 / 销毁时用） */
  const cancelFlip = () => {
    for (const [el, timer] of flipTimers) {
      clearTimeout(timer);
      setAnimating(el, false); // 标记残留会让 Sortable 永远跳过这个元素，之后再也不能换位
      el.style.transition = '';
      el.style.transform = '';
    }
    flipTimers.clear();
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (!swallowNextClick) return;
    swallowNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
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

  const handlePointerDown = (event: PointerEvent) => {
    pressX = event.clientX;
    pressY = event.clientY;
    // 兜底：上一轮若因取消路径没等到补派的 click，标志不该带到这一轮
    swallowNextClick = false;
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

    previewEl = document.createElement('div');
    previewEl.className = PREVIEW_CLASS;
    previewEl.style.width = `${rect.width}px`;
    previewEl.style.height = `${rect.height}px`;
    previewEl.appendChild(clone);
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
   * 让 hover 落回别处 —— 表现为复位结束后「亮一下又灭」。两者由 clearPreview 同时还原，
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

  /**
   * 松手后的 click 清理：按指针位移分两路。
   *
   * 纯点击（位移 < 阈值）：sortablejs fallback 通道在起拖瞬间（mousedown）就会置位
   * 内部的 ignoreNextClick，并在 document 捕获层把紧随的原生 click 一律吞掉（sortablejs
   * #1184：防「拖了但没换位」误触 click）。把手同时是点击目标（折叠头、标题行）时，
   * 普通点击也被连坐——click 永远到不了业务，且表现为「偶尔失效」（带 1px 抖动恰好
   * 触发过 dragOver 时标志被复位，点击又正常）。补偿：在 onEnd 的微任务里派发一个
   * 合成 click——它会被 sortable 吞掉（吞的动作用 stopImmediatePropagation 终止，
   * 业务监听收不到它），但吞的同时把 ignoreNextClick 复位——随后到达的原生 click
   * 便能完整走完传播链。业务最终收到的是一次 trusted 原生事件，且不会双触发。
   *
   * 真拖（位移 ≥ 阈值）：置位 swallowNextClick，由 handleDocumentClick 在捕获层
   * 吞掉浏览器补派的 click（见该字段注释）。
   */
  const settleClickAfterDrop = (_event: Sortable.SortableEvent, originalEvent?: Event) => {
    const source = originalEvent as (MouseEvent & { type: string }) | undefined;
    const moved = Math.hypot((source?.clientX ?? 0) - dragStartX, (source?.clientY ?? 0) - dragStartY);
    if (moved >= DRAG_ACTIVATE_THRESHOLD) {
      // 真拖：吞掉浏览器补派的 click。松手通道可能是 mouseup（sortable 也可能开
      // supportPointer 走 pointerup）；取消路径（pointercancel / dragend）没有
      // click 可吞，置了位反而会把之后一次无关点击误吞掉。
      const dropType = source?.type;
      swallowNextClick = dropType === 'mouseup' || dropType === 'pointerup' || dropType === 'touchend';
      return;
    }
    const target = (source?.target ?? null) as Element | null;
    if (!(target instanceof Element) || !target.isConnected) return;
    queueMicrotask(() => {
      target.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          detail: 1,
          button: 0,
          clientX: source?.clientX ?? 0,
          clientY: source?.clientY ?? 0,
        })
      );
    });
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

  // 捕获阶段监听：宿主在冒泡阶段 stopPropagation 也拿得到按下位置；
  // click 拦截必须同样在捕获层，且晚于 sortable 的全局 click 监听注册（它先放行、我们再吞）
  const bindPointerWatchers = () => {
    document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });
    document.addEventListener('click', handleDocumentClick, { capture: true });
  };

  const unbindPointerWatchers = () => {
    document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    document.removeEventListener('pointermove', handlePointerMove, { capture: true });
    document.removeEventListener('click', handleDocumentClick, { capture: true });
  };

  const destroy = () => {
    // 销毁可能发生在拖拽中途（容器被换掉、列表清空、卸载）。顺序不需要补救——落定走的
    // 是「以 DOM 为真源」，下次起拖会重新快照，不会像下标运算那样把错位一代代累积下去；
    // 真正要收干净的是影像与未跑完的位移动画，否则残留的内联 transform 会盖住后续布局
    instance?.destroy();
    instance = null;
    originElements = null;
    originItems = null;
    moveSnapshot = null;
    clearPreview();
    cancelFlip();
    // 实例销毁后不会再有对应的 click 到来，别让残留的标志误吞下一次无关点击
    swallowNextClick = false;
    unbindPointerWatchers();
  };

  /**
   * 建（或重建）实例。这里就是「容器守卫」的落点：容器不存在时直接放弃，
   * 不需要像封装那样靠 catch 或提前 start 来回避 "el must be an HTMLElement"。
   * disabled 在建实例时现读一次——不存在「创建前的选项变更被丢弃」这种状态。
   */
  const start = () => {
    const element = resolveTarget();
    if (!element) return;
    destroy();
    bindPointerWatchers();
    instance = new Sortable(element, {
      // 换位动画由本组合式统一接管（见 playFlip）。Sortable 自己那套是「先写回旧位置的
      // transform 再过渡到 0」，起点取布局位置而非视觉位置——连续换位时会先把元素瞬移回
      // 布局位置再重新起跳；松手时若还在飞又留下内联残留。给 0 之后它只搬 DOM、不做任何
      // 视觉动画（captureAnimationState 与 animateAll 两处早退，不会留下残留）
      animation: 0,
      swapThreshold,
      // 原位隐藏的类名不交给 Sortable：fallback 通道下它在 mousedown 就加类，
      // 会把「点一下把手」变成「卡片瞬间消失」。这里只给无样式类满足契约，
      // 真正的隐藏由 activatePreview 在越阈值后加上。
      ghostClass: PLACEHOLDER_CLASS,
      chosenClass: CHOSEN_CLASS,
      dragClass: ACTIVE_CLASS,
      ...(handle ? { handle } : {}),
      disabled: !isEnabled(),
      // 关掉浏览器原生 DnD：原生拖拽影像由浏览器绘制、DOM 碰不到，只能看到系统默认快照。
      // 改走 fallback 通道后，跟随指针的影像完全由 activatePreview() 自建。
      forceFallback: true,
      // Sortable 的 fallback 克隆退化为纯几何载体：脱离文档流且不可见（见 .drag-fallback-hidden）
      fallbackClass: FALLBACK_HIDDEN_CLASS,
      fallbackOnBody: true,
      onStart: event => {
        // 复位动画还没跑完就再次起拖：先把上一轮收干净（影像、动画、上一行的透明态与落定态）。
        // draggingItem 马上要被覆盖，晚一步就找不到上一行了，它会永远停在透明态
        clearPreview();
        cancelFlip();
        draggingItem = event.item;
        // 快照起拖时的子元素顺序与数据顺序（两者同序）：落定时据此把 DOM 顺序换回数据顺序
        const container = resolveTarget();
        originElements = container ? Array.from(container.children) : null;
        originItems = container ? [...readItems()] : null;
        moveSnapshot = null;
        // fallback 通道下 onStart/onEnd 是 CustomEvent，事件对象上没有 clientX，
        // 坐标要从 originalEvent（mousedown / 松手事件）上取
        const source = (event as unknown as { originalEvent?: MouseEvent }).originalEvent;
        dragStartX = source?.clientX ?? 0;
        dragStartY = source?.clientY ?? 0;
      },
      // 拖拽中的换位：onMove 早于 Sortable 搬 DOM（三处插入路径都在 insertBefore 之前），
      // 此刻缓存的正是「换位前的视觉位置」；onChange 时 DOM 已搬好，据此播过渡。
      // 返回 undefined 表示放行（Sortable 只认 !== false）
      onMove: () => {
        moveSnapshot = capturePositions(draggingItem);
      },
      onChange: () => {
        if (moveSnapshot) playFlip(moveSnapshot);
        moveSnapshot = null;
      },
      // 本组合式自持重排：不传 list/modelValue，故 Sortable 不会去动数据，只负责搬 DOM
      onEnd: event => {
        // @types/sortablejs 未声明 originalEvent，运行时存在（原生事件对象）
        const originalEvent = (event as unknown as { originalEvent?: Event }).originalEvent;
        settleClickAfterDrop(event, originalEvent);
        const { oldIndex, newIndex } = event;
        // 以 DOM 为真源算新顺序；取不到（列表在拖拽期间被增删过）才退回下标运算
        let next = resolveNextOrder();
        if (!next && oldIndex != null && newIndex != null && oldIndex !== newIndex) {
          const candidate = [...readItems()];
          const [moved] = candidate.splice(oldIndex, 1);
          if (moved !== undefined) {
            candidate.splice(newIndex, 0, moved);
            next = candidate;
          }
        }
        // 顺序没变就不写回：省一次持久化，也免得平白触发一次重排
        const current = readItems();
        if (next && next.length === current.length && next.every((item, index) => item === current[index])) {
          next = null;
        }
        // 记下此刻的视觉位置：最后一次换位可能还在飞，元素在半路，松手后要接着跑完
        const before = capturePositions(event.item);
        // 不撤销 Sortable 对 DOM 的搬动。它搬完的顺序就是用户松手时看到的结果，拉回旧序
        // 会让所有位置动画的起点失真（元素先闪回旧位、再滑回新位）。不拉回还顺带解决了
        // 与宿主 FLIP 的冲突：Vue patch 前后位置一致，TransitionGroup 的位移为 0，
        // 不会插进来再补一段（.song-sort-move 与拖拽动画打架就是这么来的）。
        // Vue 的 keyed diff 面对「DOM 已是目标顺序」是安全的：每次 insertBefore 都以元素
        // 引用或片段锚点为参照，最终序列必然等于新数组。
        if (next) onReorder(next, event);
        // 复位动画的终点等 Vue patch 完再量（nextTick 微任务里 DOM 已是最终顺序，且此帧
        // 尚未绘制）；变位元素未跑完的过渡也在此刻由 playFlip 接上，与影像落位同拍收尾
        void nextTick(() => {
          playFlip(before);
          settlePreview(event.item);
        });
      },
    });
  };

  // Sortable 的 disabled 不是响应式选项，外部条件变化时用 option() 同步
  watch(
    () => isEnabled(),
    value => instance?.option('disabled', !value)
  );

  // 只盯「当前该挂在哪个元素上」：空列表或容器未就绪时归为 null（→ 销毁），
  // 元素被换掉（列表重建 / 容器复用）时引用不同，同样触发重建。
  watch(
    () => (readItems().length > 0 ? resolveTarget() : null),
    element => {
      if (!element) {
        destroy();
        return;
      }
      // 再等一帧让 DOM 落定：容器可能由同一次补丁里的 v-if 新建，子项也还在插入。
      // start() 内部会重新取一次元素，期间被拆掉则自然放弃。
      void nextTick(start);
    },
    { immediate: true }
  );

  onUnmounted(destroy);

  return { start, destroy };
};
