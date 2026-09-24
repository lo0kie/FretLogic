import { computed, toValue } from 'vue';

import { fretboardScaleOf } from '@/domains/fretboard/constants';
import { isZeroFretWindow } from '@/domains/fretboard/model/fretGeometry';
import { INTERACTIVE_GEOMETRY, interactiveGeometryFor } from '@/domains/fretboard/model/interactiveGeometry';

import type { MaybeRefOrGetter } from 'vue';

export interface UseFretboardLayoutOptions {
  stringCount?: MaybeRefOrGetter<number>;
  /**
   * 当前和弦的品位偏移（缺省 0 = 零品窗口）。
   *
   * 只用来选几何实例：偏移窗口不画加粗弦枕，指板顶因此上移一条弦枕（见 interactiveGeometryFor）。
   * 不传即按零品窗口算 —— 与改造前「弦枕无条件预留」的旧口径一致。
   */
  fretOffset?: MaybeRefOrGetter<number>;
}

/** 指板几何布局：根据品位数/琴弦数量推导各尺寸 computed，供 SVG 渲染与坐标换算共用 */
export function useFretboardLayout(fretCount: MaybeRefOrGetter<number>, options: UseFretboardLayoutOptions = {}) {
  const { stringCount = 6, fretOffset = 0 } = options;

  const boardWidth = computed(() => INTERACTIVE_GEOMETRY.boardWidth(toValue(stringCount)));
  const stringXPositions = computed(() =>
    Array.from(
      { length: toValue(stringCount) },
      (_, i) => INTERACTIVE_GEOMETRY.firstStringX + i * INTERACTIVE_GEOMETRY.stringSpacing
    )
  );
  /**
   * 当前这张图的几何：纵向定位（网格顶 / 板之上留白 / 板身高度）一律读它。
   * 横向与字号等与弦枕无关的量仍取单例（弦距、留白、圆点、字号在两张图里完全相同）。
   */
  const geometry = computed(() => interactiveGeometryFor(isZeroFretWindow(toValue(fretOffset))));
  const activeTopOffset = computed(() => geometry.value.gridTop);
  /** 指板 SVG 实际起始位置：板之上留白（名字区 + 空弦区 + 弦枕，几何给出） */
  const contentTopOffset = computed(() => geometry.value.blockAboveBoard);

  // 板身高度 = 名字区 + 网格底 + 底部留白（工厂口径，见 boardBoxHeight）。
  // 名字区在本侧由外层 DOM 块承担、不在 SVG 坐标系内，故不在 boardBoxHeight 里，需在此补上。
  const rawHeight = computed(() => geometry.value.chordNameBlockH + geometry.value.boardBoxHeight(toValue(fretCount)));
  const fretboardScale = computed(() => fretboardScaleOf(toValue(fretCount)));
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

  const boardWidth = INTERACTIVE_GEOMETRY.boardWidth(stringCount);
  const scaleX = boardRect.width / boardWidth;
  const scaleY = boardRect.height / rawHeight;
  const x = (clientX - boardRect.left) / scaleX;
  const y = (clientY - boardRect.top) / scaleY;

  const rawStringFloat = (x - INTERACTIVE_GEOMETRY.firstStringX) / INTERACTIVE_GEOMETRY.stringSpacing;
  const stringIndex = Math.round(rawStringFloat);
  if (stringIndex < 0 || stringIndex >= stringCount) return null;

  // 处于和弦名区域时不触发音符/空弦交互
  if (y < chordNameZoneHeight) return null;

  // SVG 实际从 和弦名区高度 + 空弦区高度 之后才开始，坐标换算需计入额外顶部高度
  const fretAreaY = y - contentTopOffset;
  const fretIndex = fretAreaY > 0 ? Math.floor(fretAreaY / INTERACTIVE_GEOMETRY.fretHeight) + 1 : 0;
  if (fretIndex > fretCount) return null;

  return { stringIndex, fretIndex, rawStringFloat };
}
