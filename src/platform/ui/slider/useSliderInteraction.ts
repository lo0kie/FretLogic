import { onBeforeUnmount, ref } from 'vue';

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
  pulseWheelTooltip: () => void;
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

  /** 按符号步进（区间模式作用于指定拇指），支持修饰键倍率 */
  const stepBy = (sign: number, e?: { shiftKey?: boolean; altKey?: boolean }, thumbIdx = 0) => {
    // 与 snapToStep 保持一致的步长兜底：非正数 step 一律按 1 走，避免按钮/键盘静默失效
    const stepSize = step() > 0 ? step() : 1;
    const delta = stepSize * sign * resolveMultiplier(e);
    if (isRange()) {
      const [v0, v1] = getRangeValues();
      if (thumbIdx === 0) applyValue([v0 + delta, v1], true);
      else applyValue([v0, v1 + delta], true);
    } else {
      applyValue(getSingleValue() + delta, true);
    }
  };

  /** 拇指键盘方向键步进 */
  const handleRangeKeydown = (e: KeyboardEvent, thumbIdx = 0) => {
    if (isDisabled()) return;
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
      if (isDragging.value === 0) {
        applyValue([val, v1], false);
      } else {
        applyValue([v0, val], false);
      }
    } else {
      applyValue(val, false);
    }
  };

  /** 拖拽结束：派发 drag-end，值有变化时补发 change，并解绑全局指针监听 */
  const onPointerUp = () => {
    if (isDragging.value !== null) {
      isDragging.value = null;
      onDragEnd(dragStartValue.value ?? getCurrentValue(), getCurrentValue());
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  /** 开始拖拽指定拇指：记录起始值、派发 drag-start 并挂载全局指针监听 */
  const startDrag = (thumbIndex: number) => {
    if (isDisabled()) return;
    isDragging.value = thumbIndex;
    const current = getCurrentValue();
    dragStartValue.value = Array.isArray(current) ? [current[0], current[1]] : current;
    onDragStart(thumbIndex);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  /** 聚焦指定拇指（单值只有第 0 个；聚焦后滚轮步进立即生效，无需二次点击） */
  const focusThumb = (index: number) => {
    const thumbs = wrapperRef.value?.querySelectorAll<HTMLElement>('[role="slider"]') ?? [];
    thumbs[index]?.focus();
  };

  /** 点击轨道：就近选中拇指、聚焦并直接跳到点击位置 */
  const handleTrackPointerDown = (e: PointerEvent) => {
    if (isDisabled()) return;
    const clickedVal = calculateValueFromPointer(e);
    if (isRange()) {
      const [v0, v1] = getRangeValues();
      const d0 = Math.abs(clickedVal - v0);
      const d1 = Math.abs(clickedVal - v1);
      const targetThumb = d0 <= d1 ? 0 : 1;
      startDrag(targetThumb);
      focusThumb(targetThumb);
      if (targetThumb === 0) applyValue([clickedVal, v1], false);
      else applyValue([v0, clickedVal], false);
    } else {
      startDrag(0);
      focusThumb(0);
      applyValue(clickedVal, false);
    }
  };

  /** 滚轮 deltaY → 步进方向：上滚加值、下滚减值（修饰键倍率见 resolveMultiplier）；reverseWheel 时方向取反 */
  const applyWheelStep = (e: WheelEvent) => {
    if (e.deltaY === 0) return;
    const direction = e.deltaY > 0 ? -1 : 1;
    stepBy(reverseWheel() ? -direction : direction, e);
    // 滚轮改值与拖拽一样浮出数值气泡（离散事件，靠短延时续显）
    pulseWheelTooltip();
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

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    // pointercancel 与 startDrag 成对挂载，卸载清理同样不能漏（P1 审计 N 系）
    window.removeEventListener('pointercancel', onPointerUp);
  });

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
