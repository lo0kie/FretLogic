import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group } from '@/types';
import { cloneDeep } from '@/utils/cloneDeep';
import { generateUUID } from '@/utils/id';
import { computeChordFingerprint, computeIsInverted } from '@/utils/musicTheory';
import { toRaw } from 'vue';
import { SortableEvent } from 'vue-draggable-plus';

export function useChordActions() {
  const chordStore = useChordStore();
  const editorStore = useEditorStore();
  const uiStore = useUiStore();
  const songStore = useSongStore();

  const loadChordToEditor = (chord: Chord) => {
    editorStore.setEditor(chord);
  };

  const executeGroupToggle = (group: Group) => {
    if (group.collapsed) {
      chordStore.selectedGroupId = group.id;
      chordStore.collapseAllGroups();
      group.collapsed = false;
    } else {
      chordStore.selectedGroupId = null;
      group.collapsed = true;
    }

    if (!editorStore.isCreating) editorStore.resetEditor();
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

  const triggerDeleteChords = (chords: Chord[]) => {
    if (chords.length === 0) return;

    const songsSnapshot = cloneDeep(songStore.songs);

    const targetIds = new Set<string>();
    chords.forEach(c => {
      if (c.id) targetIds.add(c.id);
      if (c.fingerprint) targetIds.add(c.fingerprint);
    });

    const updatedList = chordStore.savedChordsList.filter(c => !targetIds.has(c.id));
    chordStore.overwriteChords(updatedList);

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
        uiStore.toast.success('已恢复刚才删除的和弦及谱面绑定');
      },
    });
  };

  const triggerDeleteChord = (chord: Chord) => {
    triggerDeleteChords([chord]);
  };

  const prepareChordPayload = (): { payload: Chord; cleanName: string } | null => {
    const cleanName = editorStore.draftChord.chordName.trim();

    if (!cleanName || editorStore.isFretBoardEmpty) {
      uiStore.toast.warning('保存失败：请输入名称并指定指板有效音符');
      return null;
    }

    if (!chordStore.selectedGroupId) {
      uiStore.toast.warning('保存失败：请先展开或选择一个目标分组');
      return null;
    }

    const id = editorStore.isEditing ? editorStore.draftChord.id : null;
    const targetGroupId = editorStore.isEditing
      ? chordStore.savedChordsList.find(c => c.id === id)?.groupId || chordStore.selectedGroupId
      : chordStore.selectedGroupId;

    const currentStrings = cloneDeep(toRaw(editorStore.draftChord.strings));
    const isInvertedState = computeIsInverted(
      currentStrings,
      editorStore.draftChord.capo,
      editorStore.draftChord.tuning,
      cleanName
    );

    const rawPayload: Omit<Chord, 'fingerprint'> = {
      id: id || 'c_' + generateUUID().slice(0, 10),
      chordName: cleanName,
      strings: currentStrings,
      fretCount: editorStore.draftChord.fretCount,
      capo: editorStore.draftChord.capo,
      groupId: targetGroupId,
      tuning: editorStore.draftChord.tuning,
      isInverted: isInvertedState,
    };

    return {
      cleanName,
      payload: {
        ...rawPayload,
        fingerprint: computeChordFingerprint(rawPayload),
      },
    };
  };

  const createChord = () => {
    const prepared = prepareChordPayload();
    if (!prepared) return;

    const isDuplicate = chordStore.savedChordsList.some(
      existing => existing.groupId === prepared.payload.groupId && existing.fingerprint === prepared.payload.fingerprint
    );

    if (isDuplicate) {
      uiStore.toast.warning(`保存失败：该分组下已存在一模一样的和弦 "${prepared.cleanName}"`);
      return;
    }

    chordStore.overwriteChords([prepared.payload, ...chordStore.savedChordsList]);
    editorStore.resetEditor();
    uiStore.toast.success('和弦已保存');
    uiStore.clearActionToasts();
  };

  const updateChord = () => {
    if (!editorStore.isEditing) return;
    const id = editorStore.draftChord.id;

    const prepared = prepareChordPayload();
    if (!prepared) return;

    const isDuplicate = chordStore.savedChordsList.some(
      existing =>
        existing.id !== id &&
        existing.groupId === prepared.payload.groupId &&
        existing.fingerprint === prepared.payload.fingerprint
    );

    if (isDuplicate) {
      uiStore.toast.warning(`保存失败：该分组下已存在一模一样的和弦 "${prepared.cleanName}"`);
      return;
    }

    const idx = chordStore.savedChordsList.findIndex(c => c.id === id);
    if (idx !== -1) {
      const newList = [...chordStore.savedChordsList];
      newList[idx] = prepared.payload;
      chordStore.overwriteChords(newList);
    }

    editorStore.resetEditor();
    uiStore.toast.success('和弦已更新');
    uiStore.clearActionToasts();
  };

  const persistCurrentChord = () => {
    if (editorStore.isEditing) {
      updateChord();
    } else {
      createChord();
    }
  };

  const saveAsNewChord = () => {
    editorStore.saveAsNewChord();
    uiStore.toast.info('已转为新建模式，请选择目标分组后保存');
  };

  return {
    loadChordToEditor,
    executeGroupToggle,
    handleChordSort,
    triggerDeleteChord,
    triggerDeleteChords,
    createChord,
    updateChord,
    persistCurrentChord,
    saveAsNewChord,
  };
}
