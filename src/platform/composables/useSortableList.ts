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
 * 4. 索引重排：Sortable 直接搬 DOM，落定后按 oldIndex/newIndex 生成新数组交给宿主持久化；
 * 5. 拖拽影像自建：关掉浏览器原生 DnD（原生影像由浏览器绘制、DOM 摸不到）与 Sortable
 *    默认 fallback 视觉，改为克隆被拖元素挂到 body、保持抓取点跟随指针，松手用 Web Animations
 *    落回原位（不走 CSS transition，原因见 settlePreview），样式见 .drag-preview；
 *    原位隐藏走内联 opacity（Vue 重渲染会整段重设 className，类会被抹掉）。
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

import { useRafThrottle } from '@/platform/utils/useRafThrottle';

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
/** 拖拽时影像的放大倍数；与 main.scss 的 .drag-preview 里的 scale 同值，改一处要改两处 */
const PREVIEW_SCALE = 1.02;
/** Sortable 自带 fallback 克隆的隐藏类：只用它做几何载体，视觉一律交给 .drag-preview */
const FALLBACK_HIDDEN_CLASS = 'drag-fallback-hidden';
/** 拖拽期间的全局类：光标与文本选择（main.scss 已有对应样式，供各处拖拽共用） */
const GLOBAL_DRAGGING_CLASS = 'is-global-dragging';

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
   * 被拖元素原有的内联 opacity。
   * 隐藏原位只能用内联样式：Vue 重渲染列表时会整段重设 className（patchClass），
   * 手动加的类会被抹掉，元素就会在影像落地前提前显形，看着像重影。
   */
  let draggingItemOpacity = '';
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

  // 影像位置按帧合帧：同一帧内的多次指针移动只写一次 transform
  const { schedule: schedulePreviewPos, cancel: cancelPreviewPos } = useRafThrottle<{
    x: number;
    y: number;
  }>(pos => {
    // 落定态下这帧属于「松手前最后一帧」的残留：放它写下去就会把影像拽回指针处
    if (!previewEl || isSettling) return;
    previewX = pos.x - grabOffsetX;
    previewY = pos.y - grabOffsetY;
    previewEl.style.transform = `translate3d(${previewX}px, ${previewY}px, 0)`;
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
    // 影像带 PREVIEW_SCALE 缩放（独立 scale 属性，围绕中心放大）：直接用未缩放偏移摆放，
    // 抓取点下的内容会偏出指针（最多约边长的 1%）。换算成缩放后仍落在指针下的等效偏移：
    // 缩放中心为盒心时，内容点 g 渲染于 w/2 + (g - w/2) * s，反解即得下式
    grabOffsetX = grabOffsetX * PREVIEW_SCALE + (rect.width / 2) * (1 - PREVIEW_SCALE);
    grabOffsetY = grabOffsetY * PREVIEW_SCALE + (rect.height / 2) * (1 - PREVIEW_SCALE);
    // 首帧按指针落位，避免从 (0,0) 闪一下；不能直接摆 rect.left/top——
    // 那是未缩放坐标，与上面的缩放补偿偏移不一致，影像出现的瞬间会跳一次
    previewX = pointerX - grabOffsetX;
    previewY = pointerY - grabOffsetY;
    previewEl.style.transform = `translate3d(${previewX}px, ${previewY}px, 0)`;
    // 影像挂好之后再隐藏原位元素：反过来的话隐藏态会被克隆进副本
    draggingItemOpacity = item.style.opacity;
    item.style.opacity = '0';
    document.body.classList.add(GLOBAL_DRAGGING_CLASS);
  };

  /** 摘掉影像与全局拖拽态：落定、实例销毁、拖拽中途卸载都走这里 */
  const clearPreview = () => {
    cancelSettle();
    cancelPreviewPos();
    isSettling = false;
    previewEl?.remove();
    previewEl = null;
    if (draggingItem) {
      draggingItem.style.opacity = draggingItemOpacity;
      draggingItemOpacity = '';
    }
    draggingItem = null;
    document.body.classList.remove(GLOBAL_DRAGGING_CLASS);
  };

  /**
   * 松手复位：影像平滑落回被拖元素的最终位置，而不是原地消失，落定后才揭掉原位元素
   * （所以拖动中段松手、拖出列表被还原，走的都是同一条路径）。
   *
   * 用 Web Animations 而不是 CSS transition，两个原因：
   * 1. 松手与最后一次 pointermove 常落在同一帧，此时合帧队列里还压着一次未执行的写入，
   *    它会紧跟在本函数之后把 transform 写回指针位置 —— 过渡的起止值因此相同，动画压根不发生；
   * 2. WAAPI 在层叠里高于内联样式，即便再有指针写入也拽不回影像，顺带也绕开了
   *    prefers-reduced-motion 那条把 transition-duration 压成 0.01ms 的 !important。
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
    // 起值取计算样式（浮起阴影），终值为全透明零阴影——显式写出以保证可插值
    const floatingShadow = getComputedStyle(el).boxShadow;
    settleAnimation = el.animate(
      [
        {
          transform: `translate3d(${previewX}px, ${previewY}px, 0)`,
          scale: String(PREVIEW_SCALE),
          boxShadow: floatingShadow,
        },
        {
          transform: `translate3d(${target.left}px, ${target.top}px, 0)`,
          scale: '1',
          boxShadow: '0 0 0 0 rgb(0 0 0 / 0%)',
        },
      ],
      { duration: animation, easing: PREVIEW_SETTLE_EASING, fill: 'forwards' }
    );
    // 时长复用 Sortable 的让位动画，与之同拍；跑完才摘影像、揭出原位元素
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
    instance?.destroy();
    instance = null;
    clearPreview();
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
      animation,
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
        draggingItem = event.item;
        // fallback 通道下 onStart/onEnd 是 CustomEvent，事件对象上没有 clientX，
        // 坐标要从 originalEvent（mousedown / 松手事件）上取
        const source = (event as unknown as { originalEvent?: MouseEvent }).originalEvent;
        dragStartX = source?.clientX ?? 0;
        dragStartY = source?.clientY ?? 0;
      },
      // 本组合式自持重排：不传 list/modelValue，故 Sortable 不会去动数据，只负责搬 DOM
      onEnd: event => {
        // @types/sortablejs 未声明 originalEvent，运行时存在（原生事件对象）
        const originalEvent = (event as unknown as { originalEvent?: Event }).originalEvent;
        settleClickAfterDrop(event, originalEvent);
        // 先把影像送回它该在的位置（此时 Sortable 已搬完 DOM，量到的就是最终位置）
        settlePreview(event.item);
        const { oldIndex, newIndex } = event;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
        const next = [...readItems()];
        const [moved] = next.splice(oldIndex, 1);
        if (moved === undefined) return;
        next.splice(newIndex, 0, moved);
        onReorder(next, event);
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
