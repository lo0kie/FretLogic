import { computeChordFingerprint, Tuning } from '@/services/music/theory';
import type { Chord, ChordId, Group, LineId, SlotKey, Song, StringIndex } from '@/types';
import { GroupSortRule } from '@/types';
import { FRET_COUNTS } from '@/utils/core/constants';
import { isCapoValue, normalizeChord } from '@/utils/music/chord-fretboard';
import { buildGroupVariant, toSongId } from '@/utils/music/entityFactories';
import { pruneOrphanChordRefs } from '@/utils/score/chordSlots';

type RawRecord = Record<string, unknown>;

/** 判断值是否为普通对象（非 null、非数组）。 */
const isRecord = (value: unknown): value is RawRecord => !!value && typeof value === 'object' && !Array.isArray(value);

/** 判断值是否为去空格后非空的字符串。 */
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** 合法毫秒时间戳：有限数字且为正 */
const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** 判断值是否为落在 [min, max] 区间内的有限数字。 */
const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** 判断弦实体是否为合法的 [品位, 升降偏好] 元组（品位为 >= -1 的有限数字）。 */
const isValidStringEntity = (value: unknown): value is [number, boolean] => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -1 &&
    typeof value[1] === 'boolean'
  );
};

// ===== 实体级校验内核（单一真相源） =====
// persistedData（localStorage，静默丢弃）与 payload（导入/导出/云同步，issues 收集整包拒绝）
// 共用同一套实体内核，仅在外层包裹不同的失败语义，避免双轨实现漂移。

/** 清洗中间态：时间戳可能缺失，由 fillMissingTimestamps 补齐后得到完整实体 */
export type GroupDraft = Omit<Group, 'createdAt' | 'updatedAt'> & Partial<Pick<Group, 'createdAt' | 'updatedAt'>>;

/** 单个分组清洗内核：非法结构返回 null；时间戳保留合法值，缺失交由 fillMissingTimestamps 补齐 */
export const sanitizeGroupEntity = (raw: unknown): GroupDraft | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || typeof raw['name'] !== 'string') return null;

  const sortRule = Object.values(GroupSortRule).includes(raw['sortRule'] as GroupSortRule)
    ? (raw['sortRule'] as GroupSortRule)
    : GroupSortRule.ROOT_PITCH;
  // buildGroupVariant 显式构造变体，旧数据遗留字段（如 collapsed）不会透传
  const draft = buildGroupVariant({ id: raw['id'], name: raw['name'] }, sortRule, raw['sortKey']);
  if (isValidTimestamp(raw['createdAt'])) draft.createdAt = raw['createdAt'];
  if (isValidTimestamp(raw['updatedAt'])) draft.updatedAt = raw['updatedAt'];
  return draft;
};

/** 解析根音标记弦索引：仅在索引合法（0~5）且指向已按音的弦时保留，否则置 null。 */
const resolveRootStringIndex = (chord: RawRecord): StringIndex | null => {
  const index = chord['rootStringIndex'];
  if (!isBoundedNumber(index, 0, 5) || !Array.isArray(chord['strings'])) return null;

  const stringEntity = chord['strings'][index];
  // isBoundedNumber 已保证 0~5 整数，此处收窄为 StringIndex
  return Array.isArray(stringEntity) && typeof stringEntity[0] === 'number' && stringEntity[0] >= 0
    ? (index as StringIndex)
    : null;
};

/**
 * 单个和弦清洗内核：非法结构返回 null。
 * - strict（localStorage 默认）：品位必须为有限数字，否则丢弃；
 * - repair（导入/同步）：允许品位异常，交由 normalizeChord 兜底为 -1。
 * 内核中的展开透传是刻意的迁移边界：旧字段（chordName/isRoot 等）需进入 normalizeChord 完成升级清理。
 */
export const sanitizeChordEntity = (raw: unknown, options?: { mode?: 'strict' | 'repair' }): Chord | null => {
  const mode = options?.mode ?? 'strict';
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  if (typeof raw['groupId'] !== 'string' || !raw['groupId']) return null;
  if (!raw['chordName'] && !raw['nameSegments']) return null;
  if (!Array.isArray(raw['strings']) || raw['strings'].length !== 6) return null;

  if (mode === 'strict') {
    if (!raw['strings'].every(isValidStringEntity)) return null;
  } else {
    const isStringsValid = raw['strings'].every(
      (s): s is [number, boolean] =>
        Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'boolean'
    );
    if (!isStringsValid) return null;
  }

  const draft: Chord = {
    ...(raw as unknown as Chord),
    nameSegments: (raw['nameSegments'] as Chord['nameSegments']) ?? null,
    fretCount: FRET_COUNTS.includes(raw['fretCount'] as Chord['fretCount'])
      ? (raw['fretCount'] as Chord['fretCount'])
      : 3,
    capo: isCapoValue(raw['capo']) ? raw['capo'] : 0,
    tuning: Object.values(Tuning).includes(raw['tuning'] as Tuning) ? (raw['tuning'] as Tuning) : Tuning.STANDARD,
    rootStringIndex: resolveRootStringIndex(raw),
  };
  const { chord } = normalizeChord(draft);
  return chord;
};

/** 清洗和弦槽位映射：接受 Map 或普通对象，仅保留非空字符串键值对，其余条目丢弃。 */
const sanitizeChordMap = (chordMap: unknown): Map<SlotKey, ChordId> => {
  const collect = (entries: Iterable<[unknown, unknown]>): Map<SlotKey, ChordId> => {
    const out = new Map<SlotKey, ChordId>();
    for (const [key, chordId] of entries) {
      // key/value 校验为非空 string 后信任收窄（SlotKey/ChordId 运行时就是 string）
      if (isNonEmptyString(key) && isNonEmptyString(chordId)) out.set(key as SlotKey, chordId as ChordId);
    }
    return out;
  };

  if (chordMap instanceof Map) return collect(chordMap);
  if (!isRecord(chordMap)) return new Map();
  return collect(Object.entries(chordMap));
};

/** 清洗中间态：时间戳可能缺失，由 fillMissingTimestamps 补齐后得到完整实体 */
export type SongDraft = Omit<Song, 'createdAt' | 'updatedAt'> & Partial<Pick<Song, 'createdAt' | 'updatedAt'>>;

/** 单个乐谱清洗内核：非法结构返回 null；显式构造全部已知字段，不透传未知字段 */
export const sanitizeSongEntity = (raw: unknown): SongDraft | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  if (typeof raw['title'] !== 'string') return null;

  // key 已改为由 playKey + capo 实时派生：旧数据若带 key 且 playKey 缺失则用 key 兜底，随后丢弃
  const legacyKey = typeof raw['key'] === 'string' && raw['key'] ? raw['key'] : 'C';
  const song: SongDraft = {
    id: toSongId(raw['id']),
    title: raw['title'],
    lyrics: typeof raw['lyrics'] === 'string' ? raw['lyrics'] : '',
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

// ===== 数组级清洗（localStorage 链路：静默丢弃非法条目） =====

/** 数组级分组清洗：逐项走实体内核，非法条目静默丢弃（localStorage 链路语义）。 */
const sanitizeGroups = (groups: unknown): GroupDraft[] => {
  if (!Array.isArray(groups)) return [];
  return groups.map(sanitizeGroupEntity).filter((group): group is GroupDraft => group !== null);
};

/**
 * 同组 + 同指纹去重（稳定保序），返回保留项与重复项。
 * persistedData（静默丢弃）与 payload（整包拒绝 + warn）共用同一套去重语义，避免双轨漂移。
 */
export const dedupeChordsByFingerprint = (chords: Chord[]): { kept: Chord[]; dupes: Chord[] } => {
  const seen = new Set<string>();
  const kept: Chord[] = [];
  const dupes: Chord[] = [];

  for (const chord of chords) {
    const fingerprint = `${chord.groupId}::${computeChordFingerprint(chord)}`;
    if (seen.has(fingerprint)) {
      dupes.push(chord);
      continue;
    }
    seen.add(fingerprint);
    kept.push(chord);
  }

  return { kept, dupes };
};

/** 数组级和弦清洗：逐项清洗、过滤悬空分组引用，再做同组指纹去重（strict 模式）。 */
const sanitizeChords = (chords: unknown, validGroupIds: Set<string>): Chord[] => {
  if (!Array.isArray(chords)) return [];

  // 先清洗并按组归属过滤，再交共享去重逻辑（顺序与原内联实现一致）
  const byGroup = chords
    .map(raw => sanitizeChordEntity(raw))
    .filter((chord): chord is Chord => chord !== null && validGroupIds.has(chord.groupId));

  return dedupeChordsByFingerprint(byGroup).kept;
};

/** 数组级歌曲清洗：逐项走实体内核并按 id 去重，非法/重复条目静默丢弃。 */
const sanitizeSongs = (songs: unknown): SongDraft[] => {
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

export interface Timestamped {
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 按数组顺序补全缺失的时间戳：保留已有合法值，缺失项取游标 +1ms。
 * 游标以 now 为起点并吸收已遇到的合法时间戳，保证补全值沿数组严格递增，
 * 且不会造出早于既有数据的时间。
 */
export const fillMissingTimestamps = <T extends Timestamped>(
  items: T[],
  now: number
): (T & Required<Timestamped>)[] => {
  let cursor = now;

  return items.map(item => {
    cursor = isValidTimestamp(item.createdAt) ? Math.max(cursor, item.createdAt) : cursor + 1;

    const createdAt = isValidTimestamp(item.createdAt) ? item.createdAt : cursor;
    const updatedAt = isValidTimestamp(item.updatedAt) ? item.updatedAt : createdAt;

    return { ...item, createdAt, updatedAt } as T & Required<Timestamped>;
  });
};

/**
 * 清洗 localStorage 持久化数据（应用启动入口）：
 * 分组/和弦/歌曲逐层清洗补齐时间戳；和弦指向不存在分组时剔除；
 * 歌曲内指向不存在和弦的引用剪除（未知和弦 id 因快照可能缺失而保留）。
 */
export const sanitizePersistedData = (data: { groups?: unknown; chords?: unknown | null; songs?: unknown }) => {
  const now = Date.now();
  // Group 为判别联合，交叉类型无法被 TS 自动收敛，时间戳补齐后信任收窄（校验边界）
  const groups = fillMissingTimestamps(sanitizeGroups(data.groups), now) as Group[];
  const hasChordSnapshot = data.chords !== null;
  const chords = fillMissingTimestamps(sanitizeChords(data.chords, new Set(groups.map(group => group.id))), now);
  const validChordIds = new Set(chords.map(chord => chord.id));
  const songs = fillMissingTimestamps(
    hasChordSnapshot
      ? sanitizeSongs(data.songs).map(song => {
          const { map } = pruneOrphanChordRefs(song.chordMap, validChordIds, { preserveUnknown: true });
          return { ...song, chordMap: map };
        })
      : sanitizeSongs(data.songs),
    now
  );

  return { groups, chords, songs };
};
