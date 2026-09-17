/**
 * 云同步动作实现（懒加载模块，由 useSyncService 状态壳动态 import）：
 * 基于 Provider（GitHub / WebDAV / Gitee / 服务器）的推拉同步、连接测试与分支列表获取。
 * 推送使用不含凭据的 selection（见 buildBackupPayload），拉取结果走统一清洗层后应用。
 *
 * 独立成模块的原因：provider 注册表、备份载荷构建（buildBackupPayload）整条链只在用户
 * 真正触发同步动作时才需要；状态 refs 在 syncState.ts（模块级单例，壳与实现共享）。
 */
import { FULL_BACKUP_SELECTION } from '@/app/services/backup/backupSelection';
import { buildBackupPayloadResult } from '@/app/services/backup/buildBackupPayload';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';

import { SyncError } from './provider';
import { syncProviderRegistry } from './registry';
import { isFetchingBranches, isPulling, isSyncing, isTestingConnection } from './syncState';
import { resolvePushCredentialIssue } from './useSyncService';

import type { SyncBranchesProvider, SyncProvider, SyncProviderKind } from './provider';
import type { ImportExportPayload } from '@/app/types';
import type { Ref } from 'vue';

/** 按目标类型解析同步 Provider；配置无效时 toast 并返回 null */
const resolveProvider = (errorPrefix: string, target: SyncProviderKind): SyncProvider | null => {
  const settingsStore = useSettingsStore();
  const uiStore = useUiStore();
  const factory = syncProviderRegistry[target];
  const resolved = factory.resolveConfig(settingsStore);
  if (resolved.error || !resolved.config) {
    uiStore.toast.error(`${errorPrefix}：${resolved.error ?? '配置无效'}`);
    return null;
  }
  return factory.create(resolved.config);
};

/** 统一同步错误提示：按 SyncError code 映射为用户可读文案，其余错误走通用提示 */
const showSyncError = (prefix: string, err: unknown) => {
  const uiStore = useUiStore();
  console.error('Cloud Sync Error:', err);
  if (err instanceof SyncError) {
    const messageByCode: Record<SyncError['code'], string> = {
      FILE_NOT_FOUND: '云端文件不存在，请先执行一次同步上传',
      INVALID_CLOUD_DATA: '云端数据格式破损，已触发安全拦截',
      REQUEST_FAILED: err.message,
      TIMEOUT: '请求超时：请检查网络或服务器状态',
      CORS: '跨域请求被浏览器拦截。请在 WebDAV 服务器开启 CORS，或在设置中填写「CORS 代理」后重试',
      NETWORK: err.message,
      CONFLICT: '云端数据已被其他设备更新（版本冲突），请先拉取最新数据再同步',
    };
    uiStore.toast.error(`${prefix}：${messageByCode[err.code]}`);
    return;
  }
  if (err instanceof Error) {
    uiStore.toast.error(`${prefix}：云端操作失败，请检查网络或配置信息`);
  }
};

/**
 * 通用云端动作管线：互斥守卫 → loading toast → 执行 → 失败统一提示，finally 复位进行中状态。
 * 委托给通用 runBusyAction 管线，仅注入按 SyncError code 映射的错误提示。
 * @returns run 的返回值；重入守卫退出或执行失败时返回 null（成功提示由调用方在返回后追加，保证先移除 loading）
 */
const runCloudAction = async <T>(opts: {
  busy: Ref<boolean>;
  loadingText: string;
  errorPrefix: string;
  run: () => Promise<T>;
}): Promise<T | null> =>
  runBusyAction({
    busy: opts.busy,
    loadingText: opts.loadingText,
    run: opts.run,
    onError: err => showSyncError(opts.errorPrefix, err),
  });

/** 推送本地数据到云端（不含凭据类同步配置），全程互斥防重入；返回是否成功 */
export const syncToRemote = async (target?: SyncProviderKind): Promise<boolean> => {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  if (isSyncing.value) return false;
  // 凭据缺失时不发起任何请求，仅提示
  const credentialIssue = resolvePushCredentialIssue(target);
  if (credentialIssue) {
    uiStore.toast.error(credentialIssue);
    return false;
  }
  const provider = resolveProvider('同步失败', target ?? settingsStore.syncTarget);
  if (!provider) return false;
  // 云端推送不携带同步配置（含 Token/密码等凭据），仅手动备份导出才包含；采用宽容模式避免单条脏记录阻断同步
  const { payload, issues, warnings } = await buildBackupPayloadResult({
    selection: { ...FULL_BACKUP_SELECTION, syncSettings: false },
  });
  if (!payload) {
    const reason = issues.length > 0 ? `：${issues.slice(0, 2).join('; ')}` : '';
    uiStore.toast.error(`数据校验失败，已取消同步${reason}`);
    return false;
  }
  if (warnings.length > 0) {
    console.warn('[syncToRemote] 数据清洗提示:', warnings);
  }
  const ok = await runCloudAction({
    busy: isSyncing,
    loadingText: '正在后台同步到云端...',
    errorPrefix: '同步失败',
    run: () => provider.push(payload),
  });
  if (ok === null) return false;
  uiStore.toast.success('成功同步至云端');
  return true;
};

/** 从云端拉取原始数据包（仅拉取不应用，应用由调用方走 openImportWithPayload/applyOverwriteWithCloud） */
export const pullFromRemote = async (target?: SyncProviderKind): Promise<ImportExportPayload | null> => {
  const settingsStore = useSettingsStore();
  if (isPulling.value) return null;
  const provider = resolveProvider('拉取失败', target ?? settingsStore.syncTarget);
  if (!provider) return null;

  return runCloudAction({
    busy: isPulling,
    loadingText: '正在从云端获取数据...',
    errorPrefix: '拉取失败',
    run: () => provider.pull(),
  });
};

/** 用云端数据完全覆盖本地实体与偏好设置，并复位指板编辑草稿 */
export const applyOverwriteWithCloud = (cloudData: ImportExportPayload) => {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const settingsStore = useSettingsStore();
  const uiStore = useUiStore();
  const editorStore = useChordEditorStore();
  // 入参是 provider 校验后的产物（全新对象图），可直接被 store 接管
  chordStore.replaceAllData({
    groups: cloudData.groups ?? [],
    chords: cloudData.chords ?? [],
  });

  const songs = cloudData.songs ?? [];
  if (cloudData.songs) songStore.overwriteSongs(songs);
  // v6 起云端包携带偏好设置（不含凭据），拉取时一并恢复
  settingsStore.applyPreferencesBackup(cloudData.preferences);
  uiStore.toast.success('已使用云端数据完全覆盖本地');
  // 拉取后清空指板编辑草稿（全部静音），避免残留旧指法
  editorStore.resetEditor();
};

/** 拉取远程分支列表写入 settingsStore（仅支持分支能力的 Provider：GitHub / Gitee） */
export const fetchGithubBranches = async (target: SyncProviderKind): Promise<boolean> => {
  const settingsStore = useSettingsStore();
  const uiStore = useUiStore();
  const factory = syncProviderRegistry[target];
  if (!factory.supportsBranches || isFetchingBranches.value) return false;
  const provider = resolveProvider('获取分支失败', target);
  if (!provider) return false;
  const branchesProvider = provider as SyncBranchesProvider;

  // 重新获取前重置当前后端的既有分支选择，避免下拉框残留失效选项
  const isGitee = target === 'gitee';
  if (isGitee) {
    settingsStore.giteeBranches = [];
    settingsStore.giteeBranch = '';
  } else {
    settingsStore.githubBranches = [];
    settingsStore.githubBranch = '';
  }

  const branches = await runCloudAction({
    busy: isFetchingBranches,
    loadingText: '正在获取远程分支列表...',
    errorPrefix: '获取分支失败',
    run: () => branchesProvider.listBranches(),
  });
  if (branches === null) return false;

  if (isGitee) {
    settingsStore.giteeBranches = branches;
  } else {
    settingsStore.githubBranches = branches;
  }
  uiStore.toast.success(`成功获取 ${branches.length} 个分支`);
  return true;
};

/** 测试同步后端的连通性（探测请求，不读写业务数据） */
export const testConnection = async (target: SyncProviderKind): Promise<boolean> => {
  const settingsStore = useSettingsStore();
  const uiStore = useUiStore();
  if (isTestingConnection.value) return false;
  const factory = syncProviderRegistry[target];
  const resolved = factory.resolveTestConfig(settingsStore);
  if (resolved.error || !resolved.config) {
    uiStore.toast.error(`测试连接失败：${resolved.error ?? '配置无效'}`);
    return false;
  }
  const provider = factory.create(resolved.config);

  const detail = await runCloudAction({
    busy: isTestingConnection,
    loadingText: '正在测试连接...',
    errorPrefix: '测试连接失败',
    run: () => provider.testConnection(),
  });
  if (detail === null) return false;
  uiStore.toast.success(`连接成功：${detail}`);
  return true;
};
