/**
 * @Author likan
 * @Date 2026-05-04 09:38:10
 * @Filepath guitar-chord-lab\src\store\global.ts
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';

const useGlobalStore = defineStore(
  'globalStore',
  () => {
    const modalVisible = ref(false);
    const modalTitle = ref('');
    const toastVisible = ref(false);
    const toastTitle = ref('');
    const chordName = ref('');
    const selectedFrets = ref([-1, -1, -1, -1, -1, -1]);
    const capo = ref(0);
    const isDarkMode = ref(false);
    const isPreviewMode = ref(false);

    return {
      modalVisible,
      modalTitle,
      toastVisible,
      toastTitle,
      chordName,
      selectedFrets,
      capo,
      isDarkMode,
      isPreviewMode,
    };
  },
  { persist: true }
);

export default useGlobalStore;
