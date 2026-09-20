import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider.ts';
import {
  buildSyncCommitMessage,
  createSyncProviderBase,
  decodeBase64Envelope,
  extractApiErrorDetail,
} from './syncBase.ts';

import type { GithubSyncConfig, SyncBranchesProvider } from './provider.ts';

/** 创建 GitHub Contents API 同步 provider：远端为单个 base64 信封文件，按分支读写。 */
export function createGithubSyncProvider(config: GithubSyncConfig): SyncBranchesProvider {
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

  /** GitHub 文案格式：错误详情前置「：」（提取逻辑见 syncBase.extractApiErrorDetail） */
  const describeError = async (response: Response): Promise<string> => {
    const detail = await extractApiErrorDetail(response);
    return detail ? `：${detail}` : '';
  };

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
        throw new SyncError(
          'CONFLICT',
          `GitHub 提示版本冲突：云端文件已被其他提交更新，请先拉取${await describeError(response)}`
        );
      }
      if (!response.ok) {
        const detail = await extractApiErrorDetail(response);
        const suffix = detail ? `：${detail}` : '';
        // 409 是官方文档里「sha 不匹配」的状态码；个别网关/旧行为改用 422 并在 message 里点出 sha。
        // 只认 detail 里出现 sha 的报错：真正的请求体校验失败（422 Validation failed）仍按 REQUEST_FAILED 抛，
        // 否则会把「文件内容不合法」误报成「版本冲突，请先拉取」，给出完全错误的处置方向。
        if (detail.toLowerCase().includes('sha')) {
          throw new SyncError('CONFLICT', `GitHub 提示版本冲突：云端文件已被其他提交更新，请先拉取${suffix}`);
        }
        throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${response.status}${suffix}`);
      }
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
    async fetchMeta() {
      const response = await request({ method: 'GET' }, `${metaFileUrl}?ref=${encodeURIComponent(config.branch)}`);
      if (response.status === 404) return null; // 旧数据/从未上传：无独立 meta
      if (!response.ok) throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${response.status}`);
      try {
        const parsed = JSON.parse(await decodeBase64Envelope(response)) as { md5?: unknown; updatedAt?: unknown };
        if (typeof parsed.md5 === 'string' && typeof parsed.updatedAt === 'number') {
          return { md5: parsed.md5, updatedAt: parsed.updatedAt };
        }
        return null;
      } catch {
        return null; // meta 损坏视为无 meta，引导重传
      }
    },
    async pushMeta(meta) {
      let sha = '';
      // 探测必须带 ref（T1 同源修复）：不带 ref 时 GitHub 读默认分支，目标分支已有 meta 会被误判
      const existing = await request({ method: 'GET' }, `${metaFileUrl}?ref=${encodeURIComponent(config.branch)}`);
      if (existing.ok) {
        const body = await existing.json();
        sha = String(Array.isArray(body) ? '' : (body.sha ?? ''));
      } else if (existing.status !== 404) {
        throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${existing.status}`);
      }
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
      if (!response.ok) {
        throw new SyncError('REQUEST_FAILED', `GitHub meta 写入返回错误状态码：${response.status}`);
      }
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
