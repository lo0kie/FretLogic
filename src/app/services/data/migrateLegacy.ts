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
 */
import { chordRepository, songRepository } from '@/app/services/data/repositories';
import { toSongId } from '@/domains/score/model/scoreModel';
import { idb, isPersistBlocked } from '@/platform/services/storage';
import { flushIdbKv, kvGet, kvRemove, kvSet } from '@/platform/services/storage/idbKv';
import { STORAGE_KEY_PREFIX, STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/** 转录完成标记（存于 kv 镜像，随 IDB 落盘） */
const RETIRED_FLAG_KEY = 'localStorage-retired';

/**
 * 不转录进 kv 的键：历史版本遗留的敏感信息（密码 / Token 曾落 localStorage，迁移时丢弃）。
 *
 * 必须列**字面量**，不能只列当前 STORAGE_KEYS 里的同名牌：转录循环按 `STORAGE_KEY_PREFIX`
 * 前缀圈定作用域，而该前缀正是 `CHORD_LAB_`——旧版 GitHub 同步的 `CHORD_LAB_GH_TOKEN`
 * 完全落在这个前缀内。它在现行 STORAGE_KEYS 里已无对应项（同步配置整体迁到了别处），
 * 于是既不会被前缀守卫挡掉、也不会被「当前键名」式的排除命中，会被原样抄进 IDB 再删掉
 * localStorage——等于把凭据从「浏览器可清空的 localStorage」搬进「持久化且随备份链路带走的 IDB」，
 * 与本节「敏感键丢弃」的意图相反，且不可逆（已迁移的用户库里已经躺着一份）。
 *
 * 因此这里一律按**历史键名字面量**枚举：新增敏感键时，若它曾出现在任何旧版本里，
 * 必须把旧名一并写上，不能只写现行常量。
 */
const EXCLUDED_KEYS: ReadonlySet<string> = new Set([
  STORAGE_KEYS.WEBDAV_PASSWORD,
  STORAGE_KEYS.SERVER_TOKEN,
  // 旧版 GitHub 同步 Token（现行 STORAGE_KEYS 已无此项，纯历史遗留）
  'CHORD_LAB_GH_TOKEN',
  // 旧版 Gitee 同步 Token（同上，按同一口径预置：Gitee 同步曾与 GitHub 并列）
  'CHORD_LAB_GITEE_TOKEN',
]);

/**
 * 已迁移用户的历史凭据残留清理。
 *
 * 第一半（EXCLUDED_KEYS）只挡**将来**的转录；此刻已经完成转录的用户库里，
 * 那份 `CHORD_LAB_GH_TOKEN` 明文**已经躺进 IDB kv 库**了（旧版 EXCLUDED_KEYS 只列了
 * WebDAV/SERVER 两个键，而旧 Token 名落在 `CHORD_LAB_` 前缀圈定范围内）。
 * 转录标记已落盘 ⇒ 启动短路 ⇒ 旧代码永远不会再碰它，脏数据就此固化，
 * 而且随「导出/备份/云同步」链路一起被带走。故这里补一次启动清理：
 * 逐键 remove，不做「读到了才报」式的软处理——凭据只该存在于它当下的既定位置，
 * 一份躺错地方的明文副本没有任何保留价值。
 *
 * 调用点固定在转录函数**开头**（而非末尾），语义才闭合：
 *   - 未迁移用户：本次转录已被 EXCLUDED_KEYS 挡下，这里自然无事可做（幂等）；
 *   - 已迁移用户：标记短路使转录直接返回，本函数就是唯一的清扫机会。
 * 必须在早退分支**之前**调用，否则已迁移用户（恰恰是唯一需要清扫的人群）
 * 会顺着 `RETIRED_FLAG_KEY` 短路提前返回，永远走不到这里。
 *
 * 熔断期不写：remove 在 idbKv 里同样走 flush 落盘，熔断时静默失效属预期——
 * 凭据清不掉不是数据安全问题（它本就在本地），下次启动重试即可。
 */
const purgeMigratedCredentials = (): void => {
  for (const key of EXCLUDED_KEYS)
    if (kvGet(key) !== null) {
      kvRemove(key);
      logger.warn('transcribe', `已清除历史转录遗留的敏感键：${key}（旧版排除名单不完整所致）`);
    }
};

const SONG_ENTRY_PREFIX = `${STORAGE_KEYS.SONG_ENTRY}:`;

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

const parseJson = (raw: string | undefined): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * 回读 IDB 核对实体是否真的落了库（数量不少于本次写入数即视为成功）。
 *
 * 存在的理由：转录末尾要删掉 localStorage——那是用户唯一副本，删掉即不可逆。而写入层的失败
 * 可能没有信号（配额熔断时 idb.put 直接 resolve('')），故不能只凭「await 没抛错」判定成功，
 * 必须在删除前用一次真实回读确认结果。idb.getAll 不受熔断影响（只短路写路径）。
 */
const verifyEntitiesPersisted = async (expected: {
  groups: number;
  chords: number;
  songs: number;
  /** D15：本批写入的主键清单——只比总量「≥」会被既有行掩盖本批失败，必须逐主键核对 */
  groupIds: string[];
  chordIds: string[];
  songIds: string[];
}): Promise<boolean> => {
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
    if (key.startsWith(SONG_ENTRY_PREFIX)) {
      const song = parseJson(value);
      if (song && typeof song === 'object') rawSongs.push(song);
    }
  
  const legacySongs = parseJson(entries.get(STORAGE_KEYS.SONGS));
  if (Array.isArray(legacySongs)) rawSongs.push(...legacySongs);

  // N2：仅确有和弦库旧键（GROUPS / CHORD_LIST）时才允许走和弦库写回。
  // 备注（P2 审计 #22 修订）：此处曾以「save 是同一事务内 clear() + 全量 put」为理由，save 现已改
  // 为「同事务 + 按引用 diff」（见 chordRepository.save，无 clear()），但**结论不变**——diff 的语义
  // 仍是以传入快照为准：快照里没有的实体被判为删除。故仅残留歌曲旧键时若照搬空快照写回，
  // 仍会把 IDB 里已有的分组/和弦库删成 0（expected=0 让回读核验恒真，删源键后无退路）。
  const hasChordLibraryKeys = entries.has(STORAGE_KEYS.GROUPS) || entries.has(STORAGE_KEYS.CHORD_LIST);
  const hasEntityData = hasChordLibraryKeys || rawSongs.length > 0;

  let entityCounts = {
    groups: 0,
    chords: 0,
    songs: 0,
    groupIds: [] as string[],
    chordIds: [] as string[],
    songIds: [] as string[],
  };
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
    // 和弦库仅在确有旧键时才允许写回（见上方 N2 说明）；歌曲路径 flushChanges 按 id diff、从不 clear，
    // 空列表不会波及 IDB 既有记录，可安全调用。
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
      // 顺序索引：优先取旧分片索引中仍存在的 id，未被索引覆盖的歌曲由读侧兜底追加尾部
      const indexRaw = parseJson(entries.get(STORAGE_KEYS.SONGS_INDEX));
      const songIds = new Set(songs.map(s => s.id));
      const orderIds = Array.isArray(indexRaw)
        ? indexRaw
            .filter((id): id is string => typeof id === 'string' && songIds.has(toSongId(id)))
            .map(toSongId)
        : [];
      await songRepository.flushChanges({ removedIds: [], dirtySongs: songs, orderIds });
    }
    entityCounts = {
      groups: groups.length,
      chords: chords.length,
      songs: songs.length,
      groupIds: groups.map(g => g.id),
      chordIds: chords.map(c => c.id),
      songIds: songs.map(s => toSongId(s.id)),
    };
  }

  // 其余键原样写入 kv 镜像（偏好/UI 态字符串），敏感键丢弃；
  // 已消费的键记录下来，最后只做精准清除——不使用 localStorage.clear()，
  // 避免同源域名下部署其他应用（子路径共域）时连带清空它们的存储。
  // 同理，转录本身也必须按前缀限定作用域：只认自家键，别人的键既不抄进本应用 kv、也不删。
  const consumedKeys = new Set<string>([...EXCLUDED_KEYS, STORAGE_KEYS.SONGS_INDEX]);
  let kvKeys = 0;
  for (const [key, value] of entries) {
    if (!key.startsWith(STORAGE_KEY_PREFIX)) continue;
    if (EXCLUDED_KEYS.has(key)) continue;
    if (key === STORAGE_KEYS.GROUPS || key === STORAGE_KEYS.CHORD_LIST) continue;
    if (key === STORAGE_KEYS.SONGS || key.startsWith(SONG_ENTRY_PREFIX) || key === STORAGE_KEYS.SONGS_INDEX) continue;
    kvSet(key, value);
    consumedKeys.add(key);
    kvKeys += 1;
  }
  // 此处只落偏好键；RETIRED_FLAG_KEY 留到两道守门之后（见下），否则核验失败时标记已落、重试被短路
  await flushIdbKv();

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

  // 精准清除本应用消费过的键（实体键 + 已转录偏好键 + 丢弃的敏感键）；未知键原样保留
  for (const key of [STORAGE_KEYS.GROUPS, STORAGE_KEYS.CHORD_LIST, STORAGE_KEYS.SONGS]) 
    consumedKeys.add(key);
  
  for (const key of entries.keys()) 
    if (consumedKeys.has(key) || key.startsWith(SONG_ENTRY_PREFIX)) localStorage.removeItem(key);
  

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
