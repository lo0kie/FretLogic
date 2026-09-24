import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider';
import {
  buildApiError,
  buildSyncCommitMessage,
  createSyncProviderBase,
  decodeBase64Envelope,
  describeApiError,
  extractApiErrorDetail,
  formatApiErrorDetail,
  probeRemoteSha,
  readSyncMeta,
} from './syncBase';

import type { GithubSyncConfig, SyncProvider } from './provider';

/** 非 2xx 的错误文案前缀（两处写入用 meta 专用前缀，与探测区分开） */
const GITHUB_ERROR_PREFIX = 'GitHub 返回错误状态码';
const GITHUB_META_ERROR_PREFIX = 'GitHub meta 写入返回错误状态码';

/** 创建 GitHub Contents API 同步 provider：远端为单个 base64 信封文件，按分支读写。 */
export function createGithubSyncProvider(config: GithubSyncConfig): SyncProvider {
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
  /** 独立校验元数据载体：数据源文件同目录下的 `.meta.json`，启动检测只拉这份最小数据 */
  const metaFileUrl = `${apiUrl}.meta.json`;
  const baseHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  const { request, decodePayload } = createSyncProviderBase({
    baseHeaders,
    defaultUrl: `${apiUrl}?ref=${config.branch}`,
    readRaw: decodeBase64Envelope,
  });

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '云端文件不存在');
      if (!response.ok) throw await buildApiError(response, GITHUB_ERROR_PREFIX);
      return decodePayload(response);
    },
    async exists() {
      const response = await request({ method: 'GET' });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw await buildApiError(response, GITHUB_ERROR_PREFIX);
    },
    async push(payload) {
      const existing = await request({ method: 'GET' });
      const sha = await probeRemoteSha(existing, GITHUB_ERROR_PREFIX);

      const response = await request(
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: buildSyncCommitMessage(),
            content: base64EncodeUtf8(serializeForStorage(payload)),
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        apiUrl
      );
      if (response.status === 409)
        throw new SyncError(
          'CONFLICT',
          `GitHub 提示版本冲突：云端文件已被其他提交更新，请先拉取${await describeApiError(response)}`
        );

      if (!response.ok) {
        const detail = await extractApiErrorDetail(response);
        const suffix = formatApiErrorDetail(detail);
        // 409 是官方文档里「sha 不匹配」的状态码；个别网关/旧行为改用 422 并在 message 里点出 sha。
        // 只认 detail 里出现 sha 的报错：真正的请求体校验失败（422 Validation failed）仍按 REQUEST_FAILED 抛，
        // 否则会把「文件内容不合法」误报成「版本冲突，请先拉取」，给出完全错误的处置方向。
        if (detail.toLowerCase().includes('sha'))
          throw new SyncError('CONFLICT', `GitHub 提示版本冲突：云端文件已被其他提交更新，请先拉取${suffix}`);

        throw new SyncError('REQUEST_FAILED', `${GITHUB_ERROR_PREFIX}：${response.status}${suffix}`);
      }
      const body = await response.json();
      return { sha: String(body.commit?.sha ?? body.sha ?? '') };
    },
    async fetchMeta() {
      const response = await request({ method: 'GET' }, `${metaFileUrl}?ref=${encodeURIComponent(config.branch)}`);
      if (response.status === 404) return null; // 旧数据/从未上传：无独立 meta
      if (!response.ok) throw await buildApiError(response, GITHUB_ERROR_PREFIX);
      return readSyncMeta(async () => JSON.parse(await decodeBase64Envelope(response)));
    },
    async pushMeta(meta) {
      // 探测必须带 ref（T1 同源修复）：不带 ref 时 GitHub 读默认分支，目标分支已有 meta 会被误判
      const existing = await request({ method: 'GET' }, `${metaFileUrl}?ref=${encodeURIComponent(config.branch)}`);
      const sha = await probeRemoteSha(existing, GITHUB_ERROR_PREFIX);

      const response = await request(
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: buildSyncCommitMessage(),
            content: base64EncodeUtf8(serializeForStorage(meta)),
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        metaFileUrl
      );
      if (!response.ok) throw await buildApiError(response, GITHUB_META_ERROR_PREFIX);
    },
    async testConnection(): Promise<string> {
      // 仅探测仓库可达性与 Token 有效性，不依赖 branch/path（分支与文件路径由「查询分支」/拉取负责）
      const response = await request({ method: 'GET' }, `https://api.github.com/repos/${config.owner}/${config.repo}`);
      if (response.ok)
        return config.token ? 'GitHub 仓库可达，Token 有效' : 'GitHub 仓库可达（公开仓库，未配置 Token）';

      if (response.status === 401)
        throw new SyncError('REQUEST_FAILED', `Token 无效或已过期${await describeApiError(response)}`);
      if (response.status === 404)
        throw new SyncError(
          'REQUEST_FAILED',
          config.token ? '仓库不存在，或 Token 无该仓库权限' : '仓库不存在或为私有仓库（私有需配置 Token）'
        );

      throw await buildApiError(response, GITHUB_ERROR_PREFIX);
    },
  };
}
