import { afterEach, describe, expect, it, vi } from 'vitest';

import { computePayloadMaxUpdatedAt } from '@/app/services/sync/payloadChecksum';
import { createServerSyncProvider } from '@/app/services/sync/serverSyncProvider';
import { CURRENT_PAYLOAD_VERSION } from '@/app/services/validation/payloadMigrations';
import { buildGroupVariant } from '@/domains/chord/theory/entityFactories';
import { GroupSortRule } from '@/domains/chord/types';
import { CLOUD_SYNC_CONFIG } from '@/platform/utils/constants';

import type { ServerSyncConfig } from '@/app/services/sync/provider';
import type { ImportExportPayload } from '@/app/types';

const config: ServerSyncConfig = {
  kind: 'server',
  serverUrl: 'https://api.example.com/sync',
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
    const headInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(headInit.method).toBe('HEAD');
    const call = fetchMock.mock.calls[1]!;
    // 推送地址在源 URL 上追加校验元数据 query（md5 / updatedAt），供后端 /meta 轻量读取
    const callUrl = new URL(String(call[0]), 'http://placeholder');
    expect(callUrl.pathname).toBe('/sync');
    const query = callUrl.searchParams;
    expect(query.get('md5')).toMatch(/^[a-f0-9]{32}$/);
    // 原为 not.toBeNull()（只要 query 里有这个键就过，空串 / 'undefined' 也算过）——
    // 改为钉住取值：query 里必须是**本载荷**的最大 updatedAt（后端 /meta 与启动比对都按它判新旧）。
    // 断言与载荷联动而不是写死字面量：本用例的载荷没有实体时间戳、期望值恰为 0，换个载荷就该跟着变。
    expect(query.get('updatedAt')).toBe(String(computePayloadMaxUpdatedAt(payload)));
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('etag-prev');
    // 原为 toBeDefined()（弱断言，只要头存在即过）；改为断言取值来源——
    // MODE 由构建模式决定，引用常量而非写死字面量，避免换环境即噪音红
    expect((init.headers as Record<string, string>)['X-Environment']).toBe(CLOUD_SYNC_CONFIG.MODE);
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[1]![1] as RequestInit;
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pushInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(pushInit.method).toBe('POST');
    expect((pushInit.headers as Record<string, string>)['Authorization']).toBe('Bearer srv-token-abc');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(payload));
    await withToken.pull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const pullInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((pullInit.headers as Record<string, string>)['Authorization']).toBeUndefined();

    // 补 exists()：用例名声称「not on pull/exists」，原版却从未调用它，属名实不符的空缺口
    fetchMock.mockClear();
    await withToken.exists();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const existsInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((existsInit.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('pulls and validates remote content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));
    const provider = createServerSyncProvider(config);
    const result = await provider.pull();
    expect(result.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
  });

  it('throws FILE_NOT_FOUND on 404 when pulling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const provider = createServerSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('checks exists via HEAD', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = createServerSyncProvider(config);
    expect(await provider.exists()).toBe(true);
    // 用例名声称 "via HEAD"，原版只断返回值、从未验 method——补上
    // （exists 首选 HEAD，仅遇 405 才回退 GET，见 serverSyncProvider.ts:60-67）
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('HEAD');
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
