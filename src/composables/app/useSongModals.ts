import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { toCapo } from '@/utils/music/chord-fretboard';
import { getKeySemitones, transposeChordName } from '@/utils/music/musicTheory';
import { computed, reactive } from 'vue';

export function useSongModals() {
  const songStore = useSongStore();
  const scoreEditor = useScoreEditorStore();
  const uiStore = useUiStore();

  const modals = reactive({
    create: false,
    config: false,
    clear: false,
  });

  const modalData = reactive({
    activeSong: null as Song | null,
    inputValue: '',
    title: '',
    playKey: 'C',
    capo: 0,
  });

  const key = computed({
    get: () => {
      return transposeChordName(modalData.playKey, modalData.capo);
    },
    set: (newKey: string) => {
      const currentKey = key.value;
      if (newKey === currentKey) return;

      const delta = getKeySemitones(currentKey, newKey);
      modalData.playKey = transposeChordName(modalData.playKey, delta);
    },
  });

  const resetModalData = () => {
    modalData.activeSong = null;
    modalData.inputValue = '';
    modalData.title = '';
    modalData.playKey = 'C';
    modalData.capo = 0;
  };

  const openCreateSongModal = () => {
    resetModalData();
    modals.create = true;
  };

  const handleCreateSong = () => {
    const title = modalData.inputValue.trim();
    if (!title) {
      uiStore.toast.warning('创建失败：请输入乐谱名称');
      return;
    }
    const newSong = songStore.createSong(title);

    scoreEditor.setActiveSong(newSong.id);
    scoreEditor.activeTab = 'edit';

    modals.create = false;
    resetModalData();
    uiStore.toast.success('新建乐谱成功');
  };

  const openConfig = (song: Song) => {
    modalData.activeSong = song;
    modalData.title = song.title;
    modalData.playKey = song.playKey || 'C';
    modalData.capo = song.capo || 0;

    // key 由 playKey + capo 实时派生，无需单独读取持久化字段
    modals.config = true;
  };

  const handleConfigSong = () => {
    if (modalData.activeSong) {
      const newTitle = modalData.title.trim() || '未命名乐谱';
      songStore.updateSongMeta(modalData.activeSong.id, {
        title: newTitle,
        playKey: modalData.playKey,
        capo: toCapo(modalData.capo ?? 0),
      });
      uiStore.toast.success('乐谱配置已更新');
    }
    modals.config = false;
    resetModalData();
  };

  const openClear = (song: Song) => {
    modalData.activeSong = song;
    modals.clear = true;
  };

  const handleClearChords = () => {
    if (modalData.activeSong) {
      songStore.updateSongMeta(modalData.activeSong.id, { chordMap: new Map() });
      uiStore.toast.success('已清除该乐谱的所有和弦');
    }
    modals.clear = false;
    resetModalData();
  };

  return {
    modals,
    modalData,
    key,
    openCreateSongModal,
    handleCreateSong,
    openConfig,
    handleConfigSong,
    openClear,
    handleClearChords,
  };
}
