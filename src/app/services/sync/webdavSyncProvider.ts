import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider.ts';
import { createSyncProviderBase } from './syncBase.ts';

import type { SyncProvider, WebdavSyncConfig } from './provider.ts';

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

  const baseHeaders: Record<string, string> = config.username
    ? { Authorization: `Basic ${base64EncodeUtf8(`${config.username}:${config.password ?? ''}`)}` }
    : {};

  const { request, decodePayload } = createSyncProviderBase({
    baseHeaders,
    defaultUrl: fileUrl,
    buildUrl: buildRequestUrl,
    // 浏览器对跨域/CORS 或连接失败都只抛出模糊的 TypeError，无法严格区分。
    // 用「是否已配置代理」来给出更精准的引导：
    //  - 已配代理却失败 → 多半是本地代理没启动 / 地址不通（而非目标服务器 CORS）
    //  - 未配代理失败 → 多半是目标服务器跨域 CORS 限制
    classifyNetworkError: err => {
      if (config.proxyUrl) {
        const detail = err instanceof Error ? err.message : String(err);
        return new SyncError('NETWORK', `经代理的请求失败：请检查代理状态。底层错误：${detail}`);
      }
      return new SyncError('CORS', 'WebDAV 请求被浏览器拦截（通常为跨域 CORS 限制）');
    },
  });

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
          body: serializeForStorage(payload),
        },
        fileUrl
      );
      if (response.status === 409 || response.status === 412) {
        throw new SyncError('CONFLICT', 'WebDAV 提示版本冲突：云端数据已被修改，请先拉取最新数据');
      }
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
      const etag = response.headers.get('ETag') ?? '';
      return { sha: etag };
    },
    async testConnection(): Promise<string> {
      // PROPFIND 根集合（Depth: 0）是 WebDAV 标准连通性探测：同时验证地址、账号密码与服务器支持。
      // 消息区分「直连」与「经代理转发」，帮助定位 CORS 问题出自哪一环。
      const viaProxy = Boolean(config.proxyUrl);
      const channel = viaProxy ? '经代理转发' : '直连';
      const response = await request({ method: 'PROPFIND', headers: { Depth: '0' } }, serverBase);
      if (response.ok || response.status === 207) {
        return config.username ? `WebDAV ${channel}可达，账号密码有效` : `WebDAV ${channel}可达（未配置账号）`;
      }
      if (response.status === 401 || response.status === 403) {
        throw new SyncError('REQUEST_FAILED', '认证失败：请检查用户名与密码');
      }
      if (response.status === 405) {
        // 服务器不支持 PROPFIND（非标准 WebDAV 实现），但服务本身有响应
        return `WebDAV ${channel}有响应（不支持 PROPFIND，请以实际同步结果为准）`;
      }
      throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
    },
  };
}
