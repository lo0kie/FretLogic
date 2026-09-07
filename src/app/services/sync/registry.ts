import {
  CLOUD_SYNC_CONFIG,
  GITEE_SYNC_CONFIG,
  GITHUB_SYNC_CONFIG,
  WEBDAV_SYNC_CONFIG,
} from '@/platform/utils/constants';
import {
  validateGiteeSettings,
  validateGithubSettings,
  validateWebdavSettings,
} from '@/platform/utils/validateSettings';

import { createGiteeSyncProvider } from './giteeSyncProvider.ts';
import { createGithubSyncProvider } from './githubSyncProvider.ts';
import { createServerSyncProvider } from './serverSyncProvider.ts';
import { createWebdavSyncProvider } from './webdavSyncProvider.ts';

import type {
  GiteeSyncConfig,
  GithubSyncConfig,
  ServerSyncConfig,
  SyncConfig,
  SyncProvider,
  SyncProviderKind,
  WebdavSyncConfig,
} from './provider.ts';
import type { useSettingsStore } from '@/platform/store/settingsStore';

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
      const owner = s.githubOwner.trim() || GITHUB_SYNC_CONFIG.DEFAULT_OWNER;
      const repo = s.githubRepo.trim() || GITHUB_SYNC_CONFIG.DEFAULT_REPO;
      const branch = s.githubBranch.trim() || GITHUB_SYNC_CONFIG.DEFAULT_BRANCH;
      const path = s.githubPath.trim() || GITHUB_SYNC_CONFIG.DEFAULT_PATH;
      const r = validateGithubSettings({
        githubToken: s.githubToken,
        githubOwner: owner,
        githubRepo: repo,
        githubBranch: branch,
        githubPath: path,
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
      const owner = s.githubOwner.trim() || GITHUB_SYNC_CONFIG.DEFAULT_OWNER;
      const repo = s.githubRepo.trim() || GITHUB_SYNC_CONFIG.DEFAULT_REPO;
      const branch = s.githubBranch.trim() || GITHUB_SYNC_CONFIG.DEFAULT_BRANCH;
      const path = s.githubPath.trim() || GITHUB_SYNC_CONFIG.DEFAULT_PATH;
      if (!owner || !repo) return { error: '请先填写用户名与仓库名' };
      return {
        config: {
          kind: 'github',
          token: s.githubToken.trim() || undefined,
          owner,
          repo,
          branch,
          path,
        },
      };
    },
  },
  gitee: {
    supportsBranches: true,
    resolveConfig: s => {
      const owner = s.giteeOwner.trim() || GITEE_SYNC_CONFIG.DEFAULT_OWNER;
      const repo = s.giteeRepo.trim() || GITEE_SYNC_CONFIG.DEFAULT_REPO;
      const branch = s.giteeBranch.trim() || GITEE_SYNC_CONFIG.DEFAULT_BRANCH;
      const path = s.giteePath.trim() || GITEE_SYNC_CONFIG.DEFAULT_PATH;
      const r = validateGiteeSettings({
        giteeToken: s.giteeToken,
        giteeOwner: owner,
        giteeRepo: repo,
        giteeBranch: branch,
        giteePath: path,
      });
      if (!r.isValid) return { error: r.errors[0] ?? 'Gitee 配置无效' };
      const d = r.data;
      return {
        config: {
          kind: 'gitee',
          token: d.giteeToken,
          owner: d.giteeOwner,
          repo: d.giteeRepo,
          branch: d.giteeBranch,
          path: d.giteePath,
        },
      };
    },
    create: config => createGiteeSyncProvider(config as GiteeSyncConfig),
    // 测试连接同样只需 owner/repo；Gitee 写操作强制要求 Token，连接测试宽松处理
    resolveTestConfig: s => {
      const owner = s.giteeOwner.trim() || GITEE_SYNC_CONFIG.DEFAULT_OWNER;
      const repo = s.giteeRepo.trim() || GITEE_SYNC_CONFIG.DEFAULT_REPO;
      const branch = s.giteeBranch.trim() || GITEE_SYNC_CONFIG.DEFAULT_BRANCH;
      const path = s.giteePath.trim() || GITEE_SYNC_CONFIG.DEFAULT_PATH;
      if (!owner || !repo) return { error: '请先填写用户名与仓库名' };
      return {
        config: {
          kind: 'gitee',
          token: s.giteeToken.trim() || undefined,
          owner,
          repo,
          branch,
          path,
        },
      };
    },
  },
  webdav: {
    resolveConfig: s => {
      const proxyUrl = s.webdavUseDefaultProxy
        ? WEBDAV_SYNC_CONFIG.DEFAULT_PROXY_URL
        : s.webdavProxyUrl.trim() || undefined;
      const r = validateWebdavSettings({
        webdavServerUrl: s.webdavServerUrl,
        webdavUsername: s.webdavUsername,
        webdavPassword: s.webdavPassword,
        webdavProxyUrl: proxyUrl,
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
      const proxyUrl = s.webdavUseDefaultProxy
        ? WEBDAV_SYNC_CONFIG.DEFAULT_PROXY_URL
        : s.webdavProxyUrl.trim() || undefined;
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
    resolveConfig: () => ({
      config: {
        kind: 'server',
        serverUrl: CLOUD_SYNC_CONFIG.SERVER_URL,
      },
    }),
    create: config => createServerSyncProvider(config as ServerSyncConfig),
    resolveTestConfig: () => ({
      config: {
        kind: 'server',
        serverUrl: CLOUD_SYNC_CONFIG.SERVER_URL,
      },
    }),
  },
};
