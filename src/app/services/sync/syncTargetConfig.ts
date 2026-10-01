/**
 * 同步目标配置的两个判定 + 归属提示文案的**单一事实源**。
 *
 * 为什么单独成模块（与 providerMeta.ts 同一处置）：判定要在三个拉取入口共用——首访引导
 * （FirstRunPullModal）、顶栏「从云端拉取」、同步设置弹窗，三者都属首屏闭包；
 * 而云访问实现（syncActions.ts）是**动态 chunk**（见 useSyncService 的 loadActions），
 * 从那里静态 import 会把整条同步实现（四个 provider + 备份载荷构建链）拖进首屏。
 *
 * 出厂状态下 syncTarget 默认就是 gitee + 作者仓库，空 owner/repo 会回落到内置默认仓库
 * （见 registry 的 `|| DEFAULT_OWNER`）。只读探测本身无害，但**任何拉取入口都必须能点明数据归属**，
 * 否则用户会把作者示例数据当成自己的基线拉进本地。
 */
import { useSettingsStore } from '@/platform/store/settingsStore';
import { GITEE_SYNC_CONFIG, GITHUB_SYNC_CONFIG } from '@/platform/utils/constants';

import type { SyncProviderKind } from '@/platform/types';

/**
 * 当前同步目标是否具备可用于拉取探测的配置（探测只读不写，公开仓库无需 Token）。
 *
 * 语义是「**可探测**」而不是「用户已显式配置」：github/gitee/server 都有内置默认值，
 * 故恒为 true，是否仍在用内置默认源由 isUsingBuiltinAuthorTarget 单独判定。
 */
export const isSyncConfigured = (): boolean => {
  const settingsStore = useSettingsStore();
  switch (settingsStore.syncTarget) {
    case 'server':
      // 服务器地址由构建环境注入，视为始终已配置
      return true;
    case 'github':
    case 'gitee':
      // 仓库定位（owner/repo）有默认值，公开仓库拉取无需 Token
      return true;
    case 'webdav':
      return settingsStore.webdavServerUrl.trim() !== '';
  }
};

/**
 * 当前同步目标是否仍指向内置默认数据源（项目作者的公开仓库 / 线上默认服务端）。
 *
 * 该访问本身无害（只读探测、不写数据），但提示文案必须点明数据归属——否则用户会把作者示例数据
 * 造成的不一致当成自己的数据出了问题，甚至一键「拉取云端覆盖本地」把示例数据写进自己的库。
 *
 * `target` 缺省取全局 `settingsStore.syncTarget`。**动作按哪个目标执行，判定就必须传哪个目标** ——
 * 同步设置弹窗的方案选择器与全局 `syncTarget` 相互独立（弹窗里切到 Gitee 不联动全局），
 * 按全局判会把「正在拉作者示例数据」的提示整条漏掉。
 */
export const isUsingBuiltinAuthorTarget = (target?: SyncProviderKind): boolean => {
  const settingsStore = useSettingsStore();
  switch (target ?? settingsStore.syncTarget) {
    case 'github':
      return (
        (settingsStore.githubOwner.trim() || GITHUB_SYNC_CONFIG.DEFAULT_OWNER) === GITHUB_SYNC_CONFIG.DEFAULT_OWNER &&
        (settingsStore.githubRepo.trim() || GITHUB_SYNC_CONFIG.DEFAULT_REPO) === GITHUB_SYNC_CONFIG.DEFAULT_REPO
      );
    case 'gitee':
      return (
        (settingsStore.giteeOwner.trim() || GITEE_SYNC_CONFIG.DEFAULT_OWNER) === GITEE_SYNC_CONFIG.DEFAULT_OWNER &&
        (settingsStore.giteeRepo.trim() || GITEE_SYNC_CONFIG.DEFAULT_REPO) === GITEE_SYNC_CONFIG.DEFAULT_REPO
      );
    case 'server':
      // 后端地址由构建环境注入：registry.resolveServerSettings 恒传 CLOUD_SYNC_CONFIG.SERVER_URL，
      // serverSyncProvider 里的 config.serverUrl 只是同值兜底。设置里那个持久化 serverUrl
      // **没有任何请求路径读它**（只随备份导出/恢复流转），故 server 目标恒为内置源。
      // 不能按「用户填过地址就算自定义」判 —— 那会放走最危险的一种误判：用户以为自己连的是自建后端，
      // 实际拉的是作者的线上示例数据，还拿到一份「非内置目标」的提示，于是照常覆盖本地。
      // 自建部署把 VITE_SYNC_SERVER_URL 指向自己的 Worker 时同样落在这里：运行期无从区分，
      // 但那种部署下「内置源」就是它自己的服务端，提示仍成立。
      return true;
    case 'webdav':
      // WebDAV 无内置默认地址；未填地址时 isSyncConfigured 已提前短路
      return false;
  }
};

/** 数据归属说明（供各拉取入口展示：拉取确认、首访引导、同步设置弹窗的拉取提示） */
export const BUILTIN_AUTHOR_TARGET_MESSAGE =
  '当前同步的是项目作者的默认数据源（示例数据）。如需同步自己的数据，请在同步设置中更换仓库地址。';

/** 拉取动作的归属提示：目标仍是内置默认数据源时返回文案，否则空串（供各拉取入口展示；`target` 语义见上） */
export const getBuiltinAuthorTargetNotice = (target?: SyncProviderKind): string =>
  isUsingBuiltinAuthorTarget(target) ? BUILTIN_AUTHOR_TARGET_MESSAGE : '';
