import { computed, toValue } from 'vue';

import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP, getBoardWidth } from '../constants';

import type { MaybeRefOrGetter } from 'vue';

export interface UseFretboardLayoutOptions {
  scale?: MaybeRefOrGetter<number>;
  extraTopHeight?: MaybeRefOrGetter<number>;
  stringCount?: MaybeRefOrGetter<number>;
}

/** 指板几何布局：根据品位数/缩放/顶部附加高度/琴弦数量推导各尺寸 computed，供 SVG 渲染与坐标换算共用 */
export function useFretboardLayout(
  fretCount: MaybeRefOrGetter<number>,
  optionsOrScale?: MaybeRefOrGetter<number> | UseFretboardLayoutOptions,
  extraTopHeightArg?: MaybeRefOrGetter<number>,
  stringCountArg: MaybeRefOrGetter<number> = 6
) {
  let scale: MaybeRefOrGetter<number> = 1;
  let extraTopHeight: MaybeRefOrGetter<number> = 0;
  let stringCount: MaybeRefOrGetter<number> = stringCountArg;

  if (optionsOrScale != null && typeof optionsOrScale === 'object' && !('value' in optionsOrScale)) {
    if (optionsOrScale.scale !== undefined) scale = optionsOrScale.scale;
    if (optionsOrScale.extraTopHeight !== undefined) extraTopHeight = optionsOrScale.extraTopHeight;
    if (optionsOrScale.stringCount !== undefined) stringCount = optionsOrScale.stringCount;
  } else if (optionsOrScale !== undefined) {
    scale = optionsOrScale as MaybeRefOrGetter<number>;
    if (extraTopHeightArg !== undefined) extraTopHeight = extraTopHeightArg;
  }

  const boardWidth = computed(() => getBoardWidth(toValue(stringCount)));
  const stringXPositions = computed(() =>
    Array.from(
      { length: toValue(stringCount) },
      (_, i) => CANVAS_CONFIG.OFFSET_X_LEFT + i * CANVAS_CONFIG.STRING_SPACING
    )
  );
  const activeTopOffset = computed(() => CANVAS_CONFIG.OFFSET_Y_TOP);
  /** 指板 SVG 实际起始位置：和弦名区 + 空弦区 */
  const contentTopOffset = computed(() => toValue(extraTopHeight) + activeTopOffset.value);

  const rawHeight = computed(
    () => contentTopOffset.value + toValue(fretCount) * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
  );
  const fretboardScale = computed(() => (FRETBOARD_SCALE_MAP[toValue(fretCount)] ?? 1.0) * toValue(scale));
  const realScaledWidth = computed(() => boardWidth.value * fretboardScale.value);
  const realScaledHeight = computed(() => rawHeight.value * fretboardScale.value);

  return {
    boardWidth,
    stringXPositions,
    activeTopOffset,
    contentTopOffset,
    rawHeight,
    fretboardScale,
    realScaledWidth,
    realScaledHeight,
  };
}

export interface FretboardPointCalculationParams {
  clientX: number;
  clientY: number;
  boardRect: { left: number; top: number; width: number; height: number };
  rawHeight: number;
  contentTopOffset: number;
  chordNameZoneHeight: number;
  fretCount: number;
  stringCount?: number;
}

export interface FretboardCanvasPoint {
  stringIndex: number;
  fretIndex: number;
  rawStringFloat: number;
}

/**
 * 把指针事件坐标反算为指板逻辑坐标（弦序号与品位），未命中有效交互区域时返回 null。
 * 纯数学几何计算，无 DOM 引用，便于隔离单元测试。
 */
export function calculateFretboardPoint(params: FretboardPointCalculationParams): FretboardCanvasPoint | null {
  const {
    clientX,
    clientY,
    boardRect,
    rawHeight,
    contentTopOffset,
    chordNameZoneHeight,
    fretCount,
    stringCount = 6,
  } = params;
  if (!boardRect || boardRect.width <= 0 || boardRect.height <= 0 || rawHeight <= 0) return null;

  const boardWidth = getBoardWidth(stringCount);
  const scaleX = boardRect.width / boardWidth;
  const scaleY = boardRect.height / rawHeight;
  const x = (clientX - boardRect.left) / scaleX;
  const y = (clientY - boardRect.top) / scaleY;

  const rawStringFloat = (x - CANVAS_CONFIG.OFFSET_X_LEFT) / CANVAS_CONFIG.STRING_SPACING;
  const stringIndex = Math.round(rawStringFloat);
  if (stringIndex < 0 || stringIndex >= stringCount) return null;

  // 处于和弦名区域时不触发音符/空弦交互
  if (y < chordNameZoneHeight) return null;

  // SVG 实际从 和弦名区高度 + 空弦区高度 之后才开始，坐标换算需计入额外顶部高度
  const fretAreaY = y - contentTopOffset;
  const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;
  if (fretIndex > fretCount) return null;

  return { stringIndex, fretIndex, rawStringFloat };
}
