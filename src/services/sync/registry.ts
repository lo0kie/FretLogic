import type { useSettingsStore } from '@/stores/settingsStore';
import { validateGithubSettings, validateServerSettings, validateWebdavSettings } from '@/utils/core/validateSettings';
import type {
  GithubSyncConfig,
  ServerSyncConfig,
  SyncConfig,
  SyncProvider,
  SyncProviderKind,
  WebdavSyncConfig,
} from './provider';
import { createGithubSyncProvider } from './githubSyncProvider';
import { createServerSyncProvider } from './serverSyncProvider';
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
  /**
   * 「测试连接」专用宽松解析：只要求发起探测请求的最小字段
   *（GitHub 仅 owner/repo，WebDAV 仅 serverUrl，Server 仅 serverUrl），分支/路径等完整配置不强制。
   */
  resolveTestConfig: (settings: SettingsStore) => { config?: SyncConfig; error?: string };
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
    // 测试连接只需 owner/repo（Token 与公开性在探测时自动区分），branch/path 不参与
    resolveTestConfig: s => {
      const owner = s.githubOwner.trim();
      const repo = s.githubRepo.trim();
      if (!owner || !repo) return { error: '请先填写用户名与仓库名' };
      return {
        config: {
          kind: 'github',
          token: s.githubToken.trim() || undefined,
          owner,
          repo,
          branch: s.githubBranch.trim() || 'master',
          path: s.githubPath.trim() || 'backup/chords.json',
        },
      };
    },
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
    // 测试连接只需 serverUrl（账号密码可选，认证失败在探测时反馈）
    resolveTestConfig: s => {
      const serverUrl = s.webdavServerUrl.trim();
      if (!serverUrl) return { error: '请先填写 WebDAV 服务器地址' };
      if (!/^https?:\/\/.+/.test(serverUrl)) return { error: 'WebDAV 服务器地址需以 http(s):// 开头' };
      const proxyUrl = s.webdavProxyUrl.trim();
      return {
        config: {
          kind: 'webdav',
          serverUrl,
          username: s.webdavUsername.trim() || undefined,
          password: s.webdavPassword || undefined,
          ...(proxyUrl ? { proxyUrl } : {}),
        },
      };
    },
  },
  server: {
    resolveConfig: s => {
      const r = validateServerSettings({
        serverUrl: s.serverUrl,
        serverToken: s.serverToken,
      });
      if (!r.isValid) return { error: r.errors[0] ?? '服务器配置无效' };
      const d = r.data;
      return {
        config: {
          kind: 'server',
          serverUrl: d.serverUrl,
          token: d.serverToken,
        },
      };
    },
    create: config => createServerSyncProvider(config as ServerSyncConfig),
    resolveTestConfig: s => {
      const serverUrl = s.serverUrl.trim();
      if (!serverUrl) return { error: '请先填写服务器接口地址' };
      if (!/^https?:\/\/.+/.test(serverUrl)) return { error: '服务器接口地址需以 http(s):// 开头' };
      return {
        config: {
          kind: 'server',
          serverUrl,
          token: s.serverToken.trim() || undefined,
        },
      };
    },
  },
};
