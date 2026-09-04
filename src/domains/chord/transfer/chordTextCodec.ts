/**
 * 和弦文字编解码：把和弦序列化为纯文本（自包含指法数据）或从文本解析回来，
 * 供「复制/粘贴」在应用实例之间精确往返。格式魔数见 TEXT_FORMAT（platform/utils/constants）。
 * 本模块为零 store 依赖的纯函数，可直接单测；乐谱编解码（score/transfer/textCodec）
 * 复用本模块导出的字段编解码器。
 */
import {
  getChordName,
  getDefaultTuningForStringCount,
  isValidChordName,
  nameToSegments,
  TUNING_PRESETS,
} from '@/domains/chord/theory/theory';
import type { Tuning } from '@/domains/chord/theory/theory';
import type { Chord } from '@/domains/chord/types';
import type { BarreEntity, FretOffset, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';
import { clamp } from '@/platform/utils/common';
import { TEXT_FORMAT } from '@/platform/utils/constants';

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

export type TextParseReason = 'UNKNOWN_FORMAT' | 'WRONG_TYPE' | 'INVALID_HEADER' | 'INVALID_NAME' | 'INVALID_FIELD';

export type TextParseResult<T> = { ok: true; data: T } | { ok: false; reason: TextParseReason };

const HEADER_CHORD = `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}`;
/** 乐谱魔数仅用于「类型误判」识别（和弦文本解析器遇到乐谱文本时返回 WRONG_TYPE），不在此解析乐谱内容 */
const HEADER_SONG_MAGIC = `${TEXT_FORMAT.SONG} ${TEXT_FORMAT.VERSION}`;

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

/** 和弦单行紧凑编码（供乐谱 CHORDS 段复用） */
export const serializeChordFields = (chord: Chord): string => {
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

/** 解析和弦单行紧凑编码；字段非法返回 null（供乐谱编解码复用） */
export const parseChordFields = (fields: string): PortableChord | null => {
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
  if (header === HEADER_SONG_MAGIC) return { ok: false, reason: 'WRONG_TYPE' };
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
