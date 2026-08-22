/**
 * 数据层引导（渐进接线，零破坏）
 *
 * 数据流设计（当前阶段）：
 *   UI ──读──> localStorage（现有 store 同步 API 不变）
 *   UI ──写──> localStorage（现有防抖刷写不变）
 *   IDB ──> 启动时回填 localStorage（迁移的数据真正被 UI 使用）
 *   localStorage ──> 后台切换/关闭前同步到 IDB（IDB 成为权威备份）
 *
 * 这样：迁移导入的数据被 UI 采用；IDB 始终持有完整副本，
 * 为将来 store 切换到 v2 契约（Phase 3 逐 feature 迁移）备好数据源。
 */
import { STORAGE_KEYS } from '@/constants';
import { logger } from '@/core/logger';
import { migrateLegacyData } from './migrateLegacy';
import { chordRepository, songRepository } from './repositories';
import type { Chord, Group, Song } from '@/types';

function readJson<T>(key: string, storage: Storage): T[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** 启动引导：迁移旧数据并回填（幂等、失败不阻塞） */
export async function bootstrapDataLayer(storage: Storage = window.localStorage): Promise<void> {
  try {
    // 1. 旧 localStorage → IDB（一次性迁移）
    await migrateLegacyData(storage);

    // 2. IDB → localStorage 回填：只要 IDB 有数据，就作为 UI 数据源回填
    // （迁移量可能为 0，但 IDB 可能已有此前同步的权威备份）
    const [groups, chords, songs] = await Promise.all([
      chordRepository.loadGroups(),
      chordRepository.loadChords(),
      songRepository.loadSongs(),
    ]);
    if (groups.length > 0) storage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
    if (chords.length > 0) storage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(chords));
    if (songs.length > 0) {
      storage.setItem(STORAGE_KEYS.SONGS_INDEX, JSON.stringify(songs.map(s => s.id)));
      for (const song of songs) {
        storage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:${song.id}`, JSON.stringify(song));
      }
    } else {
      storage.removeItem(STORAGE_KEYS.SONGS_INDEX);
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith(`${STORAGE_KEYS.SONG_ENTRY}:`)) storage.removeItem(key);
      }
    }
    if (groups.length + chords.length + songs.length > 0) {
      logger.info('bootstrap', '已从 IndexedDB 回填数据到 localStorage', {
        groups: groups.length,
        chords: chords.length,
        songs: songs.length,
      });
    }
  } catch (error) {
    logger.error('bootstrap', '数据层引导失败（不影响应用运行）', error);
  }
}

/** 把 localStorage 当前数据同步到 IDB（后台切换/关闭前调用） */
export async function syncLocalStorageToIdb(storage: Storage = window.localStorage): Promise<void> {
  try {
    const groups = readJson<Group>(STORAGE_KEYS.GROUPS, storage);
    const chords = readJson<Chord>(STORAGE_KEYS.CHORD_LIST, storage);
    const songs = readJson<Song>(STORAGE_KEYS.SONGS, storage);
    // 歌曲可能是按 ID 分键存储：SONGS 为空时尝试聚合单曲键
    if (songs.length === 0) {
      const prefix = `${STORAGE_KEYS.SONG_ENTRY}:`;
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) {
          const raw = storage.getItem(key);
          if (raw) {
            try {
              const song = JSON.parse(raw) as Song;
              songs.push(song);
            } catch {
              /* 跳过损坏单曲 */
            }
          }
        }
      }
    }
    await chordRepository.saveGroups(groups);
    await chordRepository.saveChords(chords);
    await songRepository.saveSongs(songs);
  } catch (error) {
    logger.error('sync', '同步 localStorage 到 IndexedDB 失败', error);
  }
}
