/**
 * 旧 localStorage 数据 → v2 IndexedDB 一次性迁移导入。
 *
 * 策略（用户已确认允许换新数据格式）：
 * - 首次启动检测到 IDB 为空且旧 localStorage 有数据时，自动迁移一次；
 * - 迁移成功后在 IDB 写入标记，避免重复导入；
 * - 迁移为「只读读取旧数据 + 清洗 + 写入 IDB」，不删除旧 localStorage（保留回退能力）。
 */
import { validateImportExportPayload } from '@/app/services/validation/payload';
import { idb } from '@/platform/services/storage';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { readJson } from '@/platform/utils/storage';

import { chordRepository, songRepository } from './repositories.ts';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

const MIGRATION_FLAG_KEY = 'legacy-migration-done';

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

  const hasGroupKey = storage.getItem(STORAGE_KEYS.GROUPS) !== null;
  const hasChordKey = storage.getItem(STORAGE_KEYS.CHORD_LIST) !== null;
  const hasLegacyData = hasGroupKey || hasChordKey || rawSongs.length > 0;

  if (!hasLegacyData) {
    // 确实无旧数据，标记完成避免重复扫描
    await idb.put('syncMeta', { name: MIGRATION_FLAG_KEY, done: true });
    return { groups: 0, chords: 0, songs: 0 };
  }

  // 用统一的 payload 宽容清洗/迁移，保证结构合法且不被单条旧脏数据阻塞。
  // 键缺失时缺省为空数组；键存在但数据损坏时，如实传入以触发校验拦截。
  const groupsInput = hasGroupKey ? rawGroups : [];
  const chordsInput = hasChordKey ? rawChords : [];

  const { isValid, payload, issues } = validateImportExportPayload(
    {
      groups: groupsInput,
      chords: chordsInput,
      songs: rawSongs,
    },
    { mode: 'lenient' }
  );

  if (!isValid || !payload) {
    console.error('[migrateLegacyData] 迁移旧数据校验失败，跳过标记完成以便排查或重试:', issues);
    return { groups: 0, chords: 0, songs: 0 };
  }

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
