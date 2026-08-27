import type { SyncProviderKind } from '@/services/sync/provider';
import { STORAGE_KEYS } from '@/utils/core/constants';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const syncTarget = useStorage<SyncProviderKind>(STORAGE_KEYS.SYNC_TARGET, 'github');

  // GitHub 同步配置
  const githubToken = ref('');
  const githubOwner = useStorage(STORAGE_KEYS.GH_OWNER, '');
  const githubRepo = useStorage(STORAGE_KEYS.GH_REPO, '');
  const githubBranch = useStorage(STORAGE_KEYS.GH_BRANCH, '');
  const githubPath = useStorage(STORAGE_KEYS.GH_PATH, 'backup/chords.json');
  const githubBranches = useStorage(STORAGE_KEYS.GH_BRANCHES, <Array<string>>[]);

  // WebDAV 同步配置
  const webdavServerUrl = useStorage(STORAGE_KEYS.WEBDAV_SERVER_URL, '');
  const webdavUsername = useStorage(STORAGE_KEYS.WEBDAV_USERNAME, '');
  const webdavPassword = useStorage(STORAGE_KEYS.WEBDAV_PASSWORD, '');
  const webdavProxyUrl = useStorage(STORAGE_KEYS.WEBDAV_PROXY_URL, '');

  // 工作台乐理显示偏好
  const workbenchChordShorthand = useStorage<boolean>(STORAGE_KEYS.WORKBENCH_CHORD_SHORTHAND, false);
  const workbenchShowPitchNames = useStorage<boolean>(STORAGE_KEYS.WORKBENCH_SHOW_PITCH_NAMES, true);

  // 乐谱乐理显示偏好
  const scoreChordShorthand = useStorage<boolean>(STORAGE_KEYS.SCORE_CHORD_SHORTHAND, false);
  const scoreShowPitchNames = useStorage<boolean>(STORAGE_KEYS.SCORE_SHOW_PITCH_NAMES, true);

  return {
    syncTarget,
    githubToken,
    githubOwner,
    githubRepo,
    githubBranch,
    githubPath,
    githubBranches,
    webdavServerUrl,
    webdavUsername,
    webdavPassword,
    webdavProxyUrl,
    workbenchChordShorthand,
    workbenchShowPitchNames,
    scoreChordShorthand,
    scoreShowPitchNames,
    // 兼容别名（默认指向工作台）
    useChordShorthand: workbenchChordShorthand,
    showPitchNames: workbenchShowPitchNames,
  };
});
