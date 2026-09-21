import type { ImportExportPayload } from '@/app/types';
import type { SyncProviderKind } from '@/platform/types';

export type { SyncProviderKind };

export interface BaseSyncConfig {
  kind: SyncProviderKind;
}

export interface GithubSyncConfig extends BaseSyncConfig {
  kind: 'github';
  token?: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/** Gitee 与 GitHub 的仓库文件同步结构一致：单 base64 信封文件，按分支读写。 */
export interface GiteeSyncConfig extends BaseSyncConfig {
  kind: 'gitee';
  token?: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export interface WebdavSyncConfig extends BaseSyncConfig {
  kind: 'webdav';
  serverUrl: string;
  username?: string;
  password?: string;
  /** 可选 CORS 代理地址。设置后请求会经由 `${proxyUrl}?url=<目标>` 转发，用于绕开浏览器跨域限制。 */
  proxyUrl?: string;
}

export interface ServerSyncConfig extends BaseSyncConfig {
  kind: 'server';
  serverUrl?: string;
  /** 服务器上传鉴权 Token（可选，仅 push 上传请求携带） */
  token?: string;
}

export type SyncConfig = GithubSyncConfig | GiteeSyncConfig | WebdavSyncConfig | ServerSyncConfig;

export interface SyncProvider {
  pull(): Promise<ImportExportPayload>;
  /**
   * 上传载荷。meta 为调用方已算好的校验元数据：需要它的 provider（server 拼 query）
   * 直接消费，不得再自行全量 stringify 一遍（一次推送已付两次序列化——校验和与上传体）。
   */
  push(payload: ImportExportPayload, meta?: SyncMeta): Promise<{ sha: string }>;
  exists(): Promise<boolean>;
  /**
   * 测试远端连通性与凭据有效性（不发数据写请求）。
   * 返回人类可读的成功描述（供 message 展示）；失败抛 SyncError，按 code 细分原因。
   */
  testConnection(): Promise<string>;
  /**
   * 读取云端校验元数据；云端无 meta（旧数据/从未上传）时返回 null。
   * 四种 provider（GitHub/Gitee/WebDAV/Server）全部实现——历史上 server 曾被当作
   * 「单端点不支持」，后来补齐（fetchMeta 走独立路由、pushMeta 为合法 no-op，md5 随 push 的
   * query 上传），此后 `‘fetchMeta’ in provider` 式守卫恒真，按可选能力表达只会留下死分支。
   */
  fetchMeta(): Promise<SyncMeta | null>;
  /** 写入/更新云端 meta（随一次上传调用） */
  pushMeta(meta: SyncMeta): Promise<void>;
}

/** 云端心跳校验元数据（最小比对数据）：数据源的 MD5 校验和与最新修改时间戳，独立于数据源分开上传。 */
export interface SyncMeta {
  md5: string;
  updatedAt: number;
}

export type SyncErrorCode =
  'FILE_NOT_FOUND' | 'INVALID_CLOUD_DATA' | 'REQUEST_FAILED' | 'TIMEOUT' | 'CORS' | 'NETWORK' | 'CONFLICT';

/**
 * 同步层统一错误。携带 `code` 以便上层（useSyncService）映射为用户友好的提示，
 * 避免直接把底层 `fetch` 的模糊 `TypeError: Failed to fetch` 抛给用户。
 */
export class SyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}
