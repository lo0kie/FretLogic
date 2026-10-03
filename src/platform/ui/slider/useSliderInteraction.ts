import { computed, ref } from 'vue';

import { useConditionalListener } from '@/platform/composables/useConditionalListener';
import { resolveMultiplier } from '@/platform/ui/slider/BaseSlider.logic';

import type { Ref } from 'vue';

/** 滑块值的内部统一视图（与 BaseSlider.vue 的对外泛型形态在别名处集中断言） */
export type SliderValue = number | [number, number];

interface UseSliderInteractionOptions {
  /** 轨道元素：指针坐标 → 值的换算基准 */
  trackRef: Ref<HTMLDivElement | null>;
  /** 包裹层元素：滚轮步进的焦点判定、拇指聚焦查找 */
  wrapperRef: Ref<HTMLDivElement | null>;
  isDisabled: () => boolean;
  isRange: () => boolean;
  /** 区间模式下两拇指的当前值 */
  getRangeValues: () => [number, number];
  /** 单值模式下的当前值 */
  getSingleValue: () => number;
  /** 当前值（拖拽起始快照与结束比较用） */
  getCurrentValue: () => SliderValue;
  /** 是否处于读数编辑态（编辑中滚轮步进让位） */
  isEditing: () => boolean;
  /** 统一取值更新入口（宿主 updateValue：夹紧/对齐步长/写回模型，commit 时派发 change） */
  applyValue: (v: number | [number, number], commit: boolean) => void;
  /** 任意值对齐步长网格并夹紧到 [min, max]（宿主 snapToStep，依赖 props.min/max/step） */
  snap: (val: number) => number;
  /** 拖拽开始（宿主派发 drag-start） */
  onDragStart: (thumbIndex: number) => void;
  /**
   * 拖拽结束（宿主收尾：lazy 写回 model、派发 drag-end，值有变化时补发 change）。
   * 参数为拖拽起始值快照与结束时的当前值。
   */
  onDragEnd: (startValue: SliderValue, currentValue: SliderValue) => void;
  /** 滚轮步进后浮出数值气泡（宿主的短延时续显逻辑） */
  pulseWheelTooltip: (thumbIdx?: number) => void;
  /** 滚轮步进开关：wheelable 需焦点；wheelOnHover 悬停即生效 */
  wheelable: () => boolean;
  wheelOnHover: () => boolean;
  /** 滚轮方向取反 */
  reverseWheel: () => boolean;
  /** 步长（宿主 props.step；非正数由本 composable 兜底为 1） */
  step: () => number;
  min: () => number;
  max: () => number;
  vertical: () => boolean;
}

/**
 * 滑块交互层：拖拽（全局指针监听）、拇指键盘方向键、滚轮步进、轨道点击跳值。
 * 取值计算（snap/applyValue）与事件派发留在宿主，本 composable 只拥有
 * 「哪种交互、作用在哪个拇指、何时提交」的时序与状态。
 */
export function useSliderInteraction(options: UseSliderInteractionOptions) {
  const {
    trackRef,
    wrapperRef,
    isDisabled,
    isRange,
    getRangeValues,
    getSingleValue,
    getCurrentValue,
    isEditing,
    applyValue,
    snap,
    onDragStart,
    onDragEnd,
    pulseWheelTooltip,
    wheelable,
    wheelOnHover,
    reverseWheel,
    step,
    min,
    max,
    vertical,
  } = options;

  /** 正在拖拽的拇指下标；null = 非拖拽态 */
  const isDragging = ref<number | null>(null);
  /** 拖拽起始值快照：拖拽结束时对比判断值是否变化（决定是否补发 change） */
  const dragStartValue = ref<SliderValue | null>(null);
  /**
   * 发起这次拖拽的 pointerId：move / up 一律只认它。
   *
   * 全局监听是按「是否在拖拽」挂的，而 pointer 事件带 id —— 不认 id 时，触屏上第二根手指
   * 一落到轨道（或拇指）上，它的移动就会被当成在途拖拽的移动，把值拽到第二指的位置；
   * 第二指抬起也会顺手结束第一指的拖拽（值停在半路）。两者都是「多指同时操作时手势串台」。
   */
  let dragPointerId: number | null = null;

  /** 按符号步进（区间模式作用于指定拇指），支持修饰键倍率 */
  const stepBy = (sign: number, e?: { shiftKey?: boolean; altKey?: boolean }, thumbIdx = 0) => {
    // 与 snapToStep 保持一致的步长兜底：非正数 step 一律按 1 走，避免按钮/键盘静默失效
    const stepSize = step() > 0 ? step() : 1;
    const delta = stepSize * sign * resolveMultiplier(e);
    if (isRange()) {
      const [v0, v1] = getRangeValues();
      if (thumbIdx === 0) applyValue([v0 + delta, v1], true);
      else applyValue([v0, v1 + delta], true);
    } else applyValue(getSingleValue() + delta, true);
  };

  /**
   * 拇指键盘：方向键步进（WAI-ARIA 滑块的标准键位）。
   * 另补 Home / End 到两端、PageUp / PageDown 按粗调档跳 —— 这三个键位同样是滑块的标准约定，
   * 此前只能靠方向键一格一格挪。
   */
  const handleRangeKeydown = (e: KeyboardEvent, thumbIdx = 0) => {
    if (isDisabled()) return;
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? min() : max();
      if (isRange()) {
        const [v0, v1] = getRangeValues();
        applyValue(thumbIdx === 0 ? [target, v1] : [v0, target], true);
      } else applyValue(target, true);
      return;
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      stepBy(e.key === 'PageUp' ? 1 : -1, { shiftKey: true }, thumbIdx);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      stepBy(1, e, thumbIdx);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      stepBy(-1, e, thumbIdx);
    }
  };

  /** 指针坐标 → 轨道值：按横向/纵向换算比例并吸附步长 */
  const calculateValueFromPointer = (e: PointerEvent): number => {
    if (!trackRef.value) return min();
    const rect = trackRef.value.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, vertical() ? (rect.bottom - e.clientY) / rect.height : (e.clientX - rect.left) / rect.width)
    );
    const raw = min() + ratio * (max() - min());
    return snap(raw);
  };

  /** 拖拽中：根据指针位置实时更新对应拇指的值（不派发 change） */
  const onPointerMove = (e: PointerEvent) => {
    if (isDragging.value === null) return;
    // 只认发起者的移动：其它指针（第二指）在页面上滑动不得改动本次拖拽的值
    if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
    // 指针在窗口外松手 / 手势被接管时，pointerup 可能收不到而 isDragging 仍为真，
    // 此时后续 move 的 buttons 为 0 —— 不判会「裸移动改值」。借此自愈收尾。
    if (e.buttons === 0) {
      onPointerUp();
      return;
    }
    // 拖拽中途被禁用：立即终止拖拽态，圆点不再跟手（值由 applyValue 的 disabled 守卫兜底）
    if (isDisabled()) {
      onPointerUp();
      return;
    }
    const val = calculateValueFromPointer(e);
    if (isRange()) {
      const [v0, v1] = getRangeValues();
      if (isDragging.value === 0) applyValue([val, v1], false);
      else applyValue([v0, val], false);
    } else applyValue(val, false);
  };

  /**
   * 拖拽结束：派发 drag-end，值有变化时补发 change（全局指针监听由拖拽判据自动摘下）。
   * 不传事件时（供内部自愈调用）无条件收尾；传了事件则只认发起者的抬起。
   */
  const onPointerUp = (e?: PointerEvent) => {
    if (e && dragPointerId !== null && e.pointerId !== dragPointerId) return;
    if (isDragging.value !== null) {
      isDragging.value = null;
      dragPointerId = null;
      onDragEnd(dragStartValue.value ?? getCurrentValue(), getCurrentValue());
    }
  };

  /**
   * 开始拖拽指定拇指：记录起始值与发起指针、派发 drag-start
   *（全局指针监听由拖拽判据自动挂上）。已有在途拖拽时忽略新的按下 —— 第二指不该接管手势。
   */
  const startDrag = (thumbIndex: number, pointerId?: number) => {
    if (isDisabled()) return;
    if (isDragging.value !== null) return;
    dragPointerId = pointerId ?? null;
    isDragging.value = thumbIndex;
    const current = getCurrentValue();
    dragStartValue.value = Array.isArray(current) ? [current[0], current[1]] : current;
    onDragStart(thumbIndex);
  };

  /**
   * 拖拽期间的全局指针监听：判据就是拖拽态本身（`isDragging` 非空），故挂/摘与卸载清理由
   * useConditionalListener 一处负责 —— 原先「按下时挂三条、抬起时摘三条」分散在两个函数里，
   * 改动其一就会静默漏摘（漏摘的表现是松手后指针移动仍在改值）。
   */
  const isPointerDragActive = computed(() => isDragging.value !== null);
  useConditionalListener(window, isPointerDragActive, 'pointermove', onPointerMove);
  useConditionalListener(window, isPointerDragActive, 'pointerup', onPointerUp);
  useConditionalListener(window, isPointerDragActive, 'pointercancel', onPointerUp);

  /** 聚焦指定拇指（单值只有第 0 个；聚焦后滚轮步进立即生效，无需二次点击） */
  const focusThumb = (index: number) => {
    const thumbs = wrapperRef.value?.querySelectorAll<HTMLElement>('[role="slider"]') ?? [];
    thumbs[index]?.focus();
  };

  /** 点击轨道：就近选中拇指、聚焦并直接跳到点击位置 */
  const handleTrackPointerDown = (e: PointerEvent) => {
    if (isDisabled()) return;
    // 只认主键：右键 / 中键不该改值（与 BaseSwitch、useSegmentedDrag 的 `button !== 0` 口径一致）
    if (e.button !== 0) return;
    // 已有在途拖拽时整段忽略：startDrag 虽会早退，但后面的 applyValue 照常执行会把值拽到
    // 第二根手指的位置，正是 startDrag 注释声明要防的行为。
    if (isDragging.value !== null) return;
    const clickedVal = calculateValueFromPointer(e);
    if (isRange()) {
      const [v0, v1] = getRangeValues();
      const d0 = Math.abs(clickedVal - v0);
      const d1 = Math.abs(clickedVal - v1);
      const targetThumb = d0 <= d1 ? 0 : 1;
      startDrag(targetThumb, e.pointerId);
      focusThumb(targetThumb);
      if (targetThumb === 0) applyValue([clickedVal, v1], false);
      else applyValue([v0, clickedVal], false);
    } else {
      startDrag(0, e.pointerId);
      focusThumb(0);
      applyValue(clickedVal, false);
    }
  };

  /**
   * 区间模式下当前聚焦的拇指下标；未聚焦（或单值模式）回落 0 —— 与键盘路径的默认拇指一致。
   * 指针路径（就近选拇指）与键盘路径都会先 focusThumb，故 activeElement 就是「用户正在操作的那个」。
   */
  const focusedThumbIndex = (): number => {
    if (!isRange()) return 0;
    const thumbs = wrapperRef.value?.querySelectorAll<HTMLElement>('[role="slider"]') ?? [];
    return thumbs[1] === document.activeElement ? 1 : 0;
  };

  /** 滚轮 deltaY → 步进方向：上滚加值、下滚减值（修饰键倍率见 resolveMultiplier）；reverseWheel 时方向取反 */
  const applyWheelStep = (e: WheelEvent) => {
    if (e.deltaY === 0) return;
    const direction = e.deltaY > 0 ? -1 : 1;
    // 区间模式必须作用于**聚焦的那个拇指**：此前固定传 0，于是聚焦上限拇指滚动滚轮时动的却是下限，
    // 数值气泡也跟着跳到 0 号拇指上（指针与键盘两条路径本就都会先选拇指）。
    const thumbIdx = focusedThumbIndex();
    stepBy(reverseWheel() ? -direction : direction, e, thumbIdx);
    // 滚轮改值与拖拽一样浮出数值气泡（离散事件，靠短延时续显）；下标一并下发，气泡才落在正确的拇指上
    pulseWheelTooltip(thumbIdx);
  };

  /**
   * 滚轮步进：事件绑定在轨道上，标签/按钮/读数区域滚动不会误触。
   * 两种开启方式（互不影响）：wheelable 需组件持有焦点；wheelOnHover 悬停即生效、无需聚焦。
   */
  const handleWheel = (e: WheelEvent) => {
    if (isDisabled() || isEditing()) return;
    if (wheelOnHover()) {
      e.preventDefault();
      applyWheelStep(e);
      return;
    }
    if (!wheelable() || !wrapperRef.value?.contains(document.activeElement)) return;
    e.preventDefault();
    applyWheelStep(e);
  };

  return {
    isDragging,
    stepBy,
    handleRangeKeydown,
    startDrag,
    focusThumb,
    handleTrackPointerDown,
    handleWheel,
  };
}
