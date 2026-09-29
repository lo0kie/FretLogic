/**
 * Gitee 同步 provider。
 *
 * 网络层用 msw 而不是按调用次序返回的 fetch 桩：本文件的核心断言之一是「Token 不得出现在 URL 或
 * 请求体里，只能走 Authorization 头」—— 这条用 `vi.stubGlobal` 写出来只能靠 `String(call[0])`
 * 反查，而 msw 直接把 handler 收到的 `request` 交出来，URL 与 body 都是它的属性。
 * 加上 `onUnhandledRequest: 'error'`，任何未声明的请求（例如某天把 Token 拼进了 query）立刻报错。
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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

/** Gitee 的 Contents 端点（`?ref=` 由 provider 追加；msw 的 path 匹配不看 query） */
const DATA_URL = 'https://gitee.com/api/v5/repos/owner/repo/contents/backup/data.json';

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

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('gitee sync provider', () => {
  it('pushes snapshot with Authorization header and without access_token in URL or body', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.get(DATA_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return HttpResponse.json({ sha: 'file-sha' });
      }),
      http.put(DATA_URL, async ({ request }) => {
        seen.push(await snapshot(request));
        return HttpResponse.json({ commit: { sha: 'commit-sha' } });
      })
    );

    const provider = createGiteeSyncProvider(config);
    const result = await provider.push(payload);

    expect(result).toEqual({ sha: 'commit-sha' });
    expect(seen).toHaveLength(2);

    for (const request of seen) {
      // Token 只走 Authorization 头。拼进 URL 会落进浏览器历史 / 反向代理日志 / Referer，
      // 拼进 body 会随提交内容一起被 Gitee 存档
      expect(request.url).not.toContain('access_token');
      expect(request.headers['authorization']).toBe('token gitee_test_token_123');
    }

    expect(seen[0]!.method).toBe('GET');
    expect(seen[1]!.method).toBe('PUT');
    expect(seen[1]!.body).toMatchObject({ sha: 'file-sha', branch: 'main' });
    expect((seen[1]!.body as Record<string, unknown>)['access_token']).toBeUndefined();
  });

  it('pulls and validates remote content', async () => {
    server.use(http.get(DATA_URL, () => HttpResponse.json({ content: btoa(JSON.stringify(payload)) })));

    const provider = createGiteeSyncProvider(config);
    const result = await provider.pull();
    expect(result?.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
  });

  it('throws FILE_NOT_FOUND on 404', async () => {
    server.use(http.get(DATA_URL, () => new HttpResponse('not found', { status: 404 })));
    const provider = createGiteeSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  // Gitee 的冲突有两种状态码形态：409 真冲突，400（sha does not match）是「云端已换 sha」——
  // 两者对调用方是同一件事（本地基线过期），故同一份断言按状态码参数化
  it.each([
    { label: '409 冲突', status: 409, message: 'Conflict' },
    { label: '400 sha 不匹配', status: 400, message: 'sha does not match' },
  ])('push 遇 $label → CONFLICT', async ({ status, message }) => {
    server.use(
      http.get(DATA_URL, () => HttpResponse.json({ sha: 'old-sha' })),
      http.put(DATA_URL, () => HttpResponse.json({ message }, { status }))
    );

    const provider = createGiteeSyncProvider(config);
    await expect(provider.push(payload)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });
});
