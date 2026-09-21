/**
 * 备份包「原始 / 未知结构」的形状别名。
 *
 * 从 payload.ts 抽出（原 22~26 行）：版本迁移与实体清洗两条路径都要用（迁移读旧字段、清洗做防御性收敛），
 * 放这里让两边共用同一份定义，避免各自复写后漂移。
 */

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/** 旧/未知结构的数据（含历史遗留字段），用于防御性清洗 */
export type RawRecord = Record<string, unknown>;
export type RawGroup = Partial<Group> & RawRecord;
export type RawChord = Partial<Chord> & RawRecord;
export type RawSong = Partial<Song> & RawRecord;
