import { STORAGE_KEYS } from '@/constants';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', () => {
  const githubToken = useStorage(STORAGE_KEYS.GH_TOKEN, '');
  const githubOwner = useStorage(STORAGE_KEYS.GH_OWNER, '');
  const githubRepo = useStorage(STORAGE_KEYS.GH_REPO, '');
  const githubBranch = useStorage(STORAGE_KEYS.GH_BRANCH, import.meta.env.VITE_GITHUB_BRANCH || 'master');
  const githubPath = useStorage(STORAGE_KEYS.GH_PATH, 'backup/chords.json');

  return {
    githubToken,
    githubOwner,
    githubRepo,
    githubBranch,
    githubPath,
  };
});
