import { useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  const githubToken = useStorage('CHORD_LAB_GH_TOKEN', '');
  const githubOwner = useStorage('CHORD_LAB_GH_OWNER', 'lo0kie');
  const githubRepo = useStorage('CHORD_LAB_GH_REPO', 'FretLogic');
  const githubBranch = useStorage('CHORD_LAB_GH_BRANCH', import.meta.env.VITE_GITHUB_BRANCH || 'master');
  const githubPath = useStorage('CHORD_LAB_GH_PATH', 'backup/chords.json');

  return {
    isDarkMode,
    githubToken,
    githubOwner,
    githubRepo,
    githubBranch,
    githubPath,
  };
});
