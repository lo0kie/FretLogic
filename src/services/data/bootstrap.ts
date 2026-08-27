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
import type { Chord, Group, Song } from '@/types';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { logger } from '@/utils/core/logger';
import { migrateLegacyData } from './migrateLegacy';
import { chordRepository, songRepository } from './repositories';

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

    // 2. IDB → localStorage 回填：仅当 localStorage 为空时回填（localStorage 是 UI 实时权威源，
    //    IDB 只是备份；若 localStorage 已有数据则保留，避免用过期 IDB 备份覆盖用户刚保存的数据）
    const [groups, chords, songs] = await Promise.all([
      chordRepository.loadGroups(),
      chordRepository.loadChords(),
      songRepository.loadSongs(),
    ]);
    // 判断 localStorage 里是否已有键：仅当完全缺失时才回填，避免用过期 IDB 备份覆盖实时数据
    const hasLocalGroups = storage.getItem(STORAGE_KEYS.GROUPS) !== null;
    const hasLocalChords = storage.getItem(STORAGE_KEYS.CHORD_LIST) !== null;
    if (groups.length > 0 && !hasLocalGroups) storage.setItem(STORAGE_KEYS.GROUPS, JSON.stringify(groups));
    if (chords.length > 0 && !hasLocalChords) storage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(chords));
    // 歌曲同样仅在 localStorage 缺失索引时才回填；IDB 为空时不得删除 localStorage 的歌曲
    // （syncLocalStorageToIdb 是异步写 IDB，刷新/退出时可能未完成，IDB 为空只是"尚未同步"，不代表应清空）
    const hasLocalSongsIndex = storage.getItem(STORAGE_KEYS.SONGS_INDEX) !== null;
    if (songs.length > 0 && !hasLocalSongsIndex) {
      storage.setItem(STORAGE_KEYS.SONGS_INDEX, JSON.stringify(songs.map(s => s.id)));
      for (const song of songs) {
        storage.setItem(`${STORAGE_KEYS.SONG_ENTRY}:${song.id}`, JSON.stringify(song));
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
    const songs: Song[] = [];

    // 歌曲按分片存储（SONGS_INDEX + SONG_ENTRY:{id}）
    const indexRaw = storage.getItem(STORAGE_KEYS.SONGS_INDEX);
    if (indexRaw) {
      try {
        const ids = JSON.parse(indexRaw);
        if (Array.isArray(ids)) {
          for (const id of ids) {
            const raw = storage.getItem(`${STORAGE_KEYS.SONG_ENTRY}:${id}`);
            if (raw) {
              try {
                songs.push(JSON.parse(raw) as Song);
              } catch {
                /* 跳过损坏单曲 */
              }
            }
          }
        }
      } catch {
        /* 索引损坏 */
      }
    }

    // fallback: 索引丢失时通过前缀扫描所有已存单曲
    if (songs.length === 0) {
      const prefix = `${STORAGE_KEYS.SONG_ENTRY}:`;
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) {
          const raw = storage.getItem(key);
          if (raw) {
            try {
              songs.push(JSON.parse(raw) as Song);
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
