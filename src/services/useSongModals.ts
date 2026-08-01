import { useSongStore } from '@/stores/songStore';
import { ref } from 'vue';

// 🌟 接收外部传入的 inputRef 引用
export function useSongModals() {
  const songStore = useSongStore();

  const isSongCreateOpen = ref(false);
  const newSongTitle = ref('');

  const openCreateSongModal = () => {
    newSongTitle.value = '';
    isSongCreateOpen.value = true;
  };

  const handleCreateSong = () => {
    if (!newSongTitle.value.trim()) return;
    songStore.createSong(newSongTitle.value);
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
