/**
 * 旧 localStorage 键的作用域与分类：本应用前缀、敏感键排除名单、实体 / 歌曲载体的识别。
 *
 * 从 `migrateLegacy.ts` 的主流程里切出来 —— 这几条判据此前夹在转录中途，各自带着
 * 「旧版排除名单不完整」「按前缀圈定作用域」一类的事故成因，混在主流程里读不出边界。
 * 主流程见 `migrateLegacy.ts`，写入侧与回读守门见 `legacyTranscribeWrite.ts`。
 */
import { kvGet, kvRemove } from '@/platform/services/storage/idbKv';
import { STORAGE_KEY_PREFIX, STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

/** 转录完成标记（存于 kv 镜像，随 IDB 落盘） */
export const RETIRED_FLAG_KEY = 'localStorage-retired';

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
export const EXCLUDED_KEYS: ReadonlySet<string> = new Set([
  STORAGE_KEYS.WEBDAV_PASSWORD,
  STORAGE_KEYS.SERVER_TOKEN,
  // 旧版 GitHub 同步 Token（现行 STORAGE_KEYS 已无此项，纯历史遗留）
  'CHORD_LAB_GH_TOKEN',
  // 旧版 Gitee 同步 Token（同上，按同一口径预置：Gitee 同步曾与 GitHub 并列）
  'CHORD_LAB_GITEE_TOKEN',
]);

/** 歌曲分片键前缀：`<SONG_ENTRY>:<id>`，一个键承载一首歌 */
export const SONG_ENTRY_PREFIX = `${STORAGE_KEYS.SONG_ENTRY}:`;

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
 * 熔断期照样能清：remove 走 idbKv.flushNow 的**删除分支**，而删除类操作在熔断下刻意放行
 * （见 idbKv.flushNow 与 idb.withQuotaGuard —— 那是用户腾空间、恢复可写的唯一手段）。
 * 注释此前写成「熔断时静默失效」，与 delete 分支所在的位置正好相反；真遇到事务级失败
 * 才轮到「下次启动重试」这条兜底。
 */
export const purgeMigratedCredentials = (): void => {
  for (const key of EXCLUDED_KEYS)
    if (kvGet(key) !== null) {
      kvRemove(key);
      logger.warn('transcribe', `已清除历史转录遗留的敏感键：${key}（旧版排除名单不完整所致）`);
    }
};

/** 实体键：分组 / 和弦库。它们的写回走仓储，且需按「以传入快照为准」的 diff 语义对待 */
export const isEntityKey = (key: string): boolean => key === STORAGE_KEYS.GROUPS || key === STORAGE_KEYS.CHORD_LIST;

/** 歌曲载体：整表 / 顺序索引 / 单曲分片 */
export const isSongKey = (key: string): boolean =>
  key === STORAGE_KEYS.SONGS || key === STORAGE_KEYS.SONGS_INDEX || key.startsWith(SONG_ENTRY_PREFIX);

/** 单曲分片键（一个键一首歌，可删判据与整表不同，故单独可辨） */
export const isSongShardKey = (key: string): boolean => key.startsWith(SONG_ENTRY_PREFIX);

/**
 * 可原样抄进 kv 镜像的键：**本应用前缀内**、非敏感、非实体、非歌曲载体。
 *
 * 前缀守卫与「别人的键不碰」是同一件事的两面：同源域名下可能部署了其他应用（子路径共域），
 * 转录既不得把它们的键抄进本应用 kv，也不得在退役时删掉它们。
 */
export const isTranscribableKvKey = (key: string): boolean =>
  key.startsWith(STORAGE_KEY_PREFIX) && !EXCLUDED_KEYS.has(key) && !isEntityKey(key) && !isSongKey(key);
