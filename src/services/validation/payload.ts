import {
  dedupeChordsByFingerprint,
  fillMissingTimestamps,
  sanitizeChordEntity,
  sanitizeGroupEntity,
  sanitizeSongEntity,
  type GroupDraft,
  type SongDraft,
} from '@/services/validation/persistedData';
import type {
  AppPreferencesBackup,
  Chord,
  ChordNameSegments,
  Group,
  ImportExportPayload,
  Song,
  SyncSettingsBackup,
} from '@/types';
import { cloneDeep } from '@/utils/core/common';
import { pruneOrphanChordRefs } from '@/utils/score/chordSlots';
import { getChordName, nameToSegments } from '@/utils/music/musicTheory';

/** 旧/未知结构的数据（含历史遗留字段），用于防御性清洗 */
type RawRecord = Record<string, unknown>;
type RawGroup = Partial<Group> & RawRecord;
type RawChord = Partial<Chord> & RawRecord;
type RawSong = Partial<Song> & RawRecord;

/** 备份包结构版本：每次结构变更（字段迁移/删除/语义调整）递增 */
export const CURRENT_PAYLOAD_VERSION = 6;

/**
 * 版本迁移：把任意旧版本 payload 逐级升级到当前版本。
 * 每档迁移负责一个具体结构变更，结构稳定后保留空实现作为版本标记。
 */
const PAYLOAD_MIGRATIONS: Record<number, (payload: ImportExportPayload) => void> = {
  1: () => {
    // v1 -> v2：isRoot/label/isAccidental/isInverted/fingerprint 等派生字段已移除，
    // 由 normalizeChord 在 sanitize 阶段统一清理，此处无需额外处理。
  },
  2: (payload: ImportExportPayload) => {
    // v2 -> v3：strings 由对象数组 [{fret, preferFlat}] 改为二维数组 [[fret, preferFlat]]；
    // 同时把历史遗留的数字 id 规范化为字符串（songs.chordMap 引用均为字符串，需保持匹配）
    payload.chords?.forEach(chord => {
      if (!chord || typeof chord !== 'object') return;
      const legacyChord = chord as { id?: unknown };
      if (typeof legacyChord.id === 'number') {
        legacyChord.id = String(legacyChord.id);
      }
      if (Array.isArray(chord.strings) && chord.strings.length === 6 && chord.strings.some(s => !Array.isArray(s))) {
        chord.strings = chord.strings.map(s => {
          const legacy = s as unknown as { fret?: unknown; preferFlat?: unknown };
          return [typeof legacy.fret === 'number' ? legacy.fret : -1, !!legacy.preferFlat];
        }) as Chord['strings'];
      }
    });
  },
  3: (payload: ImportExportPayload) => {
    // v3 -> v4：song.key 移除，改由 playKey + capo 实时派生。
    // sanitizeSongs 会兜底 playKey 并丢弃 key，此处防御性清理旧数据。
    payload.songs?.forEach(song => {
      if (song && typeof song === 'object' && 'key' in song) {
        const legacy = song as unknown as RawSong;
        if (typeof legacy.playKey !== 'string' || !legacy.playKey) {
          legacy.playKey = typeof legacy['key'] === 'string' && legacy['key'] ? legacy['key'] : 'C';
        }
        delete legacy['key'];
      }
    });
  },
  4: () => {
    // v4 -> v5：新增可选 syncSettings（云端同步配置随备份导出/导入），旧包无此字段，无需处理。
  },
  5: () => {
    // v5 -> v6：新增可选 preferences（偏好设置随备份导出/导入），旧包无此字段，无需处理。
  },
};

/** 把输入 payload 版本抬升到当前版本（原地修改 + 返回新 version） */
const migratePayloadVersion = (payload: ImportExportPayload): ImportExportPayload => {
  let version = payload.version ?? 1;
  while (version < CURRENT_PAYLOAD_VERSION) {
    PAYLOAD_MIGRATIONS[version]?.(payload);
    version += 1;
  }
  return { ...payload, version: CURRENT_PAYLOAD_VERSION };
};

export interface ValidationResult {
  isValid: boolean;
  payload?: ImportExportPayload;
  issues: string[];
  /** 非阻断的自动清理提示（去重 / 剪枝失效引用）；调用方应向用户展示 */
  warnings?: string[];
}
/** 清洗备份包中的分组列表：结构非法的条目记入 issues 并丢弃，其余交由实体内核。 */
const sanitizeGroups = (groups: unknown, issues: string[]): GroupDraft[] => {
  if (!Array.isArray(groups)) {
    issues.push('groups 字段必须为数组');
    return [];
  }
  return groups
    .filter((g: RawGroup, index: number): g is RawGroup & { id: string; name: string } => {
      if (!g || typeof g !== 'object' || typeof g.id !== 'string' || typeof g.name !== 'string') {
        issues.push(`groups[${index}] 结构损坏，缺失必要属性`);
        return false;
      }
      return true;
    })
    .map(g => {
      // 分组构造与旧字段清理统一交由共享实体内核（过滤已保证 id/name 合法，内核不会返回 null）
      return sanitizeGroupEntity(g)!;
    });
};

/** 清洗备份包中的和弦列表：逐项校验结构（含 6 弦二维数组），旧数据仅有 chordName 时兜底解析分片。 */
const sanitizeChords = (chords: unknown, issues: string[]): Chord[] => {
  if (!Array.isArray(chords)) {
    issues.push('chords 字段必须为数组');
    return [];
  }

  return (
    chords
      .filter(
        (c: RawChord, index: number): c is RawChord & { id: string; groupId: string; strings: [number, boolean][] } => {
          if (!c || typeof c !== 'object') {
            issues.push(`chords[${index}] 不是有效的对象`);
            return false;
          }
          if (typeof c.id !== 'string' || typeof c.groupId !== 'string' || (!c['chordName'] && !c.nameSegments)) {
            issues.push(`chords[${index}] (${c.id || index}) 缺失基础识别属性`);
            return false;
          }
          if (!Array.isArray(c.strings) || c.strings.length !== 6) {
            issues.push(`chords[${index}] (${c.id}) 琴弦数组损坏 (必须为 6 弦)`);
            return false;
          }
          // 二维数组校验：每项必须是 [fret, preferFlat] 元组
          const isStringsValid = c.strings.every(
            (s): s is [number, boolean] =>
              Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'boolean'
          );
          if (!isStringsValid) {
            issues.push(`chords[${index}] (${c.id}) 内部存在损坏的琴弦节点`);
            return false;
          }
          return true;
        }
      )
      .map(c => {
        // 兼容边界：旧数据可能仅有 chordName，先兜底出 nameSegments 再进清洗内核
        const rawName = typeof c['chordName'] === 'string' ? c['chordName'].trim() : '';
        const nameSegments: ChordNameSegments = c.nameSegments ??
          (rawName ? (nameToSegments(rawName) ?? null) : null) ?? { root: ['C', 0] };

        // 字段收口与旧字段清理统一交由共享实体内核（repair 模式）
        return sanitizeChordEntity({ ...c, nameSegments }, { mode: 'repair' });
      })
      // 空 id 等内核级非法实体在此静默丢弃（与 localStorage 链路语义一致，不进入整包拒绝集合）
      .filter((chord): chord is Chord => chord !== null)
  );
};

/** 清洗备份包中的歌曲列表：结构非法的条目记入 issues 并丢弃，其余交由实体内核。 */
const sanitizeSongs = (songs: unknown, issues: string[]): SongDraft[] => {
  if (songs === undefined) return [];
  if (!Array.isArray(songs)) {
    issues.push('songs 字段必须为数组');
    return [];
  }
  return (
    songs
      .filter((s: RawSong, index: number): s is RawSong & { id: string; title: string } => {
        if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.title !== 'string') {
          issues.push(`songs[${index}] 结构损坏，缺失必要识别属性`);
          return false;
        }
        return true;
      })
      .map(s => {
        // playKey 兜底、字段收口与旧字段清理统一交由共享实体内核
        return sanitizeSongEntity(s);
      })
      // 空 id 等内核级非法实体在此静默丢弃（与 localStorage 链路语义一致，不进入整包拒绝集合）
      .filter((song): song is SongDraft => song !== null)
  );
};
/**
 * 防御性清洗 syncSettings：同步配置属辅助数据，字段损坏只丢弃该字段，
 * 绝不因配置问题拒绝整包导入。仅保留已知字符串字段与合法的 syncTarget。
 */
const SYNC_STRING_FIELDS = [
  'githubToken',
  'githubOwner',
  'githubRepo',
  'githubBranch',
  'githubPath',
  'webdavServerUrl',
  'webdavUsername',
  'webdavPassword',
  'webdavProxyUrl',
  'serverUrl',
  'serverToken',
] as const;

/** 清洗备份包中的同步配置（仅保留已知字段，兼容旧字段名 webdavUseProxy）；无有效字段返回 undefined。 */
const sanitizeSyncSettings = (raw: unknown): SyncSettingsBackup | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as RawRecord;
  const result: SyncSettingsBackup = {};
  if (source['syncTarget'] === 'github' || source['syncTarget'] === 'webdav' || source['syncTarget'] === 'server') {
    result.syncTarget = source['syncTarget'];
  }
  if (typeof source['webdavUseDefaultProxy'] === 'boolean') {
    result.webdavUseDefaultProxy = source['webdavUseDefaultProxy'];
  } else if (typeof source['webdavUseProxy'] === 'boolean') {
    // 兼容旧字段名
    result.webdavUseDefaultProxy = source['webdavUseProxy'];
  }
  for (const field of SYNC_STRING_FIELDS) {
    const value = source[field];
    if (typeof value === 'string') {
      result[field] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

/** 偏好设置字段（全部 boolean） */
const PREFERENCE_BOOLEAN_FIELDS = [
  'workbenchChordShorthand',
  'workbenchShowPitchNames',
  'scoreChordShorthand',
  'scoreShowPitchNames',
] as const;

/**
 * 防御性清洗 preferences：偏好属辅助数据，字段损坏只丢弃该字段，
 * 绝不因偏好问题拒绝整包导入。仅保留已知 boolean 字段。
 */
const sanitizePreferences = (raw: unknown): AppPreferencesBackup | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as RawRecord;
  const result: AppPreferencesBackup = {};
  for (const field of PREFERENCE_BOOLEAN_FIELDS) {
    const value = source[field];
    if (typeof value === 'boolean') {
      result[field] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

/**
 * 校验并清洗导入/导出/云同步的数据包：
 * 1) 版本逐级迁移到当前格式；2) 分组/和弦/歌曲/配置逐项清洗；
 * 3) 剔除悬空分组下的和弦、同组重复指纹、歌曲内失效引用。
 * 自动清理以 warnings 返回而非拒绝导入；结构损坏以 issues 返回并整体拒绝。
 */
export const validateImportExportPayload = (data: unknown): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, issues: ['检测到数据资产并非有效对象'] };
  }
  const issues: string[] = [];
  const raw = cloneDeep(data as RawRecord);
  // 先迁移旧版本到当前格式，再做结构校验（校验只认当前格式）
  const migrated = migratePayloadVersion(raw as unknown as ImportExportPayload);
  const now = Date.now();
  // Group 为判别联合，交叉类型无法被 TS 自动收敛，时间戳补齐后信任收窄（校验边界）
  const groups = fillMissingTimestamps(sanitizeGroups(migrated.groups, issues), now) as Group[];
  const chords = fillMissingTimestamps(sanitizeChords(migrated.chords, issues), now);
  const songs = migrated.songs !== undefined ? fillMissingTimestamps(sanitizeSongs(migrated.songs, issues), now) : [];
  const syncSettings = sanitizeSyncSettings(migrated.syncSettings);
  const preferences = sanitizePreferences(migrated.preferences);
  if (issues.length > 0) {
    return { isValid: false, issues };
  }
  const validGroupIds = new Set(groups.map(g => g.id));
  const filteredChords = chords.filter(c => validGroupIds.has(c.groupId));

  // 同组 + 同指纹去重（与保存及 localStorage 链路共用同一套去重逻辑）
  const { kept: dedupedChords, dupes } = dedupeChordsByFingerprint(filteredChords);
  // 重复项不写入 issues，避免「仅重复」就整包拒绝；需要可观测可 console.warn
  dupes.forEach(c => console.warn(`[validatePayload] 丢弃同组重复指纹: ${getChordName(c)} (${c.id})`));

  const validChordIds = new Set(dedupedChords.map(c => c.id));
  let prunedRefCount = 0;
  const cleanedSongs = songs.map(song => {
    const { map, changed } = pruneOrphanChordRefs(song.chordMap, validChordIds);
    if (!changed) return song;
    prunedRefCount += song.chordMap.size - map.size;
    return { ...song, chordMap: map };
  });

  // 自动清理（去重 / 剪枝失效引用）不阻断导入，但必须可见，避免用户以为数据完好
  const warnings: string[] = [];
  if (dupes.length > 0) {
    warnings.push(`导入时丢弃了 ${dupes.length} 个同组重复指纹的和弦`);
  }
  if (prunedRefCount > 0) {
    warnings.push(`导入时清除了 ${prunedRefCount} 个指向不存在和弦的引用`);
  }

  return {
    isValid: true,
    ...(warnings.length > 0 ? { warnings } : {}),
    payload: {
      version: CURRENT_PAYLOAD_VERSION,
      groups,
      chords: dedupedChords,
      songs: cleanedSongs,
      ...(syncSettings ? { syncSettings } : {}),
      ...(preferences ? { preferences } : {}),
    },
    issues: [],
  };
};
