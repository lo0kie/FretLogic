/**
 * 旧 localStorage 数据 → v2 IndexedDB 一次性迁移导入。
 *
 * 策略（用户已确认允许换新数据格式）：
 * - 首次启动检测到 IDB 为空且旧 localStorage 有数据时，自动迁移一次；
 * - 迁移成功后在 IDB 写入标记，避免重复导入；
 * - 迁移为「只读读取旧数据 + 清洗 + 写入 IDB」，不删除旧 localStorage（保留回退能力）。
 */
import { idb } from '@/services/storage';
import { validateImportExportPayload } from '@/services/validation/payload';
import type { Chord, Group, Song } from '@/types';
import { STORAGE_KEYS } from '@/utils/core/constants';

import { chordRepository, songRepository } from './repositories';

const MIGRATION_FLAG_KEY = 'legacy-migration-done';

/** 从旧 localStorage 读取任意 JSON；键不存在或解析失败时返回 undefined。 */
function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

const SONG_ENTRY_PREFIX = `${STORAGE_KEYS.SONG_ENTRY}:`;

/** 收集旧版歌曲数据：单曲独立键（SONG_ENTRY 前缀扫描）与旧整表（SONGS）合并返回。 */
function readLegacySongs(storage: Storage): Song[] {
  // 单曲独立键
  const songs: Song[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(SONG_ENTRY_PREFIX)) continue;
    const song = readJson(storage, key);
    if (song && typeof song === 'object') songs.push(song as Song);
  }
  // 旧版整表（迁移源）
  const legacy = readJson(storage, STORAGE_KEYS.SONGS);
  if (Array.isArray(legacy)) songs.push(...(legacy as Song[]));
  return songs;
}

/** 检查是否已完成迁移 */
export async function isLegacyMigrationDone(): Promise<boolean> {
  const flag = await idb.get<{ done: boolean }>('syncMeta', MIGRATION_FLAG_KEY);
  return !!flag?.done;
}

/** 迁移旧数据到 v2；返回迁移了哪些数据（用于提示） */
export async function migrateLegacyData(storage: Storage): Promise<{ groups: number; chords: number; songs: number }> {
  // 幂等：已完成则跳过
  if (await isLegacyMigrationDone()) {
    return { groups: 0, chords: 0, songs: 0 };
  }

  const rawGroups = readJson(storage, STORAGE_KEYS.GROUPS);
  const rawChords = readJson(storage, STORAGE_KEYS.CHORD_LIST);
  const rawSongs = readLegacySongs(storage);

  // 用统一的 payload 清洗/迁移，保证结构合法。
  // 注意：校验语义是「完整备份包」，缺失字段会被判为 issue；迁移前把缺失字段归一化为空数组，
  // 避免「旧数据只有和弦库、没有曲库」这类正常情况被整体拒绝。
  const { isValid, payload } = validateImportExportPayload({
    groups: Array.isArray(rawGroups) ? rawGroups : [],
    chords: Array.isArray(rawChords) ? rawChords : [],
    songs: Array.isArray(rawSongs) ? rawSongs : [],
  });

  if (isValid && payload) {
    const groups: Group[] = payload.groups ?? [];
    const chords: Chord[] = payload.chords ?? [];
    const songs: Song[] = payload.songs ?? [];
    // 仅在确有旧数据时写入；无旧数据不得清空 IDB 已有内容（保持幂等且不破坏既有备份）
    if (groups.length > 0 || chords.length > 0 || songs.length > 0) {
      await chordRepository.saveGroups(groups);
      await chordRepository.saveChords(chords);
      await songRepository.saveSongs(songs);
    }
    await idb.put('syncMeta', { name: MIGRATION_FLAG_KEY, done: true });
    return { groups: groups.length, chords: chords.length, songs: songs.length };
  }

  // 无旧数据也标记完成（避免每次都尝试迁移）
  await idb.put('syncMeta', { name: MIGRATION_FLAG_KEY, done: true });
  return { groups: 0, chords: 0, songs: 0 };
}
