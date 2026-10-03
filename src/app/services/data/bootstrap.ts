/**
 * 数据层引导（IndexedDB 唯一权威存储，localStorage 已退役）
 *
 * 数据流设计（迁移完成后）：
 *   UI/Store ──同步读写──> kv 内存镜像 / IDB 仓储（异步）
 *   kv 镜像 ──微批/pagehide──> IDB `kv` 对象库
 *
 * 启动顺序（见 main.ts）：
 *   1. hydrateIdbKv()        —— kv 镜像从 IDB 水合，此后 useStorage 同步读可用；
 *   2. transcribeLegacyLocalStorage() —— 一次性把旧 localStorage 数据搬入 IDB 并清空（幂等）；
 *   3. 各数据域 store hydrate() —— 实体数据异步水合，完成后才挂载应用。
 */
import { hydrateIdbKv } from '@/platform/services/storage/idbKv';
import { logger } from '@/platform/utils/logger';

import { transcribeLegacyLocalStorage } from './migrateLegacy';

/** 启动引导：kv 水合 + 旧存储退役转录（幂等、失败不阻塞） */
export async function bootstrapDataLayer(): Promise<void> {
  // 两步各自兜底，**不能共用一个 try**：hydrateIdbKv 抛错时若直接冒泡出去，
  // 紧随其后的旧存储转录就一次都跑不到 —— 而转录是「旧数据搬进 IDB 后清源」的单向动作，
  // 漏跑等于用户升级后旧数据静默留在原地（应用起来一切正常，看不出少了这一步）。
  // 水合失败本身由 idbKv 内部重试 + main.ts 的超时兜底覆盖，这里只负责不让它拖垮转录。
  try {
    await hydrateIdbKv();
  } catch (error) {
    logger.error('bootstrap', 'kv 镜像水合失败（本次会话读到的偏好可能为出厂默认值）', error);
  }
  try {
    await transcribeLegacyLocalStorage();
  } catch (error) {
    logger.error('bootstrap', '旧存储转录失败（保留旧数据，不影响应用运行）', error);
  }
}
