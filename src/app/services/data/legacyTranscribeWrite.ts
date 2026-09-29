/**
 * 转录的写入侧与回读核验：实体落 IDB、偏好键落 kv 镜像，以及「源键能否删」的两道判据。
 *
 * 从 `migrateLegacy.ts` 的主流程里切出来，主流程因此只剩「分类 → 写 → 核验 → 清理」四步。
 * 本文件里的每一道守门都对应一次真实事故（逐条见各函数注释），单独成文件的目的是让它们
 * 能各自被读出、各自被验 —— 混在一个 245 行的函数里时，读者分不清哪一段是主流程、哪一段是护栏。
 * 键的作用域与分类见 `legacyKeyScope.ts`。
 */
import { chordRepository, songRepository } from '@/app/services/data/repositories';
import { toSongId } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';
import { flushIdbKv, kvSet } from '@/platform/services/storage/idbKv';
import { isObject, isString } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import { EXCLUDED_KEYS, isSongShardKey, isTranscribableKvKey } from './legacyKeyScope';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/** 本批写入的实体计数与主键清单：回读核验与源键删除判据共用同一份 */
export interface EntityCounts {
  groups: number;
  chords: number;
  songs: number;
  /** D15：本批写入的主键清单——只比总量「≥」会被既有行掩盖本批失败，必须逐主键核对 */
  groupIds: string[];
  chordIds: string[];
  songIds: string[];
}

/** 空计数。每次现造而不共享一份常量：这些数组会被下游 Set 化，共享可变数组是自找的耦合 */
export const emptyEntityCounts = (): EntityCounts => ({
  groups: 0,
  chords: 0,
  songs: 0,
  groupIds: [],
  chordIds: [],
  songIds: [],
});

const parseJson = (raw: string | undefined): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * 按 id 合并「库中已有」与「本次转录快照」：同 id 取 updatedAt **严格更新**的一条，
 * 库中独有的实体原样保留（绝不删除）。
 *
 * 存在的理由：转录是「任一道守门失败即保留 localStorage、下次启动重试」的设计，故同一份陈旧快照
 * 可能被反复写回。而 chordRepository.save 的语义是「以传入快照为准」——快照里没有的 id 判为删除、
 * 同 id 一律 put。直接写回就会把「上次转录之后用户改过的和弦」整条回退、并把已删的复活；核验又只看
 * 数量与主键存在性、察觉不到内容回退，随后退役标记落盘、localStorage 被清 ⇒ 陈旧快照就此固化。
 * 合并之后重跑只补缺失、不回退，注释里那句「重跑幂等」才真正成立。
 */
const mergeByUpdatedAt = <T extends { id: string; updatedAt?: number }>(current: T[], incoming: T[]): T[] => {
  const pending = new Map<string, T>(incoming.map(e => [e.id, e]));
  const merged = current.map(e => {
    const next = pending.get(e.id);
    if (!next) return e;
    pending.delete(e.id);
    return (next.updatedAt ?? 0) > (e.updatedAt ?? 0) ? next : e;
  });
  return [...merged, ...pending.values()];
};

/** 旧 localStorage 的一次性快照：读齐之后直到 clear 之前都不再二次触碰 localStorage */
export interface LegacySnapshot {
  /** 旧键 → 原始字符串（含非本应用前缀的键，由调用方按分类判据决定怎么处理） */
  entries: Map<string, string>;
  rawGroups: unknown;
  rawChords: unknown;
  /** 分片逐条解析出的歌曲对象 + 旧扁平 SONGS 表展开后的对象 */
  rawSongs: unknown[];
  /** 旧扁平 SONGS 表的原始值（源键可删判据要按「记录」而非「解析结果」看，故单独留一份） */
  legacySongs: unknown;
  hasChordLibraryKeys: boolean;
  hasEntityData: boolean;
}

export const readLegacySnapshot = (): LegacySnapshot => {
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
  for (const [key, value] of entries)
    if (isSongShardKey(key)) {
      const song = parseJson(value);
      if (isObject(song)) rawSongs.push(song);
    }

  const legacySongs = parseJson(entries.get(STORAGE_KEYS.SONGS));
  if (Array.isArray(legacySongs)) rawSongs.push(...legacySongs);

  // N2：仅确有和弦库旧键（GROUPS / CHORD_LIST）时才允许走和弦库写回。
  // 备注（P2 审计 #22 修订）：此处曾以「save 是同一事务内 clear() + 全量 put」为理由，save 现已改
  // 为「同事务 + 按引用 diff」（见 chordRepository.save，无 clear()），但**结论不变**——diff 的语义
  // 仍是以传入快照为准：快照里没有的实体被判为删除。故仅残留歌曲旧键时若照搬空快照写回，
  // 仍会把 IDB 里已有的分组/和弦库删成 0（expected=0 让回读核验恒真，删源键后无退路）。
  // 「确有旧键」按**字节可用**判定：键存在但内容是空串 / 坏 JSON（parseJson 得 undefined）时，
  // 那串字节本就不可恢复，若仍按「键存在」如实传 undefined，validate 会以「字段必须为数组」
  // 整批拒绝 → 转录每轮早退、实体 / kv / 退役标记全不迁移，用户看到空库且仅有一条 logger.error。
  // 故**仅**对「解析不出任何值」的键按「无此分区」处理；解析成功却不是数组（字符串 / 对象等）
  // 字节是完好的、可能有可抢救的内容，仍按原口径如实传给 validate 拦截（见 transcribeEntities 注释）。
  // 坏键本身保留在 localStorage（下方 recordsPersisted 对空数组恒 false）。
  const groupUsable = entries.has(STORAGE_KEYS.GROUPS) && rawGroups !== undefined;
  const chordUsable = entries.has(STORAGE_KEYS.CHORD_LIST) && rawChords !== undefined;
  const hasChordLibraryKeys = groupUsable || chordUsable;
  return {
    entries,
    rawGroups: rawGroups ?? [],
    rawChords: rawChords ?? [],
    rawSongs,
    legacySongs,
    hasChordLibraryKeys,
    hasEntityData: hasChordLibraryKeys || rawSongs.length > 0,
  };
};

/**
 * 实体（分组 / 和弦 / 乐谱）落 IDB。校验失败返回 null —— 调用方据此保留 localStorage、下次启动重试。
 *
 * 返回的计数即「本批实际写入的主键清单」，回读核验与源键删除判据都以此为准，故不能由调用方另算一遍。
 */
export const transcribeEntities = async (snapshot: LegacySnapshot): Promise<EntityCounts | null> => {
  const { entries, rawGroups, rawChords, rawSongs, hasChordLibraryKeys } = snapshot;

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

  // D16：宽容清洗会静默丢弃不合法记录——丢弃量如实入日志，删 localStorage 前留可审计痕迹
  const rawInput = {
    groups: entries.has(STORAGE_KEYS.GROUPS) && Array.isArray(rawGroups) ? rawGroups.length : 0,
    chords: entries.has(STORAGE_KEYS.CHORD_LIST) && Array.isArray(rawChords) ? rawChords.length : 0,
    songs: rawSongs.length,
  };
  const dropped = {
    groups: rawInput.groups - groups.length,
    chords: rawInput.chords - chords.length,
    songs: rawInput.songs - songs.length,
  };
  if (dropped.groups > 0 || dropped.chords > 0 || dropped.songs > 0)
    logger.warn(
      'transcribe',
      `宽容清洗丢弃记录：分组 ${dropped.groups} / 和弦 ${dropped.chords} / 乐谱 ${dropped.songs}（结构不合法，已无法恢复）`
    );

  // 实体先落库（成功后才清空 localStorage）：歌曲与顺序索引走单事务原子写入。
  // 和弦库仅在确有旧键时才允许写回（见 readLegacySnapshot 的 N2 说明）；歌曲路径 removedIds 传空、
  // 从不 clear，空列表不会波及 IDB 既有记录，可安全调用。
  // 写回前先 load 当前库并按 updatedAt 合并（见 mergeByUpdatedAt）：把 localStorage 快照整份
  // save 回去会让重跑变成回退。load 顺带把仓储镜像初始化为库中实体的同一批引用，故合并结果里
  // 取自库中的那部分会被 diff 跳过，只有真正新增/更新的条目落盘。
  if (hasChordLibraryKeys) {
    const persisted = await chordRepository.load();
    await chordRepository.save({
      groups: mergeByUpdatedAt(persisted.groups, groups),
      chords: mergeByUpdatedAt(persisted.chords, chords),
    });
  }

  if (songs.length > 0) {
    // 歌曲侧同样必须先合并 —— 理由与和弦侧逐字相同（见上方注释），而 flushChanges 对 dirtySongs
    // 是**无条件 put**（不是按引用 diff），所以直接写回快照一定会把「上次转录之后用户改过的乐谱」
    // 整条回退。此前只有和弦侧修好了这条，歌曲侧漏着：同一个陈旧快照重跑一次就静默丢一次编辑。
    const persistedSongs = await songRepository.loadSongs();
    const mergedSongs = mergeByUpdatedAt(persistedSongs, songs);
    // 顺序索引：优先取旧分片索引中仍存在的 id，未被索引覆盖的歌曲由读侧兜底追加尾部
    const indexRaw = parseJson(entries.get(STORAGE_KEYS.SONGS_INDEX));
    const songIds = new Set(mergedSongs.map(s => s.id));
    const orderIds = Array.isArray(indexRaw)
      ? indexRaw.filter((id): id is string => isString(id) && songIds.has(toSongId(id))).map(toSongId)
      : [];
    await songRepository.flushChanges({ removedIds: [], dirtySongs: mergedSongs, orderIds });
  }

  return {
    groups: groups.length,
    chords: chords.length,
    songs: songs.length,
    groupIds: groups.map(g => g.id),
    chordIds: chords.map(c => c.id),
    songIds: songs.map(s => toSongId(s.id)),
  };
};

/**
 * 其余键原样写入 kv 镜像（偏好/UI 态字符串），敏感键丢弃；已消费的键一并返回。
 *
 * 调用方最后只做精准清除——不使用 localStorage.clear()，避免同源域名下部署其他应用
 * （子路径共域）时连带清空它们的存储。同理，转录本身也必须按前缀限定作用域：只认自家键，
 * 别人的键既不抄进本应用 kv、也不删（判据见 legacyKeyScope 的 isTranscribableKvKey）。
 *
 * 敏感键（EXCLUDED_KEYS）预置进 consumedKeys：它们不进 kv，但要在退役时从 localStorage 删掉。
 */
export const transcribeKvMirror = async (
  entries: ReadonlyMap<string, string>
): Promise<{ kvKeys: number; consumedKeys: Set<string> }> => {
  const consumedKeys = new Set<string>([...EXCLUDED_KEYS]);
  let kvKeys = 0;
  for (const [key, value] of entries) {
    if (!isTranscribableKvKey(key)) continue;
    kvSet(key, value);
    consumedKeys.add(key);
    kvKeys += 1;
  }
  // 此处只落偏好键；RETIRED_FLAG_KEY 留到两道守门之后（见 migrateLegacy），否则核验失败时标记已落、重试被短路
  await flushIdbKv();
  return { kvKeys, consumedKeys };
};

/**
 * 回读 IDB 核对实体是否真的落了库（数量不少于本次写入数、且本批主键逐个在库）。
 *
 * 存在的理由：转录末尾要删掉 localStorage——那是用户唯一副本，删掉即不可逆。而写入层不拿异常
 * 报失败：熔断期 flushNow 直接跳过写入（键留在脏集合里等下一轮重试）、事务失败也只 reportKvFailure
 * 不重抛，故 `await flushIdbKv()` 没抛错**不等于**已落盘，必须在删除前用一次真实回读确认结果。
 * idb.getAll 不受熔断影响（只短路写路径）。
 */
export const verifyEntitiesPersisted = async (expected: EntityCounts): Promise<boolean> => {
  const [groupRows, chordRows, songRows] = await Promise.all([
    idb.getAll('groups'),
    idb.getAll('chords'),
    idb.getAll('songs'),
  ]);
  if (groupRows.length < expected.groups || chordRows.length < expected.chords || songRows.length < expected.songs)
    return false;

  const groupIdSet = new Set(groupRows.map(r => String((r as { id?: unknown }).id ?? '')));
  const chordIdSet = new Set(chordRows.map(r => String((r as { id?: unknown }).id ?? '')));
  // 歌曲 id 统一经 toSongId 归一后比对（与写入路径同一口径）
  const songIdSet = new Set(songRows.map(r => toSongId(String((r as { id?: unknown }).id ?? ''))));
  return (
    expected.groupIds.every(id => groupIdSet.has(id)) &&
    expected.chordIds.every(id => chordIdSet.has(id)) &&
    expected.songIds.every(id => songIdSet.has(toSongId(id)))
  );
};

/**
 * 一个源键承载的记录是否**逐条**已进 IDB（源键可删的唯一判据）。
 *
 * 存在的理由：宽容清洗会静默丢弃结构不合法的记录（见上方 dropped 统计），被丢弃的那些从未写进 IDB，
 * 而 `verifyEntitiesPersisted` 只看「总量不少于本次写入数」与「本批主键存在」——丢弃之后 expected
 * 随之变小，甚至整批为空（expected 全零时 `0 < 0` 为假、空数组的 every 恒真），核验一路恒过。
 * 于是「清洗丢了一半」与「全部成功」在守门眼里完全等价，源键照删 ⇒ 用户唯一副本不可逆丢失。
 * 故删除前必须逐条确认承载记录确实落了库，而不是只看总数。
 *
 * @param records 源键解析出的记录集合（非数组或空一律视为「不可删」，宁可留着）
 * @param normalize 主键归一（歌曲 id 走 toSongId，与写入路径同一口径）
 */
export const recordsPersisted = (
  records: unknown,
  persistedIds: ReadonlySet<string>,
  normalize: (id: string) => string = id => id
): boolean => {
  if (!Array.isArray(records) || records.length === 0) return false;
  return records.every(record => {
    const id = isObject(record) ? (record as { id?: unknown }).id : undefined;
    return isString(id) && persistedIds.has(normalize(id));
  });
};

/** 歌曲分片的三分流结果：已转录（可删）/ 字节不可用（可删）/ 内容完好但没进库（必须留） */
export interface SongShardClassification {
  transcribed: Set<string>;
  unusable: Set<string>;
  kept: string[];
}

/**
 * 歌曲分片按「字节是否可用」分流，而不是按「是否转录成功」。
 *
 * 两类未转录的分片，丢失代价完全不对称：
 *  ① parseJson 拿不到对象：这串字节本就不可用（写坏 / 被截断），删掉不损失任何信息；
 *  ② 能解析出对象却没进 IDB：记录是**完好的**，只是过不了 songGateSchema（如缺 title）或
 *     id 归一后没落库 —— 字段可补，源键就是唯一可执行的修复余地。
 * ② 必须留：回读核验看不见这一类（expected 随丢弃一起变小，甚至整批为空而恒过），
 * 所以它一旦被删，就再没有任何地方留着这首歌的内容。
 * 留下的代价如实说：退役标记已落，转录下次启动直接 return、运行时也不再回读 localStorage，
 * 故这些键没有**程序内**的读取路径，只能由人在 devtools 里逐个读出、补齐字段后重新导入。
 * 这正是「几 KB 不可达残渣」与「一首歌」之间的取舍 —— 取前者。
 */
export const classifySongShards = (
  entries: ReadonlyMap<string, string>,
  persistedSongIds: ReadonlySet<string>
): SongShardClassification => {
  const transcribed = new Set<string>();
  const unusable = new Set<string>();
  const kept: string[] = [];
  for (const [key, value] of entries) {
    if (!isSongShardKey(key)) continue;
    const parsed = parseJson(value);
    if (recordsPersisted([parsed], persistedSongIds, toSongId)) transcribed.add(key);
    else if (isObject(parsed)) kept.push(key);
    else unusable.add(key);
  }
  return { transcribed, unusable, kept };
};
