/**
 * 自建同步服务器 provider。
 *
 * 网络层用 msw：本 provider 对**同一个 URL** 用 HEAD / GET / POST 三种 method 做不同的事
 * （探测 ETag、拉取、条件写入），手写的 `mockResolvedValueOnce` 序列只按次序发牌，测试里看不出
 * 「哪个 method 打到了哪个地址」—— 把 HEAD 写成 GET 也能绿。msw 按 method + URL 路由，
 * 顺序无关，method 与 query 都成为可断言的对象。
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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

const BASE_URL = 'https://api.example.com/sync';
/** 独立的最小元数据端点（`/meta`），与数据体同源 */
const META_URL = 'https://api.example.com/sync/meta';

interface SeenRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const snapshot = async (request: Request): Promise<SeenRequest> => {
  const raw = await request.text();
  return {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
    body: raw ? JSON.parse(raw) : undefined,
  };
};

/** 空响应 + 指定 ETag（HEAD 探测与 POST 回执都靠它传递版本基线） */
const emptyWithEtag = (etag?: string): HttpResponse<string> =>
  new HttpResponse('', { status: 200, headers: etag ? { etag } : {} });

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('server sync provider', () => {
  it('pushes snapshot with POST and Environment header, probing ETag for If-Match', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.head(BASE_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return emptyWithEtag('etag-prev');
      }),
      http.post(BASE_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return emptyWithEtag('etag-123');
      })
    );

    const provider = createServerSyncProvider(config);
    const result = await provider.push(payload);

    expect(result.sha).toBe('etag-123');
    expect(seen).toHaveLength(2);
    expect(seen[0]!.method).toBe('HEAD');

    const call = seen[1]!;
    expect(call.method).toBe('POST');
    // 推送地址在源 URL 上追加校验元数据 query（md5 / updatedAt），供后端 /meta 轻量读取
    const callUrl = new URL(call.url);
    expect(callUrl.pathname).toBe('/sync');
    const query = callUrl.searchParams;
    expect(query.get('md5')).toMatch(/^[a-f0-9]{32}$/);
    // 钉住取值而不是「键存在」：query 里必须是**本载荷**的最大 updatedAt
    //（后端 /meta 与启动比对都按它判新旧）。与载荷联动而不是写死字面量：本用例的载荷没有实体
    // 时间戳、期望值恰为 0，换个载荷就该跟着变。
    expect(query.get('updatedAt')).toBe(String(computePayloadMaxUpdatedAt(payload)));

    // 条件写：把探测到的 ETag 回填进 If-Match，服务端据此拦下并发覆盖
    expect(call.headers['if-match']).toBe('etag-prev');
    // MODE 由构建模式决定，引用常量而非写死字面量，避免换环境即噪音红
    expect(call.headers['x-environment']).toBe(CLOUD_SYNC_CONFIG.MODE);
    expect(call.headers['content-type']).toBe('application/json');
  });

  it('falls back to unconditional POST when server has no data (HEAD 404)', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.head(BASE_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return new HttpResponse('', { status: 404 });
      }),
      http.post(BASE_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return emptyWithEtag('etag-1');
      })
    );

    const provider = createServerSyncProvider(config);
    await provider.push(payload);

    expect(seen).toHaveLength(2);
    expect(seen[1]!.method).toBe('POST');
    expect(seen[1]!.headers['if-match']).toBeUndefined();
  });

  it('maps 412 from conditional POST to CONFLICT', async () => {
    server.use(
      http.head(BASE_URL, () => emptyWithEtag('etag-prev')),
      http.post(BASE_URL, () => new HttpResponse('', { status: 412 }))
    );

    const provider = createServerSyncProvider(config);
    await expect(provider.push(payload)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('carries Bearer token on push when configured, but not on pull/exists', async () => {
    const seen: SeenRequest[] = [];
    const record = async ({ request }: { request: Request }): Promise<HttpResponse<string>> => {
      seen.push(await snapshot(request));
      return emptyWithEtag('etag-9');
    };
    server.use(
      http.head(BASE_URL, record),
      http.post(BASE_URL, record),
      http.get(BASE_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return HttpResponse.json(payload);
      })
    );

    const withToken = createServerSyncProvider({ ...config, token: 'srv-token-abc' });

    await withToken.push(payload);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.method).toBe('POST');
    expect(seen[1]!.headers['authorization']).toBe('Bearer srv-token-abc');

    seen.length = 0;
    await withToken.pull();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers['authorization']).toBeUndefined();

    // 补 exists()：用例名声称「not on pull/exists」，原版却从未调用它，属名实不符的空缺口
    seen.length = 0;
    await withToken.exists();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('HEAD');
    expect(seen[0]!.headers['authorization']).toBeUndefined();
  });

  it('pulls and validates remote content', async () => {
    server.use(http.get(BASE_URL, () => HttpResponse.json(payload)));

    const provider = createServerSyncProvider(config);
    const result = await provider.pull();
    expect(result.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
  });

  it('throws FILE_NOT_FOUND on 404 when pulling', async () => {
    server.use(http.get(BASE_URL, () => new HttpResponse('', { status: 404 })));
    const provider = createServerSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('checks exists via HEAD', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.head(BASE_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return emptyWithEtag();
      })
    );

    const provider = createServerSyncProvider(config);
    expect(await provider.exists()).toBe(true);
    // 用例名声称 "via HEAD"：exists 首选 HEAD，仅遇 405 才回退 GET（见 serverSyncProvider.ts）
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('HEAD');
  });

  it('fetchMeta 读取 /meta 最小元数据，云端无 meta（404）时返回 null', async () => {
    const provider = createServerSyncProvider(config);
    const meta = { md5: 'a'.repeat(32), updatedAt: 1700000000000 };

    const seen: SeenRequest[] = [];
    server.use(
      http.get(META_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return HttpResponse.json(meta);
      })
    );

    await expect(provider.fetchMeta()).resolves.toEqual(meta);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe('GET');
    expect(new URL(seen[0]!.url).pathname).toBe('/sync/meta');

    server.use(http.get(META_URL, () => new HttpResponse('', { status: 404 })));
    await expect(provider.fetchMeta()).resolves.toBeNull();
  });
});
