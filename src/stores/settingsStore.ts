import { STORAGE_KEYS } from '@/constants';
import { useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  const githubToken = useStorage(STORAGE_KEYS.GH_TOKEN, '');
  const githubOwner = useStorage(STORAGE_KEYS.GH_OWNER, 'lo0kie');
  const githubRepo = useStorage(STORAGE_KEYS.GH_REPO, 'FretLogic');
  const githubBranch = useStorage(STORAGE_KEYS.GH_BRANCH, import.meta.env.VITE_GITHUB_BRANCH || 'master');
  const githubPath = useStorage(STORAGE_KEYS.GH_PATH, 'backup/chords.json');

  return {
    isDarkMode,
    githubToken,
    githubOwner,
    githubRepo,
    githubBranch,
    githubPath,
  };
});
