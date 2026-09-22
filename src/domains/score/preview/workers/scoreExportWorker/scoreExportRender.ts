/**
 * 乐谱导出 Worker 的行与表头渲染层。
 *
 * 从 scoreExportWorker.ts 抽出（原 836~1082 行）。
 * 依赖 layout（量测/字体）、fretboard（指板合成）、types；被 pages 单向依赖。
 */

import { drawFretboard } from './scoreExportFretboard';
import {
  computeLineContentHeight,
  fretWindowOfExportChord,
  getCharColumnWidth,
  getLyricsFont,
  LAYOUT,
  parseChordNameTokens,
} from './scoreExportLayout';

import type { ExportChordData, ExportLineItem, RenderSegment, ThemeColors } from './scoreExportTypes';

/** 绘制单行/单段乐谱（含指板图与歌词文字，支持自定义当前行距） */
export function renderScoreLine(
  ctx: OffscreenCanvasRenderingContext2D,
  line: RenderSegment | ExportLineItem,
  startX: number,
  y: number,
  colors: ThemeColors,
  showBarre: boolean,
  lyricsFontWeight: number,
  customRowGap?: number,
  ignoreEmptySpace = false
): { nextY: number; width: number } {
  // contentHeight 从预计算字段读取（RenderSegment），ExportLineItem 则回退到 computeLineContentHeight
  const contentH =
    'contentHeight' in line
      ? (line as RenderSegment).contentHeight
      : computeLineContentHeight(line.chars, line.startChords, line.endChords);

  const hasChords = contentH > LAYOUT.LYRICS_FONT_SIZE;
  const fbHeight = hasChords ? contentH - LAYOUT.CHORD_TO_LYRICS_GAP - LAYOUT.LYRICS_FONT_SIZE : 0;
  const textBaselineY = y + (hasChords ? fbHeight + LAYOUT.CHORD_TO_LYRICS_GAP : 0) + LAYOUT.LYRICS_FONT_SIZE;

  const rowGap = customRowGap !== undefined ? customRowGap : LAYOUT.LINE_ROW_GAP;
  let currentX = startX;

  // 和弦指板图底部对齐：以本行最大品格数的指板底部为基准，使各和弦图底部统一紧贴歌词
  const rowFbBottomY = y + fbHeight;
  const getChordY = (chord: ExportChordData) => {
    // 高度按**实际品窗**算，与行内容高 / 绘制同一来源；否则收紧后位图变矮、Y 仍按原高度上推
    const thisFbHeight = LAYOUT.FRETBOARD_GRID_TOP + fretWindowOfExportChord(chord).drawFretCount * LAYOUT.FRET_HEIGHT;
    return rowFbBottomY - thisFbHeight;
  };

  // 1. 绘制行首边和弦指板图
  if (line.startChords && line.startChords.length > 0) {
    for (let i = 0; i < line.startChords.length; i++) {
      const chord = line.startChords[i]!;
      drawFretboard(ctx, currentX, getChordY(chord), chord, colors, showBarre);
      currentX += LAYOUT.FRETBOARD_WIDTH;
      if (i < line.startChords.length - 1) currentX += LAYOUT.INLINE_CHORD_GAP;
    }
    currentX += LAYOUT.EDGE_CHORD_SECTION_GAP;
  }

  // 2. 绘制每个字符与其上方的和弦指板图
  // 歌词字体、颜色、对齐方式在循环外设置一次，避免每字重复赋值
  const lyricsFont = getLyricsFont(lyricsFontWeight);
  ctx.font = lyricsFont;
  ctx.fillStyle = colors.TEXT;
  ctx.textAlign = 'center';

  for (const item of line.chars) {
    const isSpace = item.char === ' ' || item.char === '　';
    const colW = getCharColumnWidth(item, ignoreEmptySpace);

    // 上方指板图（底部对齐）
    if (item.chord) {
      const fbX = currentX + (colW - LAYOUT.FRETBOARD_WIDTH) / 2;
      drawFretboard(ctx, fbX, getChordY(item.chord), item.chord, colors, showBarre);
      // drawFretboard 可能修改 ctx 状态，恢复歌词绘制所需属性
      ctx.font = lyricsFont;
      ctx.fillStyle = colors.TEXT;
      ctx.textAlign = 'center';
    }

    // 下方歌词文字（紧随指板图下方，竖线小节线以弱化次级色 SUB_TEXT 渲染）
    if (!isSpace) {
      const isBarLine = item.char === '|' || item.char === '｜';
      ctx.fillStyle = isBarLine ? colors.SUB_TEXT : colors.TEXT;
      ctx.fillText(item.char, currentX + colW / 2, textBaselineY);
      if (isBarLine) ctx.fillStyle = colors.TEXT;
    }

    currentX += colW;
  }

  // 3. 绘制行尾边和弦指板图
  if (line.endChords && line.endChords.length > 0) {
    currentX += LAYOUT.EDGE_CHORD_SECTION_GAP;
    for (let i = 0; i < line.endChords.length; i++) {
      const chord = line.endChords[i]!;
      drawFretboard(ctx, currentX, getChordY(chord), chord, colors, showBarre);
      currentX += LAYOUT.FRETBOARD_WIDTH;
      if (i < line.endChords.length - 1) currentX += LAYOUT.INLINE_CHORD_GAP;
    }
  }

  return { nextY: y + contentH + rowGap, width: currentX - startX };
}

/**
 * 表头总高度：singer 非空时在标题下多绘制一行居中副标题（字号 + 上下间距）；
 * 无 singer 时与既有表头高度完全一致（零回归）。
 */
export const getHeaderHeight = (hasSinger: boolean): number =>
  LAYOUT.TITLE_FONT_SIZE +
  LAYOUT.TITLE_TO_META_GAP +
  (hasSinger ? LAYOUT.SINGER_SUBTITLE_FONT_SIZE + LAYOUT.SINGER_SUBTITLE_GAP : 0) +
  LAYOUT.META_FONT_SIZE +
  LAYOUT.HEADER_BOTTOM_GAP;

/** 绘制乐谱表头（标题、可选歌手副标题、元信息行：原调 → Capo → 选调 推导链 + 拍号，竖线分隔，整体居中） */
export function renderHeader(
  ctx: OffscreenCanvasRenderingContext2D,
  title: string,
  singer: string,
  keyText: string,
  capoText: string,
  timeSignatureText: string,
  width: number,
  startY: number,
  colors: ThemeColors
): number {
  let y = startY;
  const centerX = width / 2;

  // 1. 标题（严格以 centerX 为轴水平居中）
  ctx.font = `bold ${LAYOUT.TITLE_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = colors.TEXT;
  ctx.textAlign = 'center';
  ctx.fillText(title, centerX, y + LAYOUT.TITLE_FONT_SIZE);
  y += LAYOUT.TITLE_FONT_SIZE + LAYOUT.TITLE_TO_META_GAP;

  // 1.5 歌手副标题（仅 singer 非空时绘制：标题下居中，弱化色与元信息行一致）
  if (singer) {
    ctx.font = `500 ${LAYOUT.SINGER_SUBTITLE_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = colors.SUB_TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(singer, centerX, y + LAYOUT.SINGER_SUBTITLE_FONT_SIZE);
    y += LAYOUT.SINGER_SUBTITLE_FONT_SIZE + LAYOUT.SINGER_SUBTITLE_GAP;
  }

  // 2. 元信息行（方案 A：原调 → Capo → 选调 推导链 + 拍号，各项之间用竖线分隔，整体水平居中）
  const baselineY = y + LAYOUT.META_FONT_SIZE;
  const metaBaseFont = `500 ${LAYOUT.META_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const metaAccFont = `bold ${LAYOUT.META_ACCIDENTAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const metaLabelFont = `400 ${LAYOUT.META_FONT_SIZE - 2}px system-ui, -apple-system, sans-serif`;
  const META_GAP = 10;

  // 统一的 meta 项结构：弱化标签 + 值 token（升降号上标），所有项同一字重与颜色
  interface MetaItem {
    label: string;
    tokens: { text: string; isAccidental: boolean; width: number }[];
    width: number;
  }

  // 把 keyText（「原调 X 选调 Y」或「选调 Y」）拆为带标签的项，并按 原调 → Capo → 选调 重排
  const buildKeyItem = (segment: string): { label: string; valueText: string } => {
    const trimmed = segment.trim();
    for (const label of ['原调', '选调'] as const)
      if (trimmed.startsWith(label)) return { label, valueText: trimmed.slice(label.length).trim() };

    return { label: '', valueText: trimmed };
  };

  const measureValueTokens = (valueText: string): MetaItem['tokens'] =>
    parseChordNameTokens(valueText).map(token => {
      ctx.font = token.isAccidental ? metaAccFont : metaBaseFont;
      return { ...token, width: ctx.measureText(token.text).width };
    });

  const items: MetaItem[] = [];
  const keyGroups = keyText
    .split(/(?=选调)/)
    .map(s => s.trim())
    .filter(Boolean);

  const originalGroup = keyGroups.find(g => g.startsWith('原调'));
  const playGroup = keyGroups.find(g => g.startsWith('选调')) ?? (originalGroup ? undefined : keyGroups[0]);
  const playParsed = playGroup ? buildKeyItem(playGroup) : null;

  if (originalGroup) {
    const { label, valueText } = buildKeyItem(originalGroup);
    const tokens = measureValueTokens(valueText);
    items.push({ label, tokens, width: tokens.reduce((sum, t) => sum + t.width, 0) });
  }
  {
    const tokens = measureValueTokens(capoText);
    items.push({ label: 'Capo', tokens, width: tokens.reduce((sum, t) => sum + t.width, 0) });
  }
  if (playParsed) {
    const tokens = measureValueTokens(playParsed.valueText);
    items.push({ label: playParsed.label, tokens, width: tokens.reduce((sum, t) => sum + t.width, 0) });
  }
  if (timeSignatureText) {
    const tokens = measureValueTokens(timeSignatureText);
    items.push({ label: '拍号', tokens, width: tokens.reduce((sum, t) => sum + t.width, 0) });
  }

  // 标签宽度计入项宽；项间竖线分隔 = 两侧 META_GAP + 1px 线
  const labelWidthOf = (label: string) => {
    if (!label) return 0;
    ctx.font = metaLabelFont;
    return ctx.measureText(`${label} `).width;
  };
  const totalItemsWidth = items.reduce((sum, it) => sum + labelWidthOf(it.label) + it.width, 0);
  const sepWidth = META_GAP * 2 + 1;
  const metaStartX = centerX - (totalItemsWidth + sepWidth * Math.max(0, items.length - 1)) / 2;

  let curX = metaStartX;
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'left';
  items.forEach((item, itemIdx) => {
    if (itemIdx > 0) {
      // 竖线分隔：与值同基线，高度约一个字号
      ctx.fillStyle = colors.DIVIDER;
      ctx.fillRect(curX + META_GAP, baselineY - LAYOUT.META_FONT_SIZE + 3, 1, LAYOUT.META_FONT_SIZE - 3);
      curX += sepWidth;
      ctx.fillStyle = colors.SUB_TEXT;
    }
    // 标签：弱化小字号
    if (item.label) {
      ctx.font = metaLabelFont;
      ctx.fillText(`${item.label} `, curX, baselineY);
      curX += labelWidthOf(item.label);
    }
    // 值 token：统一次级色；升降号上标
    for (const token of item.tokens) {
      ctx.font = token.isAccidental ? metaAccFont : metaBaseFont;
      ctx.fillStyle = colors.SUB_TEXT;
      const tokenY = token.isAccidental ? baselineY + LAYOUT.META_ACCIDENTAL_SUPERSCRIPT_OFFSET : baselineY;
      ctx.fillText(token.text, curX, tokenY);
      curX += token.width;
    }
  });

  y += LAYOUT.META_FONT_SIZE + LAYOUT.HEADER_BOTTOM_GAP;

  return y;
}
