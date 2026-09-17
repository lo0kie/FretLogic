import { nextTick, onBeforeUnmount, ref } from 'vue';

import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { hitDragIndexOf } from '@/platform/ui/segmented/BaseSegmentedControl.logic';

import type { Ref } from 'vue';

/** 选项完整几何（padding-box 局部坐标）：一次测量同时供落点判定（left/right）与预览滑块贴合（width/height/top） */
interface DragItemRect {
  left: number;
  right: number;
  width: number;
  height: number;
  top: number;
  index: number;
}

interface UseSegmentedDragOptions {
  containerRef: Ref<HTMLElement | null>;
  /** 选项 DOM 列表（函数式 ref 收集的原始值，经 toEl 解析） */
  items: Ref<(HTMLElement | null)[]>;
  toEl: (raw: unknown) => HTMLElement | null;
  /** 生效视觉形态：pill / text / tabbed（横向锚点分流见 applyDragMove） */
  visualVariant: () => 'pill' | 'text' | 'tabbed';
  /** 需要滑动指示器（text 形态无滑块、无选中段时无从拖起） */
  showSlider: () => boolean;
  /** 当前选中项下标（拖动只允许从激活块发起） */
  activeIndex: () => number;
  /** 整体禁用（禁用时不进入拖动） */
  isDisabled: () => boolean;
  /** 是否允许拖动滑块切换 */
  isDraggable: () => boolean;
  /** 选项列表（落点判定目标） */
  options: () => { value: unknown; disabled?: boolean }[];
  /** 指示器测量位置（拖动激活时据此快照滑块几何与抓取偏移） */
  indicatorPosition: Ref<{ width: number; height: number; x: number; y: number; opacity: number }>;
  /** 指示器过渡开关：拖动期间暂停（跟手），松手后恢复（贴合动画） */
  transitionEnabled: Ref<boolean>;
  /** 值是否为当前选中 */
  isSelected: (value: unknown) => boolean;
  /** 落定提交：写入模型并派发 change（宿主实现，含 emitValue 收窄） */
  commitSelect: (value: unknown) => void;
  /** 聚焦指定下标的选项按钮 */
  focusItem: (index: number) => void;
  /** 松手后重测指示器位置（宿主实现；拖动几何复位由本 composable 完成） */
  remeasure: () => void;
  /** 下划线几何换算（宿主的 BaseSegmentedControl.logic.resolveIndicatorGeometry） */
  resolveIndicatorGeometry: (item: { width: number; height: number; top: number }) => {
    width: number;
    height: number;
    y: number;
  };
}

/**
 * 拖动滑块切换：仅在激活块按下并拖动时滑块跟手，松手落定到指针所在选项。
 * 位移超过阈值才算拖动（阈值内仍走原生 click 选择）；拖动期间暂停滑块过渡跟手移动、
 * v-model 不变，松手才提交一次 change；落点在禁用项/空白时滑块弹回原选中项。
 * 非激活块按下不进入拖动（见 handlePointerDown 的按下位置判定），仅响应点击选择。
 * 横向锚点按形态分流：pill = 抓取偏移搬运，tabbed = 以指针为几何中心（理由与钳制范围见 applyDragMove）。
 *
 * 时序决策与指针监听归本 composable；指示器测量（updateIndicatorPosition）与选中提交留在宿主。
 */
export function useSegmentedDrag(options: UseSegmentedDragOptions) {
  const {
    containerRef,
    items,
    toEl,
    visualVariant,
    showSlider,
    activeIndex,
    isDisabled,
    isDraggable,
    options: getOptions,
    indicatorPosition,
    transitionEnabled,
    isSelected,
    commitSelect,
    focusItem,
    remeasure,
    resolveIndicatorGeometry,
  } = options;

  const DRAG_THRESHOLD_PX = 4;
  let dragStartX: number | null = null;
  /** 拖动已激活（位移超阈值）：滑块脱离选项测量位置跟手移动 */
  const isDragging = ref(false);
  /** 拖动中滑块的实时位置（indicatorStyle 优先渲染此值）；null = 非拖动态 */
  const dragPosition = ref<{ x: number; width: number; height: number; y: number } | null>(null);
  /** 拖动中指针悬停的选项下标（落点预览高亮），-1 = 无 */
  const dragOverIndex = ref(-1);
  /** 拖动松手后浏览器会向起点按钮补发 click：抑制一次，防止落定选择被 click 的起点选择覆盖 */
  let suppressClick = false;
  /** 拖动激活时快照的滑块几何（尺寸/纵向位置保持选中段，仅横向跟手） */
  let dragSnapshot = { width: 0, height: 0, y: 0 };
  /** 拖动激活时缓存的选项区间（已跳过测量缺失项），供落点判定 hitDragIndex 使用 */
  let dragItemRects: DragItemRect[] = [];
  /** 同上但按**选项下标**稠密存放（缺失项为 undefined）：hitDragIndex 返回的是选项下标，
   *  用它索引上面那个已过滤的数组在有缺失项时会整体错位；滑块几何贴合一律走本数组 */
  let dragRectByIndex: (DragItemRect | undefined)[] = [];
  /** 拖动激活时测量的容器左右内边距（分数级）：仅在选项段实测失败（dragItemRects 为空）时，
   *  作为滑块横向钳制范围的兜底；正常一律取实测选项段的首/末边界（见 applyDragMove） */
  let dragPadding = { left: 0, right: 0 };
  /** 拖动激活时测量的容器边框（分数级）：滑块 left/top 是 absolute 的 padding-box 定位基准，
   *  选项/指针的 border-box 坐标须扣除边框才与滑块同系——否则错开一个边框宽（滑块「超出一点点」的根因） */
  let dragInset = { left: 0, top: 0, right: 0 };
  /** 拖动激活时记录的抓取偏移（指针相对滑块左缘，padding-box 坐标）：**仅 pill 形态使用**，
   *  拖动中 x = 指针 − 偏移，与宽度过渡完全解耦——若按「指针居中于滑块」随目标宽度重算 x，
   *  宽度渐变期间左右缘会先跳后滑（悬停在选项边界抖动时即抽动）；抓取偏移让 x 连续、宽度独立渐变。
   *  tabbed 下划线不用它：下划线宽度最大可达整段，用抓取偏移会让末尾的 tab 永远够不到——
   *  x = 指针 − 偏移 会先撞上 maxX 钳位，指针继续走而下划线停住（即「拖不动」）。
   *  tabbed 一律以指针为几何中心，见 applyDragMove 的 targetX */
  let dragGrabOffset = 0;

  /** 落点判定（纯函数见 BaseSegmentedControl.logic.ts） */
  const hitDragIndex = (localX: number): number => hitDragIndexOf(localX, dragItemRects);

  const cleanupDragListeners = () => {
    window.removeEventListener('pointermove', handleDragPointerMove);
    window.removeEventListener('pointerup', handleDragPointerUp);
    window.removeEventListener('pointercancel', handleDragPointerUp);
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (isDisabled() || !isDraggable() || e.button !== 0) return;
    // text 形态无滑块、无选中段时无从拖起
    if (visualVariant() === 'text' || !showSlider()) return;
    // 仅激活块（滑块覆盖的选中段，滑块本身 pointer-events-none 由底下的按钮承接事件）可发起拖动：
    // 其余段按下一律走原生 click 选择，横向滑过控件不会再被误判为拖动手势
    const activeButton = toEl(items.value[activeIndex()]);
    if (!activeButton?.contains(e.target as Node)) return;
    dragStartX = e.clientX;
    window.addEventListener('pointermove', handleDragPointerMove);
    window.addEventListener('pointerup', handleDragPointerUp);
    window.addEventListener('pointercancel', handleDragPointerUp);
  };

  /** 拖动跟手的一帧计算：处在本帧最后一次指针位置上的落点判定、预览高亮与滑块几何 */
  const applyDragMove = (clientX: number) => {
    if (dragStartX === null) return;
    const container = containerRef.value;
    if (!container) return;

    if (!isDragging.value) {
      if (Math.abs(clientX - dragStartX) < DRAG_THRESHOLD_PX) return;
      if (indicatorPosition.value.opacity === 0) return;
      // 激活拖动：快照当前滑块几何、缓存选项区间与容器内边距
      dragSnapshot = {
        width: indicatorPosition.value.width,
        height: indicatorPosition.value.height,
        y: indicatorPosition.value.y,
      };
      const rect = container.getBoundingClientRect();
      const containerStyle = getComputedStyle(container);
      // 分数级测量 padding 与 border（同指示器边框补偿策略）：选项/指针坐标统一换算到
      // 滑块 left/top 的 padding-box 基准，避免绝对定位滑块与测量值错开一个边框宽
      dragPadding = {
        left: parseFloat(containerStyle.paddingLeft) || 0,
        right: parseFloat(containerStyle.paddingRight) || 0,
      };
      dragInset = {
        left: parseFloat(containerStyle.borderLeftWidth) || 0,
        top: parseFloat(containerStyle.borderTopWidth) || 0,
        right: parseFloat(containerStyle.borderRightWidth) || 0,
      };
      // 抓取偏移：以激活时刻指针位置相对当前滑块左缘记录（若拖满整个拖动期不变，
      // 滑块随指针平移时保持抓取点相对位置自然），后续宽度伸缩不再反过来影响 x
      dragGrabOffset = clientX - rect.left - dragInset.left - indicatorPosition.value.x;
      dragRectByIndex = items.value.map((raw, index) => {
        const item = toEl(raw);
        if (!item) return undefined;
        const r = item.getBoundingClientRect();
        return {
          left: r.left - rect.left - dragInset.left,
          right: r.right - rect.left - dragInset.left,
          width: r.width,
          height: r.height,
          top: r.top - rect.top - dragInset.top,
          index,
        };
      });
      dragItemRects = dragRectByIndex.filter((v): v is DragItemRect => v !== undefined);
      isDragging.value = true;
      transitionEnabled.value = false;
    }

    const rect = container.getBoundingClientRect();
    // 统一到滑块的 padding-box 坐标系：指针的 border-box 坐标扣除左边框
    const localX = clientX - rect.left - dragInset.left;
    // 落点判定：hoverIdx 是「指针所在选项」（禁用项也照常命中，是否可落定另行判定）
    const hoverIdx = hitDragIndex(localX);
    const disabledHover = hoverIdx >= 0 && Boolean(getOptions()[hoverIdx]?.disabled);
    dragOverIndex.value = disabledHover ? -1 : hoverIdx;
    // 滑块几何贴合哪一段：
    // - pill：只贴合「可落定的选项」——禁用项/空白上无预览，滑块保持起始选中段快照；
    // - tabbed 下划线：宽度取「指针所在选项」（禁用段也照取）——下划线长度即它要落进去的那一段的宽度，
    //   指针停在某段中点时下划线与该段严丝合缝；贴着禁用段但不给高亮，正是「此处不可落定」的表达。
    const previewIdx = visualVariant() === 'tabbed' ? hoverIdx : disabledHover ? -1 : hoverIdx;
    const preview = previewIdx >= 0 ? dragRectByIndex[previewIdx] : undefined;
    const geometry = preview ? resolveIndicatorGeometry(preview) : dragSnapshot;
    const width = geometry.width;
    const height = geometry.height;
    const top = geometry.y;
    // 横向落点（两种形态语义不同，勿混用）：
    // - pill 是「按住并搬运一块实体」：保留抓取偏移（按下的点相对滑块恒定），滑块就跟在指针后
    //   grabOffset 处平移，宽度渐变不会反过来把 x 推来推去；
    // - tabbed 是「下划线以指针为几何中心」：x = 指针 − 半宽，指针恒落在下划线中点。这条是**必须**的，
    //   不是手感偏好：下划线宽度最大可达整段，若改用抓取偏移（x = 指针 − 偏移），向右拖时 x 会先撞上
    //   maxX 钳位，此后指针继续走而下划线停住——末尾的 tab 永远够不到，正是「拖不动了」。
    //   以指针为中心时每一段都可达（把指针压到任一段中点即正中该段）；钳制边界取首个/末个选项段的
    //   实测左右缘（见下），与静止态同源，故钳位只会在「下划线已经到位」时生效，不会半路卡住。
    const targetX = visualVariant() === 'tabbed' ? localX - width / 2 : localX - dragGrabOffset;
    // 横向可动范围取**实测选项段**的首/末边界，而不是容器自身的盒子。原因：选项按钮是
    // whitespace-nowrap + min-width:auto，而 tabbed（下划线 Tab）容器带档位宽度（未显式传 width 时
    // 默认 8rem），tab 数量/文字一长就把容器撑破——容器不裁剪、静止下划线也照实测位置画到容器之外。
    // 若仍按容器宽度算 maxX，滑块会被钳死在容器右缘以内：选中末段时静止位置在容器外，一按下就被
    // 拽回容器内，其后末尾几段永远够不到（就是「拖不动」「下划线跳回去」）。按选项实测边界算，则
    // 跟手范围与静止态同源。正常情形（选项段恰好铺满容器 padding-box，pill 的 p-1 亦然）两种取法等价。
    const stripLeft = dragItemRects[0]?.left;
    const stripRight = dragItemRects[dragItemRects.length - 1]?.right;
    // padding-box 可用宽度 = border-box 宽 - 两侧边框（仅在选项段测不到时作为钳制兜底）
    const paddingBoxWidth = rect.width - dragInset.left - dragInset.right;
    const minX = stripLeft ?? dragPadding.left;
    const maxX = Math.max(minX, (stripRight ?? paddingBoxWidth - dragPadding.right) - width);
    dragPosition.value = {
      width,
      height,
      y: top,
      x: Math.min(Math.max(targetX, minX), maxX),
    };
  };

  /**
   * 拖动跟手按帧合帧：pointermove 在高回报率指针（120Hz 以上）下一次移动可派发多帧次，
   * 而每次都要读容器 rect 并写 dragPosition（= 触发一次渲染）。合并到帧末只保留最后一次指针位置，
   * 滑块仍是一帧一动、跟手感不变，帧内多余的计算与渲染则被吃掉。
   */
  const {
    schedule: scheduleDragFrame,
    flush: flushDragFrame,
    cancel: cancelDragFrame,
  } = useRafThrottle<number>(applyDragMove);

  const handleDragPointerMove = (e: PointerEvent) => {
    if (dragStartX === null) return;
    // preventDefault 只能在事件派发期间调用（延后到帧回调里等同于没调）：
    // 超阈值起同步抑制文本选中/原生手势，阈值内的微小移动维持原有「不干预」行为
    if (isDragging.value || Math.abs(e.clientX - dragStartX) >= DRAG_THRESHOLD_PX) e.preventDefault();
    scheduleDragFrame(e.clientX);
  };

  const handleDragPointerUp = (e: PointerEvent) => {
    // 先冲刷待处理帧：起手与松手落在同一帧时（快速拖拽），drag 的激活判定在那帧里，
    // 不冲刷会被当作未拖动而漏掉本次落点提交
    flushDragFrame();
    const wasDragging = isDragging.value;
    cleanupDragListeners();
    dragStartX = null;
    if (!wasDragging) return;

    const container = containerRef.value;
    // 与拖动期同一坐标系：指针的 border-box 坐标须扣掉左边框（见 applyDragMove 的 localX），
    // 否则胶囊形态（容器带 1px 边框）的落点判定会比跟手预览偏移一个边框宽
    const idx = container ? hitDragIndex(e.clientX - container.getBoundingClientRect().left - dragInset.left) : -1;
    const target = idx >= 0 ? getOptions()[idx] : undefined;
    if (target && !target.disabled && !isDisabled() && !isSelected(target.value)) {
      commitSelect(target.value);
      focusItem(idx);
    }
    dragOverIndex.value = -1;
    dragPosition.value = null;
    isDragging.value = false;
    // 恢复过渡：滑块从跟手位置动画贴合到最终选中项（落定提交或弹回）
    transitionEnabled.value = true;
    void nextTick(() => remeasure());
    // 拖动手势吞掉浏览器可能补发的 click（down/up 同元素时 up 后会补发并触发 select，
    // 拖回原位松手会在 closeable 下误触取消选中）。
    // 兜底复位：拖出容器松手时 up 目标在组件外、click 不派发，flag 若不清除会吞掉
    // 用户下一次真实点击（第一次点击不生效的根因）——补发 click 事件任务先于 timer
    // 执行，先到则由 capture 处理器消耗，timer 仅清理未发生场景
    suppressClick = true;
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  };

  /** 捕获阶段拦截拖动松手后浏览器补发的 click，吞掉一次防止触发起点选项的 select */
  const handleClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  };

  onBeforeUnmount(() => {
    cleanupDragListeners();
    cancelDragFrame();
  });

  return {
    isDragging,
    dragPosition,
    dragOverIndex,
    handlePointerDown,
    handleClickCapture,
  };
}
