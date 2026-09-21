import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider.ts';
import { createSyncProviderBase } from './syncBase.ts';

import type { SyncProvider, WebdavSyncConfig } from './provider.ts';

const WEBDAV_REMOTE_FILE_PATH = 'FretLogic/chords.json'; // 内部写死
/** 独立校验元数据载体：数据源文件同目录下的一份小文件，启动检测只拉这份最小数据 */
const WEBDAV_META_FILE_PATH = 'FretLogic/chords.meta.json';

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
  // 凭据安全门禁（构造期即拒绝，避免把问题带进请求）：
  //  1. 非 https 的服务器地址一律拒绝（localhost/127.0.0.1 供本地调试豁免）——
  //     Basic 凭据走明文 http 等于公开；
  //  2. 地址里内嵌 userinfo（https://user:pass@host）一律拒绝—— userinfo 会被
  //     encodeURIComponent 进代理 URL（?url=），凭据随之扩散到代理侧可解可日志。
  const trimmedServerUrl = config.serverUrl.trim();
  let parsedServerUrl: URL;
  try {
    parsedServerUrl = new URL(trimmedServerUrl);
  } catch {
    throw new SyncError('REQUEST_FAILED', 'WebDAV 服务器地址无效');
  }
  const isLocalDev = parsedServerUrl.hostname === 'localhost' || parsedServerUrl.hostname === '127.0.0.1';
  if (parsedServerUrl.protocol !== 'https:' && !isLocalDev)
    throw new SyncError('REQUEST_FAILED', 'WebDAV 服务器必须使用 HTTPS（本地调试可使用 localhost）');

  if (parsedServerUrl.username || parsedServerUrl.password)
    throw new SyncError('REQUEST_FAILED', 'WebDAV 地址不应内嵌账号密码，请分别填写用户名与密码字段');

  const serverBase = config.serverUrl.replace(/\/+$/, '');
  const fileUrl = `${serverBase}/${WEBDAV_REMOTE_FILE_PATH.replace(/^\/+/, '')}`;
  const metaFileUrl = `${serverBase}/${WEBDAV_META_FILE_PATH.replace(/^\/+/, '')}`;
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
  // 仅白名单状态码视为成功：201=已创建，200/405=已存在（部分服务器对已存在目录返回 200）；
  // 401/403 权限错误、423 Locked、507 配额满、5xx 等一律显式抛错，不再静默吞掉。
  const ensureParentCollections = async (): Promise<void> => {
    const rel = WEBDAV_REMOTE_FILE_PATH.replace(/^\/+/, '');
    const lastSlash = rel.lastIndexOf('/');
    if (lastSlash < 0) return; // 文件就在根目录，无需创建父集合
    const segments = rel.slice(0, lastSlash).split('/');
    let acc = serverBase;
    for (const seg of segments) {
      acc += `/${seg}`;
      const res = await request({ method: 'MKCOL' }, acc);
      if (res.status === 201 || res.status === 200 || res.status === 405) continue;
      if (res.status === 401 || res.status === 403)
        throw new SyncError('REQUEST_FAILED', `WebDAV 创建目录失败（状态码 ${res.status}），请检查账号权限`);

      throw new SyncError('REQUEST_FAILED', `WebDAV 创建目录失败（状态码 ${res.status}）`);
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
      // 条件写（If-Match）：推送前探测当前 ETag，携带后若云端已被其他设备更新，
      // 服务器将以 412 拒绝写入，避免静默覆盖造成丢失更新（走下方 CONFLICT 分支）。
      // 服务器不返回 ETag（或 HEAD 探测失败）时退化为无条件写，与历史行为一致。
      let ifMatch: string | undefined;
      try {
        const head = await request({ method: 'HEAD' });
        if (head.ok) {
          const etag = head.headers.get('ETag');
          // If-Match 仅接受强验证器，弱 ETag（W/ 前缀）不能用于条件写
          if (etag && !etag.startsWith('W/')) ifMatch = etag;
        }
      } catch {
        // 探测失败不阻断推送
      }
      const response = await request(
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
          body: serializeForStorage(payload),
        },
        fileUrl
      );
      if (response.status === 409 || response.status === 412)
        throw new SyncError('CONFLICT', 'WebDAV 提示版本冲突：云端数据已被修改，请先拉取最新数据');

      if (!response.ok) throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
      const etag = response.headers.get('ETag') ?? '';
      return { sha: etag };
    },
    async fetchMeta() {
      const response = await request({ method: 'GET' }, metaFileUrl);
      if (response.status === 404) return null; // 旧数据/从未上传：无独立 meta
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
      try {
        const parsed = (await response.json()) as { md5?: unknown; updatedAt?: unknown };
        if (typeof parsed.md5 === 'string' && typeof parsed.updatedAt === 'number')
          return { md5: parsed.md5, updatedAt: parsed.updatedAt };

        return null;
      } catch {
        return null; // meta 损坏视为无 meta，引导重传
      }
    },
    async pushMeta(meta) {
      // meta 与数据源同目录，父集合由数据源 push 建立，直接复用确保逻辑
      await ensureParentCollections();
      const response = await request(
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: serializeForStorage(meta) },
        metaFileUrl
      );
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `WebDAV meta 写入返回错误状态码：${response.status}`);
    },
    async testConnection(): Promise<string> {
      // PROPFIND 根集合（Depth: 0）是 WebDAV 标准连通性探测：同时验证地址、账号密码与服务器支持。
      // 消息区分「直连」与「经代理转发」，帮助定位 CORS 问题出自哪一环。
      const viaProxy = Boolean(config.proxyUrl);
      const channel = viaProxy ? '经代理转发' : '直连';
      const response = await request({ method: 'PROPFIND', headers: { Depth: '0' } }, serverBase);
      if (response.ok || response.status === 207)
        return config.username ? `WebDAV ${channel}可达，账号密码有效` : `WebDAV ${channel}可达（未配置账号）`;

      if (response.status === 401 || response.status === 403)
        throw new SyncError('REQUEST_FAILED', '认证失败：请检查用户名与密码');

      if (response.status === 405)
        // 服务器不支持 PROPFIND（非标准 WebDAV 实现），但服务本身有响应
        return `WebDAV ${channel}有响应（不支持 PROPFIND，请以实际同步结果为准）`;

      throw new SyncError('REQUEST_FAILED', `WebDAV 服务器返回错误状态码：${response.status}`);
    },
  };
}
