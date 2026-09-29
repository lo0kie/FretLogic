/**
 * 各同步 provider 的连通性探测（`testConnection`）。
 *
 * 网络层用 msw：本文件跨 github / webdav / server 三个 provider，且 webdav 的连通性探测是一个
 * **非标准 method**（PROPFIND）—— 手写 fetch 桩只按次序发牌，「发出去的到底是 GET 还是 PROPFIND」
 * 只能靠反查 `calls[0][1].method` 才看得到，把 method 写错照样能绿。msw 按 method + URL 路由，
 * 加上 `onUnhandledRequest: 'error'`，请求形态（含 method 与 Depth 头）直接成为断言对象。
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createGithubSyncProvider } from '@/app/services/sync/githubSyncProvider';
import { createServerSyncProvider } from '@/app/services/sync/serverSyncProvider';
import { createWebdavSyncProvider } from '@/app/services/sync/webdavSyncProvider';
import { CLOUD_SYNC_CONFIG } from '@/platform/utils/constants';

import type { GithubSyncConfig, WebdavSyncConfig } from '@/app/services/sync/provider';

const githubConfig: GithubSyncConfig = {
  kind: 'github',
  token: 'ghp_token123',
  owner: 'owner',
  repo: 'repo',
  branch: 'main',
  path: 'backup/data.json',
};

const webdavConfig: WebdavSyncConfig = {
  kind: 'webdav',
  serverUrl: 'https://dav.example.com',
  username: 'user',
  password: 'pass',
};

const SERVER_CONFIG = { kind: 'server' as const, serverUrl: 'https://api.example.com/sync' };

/** testConnection 只探测仓库本身，不碰 contents 文件路径 */
const GITHUB_REPO_URL = 'https://api.github.com/repos/owner/repo';

interface SeenRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

const snapshot = (request: Request): SeenRequest => ({
  method: request.method,
  url: request.url,
  headers: Object.fromEntries(request.headers),
});

/**
 * WebDAV 的全部请求（含经代理转发的形态）收在同一个正则下：本 provider 会按「祖先目录逐级 MKCOL
 * → HEAD 探测 → PUT 写入」打多条不同路径，逐个列 path 既脆又看不出意图；method 才是断言对象。
 */
const WEBDAV_ANY = /^https:\/\/(dav|proxy)\.example\.com/;

const emptyWith = (status: number, headers?: Record<string, string>): HttpResponse<string> =>
  new HttpResponse('', { status, ...(headers ? { headers } : {}) });

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('github testConnection', () => {
  it('returns success detail on 200 with token', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.get(GITHUB_REPO_URL, ({ request }) => {
        seen.push(snapshot(request));
        return HttpResponse.json({ private: false });
      })
    );

    const detail = await createGithubSyncProvider(githubConfig).testConnection();
    expect(detail).toContain('Token 有效');
    // 探测仓库 API，而非 contents 文件路径
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(GITHUB_REPO_URL);
  });

  it('notes missing token for public repos', async () => {
    server.use(http.get(GITHUB_REPO_URL, () => HttpResponse.json({})));
    const noToken: GithubSyncConfig = { ...githubConfig, token: undefined };
    const detail = await createGithubSyncProvider(noToken).testConnection();
    expect(detail).toContain('未配置 Token');
  });

  it('rejects with auth message on 401', async () => {
    server.use(http.get(GITHUB_REPO_URL, () => emptyWith(401)));
    await expect(createGithubSyncProvider(githubConfig).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('Token 无效'),
    });
  });

  it('distinguishes private-repo hint on 404 without token', async () => {
    server.use(http.get(GITHUB_REPO_URL, () => emptyWith(404)));
    const noToken: GithubSyncConfig = { ...githubConfig, token: undefined };
    await expect(createGithubSyncProvider(noToken).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('私有'),
    });
  });
});

describe('webdav testConnection', () => {
  it('sends PROPFIND Depth 0 to server root and succeeds on 207', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.all(WEBDAV_ANY, ({ request }) => {
        seen.push(snapshot(request));
        return emptyWith(207);
      })
    );

    const detail = await createWebdavSyncProvider(webdavConfig).testConnection();
    expect(detail).toContain('账号密码有效');
    expect(seen).toHaveLength(1);
    // 断 origin + pathname 而不是整串：`Request.url` 会把 `https://host` 规范化成 `https://host/`，
    // 整串比较锁的是这个规范化细节而不是「打在服务器根上」
    const probed = new URL(seen[0]!.url);
    expect(probed.origin).toBe('https://dav.example.com');
    expect(probed.pathname).toBe('/');
    // PROPFIND（非标准 method）是 WebDAV 的连通性探测手段，Depth: 0 表示只要根集合自身
    expect(seen[0]!.method).toBe('PROPFIND');
    expect(seen[0]!.headers['depth']).toBe('0');
  });

  // 同一个「连接通道文案」行为的两半：是否配置代理只改文案与请求地址
  it.each([
    { label: '未配置代理时输出直连', proxyUrl: undefined, channel: '直连' },
    {
      label: '配置代理时输出经代理转发，目标地址被编码为 url 参数',
      proxyUrl: 'https://proxy.example.com',
      channel: '经代理转发',
    },
  ])('$label', async ({ proxyUrl, channel }) => {
    const seen: SeenRequest[] = [];
    server.use(
      http.all(WEBDAV_ANY, ({ request }) => {
        seen.push(snapshot(request));
        return emptyWith(207);
      })
    );

    const detail = await createWebdavSyncProvider({ ...webdavConfig, proxyUrl }).testConnection();
    expect(detail).toContain(channel);
    expect(seen).toHaveLength(1);
    if (proxyUrl) expect(seen[0]!.url).toContain('proxy.example.com');
    else expect(seen[0]!.url).not.toContain('proxy');
  });

  it('rejects with credential message on 401', async () => {
    server.use(http.all(WEBDAV_ANY, () => emptyWith(401)));
    await expect(createWebdavSyncProvider(webdavConfig).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('认证失败'),
    });
  });

  it('degrades gracefully on 405 (server without PROPFIND support)', async () => {
    server.use(http.all(WEBDAV_ANY, () => emptyWith(405)));
    const detail = await createWebdavSyncProvider(webdavConfig).testConnection();
    expect(detail).toContain('不支持 PROPFIND');
  });

  it('rejects on unexpected status', async () => {
    server.use(http.all(WEBDAV_ANY, () => emptyWith(500)));
    await expect(createWebdavSyncProvider(webdavConfig).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
    });
  });

  it('throws CONFLICT on 409 during push', async () => {
    server.use(
      http.all(WEBDAV_ANY, ({ request }) =>
        // MKCOL 建父目录 → 201；PUT 写入撞上服务端已变更 → 409
        emptyWith(request.method === 'PUT' ? 409 : 201)
      )
    );

    const provider = createWebdavSyncProvider(webdavConfig);
    await expect(provider.push({ version: 4, groups: [], chords: [], songs: [] })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });

  it('sends If-Match with probed ETag on push', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.all(WEBDAV_ANY, ({ request }) => {
        seen.push(snapshot(request));
        if (request.method === 'MKCOL') return emptyWith(201);
        // HEAD 探测到强 ETag；PUT 回执给一个新的
        if (request.method === 'HEAD') return emptyWith(200, { ETag: '"strong-etag-1"' });
        return emptyWith(200, { ETag: '"new-etag"' });
      })
    );

    const provider = createWebdavSyncProvider(webdavConfig);
    await provider.push({ version: 4, groups: [], chords: [], songs: [] });

    const put = seen.find(request => request.method === 'PUT');
    expect(put, 'push 应发出 PUT 写入请求').toBeDefined();
    expect(put!.headers['if-match']).toBe('"strong-etag-1"');
    // 探测必须在写入之前：次序错了就退化成无条件覆盖
    expect(seen.findIndex(request => request.method === 'HEAD')).toBeLessThan(
      seen.findIndex(request => request.method === 'PUT')
    );
  });
});

describe('server testConnection', () => {
  it('returns success message with environment indicator on 200', async () => {
    const seen: SeenRequest[] = [];
    server.use(
      http.get(SERVER_CONFIG.serverUrl, ({ request }) => {
        seen.push(snapshot(request));
        return emptyWith(200);
      })
    );

    const detail = await createServerSyncProvider(SERVER_CONFIG).testConnection();
    expect(detail).toContain('已连通开发环境');
    expect(seen).toHaveLength(1);
    // 原为 toBeDefined()（弱断言）；改为断言取值来源，与 serverSyncProvider.test.ts 同口径
    expect(seen[0]!.headers['x-environment']).toBe(CLOUD_SYNC_CONFIG.MODE);
  });

  it('returns 404 friendly message with environment indicator', async () => {
    server.use(http.get(SERVER_CONFIG.serverUrl, () => emptyWith(404)));
    const detail = await createServerSyncProvider(SERVER_CONFIG).testConnection();
    expect(detail).toContain('开发环境在线，暂无存档');
  });

  it('rejects with server error message on failure', async () => {
    server.use(http.get(SERVER_CONFIG.serverUrl, () => emptyWith(500)));
    await expect(createServerSyncProvider(SERVER_CONFIG).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('500'),
    });
  });
});
