import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGithubSyncProvider } from '@/app/services/sync/githubSyncProvider';
import { createServerSyncProvider } from '@/app/services/sync/serverSyncProvider';
import { createWebdavSyncProvider } from '@/app/services/sync/webdavSyncProvider';

import type { GithubSyncConfig, WebdavSyncConfig } from '@/app/services/sync/provider';

const response = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('github testConnection', () => {
  it('returns success detail on 200 with token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { private: false }));
    vi.stubGlobal('fetch', fetchMock);
    const detail = await createGithubSyncProvider(githubConfig).testConnection();
    expect(detail).toContain('Token 有效');
    // 探测仓库 API，而非 contents 文件路径
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.github.com/repos/owner/repo');
  });

  it('notes missing token for public repos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200)));
    const noToken: GithubSyncConfig = { ...githubConfig, token: undefined };
    const detail = await createGithubSyncProvider(noToken).testConnection();
    expect(detail).toContain('未配置 Token');
  });

  it('rejects with auth message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));
    await expect(createGithubSyncProvider(githubConfig).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('Token 无效'),
    });
  });

  it('distinguishes private-repo hint on 404 without token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404)));
    const noToken: GithubSyncConfig = { ...githubConfig, token: undefined };
    await expect(createGithubSyncProvider(noToken).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('私有'),
    });
  });
});

describe('webdav testConnection', () => {
  it('sends PROPFIND Depth 0 to server root and succeeds on 207', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(207));
    vi.stubGlobal('fetch', fetchMock);
    const detail = await createWebdavSyncProvider(webdavConfig).testConnection();
    expect(detail).toContain('账号密码有效');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://dav.example.com');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PROPFIND');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Depth: '0' });
  });

  it('reports direct connection when no proxy configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(207)));
    const noProxy: WebdavSyncConfig = { ...webdavConfig };
    delete noProxy.proxyUrl;
    const detail = await createWebdavSyncProvider(noProxy).testConnection();
    expect(detail).toContain('直连');
  });

  it('reports proxy forwarding when proxy configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(207));
    vi.stubGlobal('fetch', fetchMock);
    const detail = await createWebdavSyncProvider({
      ...webdavConfig,
      proxyUrl: 'https://proxy.example.com',
    }).testConnection();
    expect(detail).toContain('经代理转发');
    // 请求经代理转发，目标地址被编码为 url 参数
    expect(String(fetchMock.mock.calls[0][0])).toContain('proxy.example.com');
  });

  it('rejects with credential message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));
    await expect(createWebdavSyncProvider(webdavConfig).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('认证失败'),
    });
  });

  it('degrades gracefully on 405 (server without PROPFIND support)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(405)));
    const detail = await createWebdavSyncProvider(webdavConfig).testConnection();
    expect(detail).toContain('不支持 PROPFIND');
  });

  it('rejects on unexpected status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500)));
    await expect(createWebdavSyncProvider(webdavConfig).testConnection()).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
    });
  });

  it('throws CONFLICT on 409 during push', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(409));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createWebdavSyncProvider(webdavConfig);
    await expect(provider.push({ version: 4, groups: [], chords: [], songs: [] })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });

  it('throws CONFLICT on 412 during push', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(412));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createWebdavSyncProvider(webdavConfig);
    await expect(provider.push({ version: 4, groups: [], chords: [], songs: [] })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });
});

describe('server testConnection', () => {
  it('returns success message with environment indicator on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200));
    vi.stubGlobal('fetch', fetchMock);
    const detail = await createServerSyncProvider({
      kind: 'server',
      serverUrl: 'https://api.example.com/sync',
    }).testConnection();
    expect(detail).toContain('已连通线上数据库');
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers?.['X-Environment']).toBeDefined();
  });

  it('returns 404 friendly message with environment indicator', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404)));
    const detail = await createServerSyncProvider({
      kind: 'server',
      serverUrl: 'https://api.example.com/sync',
    }).testConnection();
    expect(detail).toContain('暂无数据存档');
  });

  it('rejects with server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500)));
    await expect(
      createServerSyncProvider({
        kind: 'server',
        serverUrl: 'https://api.example.com/sync',
      }).testConnection()
    ).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: expect.stringContaining('500'),
    });
  });
});
