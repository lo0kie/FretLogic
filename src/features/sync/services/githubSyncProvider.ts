import { Base64 } from 'js-base64';
import { validateImportExportPayload } from '@/domain/validation/payload';
import type { ImportExportPayload } from '@/types';
import { SYNC_ERRORS, type SyncConfig, type SyncProvider } from './provider';

const TIMEOUT_MS = 15000;

export function createGithubSyncProvider(config: SyncConfig): SyncProvider {
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
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const decodePayload = async (response: Response): Promise<ImportExportPayload> => {
    const body = await response.json();
    if (!body.content) throw new Error('EMPTY_CLOUD_FILE');
    const raw = JSON.parse(Base64.decode(String(body.content).replace(/\n/g, '')));
    const result = validateImportExportPayload(raw);
    if (!result.isValid || !result.payload) throw new Error(SYNC_ERRORS.INVALID_CLOUD_DATA);
    return result.payload;
  };

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new Error(SYNC_ERRORS.FILE_NOT_FOUND);
      if (!response.ok) throw new Error(SYNC_ERRORS.REQUEST_FAILED);
      return decodePayload(response);
    },
    async exists() {
      const response = await request({ method: 'GET' });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw new Error(SYNC_ERRORS.REQUEST_FAILED);
    },
    async push(payload) {
      const existing = await request({ method: 'GET' });
      const sha = existing.ok
        ? String((await existing.json()).sha)
        : existing.status === 404
          ? ''
          : (() => {
              throw new Error(SYNC_ERRORS.REQUEST_FAILED);
            })();
      const response = await request(
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Auto sync fret-logic data: ${new Date().toLocaleString()}`,
            content: Base64.encode(JSON.stringify(payload, null, 2)),
            branch: config.branch,
            ...(sha ? { sha } : {}),
          }),
        },
        apiUrl
      );
      if (!response.ok) throw new Error(SYNC_ERRORS.REQUEST_FAILED);
      const body = await response.json();
      return { sha: String(body.commit?.sha ?? body.sha ?? '') };
    },
  };
}
