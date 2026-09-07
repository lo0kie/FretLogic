/**
 * 数据层引导（IndexedDB 纯备份，localStorage 为唯一实时权威）
 *
 * 数据流设计（当前阶段）：
 *   UI ──读写──> localStorage（现有 store 同步 API 不变）
 *   localStorage ──> 后台切换/关闭前同步到 IDB（IndexedDB 仅作纯备份，不自动恢复）
 *
 * 说明：启动时不再把 IDB 回填回 localStorage。这样用户清空 localStorage 后，
 * 数据不会因 IDB 备份而"复活"，真正的清空能立即生效。
 * IDB 副本仍完整保留，供将来 store 切换到 v2 契约（Phase 3 逐 feature 迁移）备好数据源。
 */
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';
import { readJsonArray } from '@/platform/utils/storage';

import { migrateLegacyData } from './migrateLegacy.ts';
import { chordRepository, songRepository } from './repositories.ts';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/** 启动引导：仅做一次性旧数据备份迁移（幂等、失败不阻塞）；不回填恢复，避免清空后被备份"复活" */
export async function bootstrapDataLayer(storage: Storage = window.localStorage): Promise<void> {
  try {
    // 旧 localStorage → IDB（一次性迁移，写入备份；IDB 纯备份，不反向回填恢复）
    await migrateLegacyData(storage);
  } catch (error) {
    logger.error('bootstrap', '数据层引导失败（不影响应用运行）', error);
  }
}

/** 把 localStorage 当前数据同步到 IDB（后台切换/关闭前调用） */
export async function syncLocalStorageToIdb(storage: Storage = window.localStorage): Promise<void> {
  try {
    const groups = readJsonArray<Group>(storage, STORAGE_KEYS.GROUPS);
    const chords = readJsonArray<Chord>(storage, STORAGE_KEYS.CHORD_LIST);
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

    // 守卫：源数据整体为空时不得覆盖 IDB 备份。
    // localStorage 被清空或读取异常时，若照写会把完好备份抹掉，导致数据无法找回。
    if (groups.length === 0 && chords.length === 0 && songs.length === 0) {
      logger.warn('sync', 'localStorage 无数据，跳过写入 IndexedDB（保留既有备份）');
      return;
    }

    await chordRepository.saveGroups(groups);
    await chordRepository.saveChords(chords);
    await songRepository.saveSongs(songs);
  } catch (error) {
    logger.error('sync', '同步 localStorage 到 IndexedDB 失败', error);
  }
}
