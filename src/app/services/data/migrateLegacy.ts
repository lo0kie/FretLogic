/**
 * localStorage 退役转录：一次性把旧 localStorage 的全部数据搬进 IndexedDB，然后清空 localStorage。
 *
 * 策略（应用已全盘迁移到 IDB，localStorage 不再有任何运行时读写方）：
 * - 启动时检测 kv 镜像中的「已转录」标记，已完成则跳过（幂等）；
 * - 实体（groups/chords/songs）经统一 payload 宽容清洗后原子写入 IDB；
 * - 其余键（偏好/UI 态）按原始字符串原样写入 kv 镜像（useStorage 后端）；
 * - 敏感键（如历史版本遗留的 WebDAV 密码）不转录、直接丢弃；
 * - 全部写入成功后 localStorage.clear()，并写入标记；校验失败则不清空，下次启动重试。
 */
import { chordRepository, songRepository } from '@/app/services/data/repositories';
import { toSongId } from '@/domains/score/model/scoreModel';
import { flushIdbKv, kvGet, kvSet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/** 转录完成标记（存于 kv 镜像，随 IDB 落盘） */
const RETIRED_FLAG_KEY = 'localStorage-retired';

/** 不转录进 kv 的键：历史版本遗留的敏感信息（密码曾落 localStorage，迁移时丢弃） */
const EXCLUDED_KEYS: ReadonlySet<string> = new Set([STORAGE_KEYS.WEBDAV_PASSWORD]);

const SONG_ENTRY_PREFIX = `${STORAGE_KEYS.SONG_ENTRY}:`;

const parseJson = (raw: string | undefined): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

export interface TranscriptionResult {
  groups: number;
  chords: number;
  songs: number;
  /** 转录进 kv 的偏好/UI 态键数量 */
  kvKeys: number;
}

/**
 * 执行 localStorage → IDB 的一次性转录；无可转录内容或已完成时返回 null。
 * 抛错仅在上游（bootstrap）兜底记录，绝不让转录失败阻断应用启动。
 */
export async function transcribeLegacyLocalStorage(): Promise<TranscriptionResult | null> {
  if (typeof localStorage === 'undefined') return null;
  if (kvGet(RETIRED_FLAG_KEY) === '1') return null;

  // 一次性快照：后续 clear 之前不再二次触碰 localStorage，保证读到的是同一份数据
  const entries = new Map<string, string>();
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key !== null) {
      const value = localStorage.getItem(key);
      if (value !== null) entries.set(key, value);
    }
  }

  const rawGroups = parseJson(entries.get(STORAGE_KEYS.GROUPS));
  const rawChords = parseJson(entries.get(STORAGE_KEYS.CHORD_LIST));
  const rawSongs: unknown[] = [];
  for (const [key, value] of entries) {
    if (key.startsWith(SONG_ENTRY_PREFIX)) {
      const song = parseJson(value);
      if (song && typeof song === 'object') rawSongs.push(song);
    }
  }
  const legacySongs = parseJson(entries.get(STORAGE_KEYS.SONGS));
  if (Array.isArray(legacySongs)) rawSongs.push(...legacySongs);

  const hasEntityData = entries.has(STORAGE_KEYS.GROUPS) || entries.has(STORAGE_KEYS.CHORD_LIST) || rawSongs.length > 0;

  let entityCounts = { groups: 0, chords: 0, songs: 0 };
  if (hasEntityData) {
    // 用统一的 payload 宽容清洗/迁移，保证结构合法且不被单条旧脏数据阻塞。
    // 键缺失时缺省为空数组；键存在但数据损坏时，如实传入以触发校验拦截。
    // payload（含 zod）动态加载：转录是一次性历史路径（绝大多数会话在标记检查处提前返回），
    // 静态引入会把 zod 拖进首屏闭包，破坏 check-bundle 的 220KB 首屏预算
    const { validateImportExportPayload } = await import('@/app/services/validation/payload');
    const { isValid, payload, issues } = validateImportExportPayload(
      {
        groups: entries.has(STORAGE_KEYS.GROUPS) ? rawGroups : [],
        chords: entries.has(STORAGE_KEYS.CHORD_LIST) ? rawChords : [],
        songs: rawSongs,
      },
      { mode: 'lenient' }
    );

    if (!isValid || !payload) {
      logger.error('transcribe', '转录旧数据校验失败，保留 localStorage 以便下次启动重试', { issues });
      return null;
    }

    const groups = (payload.groups ?? []) as Group[];
    const chords = (payload.chords ?? []) as Chord[];
    const songs = (payload.songs ?? []) as Song[];

    // 实体先落库（成功后才清空 localStorage）：歌曲与顺序索引走单事务原子写入
    await chordRepository.save({ groups, chords });
    if (songs.length > 0) {
      // 顺序索引：优先取旧分片索引中仍存在的 id，未被索引覆盖的歌曲由读侧兜底追加尾部
      const indexRaw = parseJson(entries.get(STORAGE_KEYS.SONGS_INDEX));
      const songIds = new Set(songs.map(s => s.id));
      const orderIds = Array.isArray(indexRaw)
        ? indexRaw.filter((id): id is string => typeof id === 'string' && songIds.has(toSongId(id)))
        : [];
      await songRepository.flushChanges({ removedIds: [], dirtySongs: songs, orderIds });
    }
    entityCounts = { groups: groups.length, chords: chords.length, songs: songs.length };
  }

  // 其余键原样写入 kv 镜像（偏好/UI 态字符串），敏感键丢弃；
  // 已消费的键记录下来，最后只做精准清除——不使用 localStorage.clear()，
  // 避免同源域名下部署其他应用（子路径共域）时连带清空它们的存储。
  const consumedKeys = new Set<string>([...EXCLUDED_KEYS, STORAGE_KEYS.SONGS_INDEX]);
  let kvKeys = 0;
  for (const [key, value] of entries) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (key === STORAGE_KEYS.GROUPS || key === STORAGE_KEYS.CHORD_LIST) continue;
    if (key === STORAGE_KEYS.SONGS || key.startsWith(SONG_ENTRY_PREFIX) || key === STORAGE_KEYS.SONGS_INDEX) continue;
    kvSet(key, value);
    consumedKeys.add(key);
    kvKeys += 1;
  }
  kvSet(RETIRED_FLAG_KEY, '1');
  await flushIdbKv();

  // 精准清除本应用消费过的键（实体键 + 已转录偏好键 + 丢弃的敏感键）；未知键原样保留
  for (const key of [STORAGE_KEYS.GROUPS, STORAGE_KEYS.CHORD_LIST, STORAGE_KEYS.SONGS]) {
    consumedKeys.add(key);
  }
  for (const key of entries.keys()) {
    if (consumedKeys.has(key) || key.startsWith(SONG_ENTRY_PREFIX)) localStorage.removeItem(key);
  }

  const result: TranscriptionResult = {
    groups: entityCounts.groups,
    chords: entityCounts.chords,
    songs: entityCounts.songs,
    kvKeys,
  };
  logger.info(
    'transcribe',
    `localStorage 退役转录完成：实体 ${entityCounts.groups} 组 / ${entityCounts.chords} 和弦 / ${entityCounts.songs} 乐谱，` +
      `kv 迁移 ${kvKeys} 键，localStorage 已精准清除`
  );
  return result;
}
