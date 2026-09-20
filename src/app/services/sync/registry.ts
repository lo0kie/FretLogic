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
 * 分区内的配置收窄（判别式收窄的唯一出口）。
 *
 * `ProviderFactory.create` 收的是 `SyncConfig` 联合类型，所以每个分区里 `config` 的静态类型
 * 仍是整个联合。原先直接写 `config as GithubSyncConfig` 是纯强转——「分区与 kind 一致」这个
 * 前提没有任何人校验：将来若把某分区的 create 接到别的 kind 上（或新增分区时抄错），编译器
 * 不会出声，运行时才以「provider 内读到 undefined 字段」的形式炸在别处、且离现场很远。
 * 改为判别式收窄后，类型由控制流得出而非断言，kind 不符立即抛出并指出两侧。
 *
 * 正常路径恒真：每个分区的 resolveConfig / resolveTestConfig 都只产出自己的 kind，
 * 而 syncActions 总是用同一分区的工厂消费它（见 resolveProvider / testConnection）。
 */
const takeGithubConfig = (config: SyncConfig): GithubSyncConfig => {
  if (config.kind !== 'github') throw new Error(`同步配置类型不匹配：期望 github，实际收到 ${config.kind}`);
  return config;
};

const takeGiteeConfig = (config: SyncConfig): GiteeSyncConfig => {
  if (config.kind !== 'gitee') throw new Error(`同步配置类型不匹配：期望 gitee，实际收到 ${config.kind}`);
  return config;
};

const takeWebdavConfig = (config: SyncConfig): WebdavSyncConfig => {
  if (config.kind !== 'webdav') throw new Error(`同步配置类型不匹配：期望 webdav，实际收到 ${config.kind}`);
  return config;
};

const takeServerConfig = (config: SyncConfig): ServerSyncConfig => {
  if (config.kind !== 'server') throw new Error(`同步配置类型不匹配：期望 server，实际收到 ${config.kind}`);
  return config;
};

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
    create: config => createGithubSyncProvider(takeGithubConfig(config)),
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
    create: config => createGiteeSyncProvider(takeGiteeConfig(config)),
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
    create: config => createWebdavSyncProvider(takeWebdavConfig(config)),
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
    resolveConfig: s => ({
      config: {
        kind: 'server',
        serverUrl: CLOUD_SYNC_CONFIG.SERVER_URL,
        token: s.serverToken.trim() || undefined,
      },
    }),
    create: config => createServerSyncProvider(takeServerConfig(config)),
    // 测试连接必须带与真实同步同一份 Token：否则用户配了 serverToken 也永远按「无 Token」探测，
    // 既测不出写鉴权，给出的结论也与实际推送能力不符
    resolveTestConfig: s => ({
      config: {
        kind: 'server',
        serverUrl: CLOUD_SYNC_CONFIG.SERVER_URL,
        token: s.serverToken.trim() || undefined,
      },
    }),
  },
};
