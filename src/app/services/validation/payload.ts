import { z } from 'zod';

import { isValidEncryptedSecrets } from '@/app/services/backup/backupCrypto';
import { getChordName, nameToSegments } from '@/domains/chord/theory/theory';
import { pruneOrphanChordRefs, remapChordRefs } from '@/domains/score/model/chordSlots';
import { cloneDeep } from '@/platform/utils/common';
import { logger } from '@/platform/utils/logger';

import { CURRENT_PAYLOAD_VERSION, migratePayloadVersion } from './payloadMigrations';
import {
  dedupeChordsByFingerprint,
  fillMissingTimestamps,
  sanitizeChordEntity,
  sanitizeGroupEntity,
  sanitizeSongEntity,
} from './persistedData';

import type { RawChord, RawGroup, RawSong } from './payloadRawShapes';
import type { ChordDraft, GroupDraft, SongDraft } from './persistedData';
import type { AppPreferencesBackup, ImportExportPayload, PayloadSection, SyncSettingsBackup } from '@/app/types';
import type { ChordNameSegments, Group } from '@/domains/chord/types';
import type { ChordLineSlots, LineId } from '@/domains/score/types';
import type { EncryptedSyncSettingsBackup } from '@/platform/types/settings';

export interface PayloadValidationResult {
  isValid: boolean;
  payload?: ImportExportPayload;
  issues: string[];
  /** 非阻断的自动清理提示（去重 / 剪枝失效引用）；调用方应向用户展示 */
  warnings?: string[];
}

/* ---------------------------------------------------------------------------
 * zod 结构门禁：声明式描述「进入实体清洗内核前」的最小结构要求，
 * 未知字段默认剥离（.strip），实现「仅保留已知字段」的清洗承诺。
 * 注意：门禁只做结构判断；旧字段兜底/派生清理仍在 sanitize*Entity 业务内核（repair 模式）。
 * ------------------------------------------------------------------------- */

/** 分组门禁：进入实体内核前必须有 id / name 字符串 */
const groupGateSchema = z.object({ id: z.string(), name: z.string() });

/** 琴弦节点：{fret, preferFlat} 对象，音品为有限数且 >= -1（v7 起琴弦为对象型） */
const stringTupleSchema = z.object({ fret: z.number().finite().gte(-1), preferFlat: z.boolean() });

/** 和弦门禁第 1 层：基础识别属性 */
const chordBaseGateSchema = z.object({ id: z.string(), groupId: z.string() });
/** 和弦门禁第 2/3 层：琴弦数组长度与节点形状（分层校验以保留既有的分级错误文案） */
const chordStringsLengthSchema = z.array(z.unknown()).min(3).max(10);
const chordStringsShapeSchema = z.array(stringTupleSchema);

/** 歌曲门禁：进入实体内核前必须有 id / title 字符串 */
const songGateSchema = z.object({ id: z.string(), title: z.string() });

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
    const gate = groupGateSchema.safeParse(g);
    if (!gate.success) {
      const msg = `groups[${index}] 结构损坏，缺失必要属性`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);

      continue;
    }
    const entity = sanitizeGroupEntity(g);
    if (entity) result.push(entity);
    else {
      const msg = `groups[${index}] 实体构造失败`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);
    }
  }
  return result;
};

/** 清洗备份包中的和弦列表：逐项校验结构，旧数据仅有 chordName 时兜底解析分片；lenient 模式跳过单条坏数据并记录 warning。 */
const sanitizeChords = (
  chords: unknown,
  issues: string[],
  warnings: string[],
  mode: 'strict' | 'lenient'
): ChordDraft[] => {
  if (!Array.isArray(chords)) {
    issues.push('chords 字段必须为数组');
    return [];
  }

  const result: ChordDraft[] = [];
  for (let index = 0; index < chords.length; index++) {
    const c = chords[index] as RawChord;
    if (!c || typeof c !== 'object') {
      const msg = `chords[${index}] 不是有效的对象`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);

      continue;
    }
    // 三层结构门禁分层解析，保留既有的分级错误文案（基础属性 / 数量 / 节点形状）
    if (!chordBaseGateSchema.safeParse(c).success || (!c['chordName'] && !c.nameSegments)) {
      const msg = `chords[${index}] (${c.id || index}) 缺失基础识别属性`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);

      continue;
    }
    if (!chordStringsLengthSchema.safeParse(c.strings).success) {
      const msg = `chords[${index}] (${c.id}) 琴弦数组损坏 (琴弦数量须在 3-10 之间)`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);

      continue;
    }
    if (!chordStringsShapeSchema.safeParse(c.strings).success) {
      const msg = `chords[${index}] (${c.id}) 内部存在损坏的琴弦节点`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);

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
    if (chord) result.push(chord);
    else {
      const msg = `chords[${index}] (${c.id}) 实体归一化失败`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);
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
    if (!songGateSchema.safeParse(s).success) {
      const msg = `songs[${index}] 结构损坏，缺失必要识别属性`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);

      continue;
    }
    const song = sanitizeSongEntity(s);
    if (song) result.push(song);
    else {
      const msg = `songs[${index}] (${s.id}) 实体处理失败`;
      if (mode === 'strict') issues.push(msg);
      else warnings.push(`${msg}，已跳过`);
    }
  }
  return result;
};
/** 会被拼进目标 API 的 URL **路径**的字段（owner/repo/branch/path），需做路径段逃逸检查 */
const PATH_SEGMENT_FIELDS: ReadonlySet<string> = new Set([
  'githubOwner',
  'githubRepo',
  'githubBranch',
  'githubPath',
  'giteeOwner',
  'giteeRepo',
  'giteeBranch',
  'giteePath',
]);

/**
 * 路径段类字段的安全检查：含 `..` 路径段或反斜杠即视为非法。
 *
 * 这些字段会被拼进 `https://api.github.com/repos/{owner}/{repo}/contents/{path}` 一类地址
 * （见 sync/registry 与各 provider），构造 `../` 可让上传逃出预期目录。合法取值不含 `..` 段
 * 也不含 `\`，故丢弃该字段即安全（分支名带 `/` 属正常，不禁）。
 *
 * 为什么不对 URL 字段做同类检查：协议约束在下游 validateSettings 的 URL_PATTERN（http/https），
 * 而「主机是否可信」无法从字符串判定——`https://任意主机/` 本身就是合法 URL，白名单反而会
 * 挡掉用户自建的 WebDAV。故 URL 侧的正确防线是「不默认应用外来配置」，见 useBackupModals。
 */
const isUnsafePathField = (field: string, value: string): boolean =>
  PATH_SEGMENT_FIELDS.has(field) && (value.includes('\\') || value.split('/').includes('..'));

/**
 * 防御性清洗 syncSettings：同步配置属辅助数据，字段损坏只丢弃该字段，
 * 绝不因配置问题拒绝整包导入。
 *
 * 结构（v7 起）：判别联合 { kind: 'github'|'gitee'|'webdav'|'server', ... }，
 * 编译器/校验层强制各分支字段配套（不再允许 syncTarget:'webdav' 携带 github* 字段）。
 * 兼容旧备份（v7 前的平铺 { syncTarget, githubToken, ... }）：先归一化到联合，再走新 schema。
 */
const optionalStringField = z.string().optional().catch(undefined);
const optionalBooleanField = z.boolean().optional().catch(undefined);

/** 旧平铺形态 → 判别联合的归一化：按 syncTarget 组装对应分支（字段名 githubToken→token 等） */
const legacyFlatToUnion = (src: Record<string, unknown>) => {
  const target = src['syncTarget'];
  if (target === 'github' || target === 'gitee')
    return {
      kind: target,
      token: typeof src[`${target}Token`] === 'string' ? src[`${target}Token`] : undefined,
      owner: typeof src[`${target}Owner`] === 'string' ? src[`${target}Owner`] : undefined,
      repo: typeof src[`${target}Repo`] === 'string' ? src[`${target}Repo`] : undefined,
      branch: typeof src[`${target}Branch`] === 'string' ? src[`${target}Branch`] : undefined,
      path: typeof src[`${target}Path`] === 'string' ? src[`${target}Path`] : undefined,
      ...(src['secrets'] !== undefined ? { secrets: src['secrets'] } : {}),
    };

  if (target === 'webdav')
    return {
      kind: 'webdav',
      serverUrl: typeof src['webdavServerUrl'] === 'string' ? src['webdavServerUrl'] : undefined,
      username: typeof src['webdavUsername'] === 'string' ? src['webdavUsername'] : undefined,
      password: typeof src['webdavPassword'] === 'string' ? src['webdavPassword'] : undefined,
      useDefaultProxy:
        typeof src['webdavUseDefaultProxy'] === 'boolean'
          ? src['webdavUseDefaultProxy']
          : typeof src['webdavUseProxy'] === 'boolean' // 兼容旧字段名
            ? src['webdavUseProxy']
            : undefined,
      proxyUrl: typeof src['webdavProxyUrl'] === 'string' ? src['webdavProxyUrl'] : undefined,
      ...(src['secrets'] !== undefined ? { secrets: src['secrets'] } : {}),
    };

  if (target === 'server')
    return {
      kind: 'server',
      serverUrl: typeof src['serverUrl'] === 'string' ? src['serverUrl'] : undefined,
      token: typeof src['serverToken'] === 'string' ? src['serverToken'] : undefined,
      ...(src['secrets'] !== undefined ? { secrets: src['secrets'] } : {}),
    };

  return null;
};

/** 各分支的清洗 schema：字段损坏仅丢弃该字段，路径段逃逸字段直接剔除 */
const githubBranchSchema = z
  .object({
    kind: z.literal('github'),
    token: optionalStringField,
    owner: z.string().optional().catch(undefined),
    repo: z.string().optional().catch(undefined),
    branch: optionalStringField,
    path: optionalStringField,
  })
  .transform(s => ({
    kind: 'github' as const,
    token: s.token,
    owner: s.owner,
    repo: s.repo,
    branch: s.branch,
    path: s.path,
  }));
const giteeBranchSchema = z
  .object({
    kind: z.literal('gitee'),
    token: optionalStringField,
    owner: z.string().optional().catch(undefined),
    repo: z.string().optional().catch(undefined),
    branch: optionalStringField,
    path: optionalStringField,
  })
  .transform(s => ({
    kind: 'gitee' as const,
    token: s.token,
    owner: s.owner,
    repo: s.repo,
    branch: s.branch,
    path: s.path,
  }));
const webdavBranchSchema = z
  .object({
    kind: z.literal('webdav'),
    serverUrl: optionalStringField,
    username: optionalStringField,
    password: optionalStringField,
    useDefaultProxy: optionalBooleanField,
    proxyUrl: optionalStringField,
  })
  .transform(s => ({
    kind: 'webdav' as const,
    serverUrl: s.serverUrl,
    username: s.username,
    password: s.password,
    useDefaultProxy: s.useDefaultProxy,
    proxyUrl: s.proxyUrl,
  }));
const serverBranchSchema = z
  .object({
    kind: z.literal('server'),
    serverUrl: optionalStringField,
    token: optionalStringField,
  })
  .transform(s => ({
    kind: 'server' as const,
    serverUrl: s.serverUrl,
    token: s.token,
  }));

/** 加密凭据块校验器（v1 / v2 格式原样保留：密文不在清洗范围内） */
const secretsField = z
  .custom<NonNullable<EncryptedSyncSettingsBackup['secrets']>>(value => isValidEncryptedSecrets(value))
  .optional()
  .catch(undefined);

/** 判别联合 + 顶层 secrets 的组合 schema：各分支清洗后仍保留 secrets（如有） */
const unionWithSecretsSchema = z
  .discriminatedUnion('kind', [githubBranchSchema, giteeBranchSchema, webdavBranchSchema, serverBranchSchema])
  .and(z.object({ secrets: secretsField }));

/**
 * 入口：先归一化旧平铺形态（v7 前 { syncTarget, githubToken, ... }），
 * 再统一走判别联合清洗。返回 `SyncSettingsBackup | undefined`（清洗失败 / 无有效字段返回 undefined）。
 */
const syncSettingsSchema = z
  .union([
    z
      .object({ syncTarget: z.string().min(1) })
      .passthrough()
      .transform(src => legacyFlatToUnion(src as Record<string, unknown>) ?? undefined),
    z
      .object({ kind: z.string().min(1) })
      .passthrough()
      .transform(src => {
        const raw = src as Record<string, unknown>;
        return 'kind' in raw ? raw : undefined;
      }),
  ])
  .transform(raw => {
    if (!raw) return undefined;
    const parsed = unionWithSecretsSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    // 判别联合按 kind 收窄；owner/repo 等 git 分支字段需额外展开用于路径段逃逸检查
    const data = parsed.data as SyncSettingsBackup & { secrets?: unknown; owner?: string; repo?: string };
    const { kind } = data;
    // 路径段逃逸（`..` / `\`）的字段直接剔除：语义与旧实现一致——单字段非法不牵连整包
    if (kind && (kind === 'github' || kind === 'gitee')) {
      // 字段 → 旧扁平字段名（用于路径段逃逸检查的 PATH_SEGMENT_FIELDS 键）
      const pathFieldNames = ['owner', 'repo', 'branch', 'path'] as const;
      const legacyKeys = ['Owner', 'Repo', 'Branch', 'Path'];
      for (let i = 0; i < pathFieldNames.length; i++) {
        const field = pathFieldNames[i] as string;
        const value = data[field as keyof typeof data] as string | undefined;
        if (typeof value === 'string' && isUnsafePathField(`${kind}${legacyKeys[i]}`, value))
          delete data[field as keyof typeof data];
      }
    }
    return data as SyncSettingsBackup;
  });

/** 清洗备份包中的同步配置（仅保留已知字段，兼容旧字段名 webdavUseProxy）；无有效字段返回 undefined。 */
const sanitizeSyncSettings = (raw: unknown): SyncSettingsBackup | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const parsed = syncSettingsSchema.safeParse(raw);
  if (!parsed.success || !parsed.data) return undefined;
  return Object.keys(parsed.data).length > 0 ? parsed.data : undefined;
};

/**
 * 偏好设置中「取值恒为 boolean」的字段。
 * 这四处必须逐字对齐：platform/types 的 AppPreferencesBackup（类型）、buildBackupPayload 的导出、
 * 本白名单、settingsStore.applyPreferencesBackup 的恢复读。少一处即双重静默丢失——
 * 导出不写该字段，且 zod 白名单会把外来包里的该字段 strip 掉（P2 审计 #15：
 * scoreShowBarre / scoreShowFooter / scoreLyricsFontWeight 三项跨设备恢复即此故）。
 * 枚举型字段（scoreLayoutAlign / scoreLyricsFontWeight）不进本表，各自在下方面板 schema 单列。
 */
const PREFERENCE_BOOLEAN_FIELDS = [
  'workbenchChordShorthand',
  'scoreChordShorthand',
  'scoreShowBarre',
  'scoreTrimEmptyEdgeFrets',
  'scoreShowFooter',
  'scoreIgnoreEmptySpace',
] as const;

/**
 * 防御性清洗 preferences：偏好属辅助数据，字段损坏只丢弃该字段，
 * 绝不因偏好问题拒绝整包导入。zod 声明已知字段，未知键默认剥离。
 */
const preferencesSchema = z
  .object({
    ...(Object.fromEntries(PREFERENCE_BOOLEAN_FIELDS.map(field => [field, optionalBooleanField])) as {
      [K in (typeof PREFERENCE_BOOLEAN_FIELDS)[number]]: typeof optionalBooleanField;
    }),
    scoreLayoutAlign: z.enum(['start', 'center']).optional().catch(undefined),
    scoreLyricsFontWeight: z.enum(['light', 'regular', 'bold']).optional().catch(undefined),
  })
  .transform(source => {
    const result: AppPreferencesBackup = {};
    for (const field of PREFERENCE_BOOLEAN_FIELDS) {
      const value = source[field];
      if (typeof value === 'boolean') result[field] = value;
    }
    if (source.scoreLayoutAlign !== undefined) result.scoreLayoutAlign = source.scoreLayoutAlign;
    if (source.scoreLyricsFontWeight !== undefined) result.scoreLyricsFontWeight = source.scoreLyricsFontWeight;

    return result;
  });

/** 清洗备份包中的偏好设置（仅保留已知字段）；无有效字段返回 undefined。 */
const sanitizePreferences = (raw: unknown): AppPreferencesBackup | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const parsed = preferencesSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  return Object.keys(parsed.data).length > 0 ? parsed.data : undefined;
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
  if (!data || typeof data !== 'object') return { isValid: false, issues: ['检测到数据资产并非有效对象'] };

  const mode = options?.mode ?? 'strict';
  const issues: string[] = [];
  const warnings: string[] = [];
  const raw = cloneDeep(data as Record<string, unknown>);
  // 先迁移旧版本到当前格式，再做结构校验（校验只认当前格式）
  const migrated = migratePayloadVersion(raw);
  const now = Date.now();
  // Group 为判别联合，交叉类型无法被 TS 自动收敛，时间戳补齐后信任收窄（校验边界）
  // migrated 是「原始记录」（见 migratePayloadVersion）：索引签名属性一律走方括号
  // （tsconfig 开了 noPropertyAccessFromIndexSignature，写点号是编译错误）
  const groups = fillMissingTimestamps(sanitizeGroups(migrated['groups'], issues, warnings, mode), now) as Group[];
  const chords = fillMissingTimestamps(sanitizeChords(migrated['chords'], issues, warnings, mode), now);
  const songs =
    migrated['songs'] !== undefined
      ? fillMissingTimestamps(sanitizeSongs(migrated['songs'], issues, warnings, mode), now)
      : [];
  const syncSettings = sanitizeSyncSettings(migrated['syncSettings']);
  const preferences = sanitizePreferences(migrated['preferences']);
  // 云端校验元数据随包透传（仅在拉取/导入含该字段时保留），供启动比对使用
  const dataMd5 = typeof migrated['dataMd5'] === 'string' && migrated['dataMd5'] ? migrated['dataMd5'] : undefined;
  const dataUpdatedAt = typeof migrated['dataUpdatedAt'] === 'number' ? migrated['dataUpdatedAt'] : undefined;
  // 删除水位线随包透传：接收方据此抬高本地水位线，保证 meta.updatedAt 单调（见 ImportExportPayload.deletedAt）
  const deletedAt =
    typeof migrated['deletedAt'] === 'number' && migrated['deletedAt'] > 0 ? migrated['deletedAt'] : undefined;
  // 缺分区标记：源包里「完全没有这个分区」（区别于显式空数组）。songs 是当前唯一能走到这里的缺失分区——
  // groups/chords 缺失会在 sanitize 阶段记 issue，strict 模式随即按 INVALID_SCHEMA 整包拒绝；
  // 但标记按「分区」表达而非 songs 专属，将来放宽某分区校验时消费侧无需再改。
  // 不写这个标记，下游就只能看到「被兜底成 [] 的 songs」，把「包里没有」误当成「云端为空」并清空本地乐谱。
  const absentSections: PayloadSection[] = [];
  if (migrated['songs'] === undefined) absentSections.push('songs');
  if (issues.length > 0) return { isValid: false, issues, ...(warnings.length > 0 ? { warnings } : {}) };

  const validGroupIds = new Set(groups.map(g => g.id));
  const orphanChords = chords.filter(c => !validGroupIds.has(c.groupId));
  const filteredChords = chords.filter(c => validGroupIds.has(c.groupId));
  if (orphanChords.length > 0) warnings.push(`检测并清除了 ${orphanChords.length} 个所属分组不存在的孤儿和弦`);

  // 同组 + 同指纹去重（与保存及转录/导入链路共用同一套去重逻辑）
  const { kept: dedupedChords, dupes, mapping: dupeMapping } = dedupeChordsByFingerprint(filteredChords);
  // 重复项不写入 issues，避免「仅重复」就整包拒绝；可观测性由 logger 留痕承担
  dupes.forEach(c => logger.warn('validation', `丢弃同组重复指纹: ${getChordName(c)} (${c.id})`));

  const validChordIds = new Set(dedupedChords.map(c => c.id));
  let redirectedRefCount = 0;
  let prunedRefCount = 0;
  /** 嵌套结构下统计引用条目总数（char 槽位 + 边和弦），用于剪枝量的差值计数 */
  const countRefs = (map: Map<string, ChordLineSlots>): number => {
    let n = 0;
    for (const slots of map.values()) n += slots.char.size + slots.start.length + slots.end.length;

    return n;
  };
  const cleanedSongs = songs.map(song => {
    // 先 remap 再 prune：指向「被同指纹合并掉那条」的槽位必须改指保留项，而不是当死引用剪掉。
    // 去重与剪枝的 id 集不同源——前者是语义等价合并（应保绑定），后者才是真孤儿（应剪）。
    // 此前直接拿 dedupedChords 的 id 集剪，把重定向漏成删除，结果与 IDB 读库路径
    // （sanitizeChords → mergedIds → chordStore → chordScoreBridge 会重定向）不一致：
    // 同一份数据走导入/云同步丢绑定、走本地库保绑定（D24）。
    const { map: remapped, remappedCount } = remapChordRefs(song.chordMap, dupeMapping);
    redirectedRefCount += remappedCount;
    const { map, changed } = pruneOrphanChordRefs(remapped, validChordIds);
    if (!changed && remappedCount === 0) return song;
    prunedRefCount += countRefs(remapped) - countRefs(map);
    return { ...song, chordMap: map as Map<LineId, ChordLineSlots> };
  });

  // 自动清理（去重 / 剪枝失效引用 / 和弦名重置）不阻断导入，但必须可见，避免用户以为数据完好
  if (dupes.length > 0) warnings.push(`丢弃了 ${dupes.length} 个同组重复指纹的和弦`);

  if (redirectedRefCount > 0) warnings.push(`已把 ${redirectedRefCount} 个指向重复和弦的引用改指保留项（绑定未丢失）`);

  if (prunedRefCount > 0) warnings.push(`清除了 ${prunedRefCount} 个指向不存在和弦的引用`);

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
      ...(dataMd5 ? { dataMd5 } : {}),
      ...(dataUpdatedAt !== undefined ? { dataUpdatedAt } : {}),
      ...(deletedAt !== undefined ? { deletedAt } : {}),
      ...(absentSections.length > 0 ? { absentSections } : {}),
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
 * 各入口自行把 error 类型映射为 message 或 SyncError。
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
