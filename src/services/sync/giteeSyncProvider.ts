import { base64DecodeUtf8, base64EncodeUtf8, serializeForStorage } from '@/utils/core/common';

import { SyncError, type GiteeSyncConfig, type SyncBranchesProvider } from './provider';
import { createSyncProviderBase } from './syncBase';

const TIMEOUT_MS = 15000;
const GITEE_API_BASE = 'https://gitee.com/api/v5';

/**
 * 创建 Gitee API v5 仓库同步 provider：远端为单个 base64 信封文件，按分支读写。
 * 与 GitHub 的差异：
 * 1. Token 走 `access_token` 查询参数（Gitee 不识别 Authorization Bearer 头）；
 * 2. 创建文件用 POST、更新文件用 PUT（更新必须在 body 携带文件 blob sha），无 sha 时 GitHub 的
 *    单 PUT 自动创建在这里不适用，故 push 先探测已存在与否再选择方法。
 */
export function createGiteeSyncProvider(config: GiteeSyncConfig): SyncBranchesProvider {
  /** 追加 access_token 查询参数（有 token 时） */
  const withToken = (base: string): string => {
    if (!config.token) return base;
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}access_token=${encodeURIComponent(config.token)}`;
  };

  const fileUrl = (ref?: string) => {
    const base = `${GITEE_API_BASE}/repos/${config.owner}/${config.repo}/contents/${config.path}`;
    const url = withToken(base);
    return ref ? `${url}${url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(ref)}` : url;
  };

  const repoUrl = () => withToken(`${GITEE_API_BASE}/repos/${config.owner}/${config.repo}`);

  const branchesUrl = () => withToken(`${GITEE_API_BASE}/repos/${config.owner}/${config.repo}/branches?per_page=100`);

  /** 提取 Gitee 错误响应中的说明文字（{"message": ...} 或 {"error": ...}），便于区分 401 是令牌无效还是权限不足 */
  const describeError = async (response: Response): Promise<string> => {
    try {
      const body = (await response.json()) as { message?: unknown; error?: unknown };
      const detail = body.message ?? body.error;
      if (typeof detail === 'string' && detail) return `：${detail.slice(0, 120)}`;
      return '';
    } catch {
      return '';
    }
  };

  const { request, decodePayload } = createSyncProviderBase({
    // 双通道认证：query access_token（文件/分支/仓库 URL 均已携带）+ Authorization 头，任一被 Gitee 接受即可
    baseHeaders: config.token ? { Authorization: `token ${config.token}` } : undefined,
    defaultUrl: () => fileUrl(config.branch),
    readRaw: async response => {
      const body = await response.json();
      if (!body.content) throw new SyncError('INVALID_CLOUD_DATA', '云端文件内容为空');
      return base64DecodeUtf8(String(body.content).replace(/\n/g, ''));
    },
    timeoutMs: TIMEOUT_MS,
  });

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '云端文件不存在');
      if (!response.ok)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${response.status}${await describeError(response)}`
        );
      return decodePayload(response);
    },
    async exists() {
      const response = await request({ method: 'GET' });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new SyncError('REQUEST_FAILED', `Gitee 返回错误状态码：${response.status}${await describeError(response)}`);
    },
    async push(payload) {
      // 探测远端文件：存在则取 blob sha（更新必需），404 表示需新建
      const existing = await request({ method: 'GET' });
      let sha = '';
      if (existing.ok) {
        sha = String((await existing.json()).sha ?? '');
      } else if (existing.status !== 404) {
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${existing.status}${await describeError(existing)}`
        );
      }

      // 新建（POST）与更新（PUT）是 Gitee 的两个独立接口
      const method = sha ? 'PUT' : 'POST';
      const response = await request(
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: config.token ?? '',
            content: base64EncodeUtf8(serializeForStorage(payload)),
            message: `Auto sync fret-logic data: ${new Date().toLocaleString()}`,
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        fileUrl()
      );
      if (!response.ok)
        throw new SyncError(
          'REQUEST_FAILED',
          `Gitee 返回错误状态码：${response.status}${await describeError(response)}`
        );
      const body = await response.json();
      return { sha: String(body.commit?.sha ?? body.sha ?? '') };
    },
    async listBranches(): Promise<string[]> {
      const response = await request({ method: 'GET' }, branchesUrl());
      if (!response.ok) {
        throw new SyncError(
          'REQUEST_FAILED',
          `获取分支失败，状态码：${response.status}${await describeError(response)}`
        );
      }
      const branches: Array<{ name: string }> = await response.json();
      return branches.map(b => b.name).filter(name => !name.startsWith('dependabot/'));
    },
    async testConnection(): Promise<string> {
      const response = await request({ method: 'GET' }, repoUrl());
      if (response.ok) {
        return config.token ? 'Gitee 仓库可达，Token 有效' : 'Gitee 仓库可达（公开仓库，未配置 Token）';
      }
      if (response.status === 401)
        throw new SyncError('REQUEST_FAILED', `Token 无效或已过期${await describeError(response)}`);
      if (response.status === 404) {
        throw new SyncError(
          'REQUEST_FAILED',
          config.token ? '仓库不存在，或 Token 无该仓库权限' : '仓库不存在或为私有仓库（私有需配置 Token）'
        );
      }
      throw new SyncError('REQUEST_FAILED', `Gitee 返回错误状态码：${response.status}${await describeError(response)}`);
    },
  };
}
