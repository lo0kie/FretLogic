import { validateImportExportPayload } from '@/services/validation/payload';
import type { ImportExportPayload } from '@/types';
import { base64DecodeUtf8, base64EncodeUtf8 } from '@/utils/common';
import { SyncError, type GithubSyncConfig, type SyncBranchesProvider } from './provider';

const TIMEOUT_MS = 15000;

export function createGithubSyncProvider(config: GithubSyncConfig): SyncBranchesProvider {
  const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };

  const request = async (init: RequestInit, url: string = `${apiUrl}?ref=${config.branch}`): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SyncError('TIMEOUT', '请求超时');
      }
      throw new SyncError('NETWORK', '网络请求失败');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const decodePayload = async (response: Response): Promise<ImportExportPayload> => {
    const body = await response.json();
    if (!body.content) throw new SyncError('INVALID_CLOUD_DATA', '云端文件内容为空');
    const raw = JSON.parse(base64DecodeUtf8(String(body.content).replace(/\n/g, '')));
    const result = validateImportExportPayload(raw);
    if (!result.isValid || !result.payload) throw new SyncError('INVALID_CLOUD_DATA', '云端数据格式校验失败');
    return result.payload;
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
      const sha = existing.ok
        ? String((await existing.json()).sha)
        : existing.status === 404
          ? ''
          : (() => {
              throw new SyncError('REQUEST_FAILED', `GitHub 返回错误状态码：${existing.status}`);
            })();
      const response = await request(
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Auto sync fret-logic data: ${new Date().toLocaleString()}`,
            content: base64EncodeUtf8(JSON.stringify(payload, null, 2)),
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        apiUrl
      );
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
      const branches: Array<{ name: string }> = await response.json();
      return branches.map(b => b.name).filter(name => !name.startsWith('dependabot/'));
    },
  };
}
