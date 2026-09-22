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
 * 常量与选项在 constants、DOM 顺序与 FLIP 引擎在 order、拖拽影像在 preview。
 */
import { nextTick, onUnmounted, toValue, watch } from 'vue';

import {
  ACTIVE_CLASS,
  CHOSEN_CLASS,
  DRAG_ACTIVATE_THRESHOLD,
  FALLBACK_HIDDEN_CLASS,
  PLACEHOLDER_CLASS,
} from './constants';
import { cancelFlip, capturePositions, playFlip, resolveNextOrder } from './order';
import { createPreviewController } from './preview';

// Sortable 仅在首次建实例（组件挂载且列表非空）时才需要，动态加载使其脱离首屏闭包
// （SidebarLeft 静态引入 SongSection/GroupSection，静态 import 会把 sortablejs 拖进首屏预算）
import type Sortable from 'sortablejs';
import type { UseSortableListOptions } from './constants';
import type { PositionSnapshot } from './order';
import type { ComponentPublicInstance } from 'vue';

export type { UseSortableListOptions } from './constants';

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
  /** 起拖时的指针位置：onEnd 用于区分「真拖」与「把手上的纯点击」 */
  let dragStartX = 0;
  let dragStartY = 0;

  const handleDocumentClick = (event: MouseEvent) => {
    if (!swallowNextClick) return;
    swallowNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
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
            clientX: source?.clientX ?? 0,
            clientY: source?.clientY ?? 0,
          })
        )
    );
  };

  /**
   * 指针监视（捕获阶段）：宿主在冒泡阶段 stopPropagation 也拿得到按下位置；
   * click 拦截必须同样在捕获层，且晚于 sortable 的全局 click 监听注册（它先放行、我们再吞）。
   */
  const onPointerDown = (event: PointerEvent) => {
    // 兜底：上一轮若因取消路径没等到补派的 click，标志不该带到这一轮
    swallowNextClick = false;
    preview.handlePointerDown(event);
  };

  const bindPointerWatchers = () => {
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    document.addEventListener('pointermove', preview.handlePointerMove, { capture: true, passive: true });
    document.addEventListener('click', handleDocumentClick, { capture: true });
  };

  const unbindPointerWatchers = () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
    document.removeEventListener('pointermove', preview.handlePointerMove, { capture: true });
    document.removeEventListener('click', handleDocumentClick, { capture: true });
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
    moveSnapshot = null;
    preview.clear();
    cancelFlip(flipTimers);
    // 实例销毁后不会再有对应的 click 到来，别让残留的标志误吞下一次无关点击
    swallowNextClick = false;
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
    bindPointerWatchers();
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
        moveSnapshot = capturePositions(resolveTarget(), preview.draggingItem);
      },
      onChange: () => {
        if (moveSnapshot) playFlip(moveSnapshot, animation, flipTimers);
        moveSnapshot = null;
      },
      // 本组合式自持重排：不传 list/modelValue，故 Sortable 不会去动数据，只负责搬 DOM
      onEnd: event => {
        // @types/sortablejs 未声明 originalEvent，运行时存在（原生事件对象）
        const { originalEvent } = event as unknown as { originalEvent?: Event };
        settleClickAfterDrop(event, originalEvent);
        const { oldIndex, newIndex } = event;
        // 以 DOM 为真源算新顺序；取不到（列表在拖拽期间被增删过）才退回下标运算
        let next = resolveNextOrder(resolveTarget(), originElements, originItems);
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
        if (next && next.length === current.length && next.every((item, index) => item === current[index])) next = null;

        // 记下此刻的视觉位置：最后一次换位可能还在飞，元素在半路，松手后要接着跑完
        const before = capturePositions(resolveTarget(), event.item);
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
          playFlip(before, animation, flipTimers);
          preview.settle(event.item);
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
