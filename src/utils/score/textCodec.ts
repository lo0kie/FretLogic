/**
 * 跨实例文字传递编解码：把和弦 / 乐谱序列化为纯文本（自包含指法数据），
 * 供「复制/粘贴」在应用实例之间精确往返。格式见 TEXT_FORMAT（constants.ts）。
 * 本模块为零 store 依赖的纯函数，可直接单测。
 */
import {
  getChordName,
  getDefaultTuningForStringCount,
  isValidChordName,
  nameToSegments,
  TUNING_PRESETS,
} from '@/services/music/theory';
import type { Tuning } from '@/services/music/theory';
import type {
  BarreEntity,
  Capo,
  Chord,
  ChordId,
  FretOffset,
  GuitarStringsModel,
  LineId,
  Song,
  StringIndex,
} from '@/types';
import { clamp } from '@/utils/core/common';
import { TEXT_FORMAT } from '@/utils/core/constants';
import { extractSongChordSequence } from '@/utils/score/chordSlots';

/** 跨实例和弦载荷：剥离 id / groupId / 时间戳等本实例私有字段 */
export interface PortableChord {
  /** 规范名（ASCII #/b），如 Am7、F#m7b5 */
  name: string;
  tuning: Tuning;
  fretCount: Chord['fretCount'];
  fretOffset: FretOffset;
  rootStringIndex: StringIndex | null;
  strings: GuitarStringsModel;
  barres?: Chord['barres'];
}

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
  playKey: string;
  capo: Capo;
  lyrics: string;
  slots: PortableSongSlot[];
}

export type TextParseReason = 'UNKNOWN_FORMAT' | 'WRONG_TYPE' | 'INVALID_HEADER' | 'INVALID_NAME' | 'INVALID_FIELD';

export type TextParseResult<T> = { ok: true; data: T } | { ok: false; reason: TextParseReason };

const HEADER_CHORD = `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}`;
const HEADER_SONG = `${TEXT_FORMAT.SONG} ${TEXT_FORMAT.VERSION}`;

const TUNING_KEYS = Object.keys(TUNING_PRESETS) as Tuning[];

/** 识别头部魔数：本应用格式但版本/魔数不符时为 INVALID_HEADER，否则 UNKNOWN_FORMAT */
const classifyHeader = (header: string): 'UNKNOWN_FORMAT' | 'INVALID_HEADER' => {
  if (header.startsWith(TEXT_FORMAT.CHORD) || header.startsWith(TEXT_FORMAT.SONG)) return 'INVALID_HEADER';
  return 'UNKNOWN_FORMAT';
};

/** 单弦编码：`品位,preferFlat`（-1 静音 / 0 空弦 / ≥1 品位） */
const encodeString = (s: [number, boolean]): string => `${s[0]},${s[1] ? 1 : 0}`;

/** 横按条目编码：`品位:起弦:止弦:指法` */
const encodeBarre = (b: BarreEntity): string => `${b.fret}:${b.fromString}:${b.toString}:${b.finger ?? 1}`;

/** 和弦单行紧凑编码（供乐谱 CHORDS 段使用） */
const serializeChordFields = (chord: Chord): string => {
  const name = getChordName(chord, { useUnicode: false });
  const parts = [
    name,
    chord.tuning,
    String(chord.fretCount),
    String(chord.fretOffset),
    String(chord.rootStringIndex ?? -1),
    chord.strings.map(encodeString).join('|'),
  ];
  if (chord.barres?.length) parts.push(chord.barres.map(encodeBarre).join(','));
  return parts.join(';');
};

/** 解析和弦单行紧凑编码；字段非法返回 null */
const parseChordFields = (fields: string): PortableChord | null => {
  const parts = fields.split(';');
  if (parts.length < 6) return null;
  const [name, tuningStr, fretStr, offsetStr, rootStr, stringsStr, barresStr] = parts;
  const normalizedName = (name ?? '').trim();
  if (!normalizedName || !isValidChordName(normalizedName) || !nameToSegments(normalizedName)) return null;

  // 调弦非法时回退默认，并按弦数截/补 strings（补的弦为静音）
  const tuning = TUNING_KEYS.includes(tuningStr as Tuning) ? (tuningStr as Tuning) : getDefaultTuningForStringCount(6);
  const stringCount = TUNING_PRESETS[tuning]?.stringCount ?? 6;
  const rawStrings = (stringsStr ?? '').split('|');
  const strings: GuitarStringsModel = Array.from({ length: stringCount }, (_, i) => {
    const [fretStr, flatStr] = rawStrings[i]?.split(',') ?? [];
    const fret = Number(fretStr);
    return [Number.isFinite(fret) ? fret : -1, flatStr === '1'] as [number, boolean];
  });

  const fretNum = Number(fretStr);
  const offsetNum = Number(offsetStr);
  const rootNum = Number(rootStr);
  const rootStringIndex: StringIndex | null =
    Number.isFinite(rootNum) && rootNum >= 0 && rootNum < stringCount ? (rootNum as StringIndex) : null;

  const barres: BarreEntity[] | undefined = barresStr
    ? barresStr
        .split(',')
        .map(raw => {
          const [f, from, to, finger] = raw.split(':');
          const fret = Number(f);
          const fromString = Number(from);
          const toString = Number(to);
          if (!Number.isFinite(fret) || !Number.isFinite(fromString) || !Number.isFinite(toString)) return null;
          const fingerNum = Number(finger);
          return {
            fret,
            fromString,
            toString,
            ...(Number.isFinite(fingerNum) ? { finger: fingerNum as 1 | 2 | 3 | 4 } : {}),
          } as BarreEntity;
        })
        .filter((b): b is BarreEntity => b !== null)
    : undefined;

  return {
    name: normalizedName,
    tuning,
    fretCount: fretNum === 4 ? 4 : 3,
    fretOffset: clamp(Number.isFinite(offsetNum) ? offsetNum : 0, 0, 12) as FretOffset,
    rootStringIndex,
    strings,
    ...(barres && barres.length > 0 ? { barres } : {}),
  };
};

/** 序列化单个和弦为文字 */
export const serializeChordToText = (chord: Chord): string => {
  const lines = [
    HEADER_CHORD,
    `NAME:${getChordName(chord, { useUnicode: false })}`,
    `TUNING:${chord.tuning}`,
    `FRETS:${chord.fretCount}`,
    `OFFSET:${chord.fretOffset}`,
    `ROOT:${chord.rootStringIndex ?? -1}`,
    `STRINGS:${chord.strings.map(encodeString).join('|')}`,
  ];
  if (chord.barres?.length) lines.push(`BARRES:${chord.barres.map(encodeBarre).join(',')}`);
  return lines.join('\n');
};

/** 解析单个和弦文字；返回 PortableChord 或错误分类 */
export const parseChordFromText = (text: string): TextParseResult<PortableChord> => {
  const lines = text.split('\n');
  const header = lines[0]?.trim() ?? '';
  if (header === HEADER_SONG) return { ok: false, reason: 'WRONG_TYPE' };
  if (header !== HEADER_CHORD) return { ok: false, reason: classifyHeader(header) };

  const fieldMap = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const idx = line.indexOf(':');
    if (idx <= 0) return { ok: false, reason: 'INVALID_FIELD' };
    fieldMap.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  const name = fieldMap.get('NAME') ?? '';
  if (!name || !nameToSegments(name) || !isValidChordName(name)) return { ok: false, reason: 'INVALID_NAME' };

  // 复用紧凑字段解析器：把多行 KV 归并为单行字段
  const compact = [
    name,
    fieldMap.get('TUNING') ?? '',
    fieldMap.get('FRETS') ?? '',
    fieldMap.get('OFFSET') ?? '',
    fieldMap.get('ROOT') ?? '-1',
    fieldMap.get('STRINGS') ?? '',
    fieldMap.get('BARRES'),
  ]
    .filter((v, i) => v !== undefined && !(i === 6 && v === ''))
    .join(';');
  const parsed = parseChordFields(compact);
  if (!parsed) return { ok: false, reason: 'INVALID_FIELD' };
  return { ok: true, data: parsed };
};

/**
 * 智能宽容解析：从普通歌词文本或内嵌 [Chord] 格式提取歌词与槽位。
 * 支持：
 * - 标准内嵌和弦：`[C]故事的小黄花 从出生那年[G]就飘着`
 * - ChordPro 标签：`{title: 晴天}`、`{t: 晴天}`、`{key: C}`、`{capo: 1}`
 * - 纯歌词多行文本（无和弦时纯导入歌词）
 */
const BRACKET_CHORD_REGEX =
  /\[([A-Ga-g][#b]?(?:m|maj|min|dim|aug|sus|add)?[0-9]*(?:b5|#5|b9|#9)?(?:\/[A-Ga-g][#b]?)?)\]/g;
const DIRECTIVE_REGEX = /^\{([a-zA-Z]+)\s*:\s*(.*?)\}$/;

const createFallbackPortableChord = (name: string): PortableChord => {
  const tuning = getDefaultTuningForStringCount(6);
  return {
    name,
    tuning,
    fretCount: 3,
    fretOffset: 0,
    rootStringIndex: null,
    strings: [
      [-1, false],
      [-1, false],
      [-1, false],
      [-1, false],
      [-1, false],
      [-1, false],
    ],
  };
};

const parseSmartSongFromText = (text: string): PortableSong | null => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
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
      else if (key === 'key') playKey = val;
      else if (key === 'capo') capoNum = Number(val);
      continue;
    }

    // 检查是否有首行标记，如 歌名：xxx / Title: xxx
    if (cleanLyricsLines.length === 0 && !title) {
      const titleMatch = /^(?:歌名|曲名|Title)\s*[:：]\s*(.*)$/i.exec(trimmed);
      if (titleMatch) {
        title = titleMatch[1]?.trim() ?? '';
        continue;
      }
    }

    // 解析行内的 [Chord] 标签
    let cleanLine = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    BRACKET_CHORD_REGEX.lastIndex = 0;

    while ((match = BRACKET_CHORD_REGEX.exec(raw)) !== null) {
      const chordName = match[1]?.trim() ?? '';
      if (isValidChordName(chordName)) {
        hasValidChords = true;
        cleanLine += raw.slice(lastIndex, match.index);
        const charIdx = cleanLine.length;
        slots.push({
          lineIdx,
          type: charIdx === 0 ? 'start' : 'char',
          index: charIdx,
          chord: createFallbackPortableChord(chordName),
        });
        lastIndex = match.index + match[0].length;
      }
    }
    cleanLine += raw.slice(lastIndex);

    if (cleanLine.trim()) meaningfulContentCount++;
    cleanLyricsLines.push(cleanLine);
    lineIdx++;
  }

  // 判定门槛：至少含有合法和弦记号，或者至少有两行有意义的歌词内容且总长度 > 6
  if (!hasValidChords && (meaningfulContentCount < 2 || text.trim().length < 6)) {
    return null;
  }

  return {
    title,
    playKey,
    capo: clamp(Number.isFinite(capoNum) ? capoNum : 0, 0, 12) as Capo,
    lyrics: cleanLyricsLines.join('\n'),
    slots,
  };
};

/** 序列化乐谱为文字（含歌词与全部和弦槽位，按字典化紧凑格式输出） */
export const serializeSongToText = (song: Song, resolver: (id: ChordId) => Chord | undefined): string => {
  const lines = [HEADER_SONG, `TITLE:${song.title}`, `PLAYKEY:${song.playKey}`, `CAPO:${song.capo}`];

  const steps = extractSongChordSequence(song, resolver);
  if (steps.length > 0) {
    lines.push('CHORDS:');
    // 字典化：按和弦字段去重，提取 alias 映射
    const chordDict = new Map<string, { key: string; chord: Chord }>();
    const usedKeys = new Set<string>();

    for (const step of steps) {
      const fields = serializeChordFields(step.chord);
      if (!chordDict.has(fields)) {
        const baseName = getChordName(step.chord, { useUnicode: false }) || 'Chord';
        let key = baseName;
        let counter = 2;
        while (usedKeys.has(key)) {
          key = `${baseName}_${counter++}`;
        }
        usedKeys.add(key);
        chordDict.set(fields, { key, chord: step.chord });
      }
    }

    for (const [fields, { key }] of chordDict) {
      lines.push(`${key}=${fields}`);
    }

    lines.push('LYRICS:');
    if (song.lyrics) lines.push(...song.lyrics.split('\n'));

    lines.push('SLOTS:');
    for (const step of steps) {
      const lineIdx = (song.lineIds ?? []).indexOf(step.lineId as LineId);
      if (lineIdx === -1) continue;
      const fields = serializeChordFields(step.chord);
      const alias = chordDict.get(fields)?.key ?? '';
      lines.push(`${lineIdx}:${step.type}:${step.index}:${alias}`);
    }
  } else {
    lines.push('LYRICS:');
    if (song.lyrics) lines.push(...song.lyrics.split('\n'));
  }

  return lines.join('\n');
};

const SLOT_RE = /^(\d+):(char|start|end):(\d+):(.*)$/;

/** 解析乐谱文字；返回 PortableSong 或错误分类（槽位越界/字段非法只跳过单条） */
export const parseSongFromText = (text: string): TextParseResult<PortableSong> => {
  // 归一化 CRLF/CR 换行：Windows 剪贴板可能带 \r，导致段标记匹配失败
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const header = lines[0]?.trim() ?? '';
  if (header === HEADER_CHORD) return { ok: false, reason: 'WRONG_TYPE' };

  if (header !== HEADER_SONG) {
    // 智能宽容解析：尝试从非 FLSONG 的普通歌词或带 [Chord] 文本导入
    const smart = parseSmartSongFromText(text);
    if (smart) return { ok: true, data: smart };
    return { ok: false, reason: classifyHeader(header) };
  }

  let title = '';
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
      if (trimmed.startsWith('TITLE:')) {
        title = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('PLAYKEY:')) {
        playKey = trimmed.slice(8).trim();
      } else if (trimmed.startsWith('CAPO:')) {
        capoNum = Number(trimmed.slice(5));
      } else if (trimmed === 'CHORDS:') {
        section = 'chords';
      } else if (trimmed === 'LYRICS:') {
        section = 'lyrics';
      }
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
        if (chord) {
          slots.push({ lineIdx: Number(m[1]), type: m[2] as 'char' | 'start' | 'end', index: Number(m[3]), chord });
        }
      }
      continue;
    }

    if (section === 'lyrics') {
      if (trimmed === 'SLOTS:') {
        section = 'slots';
      } else if (trimmed === 'CHORDS:') {
        // 兼容旧版：旧版格式中 CHORDS: 在 LYRICS: 之后
        section = 'chords';
      } else {
        lyricsLines.push(raw);
      }
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
      playKey,
      capo: clamp(Number.isFinite(capoNum) ? capoNum : 0, 0, 12) as Capo,
      lyrics,
      slots,
    },
  };
};
