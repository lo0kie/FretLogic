import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { ImportExportPayload } from '@/types';
import { cleanAndValidateData, cloneDeep } from '@/utils/dataParser';
import { computeChordFingerprint, computeIsInverted, TuningEnum } from '@/utils/musicTheory'; // 🌟 新增导入
import { validateSettings } from '@/utils/validators';
import { Base64 } from 'js-base64';
import { ref } from 'vue';

interface GithubRequestContext {
  apiUrl: string;
  headers: Record<string, string>;
  githubBranch: string;
}

const isSyncing = ref(false);
const isPulling = ref(false);

const isMergeModalOpen = ref(false);
const pendingCloudData = ref<ImportExportPayload | null>(null);

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

    return {
      apiUrl: `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}`,
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
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
    } catch (err: any) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      console.error('GitHub Sync Error:', err);
      const isAbort = err.name === 'AbortError';
      uiStore.toast.error(isAbort ? '同步超时：请检查网络状况' : 'GitHub 同步失败，请检查网络或配置信息');
    } finally {
      clearTimeout(timeoutId);
      isSyncing.value = false;
    }
  };

  const checkHasDifferences = (cloudData: ImportExportPayload): boolean => {
    const localChords = chordStore.savedChordsList;
    const cloudChords = cloudData.chords || [];

    if (localChords.length !== cloudChords.length) return true;

    const localFps = new Set(localChords.map(c => c.fingerprint || `${c.id}_${c.chordName}`));
    const hasUnmatchedChord = cloudChords.some(c => !localFps.has(c.fingerprint || `${c.id}_${c.chordName}`));
    if (hasUnmatchedChord) return true;

    const localSongs = songStore.songs;
    const cloudSongs = cloudData.songs || [];
    if (localSongs.length !== cloudSongs.length) return true;

    const localSongIds = new Set(localSongs.map(s => s.id));
    const hasUnmatchedSong = cloudSongs.some(s => !localSongIds.has(s.id));
    if (hasUnmatchedSong) return true;

    return false;
  };

  const pullFromGithub = async () => {
    if (isPulling.value) return;

    const ctx = resolveGithubContext('拉取失败');
    if (!ctx) return;

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

      if (!cleanAndValidateData(imported, 'import')) {
        throw new Error('云端数据格式破损，已触发安全拦截');
      }

      // 🌟 核心修复：在这里统一清洗并归一化云端的旧数据指纹，保证在差异比对时不出错
      if (imported.chords && Array.isArray(imported.chords)) {
        imported.chords.forEach((c: any) => {
          const freshInverted = computeIsInverted(c.strings, c.capo ?? 0, c.tuning || TuningEnum.STANDARD, c.chordName);
          c.isInverted = freshInverted;
          c.fingerprint = computeChordFingerprint({
            groupId: c.groupId,
            chordName: c.chordName,
            capo: c.capo ?? 0,
            fretCount: c.fretCount ?? 3,
            tuning: c.tuning || TuningEnum.STANDARD,
            strings: c.strings,
            isInverted: freshInverted,
          });
        });
      }

      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);

      if (checkHasDifferences(imported)) {
        pendingCloudData.value = imported;
        isMergeModalOpen.value = true;
      } else {
        uiStore.toast.success('本地数据与云端完全一致，无需合并');
      }
    } catch (err: any) {
      if (loadingToastId !== null) uiStore.removeToast(loadingToastId);
      console.error('GitHub Pull Error:', err);
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort ? '拉取超时，请检查网络' : err instanceof Error ? err.message : '拉取失败，请检查网络';
      uiStore.toast.error(`拉取失败：${errMsg}`);
    } finally {
      clearTimeout(timeoutId);
      isPulling.value = false;
    }
  };

  const applyOverwriteWithCloud = () => {
    if (!pendingCloudData.value) return;

    const data = pendingCloudData.value;
    chordStore.overwriteGroups(data.groups);
    chordStore.overwriteChords(data.chords);
    if (data.songs) songStore.overwriteSongs(data.songs);

    if (!chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
      chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
    }

    isMergeModalOpen.value = false;
    pendingCloudData.value = null;
    uiStore.toast.success('已使用云端数据完全覆盖本地');
  };

  const applyUnionSetMerge = () => {
    if (!pendingCloudData.value) return;

    const cloudData = pendingCloudData.value;

    const localGroupIds = new Set(chordStore.groups.map(g => g.id));
    const newGroups = [...chordStore.groups];
    cloudData.groups.forEach(cg => {
      if (!localGroupIds.has(cg.id)) {
        newGroups.push(cloneDeep(cg));
      }
    });

    const localFps = new Set(chordStore.savedChordsList.map(c => c.fingerprint || c.id));
    const newChords = [...chordStore.savedChordsList];
    cloudData.chords.forEach(cc => {
      const fp = cc.fingerprint || cc.id;
      if (!localFps.has(fp)) {
        newChords.push(cloneDeep(cc));
      }
    });

    const localSongIds = new Set(songStore.songs.map(s => s.id));
    const newSongs = [...songStore.songs];
    if (cloudData.songs) {
      cloudData.songs.forEach(cs => {
        if (!localSongIds.has(cs.id)) {
          newSongs.push(cloneDeep(cs));
        }
      });
    }

    chordStore.overwriteGroups(newGroups);
    chordStore.overwriteChords(newChords);
    songStore.overwriteSongs(newSongs);

    isMergeModalOpen.value = false;
    pendingCloudData.value = null;
    uiStore.toast.success('已完成两端增量合并 (Union Set)');
  };

  const triggerGlobalSync = () => {
    syncToGithub({
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
    isMergeModalOpen,
    pendingCloudData,
    applyOverwriteWithCloud,
    applyUnionSetMerge,
  };
}
