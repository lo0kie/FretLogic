// src/services/useSongModals.ts

import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { ref } from 'vue';

export function useSongModals() {
  const songStore = useSongStore();
  const scoreEditor = useScoreEditorStore(); // 🌟 引入乐谱编辑器 store
  const uiStore = useUiStore(); // 🌟 引入 UI store

  const isSongCreateOpen = ref(false);
  const newSongTitle = ref('');

  const openCreateSongModal = () => {
    newSongTitle.value = '';
    isSongCreateOpen.value = true;
  };

  const handleCreateSong = () => {
    const title = newSongTitle.value.trim();
    if (!title) return;

    // 1. 创建新乐谱，获取返回的 Song 对象
    const newSong = songStore.createSong(title);

    // 🌟 2. 核心：立即将当前激活乐谱切换为刚新建的乐谱
    scoreEditor.setActiveSong(newSong.id);

    // 🌟 3. 新新建的乐谱歌词为空，自动切至“编辑歌词”模式
    scoreEditor.activeTab = 'edit';

    // 🌟 4. 如果是移动端，自动收起左侧边栏，提升体验
    if (uiStore.isMobile) {
      uiStore.isLeftOpen = false;
    }

    newSongTitle.value = '';
    isSongCreateOpen.value = false;
  };

  return {
    isSongCreateOpen,
    newSongTitle,
    openCreateSongModal,
    handleCreateSong,
  };
}
