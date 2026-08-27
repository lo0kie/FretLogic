import type { Chord, Group, Song } from '@/types';
import { GroupSortRule } from '@/types';
import { generateUUID } from '@/utils/core/common';

/** 新建分组：统一 id 生成与默认排序规则 */
export const createGroup = (name: string, sortRule: GroupSortRule = GroupSortRule.ROOT_PITCH): Group => ({
  id: generateUUID(),
  name,
  sortRule,
});

/** 新建乐谱：统一 id 前缀与默认字段 */
export const createSong = (title: string): Song => ({
  id: 's_' + generateUUID().slice(0, 8),
  title: title.trim() || '未命名乐谱',
  lyrics: '',
  playKey: 'C',
  capo: 0,
  chordMap: {},
  lineIds: [],
  version: 1,
});

/** 新建和弦：统一 id 前缀（'c_'）与必填字段装配 */
export const createChord = (input: {
  nameSegments: Chord['nameSegments'];
  strings: Chord['strings'];
  fretCount: Chord['fretCount'];
  capo: number;
  groupId: string;
  tuning: Chord['tuning'];
  rootStringIndex: number | null;
  /** 编辑既有和弦时传入原 id，否则自动生成 */
  id?: string | null;
}): Chord => ({
  id: input.id || 'c_' + generateUUID().slice(0, 10),
  nameSegments: input.nameSegments,
  strings: input.strings,
  fretCount: input.fretCount,
  capo: input.capo,
  groupId: input.groupId,
  tuning: input.tuning,
  rootStringIndex: input.rootStringIndex,
});
