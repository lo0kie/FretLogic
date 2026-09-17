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

import { transcribeLegacyLocalStorage } from './migrateLegacy.ts';

/** 启动引导：kv 水合 + 旧存储退役转录（幂等、失败不阻塞） */
export async function bootstrapDataLayer(): Promise<void> {
  await hydrateIdbKv();
  try {
    await transcribeLegacyLocalStorage();
  } catch (error) {
    logger.error('bootstrap', '旧存储转录失败（保留旧数据，不影响应用运行）', error);
  }
}
