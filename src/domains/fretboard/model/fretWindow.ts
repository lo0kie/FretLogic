/**
 * 品窗收紧：由「存储列数 + 占用列号」算出实际品窗。
 *
 * 为什么住在 model/ 而不是渲染器里：这是**纯几何**，与 Canvas/DOM 无关，而导出 Worker 也要用它。
 * 原先它住在 `components/renderFretboardCanvas.ts` —— 一个含 `document.createElement` 的渲染模块，
 * Worker 为了调一个纯函数，把整个 DOM 渲染器拉进了自己的 bundle。口径本身与 Chord 形态解耦
 * （见下方说明），故可下沉到 model 层：本文件对 chord / score 零依赖。
 */
import { clampDrawFretCount, MIN_FRET_COUNT } from '@/domains/fretboard/constants';

import type { BarreEntity } from '@/domains/fretboard/types';

/**
 * 实际绘制的品窗 —— 相对和弦自身存储的 fretCount 窗口收紧后的结果。
 *
 * 口径：`chord.strings[].fret` 是**窗口内相对品位**（`fretOffset` 决定窗口起点，品号层按
 * `fretOffset + f` 标注绝对品位）。所以收紧品窗 = 减列数 **且**把窗口起点一起右移，
 * 二者必须同步，否则圆点与横按梁会落到错误的品上。
 */
export interface FretWindow {
  /** 实际绘制列数（≥ MIN_FRET_COUNT） */
  drawFretCount: number;
  /** 窗口首列相对原窗口右移的列数（= 裁掉的首部空列数）；0 表示首部未裁 */
  leadTrim: number;
}

/**
 * 收紧口径的**唯一实现**：由「存储列数 + 占用列号」算出实际品窗。
 *
 * 与 Chord 的具体形态解耦，是为了让导出 Worker 共用同一份口径 —— 它的和弦是紧凑元组形态
 * （`strings: [fret, preferFlat][]`），若各写一套，两处的收紧规则迟早分叉。
 *
 * 未开启收紧、无占用列、或窗口首末本就无空列时原样返回。列数下限取 MIN_FRET_COUNT：
 * 单列/双列的指板图会显得残缺（如全部音都落在同一品），且与现有品数标尺同口径；
 * 下限只约束**列数**、不阻止起点右移 —— 例：fretCount=5 而只用到第 4 品时，
 * 结果为「起点右移 1 列 + 共 3 列」，即第 2~4 品。
 *
 * **必须显式开启才生效**：`trimEmptyEdgeFrets` 缺省 false，即默认仍画满存储列数（全指板）。
 *
 * 返回值刻意只含 `drawFretCount` / `leadTrim` 两个**几何量**，不含「开关是否真的改变了什么」这类布尔：
 * 消费方的位图键应放这两个数而**不是**开关本身，于是切换开关时只有几何真会变的指法才作废重画
 * —— 这就是「阻止本身没有空品格的指法重渲染」的落点，且不必多出一个恒等于
 * `leadTrim !== 0 || drawFretCount !== storedCount` 的派生字段。
 */
export function resolveFretWindowFromUsed(
  storedFretCount: number,
  usedFrets: Iterable<number>,
  trimEmptyEdgeFrets = false
): FretWindow {
  const storedCount = clampDrawFretCount(storedFretCount);
  const intact: FretWindow = { drawFretCount: storedCount, leadTrim: 0 };
  if (!trimEmptyEdgeFrets) return intact;

  // 占用的窗口内列号（1 基）：空弦(0) / 静音(-1) 不占列
  const used = [...usedFrets].filter(f => f >= 1);
  if (used.length === 0) return intact;

  const first = Math.min(...used);
  const last = Math.max(...used);
  if (first === 1 && last === storedCount) return intact;

  // 起点右移到首个占用列，但不晚于「末列往前数 MIN_FRET_COUNT 列」：下限只抬高起点，
  // 不会让窗口越过最后一个占用列
  // 另受「至少留够 MIN_FRET_COUNT 列」约束：越窗品位（first / last 超出 storedCount）会把
  // leadTrim 推到 storedCount 之外，列数随之跌破下限甚至为负 —— 本函数承诺 ≥ MIN_FRET_COUNT
  const maxLeadTrim = Math.max(0, storedCount - MIN_FRET_COUNT);
  const leadTrim = Math.min(first - 1, Math.max(0, last - MIN_FRET_COUNT), maxLeadTrim);
  const drawFretCount = Math.max(MIN_FRET_COUNT, Math.min(storedCount - leadTrim, last - leadTrim));
  return { drawFretCount, leadTrim };
}

/**
 * 由「和弦的两组几何输入」算实际品窗：**弦品位序列 + 横按列表**。
 *
 * 弦品位由调用方按自己的和弦形态取出（主线程是 `GuitarStringEntity.fret`，导出 Worker 是紧凑
 * 元组的 `[0]`），横按两侧同形 —— 此前主线程的 resolveFretWindow 与 Worker 的
 * fretWindowOfExportChord 各写一遍「弦品位 + 横按品位 ⇒ 占用列」，这条口径就有两个家；
 * 收成一处后，两个入口只剩「按自己的形态取弦品位」这一句不同。
 *
 * 刻意不在此过滤 `f < 1`：resolveFretWindowFromUsed 内部已按 `f >= 1` 过滤
 * （空弦 0 / 静音 -1 不占列），这里再滤一遍只是把同一条规则写第二遍。
 */
export function resolveFretWindowFromParts(
  storedFretCount: number,
  stringFrets: Iterable<number>,
  barres: readonly BarreEntity[] | null | undefined,
  trimEmptyEdgeFrets = false
): FretWindow {
  const used = [...stringFrets];
  for (const b of barres ?? []) used.push(b.fret);
  return resolveFretWindowFromUsed(storedFretCount, used, trimEmptyEdgeFrets);
}
