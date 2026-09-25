import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGiteeSyncProvider } from '@/app/services/sync/giteeSyncProvider';
import { CURRENT_PAYLOAD_VERSION } from '@/app/services/validation/payloadMigrations';
import { buildGroupVariant } from '@/domains/chord/theory/entityFactories';
import { GroupSortRule } from '@/domains/chord/types';

import type { GiteeSyncConfig } from '@/app/services/sync/provider';
import type { ImportExportPayload } from '@/app/types';

const config: GiteeSyncConfig = {
  kind: 'gitee',
  token: 'gitee_test_token_123',
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

describe('gitee sync provider', () => {
  it('pushes snapshot with Authorization header and without access_token in URL or body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'file-sha' }))
      .mockResolvedValueOnce(jsonResponse({ commit: { sha: 'commit-sha' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGiteeSyncProvider(config);
    const result = await provider.push(payload);

    expect(result).toEqual({ sha: 'commit-sha' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const getUrl = String(fetchMock.mock.calls[0]![0]);
    expect(getUrl).not.toContain('access_token');
    const getInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((getInit.headers as Record<string, string>)['Authorization']).toBe('token gitee_test_token_123');

    const putUrl = String(fetchMock.mock.calls[1]![0]);
    expect(putUrl).not.toContain('access_token');
    const putInit = fetchMock.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(String(putInit.body));
    expect(body.sha).toBe('file-sha');
    expect(body.branch).toBe('main');
    expect(body.access_token).toBeUndefined();
    expect((putInit.headers as Record<string, string>)['Authorization']).toBe('token gitee_test_token_123');
  });

  it('pulls and validates remote content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ content: btoa(JSON.stringify(payload)) })));
    const provider = createGiteeSyncProvider(config);
    const result = await provider.pull();
    expect(result?.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
  });

  it('throws FILE_NOT_FOUND on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
    const provider = createGiteeSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  // Gitee 的冲突有两种状态码形态：409 真冲突，400（sha does not match）是「云端已换 sha」——
  // 两者对调用方是同一件事（本地基线过期），故同一份断言按状态码参数化
  it.each([
    { label: '409 冲突', status: 409, message: 'Conflict' },
    { label: '400 sha 不匹配', status: 400, message: 'sha does not match' },
  ])('push 遇 $label → CONFLICT', async ({ status, message }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sha: 'old-sha' }))
      .mockResolvedValueOnce(jsonResponse({ message }, status));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGiteeSyncProvider(config);
    await expect(provider.push(payload)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });
});
