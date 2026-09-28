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
  /**
   * 可用宽度（px）：给了就按它等比缩小整张图，缺省 / 非正数 = 不缩。
   *
   * 为什么需要它：`FRETBOARD_SCALE_MAP` 那份按品数定档的比例只保证「同一档内不比上一档大」，
   * 它不知道容器有多宽 —— 屏幕窄到装不下整张图时，图的横向溢出**没法靠滚动补救**：
   * 品格区的手势归滑动绘制（由 useFretboardInteraction 的 touchmove 守卫拦下滚动），
   * 手指落在格子里拖不动容器。故缩放在这里按实测宽度再收一道。
   *
   * 口径与 `FRETBOARD_SCALE_MAP` 完全一致：**整张图（含图内各段留白）共乘的同一个倍数**，
   * 不回改任何派生值 —— 它就是 `fretboardScale` 的第二个因子，与按品数那一档相乘。
   * 因此消费方（Fretboard.vue 的 transform、外框尺寸、坐标反算）一律不用改：
   * 前两者读的是 `fretboardScale` / `realScaled*`，坐标反算按 `getBoundingClientRect` 反推缩放，
   * 多乘一个因子自动跟上。
   */
  fitWidth?: MaybeRefOrGetter<number | undefined>;
}

/** 指板几何布局：根据品位数/琴弦数量推导各尺寸 computed，供 SVG 渲染与坐标换算共用 */
export function useFretboardLayout(fretCount: MaybeRefOrGetter<number>, options: UseFretboardLayoutOptions = {}) {
  const { stringCount = 6, fretOffset = 0, fitWidth } = options;

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
  /** 指板 SVG 实际起始位置：板之上留白（名字区 + 空弦区 + 弦枕，几何给出） */
  const contentTopOffset = computed(() => geometry.value.blockAboveBoard);

  // 板身高度 = 名字区 + 网格底 + 底部留白（工厂口径，见 boardBoxHeight）。
  // 名字区在本侧由外层 DOM 块承担、不在 SVG 坐标系内，故不在 boardBoxHeight 里，需在此补上。
  const rawHeight = computed(() => geometry.value.chordNameBlockH + geometry.value.boardBoxHeight(toValue(fretCount)));
  /** 按品数定档的那一档比例（`FRETBOARD_SCALE_MAP`） */
  const baseScale = computed(() => fretboardScaleOf(toValue(fretCount)));
  /**
   * 贴合可用宽度的第二个因子（见 `fitWidth` 的说明）：只缩不放，上限恒为 1。
   * 可用宽度缺省 / 非正数（未测量、SSR）时视为「不缩」——把「还没量到」当成 0 宽会把图缩没。
   */
  const fitScale = computed(() => {
    const available = toValue(fitWidth);
    if (available === undefined || available <= 0) return 1;
    return Math.min(1, available / (boardWidth.value * baseScale.value));
  });
  const fretboardScale = computed(() => baseScale.value * fitScale.value);
  const realScaledWidth = computed(() => boardWidth.value * fretboardScale.value);
  const realScaledHeight = computed(() => rawHeight.value * fretboardScale.value);

  return {
    boardWidth,
    stringXPositions,
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
