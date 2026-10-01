import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { createGitSyncProviderMethods } from './gitSyncProviderFactory';
import { SyncError } from './provider';
import {
  buildApiError,
  buildSyncCommitMessage,
  describeApiError,
  extractApiErrorDetail,
  probeRemoteSha,
} from './syncBase';

import type { GiteeSyncConfig, SyncProvider } from './provider';

const GITEE_API_BASE = 'https://gitee.com/api/v5';
/** 非 2xx 的错误文案前缀（meta 写入用专用前缀，与数据文件写入区分开） */
const GITEE_ERROR_PREFIX = 'Gitee 返回错误状态码';
const GITEE_META_ERROR_PREFIX = 'Gitee meta 写入返回错误状态码';

/**
 * 创建 Gitee API v5 仓库同步 provider：远端为单个 base64 信封文件，按分支读写。
 * 与 GitHub 的差异：
 * 1. 认证走 `Authorization: token <token>` 请求头（安全传递，不拼接进 URL 查询参数或 body）；
 * 2. 创建文件用 POST、更新文件用 PUT（更新必须在 body 携带文件 blob sha），无 sha 时 GitHub 的
 *    单 PUT 自动创建在这里不适用，故 push/pushMeta 先探测已存在与否再选择方法。
 */
export function createGiteeSyncProvider(config: GiteeSyncConfig): SyncProvider {
  const fileUrl = (ref?: string) => {
    const base = `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  };
  /** 独立校验元数据载体：数据源文件同目录下的 `.meta.json`，推送前的判等与冲突判定只拉这份最小数据 */
  const metaFileUrl = (ref?: string) => {
    const base = `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}.meta.json`;
    return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
  };

  const repoUrl = () => `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}`;

  const { request, ...provider } = createGitSyncProviderMethods({
    // Gitee API v5 标准认证：Authorization: token <token> 请求头
    baseHeaders: config.token ? { Authorization: `token ${config.token}` } : undefined,
    defaultUrl: () => fileUrl(config.branch),
    hostLabel: 'Gitee',
    hasToken: Boolean(config.token),
    errorPrefix: GITEE_ERROR_PREFIX,
    metaErrorPrefix: GITEE_META_ERROR_PREFIX,
    metaFetchUrl: metaFileUrl(config.branch),
    metaWriteUrl: metaFileUrl(),
    repoProbeUrl: repoUrl(),
    // 新建（POST）与更新（PUT）是 Gitee 的两个独立接口
    writeMethod: hasSha => (hasSha ? 'PUT' : 'POST'),
    // 保留既有字段顺序（content 在前），确保请求体字节不变
    buildMetaWriteBody: (encoded, sha) =>
      JSON.stringify({
        content: encoded,
        message: buildSyncCommitMessage(),
        branch: config.branch,
        ...(sha ? { sha } : {}),
      }),
  });

  return {
    ...provider,
    async push(payload) {
      // 探测远端文件：存在则取 blob sha（更新必需），404 表示需新建
      const existing = await request({ method: 'GET' });
      const sha = await probeRemoteSha(existing, GITEE_ERROR_PREFIX);

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
      if (!response.ok) throw await buildApiError(response, GITEE_ERROR_PREFIX);
      const body = await response.json();
      return { sha: String(body.commit?.sha ?? body.sha ?? '') };
    },
  };
}
