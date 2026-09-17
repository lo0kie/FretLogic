/**
 * Web Worker: 纯数据驱动的 OffscreenCanvas 离屏乐谱渲染引擎。
 * 100% 运行在后台 Worker 线程，主线程 0ms 阻塞。
 * 支持绘制完整的吉他指板图、升降号上标和弦名、等粗横按、品丝对齐品号、紧随歌词排版及 A4 满页 Space-Between 垂直均分对齐。
 */
import { parseChordNameTokens as parseChordNameTokensCore } from '@/domains/chord/theory/chordNameTokens';
import { getScorePageSize, SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { drawFooterMark } from '@/domains/score/preview/services/footerOverlay';
import { createLruCache } from '@/platform/utils/lruCache';

import type { ChordNameToken } from '@/domains/chord/theory/chordNameTokens';
import type { FretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import type { ScoreLyricsFontWeight } from '@/platform/types';

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
  /** 请求判别字段：整谱渲染请求（页脚合成为另一类请求，见 ScoreWorkerRequest） */
  kind: 'export';
  title: string;
  /** 歌手（纯展示元数据；非空时表头在标题下绘制居中副标题行） */
  singer?: string;
  keyText: string;
  capoText: string;
  /** 拍号文本（如「拍号 4/4」，'' 表示未设置不绘制；旧 payload 缺省兼容） */
  timeSignatureText?: string;
  lines: ExportLineItem[];
  mode: 'normal' | 'a4' | 'estimate';
  /** 画布配色（单一来源 tokens.scss 的 --fbc-* 变量，由主线程 resolveFretboardCanvasPalette 解析后传入；Worker 无 DOM 不能自取） */
  colors: FretboardCanvasPalette;
  layoutAlign?: 'start' | 'center';
  /** 歌词字号缩放（来自排列和弦配置「字号缩放」，缺省 1 不缩放） */
  fontScale?: number;
  /** 指板图缩放（来自排列和弦配置「和弦缩放」，缺省 1 不缩放） */
  fretboardScale?: number;
  /** 是否绘制大横按（缺省 true；false 时隐藏横按梁，仅保留按弦圆点） */
  showBarre?: boolean;
  /** 忽略无和弦空格：该类空格不占列宽（缺省 false，保持既有排版） */
  ignoreEmptySpace?: boolean;
  /** 歌词字重（缺省 regular 常规） */
  lyricsFontWeight?: ScoreLyricsFontWeight;
  /** 导出 JPEG 压缩质量（0.3~1，缺省 0.95） */
  exportQuality?: number;
  /** 导出页面边距（px，标准档位 窄/标准/宽，缺省跟随 pageMargin） */
  pageMargin?: number;
  /** 导出单页尺寸档位（a4 / a5 / letter，缺省 a4），仅 A4 分页模式生效 */
  pageSize?: string;
}

export type WorkerExportMessage =
  | { type: 'progress'; percent: number }
  | {
      type: 'complete';
      blobs: Blob[];
      /** a4 模式下每页覆盖的原始歌词行序号（升序去重），供外部按页重组内容；normal 模式为 undefined */ pageLineRanges?: number[][];
    }
  | { type: 'error'; message: string };

/**
 * 页脚合成请求：把已渲染的页面图（不含页脚）贴回整页画布后画上页码再编码。
 * 页面栅格与页脚解耦（见 services/footerOverlay），故预览缓存只需保留一份「无页脚」页面：
 * 切换「显示页脚」既不重渲染也不产生第二份缓存条目，导出时再按需合成。
 */
export interface FooterComposePayload {
  kind: 'footer-compose';
  /** 待合成的页面图（image/jpeg，尺寸须与 pageSize 档位的设备像素一致） */
  pages: Blob[];
  /** 各页真实页序号（从 0 起，与 pages 同序）；缺省按数组下标 */
  pageIndexes?: number[];
  /** 单页尺寸档位（a4 / a5 / letter，缺省 a4） */
  pageSize?: string;
  /** 页边距（px，逻辑坐标系；缺省 SCORE_EXPORT_CONFIG.PAGE_MARGIN） */
  pageMargin?: number;
  /** 页码文字色（弱化文字色，取值同导出配色 SUB_TEXT） */
  color: string;
  /** 输出 JPEG 质量（0.3~1，缺省 0.95） */
  exportQuality?: number;
}

/** 渲染线程请求联合：整谱渲染 / 页脚合成（判别字段 kind） */
export type ScoreWorkerRequest = WorkerExportPayload | FooterComposePayload;

/** 输出图固定编码质量（导出质量设置已移除，预览与后续入口统一使用） */
const EXPORT_JPEG_QUALITY = 0.95;

type ThemeColors = FretboardCanvasPalette;

// ---- 布局缩放（来自排列和弦配置：字号缩放 / 和弦缩放，作用于预览与导出图片生成） ----
/** 随「和弦缩放」联动的布局键：指板几何 / 和弦名体系 / 和弦列间距 */
const FRETBOARD_SCALED_KEYS = [
  'FRETBOARD_WIDTH',
  'STRING_SPACING',
  'FRET_HEIGHT',
  'FRETBOARD_GRID_TOP',
  'FRETBOARD_LEFT_PAD',
  'DOT_RADIUS',
  'BARRE_THICKNESS',
  'NUT_HEIGHT',
  'CHORD_NAME_BASELINE_Y',
  'MARKER_CENTER_Y',
  'MUTE_CROSS_RADIUS',
  'OPEN_CIRCLE_RADIUS',
  'FRET_NUMBER_X_OFFSET',
  'CHORD_NAME_FONT_SIZE',
  'ACCIDENTAL_FONT_SIZE',
  'ACCIDENTAL_SUPERSCRIPT_OFFSET',
  'CAPO_TEXT_FONT_SIZE',
  'INLINE_CHORD_GAP',
  'CHORD_COLUMN_EXTRA_PAD',
  'EDGE_CHORD_SECTION_GAP',
  'CHORD_TO_LYRICS_GAP',
] as const;
/** 随「字号缩放」联动的布局键：歌词字号 / 字宽估算 / 行距 / 续行缩进 */
const FONT_SCALED_KEYS = [
  'LYRICS_FONT_SIZE',
  'SPACE_CHAR_WIDTH',
  'REGULAR_CHAR_WIDTH',
  'WRAPPED_LINE_INDENT',
  'WRAPPED_LINE_ROW_GAP',
  'LINE_ROW_GAP',
] as const;

/** 出厂基准值快照（模块加载时采集，每次渲染先重置基准再乘缩放，避免累积漂移） */
const BASE_LAYOUT_VALUES: Record<string, number> = (() => {
  const snapshot: Record<string, number> = {};
  for (const key of [...FRETBOARD_SCALED_KEYS, ...FONT_SCALED_KEYS]) {
    snapshot[key] = SCORE_EXPORT_CONFIG[key];
  }
  return snapshot;
})();
/** getExportFretboardWidth 的出厂实现（闭包字面量，不读可变常量，需单独包装缩放） */
const BASE_GET_EXPORT_FRETBOARD_WIDTH = SCORE_EXPORT_CONFIG.getExportFretboardWidth;

/** 可变视图：SCORE_EXPORT_CONFIG 类型层 readonly（as const），运行时在每次渲染前重算布局键 */
const mutableLayoutConfig = SCORE_EXPORT_CONFIG as unknown as Record<string, number> & {
  getExportFretboardWidth: (stringCount: number) => number;
};

/** 按缩放系数重算布局常量（Worker 每收到渲染消息先调用；表头标题/元信息体系保持不缩放）。
 *  fontScale/fretboardScale 以百分制传入（100 = 100%），此处换算为倍率后乘基准布局值 */
const applyLayoutScales = (fontScale: number, fretboardScale: number): void => {
  const fontFactor = fontScale / 100;
  const fretboardFactor = fretboardScale / 100;
  for (const key of FRETBOARD_SCALED_KEYS) {
    mutableLayoutConfig[key] = BASE_LAYOUT_VALUES[key]! * fretboardFactor;
  }
  for (const key of FONT_SCALED_KEYS) {
    mutableLayoutConfig[key] = BASE_LAYOUT_VALUES[key]! * fontFactor;
  }
  mutableLayoutConfig.getExportFretboardWidth = (stringCount: number) =>
    BASE_GET_EXPORT_FRETBOARD_WIDTH(stringCount) * fretboardFactor;
  // 字体纪元自增：字号类布局键已重算，任何缓存的字体字符串（含弦名 / 升降号 / 品号 / 歌词）就此失效
  fontEpoch++;
};

/**
 * 忽略无和弦空格开关（模块级，每次渲染消息写入）：
 * 开启后此类空格列宽为 0——测量（软折行）与绘制共用 getCharColumnWidth，两处行为天然一致。
 */
let ignoreEmptySpace = false;

/** 字体纪元：applyLayoutScales 每次执行自增，作为字体字符串缓存的失效信号（声明在此以便其函数体引用） */
let fontEpoch = 0;

/** 模块级 Token 解析缓存，避免同曲目内重复出现的和弦名反复正则分割。
 *  上限 1024：Worker 现在跨次渲染常驻，跨曲目累积的分片结果需要兜底回收（此前每次渲完即销毁，无需上限）。
 *  单条仅几十字节，1024 条可忽略不计，足够覆盖一整个乐库的去重和弦名。 */
const tokenCache = createLruCache<ChordNameToken[]>(1024);

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

  // 预先测量各 Token 宽度以计算居中起始坐标；顺带把该 Token 选中的字体一并存下，
  // 绘制阶段直接取用，不再重复做 isAccidental 判定与字体选择
  let totalW = 0;
  const measured: { text: string; isAccidental: boolean; width: number; font: string }[] = [];
  for (const token of tokens) {
    const font = token.isAccidental ? accFont : baseFont;
    ctx.font = font;
    const w = ctx.measureText(token.text).width;
    totalW += w;
    measured.push({ text: token.text, isAccidental: token.isAccidental, width: w, font });
  }

  // 居中依次绘制各分片
  let curX = centerX - totalW / 2;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  for (const item of measured) {
    ctx.font = item.font;
    const y = item.isAccidental ? baselineY + superscriptOffset : baselineY;
    ctx.fillText(item.text, curX, y);
    curX += item.width;
  }
}

/**
 * 字体字符串缓存（按「字体纪元」失效）。
 *
 * 字体串里只有 SCORE_EXPORT_CONFIG 的字号参与拼接，而这些字号仅在 applyLayoutScales 执行时变化；
 * 该方法在每条渲染消息开头都会调用一次（缩放不变时写入的是同样的值），因此在其中自增纪元，
 * 由这里按纪元重建缓存即可。收益集中在高频路径：drawTokenizedText / measureChordNameWidth 里
 * 每个和弦名的每个分片都要取一次字体，缓存后不再重复拼模板串、不再产生短命字符串。
 *
 * 注：表头（标题 / 歌手 / 元信息）字体不随本缓存 —— 它们每次 renderHeader 只构造一次、
 * 不在分片循环内，缓存收益可忽略，保持就地构造更直观。
 */
let fontsEpoch = -1;
const fontCache = {
  chordNameBase: '',
  chordNameAccidental: '',
  capo: '',
};

/** 取当前纪元的字体集（纪元未变则直接复用缓存对象） */
const refreshFonts = () => {
  if (fontsEpoch === fontEpoch) return fontCache;
  fontCache.chordNameBase = `bold ${SCORE_EXPORT_CONFIG.CHORD_NAME_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  fontCache.chordNameAccidental = `bold ${SCORE_EXPORT_CONFIG.ACCIDENTAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  fontCache.capo = `bold ${SCORE_EXPORT_CONFIG.CAPO_TEXT_FONT_SIZE}px system-ui, sans-serif`;
  fontsEpoch = fontEpoch;
  return fontCache;
};

/** 和弦名正文字体（绘制与测量共用同一来源，避免两处字号漂移） */
const chordNameBaseFont = (): string => refreshFonts().chordNameBase;

/** 和弦名上标升降号字体（同上） */
const chordNameAccidentalFont = (): string => refreshFonts().chordNameAccidental;

/** 歌词字体缓存：字号随「字号缩放」变化（纪元），字重随导出参数变化，故按二者联合记忆 */
let lyricsFontKey = '';
let lyricsFontValue = '';
const getLyricsFont = (weight: number): string => {
  const key = `${fontEpoch}:${weight}`;
  if (key !== lyricsFontKey) {
    lyricsFontKey = key;
    lyricsFontValue = `${weight} ${SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  }
  return lyricsFontValue;
};

/** 量出和弦名分片后的总宽度（含上标升降号）：供指板位图留白与居中绘制共用 */
function measureChordNameWidth(ctx: OffscreenCanvasRenderingContext2D, chordName: string): number {
  let total = 0;
  for (const token of parseChordNameTokens(chordName)) {
    ctx.font = token.isAccidental ? chordNameAccidentalFont() : chordNameBaseFont();
    total += ctx.measureText(token.text).width;
  }
  return total;
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
    chordNameBaseFont(),
    chordNameAccidentalFont(),
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
  width: number; // 预计算水平总宽（含续行缩进 / 段首段尾和弦组），避免渲染与装箱时重复遍历字符算列宽
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
  // 下一行是排版标点常量而非 Tailwind 类名，important 位置检查在此为误报
  // eslint-disable-next-line better-tailwindcss/enforce-consistent-important-position
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
    // 忽略无和弦空格：不占列宽（挂和弦的空格仍需占位以承载指板图）
    if (!item.chord && ignoreEmptySpace) return 0;
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
        width: getChordsGroupWidth(line.startChords) + getChordsGroupWidth(line.endChords),
      });
      continue;
    }

    const lineSegments: RenderSegment[] = [];
    let curChars: ExportCharItem[] = [];
    let isFirstSubLine = true;

    const startChordsW = getChordsGroupWidth(line.startChords);
    // curW = 当前段的水平占用：首行含段首和弦组宽度，续行不含缩进（缩进在段落入列时补上，
    // 与渲染侧「续行缩进 + 字符列宽 + 边和弦」的口径一致），随字符入段同步累加，
    // 因此段落宽度无需在渲染阶段再遍历一遍 chars 重算。
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
            const borrowedW = getCharColumnWidth(lastPrev);
            curW -= borrowedW; // 回借给下一段的字符不再计入本段宽度
            nextInitialChars = [lastPrev, charItem];
            nextInitialW = borrowedW + charColW;
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
          width: curW + (isFirstSubLine ? 0 : SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT),
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
          const borrowedW = getCharColumnWidth(lastPrev);
          prevSeg.width -= borrowedW; // 与避头尾回借同理：宽度随字符一起转移
          curW += borrowedW;
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
        width:
          curW + (isFirstSubLine ? 0 : SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT) + getChordsGroupWidth(line.endChords),
      });
    } else if (lineSegments.length > 0) {
      const lastSeg = lineSegments[lineSegments.length - 1]!;
      lastSeg.endChords = line.endChords;
      lastSeg.isLastSubLine = true;
      lastSeg.contentHeight = computeLineContentHeight(lastSeg.chars, lastSeg.startChords, line.endChords);
      lastSeg.width += getChordsGroupWidth(line.endChords);
    }

    if (lineSegments.length > 0) {
      lineSegments[lineSegments.length - 1]!.isLastSubLine = true;
    }

    allSegments.push(...lineSegments);
  }

  return allSegments;
}

/**
 * 指板位图合成缓存（Worker 内，随 Worker 实例常驻）。
 *
 * 同一份指板状态（和弦名 / 弦位 / 品数 / 把位 / 横按）在一首歌里通常重复出现几十次，
 * 每次重复都走一遍完整矢量绘制（网格 10+ 条线、逐弦标记、圆点、横按圆角矩形、
 * 和弦名逐分片测量 + 绘制）是纯重复劳动。改为：首次矢量光栅化成一张离屏位图，
 * 其余出现位置直接 drawImage 合成 —— 位图数量≈不同指板状态数（十几张），
 * 而绘制次数是它的数倍，页数越多、和弦重复越多，收益越大。
 *
 * 位图自带四周留白（和弦名可能比指板框更宽、品号向左侧伸出），合成时按各条目自身的
 * 留白偏移回贴；位图与页面同用 PIXEL_RATIO 超采样且 1:1 贴图，视觉结果与逐次矢量绘制等价。
 */
interface FretboardRaster {
  /** 光栅化结果（设备像素） */
  canvas: OffscreenCanvas;
  /** 位图逻辑尺寸（含留白）：合成时按此尺寸贴图，源与目标同为整设备像素，不重采样 */
  width: number;
  height: number;
  /** 内容原点（即矢量绘制时的 x / y）相对位图左上角的留白（逻辑 px） */
  padX: number;
  padY: number;
}

/** 位图条数上限：一首歌的不同指板状态通常十几个，64 条足够覆盖并留跨曲余量 */
const FRETBOARD_RASTER_LIMIT = 64;

/**
 * 渲染线程自己的指板位图实例，与主线程 FretboardCanvas.vue 的 '指板位图' 缓存**互不相干**：
 * 那边存的是不含和弦名/品号的主体层（固定参考分辨率，显示时缩放），这边存的是含和弦名与品号的
 * 整条光栅（键含 chordName / fretOffset / 缩放后几何，与页面 PIXEL_RATIO 1:1 贴图）。
 * 粒度与分辨率契约都不同，跨线程也只能传位图副本（transfer 会 detach 主线程那份），
 * 故同一指板在此各光栅化一次是既定设计，不要试图让两边共用一条缓存。
 */
const fretboardRasterCache = createLruCache<FretboardRaster>(FRETBOARD_RASTER_LIMIT, {
  // OffscreenCanvas 没有 close()：归零尺寸即可让底层缓冲当场归还，不必等 GC
  onEvict: (_, raster) => {
    raster.canvas.width = 0;
    raster.canvas.height = 0;
  },
});

/** 位图样式纪元：主题配色 + 指板缩放后的几何常量。变化即整体清空，不留旧样式位图占坑 */
let fretboardStyleKey = '';

/** 计算当前样式纪元：取参与指板绘制的全部配色与（已按缩放重算过的）几何常量 */
function computeFretboardStyleKey(colors: ThemeColors): string {
  const c = SCORE_EXPORT_CONFIG;
  return [
    c.FRETBOARD_LEFT_PAD,
    c.FRETBOARD_GRID_TOP,
    c.FRET_HEIGHT,
    c.STRING_SPACING,
    c.FRETBOARD_WIDTH,
    // 指板框宽度是函数（随缩放重算），取一个代表值入键，保证它变化时纪元也跟着变
    c.getExportFretboardWidth(6),
    c.NUT_HEIGHT,
    c.DOT_RADIUS,
    c.BARRE_THICKNESS,
    c.MARKER_CENTER_Y,
    c.MUTE_CROSS_RADIUS,
    c.OPEN_CIRCLE_RADIUS,
    c.CHORD_NAME_BASELINE_Y,
    c.CHORD_NAME_FONT_SIZE,
    c.ACCIDENTAL_FONT_SIZE,
    c.ACCIDENTAL_SUPERSCRIPT_OFFSET,
    c.CAPO_TEXT_FONT_SIZE,
    c.FRET_NUMBER_X_OFFSET,
    colors.TEXT,
    colors.SUB_TEXT,
    colors.FB_LINE,
    colors.FB_NUT,
    colors.FB_NOTE,
    colors.FB_OPEN,
    colors.FB_BARRE,
    colors.FB_MUTE,
  ].join('|');
}

/** 指板位图键：决定位图内容的全部输入（主题与缩放维度由 fretboardStyleKey 承担） */
function buildChordRasterKey(chord: ExportChordData, showBarre: boolean): string {
  const strings = chord.strings ?? [];
  // 弦位只需 fret 值：弦数据的第 2 个布尔位不参与绘制（导出图统一音符色，不区分主音）
  let fretSig = '';
  for (const s of strings) fretSig += `${s ? s[0] : 0},`;
  let barreSig = '';
  if (chord.barres) for (const b of chord.barres) barreSig += `${b.fret}:${b.fromString}-${b.toString},`;
  // 品数归一化到绘制实际使用的值：fretCount 3 与 0/1/2 画出来完全一样，不该各占一条
  const fretCount = Math.max(3, chord.fretCount || 4);
  const offset = chord.fretOffset ?? chord.capo ?? 0;
  return `${chord.chordName}|${strings.length}|${fretCount}|${offset}|${fretSig}|${barreSig}|${showBarre ? 1 : 0}`;
}

/** 光栅化一张指板位图（ctx 仅用于测量和弦名宽度，measureText 不受 ctx 变换影响） */
function createFretboardRaster(
  ctx: OffscreenCanvasRenderingContext2D,
  chord: ExportChordData,
  colors: ThemeColors,
  showBarre: boolean
): FretboardRaster {
  const fretCount = Math.max(3, chord.fretCount || 4);
  const stringCount = chord.strings?.length || 6;
  const fbWidth = SCORE_EXPORT_CONFIG.getExportFretboardWidth(stringCount);
  // 内容高度口径与 computeLineContentHeight 一致：网格顶部偏移 + 品数 × 品高
  const contentH = SCORE_EXPORT_CONFIG.FRETBOARD_GRID_TOP + fretCount * SCORE_EXPORT_CONFIG.FRET_HEIGHT;

  // 上留白：和弦名正文基线与上标升降号基线各上推一个字号，取更靠上者；不越顶时留 1px 抗锯齿余量
  const nameTop = Math.min(
    SCORE_EXPORT_CONFIG.CHORD_NAME_BASELINE_Y - SCORE_EXPORT_CONFIG.CHORD_NAME_FONT_SIZE,
    SCORE_EXPORT_CONFIG.CHORD_NAME_BASELINE_Y +
      SCORE_EXPORT_CONFIG.ACCIDENTAL_SUPERSCRIPT_OFFSET -
      SCORE_EXPORT_CONFIG.ACCIDENTAL_FONT_SIZE
  );
  const padTop = Math.ceil(Math.max(0, -nameTop)) + 1;

  // 左右留白：和弦名比指板框宽时两侧同时溢出（长名 / 多扩展音 / 斜杠低音），留白不足会被裁掉；
  // 溢出量的一半各归一侧，另加 2px 抗锯齿余量。左侧下限取 FRETBOARD_LEFT_PAD
  // —— 品号是右对齐在首弦左侧的，已由该留白容纳。
  const nameW = measureChordNameWidth(ctx, chord.chordName);
  const padX = Math.max(SCORE_EXPORT_CONFIG.FRETBOARD_LEFT_PAD, Math.ceil(Math.max(0, nameW - fbWidth) / 2) + 2);

  const width = Math.ceil(fbWidth) + padX * 2;
  // 下边只到网格底（无内容低于网格），留 1px 抗锯齿余量即可
  const height = Math.ceil(contentH) + padTop + 1;
  const deviceW = Math.ceil(width * SCORE_EXPORT_CONFIG.PIXEL_RATIO);
  const deviceH = Math.ceil(height * SCORE_EXPORT_CONFIG.PIXEL_RATIO);

  const canvas = new OffscreenCanvas(deviceW, deviceH);
  const rasterCtx = canvas.getContext('2d')!;
  rasterCtx.setTransform(SCORE_EXPORT_CONFIG.PIXEL_RATIO, 0, 0, SCORE_EXPORT_CONFIG.PIXEL_RATIO, 0, 0);
  // 内容原点平移到留白内：此后 drawFretboardVector 的 (0,0) 即矢量绘制时的 (x,y)
  rasterCtx.translate(padX, padTop);
  drawFretboardVector(rasterCtx, 0, 0, chord, colors, showBarre);

  // 逻辑尺寸按设备像素反推（deviceW / RATIO），保证合成时源与目标同为整设备像素
  return {
    canvas,
    width: deviceW / SCORE_EXPORT_CONFIG.PIXEL_RATIO,
    height: deviceH / SCORE_EXPORT_CONFIG.PIXEL_RATIO,
    padX,
    padY: padTop,
  };
}

/** 绘制单个吉他和弦指板图到 Canvas：命中位图缓存直接合成，未命中先光栅化再合成 */
function drawFretboard(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  chord: ExportChordData,
  colors: ThemeColors,
  showBarre: boolean
) {
  const key = `${fretboardStyleKey}|${buildChordRasterKey(chord, showBarre)}`;
  let raster = fretboardRasterCache.get(key);
  if (!raster) {
    raster = createFretboardRaster(ctx, chord, colors, showBarre);
    fretboardRasterCache.set(key, raster);
  }
  // 目标位置对齐到整设备像素：避免半像素相位差让 drawImage 走重采样而糊边
  const ratio = SCORE_EXPORT_CONFIG.PIXEL_RATIO;
  const dx = Math.round((x - raster.padX) * ratio) / ratio;
  const dy = Math.round((y - raster.padY) * ratio) / ratio;
  ctx.drawImage(raster.canvas, dx, dy, raster.width, raster.height);
}

/** 单个和弦指板图的矢量绘制（原实现，现作为位图光栅化内核；坐标系以 (x, y) 为内容原点） */
function drawFretboardVector(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  chord: ExportChordData,
  colors: ThemeColors,
  showBarre: boolean
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
  // 品号字体在绘制循环外预构造（走字体缓存，缩放纪元变化才重建）
  const capoFont = refreshFonts().capo;
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

  // 5. 大横按（Barres）——两端带饱满圆角，完全覆盖音符点；showBarre=false 时隐藏横按梁
  if (showBarre && chord.barres && chord.barres.length > 0) {
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
  showBarre: boolean,
  lyricsFontWeight: number,
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
      drawFretboard(ctx, currentX, getChordY(chord), chord, colors, showBarre);
      currentX += SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH;
      if (i < line.startChords.length - 1) {
        currentX += SCORE_EXPORT_CONFIG.INLINE_CHORD_GAP;
      }
    }
    currentX += SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP;
  }

  // 2. 绘制每个字符与其上方的和弦指板图
  // 歌词字体、颜色、对齐方式在循环外设置一次，避免每字重复赋值
  const lyricsFont = getLyricsFont(lyricsFontWeight);
  ctx.font = lyricsFont;
  ctx.fillStyle = colors.TEXT;
  ctx.textAlign = 'center';

  for (const item of line.chars) {
    const isSpace = item.char === ' ' || item.char === '　';
    const colW = getCharColumnWidth(item);

    // 上方指板图（底部对齐）
    if (item.chord) {
      const fbX = currentX + (colW - SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH) / 2;
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
      drawFretboard(ctx, currentX, getChordY(chord), chord, colors, showBarre);
      currentX += SCORE_EXPORT_CONFIG.FRETBOARD_WIDTH;
      if (i < line.endChords.length - 1) {
        currentX += SCORE_EXPORT_CONFIG.INLINE_CHORD_GAP;
      }
    }
  }

  return { nextY: y + contentH + rowGap, width: currentX - startX };
}

/**
 * 表头总高度：singer 非空时在标题下多绘制一行居中副标题（字号 + 上下间距）；
 * 无 singer 时与既有表头高度完全一致（零回归）。
 */
const getHeaderHeight = (hasSinger: boolean): number =>
  SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE +
  SCORE_EXPORT_CONFIG.TITLE_TO_META_GAP +
  (hasSinger ? SCORE_EXPORT_CONFIG.SINGER_SUBTITLE_FONT_SIZE + SCORE_EXPORT_CONFIG.SINGER_SUBTITLE_GAP : 0) +
  SCORE_EXPORT_CONFIG.META_FONT_SIZE +
  SCORE_EXPORT_CONFIG.HEADER_BOTTOM_GAP;

/** 绘制乐谱表头（标题、可选歌手副标题、元信息行：原调 → Capo → 选调 推导链 + 拍号，竖线分隔，整体居中） */
function renderHeader(
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
  ctx.font = `bold ${SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = colors.TEXT;
  ctx.textAlign = 'center';
  ctx.fillText(title, centerX, y + SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE);
  y += SCORE_EXPORT_CONFIG.TITLE_FONT_SIZE + SCORE_EXPORT_CONFIG.TITLE_TO_META_GAP;

  // 1.5 歌手副标题（仅 singer 非空时绘制：标题下居中，弱化色与元信息行一致）
  if (singer) {
    ctx.font = `500 ${SCORE_EXPORT_CONFIG.SINGER_SUBTITLE_FONT_SIZE}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = colors.SUB_TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(singer, centerX, y + SCORE_EXPORT_CONFIG.SINGER_SUBTITLE_FONT_SIZE);
    y += SCORE_EXPORT_CONFIG.SINGER_SUBTITLE_FONT_SIZE + SCORE_EXPORT_CONFIG.SINGER_SUBTITLE_GAP;
  }

  // 2. 元信息行（方案 A：原调 → Capo → 选调 推导链 + 拍号，各项之间用竖线分隔，整体水平居中）
  const baselineY = y + SCORE_EXPORT_CONFIG.META_FONT_SIZE;
  const metaBaseFont = `500 ${SCORE_EXPORT_CONFIG.META_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const metaAccFont = `bold ${SCORE_EXPORT_CONFIG.META_ACCIDENTAL_FONT_SIZE}px system-ui, -apple-system, sans-serif`;
  const metaLabelFont = `400 ${SCORE_EXPORT_CONFIG.META_FONT_SIZE - 2}px system-ui, -apple-system, sans-serif`;
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
    for (const label of ['原调', '选调'] as const) {
      if (trimmed.startsWith(label)) {
        return { label, valueText: trimmed.slice(label.length).trim() };
      }
    }
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
      ctx.fillRect(
        curX + META_GAP,
        baselineY - SCORE_EXPORT_CONFIG.META_FONT_SIZE + 3,
        1,
        SCORE_EXPORT_CONFIG.META_FONT_SIZE - 3
      );
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
      const tokenY = token.isAccidental
        ? baselineY + SCORE_EXPORT_CONFIG.META_ACCIDENTAL_SUPERSCRIPT_OFFSET
        : baselineY;
      ctx.fillText(token.text, curX, tokenY);
      curX += token.width;
    }
  });

  y += SCORE_EXPORT_CONFIG.META_FONT_SIZE + SCORE_EXPORT_CONFIG.HEADER_BOTTOM_GAP;

  return y;
}

/**
 * 整页离屏画布（模块级复用）。
 *
 * A4 分页每页都是一张 1600×2300 级别的画布，底层缓冲约 15MB；原来逐页新建再丢弃，
 * 一本 10 页的乐谱就会反复分配 150MB。改为复用同一张（尺寸档位变化时才重建），
 * 每次取用重置变换并清底，语义与「新建画布 + 填充背景」一致。
 * 复用安全的前提：convertToBlob 在被调用时即同步拷贝画布位图（规范约定），
 * 因此每页 await 完成后才进入下一页，不会读到被覆盖的像素。
 */
let pageCanvas: OffscreenCanvas | null = null;
let pageCtx: OffscreenCanvasRenderingContext2D | null = null;

/** 取整页画布与上下文（需要时按新尺寸重建），返回前已重置变换、清底交由调用方填充背景 */
function acquirePageCanvas(
  width: number,
  height: number
): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const deviceW = Math.round(width * SCORE_EXPORT_CONFIG.PIXEL_RATIO);
  const deviceH = Math.round(height * SCORE_EXPORT_CONFIG.PIXEL_RATIO);
  if (!pageCanvas || pageCanvas.width !== deviceW || pageCanvas.height !== deviceH) {
    pageCanvas = new OffscreenCanvas(deviceW, deviceH);
    pageCtx = pageCanvas.getContext('2d');
  }
  const ctx = pageCtx!;
  // 必须 setTransform 而非 scale：复用画布要重置变换，否则缩放逐页累乘
  ctx.setTransform(SCORE_EXPORT_CONFIG.PIXEL_RATIO, 0, 0, SCORE_EXPORT_CONFIG.PIXEL_RATIO, 0, 0);
  return { canvas: pageCanvas, ctx };
}

/**
 * 页脚合成：把无页脚的页面图贴回整页画布 → 画页码 → 重编码为 JPEG。
 *
 * 页面栅格与页脚解耦的原因：若页脚画进页面栅格，「显示页脚」便成了内容的一部分，
 * 预览缓存必须为开关两态各存一份（同一首歌两份条目、字节数翻倍）。改为合成层后只留一份
 * 无页脚页面；代价是导出时多一次 JPEG 编码（质量档位与页面渲染相同，视觉无损级）。
 */
async function composeFooterPages(payload: FooterComposePayload): Promise<Blob[]> {
  const { width, height } = getScorePageSize(payload.pageSize ?? 'a4');
  const pageMargin = payload.pageMargin ?? SCORE_EXPORT_CONFIG.PAGE_MARGIN;
  const quality = Math.min(1, Math.max(0.3, payload.exportQuality ?? EXPORT_JPEG_QUALITY));
  const { canvas, ctx } = acquirePageCanvas(width, height);

  const blobs: Blob[] = [];
  for (let i = 0; i < payload.pages.length; i++) {
    // 页图为设备像素（逻辑尺寸 × PIXEL_RATIO），贴图用恒等变换保证 1:1 不重采样
    const bitmap = await createImageBitmap(payload.pages[i]!);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    // 回到逻辑坐标系画页码：与预览展示层共用同一绘制函数，字号/位置逐像素同源
    ctx.setTransform(SCORE_EXPORT_CONFIG.PIXEL_RATIO, 0, 0, SCORE_EXPORT_CONFIG.PIXEL_RATIO, 0, 0);
    drawFooterMark(ctx, {
      pageIndex: payload.pageIndexes?.[i] ?? i,
      width,
      height,
      pageMargin,
      color: payload.color,
    });

    blobs.push(await canvas.convertToBlob({ type: 'image/jpeg', quality }));
    self.postMessage({
      type: 'progress',
      percent: Math.round(((i + 1) / payload.pages.length) * 100),
    } as WorkerExportMessage);
  }
  return blobs;
}

/**
 * 长图模式离屏渲染：自适应最宽行宽度绘制整曲为单张 JPEG，返回 Blob。
 * 供「下载为长图」导出与「预估文件尺寸」估算两处复用——估算即真实渲染后取 blob.size，
 * 因此预估值与最终导出文件字节数一致（仅取整误差）。
 */
async function renderLongImageBlob(
  lines: ExportLineItem[],
  title: string,
  singer: string,
  keyText: string,
  capoText: string,
  timeSignatureText: string,
  colors: ThemeColors,
  layoutAlign: 'start' | 'center',
  showBarre: boolean,
  lyricsFontWeight: number,
  jpegQuality: number,
  pageMargin: number
): Promise<Blob> {
  const availWidth = SCORE_EXPORT_CONFIG.NORMAL_CONTENT_MAX_WIDTH;
  const allSegments = wrapScoreLines(lines, availWidth);

  // 单次遍历同时计算：最宽段宽度、内容总高、行间距总高（段宽已在软折行阶段预计算）
  let maxSegmentW = 0;
  let totalContentH = 0;
  let totalGapsH = 0;
  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;
    const segW = seg.width;
    if (segW > maxSegmentW) maxSegmentW = segW;
    totalContentH += seg.contentHeight;
    if (i < allSegments.length - 1) {
      totalGapsH += seg.isLastSubLine ? SCORE_EXPORT_CONFIG.LINE_ROW_GAP : SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP;
    }
  }

  const headerH = getHeaderHeight(Boolean(singer));
  const canvasW = Math.max(SCORE_EXPORT_CONFIG.NORMAL_CANVAS_MIN_WIDTH, Math.round(maxSegmentW + pageMargin * 2));
  const canvasH = pageMargin + headerH + totalContentH + totalGapsH + pageMargin;

  const { canvas, ctx } = acquirePageCanvas(canvasW, canvasH);

  // 清底后铺背景：画布复用，背景色若含透明度则需先清掉上一页残留
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = colors.BG;
  ctx.fillRect(0, 0, canvasW, canvasH);

  let curY: number = pageMargin;
  curY = renderHeader(ctx, title, singer, keyText, capoText, timeSignatureText, canvasW, curY, colors);

  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;
    const isLast = i === allSegments.length - 1;
    const defaultGap = seg.isLastSubLine ? SCORE_EXPORT_CONFIG.LINE_ROW_GAP : SCORE_EXPORT_CONFIG.WRAPPED_LINE_ROW_GAP;
    const rowGap = isLast ? 0 : defaultGap;
    const segW = seg.width;
    const isCenter = layoutAlign === 'center';
    const startX = isCenter
      ? Math.max(pageMargin, Math.round((canvasW - segW) / 2)) +
        (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0)
      : pageMargin + (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0);
    const res = renderScoreLine(ctx, seg, startX, curY, colors, showBarre, lyricsFontWeight, rowGap);
    curY = res.nextY;
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
}

/**
 * A4 分页装箱：软折行后的分段按页高动态装箱。
 * - 整句歌词跨页断裂保护：原始行首个分段放不下整句但全新一页放得下时，提前开新页；
 * - 页首空行优化：新页尚未放入任何歌词时跳过纯空行，避免页首留白。
 */
function packA4Pages(allSegments: RenderSegment[], contentHeight: number, headerH: number): RenderSegment[][] {
  const pages: RenderSegment[][] = [];
  let curPageSegments: RenderSegment[] = [];
  let curPageUsedH: number = headerH;

  const isEmptySegment = (seg: RenderSegment) =>
    seg.chars.length === 0 && !seg.startChords?.length && !seg.endChords?.length;

  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;

    // 页首空行优化：如果新页尚未放入任何歌词，遇到纯空行直接跳过，避免页首留白
    if (curPageSegments.length === 0 && isEmptySegment(seg)) {
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
      if (isEmptySegment(seg)) {
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

  return pages;
}

/** 装箱后按段的 lineIdx 归集每页覆盖的原始歌词行序号（升序去重），供外部按页重组内容 */
function computePageLineRanges(pages: RenderSegment[][]): number[][] {
  return pages.map(pageSegments => {
    const seen = new Set<number>();
    for (const seg of pageSegments) seen.add(seg.lineIdx);
    return [...seen].sort((a, b) => a - b);
  });
}

interface A4PageRenderOptions {
  pageSegments: RenderSegment[];
  /** 首页绘制表头 */
  isFirstPage: boolean;
  isFullPage: boolean;
  title: string;
  singer: string;
  keyText: string;
  capoText: string;
  timeSignatureText: string;
  canvasW: number;
  canvasH: number;
  pageMargin: number;
  colors: ThemeColors;
  layoutAlign: 'start' | 'center';
  showBarre: boolean;
  lyricsFontWeight: number;
  jpegQuality: number;
}

/** 渲染单页 A4：整页时按 space-between 动态膨胀行距（上限 1.35 倍默认行距）。
 *  页脚页码不在本函数内绘制——它是独立合成层，见 composeFooterPages。 */
async function renderA4Page(opts: A4PageRenderOptions): Promise<Blob> {
  const {
    pageSegments,
    isFirstPage,
    isFullPage,
    title,
    singer,
    keyText,
    capoText,
    timeSignatureText,
    canvasW,
    canvasH,
    pageMargin,
    colors,
    layoutAlign,
    showBarre,
    lyricsFontWeight,
    jpegQuality,
  } = opts;

  const { canvas, ctx } = acquirePageCanvas(canvasW, canvasH);

  // 清底后铺背景：画布复用，背景色若含透明度则需先清掉上一页残留
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = colors.BG;
  ctx.fillRect(0, 0, canvasW, canvasH);

  let curY: number = pageMargin;
  if (isFirstPage) {
    curY = renderHeader(ctx, title, singer, keyText, capoText, timeSignatureText, canvasW, curY, colors);
  }

  // 合并为单次循环：计算 space-between 参数 + 逐段绘制
  const pageAvailH = canvasH - pageMargin - curY;

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
    const segW = seg.width;
    const isCenter = layoutAlign === 'center';
    const startX = isCenter
      ? Math.max(pageMargin, Math.round((canvasW - segW) / 2)) +
        (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0)
      : pageMargin + (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0);
    const res = renderScoreLine(ctx, seg, startX, curY, colors, showBarre, lyricsFontWeight, rowGap);
    curY = res.nextY;
  }

  return canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
}

if (typeof self !== 'undefined') {
  self.onmessage = async (e: MessageEvent<ScoreWorkerRequest>) => {
    const payload = e.data;

    // 页脚合成请求：只做「贴图 + 画页码 + 重编码」，与整谱渲染共用渲染线程（服务层同一队列串行下发）
    if (payload.kind === 'footer-compose') {
      try {
        const blobs = await composeFooterPages(payload);
        self.postMessage({ type: 'complete', blobs } as WorkerExportMessage);
      } catch (err) {
        self.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        } as WorkerExportMessage);
      }
      return;
    }

    try {
      const {
        title,
        singer = '',
        keyText,
        capoText,
        timeSignatureText = '',
        lines,
        mode,
        colors,
        layoutAlign,
        fontScale = 100,
        fretboardScale = 100,
        showBarre = true,
        ignoreEmptySpace: ignoreEmptySpaceMode = false,
        lyricsFontWeight: lyricsFontWeightMode = 'regular',
        exportQuality = EXPORT_JPEG_QUALITY,
        pageMargin = SCORE_EXPORT_CONFIG.PAGE_MARGIN,
        pageSize = 'a4',
      } = payload;

      // 导出单页尺寸：按档位解析宽高（A4 / A5 / Letter），仅 A4 分页模式使用
      const { width: pageW, height: pageH } = getScorePageSize(pageSize);

      // 歌词字重映射为 canvas 数值字重（light 300 / regular 400 / bold 700）
      const lyricsFontWeight = lyricsFontWeightMode === 'light' ? 300 : lyricsFontWeightMode === 'bold' ? 700 : 400;

      // 导出 JPEG 压缩质量：限制在 [0.3, 1] 区间（对应「导出质量」设置 30~100）
      const jpegQuality = Math.min(1, Math.max(0.3, exportQuality));

      // 排列和弦配置的缩放参数先于任何布局计算生效
      applyLayoutScales(fontScale, fretboardScale);

      // 样式纪元（主题配色 + 缩放后几何）变化即清空指板位图缓存：旧位图画法已不成立，
      // 留着只会被 LRU 顶替而白占内存（缩放滑块连续拖动会产生一串新纪元）
      const styleKey = computeFretboardStyleKey(colors);
      if (styleKey !== fretboardStyleKey) {
        fretboardStyleKey = styleKey;
        fretboardRasterCache.clear();
      }

      // 忽略无和弦空格开关：写入模块级状态，供 getCharColumnWidth 在测量与绘制两处共用
      ignoreEmptySpace = ignoreEmptySpaceMode;

      const blobs: Blob[] = [];
      // a4 模式下每页覆盖的原始歌词行序号；normal 模式不产出
      let pageLineRanges: number[][] | undefined;

      if (mode === 'a4') {
        // ===== 单页分页模式（尺寸按档位 A4 / A5 / Letter） =====
        const contentHeight = pageH - pageMargin * 2;
        const headerH = getHeaderHeight(Boolean(singer));
        const availWidth = pageW - pageMargin * 2;

        // 1. 超长行软折行 → 2. 动态装箱分页（整句跨页保护 + 页首空行优化）
        const allSegments = wrapScoreLines(lines, availWidth);
        const pages = packA4Pages(allSegments, contentHeight, headerH);

        // 每页覆盖的原始歌词行序号（升序去重）
        pageLineRanges = computePageLineRanges(pages);

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const blob = await renderA4Page({
            pageSegments: pages[pIdx]!,
            isFirstPage: pIdx === 0,
            isFullPage: pIdx < pages.length - 1,
            title,
            singer,
            keyText,
            capoText,
            timeSignatureText,
            canvasW: pageW,
            canvasH: pageH,
            pageMargin,
            colors,
            layoutAlign: layoutAlign ?? 'start',
            showBarre,
            lyricsFontWeight,
            jpegQuality,
          });
          blobs.push(blob);

          self.postMessage({
            type: 'progress',
            percent: Math.round(((pIdx + 1) / pages.length) * 100),
          } as WorkerExportMessage);
        }
      } else {
        // ===== 普通长图模式（画布宽度自适应实际最宽行，左右对称 pageMargin 页边距，彻底消除右侧空白） =====
        const blob = await renderLongImageBlob(
          lines,
          title,
          singer,
          keyText,
          capoText,
          timeSignatureText,
          colors,
          layoutAlign ?? 'start',
          showBarre,
          lyricsFontWeight,
          jpegQuality,
          pageMargin
        );
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
