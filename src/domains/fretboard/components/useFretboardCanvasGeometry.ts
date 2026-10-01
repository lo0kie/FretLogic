import { computed } from 'vue';

import { getChordName } from '@/domains/chord/theory/theory';
import {
  CHORD_NAME_EDGE_PAD,
  computeFretboardLayout,
  nutIsDrawn,
  resolveFretWindow,
} from '@/domains/fretboard/components/renderFretboardCanvas';
import { absoluteFretOffsetOf } from '@/domains/fretboard/model/fretGeometry';

import type { Chord } from '@/domains/chord/types';
import type { RenderFretboardOptions } from '@/domains/fretboard/components/renderFretboardCanvas';
import type { FretboardCanvasPalette } from '@/platform/utils/canvasPalette';
import type { CSSProperties } from 'vue';

/** 本 composable 从宿主 props 里读的字段（宿主 props 是其超集，结构兼容即可，故无需互相 import 类型） */
export interface FretboardCanvasGeometryInput {
  chord: Chord;
  /** 显示倍率（纯 CSS 侧整体缩放，不参与任何几何量） */
  scale: number;
  shorthand: boolean;
  hideChordName: boolean;
  /** 唯一一个**没有默认值**的布尔开关：withDefaults 不会把它收窄成 boolean，故此处必须同为可选 */
  reserveChordName?: boolean;
  hideOpenStringNotes: boolean;
  hideFretNumbers: boolean;
  hideBoldNut: boolean;
  hideBarre: boolean;
  trimEmptyEdgeFrets: boolean;
}

/**
 * 指板画布的几何与绘制选项派生：props + 配色 → 布局、CSS 尺寸、三层共用的渲染选项、无障碍文案。
 *
 * 纯派生，无副作用、无生命周期 —— 因此可以独立于「何时重绘」与「位图从哪来」两件事演进。
 *
 * 三条不变量：
 * ① **品窗是唯一口径**：resolveFretWindow 的产物同时喂给布局、位图键与绘制三处；绝对偏移要用
 *    收紧后的首列右移量（fretWindow.leadTrim），否则「收紧到不再从第 1 品开始」的指法会按未收紧的
 *    窗口误判成画弦枕（绘制侧 drawNut 读的正是同一个绝对偏移）。
 * ② **renderOptions 与 bodyRenderOptions 必须分开**：名字层/品号层直接画进可见画布，得按「实际
 *    可见布局」定位（名字不画则紧凑）；主体层位图按「预留名字位」的几何存档，故只有它多带
 *    reserveChordName。两者恰好对齐，混用会让指板错位或高出一个名字块。
 * ③ **scale 只进 CSS 尺寸**：它不改变任何几何量 —— 想改指板本身的留白/字号，改基准几何，
 *    不要在这里乘系数。
 */
export function useFretboardCanvasGeometry(
  props: Readonly<FretboardCanvasGeometryInput>,
  getThemeColors: () => FretboardCanvasPalette
) {
  /**
   * 实际品窗：开启收紧时按「实际用到的品位范围」收紧（不低于 MIN_FRET_COUNT 列），否则原样取 fretCount。
   *
   * 布局、位图键、绘制三处共用这一份。位图键里放的是**收紧结果**而非开关本身，于是几何本就无空列
   * 可裁的指法在切换开关时 key 不变、位图不重渲 —— 这就是「阻止本身没有空品格的指法重渲染」的落点。
   */
  const fretWindow = computed(() => resolveFretWindow(props.chord, props.trimEmptyEdgeFrets));
  const fretCount = computed(() => fretWindow.value.drawFretCount);

  /** 名字位是否预留：显示名字时必然预留（几何即现状），隐藏名字时由 reserveChordName 显式要求 */
  const reserveName = computed(() => !props.hideChordName || props.reserveChordName);

  /**
   * 本图是否真的画出加粗弦枕（= 显示开关 且 绝对品位偏移落在零品窗口，判据见 nutIsDrawn）。
   *
   * 它进几何：弦枕画了才占位，不画时指板顶（与整张图）上移一条弦枕 —— 空弦标记到指板顶那段留白
   * 因此与上方的同值。
   */
  const boldNut = computed(() =>
    nutIsDrawn(!props.hideBoldNut, absoluteFretOffsetOf(props.chord.fretOffset, fretWindow.value.leadTrim))
  );

  const layout = computed(() =>
    computeFretboardLayout({
      stringCount: props.chord.strings?.length || 6,
      fretCount: fretCount.value,
      showChordName: !props.hideChordName,
      reserveChordName: reserveName.value,
      showOpenStringNotes: !props.hideOpenStringNotes,
      showFretNumbers: !props.hideFretNumbers,
      boldNut: boldNut.value,
    })
  );
  const baseWidth = computed(() => layout.value.width);
  const baseHeight = computed(() => layout.value.height);

  /**
   * 顶部需裁掉的「预留名字位」高度（逻辑px；常规显隐组合下为 名字区块高 - 顶部留白，即名字字号，
   * 也就是名字内容那一段 —— 两套布局的顶部留白同为上下留白（EDGE_PAD），差额只剩名字本身）。
   * 位图按预留布局存档（与显示名字的消费方同源），这里把多出的空白裁掉，视觉与本组件改造前一致。
   */
  const nameReserveH = computed(() => layout.value.nameReserveH);
  /** 可见高度 = 位图高度 − 预留空白；位图/各层坐标系都按它收敛 */
  const visibleHeight = computed(() => baseHeight.value - nameReserveH.value);

  const cssWidth = computed(() => Math.round(baseWidth.value * props.scale));
  const cssHeight = computed(() => Math.round(visibleHeight.value * props.scale));

  const canvasStyle = computed<CSSProperties>(() => ({
    width: `${cssWidth.value}px`,
    height: `${cssHeight.value}px`,
  }));

  const displayChordName = computed(() => getChordName(props.chord, { shorthand: props.shorthand }));
  const ariaLabel = computed(() => `吉他和弦 ${displayChordName.value}`);

  /** 三层共用的渲染选项：合成时按层分别调用，故集中构造一次 */
  const renderOptions = computed<RenderFretboardOptions>(() => ({
    chord: props.chord,
    colors: getThemeColors(),
    shorthand: props.shorthand,
    showChordName: !props.hideChordName,
    // 名字可用宽度（逻辑 px）＝画布宽 − 两侧留白。本组件是**固定尺寸**的缩略图：宽度由布局
    // （弦数 × 品数）定死，picker 三列网格、谱面行内槽位都靠这套等宽几何对齐，不能因为某个名字
    // 太长就把画布加宽（那会顶开整列 / 让歌词字符错位）。故这里把可用宽交给名字层**缩字号贴合**，
    // 而不是像导出 PNG 那样按名字宽度扩画布 —— 两边口径不同是有意的，理由见 CHORD_NAME_EDGE_PAD。
    // 主体层与品号层不读本项（它只影响名字层），与 reserveChordName 一样不参与位图键。
    chordNameMaxWidth: baseWidth.value - CHORD_NAME_EDGE_PAD * 2,
    showOpenStringNotes: !props.hideOpenStringNotes,
    showFretNumbers: !props.hideFretNumbers,
    showBoldNut: !props.hideBoldNut,
    showBarre: !props.hideBarre,
    trimEmptyEdgeFrets: props.trimEmptyEdgeFrets,
  }));

  /**
   * 主体层专用选项：只多一项 reserveChordName（= 预留名字位）。
   *
   * 名字层与品号层**不能**带上它 —— 它们直接画进可见画布，必须按「实际可见布局」定位
   * （名字不画则紧凑），而位图会被裁掉预留段后才贴，故两者恰好对齐。
   */
  const bodyRenderOptions = computed<RenderFretboardOptions>(() => ({
    ...renderOptions.value,
    reserveChordName: reserveName.value,
  }));

  return {
    layout,
    baseWidth,
    baseHeight,
    nameReserveH,
    cssWidth,
    cssHeight,
    canvasStyle,
    ariaLabel,
    renderOptions,
    bodyRenderOptions,
  };
}
