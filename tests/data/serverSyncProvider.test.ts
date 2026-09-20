import { afterEach, describe, expect, it, vi } from 'vitest';

import { createServerSyncProvider } from '@/app/services/sync/serverSyncProvider';

import type { ServerSyncConfig } from '@/app/services/sync/provider';

const config: ServerSyncConfig = {
  kind: 'server',
  serverUrl: 'https://api.example.com/sync',
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

describe('server sync provider', () => {
  it('pushes snapshot with POST and Environment header, probing ETag for If-Match', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { etag: 'etag-prev' } })) // HEAD 探测
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { etag: 'etag-123' } })); // POST 推送
    vi.stubGlobal('fetch', fetchMock);

    const provider = createServerSyncProvider(config);
    const result = await provider.push(payload);

    expect(result.sha).toBe('etag-123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const headInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(headInit.method).toBe('HEAD');
    const call = fetchMock.mock.calls[1];
    // 推送地址在源 URL 上追加校验元数据 query（md5 / updatedAt），供后端 /meta 轻量读取
    const callUrl = new URL(String(call[0]), 'http://placeholder');
    expect(callUrl.pathname).toBe('/sync');
    const query = callUrl.searchParams;
    expect(query.get('md5')).toMatch(/^[a-f0-9]{32}$/);
    expect(query.get('updatedAt')).not.toBeNull();
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('etag-prev');
    expect((init.headers as Record<string, string>)['X-Environment']).toBeDefined();
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('falls back to unconditional POST when server has no data (HEAD 404)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 })) // HEAD：服务端暂无数据
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { etag: 'etag-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createServerSyncProvider(config);
    await provider.push(payload);

    const init = fetchMock.mock.calls[1][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['If-Match']).toBeUndefined();
  });

  it('maps 412 from conditional POST to CONFLICT', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { etag: 'etag-prev' } }))
      .mockResolvedValueOnce(new Response('', { status: 412 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createServerSyncProvider(config);
    await expect(provider.push(payload)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('carries Bearer token on push when configured, but not on pull/exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200, headers: { etag: 'etag-9' } }));
    vi.stubGlobal('fetch', fetchMock);

    const withToken = createServerSyncProvider({ ...config, token: 'srv-token-abc' });

    await withToken.push(payload);
    const pushInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(pushInit.method).toBe('POST');
    expect((pushInit.headers as Record<string, string>)['Authorization']).toBe('Bearer srv-token-abc');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(payload));
    await withToken.pull();
    const pullInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect((pullInit.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('pulls and validates remote content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));
    const provider = createServerSyncProvider(config);
    const result = await provider.pull();
    expect(result.version).toBe(7);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
  });

  it('throws FILE_NOT_FOUND on 404 when pulling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const provider = createServerSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('checks exists via HEAD', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    const provider = createServerSyncProvider(config);
    expect(await provider.exists()).toBe(true);
  });

  it('fetchMeta 读取 /meta 最小元数据，云端无 meta（404）时返回 null', async () => {
    const provider = createServerSyncProvider(config);
    const meta = { md5: 'a'.repeat(32), updatedAt: 1700000000000 };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(meta)));
    await expect(provider.fetchMeta()).resolves.toEqual(meta);
    const [baseUrl, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect(String(baseUrl).endsWith('/meta')).toBe(true);

    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }));
    await expect(provider.fetchMeta()).resolves.toBeNull();
  });
});
