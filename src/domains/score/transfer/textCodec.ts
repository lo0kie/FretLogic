/**
 * 乐谱文字传递编解码：把乐谱序列化为纯文本（自包含指法数据），供「复制/粘贴」跨实例精确往返。
 * 单和弦编解码已下沉和弦域（domains/chord/transfer/chordTextCodec），此处复用其字段编解码器，
 * 并转发和弦 API 以兼容既有导入路径。格式魔数见 TEXT_FORMAT（platform/utils/constants）。
 */
import { getChordName, getDefaultTuningForStringCount, isValidChordName } from '@/domains/chord/theory/theory';
import {
  parseChordFields,
  serializeChordFields,
  type PortableChord,
  type TextParseResult,
} from '@/domains/chord/transfer/chordTextCodec';
import type { Chord, ChordId } from '@/domains/chord/types';
import { extractSongChordSequence } from '@/domains/score/model/chordSlots';
import type { Capo, LineId, Song } from '@/domains/score/types';
import { clamp } from '@/platform/utils/common';
import { TEXT_FORMAT } from '@/platform/utils/constants';

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
  playKey: string;
  capo: Capo;
  lyrics: string;
  slots: PortableSongSlot[];
}

const HEADER_CHORD = `${TEXT_FORMAT.CHORD} ${TEXT_FORMAT.VERSION}`;
const HEADER_SONG = `${TEXT_FORMAT.SONG} ${TEXT_FORMAT.VERSION}`;

/** 识别头部魔数：本应用格式但版本/魔数不符时为 INVALID_HEADER，否则 UNKNOWN_FORMAT */
const classifyHeader = (header: string): 'UNKNOWN_FORMAT' | 'INVALID_HEADER' => {
  if (header.startsWith(TEXT_FORMAT.CHORD) || header.startsWith(TEXT_FORMAT.SONG)) return 'INVALID_HEADER';
  return 'UNKNOWN_FORMAT';
};

/**
 * 智能宽容解析：从普通歌词文本或内嵌 [Chord] 格式提取歌词与槽位。
 * 支持：
 * - 标准内嵌和弦：`[C]故事的小黄花 从出生那年[G]就飘着`
 * - ChordPro 标签：`{title: 晴天}`、`{t: 晴天}`、`{key: C}`、`{capo: 1}`
 * - 纯歌词多行文本（无和弦时纯导入歌词）
 */
const BRACKET_CHORD_REGEX = /\[([A-Ga-g][#b]?(?:[a-zA-Z0-9#b/()（）+ø°△\-^]){0,15})\]/gi;
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
