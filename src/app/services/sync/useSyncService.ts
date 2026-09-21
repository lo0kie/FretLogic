/**
 * 云同步服务**状态壳**（只做动态 import 转发与状态持有，不含云访问实现）：
 * - 进行中状态 refs 在 syncState.ts（模块级单例）；
 * - 推拉同步/连接测试的实现（provider 注册表、备份载荷构建链）在 syncActions.ts，
 *   经动态 import 懒加载 —— 只有用户真正触发同步动作时才拉取，不进首屏闭包。
 * - resolvePushCredentialIssue 只读 settingsStore，属轻量预检，留在壳层同步可用。
 */
import { useSettingsStore } from '@/platform/store/settingsStore';

import { isPulling, isSyncing, isTestingConnection } from './syncState';

import type { ImportExportPayload } from '@/app/types';
import type { SyncProviderKind } from '@/platform/types';

/** 懒加载同步动作实现（见 syncActions.ts 文件头注释） */
const loadActions = () => import('./syncActions');

/**
 * 预取同步动作实现模块（只拉取不执行）：
 * 供同步相关 UI 挂载 / 空闲时机调用，把 chunk 下载提前到用户点击之前——
 * 否则首次点击要等「chunk 网络请求 → 模块求值」完成后 busy/loading 才置位，按钮出现反馈死区。
 */
export const preloadSyncActions = (): Promise<unknown> => loadActions();

/**
 * 推送前的凭据前置检查：按目标类型给出缺失项文案（齐全返回 null）。
 * 与 SyncModalContainer 的按钮禁用判据一致——推送（写云端）必须带凭据，
 * 拉取/测试连接不在此列（公开仓库与服务器 GET 无需 Token）。
 */
export const resolvePushCredentialIssue = (target: SyncProviderKind = useSettingsStore().syncTarget): string | null => {
  const settingsStore = useSettingsStore();
  if (target === 'github') return settingsStore.githubToken.trim() ? null : '请先填写 GitHub Token';
  if (target === 'gitee') return settingsStore.giteeToken.trim() ? null : '请先填写 Gitee Token';
  if (target === 'server') return settingsStore.serverToken.trim() ? null : '请先填写服务器 Token';
  if (target === 'webdav')
    return settingsStore.webdavServerUrl.trim() && settingsStore.webdavPassword.trim()
      ? null
      : '请先填写 WebDAV 服务器地址与密码';
  return null;
};

/** 云同步服务入口：返回推拉同步、覆盖应用、连接测试等动作与各进行中状态 */
export function useSyncService() {
  // 按当前同步目标缺省的动作（testConnection）读 settingsStore.syncTarget：原先每次调用都现取一次 store
  // 引用，改为随本 composable（在组件 setup 内调用）取一次，后续调用直接复用。
  const settingsStore = useSettingsStore();
  return {
    syncToRemote: (target?: SyncProviderKind) => loadActions().then(m => m.syncToRemote(target)),
    /** 触发全局同步（推送到云端），语义同 syncToRemote 的对外别名 */
    triggerGlobalSync: (target?: SyncProviderKind) => loadActions().then(m => m.syncToRemote(target)),
    resolvePushCredentialIssue,
    pullFromRemote: (target?: SyncProviderKind): Promise<ImportExportPayload | null> =>
      loadActions().then(m => m.pullFromRemote(target)),
    isSyncing,
    isPulling,
    applyOverwriteWithCloud: (cloudData: ImportExportPayload) =>
      loadActions().then(m => m.applyOverwriteWithCloud(cloudData)),
    testConnection: (target?: SyncProviderKind) =>
      loadActions().then(m => m.testConnection(target ?? settingsStore.syncTarget)),
    isTestingConnection,
  };
}
