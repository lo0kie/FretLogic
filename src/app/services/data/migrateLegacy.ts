/**
 * localStorage 退役转录：一次性把旧 localStorage 的全部数据搬进 IndexedDB，然后清空 localStorage。
 *
 * 策略（应用已全盘迁移到 IDB，localStorage 不再有任何运行时读写方）：
 * - 启动时检测 kv 镜像中的「已转录」标记，已完成则跳过（幂等）；
 * - 实体（groups/chords/songs）经统一 payload 宽容清洗后原子写入 IDB；
 * - 其余键（偏好/UI 态）按原始字符串原样写入 kv 镜像（useStorage 后端）；
 * - 敏感键（如历史版本遗留的 WebDAV 密码）不转录、直接丢弃；
 * - 全部写入成功**且回读核验通过**后，才精准清除已消费的键并写入标记；
 *   校验失败 / 持久化熔断 / 回读对不上，都保留 localStorage 不动，下次启动重试。
 *
 * 本文件只剩主流程四步（分类 → 写 → 核验 → 清理）：键的作用域与分类见 `legacyKeyScope.ts`，
 * 写入侧与两道回读守门见 `legacyTranscribeWrite.ts`。
 */
import { toSongId } from '@/domains/score/model/scoreModel';
import { isPersistBlocked } from '@/platform/services/storage';
import { flushIdbKv, kvGet, kvSet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import { purgeMigratedCredentials, RETIRED_FLAG_KEY } from './legacyKeyScope';
import {
  classifySongShards,
  emptyEntityCounts,
  readLegacySnapshot,
  recordsPersisted,
  transcribeEntities,
  transcribeKvMirror,
  verifyEntitiesPersisted,
} from './legacyTranscribeWrite';

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

  // 先清扫历史残留（含已迁移用户），必须早于下方退役标记短路：
  // 已迁移用户恰是唯一需要清扫的人群，一旦短路提前返回就再没有清扫机会。
  purgeMigratedCredentials();

  if (kvGet(RETIRED_FLAG_KEY) === '1') return null;

  // 一次性快照：后续 clear 之前不再二次触碰 localStorage，保证读到的是同一份数据
  const snapshot = readLegacySnapshot();
  const { entries, rawGroups, rawChords, legacySongs, hasEntityData } = snapshot;

  let entityCounts = emptyEntityCounts();
  if (hasEntityData) {
    const written = await transcribeEntities(snapshot);
    if (!written) return null;
    entityCounts = written;
  }

  const { kvKeys, consumedKeys } = await transcribeKvMirror(entries);

  // ── 删除前的诚实核验：本流程唯一不可逆动作的守门 ──────────────────────────────
  // 写入层有两种情况会把「失败」伪装成成功，都不能作为可删依据：
  //   ① 配额熔断期：idb 的写入型操作会抛错（idb.ts 的 isPersistBlocked 分支），但 kv 侧的
  //      flushNow 内部 catch 后只上报、不向外抛（idbKv），故 flushIdbKv() 照常 resolve——
  //      这批偏好键实际没落盘，调用方看不出来；
  //   ② 本轮写入自身刚把熔断器打开：reportPersistFailure 收到 QuotaExceeded 即置位，
  //      此后 kvSet / flushIdbKv 全部静默失效（RETIRED_FLAG_KEY 也写不进去）。
  // 若在这种状态下照旧 removeItem，就是真删掉用户唯一的本地副本且下次启动已无可重试的源数据。
  // 故这里熔断即放弃；否则再回读 IDB 核对一次实体数量，对不上同样放弃（保留本地、下次重试）。
  if (isPersistBlocked()) {
    logger.error('transcribe', '持久化已熔断，本轮写入未真正落库；保留 localStorage 以便下次启动重试');
    return null;
  }
  if (!(await verifyEntitiesPersisted(entityCounts))) {
    logger.error(
      'transcribe',
      '转录回读核对失败：IDB 实体数量少于本次写入量；保留 localStorage 以便下次启动重试',
      entityCounts
    );
    return null;
  }

  // 核验通过才落退役标记：顺序若颠倒（标记先于守门），回读失败这一路会把「半截迁移」永久固化——
  // 顶部 kvGet(RETIRED_FLAG_KEY) 的短路让下次启动不再重试，而运行时已不回读 localStorage。
  // 若这次 flush 自身触发熔断导致标记未落，下次启动重跑一遍转录即可：和弦库写回已按 updatedAt
  // 合并（见 mergeByUpdatedAt），重跑只补缺失、不回退迁移后的编辑，属安全方向。
  kvSet(RETIRED_FLAG_KEY, '1');
  await flushIdbKv();
  // 上面这次 flush 是「读不出失败」的：熔断期 flushNow 内部 catch 后只上报、不向外抛（见上方 ①），
  // 故必须再回读一次熔断状态 —— 本轮写入自身刚把熔断器打开时，退役标记与全部偏好键其实都没落盘。
  // 此时再删源键就是删掉用户唯一的本地副本，故熔断即放弃删除：源键留着人工可查，比删掉安全。
  const kvFlushed = !isPersistBlocked();
  if (!kvFlushed) logger.error('transcribe', '偏好键 flush 后仍处于熔断态，退役标记未落盘；保留全部源键待人工处理');

  // ── 源键的可删判据 ────────────────────────────────────────────────────────────
  // 主键（groups / chordList / songs）按「它承载的记录必须逐条已进 IDB」精准判（见 recordsPersisted）：
  // 部分转录时留下整键，比「删掉一条没进 IDB 的和弦」安全。留下的理由不是「将来会自动重试」（退役标记
  // 已落，顶部的短路让整个函数下次启动直接 return），而是它一份键里含**多个实体**，在 devtools 里
  // 还能逐个读出「哪几个没进来」，是人工排查的唯一线索。
  const persistedGroupIds = new Set(entityCounts.groupIds);
  const persistedChordIds = new Set(entityCounts.chordIds);
  const persistedSongIds = new Set<string>(entityCounts.songIds);
  // 歌曲分片按「字节是否可用」分流（判据与两类未转录分片的代价不对称，见 classifySongShards）
  const {
    transcribed: transcribedShardKeys,
    unusable: unusableShardKeys,
    kept: keptShardKeys,
  } = classifySongShards(entries, persistedSongIds);

  if (recordsPersisted(rawGroups, persistedGroupIds)) consumedKeys.add(STORAGE_KEYS.GROUPS);
  if (recordsPersisted(rawChords, persistedChordIds)) consumedKeys.add(STORAGE_KEYS.CHORD_LIST);
  if (recordsPersisted(legacySongs, persistedSongIds, toSongId)) consumedKeys.add(STORAGE_KEYS.SONGS);

  // 顺序索引同理，且判据是「还有没有待人工修复的歌曲分片」：分片是**内容**、索引是**次序**，
  // 把待修复的歌留下却无条件删掉描述它们次序的索引，人工修复时那份次序就没了。
  // 原先它被预置进 consumedKeys（无条件删），而分片源键已改成按逐条判据保留 —— 两者口径相反。
  if (keptShardKeys.length === 0) consumedKeys.add(STORAGE_KEYS.SONGS_INDEX);

  // 分片不再「一律删」：只删字节不可用者（分流见 classifySongShards），内容完好的源键留着等人工修复。
  // 两条 warn 分开记名，因为两者的可挽救性相反 —— 合成一条「未能转录」正是旧版最容易误导人的地方。
  if (kvFlushed)
    for (const key of entries.keys())
      if (transcribedShardKeys.has(key) || unusableShardKeys.has(key) || consumedKeys.has(key))
        localStorage.removeItem(key);
  if (keptShardKeys.length > 0)
    logger.warn(
      'transcribe',
      `以下旧分片内容完好、但未能转录进 IDB（多半过不了校验），已保留源键待人工修复（本地唯一副本）：${keptShardKeys.join(' / ')}`
    );
  if (unusableShardKeys.size > 0)
    logger.warn(
      'transcribe',
      `以下旧分片的字节已损坏、无法解析，已随本次退役一并清除（不可恢复）：${[...unusableShardKeys].join(' / ')}`
    );

  const result: TranscriptionResult = {
    groups: entityCounts.groups,
    chords: entityCounts.chords,
    songs: entityCounts.songs,
    kvKeys,
  };
  logger.info(
    'transcribe',
    `localStorage 退役转录完成：实体 ${entityCounts.groups} 组 / ${entityCounts.chords} 和弦 / ${entityCounts.songs} 乐谱，` +
      `kv 迁移 ${kvKeys} 键，${
        // 留了分片就不能再写「已精准清除」—— 那句话会让日志读起来像「本地已经没东西了」
        keptShardKeys.length > 0
          ? `localStorage 已清除，另有 ${keptShardKeys.length} 个分片因未通过校验而保留（见上一条 warn）`
          : 'localStorage 已精准清除'
      }`
  );
  return result;
}
