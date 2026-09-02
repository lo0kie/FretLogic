import type { Tuning } from '@/services/music/theory';
import type { FRET_COUNTS } from '@/utils/core/constants';

import type { Song } from './song';

/** 单根琴弦：[0] 品位（-1 静音 / 0 空弦 / >=1 按品），[1] 是否偏好降号 */
export type GuitarStringEntity = [fret: number, preferFlat: boolean];

/** 六根弦的二维数组（固定长度 6） */
export type GuitarStringsModel = [
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
];

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
  '9sus4',
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
  'madd9',
  'madd11',
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

/** 琴弦索引：0 代表 6 弦（低 E），5 代表 1 弦（高 E） */
export type StringIndex = 0 | 1 | 2 | 3 | 4 | 5;

/** 品牌字符串基础：运行时就是 string，编译期防止不同 id 混用 */
export type Brand<T extends string, B extends string> = T & { readonly __brand: B };

/** 乐谱 id */
export type SongId = Brand<string, 'SongId'>;
/** 和弦 id */
export type ChordId = Brand<string, 'ChordId'>;
/** 分组 id */
export type GroupId = Brand<string, 'GroupId'>;
/** 谱面槽位 key（如 line_x_start_0），由 scoreModel 的构建函数产生 */
export type SlotKey = Brand<string, 'SlotKey'>;

/** 变调夹品位：0 表示不使用；上限 12 与清洗层校验一致 */
export type Capo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 品牌数值：横按所在品位（正整数 >= 1；0 品为变调夹/空弦不属于横按），运行时仍是 number */
export type BarreFret = number & { readonly __brand: 'BarreFret' };

/** 横按描述实体 */
export interface BarreEntity {
  /** 横按所在品位（>= 1；0 品为变调夹/空弦不属于横按） */
  fret: BarreFret;
  /** 横按起始弦索引（0~5，0 代表 6 弦，5 代表 1 弦） */
  fromString: StringIndex;
  /** 横按终止弦索引（0~5，必须 >= fromString） */
  toString: StringIndex;
  /** 可选：指法指序（通常为 1 指 / 食指） */
  finger?: 1 | 2 | 3 | 4;
}

export interface Chord {
  id: ChordId;
  /** 结构化和弦名分片（唯一核心语义真实源），未指定和弦名时为 null */
  nameSegments: ChordNameSegments | null;
  strings: GuitarStringsModel;
  fretCount: (typeof FRET_COUNTS)[number];
  capo: Capo;
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

/** 备份包内嵌的云端同步配置（v5 起随备份导出/导入，恢复后端凭据用） */
export interface SyncSettingsBackup {
  syncTarget?: 'github' | 'webdav' | 'server';
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  githubPath?: string;
  webdavServerUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  webdavUseDefaultProxy?: boolean;
  webdavProxyUrl?: string;
  serverUrl?: string;
  serverToken?: string;
}

/** 备份包内嵌的偏好设置（v6 起随备份导出/导入；不含凭据，云端同步也安全携带） */
export interface AppPreferencesBackup {
  /** 工作台：和弦名使用缩写标记 */
  workbenchChordShorthand?: boolean;
  /** 工作台：显示音名 */
  workbenchShowPitchNames?: boolean;
  /** 乐谱：和弦名使用缩写标记 */
  scoreChordShorthand?: boolean;
  /** 乐谱：显示音名 */
  scoreShowPitchNames?: boolean;
}

/** 备份包结构版本；历史包可能是任意旧版本，迁移链逐级升级到 CURRENT_PAYLOAD_VERSION */
export type PayloadVersion = 1 | 2 | 3 | 4 | 5 | 6;

export interface ImportExportPayload {
  version?: PayloadVersion;
  groups: Group[];
  chords: Chord[];
  songs: Song[];
  syncSettings?: SyncSettingsBackup;
  preferences?: AppPreferencesBackup;
}

export interface GroupedChordCard {
  mainChord: Chord;
  variants: Chord[];
  hasVariants: boolean;
  variantCount: number;
}
