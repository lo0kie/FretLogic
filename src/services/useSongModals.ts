import BaseInput from '@/components/BaseInput.vue';
import { useSongStore } from '@/stores/songStore';
import { nextTick, ref, type Ref } from 'vue';

// 🌟 接收外部传入的 inputRef 引用
export function useSongModals(songTitleInputRef?: Ref<InstanceType<typeof BaseInput> | null>) {
  const songStore = useSongStore();

  const isSongCreateOpen = ref(false);
  const newSongTitle = ref('');

  const openCreateSongModal = async () => {
    newSongTitle.value = '';
    isSongCreateOpen.value = true;
    await nextTick();
    setTimeout(() => {
      if (songTitleInputRef?.value) {
        songTitleInputRef.value.focus();
      }
    }, 50);
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
