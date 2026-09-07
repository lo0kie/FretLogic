import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGithubSyncProvider } from '@/app/services/sync/githubSyncProvider';

import type { GithubSyncConfig } from '@/app/services/sync/provider';

const config: GithubSyncConfig = {
  kind: 'github',
  token: 'ghp_abcdefghijklmnop',
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  path: 'backup/data.json',
};

const payload = {
  version: 4,
  groups: [{ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' }],
  chords: [],
  songs: [],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('github sync provider', () => {
  it('pushes a validated snapshot and includes sha for existing files', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'file-sha' }))
      .mockResolvedValueOnce(jsonResponse({ commit: { sha: 'commit-sha' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGithubSyncProvider(config);
    const result = await provider.push(payload);

    expect(result).toEqual({ sha: 'commit-sha' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const putInit = fetchMock.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(String(putInit.body));
    expect(body.sha).toBe('file-sha');
    expect(body.branch).toBe('main');
    expect((putInit.headers as Record<string, string>).Authorization).toBe('Bearer ghp_abcdefghijklmnop');
  });

  it('pulls and validates remote content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ content: btoa(JSON.stringify(payload)) })));
    const provider = createGithubSyncProvider(config);
    const result = await provider.pull();
    // 校验层会把 v4 迁移到当前版本（v6），并补齐实体时间戳
    expect(result?.version).toBe(6);
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
    expect(result?.groups[0]?.createdAt).toBeTypeOf('number');
    expect(result?.groups[0]?.updatedAt).toBeTypeOf('number');
  });

  it('throws FILE_NOT_FOUND on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    const provider = createGithubSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('maps invalid cloud payloads to INVALID_CLOUD_DATA', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ content: btoa(JSON.stringify({ version: 4 })) })));
    const provider = createGithubSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'INVALID_CLOUD_DATA' });
  });

  it('throws CONFLICT on 409 when pushing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'old-sha' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, 409));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGithubSyncProvider(config);
    await expect(provider.push(payload)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });
});
