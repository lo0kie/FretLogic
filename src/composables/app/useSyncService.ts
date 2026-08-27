import { SyncError, type SyncBranchesProvider, type SyncProvider } from '@/services/sync/provider';
import { syncProviderRegistry } from '@/services/sync/registry';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { ImportExportPayload } from '@/types';
import { buildBackupPayload } from '@/utils/core/buildBackupPayload';
import { ref } from 'vue';

const isSyncing = ref(false);
const isPulling = ref(false);

export function useSyncService() {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const editorStore = useChordEditorStore();

  const resolveProvider = (errorPrefix: string): SyncProvider | null => {
    const factory = syncProviderRegistry[settingsStore.syncTarget];
    const resolved = factory.resolveConfig(settingsStore);
    if (resolved.error || !resolved.config) {
      uiStore.toast.error(`${errorPrefix}：${resolved.error ?? '配置无效'}`);
      return null;
    }
    return factory.create(resolved.config);
  };

  const showSyncError = (prefix: string, err: unknown) => {
    console.error('Cloud Sync Error:', err);
    if (err instanceof SyncError) {
      const messageByCode: Record<SyncError['code'], string> = {
        FILE_NOT_FOUND: '云端文件不存在，请先执行一次同步上传',
        INVALID_CLOUD_DATA: '云端数据格式破损，已触发安全拦截',
        REQUEST_FAILED: err.message,
        TIMEOUT: '请求超时：请检查网络或服务器状态',
        CORS: '跨域请求被浏览器拦截。请在 WebDAV 服务器开启 CORS，或在设置中填写「CORS 代理」后重试',
        NETWORK: err.message,
      };
      uiStore.toast.error(`${prefix}：${messageByCode[err.code]}`);
      return;
    }
    if (err instanceof Error) {
      uiStore.toast.error(`${prefix}：云端操作失败，请检查网络或配置信息`);
    }
  };

  const syncToRemote = async (): Promise<boolean> => {
    if (isSyncing.value) return false;
    const provider = resolveProvider('同步失败');
    if (!provider) return false;
    const payload = buildBackupPayload();
    if (!payload) {
      uiStore.toast.error('数据校验失败，已取消同步');
      return false;
    }
    isSyncing.value = true;
    let loadingToastId: number | null = null;
    try {
      loadingToastId = uiStore.toast.loading('正在后台同步到云端...', { closable: false });
      await provider.push(payload);
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      uiStore.toast.success('成功同步至云端');
      return true;
    } catch (err: unknown) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      showSyncError('同步失败', err);
      return false;
    } finally {
      isSyncing.value = false;
    }
  };

  const pullFromRemote = async (): Promise<boolean> => {
    if (isPulling.value) return false;
    const provider = resolveProvider('拉取失败');
    if (!provider) return false;

    isPulling.value = true;
    let loadingToastId: number | null = null;
    try {
      loadingToastId = uiStore.toast.loading('正在从云端获取数据...', { closable: false });
      const payload = await provider.pull();
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      applyOverwriteWithCloud(payload);
      return true;
    } catch (err: unknown) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      showSyncError('拉取失败', err);
      return false;
    } finally {
      isPulling.value = false;
    }
  };

  const applyOverwriteWithCloud = (cloudData: ImportExportPayload) => {
    // 入参是 provider 校验后的产物（全新对象图），可直接被 store 接管
    chordStore.replaceAllData({
      groups: cloudData.groups ?? [],
      chords: cloudData.chords ?? [],
    });

    const songs = cloudData.songs ?? [];
    if (cloudData.songs) songStore.overwriteSongs(songs);
    uiStore.toast.success('已使用云端数据完全覆盖本地');
    // 拉取后清空指板编辑草稿（全部静音），避免残留旧指法
    editorStore.resetEditor();
  };

  const fetchGithubBranches = async (): Promise<boolean> => {
    const factory = syncProviderRegistry[settingsStore.syncTarget];
    if (!factory.supportsBranches) return false; // 仅 GitHub 支持分支列表
    const provider = resolveProvider('获取分支失败');
    if (!provider) return false;
    const branchesProvider = provider as SyncBranchesProvider;

    let loadingToastId: number | null = null;
    try {
      loadingToastId = uiStore.toast.loading('正在获取远程分支列表...', { closable: false });
      const branches = await branchesProvider.listBranches();
      settingsStore.githubBranches = branches;

      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      uiStore.toast.success(`成功获取 ${branches.length} 个分支`);
      return true;
    } catch (err: unknown) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      showSyncError('获取分支失败', err);
      return false;
    }
  };

  const triggerGlobalSync = () => syncToRemote();

  return {
    syncToRemote,
    triggerGlobalSync,
    pullFromRemote,
    isSyncing,
    isPulling,
    applyOverwriteWithCloud,
    fetchGithubBranches,
  };
}
