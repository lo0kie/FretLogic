import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, ImportExportPayload } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import { unionMergePayloads } from '@/utils/dataMerge';
import { computeChordFingerprint } from '@/utils/musicTheory';
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

  const syncToGithub = async (data: object) => {
    if (isSyncing.value) return;
    const ctx = resolveGithubContext('同步失败');
    if (!ctx) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let loadingToastId: number | null = null;
    isSyncing.value = true;
    try {
      loadingToastId = uiStore.toast.loading('正在后台同步到 GitHub...');
      const fileSha = await fetchExistingFileSha(ctx.apiUrl, ctx.githubBranch, ctx.headers, controller.signal);
      const body: { message: string; content: string; branch: string; sha?: string } = {
        message: `Auto sync fret-logic data: ${new Date().toLocaleString()}`,
        content: Base64.encode(JSON.stringify(data, null, 2)),
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

  const checkHasDifferences = (cloudData: ImportExportPayload): boolean => {
    const localChords = chordStore.savedChordsList;
    const cloudChords = cloudData.chords || [];
    if (localChords.length !== cloudChords.length) return true;
    const getOrComputeFp = (c: Chord) => c.fingerprint || computeChordFingerprint(c);
    const localFps = new Set(localChords.map(getOrComputeFp));
    if (cloudChords.some(c => !localFps.has(getOrComputeFp(c)))) return true;

    const localGroups = chordStore.groups;
    const cloudGroups = cloudData.groups || [];
    if (JSON.stringify(localGroups) !== JSON.stringify(cloudGroups)) return true;

    const localSongs = songStore.songs;
    const cloudSongs = cloudData.songs || [];
    if (JSON.stringify(localSongs) !== JSON.stringify(cloudSongs)) return true;

    return false;
  };

  const pullFromGithub = async (): Promise<{ hasDifferences: boolean; cloudData: ImportExportPayload | null }> => {
    if (isPulling.value) return { hasDifferences: false, cloudData: null };
    const ctx = resolveGithubContext('拉取失败');
    if (!ctx) return { hasDifferences: false, cloudData: null };
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
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      if (checkHasDifferences(payload)) {
        return { hasDifferences: true, cloudData: payload };
      } else {
        uiStore.toast.success('本地数据与云端完全一致，无需合并');
        return { hasDifferences: false, cloudData: null };
      }
    } catch (err: unknown) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      console.error('GitHub Pull Error:', err);
      if (err instanceof Error) {
        const isAbort = err.name === 'AbortError';
        const errMsg = isAbort ? '拉取超时，请检查网络' : err instanceof Error ? err.message : '拉取失败，请检查网络';
        uiStore.toast.error(`拉取失败：${errMsg}`);
      }

      return { hasDifferences: false, cloudData: null };
    } finally {
      clearTimeout(timeoutId);
      isPulling.value = false;
    }
  };

  const applyOverwriteWithCloud = (cloudData: ImportExportPayload) => {
    const data = cloneDeep(cloudData);
    let finalSelectedId = chordStore.selectedGroupId;
    if (!data.groups.some(g => g.id === finalSelectedId)) {
      finalSelectedId = data.groups[0]?.id || null;
    }
    data.groups.forEach(g => {
      g.collapsed = g.id !== finalSelectedId;
    });
    chordStore.overwriteGroups(data.groups);
    chordStore.overwriteChords(data.chords);
    if (data.songs) songStore.overwriteSongs(data.songs);
    chordStore.selectedGroupId = finalSelectedId;
    uiStore.toast.success('已使用云端数据完全覆盖本地');
  };

  const applyUnionSetMerge = (cloudData: ImportExportPayload) => {
    const result = unionMergePayloads(
      { groups: chordStore.groups, chords: chordStore.savedChordsList, songs: songStore.songs },
      { groups: cloudData.groups, chords: cloudData.chords, songs: cloudData.songs ?? [] },
      chordStore.selectedGroupId
      // 不传 selection，代表全量合并，行为和原来完全一致
    );

    chordStore.overwriteGroups(result.groups);
    chordStore.overwriteChords(result.chords);
    songStore.overwriteSongs(result.songs);
    chordStore.selectedGroupId = result.selectedGroupId;
    uiStore.toast.success('已完成两端增量合并 (Union Set)');
  };

  const triggerGlobalSync = () => {
    syncToGithub({
      version: 1,
      groups: chordStore.groups,
      chords: chordStore.savedChordsList,
      songs: songStore.songs,
    });
  };

  return {
    syncToGithub,
    triggerGlobalSync,
    pullFromGithub,
    isSyncing,
    isPulling,
    applyOverwriteWithCloud,
    applyUnionSetMerge,
  };
}
