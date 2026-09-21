import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider';
import {
  buildSyncCommitMessage,
  createSyncProviderBase,
  decodeBase64Envelope,
  describeApiError,
  extractApiErrorDetail,
} from './syncBase';

import type { GiteeSyncConfig, SyncProvider } from './provider';

const GITEE_API_BASE = 'https://gitee.com/api/v5';

/**
 * 创建 Gitee API v5 仓库同步 provider：远端为单个 base64 信封文件，按分支读写。
 * 与 GitHub 的差异：
 * 1. 认证走 `Authorization: token <token>` 请求头（安全传递，不拼接进 URL 查询参数或 body）；
 * 2. 创建文件用 POST、更新文件用 PUT（更新必须在 body 携带文件 blob sha），无 sha 时 GitHub 的
 *    单 PUT 自动创建在这里不适用，故 push 先探测已存在与否再选择方法。
 */
export function createGiteeSyncProvider(config: GiteeSyncConfig): SyncProvider {
  const fileUrl = (ref?: string) => {
    const base = `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  };
  /** 独立校验元数据载体：数据源文件同目录下的 `.meta.json`，启动检测只拉这份最小数据 */
  const metaFileUrl = (ref?: string) => {
    const base = `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}.meta.json`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  };

  const repoUrl = () => `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}`;

  const { request, decodePayload } = createSyncProviderBase({
    // Gitee API v5 标准认证：Authorization: token <token> 请求头
    baseHeaders: config.token ? { Authorization: `token ${config.token}` } : undefined,
    defaultUrl: () => fileUrl(config.branch),
    readRaw: decodeBase64Envelope,
  });

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '云端文件不存在');
      if (!response.ok)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${response.status}${await describeApiError(response)}`
        );
      return decodePayload(response);
    },
    async exists() {
      const response = await request({ method: 'GET' });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new SyncError(
        'REQUEST_FAILED',
        `Gitee 返回错误状态码：${response.status}${await describeApiError(response)}`
      );
    },
    async push(payload) {
      // 探测远端文件：存在则取 blob sha（更新必需），404 表示需新建
      const existing = await request({ method: 'GET' });
      let sha = '';
      if (existing.ok) sha = String((await existing.json()).sha ?? '');
      else if (existing.status !== 404)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${existing.status}${await describeApiError(existing)}`
        );

      // 新建（POST）与更新（PUT）是 Gitee 的两个独立接口
      const method = sha ? 'PUT' : 'POST';
      const response = await request(
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: base64EncodeUtf8(serializeForStorage(payload)),
            message: buildSyncCommitMessage(),
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        fileUrl()
      );
      if (response.status === 409)
        throw new SyncError(
          'CONFLICT',
          `Gitee 提示版本冲突：云端文件已被修改，请先拉取最新数据${await describeApiError(response)}`
        );

      if (response.status === 400) {
        const errDetail = await extractApiErrorDetail(response.clone());
        if (errDetail.toLowerCase().includes('sha') || errDetail.includes('冲突'))
          throw new SyncError(
            'CONFLICT',
            `Gitee 提示版本冲突：云端文件已被修改，请先拉取最新数据${await describeApiError(response)}`
          );
      }
      if (!response.ok)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${response.status}${await describeApiError(response)}`
        );
      const body = await response.json();
      return { sha: String(body.commit?.sha ?? body.sha ?? '') };
    },
    async fetchMeta() {
      const response = await request({ method: 'GET' }, metaFileUrl(config.branch));
      if (response.status === 404) return null; // 旧数据/从未上传：无独立 meta
      if (!response.ok)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${response.status}${await describeApiError(response)}`
        );
      try {
        const parsed = JSON.parse(await decodeBase64Envelope(response)) as { md5?: unknown; updatedAt?: unknown };
        if (typeof parsed.md5 === 'string' && typeof parsed.updatedAt === 'number')
          return { md5: parsed.md5, updatedAt: parsed.updatedAt };

        return null;
      } catch {
        return null; // meta 损坏视为无 meta，引导重传
      }
    },
    async pushMeta(meta) {
      // 探测必须带 ref（T1）：不带 branch 参数时 Gitee 读默认分支，
      // 目标分支已有 meta 而默认分支没有时会误判 200+[]（拿不到 sha）→ POST 新建必失败。
      const existing = await request({ method: 'GET' }, metaFileUrl(config.branch));
      let sha = '';
      if (existing.ok) {
        const body = await existing.json();
        sha = String(Array.isArray(body) ? '' : (body.sha ?? ''));
      } else if (existing.status !== 404)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${existing.status}${await describeApiError(existing)}`
        );

      const method = sha ? 'PUT' : 'POST';
      const response = await request(
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: base64EncodeUtf8(serializeForStorage(meta)),
            message: buildSyncCommitMessage(),
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        metaFileUrl()
      );
      if (!response.ok)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee meta 写入返回错误状态码：${response.status}${await describeApiError(response)}`
        );
    },
    async testConnection(): Promise<string> {
      const response = await request({ method: 'GET' }, repoUrl());
      if (response.ok) return config.token ? 'Gitee 仓库可达，Token 有效' : 'Gitee 仓库可达（公开仓库，未配置 Token）';

      if (response.status === 401)
        throw new SyncError('REQUEST_FAILED', `Token 无效或已过期${await describeApiError(response)}`);
      if (response.status === 404)
        throw new SyncError(
          'REQUEST_FAILED',
          config.token ? '仓库不存在，或 Token 无该仓库权限' : '仓库不存在或为私有仓库（私有需配置 Token）'
        );

      throw new SyncError(
        'REQUEST_FAILED',
        `Gitee 返回错误状态码：${response.status}${await describeApiError(response)}`
      );
    },
  };
}
