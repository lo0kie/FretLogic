import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { createGitSyncProviderMethods } from './gitSyncProviderFactory';
import { SyncError } from './provider';
import {
  buildSyncCommitMessage,
  describeApiError,
  extractApiErrorDetail,
  formatApiErrorDetail,
  probeRemoteSha,
} from './syncBase';

import type { GithubSyncConfig, SyncProvider } from './provider';

/** 非 2xx 的错误文案前缀（两处写入用 meta 专用前缀，与探测区分开） */
const GITHUB_ERROR_PREFIX = 'GitHub 返回错误状态码';
const GITHUB_META_ERROR_PREFIX = 'GitHub meta 写入返回错误状态码';

/** 创建 GitHub Contents API 同步 provider：远端为单个 base64 信封文件，按分支读写。 */
export function createGithubSyncProvider(config: GithubSyncConfig): SyncProvider {
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
  /** 独立校验元数据载体：数据源文件同目录下的 `.meta.json`，推送前的判等与冲突判定只拉这份最小数据 */
  const metaFileUrl = `${apiUrl}.meta.json`;
  const baseHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  const { request, ...provider } = createGitSyncProviderMethods({
    baseHeaders,
    defaultUrl: `${apiUrl}?ref=${config.branch}`,
    hostLabel: 'GitHub',
    hasToken: Boolean(config.token),
    errorPrefix: GITHUB_ERROR_PREFIX,
    metaErrorPrefix: GITHUB_META_ERROR_PREFIX,
    metaFetchUrl: `${metaFileUrl}?ref=${encodeURIComponent(config.branch)}`,
    metaWriteUrl: metaFileUrl,
    repoProbeUrl: `https://api.github.com/repos/${config.owner}/${config.repo}`,
    // GitHub Contents API 的单个 PUT 即可创建或更新，无需按 sha 分流
    writeMethod: () => 'PUT',
    // 保留既有字段顺序（message 在前），确保请求体字节不变
    buildMetaWriteBody: (encoded, sha) =>
      JSON.stringify({
        message: buildSyncCommitMessage(),
        content: encoded,
        branch: config.branch,
        ...(sha ? { sha } : {}),
      }),
  });

  return {
    ...provider,
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
  };
}
