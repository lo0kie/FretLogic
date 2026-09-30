import { nutIsDrawn, resolveFretWindow } from '@/domains/fretboard/components/renderFretboardCanvas';
import { canvasGeometryFor } from '@/domains/fretboard/model/canvasGeometry';
import { absoluteFretOffsetOf } from '@/domains/fretboard/model/fretGeometry';

import type { Chord } from '@/domains/chord/types';

/**
 * 排列区行内指板图卡的**几何算式**：一行离屏时的高度占位靠它算出来。
 *
 * 与另两处的关系：本算式是**画布侧**（`useFretboardCanvasGeometry` → `FretboardCanvas` 的
 * `cssHeight`）的镜像，不是另立一套 —— 图卡高度只有画布这一个来源，占位必须跟着实绘走，
 * 否则离屏行的占位高度与它进入视口后的真实高度对不上（内容总高一路漂、滚动落点算不准）。
 * 和弦选择面板的行占位走同一套口径（`ChordPickerPanel.logic.ts` 的 `getPickerCanvasCssHeight`），
 * 两处的差别只在「哪些显示开关可调」：picker 固定显示名字与空弦标记、且**不收紧品窗**，
 * 排列区这两项都跟着设置走。
 *
 * 为什么占位要按「一行里最高那张卡」而不是平均：行的真实高度就是它最高的那个槽撑出来的
 * （槽是 `self-stretch`，行高 = 各槽内容高的最大值）—— 按平均算会让含高卡的行偏矮。
 */

/**
 * 指板图在排列区里的基准缩放（乘在用户的「和弦缩放」之上）：1.4 档下六弦四品图卡约 101 × 130px，
 * 是「一眼看清指法」与「一行排得下几个和弦」之间的取值。
 *
 * 单一来源：本值既决定实绘（`ChordSlot` 把它交给画布），也决定离屏行的占位高度（见
 * `chordCardCanvasHeightPx`）—— 两处必须是同一个数，故放在本模块由两边共用。
 */
export const BASE_FRETBOARD_SCALE = 1.4;

/**
 * 把「用户的指板缩放（百分比）× 窄屏系数」折算成画布的 `:scale`。
 *
 * 窄屏系数由宿主递进来（见 `ScoreInteractiveArea` 的 `NARROW_VIEW_SCALE`）：字那一侧由容器上的
 * `--score-font-scale` 承担，指板是画布、尺寸走 JS，只能由宿主把同一个系数交给两边。
 */
export const resolveScoreCardScale = (fretboardScalePercent: number, scaleFactor: number): number =>
  (BASE_FRETBOARD_SCALE * fretboardScalePercent * scaleFactor) / 100;

/** 单个和弦的图卡画布高度算式要读的两项外部状态 */
export interface ScoreCardHeightOptions {
  /** 画布的 `:scale`（见 resolveScoreCardScale） */
  scale: number;
  /** 「忽略首末空品格」设置：收紧品窗会减少网格列数，图卡随之变矮 */
  trimEmptyEdgeFrets: boolean;
}

/**
 * 单个和弦在排列区里的**图卡画布高度**（px，容器局部 px）。
 *
 * 与画布同源：品窗、弦枕占位、弦数三项的推导与 `useFretboardCanvasGeometry` 逐项一致，高度取
 * 几何工厂的 `sizeOf`（同一份算式、同一份缓存），故「占位」与「实绘」是同一个数。
 *
 * - 品窗：走 `resolveFretWindow(chord, trimEmptyEdgeFrets)`，即**收紧后**的列数 —— 画布用的也是它
 *   （收紧开关是几何量，会改网格列数）；
 * - 弦枕：画了才占位，判据同绘制侧（`nutIsDrawn`，绝对品位偏移含收紧的首列右移量）。排列区不提供
 *   「隐藏加粗弦枕」开关，故显示开关恒为真；
 * - 弦数：取和弦自身的弦数（缺省 6）。
 *
 * 排列区不隐藏和弦名 / 空弦标记 / 品号，故 `sizeOf` 的其余开关一律走缺省（= 都显示）—— 与
 * `ChordSlot` 传给画布的 props 一致。
 */
export const chordCardCanvasHeightPx = (chord: Chord, options: ScoreCardHeightOptions): number => {
  const { drawFretCount, leadTrim } = resolveFretWindow(chord, options.trimEmptyEdgeFrets);
  const boldNut = nutIsDrawn(true, absoluteFretOffsetOf(chord.fretOffset, leadTrim));
  const { height } = canvasGeometryFor(boldNut).sizeOf({
    stringCount: chord.strings?.length || 6,
    fretCount: drawFretCount,
  });
  return Math.round(height * options.scale);
};
