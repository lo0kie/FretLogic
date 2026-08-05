import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { computeChordFingerprint, computeIsInverted } from '@/utils/musicTheory';
import { generateUUID } from '@/utils/validators';
import { toRaw } from 'vue';
import { SortableEvent } from 'vue-draggable-plus';

export function useChordActions() {
  const chordStore = useChordStore();
  const editorStore = useEditorStore();
  const uiStore = useUiStore();
  const songStore = useSongStore();

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

    // 🌟 统一调用 songStore API 进行清理，不再手写嵌套遍历
    songStore.unbindChordIds(targetIds);

    if (editorStore.editingId && chords.some(c => c.id === editorStore.editingId)) {
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

  const persistCurrentChord = () => {
    const cleanName = editorStore.currentChordName.trim();

    if (!cleanName || editorStore.isFretBoardEmpty) {
      uiStore.toast.warning('保存失败：请输入名称并指定指板有效音符');
      return;
    }

    if (!chordStore.selectedGroupId) {
      uiStore.toast.warning('保存失败：请先展开或选择一个目标分组');
      return;
    }

    const targetGroupId = editorStore.editingId
      ? chordStore.savedChordsList.find(c => c.id === editorStore.editingId)?.groupId || chordStore.selectedGroupId
      : chordStore.selectedGroupId;

    const currentStrings = cloneDeep(toRaw(editorStore.strings));

    const isInvertedState = computeIsInverted(currentStrings, editorStore.capo, editorStore.currentTuning, cleanName);

    const rawPayload: Omit<Chord, 'fingerprint'> = {
      id: editorStore.editingId || 'c_' + generateUUID().slice(0, 10),
      chordName: cleanName,
      strings: currentStrings,
      fretCount: editorStore.fretCount,
      capo: editorStore.capo,
      groupId: targetGroupId,
      tuning: editorStore.currentTuning,
      isInverted: isInvertedState,
    };

    const newFingerprint = computeChordFingerprint(rawPayload);
    const payload: Chord = {
      ...rawPayload,
      fingerprint: newFingerprint,
    };

    const isDuplicate = chordStore.savedChordsList.some(
      existing => existing.id !== editorStore.editingId && existing.fingerprint === newFingerprint
    );

    if (isDuplicate) {
      uiStore.toast.warning(`保存失败：该分组下已存在一模一样的和弦 "${cleanName}"`);
      return;
    }

    const idx = chordStore.savedChordsList.findIndex(c => c.id === editorStore.editingId);
    if (idx !== -1) {
      chordStore.savedChordsList[idx] = payload;
    } else {
      chordStore.savedChordsList.unshift(payload);
    }

    editorStore.resetEditor();
    uiStore.toast.success('和弦已保存');
    uiStore.clearActionToasts();
  };

  return {
    loadChordToEditor,
    executeGroupToggle,
    handleChordSort,
    triggerDeleteChord,
    triggerDeleteChords,
    persistCurrentChord,
  };
}
