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
    singer: '',
    originalKey: '',
    timeSignature: '',
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
    get: () => transposeChordName(modalData.playKey, modalData.capo),
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
    modalData.singer = '';
    modalData.originalKey = '';
    modalData.timeSignature = '';
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
      uiStore.message.warning('创建失败：请输入乐谱名称');
      return;
    }
    const newSong = songStore.createSong(title);

    scoreEditor.setActiveSong(newSong.id);
    scoreEditor.activeTab = 'edit';

    close('create');
    resetModalData();
    uiStore.message.success('新建乐谱成功');
  };

  /** 打开乐谱配置弹窗，回填当前标题/歌手/原调/拍号/调性/变调夹 */
  const openConfig = (song: Song) =>
    // key 由 playKey + capo 实时派生，无需单独读取持久化字段
    void open('config', {
      activeSong: song,
      title: song.title,
      singer: song.singer ?? '',
      originalKey: song.originalKey ?? '',
      timeSignature: song.timeSignature ?? '',
      playKey: song.playKey || 'C',
      capo: song.capo || 0,
    });

  /** 确认保存乐谱配置 */
  const handleConfigSong = () => {
    if (modalData.activeSong) {
      const target = modalData.activeSong;
      const newTitle = modalData.title.trim() || '未命名乐谱';
      const nextCapo = toCapo(modalData.capo ?? 0);
      // playKey / capo 属 HistoryState 维度（见 useScoreHistory 的 HistoryState 与 applyState），
      // 改它们必须记撤销历史——否则「配置弹窗改选调」会被之后任意一次 undo 静默回退到变更前的快照。
      // 与 updateLyrics / handleClearChords 同款守卫：仅当前激活歌曲入栈，避免历史栈混入非激活歌曲快照。
      // 只在值真的变化时记录：title/singer/originalKey/timeSignature 都不在 HistoryState 里，
      // 只为它们记录会在撤销栈里留下无内容的空条目。
      const affectsHistory =
        scoreEditor.activeSong?.id === target.id &&
        (modalData.playKey !== (target.playKey || 'C') || nextCapo !== (target.capo || 0));
      if (affectsHistory) scoreEditor.recordHistory();
      songStore.updateSongMeta(target.id, {
        title: newTitle,
        singer: modalData.singer.trim(),
        originalKey: modalData.originalKey,
        timeSignature: modalData.timeSignature,
        playKey: modalData.playKey,
        capo: nextCapo,
      });
      if (affectsHistory) scoreEditor.recordHistory();
      uiStore.message.success('乐谱配置已更新');
    }
    close('config');
    resetModalData();
  };

  /** 打开清空和弦确认弹窗 */
  const openClear = (song: Song) => void open('clear', { activeSong: song });

  /** 确认清空该乐谱的全部和弦槽位 */
  const handleClearChords = () => {
    if (modalData.activeSong) {
      const target = modalData.activeSong;
      // 与 updateLyrics 同款守卫：仅清空的是当前激活歌曲时记撤销历史，否则历史栈混入非激活歌曲快照
      const isActive = scoreEditor.activeSong?.id === target.id;
      if (isActive) scoreEditor.recordHistory();
      songStore.updateSongMeta(target.id, { chordMap: new Map() });
      if (isActive) scoreEditor.recordHistory();
      uiStore.message.success('已清除该乐谱的所有和弦');
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
