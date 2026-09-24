/**
 * 乐谱文字传递编解码：把乐谱序列化为纯文本（自包含指法数据），供「复制/粘贴」跨实例精确往返。
 * 单和弦编解码已下沉和弦域（domains/chord/transfer/chordTextCodec），此处复用其字段编解码器，
 * 并转发和弦 API 以兼容既有导入路径。格式魔数见 TEXT_FORMAT（platform/utils/constants）。
 */
import { getChordName, getDefaultTuningForStringCount, isValidChordName } from '@/domains/chord/theory/theory';
import { parseChordFields, serializeChordFields } from '@/domains/chord/transfer/chordTextCodec';
import { DEFAULT_FRET_COUNT } from '@/domains/fretboard/constants';
import { isValidTimeSignature } from '@/domains/score/constants';
import { extractSongChordSequence } from '@/domains/score/model/chordSlots';
import { clamp } from '@/platform/utils/common';
import { TEXT_FORMAT } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import type { PortableChord, TextParseResult } from '@/domains/chord/transfer/chordTextCodec';
import type { Chord, ChordId } from '@/domains/chord/types';
import type { Capo, Song } from '@/domains/score/types';

// 和弦编解码 API 转发（兼容既有导入路径，如 tests/domain/textCodec.test.ts）
export {
  parseChordFromText,
  serializeChordToText,
  type PortableChord,
  type TextParseReason,
  type TextParseResult,
} from '@/domains/chord/transfer/chordTextCodec';

/** 乐谱中的单个和弦槽位（按行号/类型/序号定位，与 lineId 解耦以便导入重建） */
export interface PortableSongSlot {
  lineIdx: number;
  type: 'char' | 'start' | 'end';
  index: number;
  chord: PortableChord;
}

/** 跨实例乐谱载荷 */
export interface PortableSong {
  title: string;
  /** 歌手（纯展示元数据，空串表示无；旧格式文本解析结果为空串） */
  singer: string;
  /** 原调（歌曲原始调性，'' 表示未设置；旧格式文本解析结果为空串） */
  originalKey: string;
  /** 拍号（如 4/4、6/8，'' 表示未设置；旧格式文本解析结果为空串） */
  timeSignature: string;
  playKey: string;
  capo: Capo;
  lyrics: string;
  slots: PortableSongSlot[];
}

/** 智能宽容导入结果：needsConfirm 标记「无结构信号纯歌词」，需用户确认后才建谱 */
export interface SmartSongImport extends PortableSong {
  needsConfirm: boolean;
}

const HEADER_CHORD = `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}`;
const HEADER_SONG = `${TEXT_FORMAT.SONG} ${TEXT_FORMAT.VERSION}`;

/** 识别头部魔数：本应用格式但版本/魔数不符时为 INVALID_HEADER，否则 UNKNOWN_FORMAT */
const classifyHeader = (header: string): 'UNKNOWN_FORMAT' | 'INVALID_HEADER' => {
  if (header.startsWith(TEXT_FORMAT.CHORD) || header.startsWith(TEXT_FORMAT.SONG)) return 'INVALID_HEADER';
  return 'UNKNOWN_FORMAT';
};

/**
 * capo 归一：收敛为 0–12 的整数。取整是必需的而非锦上添花——下游 `isCapoValue`
 * 只认可 0..12 的整数，小数 capo 会一路带到品位坐标计算才炸，报错点离输入太远。
 */
const normalizeCapo = (capoNum: number): Capo =>
  Math.round(clamp(Number.isFinite(capoNum) ? capoNum : 0, 0, 12)) as Capo;

/**
 * 智能宽容解析：从普通歌词文本或内嵌 [Chord] 格式提取歌词与槽位。
 * 支持：
 * - 标准内嵌和弦：`[C]故事的小黄花 从出生那年[G]就飘着`
 * - ChordPro 标签：`{title: 晴天}`、`{t: 晴天}`、`{key: C}`、`{capo: 1}`、`{artist: 周杰伦}`、`{origkey: C#}`
 * - 纯歌词多行文本（无和弦时纯导入歌词）
 */
const BRACKET_CHORD_REGEX = /\[([A-Ga-g][#b]?(?:[a-zA-Z0-9#b/()（）+ø°△\-^]){0,15})\]/gi;
const DIRECTIVE_REGEX = /^\{([a-zA-Z]+)\s*:\s*(.*?)\}$/;

/**
 * 是否含可确证的乐谱结构信号：内嵌 [和弦] 标签（合法和弦名）、ChordPro 指令 {title}/{key}/{capo}、
 * 或首行标题 歌名：xxx。仅凭语法结构判别，不依赖语义词表，避免「乱匹配」UI 装饰文本。
 * 无此信号的纯散文文本只能走「确认兜底」路径。
 */
const hasScoreStructuralMarker = (text: string): boolean => {
  let match: RegExpExecArray | null;
  BRACKET_CHORD_REGEX.lastIndex = 0;
  while ((match = BRACKET_CHORD_REGEX.exec(text)) !== null) if (isValidChordName(match[1]?.trim() ?? '')) return true;

  const firstLine = text.trimStart().split('\n')[0]?.trim() ?? '';
  if (DIRECTIVE_REGEX.test(firstLine)) return true;
  return /^(?:歌名|曲名|Title|歌手|演唱)\s*[:：]/.test(firstLine);
};

/**
 * 换行归一：Windows 剪贴板粘进来的 CRLF / 裸 CR 必须先归一，否则行尾 `\r` 会混进字段值、
 * 让段标记匹配失败。本模块三个解析入口（纯歌词兜底、宽容导入、自有分段格式）此前各写一遍同一句。
 * 注：`hasScoreStructuralMarker` 不在此列 —— 它只取首行、随后即 `.trim()`，`\r` 已被去掉。
 */
const normalizeLines = (text: string): string[] => text.replace(/\r\n?/g, '\n').split('\n');

/**
 * 纯歌词兜底解析：文本无任何结构信号、但作为歌词内容足够，仅填充歌词（无和弦槽位）。
 * 该载荷需用户在 UI 确认后才落地建谱，防止任意框选文本被静默吞入歌词。
 */
const parsePlainLyricsFromText = (text: string): PortableSong | null => {
  const lines = normalizeLines(text);
  const meaningfulLines = lines.filter(l => l.trim());
  if (meaningfulLines.length < 2 || text.trim().length < 6) return null;
  return {
    title: '',
    singer: '',
    originalKey: '',
    timeSignature: '',
    playKey: 'C',
    capo: 0,
    lyrics: lines.join('\n'),
    slots: [],
  };
};

const createFallbackPortableChord = (name: string): PortableChord => {
  const tuning = getDefaultTuningForStringCount(6);
  return {
    name,
    tuning,
    fretCount: DEFAULT_FRET_COUNT,
    fretOffset: 0,
    rootStringIndex: null,
    strings: [
      { fret: -1, preferFlat: false },
      { fret: -1, preferFlat: false },
      { fret: -1, preferFlat: false },
      { fret: -1, preferFlat: false },
      { fret: -1, preferFlat: false },
      { fret: -1, preferFlat: false },
    ],
  };
};

const parseSmartSongFromText = (text: string): PortableSong | null => {
  const lines = normalizeLines(text);
  let title = '';
  let singer = '';
  let originalKey = '';
  let timeSignature = '';
  let playKey = 'C';
  let capoNum = 0;
  const cleanLyricsLines: string[] = [];
  const slots: PortableSongSlot[] = [];

  let lineIdx = 0;
  let hasValidChords = false;
  let meaningfulContentCount = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      cleanLyricsLines.push('');
      lineIdx++;
      continue;
    }

    // 检查 ChordPro 指令行 {title: ...} 等
    const dirMatch = DIRECTIVE_REGEX.exec(trimmed);
    if (dirMatch) {
      const key = dirMatch[1]?.toLowerCase();
      const val = dirMatch[2]?.trim() ?? '';
      if (key === 'title' || key === 't') title = val;
      else if (key === 'artist' || key === 'singer') singer = val;
      else if (key === 'origkey' || key === 'originalkey') originalKey = val;
      else if (key === 'ts' || key === 'time') {
        if (isValidTimeSignature(val)) timeSignature = val;
      } else if (key === 'key') playKey = val;
      else if (key === 'capo') capoNum = Number(val);
      continue;
    }

    // 检查是否有首行标记，如 歌名：xxx / 歌手：xxx / Title: xxx
    if (cleanLyricsLines.length === 0 && !title) {
      const titleMatch = /^(?:歌名|曲名|Title)\s*[:：]\s*(.*)$/i.exec(trimmed);
      if (titleMatch) {
        title = titleMatch[1]?.trim() ?? '';
        continue;
      }
    }
    if (cleanLyricsLines.length === 0 && !singer) {
      const singerMatch = /^(?:歌手|演唱)\s*[:：]\s*(.*)$/i.exec(trimmed);
      if (singerMatch) {
        singer = singerMatch[1]?.trim() ?? '';
        continue;
      }
    }
    if (cleanLyricsLines.length === 0 && !originalKey) {
      const origKeyMatch = /^原调\s*[:：]\s*(.*)$/.exec(trimmed);
      if (origKeyMatch) {
        originalKey = origKeyMatch[1]?.trim() ?? '';
        continue;
      }
    }

    // 解析行内的 [Chord] 标签：strip 行首缩进，使字符下标对齐最终落地（sanitizeLyricsText 按行 trim）的行，
    // 否则缩进/制表符会让和弦错挂到别的字（4 空格）或整槽被下标越界判定静默丢弃（6 制表符）
    const lineRaw = raw.replace(/^\s+/, '');
    let cleanLine = '';
    let lastIndex = 0;
    // 行首连续和弦（`[C][G]歌词`）的序号：这些和弦清出的 cleanLine 长度恒为 0，若一律发 index:0，
    // 重放侧 bindNewChordToSlot 的 'append' 只在**越界**分支与 'front-insert' 有别，第二个会落进
    // 「in-range 覆盖」分支把 list[0] 直接改写掉 —— 每行只剩最后一个行首和弦。改为按序号递增发
    // 0,1,2…，与导出侧 SLOTS 段写 start 槽位下标的既有口径一致。
    let startOrdinal = 0;
    let match: RegExpExecArray | null;
    BRACKET_CHORD_REGEX.lastIndex = 0;

    while ((match = BRACKET_CHORD_REGEX.exec(lineRaw)) !== null) {
      const chordName = match[1]?.trim() ?? '';
      if (isValidChordName(chordName)) {
        hasValidChords = true;
        cleanLine += lineRaw.slice(lastIndex, match.index);
        const charIdx = cleanLine.length;
        const isLineStart = charIdx === 0;
        slots.push({
          lineIdx,
          type: isLineStart ? 'start' : 'char',
          index: isLineStart ? startOrdinal++ : charIdx,
          chord: createFallbackPortableChord(chordName),
        });
        lastIndex = match.index + match[0].length;
      }
    }
    cleanLine += lineRaw.slice(lastIndex);

    if (cleanLine.trim()) meaningfulContentCount++;
    cleanLyricsLines.push(cleanLine);
    lineIdx++;
  }

  // 判定门槛：至少含有合法和弦记号，或者至少有两行有意义的歌词内容且总长度 > 6
  if (!hasValidChords && (meaningfulContentCount < 2 || text.trim().length < 6)) return null;

  return {
    title,
    singer,
    originalKey,
    timeSignature,
    playKey,
    capo: normalizeCapo(capoNum),
    lyrics: cleanLyricsLines.join('\n'),
    slots,
  };
};

/** 序列化乐谱为文字（含歌词与全部和弦槽位，按字典化紧凑格式输出） */
export const serializeSongToText = (song: Song, resolver: (id: ChordId) => Chord | undefined): string => {
  // singer/originalKey/timeSignature 兼容容错：旧调用方/旧测试手写的 Song 可能没有该字段（?? '' 防止序列化出 undefined 值行）
  const lines = [HEADER_SONG, `TITLE:${song.title}`];
  if (song.singer) lines.push(`SINGER:${song.singer}`);
  if (song.originalKey) lines.push(`ORIGKEY:${song.originalKey}`);
  if (song.timeSignature) lines.push(`TS:${song.timeSignature}`);
  lines.push(`PLAYKEY:${song.playKey}`, `CAPO:${song.capo}`);

  const steps = extractSongChordSequence(song, resolver);
  if (steps.length > 0) {
    lines.push('CHORDS:');
    // 字典化：按和弦 id 去重（同一和弦复用共享一个 alias；不同和弦即使同名同指法也各自独立条目），提取 alias 映射
    const chordDict = new Map<string, { key: string; chord: Chord }>();
    const usedKeys = new Set<string>();

    for (const step of steps) {
      const { chordId } = step;
      if (!chordDict.has(chordId)) {
        const baseName = getChordName(step.chord, { useUnicode: false }) || 'Chord';
        let key = baseName;
        let counter = 2;
        while (usedKeys.has(key)) key = `${baseName}_${counter++}`;

        usedKeys.add(key);
        chordDict.set(chordId, { key, chord: step.chord });
      }
    }

    for (const [, { key, chord }] of chordDict) lines.push(`${key}=${serializeChordFields(chord)}`);

    lines.push('LYRICS:');
    if (song.lyrics) lines.push(...song.lyrics.split('\n').map(escapeLyricsLine));

    lines.push('SLOTS:');
    // N6：lineId 必须精确相等——旧实现的 indexOf 是子串匹配（l1 会命中 l10），上游
    // songRepository 的 filter 让 lineIds 变短后又反查命中另一行，产物看似完整却全部错挂。
    // 未命中的槽位逐条计数并入日志，不再静默 continue
    const lineIdList = song.lineIds ?? [];
    let missedSlots = 0;
    for (const step of steps) {
      const lineIdx = lineIdList.findIndex(id => String(id) === String(step.lineId));
      if (lineIdx === -1) {
        missedSlots += 1;
        continue;
      }
      const alias = chordDict.get(step.chordId)?.key ?? '';
      lines.push(`${lineIdx}:${step.type}:${step.index}:${alias}`);
    }
    if (missedSlots > 0)
      logger.warn(
        'textCodec',
        `导出乐谱文本：${missedSlots} 个槽位未命中当前行列表，已跳过（歌曲可能存在行残留引用）`,
        {
          songId: song.id,
        }
      );
  } else {
    lines.push('LYRICS:');
    if (song.lyrics) lines.push(...song.lyrics.split('\n').map(escapeLyricsLine));
  }

  return lines.join('\n');
};

const SLOT_RE = /^(\d+):(char|start|end):(\d+):(.*)$/;

/** R6 段标记转义：歌词行恰好是裸段标记（CHORDS:/SLOTS:/LYRICS:）时会被解析当段切换吞掉，往返截断。
 *  序列化对这类行加「\」前缀；解析侧识别后剥掉。
 *
 * 两侧必须**互为逆**：原先转义只认「整行 trim 后等于标记」，反转义却剥掉任何「去掉首字符后 trim 等于
 * 标记」的行 —— 用户歌词里字面写的 `\CHORDS:` 于是往返一次就少一个字符（且静默）。
 * 现约定「以 \ 开头的行一律再补一个 \」，反转义按同一条件对称剥回，任意输入都能原样往返。 */
const LYRICS_SECTION_MARKERS = new Set(['CHORDS:', 'SLOTS:', 'LYRICS:']);
const escapeLyricsLine = (line: string): string =>
  LYRICS_SECTION_MARKERS.has(line.trim()) || line.startsWith('\\') ? `\\${line}` : line;
const unescapeLyricsLine = (raw: string): string =>
  raw.startsWith('\\') && (LYRICS_SECTION_MARKERS.has(raw.slice(1).trim()) || raw.slice(1).startsWith('\\'))
    ? raw.slice(1)
    : raw;

/** 解析乐谱文字；返回 PortableSong 或错误分类（槽位越界/字段非法只跳过单条） */
export const parseSongFromText = (text: string): TextParseResult<SmartSongImport> => {
  const lines = normalizeLines(text);
  const header = lines[0]?.trim() ?? '';
  if (header === HEADER_CHORD) return { ok: false, reason: 'WRONG_TYPE' };

  if (header !== HEADER_SONG) {
    // 按结构信号分流：含内嵌和弦/指令/标题的可确证结构直接识别；纯散文走「确认兜底」
    if (hasScoreStructuralMarker(text)) {
      const structured = parseSmartSongFromText(text);
      if (structured) return { ok: true, data: { ...structured, needsConfirm: false } };
    } else {
      const plain = parsePlainLyricsFromText(text);
      if (plain) return { ok: true, data: { ...plain, needsConfirm: true } };
    }
    return { ok: false, reason: classifyHeader(header) };
  }

  let title = '';
  let singer = '';
  let originalKey = '';
  let timeSignature = '';
  let playKey = 'C';
  let capoNum = 0;
  const lyricsLines: string[] = [];
  const slots: PortableSongSlot[] = [];
  const chordDict = new Map<string, PortableChord>();
  let section: 'header' | 'chords' | 'lyrics' | 'slots' = 'header';

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();

    if (section === 'header') {
      if (trimmed.startsWith('TITLE:')) title = trimmed.slice(6).trim();
      else if (trimmed.startsWith('SINGER:')) singer = trimmed.slice(7).trim();
      else if (trimmed.startsWith('ORIGKEY:')) originalKey = trimmed.slice(8).trim();
      else if (trimmed.startsWith('TS:')) {
        const val = trimmed.slice(3).trim();
        if (isValidTimeSignature(val)) timeSignature = val;
      } else if (trimmed.startsWith('PLAYKEY:')) playKey = trimmed.slice(8).trim();
      else if (trimmed.startsWith('CAPO:')) capoNum = Number(trimmed.slice(5));
      else if (trimmed === 'CHORDS:') section = 'chords';
      else if (trimmed === 'LYRICS:') section = 'lyrics';

      continue;
    }

    if (section === 'chords') {
      if (trimmed === 'LYRICS:') {
        section = 'lyrics';
        continue;
      }
      // 字典模式：KEY=FIELDS
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const fields = trimmed.slice(eqIdx + 1).trim();
        const chord = parseChordFields(fields);
        if (chord) chordDict.set(key, chord);
        continue;
      }
      // 兼容旧版内联模式：0:char:2:C;STANDARD;...
      const m = SLOT_RE.exec(trimmed);
      if (m && m[4]?.includes(';')) {
        const chord = parseChordFields(m[4]);
        if (chord)
          slots.push({ lineIdx: Number(m[1]), type: m[2] as 'char' | 'start' | 'end', index: Number(m[3]), chord });
      }
      continue;
    }

    if (section === 'lyrics') {
      if (trimmed === 'SLOTS:') section = 'slots';
      else if (trimmed === 'CHORDS:')
        // 兼容旧版：旧版格式中 CHORDS: 在 LYRICS: 之后
        section = 'chords';
      else lyricsLines.push(unescapeLyricsLine(raw));

      continue;
    }

    if (section === 'slots') {
      const m = SLOT_RE.exec(trimmed);
      if (!m) continue;
      const refOrFields = m[4] ?? '';
      // 优先从字典查 alias，查不到且含 ';' 则尝试按内联字段解析
      const chord = chordDict.get(refOrFields) ?? (refOrFields.includes(';') ? parseChordFields(refOrFields) : null);
      if (!chord) continue;
      slots.push({ lineIdx: Number(m[1]), type: m[2] as 'char' | 'start' | 'end', index: Number(m[3]), chord });
    }
  }

  // 仅一个空行视为空歌词（空歌词序列化时 LYRICS: 后无内容）
  const lyrics = lyricsLines.length === 1 && lyricsLines[0] === '' ? '' : lyricsLines.join('\n');

  return {
    ok: true,
    data: {
      title,
      singer,
      originalKey,
      timeSignature,
      playKey,
      capo: normalizeCapo(capoNum),
      lyrics,
      slots,
      needsConfirm: false,
    },
  };
};
