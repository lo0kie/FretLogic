import { computed } from 'vue';

import { getKeySemitones, transposeChordName } from '@/domains/chord/theory/theory';
import { toCapo } from '@/domains/fretboard/model/coordinates';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useUiStore } from '@/platform/store/uiStore';
import { useModalController } from '@/platform/store/useModalController';

import type { Song } from '@/domains/score/types';

/** 乐谱弹窗的模块级共享状态：保证任意组件取用的都是同一份开关与弹窗数据（与 useBackupModals 一致）。
 * 若放在函数体内，每次调用都会生成脱节的副本——非容器组件调用 open 时，弹窗容器收不到信号。 */
const { modals, modalData, open, close } = useModalController(
  {
    create: false,
    config: false,
    clear: false,
  },
  {
    activeSong: null as Song | null,
    inputValue: '',
    title: '',
    playKey: 'C',
    capo: 0,
  }
);

/** 乐谱相关弹窗的状态与动作：新建 / 配置（标题、调性、变调夹）/ 清空和弦 */
export function useSongModals() {
  const songStore = useSongStore();
  const scoreEditor = useScoreEditorStore();
  const uiStore = useUiStore();

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

  /** 重置弹窗数据到默认值（新建与每次关闭弹窗后调用） */
  const resetModalData = () => {
    modalData.activeSong = null;
    modalData.inputValue = '';
    modalData.title = '';
    modalData.playKey = 'C';
    modalData.capo = 0;
  };

  /** 打开新建乐谱弹窗 */
  const openCreateSongModal = () => {
    resetModalData();
    open('create');
  };

  /** 确认创建乐谱：建谱后立即切换为活动乐谱并进入编辑页 */
  const handleCreateSong = () => {
    const title = modalData.inputValue.trim();
    if (!title) {
      uiStore.toast.warning('创建失败：请输入乐谱名称');
      return;
    }
    const newSong = songStore.createSong(title);

    scoreEditor.setActiveSong(newSong.id);
    scoreEditor.activeTab = 'edit';

    close('create');
    resetModalData();
    uiStore.toast.success('新建乐谱成功');
  };

  /** 打开乐谱配置弹窗，回填当前标题/调性/变调夹 */
  const openConfig = (song: Song) => {
    // key 由 playKey + capo 实时派生，无需单独读取持久化字段
    open('config', {
      activeSong: song,
      title: song.title,
      playKey: song.playKey || 'C',
      capo: song.capo || 0,
    });
  };

  /** 确认保存乐谱配置 */
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
    close('config');
    resetModalData();
  };

  /** 打开清空和弦确认弹窗 */
  const openClear = (song: Song) => {
    open('clear', { activeSong: song });
  };

  /** 确认清空该乐谱的全部和弦槽位 */
  const handleClearChords = () => {
    if (modalData.activeSong) {
      songStore.updateSongMeta(modalData.activeSong.id, { chordMap: new Map() });
      uiStore.toast.success('已清除该乐谱的所有和弦');
    }
    close('clear');
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
