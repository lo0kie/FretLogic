import type { ImportExportPayload } from '@/types';

export type SyncProviderKind = 'github' | 'gitee' | 'webdav' | 'server';

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
}

export type SyncConfig = GithubSyncConfig | GiteeSyncConfig | WebdavSyncConfig | ServerSyncConfig;

export interface SyncProvider {
  pull(): Promise<ImportExportPayload>;
  push(payload: ImportExportPayload): Promise<{ sha: string }>;
  exists(): Promise<boolean>;
  /**
   * 测试远端连通性与凭据有效性（不发数据写请求）。
   * 返回人类可读的成功描述（供 toast 展示）；失败抛 SyncError，按 code 细分原因。
   */
  testConnection(): Promise<string>;
}

/**
 * 可选能力：仅仓库型 provider（GitHub / Gitee）具备（拉取远程分支列表）。
 * 调用方用 `'listBranches' in provider` 守卫，不要求所有 provider 实现。
 */
export interface SyncBranchesProvider extends SyncProvider {
  listBranches(): Promise<string[]>;
}

export type SyncErrorCode = 'FILE_NOT_FOUND' | 'INVALID_CLOUD_DATA' | 'REQUEST_FAILED' | 'TIMEOUT' | 'CORS' | 'NETWORK';

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
