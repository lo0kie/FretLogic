import {
  CLOUD_SYNC_CONFIG,
  GITEE_SYNC_CONFIG,
  GITHUB_SYNC_CONFIG,
  WEBDAV_SYNC_CONFIG,
} from '@/platform/utils/constants';
import {
  validateGiteeSettings,
  validateGithubSettings,
  validateServerSettings,
  validateWebdavSettings,
} from '@/platform/utils/transfer';

import { createGiteeSyncProvider } from './giteeSyncProvider';
import { createGithubSyncProvider } from './githubSyncProvider';
import { createServerSyncProvider } from './serverSyncProvider';
import { createWebdavSyncProvider } from './webdavSyncProvider';

import type { SyncConfig, SyncProvider, SyncProviderKind } from './provider';
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
 *
 * 实现注记：return 处的 `as` 不是纯强转——TS 无法把运行时 `config.kind !== kind` 的守卫与
 * 泛型 K 关联（泛型联合收窄的已知盲区，守卫后 `config` 的静态类型仍是整个联合），故断言
 * 不可避免；它的安全性由上一行的抛错守卫背书：kind 不符根本走不到 return。
 */
const takeConfig = <K extends SyncProviderKind>(config: SyncConfig, kind: K): Extract<SyncConfig, { kind: K }> => {
  if (config.kind !== kind) throw new Error(`同步配置类型不匹配：期望 ${kind}，实际收到 ${config.kind}`);
  return config as Extract<SyncConfig, { kind: K }>;
};

/** server 后端配置解析：地址来自构建期环境变量，配错时给出可读错误而不是让请求在别处失败 */
const resolveServerSettings = (settings: SettingsStore): { config?: SyncConfig; error?: string } => {
  const r = validateServerSettings({
    serverUrl: CLOUD_SYNC_CONFIG.SERVER_URL,
    serverToken: settings.serverToken,
  });
  if (!r.isValid) return { error: r.errors[0] ?? '服务器同步配置无效' };
  return { config: { kind: 'server', serverUrl: r.data.serverUrl, token: r.data.serverToken } };
};

/**
 * 同步 provider 注册表（工厂 + 策略）。
 * 新增一种同步后端只需在此追加一项，useSyncService 的派发逻辑无需改动，
 * 消除了原先散落在 useSyncService / SyncModalContainer 中的 if/else 分发。
 */
export interface ProviderFactory {
  /** 从设置解析并校验配置；校验失败返回 error，否则返回 config */
  resolveConfig: (settings: SettingsStore) => { config?: SyncConfig; error?: string };
  create: (config: SyncConfig) => SyncProvider;
  /**
   * 「测试连接」专用宽松解析：只要求发起探测请求的最小字段
   *（GitHub 仅 owner/repo，WebDAV 仅 serverUrl），分支/路径等完整配置不强制。
   *  Server 例外：后端只有「地址 + 可选 Token」两格，没有可再放宽的子集，故与 resolveConfig 同源。
   */
  resolveTestConfig: (settings: SettingsStore) => { config?: SyncConfig; error?: string };
}

/** github / gitee 设置仓与校验载荷的中性字段视图：两家的字段仅前缀（github 前缀 / gitee 前缀）不同。 */
interface GitSettingsInput {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/** 产出 SyncConfig 的字段：testConnection 的宽松解析允许 token 缺省。 */
type GitConfigFields = Omit<GitSettingsInput, 'token'> & { token?: string };

/** github / gitee 分区工厂的差异点：设置仓字段读取、前缀化校验、预设常量与文案。 */
interface GitRegistryAdapter {
  /** 由中性字段构造本家的 SyncConfig：kind 字面量在此落地，保住判别联合的可收窄性 */
  buildConfig: (fields: GitConfigFields) => SyncConfig;
  /** 从设置仓读取本家前缀字段（如 s.githubOwner → owner） */
  readFields: (settings: SettingsStore) => GitSettingsInput;
  /** 中性字段 → 本家前缀化校验载荷；成功时把前缀化的 data 映射回中性字段 */
  validate: (
    fields: GitSettingsInput
  ) => { isValid: true; data: GitSettingsInput; errors: string[] } | { isValid: false; errors: string[] };
  defaults: { DEFAULT_OWNER: string; DEFAULT_REPO: string; DEFAULT_BRANCH: string; DEFAULT_PATH: string };
  invalidMessage: string;
}

const githubAdapter: GitRegistryAdapter = {
  buildConfig: f => ({ kind: 'github', token: f.token, owner: f.owner, repo: f.repo, branch: f.branch, path: f.path }),
  readFields: s => ({
    token: s.githubToken,
    owner: s.githubOwner,
    repo: s.githubRepo,
    branch: s.githubBranch,
    path: s.githubPath,
  }),
  validate: f => {
    const r = validateGithubSettings({
      githubToken: f.token,
      githubOwner: f.owner,
      githubRepo: f.repo,
      githubBranch: f.branch,
      githubPath: f.path,
    });
    if (!r.isValid) return r;
    const d = r.data;
    return {
      isValid: true,
      errors: r.errors,
      data: {
        token: d.githubToken,
        owner: d.githubOwner,
        repo: d.githubRepo,
        branch: d.githubBranch,
        path: d.githubPath,
      },
    };
  },
  defaults: GITHUB_SYNC_CONFIG,
  invalidMessage: 'GitHub 配置无效',
};

const giteeAdapter: GitRegistryAdapter = {
  // 测试连接同样只需 owner/repo；Gitee 写操作强制要求 Token，连接测试宽松处理
  buildConfig: f => ({ kind: 'gitee', token: f.token, owner: f.owner, repo: f.repo, branch: f.branch, path: f.path }),
  readFields: s => ({
    token: s.giteeToken,
    owner: s.giteeOwner,
    repo: s.giteeRepo,
    branch: s.giteeBranch,
    path: s.giteePath,
  }),
  validate: f => {
    const r = validateGiteeSettings({
      giteeToken: f.token,
      giteeOwner: f.owner,
      giteeRepo: f.repo,
      giteeBranch: f.branch,
      giteePath: f.path,
    });
    if (!r.isValid) return r;
    const d = r.data;
    return {
      isValid: true,
      errors: r.errors,
      data: { token: d.giteeToken, owner: d.giteeOwner, repo: d.giteeRepo, branch: d.giteeBranch, path: d.giteePath },
    };
  },
  defaults: GITEE_SYNC_CONFIG,
  invalidMessage: 'Gitee 配置无效',
};

/**
 * github / gitee 的 resolveConfig + resolveTestConfig 约 42 行仅字段前缀不同，
 * 参照 payload.ts 的 gitBranchSchema<K> 泛型工厂模式，按差异点（adapter）参数化为一个工厂，
 * 避免两份逐字同构各自漂移（改校验流程时漏改一侧 ⇒ 该家静默保留旧逻辑）。
 */
const createGitRegistryEntry = (adapter: GitRegistryAdapter): Omit<ProviderFactory, 'create'> => {
  /** 应用「留空取默认」后的字段视图（resolveConfig 与 resolveTestConfig 共用的前半段） */
  const readWithDefaults = (settings: SettingsStore): GitSettingsInput => {
    const f = adapter.readFields(settings);
    return {
      token: f.token,
      owner: f.owner.trim() || adapter.defaults.DEFAULT_OWNER,
      repo: f.repo.trim() || adapter.defaults.DEFAULT_REPO,
      branch: f.branch.trim() || adapter.defaults.DEFAULT_BRANCH,
      path: f.path.trim() || adapter.defaults.DEFAULT_PATH,
    };
  };
  return {
    resolveConfig: s => {
      const f = readWithDefaults(s);
      const r = adapter.validate(f);
      if (!r.isValid) return { error: r.errors[0] ?? adapter.invalidMessage };
      return { config: adapter.buildConfig(r.data) };
    },
    // 测试连接只需 owner/repo（Token 与公开性在探测时自动区分），branch/path 不参与
    resolveTestConfig: s => {
      const f = readWithDefaults(s);
      if (!f.owner || !f.repo) return { error: '请先填写用户名与仓库名' };
      return { config: adapter.buildConfig({ ...f, token: f.token.trim() || undefined }) };
    },
  };
};

export const syncProviderRegistry: Record<SyncProviderKind, ProviderFactory> = {
  github: {
    ...createGitRegistryEntry(githubAdapter),
    create: config => createGithubSyncProvider(takeConfig(config, 'github')),
  },
  gitee: {
    ...createGitRegistryEntry(giteeAdapter),
    create: config => createGiteeSyncProvider(takeConfig(config, 'gitee')),
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
    create: config => createWebdavSyncProvider(takeConfig(config, 'webdav')),
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
    resolveConfig: resolveServerSettings,
    create: config => createServerSyncProvider(takeConfig(config, 'server')),
    // 测试连接必须带与真实同步同一份 Token：否则用户配了 serverToken 也永远按「无 Token」探测，
    // 既测不出写鉴权，给出的结论也与实际推送能力不符
    resolveTestConfig: resolveServerSettings,
  },
};
