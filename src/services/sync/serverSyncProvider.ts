import { serializeForStorage } from '@/utils/core/common';
import { SyncError, type ServerSyncConfig, type SyncProvider } from './provider';
import { createSyncProviderBase } from './syncBase';

const TIMEOUT_MS = 15000;

/**
 * 线上服务器（Custom Server / REST API）同步 provider。
 *
 * 适用于自建 Node.js / Go / Python / Java 后端，或 Cloudflare Worker + D1/KV 等无服务器接口。
 *
 * 协议约定：
 *  - pull(): GET ${serverUrl}，携带 Authorization: Bearer <token>（若配置了 token），返回 ImportExportPayload JSON。
 *  - push(): POST ${serverUrl}，携带 Content-Type: application/json 与 JSON 字符串体。
 *  - testConnection(): GET ${serverUrl} 探测连通性与认证凭据。
 */
async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const json = await response.clone().json();
    if (json?.error) return ` (${json.error})`;
    if (json?.message) return ` (${json.message})`;
  } catch {
    // 非 JSON 响应保持原状
  }
  return '';
}

export function createServerSyncProvider(config: ServerSyncConfig): SyncProvider {
  const serverUrl = config.serverUrl.trim();

  const baseHeaders: Record<string, string> = config.token?.trim()
    ? { Authorization: `Bearer ${config.token.trim()}` }
    : {};

  const { request, decodePayload } = createSyncProviderBase({
    baseHeaders,
    defaultUrl: serverUrl,
    classifyNetworkError: err => {
      const detail = err instanceof Error ? err.message : String(err);
      return new SyncError('NETWORK', `请求服务器失败：请检查网络或地址有效性。底层错误：${detail}`);
    },
    readRaw: async response => response.text(),
    timeoutMs: TIMEOUT_MS,
  });

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '服务端暂无已保存的数据');
      if (!response.ok) {
        const errorDetail = await extractErrorMessage(response);
        throw new SyncError('REQUEST_FAILED', `服务器返回错误状态码 ${response.status}${errorDetail}`);
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
      const errorDetail = await extractErrorMessage(head);
      throw new SyncError('REQUEST_FAILED', `服务器返回错误状态码 ${head.status}${errorDetail}`);
    },
    async push(payload) {
      const response = await request({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeForStorage(payload),
      });
      if (!response.ok) {
        const errorDetail = await extractErrorMessage(response);
        throw new SyncError('REQUEST_FAILED', `服务器返回错误状态码 ${response.status}${errorDetail}`);
      }
      const etag = response.headers.get('ETag') ?? Date.now().toString();
      return { sha: etag };
    },
    async testConnection(): Promise<string> {
      const response = await request({ method: 'GET' });
      if (response.ok) {
        return config.token ? '服务器连接成功，凭据验证通过' : '服务器连接成功（未配置 Token）';
      }
      if (response.status === 404) {
        return '服务器连接成功（服务端暂无数据存档）';
      }
      if (response.status === 401 || response.status === 403) {
        throw new SyncError('REQUEST_FAILED', '认证失败：请检查 Token / API Key');
      }
      const serverError = await extractErrorMessage(response);
      throw new SyncError('REQUEST_FAILED', `服务器返回错误状态码 ${response.status}${serverError}`);
    },
  };
}
