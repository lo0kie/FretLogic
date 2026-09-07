import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider.ts';
import { buildSyncCommitMessage, createSyncProviderBase, decodeBase64Envelope } from './syncBase.ts';

import type { GithubSyncConfig, SyncBranchesProvider } from './provider.ts';

/** 创建 GitHub Contents API 同步 provider：远端为单个 base64 信封文件，按分支读写。 */
export function createGithubSyncProvider(config: GithubSyncConfig): SyncBranchesProvider {
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
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
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${response.status}`);
      return decodePayload(response);
    },
    async exists() {
      const response = await request({ method: 'GET' });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${response.status}`);
    },
    async push(payload) {
      const existing = await request({ method: 'GET' });
      let sha = '';
      if (existing.ok) {
        sha = String((await existing.json()).sha ?? '');
      } else if (existing.status !== 404) {
        throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${existing.status}`);
      }

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
      if (response.status === 409) {
        throw new SyncError('CONFLICT', 'GitHub 提示版本冲突：云端文件已被其他提交更新，请先拉取');
      }
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${response.status}`);
      const body = await response.json();
      return { sha: String(body.commit?.sha ?? body.sha ?? '') };
    },
    async listBranches(): Promise<string[]> {
      const response = await request(
        { method: 'GET' },
        `https://api.github.com/repos/${config.owner}/${config.repo}/branches?per_page=100`
      );
      if (!response.ok) {
        throw new SyncError('REQUEST_FAILED', `获取分支失败，状态码：${response.status}`);
      }
      const branches: { name: string }[] = await response.json();
      return branches.map(b => b.name).filter(name => !name.startsWith('dependabot/'));
    },
    async testConnection(): Promise<string> {
      // 仅探测仓库可达性与 Token 有效性，不依赖 branch/path（分支与文件路径由「查询分支」/拉取负责）
      const response = await request({ method: 'GET' }, `https://api.github.com/repos/${config.owner}/${config.repo}`);
      if (response.ok) {
        return config.token ? 'GitHub 仓库可达，Token 有效' : 'GitHub 仓库可达（公开仓库，未配置 Token）';
      }
      if (response.status === 401) throw new SyncError('REQUEST_FAILED', 'Token 无效或已过期');
      if (response.status === 404) {
        throw new SyncError(
          'REQUEST_FAILED',
          config.token ? '仓库不存在，或 Token 无该仓库权限' : '仓库不存在或为私有仓库（私有需配置 Token）'
        );
      }
      throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${response.status}`);
    },
  };
}
