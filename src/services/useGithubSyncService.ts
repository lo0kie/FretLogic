// src/services/useGithubSyncService.ts
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { SettingsSchema } from '@/types';
import { cleanAndValidateData } from '@/utils/dataParser';
import { Base64 } from 'js-base64';
import { ref } from 'vue';

interface GithubFilePayload {
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

const isSyncing = ref(false);
const isPulling = ref(false);

export function useGithubSyncService() {
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const chordStore = useChordStore();

  const cleanHeaderString = (str: string) => str.trim().replace(/[^\x00-\x7F]/g, '');

  const syncToGithub = async (data: object) => {
    const rawPayload = {
      githubToken: cleanHeaderString(settingsStore.githubToken),
      githubOwner: settingsStore.githubOwner.trim(),
      githubRepo: settingsStore.githubRepo.trim(),
      githubBranch: settingsStore.githubBranch.trim(),
      githubPath: settingsStore.githubPath.trim(),
    };

    const schemaResult = SettingsSchema.safeParse(rawPayload);

    if (!schemaResult.success) {
      const firstErrorMessage = schemaResult.error.issues[0].message;
      uiStore.showToast(`同步失败：${firstErrorMessage}`, false, 'error');
      return;
    }

    const { githubToken, githubOwner, githubRepo, githubBranch, githubPath } = schemaResult.data;

    const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };

    isSyncing.value = true;
    try {
      uiStore.showToast('正在后台同步到 GitHub...', false, 'loading');

      let fileSha = '';
      const getRes = await fetch(`${apiUrl}?ref=${githubBranch}`, { method: 'GET', headers });

      if (getRes.ok) {
        const getResJson = await getRes.json();
        fileSha = getResJson.sha;
      } else if (getRes.status !== 404) {
        throw new Error('获取远程文件信息失败');
      }

      const contentBase64 = Base64.encode(JSON.stringify(data, null, 2));

      const body: GithubFilePayload = {
        message: `Auto sync chords data: ${new Date().toLocaleString()}`,
        content: contentBase64,
        branch: githubBranch,
      };

      if (fileSha) body.sha = fileSha;

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });

      if (!putRes.ok) throw new Error('推送代码失败');

      uiStore.showToast('成功同步至 GitHub 云端', false, 'success');
    } catch (err) {
      console.error('GitHub Sync Error:', err);
      uiStore.showToast('GitHub 同步失败，请检查网络或配置信息', false, 'error');
    } finally {
      isSyncing.value = false;
    }
  };

  const pullFromGithub = async () => {
    const rawPayload = {
      githubToken: cleanHeaderString(settingsStore.githubToken),
      githubOwner: settingsStore.githubOwner.trim(),
      githubRepo: settingsStore.githubRepo.trim(),
      githubBranch: settingsStore.githubBranch.trim(),
      githubPath: settingsStore.githubPath.trim(),
    };

    const schemaResult = SettingsSchema.safeParse(rawPayload);

    if (!schemaResult.success) {
      const firstErrorMessage = schemaResult.error.issues[0].message;
      uiStore.showToast(`拉取失败：${firstErrorMessage}`, false, 'error');
      return;
    }

    const { githubToken, githubOwner, githubRepo, githubBranch, githubPath } = schemaResult.data;

    const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubPath}?ref=${githubBranch}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    };

    isPulling.value = true;
    try {
      uiStore.showToast('正在从云端拉取数据...', false, 'loading');
      const res = await fetch(apiUrl, { method: 'GET', headers });

      if (!res.ok) {
        if (res.status === 404) throw new Error('云端文件不存在，请先执行一次同步上传');
        throw new Error('拉取请求失败，请检查配置或 Token 权限');
      }

      const resJson = await res.json();
      if (!resJson.content) throw new Error('云端文件内容为空');

      const cleanBase64 = resJson.content.replace(/\n/g, '');
      const decodedStr = Base64.decode(cleanBase64);
      const imported = JSON.parse(decodedStr);

      if (cleanAndValidateData(imported, 'import')) {
        chordStore.overwriteGroups(imported.groups);
        chordStore.overwriteChords(imported.chords);
        if (!chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
          chordStore.selectedGroupId = chordStore.groups[0]?.id || null;
        }
        uiStore.showToast('已成功从 GitHub 恢复所有数据', false, 'success');
      } else {
        throw new Error('云端数据格式破损，已触发安全拦截');
      }
    } catch (err) {
      console.error('GitHub Pull Error:', err);
      const errMsg = err instanceof Error ? err.message : '拉取失败，请检查网络';
      uiStore.showToast(`拉取失败：${errMsg}`, false, 'error');
    } finally {
      isPulling.value = false;
    }
  };

  const triggerGlobalSync = () => {
    syncToGithub({
      groups: chordStore.groups,
      chords: chordStore.savedChordsList,
    });
  };

  return { syncToGithub, triggerGlobalSync, pullFromGithub, isSyncing, isPulling };
}
