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
 *
 * 【本文件的职责边界】拆分后这里只剩「容器守卫 + Sortable 实例生命周期 + 事件接线」：
 * 常量与选项在 constants、DOM 顺序与 FLIP 引擎在 order、拖拽影像在 preview、
 * 子树滚动偏移的保全在 scrollOffsets。
 */
import { nextTick, onUnmounted, toValue, watch } from 'vue';

import {
  ACTIVE_CLASS,
  CHOSEN_CLASS,
  DRAG_ACTIVATE_THRESHOLD,
  DRAG_LONG_PRESS_DELAY,
  DRAG_TOUCH_SLOP,
  FALLBACK_HIDDEN_CLASS,
  PLACEHOLDER_CLASS,
} from './constants';
import { cancelFlip, capturePositions, playFlip, resolveNextOrder } from './order';
import { createPreviewController } from './preview';
import { captureScrollOffsets, restoreScrollOffsets } from './scrollOffsets';

// Sortable 仅在首次建实例（组件挂载且列表非空）时才需要，动态加载使其脱离首屏闭包
// （SidebarLeft 静态引入 SongSection/GroupSection，静态 import 会把 sortablejs 拖进首屏预算）
import type Sortable from 'sortablejs';
import type { UseSortableListOptions } from './constants';
import type { PositionSnapshot } from './order';
import type { ScrollOffsetSnapshot } from './scrollOffsets';
import type { ComponentPublicInstance } from 'vue';

export type { UseSortableListOptions } from './constants';

/**
 * 拖拽期间的全局类**一并对外导出**：它不只服务排序，而是「各处拖拽共用」的全局契约
 * （对应样式在 main.scss，按类名匹配）。第二套拖拽实现（乐谱槽位拖拽）必须引用同一份常量 ——
 * 两边各写字面量时，改名不会报错，只会静默失配（光标与文本选择抑制失效），故由 barrel 收口。
 */
export { GLOBAL_DRAGGING_CLASS } from './constants';

/**
 * 取 Sortable 事件上的原始原生事件（`originalEvent`）。
 *
 * **@types/sortablejs 未声明该字段**，但运行时确实存在：fallback 通道下 onStart / onEnd 拿到的是
 * CustomEvent，坐标与键位只能从它上面的原生事件取。这里用 `in` 收窄 + `instanceof` 取真类型，
 * 而不是断言出一个类型系统不认识的字段。
 */
const readOriginalEvent = (event: Sortable.SortableEvent): Event | undefined => {
  const raw = 'originalEvent' in event ? event.originalEvent : undefined;
  return raw instanceof Event ? raw : undefined;
};

/**
 * 从事件取指针坐标。
 *
 * `mouseup` / `pointerup` 走 clientX/clientY；`touchend` 必须走 changedTouches ——
 * TouchEvent 不是 MouseEvent 的子类，只判 MouseEvent 会把它整类漏掉，坐标退化成 0,0，
 * 补派的合成 click 于是落在屏幕左上角。
 */
const readEventPoint = (event: Event | undefined): { x: number; y: number } | null => {
  if (event instanceof MouseEvent) return { x: event.clientX, y: event.clientY };
  if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent) {
    const [touch] = event.changedTouches;
    if (touch) return { x: touch.clientX, y: touch.clientY };
  }
  return null;
};

/** 初始化列表拖拽排序，返回生命周期句柄（多数宿主无需消费返回值） */
export const useSortableList = <T>(options: UseSortableListOptions<T>) => {
  // swapThreshold 保持 Sortable 官方默认 1（指针进入目标即交换）；调小会产生条目边缘死区，理由见接口注释
  const {
    target,
    items,
    enabled,
    onReorder,
    handle,
    touchHandle,
    animation = 200,
    swapThreshold = 1,
    longPressMenu,
    touchDelay = DRAG_LONG_PRESS_DELAY,
  } = options;

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

  // ==================== Sortable 模块懒加载 ====================

  /** Sortable 构造器类型：动态加载拿到的是可构造的类本身（实例类型即上方 import type 的 Sortable） */
  type SortableFactory = new (element: HTMLElement, options: Sortable.SortableOptions) => Sortable;

  /** Sortable 模块的加载 promise（进程内共享，多次建实例只加载一次） */
  let sortableModulePromise: Promise<SortableFactory> | null = null;
  const loadSortable = (): Promise<SortableFactory> => {
    sortableModulePromise ??= import('sortablejs').then(mod => {
      // CJS（export = Sortable）经打包器互操作后动态 import 得到 { default: Sortable }；
      // ESM 形态下模块本身即可构造。两种形态统一归一为可构造的类
      const withDefault = mod as { default?: SortableFactory };
      return withDefault.default ?? (mod as unknown as SortableFactory);
    });
    return sortableModulePromise;
  };

  /**
   * start 代际号：Sortable 模块异步加载期间若发生 destroy（容器换掉、列表清空、卸载）
   * 或新的 start，加载完成后返回的旧流程凭代际不符而放弃，避免把实例建在已销毁的宿主上
   * （同步版本不存在此问题，动态化后必须补上）。
   */
  let startGeneration = 0;

  // ==================== 拖拽影像（独立工厂） ====================

  const preview = createPreviewController(animation);

  // ==================== 顺序与 FLIP 状态 ====================

  /** 起拖时的子元素顺序快照：落定时据此把 DOM 顺序换回数据顺序（见 resolveNextOrder） */
  let originElements: Element[] | null = null;
  /** 与 originElements 同序的起拖数据快照 */
  let originItems: T[] | null = null;

  /**
   * 起拖时容器子树里被滚动的元素及其偏移。Sortable 搬 DOM 会让这些元素整棵子树失去 box、
   * 偏移静默归零且**不派发 `scroll`**，故每次搬完都要按引用写回（见 scrollOffsets.ts）。
   */
  let scrollSnapshot: ScrollOffsetSnapshot[] | null = null;

  /**
   * 最近一次 onMove 缓存的视觉位置。Sortable 的 onMove 早于它搬 DOM（三处插入路径都在
   * insertBefore 之前），所以这份快照就是「换位前的视觉位置」，onChange 时据此播过渡。
   * 之所以不在每帧轮询里取：onMove 每次 dragover 都刷新，列表自动滚动时也不会读到过期值。
   */
  let moveSnapshot: PositionSnapshot[] | null = null;
  /** FLIP 收尾定时器：以元素为键，新一轮动画顶掉上一轮的清理 */
  const flipTimers = new Map<HTMLElement, number>();

  // ==================== 松手后的 click 清理 ====================

  /**
   * 真拖拽落定后，浏览器仍会补派一次 click（mousedown 与 mouseup 的公共祖先）。
   * sortablejs 本会吞掉它，但它内部的忽略标志在拖拽过程中被 _onDragOver 反复复位，
   * 松手时已是 false——click 就漏到落点元素上，拖完顺手「点」了别人。
   * 置位此标志后在 document 捕获层拦掉这一次（我们的监听晚于 sortable 注册，
   * 排在它后面；它放行后由我们终止传播）。
   */
  let swallowNextClick = false;
  /** 拖拽进行中（onStart 起、onEnd / destroy 止）：右键兜底只在此期间生效 */
  let dragActive = false;
  /**
   * 本轮拖拽已按「取消」处理（右键）。置位后 onEnd 只复位顺序、不落定、不补派 click。
   * 由 onEnd 自身按松手键位识别，另在 contextmenu 兜底置位（见 onContextMenu）。
   */
  let dropCancelled = false;

  // ==================== 触摸端「长按 = 右键」（见 UseSortableListOptions.longPressMenu） ====================

  /** 当前长按会话（按下的坐标、指针 id 与目标元素）；非触摸按下或未开启该能力时为 null */
  let longPressSession: { x: number; y: number; pointerId: number; target: EventTarget | null } | null = null;
  /** 长按到点的定时器 */
  let longPressTimer: number | null = null;
  /** 本次长按是否已经弹出过菜单：之后手指一移动就要通知宿主收起 */
  let longPressMenuOpened = false;
  /**
   * 本轮手势已被长按消费（到点弹过菜单）。**必须存活到松手落定**，故不随 `clearLongPress`
   * 一起复位 —— 触屏上「长按 = 右键」是开菜单的手势，同一次手势不该再被当成一次点击：
   * 松手时若照常补派 click（见 settleClickAfterDrop），折叠头会当场收起 / 卡片会当场选中，
   * 与宿主刚弹出的菜单同时生效，用户看到的是「长按一次干了两件事」。
   * 复位点只有两处：settleClickAfterDrop（消费掉）与 onPointerDown（新手势开始）。
   */
  let longPressConsumed = false;
  /**
   * 正在派发「长按合成的 contextmenu」。
   * 只在 dispatchEvent 期间为真（派发是同步的），供 onContextMenu 区分它与真右键。
   */
  let isLongPressContextMenu = false;

  /**
   * 把容器子元素按**起拖时的顺序**放回原位（右键复位用）。
   *
   * 逐个 appendChild 即可复位：每次追加都把元素移到末尾，按 originElements 顺序走一遍后，
   * 容器内这些元素的相对顺序必然等于起拖时。拖拽克隆挂在 body（fallbackOnBody）、不在容器内，
   * 由 sortable 自己的收尾移除，无需在此处理。
   *
   * 只搬**仍挂在容器里**的那些：拖拽期间列表可能被重新渲染过（Vue 换掉整批节点），
   * 快照里的旧节点已脱离文档 —— 对它们 appendChild 会把它们**重新插回**容器，
   * 表现为多出一批幽灵行（旧节点与当前节点同时存在）。
   */
  const restoreOriginOrder = () => {
    const container = resolveTarget();
    if (!container || !originElements) return;
    for (const element of originElements) {
      if (element.parentElement !== container) continue;
      container.appendChild(element);
    }
  };

  /**
   * 按住期间的右键兜底：把本轮标记为「已取消」，并在原生菜单弹出**之前**主动结束这次拖拽。
   *
   * 只置标志、等松手事件是不够的：fallback 通道下 sortable 只监听 pointerup（没有 mouseup 兜底），
   * 而右键的原生菜单一弹出，那次 pointerup 就可能不再派发（菜单是系统级 UI，后续指针事件被它接管）
   * —— 拖拽于是挂到下一次无关的松手，影像停在右键处不动，直到用户再点一下页面。
   *
   * 故这里补发一个合成 pointerup（button = 2）：sortable 的松手监听挂在 ownerDocument 上，
   * 收到它即当场走完 _onDrop（摘掉 ghost / clone、清拖拽态类、解绑松手监听），我们的 onEnd
   * 随即按 button === 2 走取消分支。**「当场」是这条修法的全部要点**：onEnd 在菜单弹出前就跑完，
   * 复位动画（preview.settle）随之启动，影像滑回起拖位置，而不是停在右键处或原地闪现。
   * 真实 pointerup 若随后到达也不会重复处理 —— _onDrop 收尾时已解绑监听，
   * 且 Sortable.active 已被清空、不再派发 end。
   *
   * 只在排序拖拽进行中生效（dragActive 守卫），故不会干扰页面其它控件的 pointerup 收尾。
   * 但它是一次 **document 级广播**：挂在 window 上的全局手势（歌词拖拽）与挂在 document 捕获层的
   * 滚动条拖拽都会收到它 —— 两者各有「非拖拽态即早退」的守卫，且这几套手势不可能同时在跑，
   * 故今天无害。这个前提取决于那几个消费方，改动它们时要一并复核。
   * 刻意不拦右键菜单：右键在本应用里同时是「打开卡片菜单」的手势，这里只负责让排序复位。
   */
  const onContextMenu = () => {
    // 长按合成的右键等价事件不算「按住期间右键」（见 dispatchLongPressContextMenu）：
    // 那时 sortable 早已进入拖拽态，而下面这条的语义是「用户按右键 → 取消这次排序」，
    // 长按只是想开卡片菜单，把拖拽一起取消掉就等于「长按后拖不动」
    if (isLongPressContextMenu) return;
    if (!dragActive) return;
    dropCancelled = true;
    document.dispatchEvent(new PointerEvent('pointerup', { button: 2, bubbles: true, cancelable: true }));
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (!swallowNextClick) return;
    swallowNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  /**
   * 松手后的 click 清理：按**手势是否成立**分两路（本次手势已被长按消费掉的那一路单列在下方）。
   *
   * 判据是「影像是否已浮现」（preview.isActive），不是按下点与松手点的直线距离 —— 后者在
   * 「拖出去又拖回原位」时两端几乎重合，一次真拖会被反判成纯点击，于是补派一个 click 到
   * 松手的那个把手上：表现为「拖了但没换位，面板/折叠头反而被点开或收起了」。影像的浮现条件
   * （某一帧的位移越过阈值）满足即锁存，故两端判据同源，不存在这种自相矛盾。
   *
   * 纯点击（手势未成立）：sortablejs fallback 通道在起拖瞬间（mousedown）就会置位
   * 内部的 ignoreNextClick，并在 document 捕获层把紧随的原生 click 一律吞掉（sortablejs
   * #1184：防「拖了但没换位」误触 click）。把手同时是点击目标（折叠头、标题行）时，
   * 普通点击也被连坐——click 永远到不了业务，且表现为「偶尔失效」（带 1px 抖动恰好
   * 触发过 dragOver 时标志被复位，点击又正常）。补偿：在 onEnd 的微任务里派发一个
   * 合成 click——它会被 sortable 吞掉（吞的动作用 stopImmediatePropagation 终止，
   * 业务监听收不到它），但吞的同时把 ignoreNextClick 复位——随后到达的原生 click
   * 便能完整走完传播链。业务最终收到的是一次 trusted 原生事件，且不会双触发。
   *
   * 真拖（手势已成立）：置位 swallowNextClick，由 handleDocumentClick 在捕获层
   * 吞掉浏览器补派的 click（见该字段注释）。
   *
   * 松手事件类型取不到时（pointercancel / dragend 之类没有 click 可吞的收尾）不置吞标志：
   * 置了反而会把之后一次无关点击误吞掉。这类收尾只可能来自真拖，故也不会补派 click。
   *
   * 已被长按消费的手势（`longPressConsumed`）：菜单已经弹出，这次松手只是「离开菜单」，
   * 既不补派 click，也照上面那套吞掉 sortable 放行的原生 click —— 两条都是为了让这次手势
   * 只留下菜单这一个结果。`swallowNextClick` 与真拖分支共用，故松手类型取不到时同样不置。
   */
  const settleClickAfterDrop = (_event: Sortable.SortableEvent, originalEvent?: Event) => {
    if (preview.isActive()) {
      const dropType = originalEvent?.type;
      swallowNextClick = dropType === 'mouseup' || dropType === 'pointerup' || dropType === 'touchend';
      return;
    }
    // 长按已消费这次手势（菜单已弹）：既不补派 click，也要吞掉 sortable 放行的原生 click。
    // 补派那条路径的存在意义是「把 sortable 吞掉的那一次换回来」，这里恰恰相反 —— 需要的是
    // 一次都不落到业务上。吞的机制与真拖分支同源（见 swallowNextClick）。
    if (longPressConsumed) {
      longPressConsumed = false;
      const dropType = originalEvent?.type;
      swallowNextClick = dropType === 'mouseup' || dropType === 'pointerup' || dropType === 'touchend';
      return;
    }
    const target = originalEvent?.target ?? null;
    if (!(target instanceof Element) || !target.isConnected) return;
    // 合成 click 只用来「把 sortable 吞掉的那一次原生 click 换回来」，落点与坐标照搬松手处
    const point = readEventPoint(originalEvent);
    queueMicrotask(
      () =>
        void target.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            detail: 1,
            button: 0,
            clientX: point?.x ?? 0,
            clientY: point?.y ?? 0,
          })
        )
    );
  };

  /**
   * 按指针类型现切 Sortable 的把手（见 `UseSortableListOptions.touchHandle`）：触摸走 `touchHandle`、
   * 其余走 `handle`。**必须在 pointerdown 这一刻切** —— Sortable 的起手判定（`_onTapStart`）在那一刻
   * 现读一次 `options.handle`，而它挂在容器上、走冒泡；本监听在 document 捕获层，必定先跑完。
   *
   * 切「无把手」档用空串而不是 `undefined`：`option(name, undefined)` 是**取值**语义，写不进去。
   */
  const syncHandleForPointer = (pointerType: string) => {
    if (!touchHandle || !instance) return;
    const next = pointerType === 'touch' ? touchHandle : (handle ?? '');
    if (instance.option('handle') !== next) instance.option('handle', next);
  };

  /**
   * 指针监视（捕获阶段）：宿主在冒泡阶段 stopPropagation 也拿得到按下位置；
   * click 拦截必须同样在捕获层，且晚于 sortable 的全局 click 监听注册（它先放行、我们再吞）。
   */
  const onPointerDown = (event: PointerEvent) => {
    // 兜底：上一轮若因取消路径没等到补派的 click，标志不该带到这一轮
    swallowNextClick = false;
    // 新手势开始：上一轮长按的消费标记到此为止（同一次手势内只有这一个 pointerdown）
    longPressConsumed = false;
    syncHandleForPointer(event.pointerType);
    preview.handlePointerDown(event);
    // 触摸端长按登记：只在**本容器内**的按下算（监听挂在 document 上，全页共用一份）
    if (longPressMenu && event.pointerType === 'touch' && resolveTarget()?.contains(event.target as Node)) {
      clearLongPress();
      armLongPress(event);
    }
  };

  /** 长按到点：在按下的元素上合成一个 contextmenu（触屏没有右键，这就是它的等价物） */
  const dispatchLongPressContextMenu = (session: { x: number; y: number; target: EventTarget | null }) => {
    const pressed = session.target;
    // 元素已脱离文档（长按期间列表被重渲染）：派发出去也没有委托能接住，直接放弃
    if (!(pressed instanceof Element) || !pressed.isConnected) return;

    longPressMenuOpened = true;
    longPressConsumed = true;
    isLongPressContextMenu = true;
    try {
      pressed.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          // 右键的键位语义：消费方（宿主委托 / 浮层外点判定）按真右键的那套处理
          button: 2,
          buttons: 2,
          clientX: session.x,
          clientY: session.y,
        })
      );
    } finally {
      isLongPressContextMenu = false;
    }
  };

  /** 触摸端长按登记：时长与起拖同一档（`DRAG_LONG_PRESS_DELAY`），到点派发右键等价事件 */
  const armLongPress = (event: PointerEvent) => {
    const session = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, target: event.target };
    longPressSession = session;
    longPressMenuOpened = false;
    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      dispatchLongPressContextMenu(session);
    }, DRAG_LONG_PRESS_DELAY);
  };

  /** 清掉长按会话（抬起 / 取消 / 销毁 / 等待期内放弃）。
   *  刻意**不**清 `longPressConsumed`：它记录的是「本次手势已被长按消费」，
   *  要活到松手落定（settleClickAfterDrop）才作数，见该字段的说明。 */
  const clearLongPress = () => {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressSession = null;
    longPressMenuOpened = false;
  };

  /**
   * 长按会话里的指针移动，两条分界（都在起拖之前，故都不与 sortable 的起拖判定打架）：
   *
   * - **菜单还没弹出**：滑动超过 `DRAG_TOUCH_SLOP` 即判定「用户想滚动」，放弃本次长按 ——
   *   与 sortable 的 `touchStartThreshold` 同口径同数值，两个长按不会被同一个手势分别判成两件事；
   * - **菜单已弹出**：越过 `DRAG_ACTIVATE_THRESHOLD`（与影像起浮同一阈值）即认定拖拽接管了这次手势，
   *   通知宿主收起它自己那个菜单 —— 只通知一次，之后不再重复调用。
   */
  const handleLongPressMove = (event: PointerEvent) => {
    const session = longPressSession;
    if (!session || event.pointerId !== session.pointerId) return;

    const moved = Math.hypot(event.clientX - session.x, event.clientY - session.y);
    if (longPressMenuOpened) {
      if (moved < DRAG_ACTIVATE_THRESHOLD) return;
      longPressMenuOpened = false;
      longPressMenu?.onDismiss();
      return;
    }

    if (longPressTimer !== null && moved > DRAG_TOUCH_SLOP) clearLongPress();
  };

  const onPointerMove = (event: PointerEvent) => {
    handleLongPressMove(event);
    preview.handlePointerMove(event);
  };

  const bindPointerWatchers = () => {
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    document.addEventListener('pointerup', clearLongPress, { capture: true, passive: true });
    document.addEventListener('pointercancel', clearLongPress, { capture: true, passive: true });
    document.addEventListener('click', handleDocumentClick, { capture: true });
    document.addEventListener('contextmenu', onContextMenu, { capture: true, passive: true });
  };

  const unbindPointerWatchers = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('pointermove', onPointerMove, { capture: true });
    document.removeEventListener('pointerup', clearLongPress, { capture: true });
    document.removeEventListener('pointercancel', clearLongPress, { capture: true });
    document.removeEventListener('click', handleDocumentClick, { capture: true });
    document.removeEventListener('contextmenu', onContextMenu, { capture: true });
  };

  const destroy = () => {
    // 推进代际：作废仍在等待模块加载的 start 流程（见 startGeneration 注释）
    startGeneration++;
    // 销毁可能发生在拖拽中途（容器被换掉、列表清空、卸载）。顺序不需要补救——落定走的
    // 是「以 DOM 为真源」，下次起拖会重新快照，不会像下标运算那样把错位一代代累积下去；
    // 真正要收干净的是影像与未跑完的位移动画，否则残留的内联 transform 会盖住后续布局
    instance?.destroy();
    instance = null;
    originElements = null;
    originItems = null;
    scrollSnapshot = null;
    moveSnapshot = null;
    preview.clear();
    cancelFlip(flipTimers);
    // 实例销毁后不会再有对应的 click 到来，别让残留的标志误吞下一次无关点击
    swallowNextClick = false;
    // 长按消费标记同理：手势已无处落定，留着只会误吞
    longPressConsumed = false;
    dragActive = false;
    dropCancelled = false;
    // 长按会话同理：容器都没了，再等到点派发右键等价事件也没有委托能接住
    clearLongPress();
    unbindPointerWatchers();
  };

  /**
   * 建（或重建）实例。这里就是「容器守卫」的落点：容器不存在时直接放弃，
   * 不需要像封装那样靠 catch 或提前 start 来回避 "el must be an HTMLElement"。
   * disabled 在建实例时现读一次——不存在「创建前的选项变更被丢弃」这种状态。
   * Sortable 模块为动态加载：等待期间宿主可能 destroy/重建，凭代际守卫作废过期流程。
   */
  const start = async () => {
    const element = resolveTarget();
    if (!element) return;
    destroy();
    const generation = ++startGeneration;
    const SortableCtor = await loadSortable();
    // 模块加载期间宿主被销毁（destroy 已推进代际）或被新的 start 取代：放弃本次创建
    if (generation !== startGeneration) return;
    instance = new SortableCtor(element, {
      // 换位动画由本组合式统一接管（见 playFlip）。Sortable 自己那套是「先写回旧位置的
      // transform 再过渡到 0」，起点取布局位置而非视觉位置——连续换位时会先把元素瞬移回
      // 布局位置再重新起跳；松手时若还在飞又留下内联残留。给 0 之后它只搬 DOM、不做任何
      // 视觉动画（captureAnimationState 与 animateAll 两处早退，不会留下残留）
      animation: 0,
      swapThreshold,
      // 触摸端长按起拖、等待期内滑动超过容差即放弃（见 constants 的两条常量）：触屏上「按住就拖」
      // 与「滑动滚动」是同一个手势，不设这一档时 sortable 会在第一次 touchmove 里 preventDefault，
      // 列表再也滚不动（宿主里没有把手、整张卡片可抓的那几处尤其致命）。
      // 鼠标端不受影响：delayOnTouchOnly 让鼠标照旧按下即起拖（阈值判点击由 preview 负责）。
      // 把手是专用元素（宿主传 touchDelay: 0）时整档关掉：那时「按住」与「滚动」不再争同一个手势，
      // 长按只剩下害处（见 UseSortableListOptions.touchDelay）。
      delay: touchDelay,
      delayOnTouchOnly: true,
      touchStartThreshold: DRAG_TOUCH_SLOP,
      // 原位隐藏的类名不交给 Sortable：fallback 通道下它在 mousedown 就加类，
      // 会把「点一下把手」变成「卡片瞬间消失」。这里只给无样式类满足契约，
      // 真正的隐藏由 preview 在越阈值后加上。
      ghostClass: PLACEHOLDER_CLASS,
      chosenClass: CHOSEN_CLASS,
      dragClass: ACTIVE_CLASS,
      ...(handle ? { handle } : {}),
      disabled: !isEnabled(),
      // 关掉浏览器原生 DnD：原生拖拽影像由浏览器绘制、DOM 碰不到，只能看到系统默认快照。
      // 改走 fallback 通道后，跟随指针的影像完全由 preview 自建。
      forceFallback: true,
      // Sortable 的 fallback 克隆退化为纯几何载体：脱离文档流且不可见（见 .drag-fallback-hidden）
      fallbackClass: FALLBACK_HIDDEN_CLASS,
      fallbackOnBody: true,
      onStart: event => {
        // 复位动画还没跑完就再次起拖：先把上一轮收干净（影像、动画、上一行的透明态与落定态）。
        // draggingItem 马上要被覆盖，晚一步就找不到上一行了，它会永远停在透明态
        preview.clear();
        cancelFlip(flipTimers);
        preview.begin(event.item);
        // 快照起拖时的子元素顺序与数据顺序（两者同序）：落定时据此把 DOM 顺序换回数据顺序
        const container = resolveTarget();
        originElements = container ? Array.from(container.children) : null;
        originItems = container ? [...readItems()] : null;
        // 起拖时子树里被滚动的元素（面板卡里的横向条带等）：Sortable 一搬 DOM 它们的偏移就被
        // 静默清零，且不派发 scroll —— 消费者感知不到，只能靠我们在搬动后写回（见 scrollOffsets.ts）
        scrollSnapshot = captureScrollOffsets(container);
        moveSnapshot = null;
        dragActive = true;
        // 上一轮若是取消收尾，标志已在 onEnd 里消费掉；这里再兜一次，避免异常路径把它带进来
        dropCancelled = false;
      },
      // 拖拽中的换位：onMove 早于 Sortable 搬 DOM（三处插入路径都在 insertBefore 之前），
      // 此刻缓存的正是「换位前的视觉位置」；onChange 时 DOM 已搬好，据此播过渡。
      // 返回 undefined 表示放行（Sortable 只认 !== false）
      onMove: () => {
        moveSnapshot = capturePositions(resolveTarget(), preview.draggingItem);
      },
      onChange: () => {
        // 换位就是 insertBefore 搬 DOM：被搬卡片的子树失去 box、里面被滚动的元素偏移归零且不发
        // scroll 事件。先把偏移写回再播 FLIP —— 回填只动卡片内部的滚动，不改变卡片自身的矩形，
        // 故不影响 playFlip 的起点/终点判定
        if (scrollSnapshot) restoreScrollOffsets(scrollSnapshot);
        if (moveSnapshot) playFlip(moveSnapshot, animation, flipTimers);
        moveSnapshot = null;
      },
      // 本组合式自持重排：不传 list/modelValue，故 Sortable 不会去动数据，只负责搬 DOM
      onEnd: event => {
        const originalEvent = readOriginalEvent(event);
        const source = originalEvent instanceof MouseEvent ? originalEvent : undefined;
        dragActive = false;
        /**
         * 右键松手视为「取消这次排序」，直接复位。
         *
         * sortable 的松手监听不按 button 过滤（`on(ownerDocument, 'pointerup', _onDrop)`），
         * 故按住左键起拖后再按右键，右键的松手同样会走到这里；若照常落定，用户按右键的意图
         * 就被当成「确认落位」，把拖到一半的顺序直接写回数据。故视为松手但只复位：
         * 把顺序还原成起拖时，不写回数据、也不补派 click。
         * 判定用 `button === 2`（次要键）而非 `!== 0`：pointercancel 的 button 是 -1、
         * touchend 是 0，那两条既有取消路径不该被并进来。
         * 复位后这次「松手」不再解析任何新顺序（见下方 `cancelDrop ? null : …`）：
         * 既不走 DOM 真源，也不走 oldIndex/newIndex 兜底——那两个值都是在复位之前取样的。
         */
        const cancelDrop = source?.button === 2 || dropCancelled;
        dropCancelled = false;
        // 取消路径与正常落定共用同一套收尾：onEnd 由 onContextMenu 补发的合成 pointerup 当场触发
        // （菜单尚未弹出），故 preview.settle 的落回动画能照常启动，影像滑回起拖位置。
        if (cancelDrop) restoreOriginOrder();
        else settleClickAfterDrop(event, originalEvent);
        const { oldIndex, newIndex } = event;
        // 以 DOM 为真源算新顺序；取不到（列表在拖拽期间被增删过）才退回下标运算。
        // 取消（右键复位）时两条都不走：顺序已在上面还原，而 _onDrop 的 oldIndex/newIndex 是在
        // 还原**之前**取样的，拿它做下标运算会把拖到一半的顺序又算回来。
        let next = cancelDrop ? null : resolveNextOrder(resolveTarget(), originElements, originItems);
        if (!cancelDrop && !next && oldIndex != null && newIndex != null && oldIndex !== newIndex) {
          const candidate = [...readItems()];
          const [moved] = candidate.splice(oldIndex, 1);
          if (moved !== undefined) {
            candidate.splice(newIndex, 0, moved);
            next = candidate;
          }
        }
        // 顺序没变就不写回：省一次持久化，也免得平白触发一次重排
        const current = readItems();
        if (next && next.length === current.length && next.every((item, index) => item === current[index])) next = null;

        // 记下此刻的视觉位置：最后一次换位可能还在飞，元素在半路，松手后要接着跑完
        const before = capturePositions(resolveTarget(), event.item);
        // 正常落定不撤销 Sortable 对 DOM 的搬动（右键取消那条路径已在上方主动还原成起拖顺序）。
        // 它搬完的顺序就是用户松手时看到的结果，拉回旧序
        // 会让所有位置动画的起点失真（元素先闪回旧位、再滑回新位）。不拉回还顺带解决了
        // 与宿主 FLIP 的冲突：Vue patch 前后位置一致，TransitionGroup 的位移为 0，
        // 不会插进来再补一段（.song-sort-move 与拖拽动画打架就是这么来的）。
        // Vue 的 keyed diff 面对「DOM 已是目标顺序」是安全的：每次 insertBefore 都以元素
        // 引用或片段锚点为参照，最终序列必然等于新数组。
        if (next) onReorder(next, event);
        // 复位动画的终点等 Vue patch 完再量（nextTick 微任务里 DOM 已是最终顺序，且此帧
        // 尚未绘制）；变位元素未跑完的过渡也在此刻由 playFlip 接上，与影像落位同拍收尾。
        // 落定后的 keyed diff 同样靠 insertBefore 搬 DOM，故滚动偏移在这里再回填一次 ——
        // 与复位动画同拍写回，位置不会在绘制前闪一下
        void nextTick(() => {
          if (scrollSnapshot) restoreScrollOffsets(scrollSnapshot);
          playFlip(before, animation, flipTimers);
          preview.settle(event.item);
        });
      },
    });
    /**
     * 指针监听必须在实例创建**之后**才注册。
     *
     * sortable 的「忽略拖拽后补派的 click」监听是在**模块求值期**挂到 document 捕获层的
     * （sortablejs 源码里那句模块级 `document.addEventListener('click', …, true)`），而模块由
     * 上面那句 `await loadSortable()` 求值。先挂我们的、再加载模块，我们就排在它前面 ——
     * 于是真拖时我们先 stopImmediatePropagation，它的 ignoreNextClick 标志永远没机会被消费，
     * 下一次无关点击会被它吞掉（「偶尔点了没反应」）。反过来先加载模块再挂我们，次序就固定为
     * 「它先放行、我们再吞」，与下面 handleDocumentClick / settleClickAfterDrop 的说明一致。
     * 注意 remove + add 会把监听挪到队尾，故每次重建实例都要重挂一遍才保持这个次序。
     */
    bindPointerWatchers();
  };

  // Sortable 的 disabled 不是响应式选项，外部条件变化时用 option() 同步。
  // 实例不存在时（含模块加载期间）这里什么都不做，也不会丢状态：start() 是在 await 之后
  // 才现读一次 isEnabled() 构造实例的，等待期间的变化由那次现读兜住。
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
