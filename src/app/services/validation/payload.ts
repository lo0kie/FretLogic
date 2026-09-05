import type { AppPreferencesBackup, ImportExportPayload, SyncSettingsBackup } from '@/app/types';
import { getChordName, nameToSegments } from '@/domains/chord/theory/theory';
import type { Chord, ChordNameSegments, Group } from '@/domains/chord/types';
import { pruneOrphanChordRefs } from '@/domains/score/model/chordSlots';
import type { Song } from '@/domains/score/types';
import { cloneDeep } from '@/platform/utils/common';

import {
  dedupeChordsByFingerprint,
  fillMissingTimestamps,
  sanitizeChordEntity,
  sanitizeGroupEntity,
  sanitizeSongEntity,
  type GroupDraft,
  type SongDraft,
} from './persistedData';

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
      if (
        Array.isArray(chord.strings) &&
        chord.strings.length >= 3 &&
        chord.strings.length <= 10 &&
        chord.strings.some(s => !Array.isArray(s))
      ) {
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

export interface PayloadValidationResult {
  isValid: boolean;
  payload?: ImportExportPayload;
  issues: string[];
  /** 非阻断的自动清理提示（去重 / 剪枝失效引用）；调用方应向用户展示 */
  warnings?: string[];
}

/** @deprecated 请改用 {@link PayloadValidationResult}。保留别名以便存量导入平滑迁移。 */
export type { PayloadValidationResult as ValidationResult };
/** 清洗备份包中的分组列表：结构非法的条目在 strict 模式记入 issues，在 lenient 模式记入 warnings 并丢弃。 */
const sanitizeGroups = (
  groups: unknown,
  issues: string[],
  warnings: string[],
  mode: 'strict' | 'lenient'
): GroupDraft[] => {
  if (!Array.isArray(groups)) {
    issues.push('groups 字段必须为数组');
    return [];
  }
  const result: GroupDraft[] = [];
  for (let index = 0; index < groups.length; index++) {
    const g = groups[index] as RawGroup;
    if (!g || typeof g !== 'object' || typeof g.id !== 'string' || typeof g.name !== 'string') {
      const msg = `groups[${index}] 结构损坏，缺失必要属性`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
      continue;
    }
    const entity = sanitizeGroupEntity(g);
    if (entity) {
      result.push(entity);
    } else {
      const msg = `groups[${index}] 实体构造失败`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
    }
  }
  return result;
};

/** 清洗备份包中的和弦列表：逐项校验结构，旧数据仅有 chordName 时兜底解析分片；lenient 模式跳过单条坏数据并记录 warning。 */
const sanitizeChords = (chords: unknown, issues: string[], warnings: string[], mode: 'strict' | 'lenient'): Chord[] => {
  if (!Array.isArray(chords)) {
    issues.push('chords 字段必须为数组');
    return [];
  }

  const result: Chord[] = [];
  for (let index = 0; index < chords.length; index++) {
    const c = chords[index] as RawChord;
    if (!c || typeof c !== 'object') {
      const msg = `chords[${index}] 不是有效的对象`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
      continue;
    }
    if (typeof c.id !== 'string' || typeof c.groupId !== 'string' || (!c['chordName'] && !c.nameSegments)) {
      const msg = `chords[${index}] (${c.id || index}) 缺失基础识别属性`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
      continue;
    }
    if (!Array.isArray(c.strings) || c.strings.length < 3 || c.strings.length > 10) {
      const msg = `chords[${index}] (${c.id}) 琴弦数组损坏 (琴弦数量须在 3-10 之间)`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
      continue;
    }
    // 二维数组校验：每项必须是 [fret, preferFlat] 元组，音品非负或 -1
    const isStringsValid = c.strings.every(
      (s): s is [number, boolean] =>
        Array.isArray(s) &&
        s.length === 2 &&
        typeof s[0] === 'number' &&
        Number.isFinite(s[0]) &&
        s[0] >= -1 &&
        typeof s[1] === 'boolean'
    );
    if (!isStringsValid) {
      const msg = `chords[${index}] (${c.id}) 内部存在损坏的琴弦节点`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
      continue;
    }

    // 兼容边界：旧数据可能仅有 chordName，先解析出 nameSegments 再进清洗内核
    const rawName = typeof c['chordName'] === 'string' ? c['chordName'].trim() : '';
    let nameSegments: ChordNameSegments | null = c.nameSegments ?? null;

    if (!nameSegments && rawName) {
      nameSegments = nameToSegments(rawName);
      if (!nameSegments) {
        warnings.push(`和弦「${rawName}」(ID: ${c.id}) 名称解析失败，已记录并重置为默认根音 C`);
        nameSegments = { root: ['C', 0] };
      }
    } else if (!nameSegments) {
      warnings.push(`和弦 (ID: ${c.id}) 缺失名称信息，已重置为默认根音 C`);
      nameSegments = { root: ['C', 0] };
    }

    // 字段收口与旧字段清理统一交由共享实体内核（repair 模式）
    const chord = sanitizeChordEntity({ ...c, nameSegments }, { mode: 'repair' });
    if (chord) {
      result.push(chord);
    } else {
      const msg = `chords[${index}] (${c.id}) 实体归一化失败`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
    }
  }

  return result;
};

/** 清洗备份包中的歌曲列表：结构非法的条目在 strict 模式记入 issues，在 lenient 模式记入 warnings 并丢弃。 */
const sanitizeSongs = (
  songs: unknown,
  issues: string[],
  warnings: string[],
  mode: 'strict' | 'lenient'
): SongDraft[] => {
  if (songs === undefined) return [];
  if (!Array.isArray(songs)) {
    issues.push('songs 字段必须为数组');
    return [];
  }
  const result: SongDraft[] = [];
  for (let index = 0; index < songs.length; index++) {
    const s = songs[index] as RawSong;
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.title !== 'string') {
      const msg = `songs[${index}] 结构损坏，缺失必要识别属性`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
      continue;
    }
    const song = sanitizeSongEntity(s);
    if (song) {
      result.push(song);
    } else {
      const msg = `songs[${index}] (${s.id}) 实体处理失败`;
      if (mode === 'strict') {
        issues.push(msg);
      } else {
        warnings.push(`${msg}，已跳过`);
      }
    }
  }
  return result;
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
  'giteeToken',
  'giteeOwner',
  'giteeRepo',
  'giteeBranch',
  'giteePath',
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
  if (
    source['syncTarget'] === 'github' ||
    source['syncTarget'] === 'gitee' ||
    source['syncTarget'] === 'webdav' ||
    source['syncTarget'] === 'server'
  ) {
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
const PREFERENCE_BOOLEAN_FIELDS = ['workbenchChordShorthand', 'scoreChordShorthand'] as const;

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
  if (source['scoreLayoutAlign'] === 'start' || source['scoreLayoutAlign'] === 'center') {
    result.scoreLayoutAlign = source['scoreLayoutAlign'];
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export interface ValidatePayloadOptions {
  /**
   * 清洗校验模式：
   * - 'strict'（默认）：适用于外部文件导入与云端拉取，任意单条记录损坏即标记 isValid: false 并返回 issues
   * - 'lenient'：适用于本地备份导出、云同步推送、旧版迁移，单条损坏记录被跳过并记入 warnings，不阻断整体流程
   */
  mode?: 'strict' | 'lenient';
}

/**
 * 校验并清洗导入/导出/云同步的数据包：
 * 1) 版本逐级迁移到当前格式；2) 分组/和弦/歌曲/配置逐项清洗；
 * 3) 剔除悬空分组下的孤儿和弦、同组重复指纹、歌曲内失效引用。
 * 自动清理以 warnings 返回；仅根结构损坏或 strict 模式下的单条损坏以 issues 返回。
 */
export const validateImportExportPayload = (
  data: unknown,
  options?: ValidatePayloadOptions
): PayloadValidationResult => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, issues: ['检测到数据资产并非有效对象'] };
  }
  const mode = options?.mode ?? 'strict';
  const issues: string[] = [];
  const warnings: string[] = [];
  const raw = cloneDeep(data as RawRecord);
  // 先迁移旧版本到当前格式，再做结构校验（校验只认当前格式）
  const migrated = migratePayloadVersion(raw as unknown as ImportExportPayload);
  const now = Date.now();
  // Group 为判别联合，交叉类型无法被 TS 自动收敛，时间戳补齐后信任收窄（校验边界）
  const groups = fillMissingTimestamps(sanitizeGroups(migrated.groups, issues, warnings, mode), now) as Group[];
  const chords = fillMissingTimestamps(sanitizeChords(migrated.chords, issues, warnings, mode), now);
  const songs =
    migrated.songs !== undefined
      ? fillMissingTimestamps(sanitizeSongs(migrated.songs, issues, warnings, mode), now)
      : [];
  const syncSettings = sanitizeSyncSettings(migrated.syncSettings);
  const preferences = sanitizePreferences(migrated.preferences);
  if (issues.length > 0) {
    return { isValid: false, issues, ...(warnings.length > 0 ? { warnings } : {}) };
  }
  const validGroupIds = new Set(groups.map(g => g.id));
  const orphanChords = chords.filter(c => !validGroupIds.has(c.groupId));
  const filteredChords = chords.filter(c => validGroupIds.has(c.groupId));
  if (orphanChords.length > 0) {
    warnings.push(`检测并清除了 ${orphanChords.length} 个所属分组不存在的孤儿和弦`);
  }

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

  // 自动清理（去重 / 剪枝失效引用 / 和弦名重置）不阻断导入，但必须可见，避免用户以为数据完好
  if (dupes.length > 0) {
    warnings.push(`丢弃了 ${dupes.length} 个同组重复指纹的和弦`);
  }
  if (prunedRefCount > 0) {
    warnings.push(`清除了 ${prunedRefCount} 个指向不存在和弦的引用`);
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

export interface ParsePayloadResult {
  payload?: ImportExportPayload;
  /** 解析失败类型：EMPTY=空串 / INVALID_JSON=非合法 JSON / INVALID_SCHEMA=结构校验失败 */
  error?: 'EMPTY' | 'INVALID_JSON' | 'INVALID_SCHEMA';
  /** 非阻断的自动清理提示（去重 / 剪枝失效引用），调用方应向用户展示 */
  warnings?: string[];
}

/**
 * 解析原始字符串为经校验清洗的备份包。
 * 统一「空串 / 非法 JSON / 结构校验失败」的错误分类，供文件导入与云同步两条入口共用；
 * 各入口自行把 error 类型映射为 toast 或 SyncError。
 */
export const parseAndValidatePayload = (raw: string): ParsePayloadResult => {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'EMPTY' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: 'INVALID_JSON' };
  }
  const { isValid, payload, warnings } = validateImportExportPayload(parsed);
  if (!isValid || !payload) return { error: 'INVALID_SCHEMA' };
  return { payload, ...(warnings && warnings.length > 0 ? { warnings } : {}) };
};
