import { serializeForStorage } from '@/platform/utils/common';
import { CLOUD_SYNC_CONFIG } from '@/platform/utils/constants';

import { SyncError } from './provider.ts';
import { createSyncProviderBase, extractApiErrorDetail } from './syncBase.ts';

import type { ServerSyncConfig, SyncProvider } from './provider.ts';

/**
 * 线上服务器（Custom Server / Cloudflare Worker D1）同步 provider。
 *
 * 由 Vite 构建环境注入服务地址与环境标识，无需用户在界面配置 Token 或接口地址。
 * 根据构建环境自动分发至对应的开发 / 生产数据库。
 *
 * 协议约定：
 *  - pull(): GET ${serverUrl}，返回 ImportExportPayload JSON。
 *  - push(): POST ${serverUrl}，携带 Content-Type: application/json 与 JSON 字符串体。
 *  - testConnection(): GET ${serverUrl} 探测连通性。
 */

/** 创建线上服务器同步 provider：pull 走 GET、push 走 POST，环境标识随请求头分发。 */
export function createServerSyncProvider(config?: Partial<ServerSyncConfig>): SyncProvider {
  const serverUrl = (config?.serverUrl?.trim() || CLOUD_SYNC_CONFIG.SERVER_URL).trim();

  const baseHeaders: Record<string, string> = {
    'X-Environment': CLOUD_SYNC_CONFIG.MODE,
  };

  const { request, decodePayload } = createSyncProviderBase({
    baseHeaders,
    defaultUrl: serverUrl,
    classifyNetworkError: err => {
      const detail = err instanceof Error ? err.message : String(err);
      return new SyncError('NETWORK', `请求服务器失败：请检查网络或地址有效性。底层错误：${detail}`);
    },
  });

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '服务端暂无已保存的数据');
      if (!response.ok) {
        const errorDetail = await extractApiErrorDetail(response);
        throw new SyncError(
          'REQUEST_FAILED',
          `服务器返回错误状态码 ${response.status}${errorDetail ? ` (${errorDetail})` : ''}`
        );
      }
      return decodePayload(response);
    },
    async exists() {
      const head = await request({ method: 'HEAD' });
      if (head.status === 404) return false;
      if (head.ok) return true;
      // 部分后端未实现 HEAD 路由时回退到 GET 判断
      if (head.status === 405) {
        const getRes = await request({ method: 'GET' });
        if (getRes.status === 404) return false;
        return getRes.ok;
      }
      const errorDetail = await extractApiErrorDetail(head);
      throw new SyncError(
        'REQUEST_FAILED',
        `服务器返回错误状态码 ${head.status}${errorDetail ? ` (${errorDetail})` : ''}`
      );
    },
    async push(payload) {
      const response = await request({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeForStorage(payload),
      });
      if (!response.ok) {
        const errorDetail = await extractApiErrorDetail(response);
        throw new SyncError(
          'REQUEST_FAILED',
          `服务器返回错误状态码 ${response.status}${errorDetail ? ` (${errorDetail})` : ''}`
        );
      }
      const etag = response.headers.get('ETag') ?? Date.now().toString();
      return { sha: etag };
    },
    async testConnection(): Promise<string> {
      const response = await request({ method: 'GET' });
      const envLabel = CLOUD_SYNC_CONFIG.IS_DEV ? '开发环境' : '生产环境';
      if (response.ok) {
        return `服务器连接成功，已连通线上数据库 (${envLabel})`;
      }
      if (response.status === 404) {
        return `服务器连接成功（服务端暂无数据存档，${envLabel}）`;
      }
      const serverError = await extractApiErrorDetail(response);
      throw new SyncError(
        'REQUEST_FAILED',
        `服务器返回错误状态码 ${response.status}${serverError ? ` (${serverError})` : ''}`
      );
    },
  };
}
