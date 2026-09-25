import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGithubSyncProvider } from '@/app/services/sync/githubSyncProvider';
import { createServerSyncProvider } from '@/app/services/sync/serverSyncProvider';
import { createWebdavSyncProvider } from '@/app/services/sync/webdavSyncProvider';
import { CLOUD_SYNC_CONFIG } from '@/platform/utils/constants';

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
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.github.com/repos/owner/repo');
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
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://dav.example.com');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('PROPFIND');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ Depth: '0' });
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
    const fetchMock = vi.fn().mockResolvedValue(response(207));
    vi.stubGlobal('fetch', fetchMock);

    const detail = await createWebdavSyncProvider({ ...webdavConfig, proxyUrl }).testConnection();
    expect(detail).toContain(channel);
    expect(fetchMock).toHaveBeenCalled();
    if (proxyUrl) expect(String(fetchMock.mock.calls[0]![0])).toContain('proxy.example.com');
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(201)) // MKCOL 建父目录
      .mockResolvedValueOnce(response(404)) // HEAD 探测：云端无文件，无条件写
      .mockResolvedValueOnce(response(409));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createWebdavSyncProvider(webdavConfig);
    await expect(provider.push({ version: 4, groups: [], chords: [], songs: [] })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('版本冲突'),
    });
  });

  it('sends If-Match with probed ETag on push', async () => {
    const etagResponse = (status: number, etag?: string) =>
      new Response('', { status, headers: etag ? { ETag: etag } : {} });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(201)) // MKCOL
      .mockResolvedValueOnce(etagResponse(200, '"strong-etag-1"')) // HEAD 探测到强 ETag
      .mockResolvedValueOnce(etagResponse(200, '"new-etag"'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createWebdavSyncProvider(webdavConfig);
    await provider.push({ version: 4, groups: [], chords: [], songs: [] });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    const putInit = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(putInit.method).toBe('PUT');
    expect((putInit.headers as Record<string, string>)['If-Match']).toBe('"strong-etag-1"');
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
    expect(detail).toContain('已连通开发环境');
    expect(fetchMock).toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    // 原为 toBeDefined()（弱断言）；改为断言取值来源，与 serverSyncProvider.test.ts 同口径
    expect(headers?.['X-Environment']).toBe(CLOUD_SYNC_CONFIG.MODE);
  });

  it('returns 404 friendly message with environment indicator', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404)));
    const detail = await createServerSyncProvider({
      kind: 'server',
      serverUrl: 'https://api.example.com/sync',
    }).testConnection();
    expect(detail).toContain('开发环境在线，暂无存档');
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
