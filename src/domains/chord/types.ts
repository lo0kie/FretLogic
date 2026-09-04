import type { Tuning } from '@/domains/chord/theory/theory';
import type { FRET_COUNTS } from '@/domains/fretboard/constants';
import type {
  BarreEntity,
  BarreFret,
  FretOffset,
  GuitarStringEntity,
  GuitarStringsModel,
  StringIndex,
} from '@/domains/fretboard/types';
import type { Brand } from '@/platform/types';

// 重导出琴弦与指板底层物理模型，保持和弦领域的按法语义自洽
export type { BarreEntity, BarreFret, FretOffset, GuitarStringEntity, GuitarStringsModel, StringIndex };

/** 分组排序规则 */
export enum GroupSortRule {
  ROOT_PITCH = 'ROOT_PITCH',
  KEY_DEGREE = 'KEY_DEGREE',
  NAME_ASC = 'NAME_ASC',
}

/** 升降状态：0: 还原/无, 1: 升号(#/♯), -1: 降号(b/♭) */
export type AccidentalType = 0 | 1 | -1;

/** 基础音名 */
export type NaturalPitchLetter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** 根音/低音分片：[基础自然音名, 升降状态] */
export type RootSegment = [natural: NaturalPitchLetter, accidental: AccidentalType];

/** 扩展音/变化音分片：如 [#9] -> [9, 1], [b5] -> [5, -1], [maj7] -> ['maj7', 0] */
export type ExtensionSegment = [degree: number | string, accidental?: AccidentalType];

/** 标准和弦性质全集（值域真相源，含大小写变体；不含空串）。与乐理校验 KNOWN_QUALITIES 对齐 */
export const CHORD_QUALITIES = [
  'm',
  'min',
  '-',
  'maj',
  'Maj',
  'M',
  'Δ',
  '7',
  'maj7',
  'Maj7',
  'M7',
  'Δ7',
  'm7',
  'min7',
  '-7',
  'dim',
  'dim7',
  '°',
  '°7',
  'aug',
  'aug7',
  '+',
  '+7',
  'sus',
  'sus4',
  'sus2',
  '7sus4',
  '7sus2',
  '7sus',
  '9sus4',
  '9sus2',
  '9sus',
  '11sus4',
  '11sus2',
  '11sus',
  '13sus4',
  '13sus2',
  '13sus',
  '5',
  '6',
  'm6',
  'min6',
  '-6',
  '6/9',
  '69',
  'm6/9',
  'm69',
  'min6/9',
  'add9',
  'add2',
  'add4',
  'add11',
  'add13',
  'madd9',
  'madd11',
  'madd13',
  'madd4',
  'madd2',
  '9',
  'm9',
  'min9',
  '-9',
  'maj9',
  'Maj9',
  'M9',
  'Δ9',
  '11',
  'm11',
  'min11',
  '-11',
  'maj11',
  'Maj11',
  'M11',
  'Δ11',
  '13',
  'm13',
  'min13',
  '-13',
  'maj13',
  'Maj13',
  'M13',
  'Δ13',
  'm7b5',
  'm7(b5)',
  'ø',
  'ø7',
  'mMaj7',
  'mmaj7',
  'mM7',
  'mΔ7',
  '-M7',
  '-Δ7',
  'mMaj9',
  'mmaj9',
  'mM9',
  'mΔ9',
  '-M9',
  '-Δ9',
  'mMaj11',
  'mmaj11',
  'mM11',
  'mΔ11',
  '-M11',
  '-Δ11',
  'mMaj13',
  'mmaj13',
  'mM13',
  'mΔ13',
  '-M13',
  '-Δ13',
  'dimMaj7',
  'dimmaj7',
  '°M7',
  '°Δ7',
  'augMaj7',
  'augmaj7',
  '+M7',
  '+Δ7',
  'alt',
  '7alt',
  'no3',
  '(no3)',
  'no5',
  '(no5)',
] as const;

/** 标准和弦性质（值域受约束，防拼写错误；外部输入中的未知残余见 ChordNameSegments.unknownQuality） */
export type ChordQuality = (typeof CHORD_QUALITIES)[number];

/** 结构化和弦名分片 */
export interface ChordNameSegments {
  root: RootSegment;
  /** 已识别的标准性质；解析外部输入时未知残余不落在此字段 */
  quality?: ChordQuality;
  /** 解析外部输入时无法识别的性质残余（仅展示兜底；保存的和弦名经 isValidChordName 校验不会出现） */
  unknownQuality?: string;
  extensions?: ExtensionSegment[];
  bass?: RootSegment;
}

/** 和弦 id */
export type ChordId = Brand<string, 'ChordId'>;

/** 分组 id */
export type GroupId = Brand<string, 'GroupId'>;

export interface Chord {
  id: ChordId;
  /** 结构化和弦名分片（唯一核心语义真实源），未指定和弦名时为 null */
  nameSegments: ChordNameSegments | null;
  strings: GuitarStringsModel;
  fretCount: (typeof FRET_COUNTS)[number];
  /** 品位/把位偏移量（0~12，0 代表从第 1 品起步） */
  fretOffset: FretOffset;
  groupId: GroupId;
  tuning: Tuning;
  /** 根音所在弦的索引（单点标记，替代原来每根弦各自维护的 isRoot）；null 表示未指定根音 */
  rootStringIndex: StringIndex | null;
  /** 横按配置列表（仅手动标记，支持多横按如双横按和弦）；未标记则为空 */
  barres?: BarreEntity[];
  /** 创建时间戳（毫秒）；清洗层保证补齐 */
  createdAt: number;
  /** 最后更新时间戳（毫秒）；清洗层保证补齐 */
  updatedAt: number;
}

interface GroupBase {
  id: GroupId;
  name: string;
  /** 创建时间戳（毫秒）；清洗层保证补齐 */
  createdAt: number;
  /** 最后更新时间戳（毫秒）；清洗层保证补齐 */
  updatedAt: number;
}

/** 分组按排序规则判别：sortKey 仅对 KEY_DEGREE 有意义，其余分支不允许携带 */
export type Group =
  | (GroupBase & { sortRule: GroupSortRule.ROOT_PITCH })
  | (GroupBase & { sortRule: GroupSortRule.KEY_DEGREE; sortKey: string })
  | (GroupBase & { sortRule: GroupSortRule.NAME_ASC });

export interface GroupedChordCard {
  mainChord: Chord;
  variants: Chord[];
  hasVariants: boolean;
  variantCount: number;
}

/** 键盘/指板识别输入音符 */
export interface NoteInput {
  stringIndex: number;
  pitchIndex: number;
  label: string;
}

/** 和弦推导识别引擎结果候选 */
export interface CandidateResult {
  chordName: string;
  rootLabel: string;
  score: number;
  rootPitch: number;
  segments?: ChordNameSegments;
}
