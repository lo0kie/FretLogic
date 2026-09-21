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

/**
 * 结构化和弦名分片。
 *
 * `quality` 声明为 `string`：性质值域的真相源是 `theory/chordQualityAst.ts` 的 `QUALITY_TOKENS`
 * （63 条 token，每条 = 一个配方 + 该配方的全部可接受写法）。这里不再用联合类型收窄，
 * 因为 token 表的写法集合是**可组合**的（`sus4` 拼 `add9` 得 `sus4add9`），
 * 任何封闭枚举都必然漏项 —— 而漏项在类型层表现为「能输入、却存不下」。
 * 合法性由解析器判定（见 `isValidChordName`），不由类型判定。
 */
export interface ChordNameSegments {
  root: RootSegment;
  /** 已识别的标准性质；解析外部输入时未知残余不落在此字段 */
  quality?: string;
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

/**
 * 和弦草稿：清洗层逐字段修历史记录的中间形态——除时间戳外均已合规。
 * 与 `GroupDraft`（chordRepository）/ `SongDraft`（songRepository）同构：
 * `sanitize*Entity` 产出草稿，`fillMissingTimestamps` 才是把草稿落成实体的那一步。
 * 原先清洗入口直接自称返回 `Chord`，掩盖了「时间戳此刻可能仍缺」这一事实。
 */
export type ChordDraft = Omit<Chord, 'createdAt' | 'updatedAt'> & Partial<Pick<Chord, 'createdAt' | 'updatedAt'>>;

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
