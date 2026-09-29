/**
 * GitHub 同步 provider。
 *
 * 网络层用 msw 而不是 `vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(…))`：手写 fetch 桩
 * 只能按**调用次序**喂响应，于是「provider 到底把请求打到了哪个 URL、用了哪个 method」在测试里
 * 完全不可见 —— 改错 endpoint、把 `?ref=` 写丢、把 PUT 写成 POST，桩都照样绿。msw 按 method + URL
 * 路由，加上 `onUnhandledRequest: 'error'`，任何未声明的请求直接报错，请求形态才成为可断言的对象。
 *
 * 本文件只覆盖数据文件端点；`.meta.json` 那条独立通道由 sync 元数据相关的用例覆盖。
 *
 * ⚠️ `msw` 版本被钉在**精确的** `2.13.6`（`package.json` 里不写 `^`）：全量跑测下本文件与
 * `gitee` / `server` 两个文件的第一个 `pull()` 会抛 `Body is unusable: Body has already been read`
 * （undici 对「流已加锁」与「流已被读」抛同一句），钉版期间刻意不改动拦截链的形态。根因与修法见
 * `tests/setup.ts` 里「关掉 undici 的响应体流终结器」一节：mock 链上调用方拿到的响应与中间
 * Response 共用同一条体流，中间对象被 GC 时终结器会把它取消掉。
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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

/** Contents API 的数据文件端点（`?ref=` 由 provider 追加；msw 的 path 匹配不看 query） */
const DATA_URL = 'https://api.github.com/repos/owner/repo/contents/backup/data.json';

/** 一次请求的可断言快照 —— `Headers` 与 body 都是流式对象，读出来存成普通值才不会被后续消耗掉 */
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

// 未声明的请求一律报错：provider 若打到了别的端点（或漏配了 host），这里立刻红，
// 而不是让请求穿透到真实网络
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('github sync provider', () => {
  it('pushes a validated snapshot and includes sha for existing files', async () => {
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

    const provider = createGithubSyncProvider(config);
    const result = await provider.push(payload);

    expect(result).toEqual({ sha: 'commit-sha' });
    expect(seen).toHaveLength(2);

    // 探测请求：GET + 带 ref（不带 ref 时 GitHub 读默认分支，会读到别的分支的 sha）
    expect(seen[0]!.method).toBe('GET');
    expect(new URL(seen[0]!.url).searchParams.get('ref')).toBe('main');
    expect(seen[0]!.headers['authorization']).toBe('Bearer ghp_abcdefghijklmnop');

    // 写入请求：PUT + 把探测到的 sha 回填（缺 sha 会变成「新建」而不是「更新」）
    expect(seen[1]!.method).toBe('PUT');
    expect(seen[1]!.body).toMatchObject({ sha: 'file-sha', branch: 'main' });
  });

  it('pulls and validates remote content', async () => {
    server.use(http.get(DATA_URL, () => HttpResponse.json({ content: btoa(JSON.stringify(payload)) })));

    const provider = createGithubSyncProvider(config);
    const result = await provider.pull();
    // 校验层会把旧版本包逐级迁移到当前版本，并补齐实体时间戳
    expect(result?.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(result?.groups).toHaveLength(1);
    expect(result?.groups[0]).toMatchObject({ id: 'g1', name: 'C', sortRule: 'ROOT_PITCH' });
    // 守卫哨兵（保留）：只断「时间戳字段存在且为数字」—— 工厂 buildGroupVariant 的缺省 0 同样是
    // number，故它守不住「迁移层真的补齐了时间戳」这一语义，只保证字段不被删成 undefined。
    // 取值正确性由 payloadMigrations / migrateLegacy 的用例覆盖
    expect(result?.groups[0]?.createdAt).toBeTypeOf('number');
    expect(result?.groups[0]?.updatedAt).toBeTypeOf('number');
  });

  it('throws FILE_NOT_FOUND on 404', async () => {
    server.use(http.get(DATA_URL, () => new HttpResponse('not found', { status: 404 })));
    const provider = createGithubSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('maps invalid cloud payloads to INVALID_CLOUD_DATA', async () => {
    server.use(http.get(DATA_URL, () => HttpResponse.json({ content: btoa(JSON.stringify({ version: 4 })) })));
    const provider = createGithubSyncProvider(config);
    await expect(provider.pull()).rejects.toMatchObject({ code: 'INVALID_CLOUD_DATA' });
  });

  it('throws CONFLICT on 409 when pushing', async () => {
    server.use(
      http.get(DATA_URL, () => HttpResponse.json({ sha: 'old-sha' })),
      http.put(DATA_URL, () => HttpResponse.json({ message: 'Conflict' }, { status: 409 }))
    );

    const provider = createGithubSyncProvider(config);
    await expect(provider.push(payload)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });
});
