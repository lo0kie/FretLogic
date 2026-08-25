import { validateImportExportPayload } from '@/services/validation/payload';
import type { ImportExportPayload } from '@/types';
import { base64EncodeUtf8 } from '@/utils/common';
import { SyncError, type SyncProvider, type WebdavSyncConfig } from './provider';

const TIMEOUT_MS = 15000;
const WEBDAV_REMOTE_FILE_PATH = 'FretLogic/chords.json'; // 内部写死

/**
 * WebDAV 同步 provider。
 *
 * 与 GitHub contents API 不同，WebDAV 直接 GET/PUT 文件本身（非 base64 信封），
 * 因此 pull/push 直接读写原始 JSON 文本。
 *
 * 注意：
 *  - 浏览器直连多数 WebDAV 服务器可能被 CORS 拦截（GitHub API 天生带 CORS 头，
 *    而大量 NAS / 自建 WebDAV 不返回 CORS 头）。两种解法见下。
 *  - 许多 WebDAV 服务器（含坚果云）不会自动创建父目录：对「父集合不存在」的资源做
 *    PUT 会返回 409 Conflict。因此 push 前会先用 MKCOL 自顶向下创建父集合。
 */
export function createWebdavSyncProvider(config: WebdavSyncConfig): SyncProvider {
  const serverBase = config.serverUrl.replace(/\/+$/, '');
  const fileUrl = `${serverBase}/${WEBDAV_REMOTE_FILE_PATH.replace(/^\/+/, '')}`;
  // 配置了代理则经代理转发，用于绕开浏览器跨域限制
  const buildRequestUrl = (resourceUrl: string): string =>
    config.proxyUrl ? `${config.proxyUrl.replace(/\/+$/, '')}?url=${encodeURIComponent(resourceUrl)}` : resourceUrl;

  const headers: Record<string, string> = config.username
    ? { Authorization: `Basic ${base64EncodeUtf8(`${config.username}:${config.password ?? ''}`)}` }
    : {};

  const request = async (init: RequestInit, resourceUrl: string = fileUrl): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(buildRequestUrl(resourceUrl), {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SyncError('TIMEOUT', '请求超时');
      }
      // 浏览器对跨域/CORS 或连接失败都只抛出模糊的 TypeError，无法严格区分。
      // 用「是否已配置代理」来给出更精准的引导：
      //  - 已配代理却失败 → 多半是本地代理没启动 / 地址不通（而非目标服务器 CORS）
      //  - 未配代理失败 → 多半是目标服务器跨域 CORS 限制
      if (config.proxyUrl) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new SyncError('NETWORK', `经代理的请求失败：请检查代理状态。底层错误：${detail}`);
      }
      throw new SyncError('CORS', 'WebDAV 请求被浏览器拦截（通常为跨域 CORS 限制）');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // PUT 前确保父集合存在：自顶向下对每个祖先目录发 MKCOL。
  // 201=已创建，405=已存在（均可视为成功）；401/403 视为权限错误抛出。
  const ensureParentCollections = async (): Promise<void> => {
    const rel = WEBDAV_REMOTE_FILE_PATH.replace(/^\/+/, '');
    const lastSlash = rel.lastIndexOf('/');
    if (lastSlash < 0) return; // 文件就在根目录，无需创建父集合
    const segments = rel.slice(0, lastSlash).split('/');
    let acc = serverBase;
    for (const seg of segments) {
      acc += `/${seg}`;
      const res = await request({ method: 'MKCOL' }, acc);
      if (res.status === 401 || res.status === 403) {
        throw new SyncError('REQUEST_FAILED', `WebDAV 创建目录失败（状态码 ${res.status}），请检查账号权限`);
      }
    }
  };

  const decodePayload = async (response: Response): Promise<ImportExportPayload> => {
    const raw = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据不是合法的 JSON');
    }
    const result = validateImportExportPayload(parsed);
    if (!result.isValid || !result.payload) throw new SyncError('INVALID_CLOUD_DATA', '云端数据格式校验失败');
    return result.payload;
  };

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '云端文件不存在');
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
      return decodePayload(response);
    },
    async exists() {
      const head = await request({ method: 'HEAD' });
      if (head.status === 404) return false;
      if (head.ok) return true;
      // 部分服务器不支持 HEAD，回退到 GET 判断
      if (head.status === 405) {
        const getRes = await request({ method: 'GET' });
        if (getRes.status === 404) return false;
        return getRes.ok;
      }
      throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${head.status}`);
    },
    async push(payload) {
      await ensureParentCollections();
      const response = await request(
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload, null, 2),
        },
        fileUrl
      );
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
      const etag = response.headers.get('ETag') ?? '';
      return { sha: etag };
    },
  };
}
