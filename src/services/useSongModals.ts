import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { getKeySemitones, transposeChordName } from '@/utils/musicTheory';
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

  // 🌟 将演唱调 key 改为带 getter / setter 的计算属性
  const key = computed({
    get: () => {
      return transposeChordName(modalData.playKey, modalData.capo);
    },
    set: (newKey: string) => {
      const currentKey = key.value;
      if (newKey === currentKey) return;

      // 计算新旧演唱调的差值，固定 Capo，反推并更新 playKey
      const delta = getKeySemitones(currentKey, newKey);
      modalData.playKey = transposeChordName(modalData.playKey, delta);
    },
  });

  const openCreateSongModal = () => {
    modalData.inputValue = '';
    modals.create = true;
  };

  const handleCreateSong = () => {
    const title = modalData.inputValue.trim();
    if (!title) return;
    const newSong = songStore.createSong(title);

    scoreEditor.setActiveSong(newSong.id);
    scoreEditor.activeTab = 'edit';
    if (uiStore.isMobile) uiStore.isLeftOpen = false;

    modals.create = false;
    uiStore.toast.success('新建乐谱成功');
  };

  const openConfig = (song: Song) => {
    modalData.activeSong = song;
    modalData.title = song.title;
    modalData.playKey = song.playKey || 'C';
    modalData.capo = song.capo || 0;

    // 如果传入的 song 对象有初始 key 且与当前的“playKey + capo”推算值不符，可以通过赋 set 修正初始 playKey
    if (song.key && song.key !== key.value) {
      key.value = song.key;
    }

    modals.config = true;
  };

  const handleConfigSong = () => {
    if (modalData.activeSong) {
      const newTitle = modalData.title.trim() || '未命名乐谱';
      songStore.updateSongMeta(modalData.activeSong.id, {
        title: newTitle,
        key: key.value, // 读取计算属性 key 的推导结果提交
        playKey: modalData.playKey,
        capo: modalData.capo,
      });
      uiStore.toast.success('乐谱配置已更新');
    }
    modals.config = false;
  };

  const openClear = (song: Song) => {
    modalData.activeSong = song;
    modals.clear = true;
  };

  const handleClearChords = () => {
    if (modalData.activeSong) {
      songStore.updateSongMeta(modalData.activeSong.id, { chordMap: {} });
      uiStore.toast.success('已清除该乐谱的所有和弦');
    }
    modals.clear = false;
  };

  return {
    modals,
    modalData,
    key, // 🌟 直接导出命名为 key 的计算属性
    openCreateSongModal,
    handleCreateSong,
    openConfig,
    handleConfigSong,
    openClear,
    handleClearChords,
  };
}
