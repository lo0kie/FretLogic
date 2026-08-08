import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { ImportExportPayload } from '@/types';
import { buildSanitizedBackupPayload } from '@/utils/buildSanitizedBackupPayload';
import { cloneDeep } from '@/utils/cloneDeep';
import { validateImportExportPayload } from '@/utils/validatePayload';
import { validateSettings } from '@/utils/validateSettings';
import { Base64 } from 'js-base64';
import { ref } from 'vue';

interface GithubRequestContext {
  apiUrl: string;
  headers: Record<string, string>;
  githubBranch: string;
}

const isSyncing = ref(false);
const isPulling = ref(false);

export function useGithubSyncService() {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const chordStore = useChordStore();
  const songStore = useSongStore();

  const cleanHeaderString = (str: string) => str.trim().replace(/[^\x00-\x7F]/g, '');

  const resolveGithubContext = (errorPrefix: string): GithubRequestContext | null => {
    const rawPayload = {
      githubToken: cleanHeaderString(settingsStore.githubToken),
      githubOwner: settingsStore.githubOwner.trim(),
      githubRepo: settingsStore.githubRepo.trim(),
      githubBranch: settingsStore.githubBranch.trim(),
      githubPath: settingsStore.githubPath.trim(),
    };
    const validation = validateSettings(rawPayload);
    if (!validation.isValid) {
      uiStore.toast.error(`${errorPrefix}：${validation.errors[0]}`);
      return null;
    }
    const { githubToken, githubOwner, githubRepo, githubBranch, githubPath } = validation.data;
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (githubToken) {
      headers['Authorization'] = `Bearer ${githubToken}`;
    }
    return {
      apiUrl: `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}`,
      headers,
      githubBranch,
    };
  };

  const fetchExistingFileSha = async (
    apiUrl: string,
    githubBranch: string,
    headers: Record<string, string>,
    signal: AbortSignal
  ): Promise<string> => {
    const getRes = await fetch(`${apiUrl}?ref=${githubBranch}`, { method: 'GET', headers, signal });
    if (getRes.ok) {
      const getResJson = await getRes.json();
      return getResJson.sha;
    }
    if (getRes.status !== 404) {
      throw new Error('获取远程文件信息失败');
    }
    return '';
  };

  const syncToGithub = async () => {
    if (isSyncing.value) return;

    const ctx = resolveGithubContext('同步失败');
    if (!ctx) return;

    const payload = buildSanitizedBackupPayload();

    if (!payload) {
      uiStore.toast.error('数据校验失败，已取消同步');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let loadingToastId: number | null = null;
    isSyncing.value = true;
    try {
      loadingToastId = uiStore.toast.loading('正在后台同步到 GitHub...');
      const fileSha = await fetchExistingFileSha(ctx.apiUrl, ctx.githubBranch, ctx.headers, controller.signal);
      const body: { message: string; content: string; branch: string; sha?: string } = {
        message: `Auto sync fret-logic data: ${new Date().toLocaleString()}`,
        content: Base64.encode(JSON.stringify(payload, null, 2)),
        branch: ctx.githubBranch,
      };
      if (fileSha) body.sha = fileSha;
      const putRes = await fetch(ctx.apiUrl, {
        method: 'PUT',
        headers: { ...ctx.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!putRes.ok) throw new Error('推送代码失败');
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      uiStore.toast.success('成功同步至 GitHub 云端');
    } catch (err: unknown) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      console.error('GitHub Sync Error:', err);
      if (err instanceof Error) {
        const isAbort = err.name === 'AbortError';
        uiStore.toast.error(isAbort ? '同步超时：请检查网络状况' : 'GitHub 同步失败，请检查网络或配置信息');
      }
    } finally {
      clearTimeout(timeoutId);
      isSyncing.value = false;
    }
  };

  const pullFromGithub = async (): Promise<boolean> => {
    if (isPulling.value) return false;
    const ctx = resolveGithubContext('拉取失败');
    if (!ctx) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    isPulling.value = true;
    let loadingToastId: number | null = null;

    try {
      loadingToastId = uiStore.toast.loading('正在从云端获取数据...');
      const res = await fetch(`${ctx.apiUrl}?ref=${ctx.githubBranch}`, {
        method: 'GET',
        headers: ctx.headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('云端文件不存在，请先执行一次同步上传');
        throw new Error('拉取请求失败，请检查配置或 Token 权限');
      }
      const resJson = await res.json();
      if (!resJson.content) throw new Error('云端文件内容为空');

      const decodedStr = Base64.decode(resJson.content.replace(/\n/g, ''));
      const imported = JSON.parse(decodedStr);
      const { isValid, payload } = validateImportExportPayload(imported);
      if (!isValid || !payload) {
        throw new Error('云端数据格式破损，已触发安全拦截');
      }

      // 清洗后直接覆盖，不再比差异、不再弹合并
      applyOverwriteWithCloud(payload);

      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      // toast 已在 applyOverwriteWithCloud 里；若那边有 success，这里可不再重复
      return true;
    } catch (err: unknown) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      console.error('GitHub Pull Error:', err);
      if (err instanceof Error) {
        const isAbort = err.name === 'AbortError';
        uiStore.toast.error(`拉取失败：${isAbort ? '拉取超时，请检查网络' : err.message}`);
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
      isPulling.value = false;
    }
  };

  const applyOverwriteWithCloud = (cloudData: ImportExportPayload) => {
    const groups = cloneDeep(cloudData.groups ?? []).map(g => ({
      ...g,
      collapsed: true,
    }));
    const chords = cloneDeep(cloudData.chords ?? []);
    const songs = cloneDeep(cloudData.songs ?? []);

    chordStore.selectedGroupId = null;
    chordStore.overwriteGroups(groups);
    chordStore.overwriteChords(chords);
    if (cloudData.songs) songStore.overwriteSongs(songs);
    uiStore.toast.success('已使用云端数据完全覆盖本地');
  };

  const triggerGlobalSync = () => {
    void syncToGithub();
  };

  return {
    syncToGithub,
    triggerGlobalSync,
    pullFromGithub,
    isSyncing,
    isPulling,
    applyOverwriteWithCloud,
  };
}
