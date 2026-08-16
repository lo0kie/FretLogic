import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import type { SortableEvent } from 'vue-draggable-plus';

const warningMessages: Record<string, string> = {
  DUPLICATE_FINGERPRINT: '保存失败：该分组下已存在一模一样的和弦',
  EMPTY_NAME: '保存失败：请输入名称并指定指板有效音符',
  NO_GROUPS: '保存失败：请先新建分组',
  NO_SELECTED_GROUP: '保存失败：请先选择目标分组',
};

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
      if (result.reason === 'UNCHANGED') {
        const targetGroup = chordStore.groups.find(g => g.id === editorStore.draftChord.groupId);
        const groupTip = !uiStore.isLeftOpen && targetGroup ? `至分组 "${targetGroup.name}"` : '';
        uiStore.toast.success(`和弦已更新${groupTip}`);
        editorStore.resetEditor();
        uiStore.clearActionToasts();
        return;
      }

      if (result.reason === 'NO_SELECTED_GROUP' && uiStore.isMobile) {
        uiStore.isLeftOpen = true;
      }

      const msg = warningMessages[result.reason];
      if (msg) uiStore.toast.warning(msg);
      return;
    }

    const targetGroup = chordStore.groups.find(g => g.id === result.payload.groupId);
    const groupTip = !uiStore.isLeftOpen && targetGroup ? `至分组 "${targetGroup.name}"` : '';

    if (editorStore.isEditing) {
      chordStore.updateChord(result.payload);
      uiStore.toast.success(`和弦已更新${groupTip}`);
    } else {
      chordStore.addChord(result.payload);
      uiStore.toast.success(`和弦已保存${groupTip}`);
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
