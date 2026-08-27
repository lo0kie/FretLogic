import type { useSettingsStore } from '@/stores/settingsStore';
import { validateGithubSettings, validateWebdavSettings } from '@/utils/core/validateSettings';
import type { GithubSyncConfig, SyncConfig, SyncProvider, SyncProviderKind, WebdavSyncConfig } from './provider';
import { createGithubSyncProvider } from './githubSyncProvider';
import { createWebdavSyncProvider } from './webdavSyncProvider';

type SettingsStore = ReturnType<typeof useSettingsStore>;

/**
 * 同步 provider 注册表（工厂 + 策略）。
 * 新增一种同步后端只需在此追加一项，useSyncService 的派发逻辑无需改动，
 * 消除了原先散落在 useSyncService / SyncModalContainer 中的 if/else 分发。
 */
export interface ProviderFactory {
  /** 是否支持分支列表（GitHub 专有） */
  supportsBranches?: boolean;
  /** 从设置解析并校验配置；校验失败返回 error，否则返回 config */
  resolveConfig: (settings: SettingsStore) => { config?: SyncConfig; error?: string };
  create: (config: SyncConfig) => SyncProvider;
}

export const syncProviderRegistry: Record<SyncProviderKind, ProviderFactory> = {
  github: {
    supportsBranches: true,
    resolveConfig: s => {
      const r = validateGithubSettings({
        githubToken: s.githubToken,
        githubOwner: s.githubOwner,
        githubRepo: s.githubRepo,
        githubBranch: s.githubBranch,
        githubPath: s.githubPath,
      });
      if (!r.isValid) return { error: r.errors[0] ?? 'GitHub 配置无效' };
      const d = r.data;
      return {
        config: {
          kind: 'github',
          token: d.githubToken,
          owner: d.githubOwner,
          repo: d.githubRepo,
          branch: d.githubBranch,
          path: d.githubPath,
        },
      };
    },
    create: config => createGithubSyncProvider(config as GithubSyncConfig),
  },
  webdav: {
    resolveConfig: s => {
      const r = validateWebdavSettings({
        webdavServerUrl: s.webdavServerUrl,
        webdavUsername: s.webdavUsername,
        webdavPassword: s.webdavPassword,
        webdavProxyUrl: s.webdavProxyUrl,
      });
      if (!r.isValid) return { error: r.errors[0] ?? 'WebDAV 配置无效' };
      const d = r.data;
      return {
        config: {
          kind: 'webdav',
          serverUrl: d.webdavServerUrl,
          username: d.webdavUsername,
          password: d.webdavPassword,
          proxyUrl: d.webdavProxyUrl || undefined,
        },
      };
    },
    create: config => createWebdavSyncProvider(config as WebdavSyncConfig),
  },
};
