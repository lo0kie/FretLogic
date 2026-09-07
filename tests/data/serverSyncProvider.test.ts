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
  it('pushes snapshot with POST and Environment header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200, headers: { etag: 'etag-123' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createServerSyncProvider(config);
    const result = await provider.push(payload);

    expect(result.sha).toBe('etag-123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://api.example.com/sync');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Environment']).toBeDefined();
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('pulls and validates remote content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(payload)));
    const provider = createServerSyncProvider(config);
    const result = await provider.pull();
    expect(result.version).toBe(6);
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
});
