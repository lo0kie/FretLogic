import { fillMissingTimestamps } from '@/domains/chord/model/chordRepository';
import { isCapoValue } from '@/domains/fretboard/model/coordinates';
import { isValidTimeSignature } from '@/domains/score/constants';
import { plainToChordMap, pruneOrphanChordRefs } from '@/domains/score/model/chordSlots';
import { toSongId } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';
import { toPlainPersistable } from '@/platform/utils/common';

import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const sanitizeChordMap = (chordMap: unknown): Map<LineId, ChordLineSlots> =>
  // 兼容旧扁平对象 / 新嵌套对象 / 嵌套 Map 三态；key/value 已通过 plainToChordMap 过滤，品牌收窄信任该过滤
  plainToChordMap(chordMap) as Map<LineId, ChordLineSlots>;

export type SongDraft = Omit<Song, 'createdAt' | 'updatedAt'> & Partial<Pick<Song, 'createdAt' | 'updatedAt'>>;

export const sanitizeSongEntity = (raw: unknown): SongDraft | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  if (typeof raw['title'] !== 'string') return null;

  const legacyKey = typeof raw['key'] === 'string' && raw['key'] ? raw['key'] : 'C';
  const song: SongDraft = {
    id: toSongId(raw['id']),
    title: raw['title'],
    lyrics: typeof raw['lyrics'] === 'string' ? raw['lyrics'] : '',
    // 旧持久化数据无 singer 字段：清洗层自动补齐空串，无迁移成本
    singer: typeof raw['singer'] === 'string' ? raw['singer'] : '',
    // 旧持久化数据无 originalKey 字段：同上自动补齐空串
    originalKey: typeof raw['originalKey'] === 'string' ? raw['originalKey'] : '',
    // 旧持久化数据无 timeSignature 字段：自动补齐空串；格式校验兜底防脏数据进表头
    timeSignature: isValidTimeSignature(raw['timeSignature']) ? raw['timeSignature'] : '',
    lineIds: Array.isArray(raw['lineIds']) ? (raw['lineIds'].filter(isNonEmptyString) as LineId[]) : [],
    playKey: typeof raw['playKey'] === 'string' && raw['playKey'] ? raw['playKey'] : legacyKey,
    capo: isCapoValue(raw['capo']) ? raw['capo'] : 0,
    chordMap: sanitizeChordMap(raw['chordMap']),
    version: typeof raw['version'] === 'number' && Number.isFinite(raw['version']) ? raw['version'] : 1,
    ...(isValidTimestamp(raw['createdAt']) ? { createdAt: raw['createdAt'] } : {}),
    ...(isValidTimestamp(raw['updatedAt']) ? { updatedAt: raw['updatedAt'] } : {}),
  };
  return song;
};

export const sanitizeSongs = (songs: unknown): SongDraft[] => {
  if (!Array.isArray(songs)) return [];

  const validSongIds = new Set<string>();
  const out: SongDraft[] = [];
  for (const rawSong of songs) {
    const song = sanitizeSongEntity(rawSong);
    if (!song || validSongIds.has(song.id)) continue;
    validSongIds.add(song.id);
    out.push(song);
  }
  return out;
};

export const sanitizeSongList = (songs: unknown[], validChordIds?: Set<string>): Song[] => {
  const drafts = sanitizeSongs(songs);
  const now = Date.now();
  if (!validChordIds) return fillMissingTimestamps(drafts, now);

  return fillMissingTimestamps(
    drafts.map(song => {
      const { map } = pruneOrphanChordRefs(song.chordMap, validChordIds, { preserveUnknown: true });
      return { ...song, chordMap: map as Map<LineId, ChordLineSlots> };
    }),
    now
  );
};

/**
 * 歌曲仓储：IDB（songs 库按歌存单条记录；顺序索引存 syncMeta 的 'song-order' 记录）。
 * IDB getAll 按主键序返回、无法承载手动拖拽顺序，顺序信息独立持久化；索引与歌曲集合
 * 允许短暂不一致（读侧以实际记录为准兜底），批量变更经 flushChanges 单事务原子落库。
 */
export interface SongRepository {
  /** 加载全部歌曲：优先按顺序索引排列，未被索引覆盖的记录追加在尾部 */
  loadSongs(): Promise<Song[]>;
  saveSong(song: Song): Promise<void>;
  removeSong(id: string): Promise<void>;
  /** 写入歌曲顺序索引（syncMeta） */
  saveSongIds(ids: string[]): Promise<void>;
  /** 实际存储中的全部歌曲 id（来自主键扫描，不受索引漂移影响；孤儿清理用） */
  listSongIds(): Promise<string[]>;
  /** 单事务批量刷写：删除 + 脏歌曲 + 顺序索引（可选），保证三者的同生共死 */
  flushChanges(changes: { removedIds: string[]; dirtySongs: Song[]; orderIds?: string[] }): Promise<void>;
}

const SONG_ORDER_META_KEY = 'song-order';

interface SongOrderMeta {
  name: typeof SONG_ORDER_META_KEY;
  ids: string[];
}

export const songRepository: SongRepository = {
  async loadSongs() {
    const [stored, orderMeta] = await Promise.all([idb.getAll('songs'), idb.get('syncMeta', SONG_ORDER_META_KEY)]);
    const sanitized = sanitizeSongList(stored);
    const metaIds = orderMeta?.ids;
    const ids = Array.isArray(metaIds) ? metaIds : [];
    const byId = new Map(sanitized.map(song => [song.id, song]));
    // 索引命中者按索引序输出；索引缺失/漂移的记录追加尾部，绝不因索引损坏而丢歌
    const ordered = ids.flatMap(id => {
      const songId = toSongId(id);
      const song = byId.get(songId);
      byId.delete(songId);
      return song ? [song] : [];
    });
    return [...ordered, ...byId.values()];
  },
  async saveSong(song) {
    // toRaw：store 传入的可能是响应式代理，Proxy 无法被 IDB structuredClone（DataCloneError）
    await idb.put('songs', toPlainPersistable(song));
  },
  async removeSong(id) {
    await idb.delete('songs', id);
  },
  async saveSongIds(ids) {
    const meta: SongOrderMeta = { name: SONG_ORDER_META_KEY, ids };
    await idb.put('syncMeta', meta);
  },
  async listSongIds() {
    const keys = await idb.getAllKeys('songs');
    return keys.filter((key): key is string => typeof key === 'string');
  },
  async flushChanges({ removedIds, dirtySongs, orderIds }) {
    await idb.runTx(['songs', 'syncMeta'], 'readwrite', get => {
      const songStore = get('songs');
      for (const id of removedIds) songStore.delete(id);
      for (const song of dirtySongs) songStore.put(toPlainPersistable(song));
      if (orderIds) {
        const meta: SongOrderMeta = { name: SONG_ORDER_META_KEY, ids: orderIds };
        get('syncMeta').put(meta);
      }
    });
  },
};
