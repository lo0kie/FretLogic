import type { Capo, Chord, ChordId, Group, GroupId, GuitarStringsModel, Song, SongId, StringIndex } from '@/types';
import { GroupSortRule } from '@/types';
import { generateUUID } from '@/utils/core/common';

/** 按排序规则构造合法 Group 变体：非 KEY_DEGREE 一律不携带 sortKey。
 * 时间戳可缺省（补齐前为 0，由 fillMissingTimestamps 识别并补全合法值）。 */
export const buildGroupVariant = (
  base: { id: string; name: string; createdAt?: number; updatedAt?: number },
  sortRule: GroupSortRule,
  rawSortKey?: unknown
): Group => {
  const brandedBase = {
    ...base,
    id: toGroupId(base.id),
    createdAt: base.createdAt ?? 0,
    updatedAt: base.updatedAt ?? 0,
  };
  if (sortRule === GroupSortRule.KEY_DEGREE) {
    return { ...brandedBase, sortRule, sortKey: typeof rawSortKey === 'string' && rawSortKey ? rawSortKey : 'C' };
  }
  return { ...brandedBase, sortRule };
};

/** 安全读取分组排序键（仅 KEY_DEGREE 变体携带） */
export const getGroupSortKey = (group: Group): string | undefined =>
  group.sortRule === GroupSortRule.KEY_DEGREE ? group.sortKey : undefined;

/** 品牌 id 转换：仅用于持久化边界（读取/构造实体），内部不产生新 string 直接当 id 用 */
export const toSongId = (value: string): SongId => value as SongId;
export const toChordId = (value: string): ChordId => value as ChordId;
export const toGroupId = (value: string): GroupId => value as GroupId;

/** 新建分组：统一 id 生成与默认排序规则 */
export const createGroup = (name: string, sortRule: GroupSortRule = GroupSortRule.ROOT_PITCH): Group => {
  const now = Date.now();
  return buildGroupVariant({ id: generateUUID(), name, createdAt: now, updatedAt: now }, sortRule);
};

/** 新建乐谱：统一 id 前缀与默认字段 */
export const createSong = (title: string): Song => ({
  id: toSongId('s_' + generateUUID().slice(0, 8)),
  title: title.trim() || '未命名乐谱',
  lyrics: '',
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  lineIds: [],
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/** 由 6 根弦的 [品位, 降号偏好] 数组构造强类型弦模型（固定长度，逐项兜底 -1/false） */
export const toGuitarStringsModel = (strings: Array<[number, boolean]>): GuitarStringsModel => {
  const out: GuitarStringsModel = [
    [strings[0]?.[0] ?? -1, Boolean(strings[0]?.[1])],
    [strings[1]?.[0] ?? -1, Boolean(strings[1]?.[1])],
    [strings[2]?.[0] ?? -1, Boolean(strings[2]?.[1])],
    [strings[3]?.[0] ?? -1, Boolean(strings[3]?.[1])],
    [strings[4]?.[0] ?? -1, Boolean(strings[4]?.[1])],
    [strings[5]?.[0] ?? -1, Boolean(strings[5]?.[1])],
  ];
  return out;
};

/** 新建和弦：统一 id 前缀（'c_'）与必填字段装配 */
export const createChord = (input: {
  nameSegments: Chord['nameSegments'];
  strings: Chord['strings'];
  fretCount: Chord['fretCount'];
  capo: Capo;
  groupId: string;
  tuning: Chord['tuning'];
  rootStringIndex: StringIndex | null;
  /** 显式横按配置（可选，仅自定义横按时传入） */
  barres?: Chord['barres'];
  /** 编辑既有和弦时传入原 id，否则自动生成 */
  id?: string | null;
}): Chord => ({
  id: toChordId(input.id || 'c_' + generateUUID().slice(0, 10)),
  nameSegments: input.nameSegments,
  strings: input.strings,
  fretCount: input.fretCount,
  capo: input.capo,
  groupId: toGroupId(input.groupId),
  tuning: input.tuning,
  rootStringIndex: input.rootStringIndex,
  ...(input.barres !== undefined && input.barres.length > 0 ? { barres: input.barres } : {}),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
