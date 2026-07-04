import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { copyElementToClipboard } from '@/utils/domExporter';
import { Ref, toRaw, unref } from 'vue';
import { SortableEvent } from 'vue-draggable-plus';

export function useChordService() {
  const chordStore = useChordStore();
  const editorStore = useEditorStore();
  const uiStore = useUiStore();

  const loadChordToEditor = (chord: Chord) => {
    editorStore.editingId = chord.id;
    editorStore.currentChordName = chord.chordName === '未命名' ? '' : chord.chordName;
    editorStore.strings = cloneDeep(toRaw(chord.strings));
    editorStore.fretCount = chord.fretCount ?? 3;
    editorStore.capo = chord.capo ?? 0;
    editorStore.currentTuning = chord.tuning || 'STANDARD';
  };

  const executeGroupToggle = (gid: string) => {
    const target = chordStore.groups.find(g => g.id === gid);
    if (!target) return;

    if (target.collapsed) {
      chordStore.selectedGroupId = gid;
      chordStore.groups.forEach(g => {
        if (g.id !== gid) g.collapsed = true;
      });
    } else if (chordStore.selectedGroupId === gid) {
      chordStore.selectedGroupId = null;
    }
    target.collapsed = !target.collapsed;
  };

  const handleChordSort = (event: SortableEvent, groupId: string) => {
    const { oldIndex, newIndex } = event;
    if (oldIndex === undefined || newIndex === undefined) return;

    const currentGroupChords = chordStore.savedChordsList.filter(c => c.groupId === groupId);
    const [movedChord] = currentGroupChords.splice(oldIndex, 1);
    currentGroupChords.splice(newIndex, 0, movedChord);

    const otherGroupsChords = chordStore.savedChordsList.filter(c => c.groupId !== groupId);
    const updatedList = [...otherGroupsChords, ...currentGroupChords];
    chordStore.overwriteChords(updatedList);
  };

  const triggerDeleteChord = (chord: Chord) => {
    const updatedList = chordStore.savedChordsList.filter(c => c.id !== chord.id);
    chordStore.overwriteChords(updatedList);
    uiStore.showToast(`已删除和弦 "${chord.chordName}"`, true);
  };

  const exportFretboardImage = async (
    target: HTMLElement | Ref<HTMLElement | null | undefined> | null | undefined,
    isTransparent: boolean = true
  ) => {
    if (uiStore.isCopying) return;

    const el = unref(target);

    if (!el) {
      uiStore.showToast('导出失败：指板 DOM 节点尚未渲染完成', false, 'error');
      return;
    }

    uiStore.isCopying = true;
    uiStore.showToast(isTransparent ? '正在导出透明底色快照...' : '正在导出带卡片背景快照...');

    try {
      await copyElementToClipboard(el, isTransparent);
      uiStore.showToast('成功复制至系统剪贴板');
    } catch (err) {
      console.error('Fretboard Exporter Error:', err);
      uiStore.showToast('导出失败：当前浏览器内核环境受限');
    } finally {
      uiStore.isCopying = false;
    }
  };

  const persistCurrentChord = () => {
    const cleanName = editorStore.currentChordName.trim();
    if (!cleanName || editorStore.isFretBoardEmpty) {
      uiStore.showToast('保存失败：请输入名称并指定指板有效音符');
      return;
    }

    const targetGroupId = editorStore.editingId
      ? chordStore.savedChordsList.find(c => c.id === editorStore.editingId)?.groupId || chordStore.selectedGroupId
      : chordStore.selectedGroupId;

    const payload: Chord = {
      id: editorStore.editingId || 'c_' + crypto.randomUUID().slice(0, 10),
      chordName: cleanName,
      strings: cloneDeep(toRaw(editorStore.strings)),
      fretCount: editorStore.fretCount,
      capo: editorStore.capo,
      groupId: targetGroupId || 'default',
      tuning: editorStore.currentTuning,
    };

    const idx = chordStore.savedChordsList.findIndex(c => c.id === editorStore.editingId);
    if (idx !== -1) {
      chordStore.savedChordsList[idx] = payload;
    } else {
      chordStore.savedChordsList.unshift(payload);
    }

    editorStore.resetEditor();
    uiStore.showToast('和弦已保存');
    uiStore.clearUndoToasts();
  };

  return {
    loadChordToEditor,
    executeGroupToggle,
    handleChordSort,
    triggerDeleteChord,
    exportFretboardImage,
    persistCurrentChord,
  };
}
