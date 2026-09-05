/**
 * Web Worker: 纯数据驱动的 OffscreenCanvas 离屏乐谱渲染引擎。
 * 100% 运行在后台 Worker 线程，主线程 0ms 阻塞。
 * 支持绘制完整的吉他指板图、升降号上标和弦名、等粗横按、品丝对齐品号、紧随歌词排版及 A4 满页 Space-Between 垂直均分对齐。
 */
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import {
  parseChordNameTokens as parseChordNameTokensCore,
  type ChordNameToken,
} from '@/domains/score/model/chordNameTokens';

export interface ExportChordData {
  chordName: string;
  strings: [number, boolean][];
  fretCount: number;
  /** 品位/把位偏移量；`capo` 为历史备份兼容名（旧版本导出数据可能仍是 capo） */
  fretOffset?: number;
  /** @deprecated 旧版字段，仅兼容历史备份；新数据请用 fretOffset */
  capo?: number;
  rootStringIndex: number | null;
  barres?: { fret: number; fromString: number; toString: number }[];
}

export interface ExportCharItem {
  char: string;
  chord?: ExportChordData;
}

export interface ExportLineItem {
  lineIdx: number;
  chars: ExportCharItem[];
  startChords?: ExportChordData[];
  endChords?: ExportChordData[];
}

export interface WorkerExportPayload {
  title: string;
  keyText: string;
  capoText: string;
  lines: ExportLineItem[];
  mode: 'normal' | 'a4';
  darkMode: boolean;
  layoutAlign?: 'start' | 'center';
}

export type WorkerExportMessage =
  | { type: 'progress'; percent: number }
  | {
      type: 'complete';
      blobs: Blob[];
      /** a4 模式下每页覆盖的原始歌词行序号（升序去重），供外部按页重组内容；normal 模式为 undefined */ pageLineRanges?: number[][];
    }
  | { type: 'error'; message: string };

/** 输出图固定编码质量（导出质量设置已移除，预览与后续入口统一使用） */
const EXPORT_JPEG_QUALITY = 0.95;

type ThemeColors = (typeof SCORE_EXPORT_CONFIG.THEME)['DARK'] | (typeof SCORE_EXPORT_CONFIG.THEME)['LIGHT'];

/** 模块级 Token 解析缓存，避免同曲目内重复出现的和弦名反复正则分割 */
const tokenCache = new Map<string, ChordNameToken[]>();

/** 带缓存的和弦名分片解析（核心实现见 utils/score/chordNameTokens） */
function parseChordNameTokens(chordName: string): ChordNameToken[] {
  const cached = tokenCache.get(chordName);
  if (cached) return cached;
  const tokens = parseChordNameTokensCore(chordName);
  tokenCache.set(chordName, tokens);
  return tokens;
}

/** 通用分片文字绘制（居中，升降号上标），供 drawFormattedChordName 与 drawFormattedMeta 共用 */
function drawTokenizedText(
  ctx: OffscreenCanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  text: string,
  color: string,
  baseFont: string,
  accFont: string,
  superscriptOffset: number
) {
  const tokens = parseChordNameTokens(text);
  if (tokens.length === 0) return;

  // 预先测量各 Token 宽度以计算居中起始坐标
  let totalW = 0;
  const measured = tokens.map(token => {
    ctx.font = token.isAccidental ? accFont : baseFont;
    const w = ctx.measureText(token.text).width;
    totalW += w;
    return { ...token, width: w };
  });

  // 居中依次绘制各分片
  let curX = centerX - totalW / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  for (const item of measured) {
    ctx.font = item.isAccidental ? accFont : baseFont;
    const y = item.isAccidental ? baselineY + superscriptOffset : baselineY;
    ctx.fillText(item.text, curX, y);
    curX += item.width;
  }
}

/** 绘制带上标升降号（# / b / ♯ / ♭）的和弦名称，严格水平居中对齐 */
function drawFormattedChordName(
  ctx: OffscreenCanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  chordName: string,
  color: string
) {
  drawTokenizedText(
    ctx,
    centerX,
    baselineY,
    chordName,
    color,
    `bold ${SCORE_EXPORT_CONFIG.CHORD_NAME_FONT_SIZE}px system-ui, -apple-system, sans-serif`,
    `bold ${SCORE_EXPORT_CONFIG.ACCIDENTAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`,
    SCORE_EXPORT_CONFIG.ACCIDENTAL_SUPERSCRIPT_OFFSET
  );
}

/** 渲染分段结构（包含首行顶格、续行缩进及子行紧凑行距控制） */
export interface RenderSegment {
  lineIdx: number;
  chars: ExportCharItem[];
  startChords?: ExportChordData[];
  endChords?: ExportChordData[];
  isContinuation: boolean; // 是否为续行（渲染时缩进 WRAPPED_LINE_INDENT）
  isLastSubLine: boolean; // 是否为该物理行的最后一段（决定后方行距是 WRAPPED_LINE_ROW_GAP 还是 LINE_ROW_GAP）
  contentHeight: number; // 预计算内容高度，避免渲染与装箱时重复遍历和弦列表
}

/** 中文排版避头尾：禁止出现在行首的标点符号集合 */
const NO_LINE_START_CHARS = new Set([
  '，',
  '。',
  '！',
  '？',
  '、',
  '；',
  '：',
  '）',
  '》',
  '」',
  '』',
  '”',
  '’',
  '…',
  '—',
  ',',
  '.',
  '!',
  '?',
  ';',
  ':',
  ')',
  ']',
  '}',
  '>',
]);

/** 计算单个字符槽位所占用的总宽度（含半角/全角字符区分与指板图补偿） */
function getCharColumnWidth(item: ExportCharItem): number {
  if (item.char === ' ' || item.char === '　') {
    const spaceW = SCORE_EXPORT_CONFIG.SPACE_CHAR_WIDTH;
    return item.chord
      ? Math.max(SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD, spaceW)
      : spaceW;
  }
  const code = item.char.charCodeAt(0);
  // 半角 ASCII 字符（英文字母、数字、半角标点）：宽度约为全角汉字的 58%，排版更紧凑自然
  const isHalfWidth = code <= 127;
  const charW = isHalfWidth
    ? Math.round(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH * 0.58)
    : SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;

  return item.chord
    ? Math.max(SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD, charW)
    : charW;
}

/** 计算连续边和弦组所占用的总宽度 */
function getChordsGroupWidth(chords?: ExportChordData[]): number {
  if (!chords || chords.length === 0) return 0;
  return (
    chords.length * SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH +
    (chords.length - 1) * SCORE_EXPORT_CONFIG.INLINE_CHORD_GAP +
    SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP
  );
}

/** 根据段的字符列表与边和弦计算纯内容高度（不含行间距）。使用迭代代替 spread + map 避免临时数组分配 */
function computeLineContentHeight(
  chars: ExportCharItem[],
  startChords?: ExportChordData[],
  endChords?: ExportChordData[]
): number {
  let hasChords = false;
  let maxFretCount = 0;

  const accumFret = (c: ExportChordData) => {
    hasChords = true;
    const fc = c.fretCount || 4;
    if (fc > maxFretCount) maxFretCount = fc;
  };

  if (startChords) for (const c of startChords) accumFret(c);
  if (endChords) for (const c of endChords) accumFret(c);
  for (const item of chars) if (item.chord) accumFret(item.chord);

  if (!hasChords) return SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
  const fretCount = Math.max(3, maxFretCount);
  const fbHeight = SCORE_EXPORT_CONFIG.FRETBOARD_GRID_TOP + fretCount * SCORE_EXPORT_CONFIG.FRET_HEIGHT;
  return fbHeight + SCORE_EXPORT_CONFIG.CHORD_TO_LYRICS_GAP + SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
}

/** 将原始歌词行根据最大可用宽度自动切分为软折行段落（含避头尾禁则与孤字控制） */
function wrapScoreLines(lines: ExportLineItem[], maxAvailableWidth: number): RenderSegment[] {
  const allSegments: RenderSegment[] = [];

  for (const line of lines) {
    if (line.chars.length === 0) {
      allSegments.push({
        lineIdx: line.lineIdx,
        chars: [],
        startChords: line.startChords,
        endChords: line.endChords,
        isContinuation: false,
        isLastSubLine: true,
        contentHeight: computeLineContentHeight([], line.startChords, line.endChords),
      });
      continue;
    }

    const lineSegments: RenderSegment[] = [];
    let curChars: ExportCharItem[] = [];
    let isFirstSubLine = true;

    const startChordsW = getChordsGroupWidth(line.startChords);
    let curW = startChordsW;
    const maxWForFirst = maxAvailableWidth;
    const maxWForContinuation = maxAvailableWidth - SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT;

    for (let cIdx = 0; cIdx < line.chars.length; cIdx++) {
      const charItem = line.chars[cIdx]!;
      const charColW = getCharColumnWidth(charItem);
      const maxW = isFirstSubLine ? maxWForFirst : maxWForContinuation;

      const isLastChar = cIdx === line.chars.length - 1;
      const endChordsW = isLastChar ? getChordsGroupWidth(line.endChords) : 0;

      if (curChars.length > 0 && curW + charColW + endChordsW > maxW) {
        // 避头尾规则：如果即将排在新行首位的字符是禁止行首标点，且前一段末尾字符无和弦，则向前回借一字
        let nextInitialChars = [charItem];
        let nextInitialW = charColW;

        if (NO_LINE_START_CHARS.has(charItem.char) && curChars.length > 1) {
          const lastPrev = curChars[curChars.length - 1];
          if (lastPrev && !lastPrev.chord) {
            curChars.pop();
            nextInitialChars = [lastPrev, charItem];
            nextInitialW = getCharColumnWidth(lastPrev) + charColW;
          }
        }

        const segStartChords = isFirstSubLine ? line.startChords : undefined;
        lineSegments.push({
          lineIdx: line.lineIdx,
          chars: curChars,
          startChords: segStartChords,
          isContinuation: !isFirstSubLine,
          isLastSubLine: false,
          contentHeight: computeLineContentHeight(curChars, segStartChords, undefined),
        });
        curChars = nextInitialChars;
        curW = nextInitialW;
        isFirstSubLine = false;
      } else {
        curChars.push(charItem);
        curW += charColW;
      }
    }

    // 孤字控制：若最后一行仅剩 1 个字符且不是唯的一行，尝试从上一段末尾借一个无和弦字符
    if (curChars.length === 1 && lineSegments.length > 0) {
      const prevSeg = lineSegments[lineSegments.length - 1]!;
      if (prevSeg.chars.length > 2) {
        const lastPrev = prevSeg.chars[prevSeg.chars.length - 1];
        if (lastPrev && !lastPrev.chord) {
          prevSeg.chars.pop();
          curChars.unshift(lastPrev);
          prevSeg.contentHeight = computeLineContentHeight(prevSeg.chars, prevSeg.startChords, undefined);
        }
      }
    }

    if (curChars.length > 0) {
      const segStartChords = isFirstSubLine ? line.startChords : undefined;
      lineSegments.push({
        lineIdx: line.lineIdx,
        chars: curChars,
        startChords: segStartChords,
        endChords: line.endChords,
        isContinuation: !isFirstSubLine,
        isLastSubLine: true,
        contentHeight: computeLineContentHeight(curChars, segStartChords, line.endChords),
      });
    } else if (lineSegments.length > 0) {
      const lastSeg = lineSegments[lineSegments.length - 1]!;
      lastSeg.endChords = line.endChords;
      lastSeg.isLastSubLine = true;
      lastSeg.contentHeight = computeLineContentHeight(lastSeg.chars, lastSeg.startChords, line.endChords);
    }

    if (lineSegments.length > 0) {
      lineSegments[lineSegments.length - 1]!.isLastSubLine = true;
    }

    allSegments.push(...lineSegments);
  }

  return allSegments;
}

/** 计算单段乐谱渲染时的水平总占用宽度（包含缩进与边和弦） */
function getSegmentWidth(segment: RenderSegment): number {
  let w = segment.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0;
  if (segment.startChords && segment.startChords.length > 0) {
    w += getChordsGroupWidth(segment.startChords);
  }
  for (const c of segment.chars) {
    w += getCharColumnWidth(c);
  }
  if (segment.endChords && segment.endChords.length > 0) {
    w += getChordsGroupWidth(segment.endChords);
  }
  return w;
}

/** 绘制单个吉他和弦指板图到 Canvas */
function drawFretboard(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  chord: ExportChordData,
  colors: ThemeColors
) {
  const fretCount = Math.max(3, chord.fretCount || 4);
  const stringCount = chord.strings?.length || 6;
  const fbWidth = SCORE_EXPORT_CONFIG.getExportFretboardWidth(stringCount);
  const startStrX = x + SCORE_EXPORT_CONFIG.FRETBOARD_LEFT_PAD;
  const gridTop = y + SCORE_EXPORT_CONFIG.FRETBOARD_GRID_TOP;
  const gridBottom = gridTop + fretCount * SCORE_EXPORT_CONFIG.FRET_HEIGHT;
  const gridRight = startStrX + (stringCount - 1) * SCORE_EXPORT_CONFIG.STRING_SPACING;

  // 1. 和弦名称（顶部加粗居中，升降号采用上标形式；基线与独立指板图渲染器保持一致）
  drawFormattedChordName(
    ctx,
    x + fbWidth / 2,
    y + SCORE_EXPORT_CONFIG.CHORD_NAME_BASELINE_Y,
    chord.chordName,
    colors.TEXT
  );

  // 2. 空弦 / 静音标记（中性色，不使用红色）
  const markerY = y + SCORE_EXPORT_CONFIG.MARKER_CENTER_Y;
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * SCORE_EXPORT_CONFIG.STRING_SPACING;
    const strData = chord.strings[s];
    const fret = strData ? strData[0] : 0;

    if (fret === -1) {
      // ✕ 静音标记（中性灰，不喧宾夺主）
      ctx.strokeStyle = colors.FB_MUTE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS, markerY - SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS);
      ctx.lineTo(sx + SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS, markerY + SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS);
      ctx.moveTo(sx + SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS, markerY - SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS);
      ctx.lineTo(sx - SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS, markerY + SCORE_EXPORT_CONFIG.MUTE_CROSS_RADIUS);
      ctx.stroke();
    } else if (fret === 0) {
      // ○ 空弦标记（独立于按品音符颜色的 FB_OPEN，可单独配置）
      ctx.strokeStyle = colors.FB_OPEN;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx, markerY, SCORE_EXPORT_CONFIG.OPEN_CIRCLE_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 3. 指板网格线（琴弦竖线 + (fretCount + 1) 根品丝）
  ctx.strokeStyle = colors.FB_LINE;
  ctx.lineWidth = 1;

  // 竖线（琴弦）
  for (let s = 0; s < stringCount; s++) {
    const sx = startStrX + s * SCORE_EXPORT_CONFIG.STRING_SPACING;
    ctx.beginPath();
    ctx.moveTo(sx, gridTop);
    ctx.lineTo(sx, gridBottom);
    ctx.stroke();
  }

  // 横线（品格）
  for (let f = 0; f <= fretCount; f++) {
    const fy = gridTop + f * SCORE_EXPORT_CONFIG.FRET_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(startStrX, fy);
    ctx.lineTo(gridRight, fy);
    ctx.stroke();
  }

  // 4. 弦枕（offset 为 0 时绘制）与品号（除首末所有品，对齐品丝）
  const offset = chord.fretOffset ?? chord.capo ?? 0;
  if (offset === 0) {
    // 0 品位偏移即从 1 品起步，绘制加粗枕条
    ctx.fillStyle = colors.FB_NUT;
    ctx.fillRect(
      startStrX - 0.5,
      gridTop - SCORE_EXPORT_CONFIG.NUT_HEIGHT,
      (stringCount - 1) * SCORE_EXPORT_CONFIG.STRING_SPACING + 1,
      SCORE_EXPORT_CONFIG.NUT_HEIGHT
    );
  }

  // 左侧显示除首末（0品与最后一品）的所有品号，严格垂直居中对齐品丝
  // 品号字体在绘制循环外预构造，避免循环内重复字符串拼接
  const capoFont = `bold ${SCORE_EXPORT_CONFIG.CAPO_TEXT_FONT_SIZE}px system-ui, sans-serif`;
  ctx.font = capoFont;
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let f = 1; f < fretCount; f++) {
    const fy = gridTop + f * SCORE_EXPORT_CONFIG.FRET_HEIGHT;
    const fretNumber = offset > 0 ? offset + f : f;
    ctx.fillText(String(fretNumber), startStrX - SCORE_EXPORT_CONFIG.FRET_NUMBER_X_OFFSET, fy);
  }
  ctx.textBaseline = 'alphabetic';

  // 5. 大横按（Barres）——两端带饱满圆角，完全覆盖音符点
  if (chord.barres && chord.barres.length > 0) {
    const barreHalfH = SCORE_EXPORT_CONFIG.BARRE_THICKNESS / 2;
    for (const b of chord.barres) {
      const bx1 = startStrX + b.fromString * SCORE_EXPORT_CONFIG.STRING_SPACING;
      const bx2 = startStrX + b.toString * SCORE_EXPORT_CONFIG.STRING_SPACING;
      const by = gridTop + (b.fret - 0.5) * SCORE_EXPORT_CONFIG.FRET_HEIGHT;
      const minX = Math.min(bx1, bx2) - barreHalfH;
      const w = Math.abs(bx2 - bx1) + SCORE_EXPORT_CONFIG.BARRE_THICKNESS;

      ctx.fillStyle = colors.FB_BARRE;
      ctx.beginPath();
      ctx.roundRect(minX, by - barreHalfH, w, SCORE_EXPORT_CONFIG.BARRE_THICKNESS, barreHalfH);
      ctx.fill();
    }
  }

  // 6. 按弦圆点（Finger Dots）——统一音符色彩，不额外强调主音
  for (let s = 0; s < stringCount; s++) {
    const strData = chord.strings[s];
    const fret = strData ? strData[0] : 0;
    if (fret > 0) {
      const cx = startStrX + s * SCORE_EXPORT_CONFIG.STRING_SPACING;
      const cy = gridTop + (fret - 0.5) * SCORE_EXPORT_CONFIG.FRET_HEIGHT;

      ctx.beginPath();
      ctx.arc(cx, cy, SCORE_EXPORT_CONFIG.DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colors.FB_NOTE;
      ctx.fill();
    }
  }
}

/** 绘制单行/单段乐谱（含指板图与歌词文字，支持自定义当前行距） */
function renderScoreLine(
  ctx: OffscreenCanvasRenderingContext2D,
  line: RenderSegment | ExportLineItem,
  startX: number,
  y: number,
  colors: ThemeColors,
  customRowGap?: number
): { nextY: number; width: number } {
  // contentHeight 从预计算字段读取（RenderSegment），ExportLineItem 则回退到 computeLineContentHeight
  const contentH =
    'contentHeight' in line
      ? (line as RenderSegment).contentHeight
      : computeLineContentHeight(line.chars, line.startChords, line.endChords);

  const hasChords = contentH > SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
  const fbHeight = hasChords
    ? contentH - SCORE_EXPORT_CONFIG.CHORD_TO_LYRICS_GAP - SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE
    : 0;
  const textBaselineY =
    y + (hasChords ? fbHeight + SCORE_EXPORT_CONFIG.CHORD_TO_LYRICS_GAP : 0) + SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;

  const rowGap = customRowGap !== undefined ? customRowGap : SCORE_EXPORT_CONFIG.LINE_ROW_GAP;
  let currentX = startX;

  // 和弦指板图底部对齐：以本行最大品格数的指板底部为基准，使各和弦图底部统一紧贴歌词
  const rowFbBottomY = y + fbHeight;
  const getChordY = (chord: ExportChordData) => {
    const chordFretCount = Math.max(3, chord.fretCount || 4);
    const thisFbHeight = SCORE_EXPORT_CONFIG.FRETBOARD_GRID_TOP + chordFretCount * SCORE_EXPORT_CONFIG.FRET_HEIGHT;
    return rowFbBottomY - thisFbHeight;
  };

  // 1. 绘制行首边和弦指板图
  if (line.startChords && line.startChords.length > 0) {
    for (let i = 0; i < line.startChords.length; i++) {
      const chord = line.startChords[i]!;
      drawFretboard(ctx, currentX, getChordY(chord), chord, colors);
      currentX += SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH;
      if (i < line.startChords.length - 1) {
        currentX += SCORE_EXPORT_CONFIG.INLINE_CHORD_GAP;
      }
    }
    currentX += SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP;
  }

  // 2. 绘制每个字符与其上方的和弦指板图
  // 歌词字体、颜色、对齐方式在循环外设置一次，避免每字重复赋值
  const lyricsFont = `${SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.font = lyricsFont;
  ctx.fillStyle = colors.TEXT;
  ctx.textAlign = 'center';

  for (const item of line.chars) {
    const isSpace = item.char === ' ' || item.char === '　';
    const colW = getCharColumnWidth(item);

    // 上方指板图（底部对齐）
    if (item.chord) {
      const fbX = currentX + (colW - SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH) / 2;
      drawFretboard(ctx, fbX, getChordY(item.chord), item.chord, colors);
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
      if (isBarLine) {
        ctx.fillStyle = colors.TEXT;
      }
    }

    currentX += colW;
  }

  // 3. 绘制行尾边和弦指板图
  if (line.endChords && line.endChords.length > 0) {
    currentX += SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP;
    for (let i = 0; i < line.endChords.length; i++) {
      const chord = line.endChords[i]!;
      drawFretboard(ctx, currentX, getChordY(chord), chord, colors);
      currentX += SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH;
      if (i < line.endChords.length - 1) {
        currentX += SCORE_EXPORT_CONFIG.INLINE_CHORD_GAP;
      }
    }
  }

  return { nextY: y + contentH + rowGap, width: currentX - startX };
}

/** 表头总高度（模块级预计算常量，onmessage 中直接引用，无需每次调用函数） */
const HEADER_HEIGHT =
  SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE +
  SCORE_EXPORT_CONFIG.TITLE_TO_META_GAP +
  SCORE_EXPORT_CONFIG.META_FONT_SIZE +
  SCORE_EXPORT_CONFIG.HEADER_BOTTOM_GAP;

/** 绘制乐谱表头（标题、调号与变调夹，竖线分隔符严格与标题中心对齐，竖线采用弱化淡色） */
function renderHeader(
  ctx: OffscreenCanvasRenderingContext2D,
  title: string,
  keyText: string,
  capoText: string,
  width: number,
  startY: number,
  colors: ThemeColors
): number {
  let y = startY;
  const centerX = width / 2;

  // 1. 标题（严格以 centerX 为轴水平居中）
  ctx.font = `bold ${SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = colors.TEXT;
  ctx.textAlign = 'center';
  ctx.fillText(title, centerX, y + SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE);
  y += SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE + SCORE_EXPORT_CONFIG.TITLE_TO_META_GAP;

  // 2. 元信息行（竖线分隔符居中对齐 centerX，调号向左排布，变调夹向右排布）
  const baselineY = y + SCORE_EXPORT_CONFIG.META_FONT_SIZE;
  const metaBaseFont = `500 ${SCORE_EXPORT_CONFIG.META_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const metaAccFont = `bold ${SCORE_EXPORT_CONFIG.META_ACCIDENTAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const META_GAP = 14;

  // 中央竖线分隔符：严格居中于 centerX，使用淡色（colors.FB_LINE），使视觉与标题中心严密垂直对齐
  ctx.font = metaBaseFont;
  ctx.fillStyle = colors.FB_LINE;
  ctx.textAlign = 'center';
  ctx.fillText('|', centerX, baselineY);

  // 左侧调号：右端对齐至 (centerX - META_GAP)，支持升降号上标
  const keyTokens = parseChordNameTokens(keyText);
  let keyWidth = 0;
  const measuredKeyTokens = keyTokens.map(token => {
    ctx.font = token.isAccidental ? metaAccFont : metaBaseFont;
    const w = ctx.measureText(token.text).width;
    keyWidth += w;
    return { ...token, width: w };
  });

  let curKeyX = centerX - META_GAP - keyWidth;
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'left';
  for (const item of measuredKeyTokens) {
    ctx.font = item.isAccidental ? metaAccFont : metaBaseFont;
    const itemY = item.isAccidental ? baselineY + SCORE_EXPORT_CONFIG.META_ACCIDENTAL_SUPERSCRIPT_OFFSET : baselineY;
    ctx.fillText(item.text, curKeyX, itemY);
    curKeyX += item.width;
  }

  // 右侧变调夹：左端对齐至 (centerX + META_GAP)
  ctx.font = metaBaseFont;
  ctx.fillStyle = colors.SUB_TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(`Capo: ${capoText}`, centerX + META_GAP, baselineY);

  y += SCORE_EXPORT_CONFIG.META_FONT_SIZE + SCORE_EXPORT_CONFIG.HEADER_BOTTOM_GAP;

  return y;
}

if (typeof self !== 'undefined') {
  self.onmessage = async (e: MessageEvent<WorkerExportPayload>) => {
    try {
      const { title, keyText, capoText, lines, mode, darkMode, layoutAlign } = e.data;

      const colors = darkMode ? SCORE_EXPORT_CONFIG.THEME.DARK : SCORE_EXPORT_CONFIG.THEME.LIGHT;
      const blobs: Blob[] = [];
      // a4 模式下每页覆盖的原始歌词行序号；normal 模式不产出
      let pageLineRanges: number[][] | undefined;

      if (mode === 'a4') {
        // ===== A4 分页模式 =====
        const contentHeight = SCORE_EXPORT_CONFIG.A4_HEIGHT - SCORE_EXPORT_CONFIG.PAGE_MARGIN * 2;
        const headerH = HEADER_HEIGHT;
        const availWidth = SCORE_EXPORT_CONFIG.A4_WIDTH - SCORE_EXPORT_CONFIG.PAGE_MARGIN * 2;

        // 1. 超长行软折行
        const allSegments = wrapScoreLines(lines, availWidth);

        // 2. 动态装箱分页：合并 neededGap/actualGap 为单变量，溢出时置零
        // 2. 动态装箱分页：整句歌词跨页断裂保护 + 页首空行优化
        const pages: RenderSegment[][] = [];
        let curPageSegments: RenderSegment[] = [];
        let curPageUsedH: number = headerH;

        for (let i = 0; i < allSegments.length; i++) {
          const seg = allSegments[i]!;

          // 页首空行优化：如果新页尚未放入任何歌词，遇到纯空行直接跳过，避免页首留白
          if (
            curPageSegments.length === 0 &&
            seg.chars.length === 0 &&
            !seg.startChords?.length &&
            !seg.endChords?.length
          ) {
            continue;
          }

          const segContentH = seg.contentHeight;
          const lastSeg = curPageSegments[curPageSegments.length - 1];
          const gap = lastSeg
            ? lastSeg.isLastSubLine
              ? SCORE_EXPORT_CONFIG.LINE_ROW_GAP
              : SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP
            : 0;

          let willOverflow = false;

          // 整句歌词跨页保护：当这是一个原始歌词行的首个分段时，前瞻该原始行所有分段的总高度
          if (!seg.isContinuation && curPageSegments.length > 0) {
            let entireLineH = gap + segContentH;
            for (let j = i + 1; j < allSegments.length; j++) {
              const nextSeg = allSegments[j]!;
              if (nextSeg.lineIdx !== seg.lineIdx) break;
              entireLineH += SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP + nextSeg.contentHeight;
            }
            // 当前页放不下整句，但全新一页放得下 → 提前开新页，保证整句歌词完整留在同一页
            if (curPageUsedH + entireLineH > contentHeight && entireLineH <= contentHeight) {
              willOverflow = true;
            }
          }

          // 常规溢出判定（单段放不下）
          if (!willOverflow && curPageUsedH + gap + segContentH > contentHeight && curPageSegments.length > 0) {
            willOverflow = true;
          }

          if (willOverflow) {
            pages.push(curPageSegments);
            curPageSegments = [];
            curPageUsedH = 0;

            // 新页若遇到纯空行则跳过
            if (seg.chars.length === 0 && !seg.startChords?.length && !seg.endChords?.length) {
              continue;
            }
          }

          const effectiveGap = willOverflow || curPageSegments.length === 0 ? 0 : gap;
          curPageSegments.push(seg);
          curPageUsedH += effectiveGap + segContentH;
        }
        if (curPageSegments.length > 0 || pages.length === 0) {
          pages.push(curPageSegments);
        }

        // 每页覆盖的原始歌词行序号（升序去重）：装箱后按段的 lineIdx 归集，供外部按页重组内容
        pageLineRanges = pages.map(pageSegments => {
          const seen = new Set<number>();
          for (const seg of pageSegments) seen.add(seg.lineIdx);
          return [...seen].sort((a, b) => a - b);
        });

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const pageSegments = pages[pIdx]!;
          const canvasW = SCORE_EXPORT_CONFIG.A4_WIDTH;
          const canvasH = SCORE_EXPORT_CONFIG.A4_HEIGHT;
          const canvas = new OffscreenCanvas(
            canvasW * SCORE_EXPORT_CONFIG.PIXEL_RATIO,
            canvasH * SCORE_EXPORT_CONFIG.PIXEL_RATIO
          );
          const ctx = canvas.getContext('2d')!;
          ctx.scale(SCORE_EXPORT_CONFIG.PIXEL_RATIO, SCORE_EXPORT_CONFIG.PIXEL_RATIO);

          ctx.fillStyle = colors.BG;
          ctx.fillRect(0, 0, canvasW, canvasH);

          let curY: number = SCORE_EXPORT_CONFIG.PAGE_MARGIN;
          if (pIdx === 0) {
            curY = renderHeader(ctx, title, keyText, capoText, canvasW, curY, colors);
          }

          // 合并为单次循环：计算 space-between 参数 + 逐段绘制
          const pageAvailH = canvasH - SCORE_EXPORT_CONFIG.PAGE_MARGIN - curY;
          const isFullPage = pIdx < pages.length - 1;

          let totalContentH = 0;
          let totalWrappedGapsH = 0;
          let majorGapCount = 0;
          for (let i = 0; i < pageSegments.length - 1; i++) {
            const s = pageSegments[i]!;
            totalContentH += s.contentHeight;
            if (s.isLastSubLine) majorGapCount++;
            else totalWrappedGapsH += SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP;
          }
          if (pageSegments.length > 0) totalContentH += pageSegments[pageSegments.length - 1]!.contentHeight;

          let dynamicRowGap: number = SCORE_EXPORT_CONFIG.LINE_ROW_GAP;
          if (isFullPage && majorGapCount > 0) {
            const rawGap = (pageAvailH - totalContentH - totalWrappedGapsH) / majorGapCount;
            // 限制最大膨胀上限为默认行距的 1.35 倍，避免因整句跨页保护导致少行时行距被暴力拉伸至夸张间距
            const maxAllowedGap = SCORE_EXPORT_CONFIG.LINE_ROW_GAP * 1.35;
            dynamicRowGap = Math.min(maxAllowedGap, Math.max(SCORE_EXPORT_CONFIG.LINE_ROW_GAP, rawGap));
          }

          for (let i = 0; i < pageSegments.length; i++) {
            const seg = pageSegments[i]!;
            const isLastInPage = i === pageSegments.length - 1;
            const defaultGap = seg.isLastSubLine ? dynamicRowGap : SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP;
            const rowGap = isLastInPage ? 0 : defaultGap;
            const segW = getSegmentWidth(seg);
            const isCenter = layoutAlign === 'center';
            const startX = isCenter
              ? Math.max(SCORE_EXPORT_CONFIG.PAGE_MARGIN, Math.round((canvasW - segW) / 2)) +
                (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0)
              : SCORE_EXPORT_CONFIG.PAGE_MARGIN + (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0);
            const res = renderScoreLine(ctx, seg, startX, curY, colors, rowGap);
            curY = res.nextY;
          }

          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: EXPORT_JPEG_QUALITY });
          blobs.push(blob);

          self.postMessage({
            type: 'progress',
            percent: Math.round(((pIdx + 1) / pages.length) * 100),
          } as WorkerExportMessage);
        }
      } else {
        // ===== 普通长图模式（画布宽度自适应实际最宽行，左右对称 56px 页边距，彻底消除右侧空白） =====
        const availWidth = SCORE_EXPORT_CONFIG.NORMAL_CONTENT_MAX_WIDTH;
        const allSegments = wrapScoreLines(lines, availWidth);

        // 单次遍历同时计算：最宽段宽度、内容总高、行间距总高
        let maxSegmentW = 0;
        let totalContentH = 0;
        let totalGapsH = 0;
        for (let i = 0; i < allSegments.length; i++) {
          const seg = allSegments[i]!;
          const segW = getSegmentWidth(seg);
          if (segW > maxSegmentW) maxSegmentW = segW;
          totalContentH += seg.contentHeight;
          if (i < allSegments.length - 1) {
            totalGapsH += seg.isLastSubLine
              ? SCORE_EXPORT_CONFIG.LINE_ROW_GAP
              : SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP;
          }
        }

        const headerH = HEADER_HEIGHT;
        const canvasW = Math.max(
          SCORE_EXPORT_CONFIG.NORMAL_CANVAS_MIN_WIDTH,
          Math.round(maxSegmentW + SCORE_EXPORT_CONFIG.PAGE_MARGIN * 2)
        );
        const canvasH =
          SCORE_EXPORT_CONFIG.PAGE_MARGIN + headerH + totalContentH + totalGapsH + SCORE_EXPORT_CONFIG.PAGE_MARGIN;

        const canvas = new OffscreenCanvas(
          canvasW * SCORE_EXPORT_CONFIG.PIXEL_RATIO,
          canvasH * SCORE_EXPORT_CONFIG.PIXEL_RATIO
        );
        const ctx = canvas.getContext('2d')!;
        ctx.scale(SCORE_EXPORT_CONFIG.PIXEL_RATIO, SCORE_EXPORT_CONFIG.PIXEL_RATIO);

        ctx.fillStyle = colors.BG;
        ctx.fillRect(0, 0, canvasW, canvasH);

        let curY: number = SCORE_EXPORT_CONFIG.PAGE_MARGIN;
        curY = renderHeader(ctx, title, keyText, capoText, canvasW, curY, colors);

        for (let i = 0; i < allSegments.length; i++) {
          const seg = allSegments[i]!;
          const isLast = i === allSegments.length - 1;
          const defaultGap = seg.isLastSubLine
            ? SCORE_EXPORT_CONFIG.LINE_ROW_GAP
            : SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP;
          const rowGap = isLast ? 0 : defaultGap;
          const segW = getSegmentWidth(seg);
          const isCenter = layoutAlign === 'center';
          const startX = isCenter
            ? Math.max(SCORE_EXPORT_CONFIG.PAGE_MARGIN, Math.round((canvasW - segW) / 2)) +
              (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0)
            : SCORE_EXPORT_CONFIG.PAGE_MARGIN + (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0);
          const res = renderScoreLine(ctx, seg, startX, curY, colors, rowGap);
          curY = res.nextY;
        }

        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: EXPORT_JPEG_QUALITY });
        blobs.push(blob);

        self.postMessage({ type: 'progress', percent: 100 } as WorkerExportMessage);
      }

      self.postMessage({ type: 'complete', blobs, pageLineRanges } as WorkerExportMessage);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } as WorkerExportMessage);
    }
  };
}

export { getCharColumnWidth, wrapScoreLines };
