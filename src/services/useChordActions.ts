import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import type { SortableEvent } from 'vue-draggable-plus';

export function useChordActions() {
  const chordStore = useChordStore();
  const editorStore = useEditorStore();
  const uiStore = useUiStore();
  const songStore = useSongStore();

  const loadChordToEditor = (chord: Chord) => {
    editorStore.setEditor(chord);
  };

  const executeGroupToggle = (group: Group) => {
    chordStore.toggleGroupCollapsed(group.id);
    if (!editorStore.isCreating) editorStore.resetEditor();
  };

  const handleChordSort = (event: SortableEvent, groupId: string) => {
    const { oldIndex, newIndex } = event;
    if (oldIndex === undefined || newIndex === undefined) return;
    chordStore.reorderGroupChords(groupId, oldIndex, newIndex);
  };

  const triggerDeleteChords = (chords: Chord[]) => {
    if (chords.length === 0) return;

    const songsSnapshot = cloneDeep(songStore.songs);
    const targetIds = chordStore.removeChords(chords);
    songStore.unbindChordIds(targetIds);

    if (editorStore.isEditing && chords.some(c => c.id === editorStore.draftChord.id)) {
      editorStore.resetEditor();
    }

    uiStore.toast.info(`已删除 ${chords.length} 个指法`, {
      actionText: '撤销',
      duration: 4000,
      onAction: () => {
        chordStore.executeUndoRestore();
        songStore.overwriteSongs(songsSnapshot);
        uiStore.toast.success('已恢复刚才删除的和弦');
      },
    });
  };

  const triggerDeleteChord = (chord: Chord) => {
    triggerDeleteChords([chord]);
  };

  const persistCurrentChord = () => {
    const result = chordStore.buildChordForSave(editorStore.draftChord, editorStore.isEditing);

    if (!result.ok) {
      if (result.reason === 'DUPLICATE_FINGERPRINT') {
        uiStore.toast.warning(`保存失败：该分组下已存在一模一样的和弦 "${result.cleanName}"`);
      } else if (result.reason === 'EMPTY_NAME') {
        uiStore.toast.warning('保存失败：请输入名称并指定指板有效音符');
      } else if (result.reason === 'NO_GROUPS') {
        uiStore.toast.warning('保存失败：请先新建分组');
      } else if (result.reason === 'NO_SELECTED_GROUP') {
        uiStore.isLeftOpen = true;
        uiStore.toast.warning('保存失败：请先选择目标分组');
      }
      return;
    }

    if (editorStore.isEditing) {
      chordStore.updateChord(result.payload);
      uiStore.toast.success('和弦已更新');
    } else {
      chordStore.addChord(result.payload);
      uiStore.toast.success('和弦已保存');
    }

    editorStore.resetEditor();
    uiStore.clearActionToasts();
  };

  const saveAsNewChord = () => {
    editorStore.saveAsNewChord();
    uiStore.toast.info('请选择目标分组后保存');
  };

  return {
    loadChordToEditor,
    executeGroupToggle,
    handleChordSort,
    triggerDeleteChord,
    triggerDeleteChords,
    persistCurrentChord,
    saveAsNewChord,
  };
}
