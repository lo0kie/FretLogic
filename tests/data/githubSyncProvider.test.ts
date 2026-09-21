import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGithubSyncProvider } from '@/app/services/sync/githubSyncProvider';
import { CURRENT_PAYLOAD_VERSION } from '@/app/services/validation/payloadMigrations';
import { buildGroupVariant } from '@/domains/chord/theory/entityFactories';
import { GroupSortRule } from '@/domains/chord/types';

import type { GithubSyncConfig } from '@/app/services/sync/provider';
import type { ImportExportPayload } from '@/app/types';

const config: GithubSyncConfig = {
  kind: 'github',
  token: 'ghp_abcdefghijklmnop',
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  path: 'backup/data.json',
};

/** version 刻意停留在旧包版本号 4：用例验证校验层会逐级迁移到 CURRENT_PAYLOAD_VERSION */
const payload: ImportExportPayload = {
  version: 4,
  groups: [buildGroupVariant({ id: 'g1', name: 'C' }, GroupSortRule.ROOT_PITCH)],
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
    const putInit = fetchMock.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(String(putInit.body));
    expect(body.sha).toBe('file-sha');
    expect(body.branch).toBe('main');
    expect((putInit.headers as Record<string, string>)['Authorization']).toBe('Bearer ghp_abcdefghijklmnop');
  });

  it('pulls and validates remote content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ content: btoa(JSON.stringify(payload)) })));
    const provider = createGithubSyncProvider(config);
    const result = await provider.pull();
    // 校验层会把旧版本包逐级迁移到当前版本，并补齐实体时间戳
    expect(result?.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
    // 守卫哨兵（保留）：只断「时间戳字段存在且为数字」——工厂 buildGroupVariant 的缺省 0 同样是
    // number，故它守不住「迁移层真的补齐了时间戳」这一语义，只保证字段不被删成 undefined。
    // 取值正确性由 payloadMigrations / migrateLegacy 的用例覆盖
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
