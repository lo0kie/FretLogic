import { calcNoteLabel, extractRootNote } from '@/utils/musicTheory';
import { useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export interface Chord {
  id: number;
  chordName: string;
  selectedFrets: number[];
  fretCount: number;
  capo: number;
  groupId: string;
  rootMark: number;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export const useChordLabStore = defineStore('chordLab', () => {
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  // 核心持久化资产
  const savedChordsList = useStorage<Chord[]>('CHORD_LAB_LIST_V4', []);
  const groups = useStorage<Group[]>('CHORD_LAB_GROUPS', [{ id: 'default', name: '默认分组', collapsed: false }]);

  // 工作区核心状态
  const currentChordName = useStorage('CHORD_LAB_CURR_NAME_V1', '');
  const selectedFrets = useStorage<number[]>('CHORD_LAB_CURR_FRETS_V1', [-1, -1, -1, -1, -1, -1]);
  const fretCount = useStorage('CHORD_LAB_CURR_FCOUNT_V1', 3);
  const capo = useStorage('CHORD_LAB_CURR_CAPO_V1', 0);
  const rootMark = useStorage<number>('CHORD_LAB_CURR_ROOT_MARK_V1', -1);

  const editingId = useStorage<number | null>('CHORD_LAB_EDITING_ID', null);
  const selectedGroupId = useStorage<string | null>('CHORD_LAB_CURR_GROUP_ID_V1', null);

  const isDraggingFinger = ref(false);
  const lastPos = ref('');

  const getGroupChords = (gid: string): Chord[] => {
    return savedChordsList.value.filter(chord => chord.groupId === gid);
  };

  const isFretBoardEmpty = computed(() => {
    return selectedFrets.value.every(fret => (fret ?? -1) < 0);
  });

  // 🌟 核心新增：为主根音正则匹配加一层常驻 Computed 隔离屏障，防止指板滑动时反复执行正则推演
  const currentRootNote = computed(() => {
    return extractRootNote(currentChordName.value);
  });

  // 衍生计算：指板 UI 状态
  const openStringsUIState = computed(() => {
    // 🌟 直接消费提取好的缓存资产，拒绝高频重复计算
    const currentRoot = currentRootNote.value;

    return selectedFrets.value.map((fretVal, sIdx) => {
      const calcFret = fretVal === -1 ? 0 : fretVal;
      const noteLabel = calcNoteLabel(sIdx, calcFret, capo.value);
      const hasManualRoot =
        rootMark.value !== null && rootMark.value !== undefined && rootMark.value >= 0 && rootMark.value <= 5;

      let isRoot = false;
      if (hasManualRoot) {
        isRoot = rootMark.value === sIdx;
      } else {
        isRoot = !!(currentRoot && calcNoteLabel(sIdx, 0, capo.value).toUpperCase() === currentRoot);
      }

      let type: 'muted' | 'root' | 'open' | 'normal' = 'normal';
      if (fretVal === -1) type = 'muted';
      else if (fretVal === 0) type = isRoot ? 'root' : 'open';

      return { fretVal, noteLabel, type };
    });
  });

  const handleChordClick = (chord: Chord) => {
    editingId.value = chord.id;
    currentChordName.value = chord.chordName === '未命名' ? '' : chord.chordName;
    selectedFrets.value = [...chord.selectedFrets];
    fretCount.value = chord.fretCount ?? 3;
    capo.value = chord.capo ?? 0;
    rootMark.value = chord.rootMark !== undefined ? chord.rootMark : -1;
  };

  const resetEditor = () => {
    editingId.value = null;
    selectedFrets.value = [-1, -1, -1, -1, -1, -1];
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    rootMark.value = -1;
  };

  const toggleOpenString = (sIdx: number) => {
    const currentFretVal = selectedFrets.value[sIdx];
    if (currentFretVal > 0) selectedFrets.value[sIdx] = 0;
    else if (currentFretVal === 0) {
      selectedFrets.value[sIdx] = -1;
      if (rootMark.value === sIdx) rootMark.value = -1;
    } else selectedFrets.value[sIdx] = 0;
  };

  const handleGroupHeaderClick = (gid: string) => {
    const target = groups.value.find(g => g.id === gid);
    if (target) {
      if (target.collapsed) {
        selectedGroupId.value = gid;
        groups.value.forEach(g => {
          if (g.id !== gid) g.collapsed = true;
        });
      } else if (selectedGroupId.value === gid) {
        selectedGroupId.value = null;
      }
      target.collapsed = !target.collapsed;
    }
  };

  if (editingId.value) {
    const original = savedChordsList.value.find(c => c.id == editingId.value);
    if (original) {
      currentChordName.value = original.chordName === '未命名' ? '' : original.chordName;
      selectedFrets.value = [...original.selectedFrets];
      fretCount.value = original.fretCount ?? 3;
      capo.value = original.capo ?? 0;
      rootMark.value = original.rootMark !== undefined ? original.rootMark : -1;
    } else {
      editingId.value = null;
    }
  }

  return {
    savedChordsList,
    groups,
    isDarkMode,
    currentChordName,
    selectedFrets,
    fretCount,
    capo,
    editingId,
    selectedGroupId,
    isDraggingFinger,
    lastPos,
    rootMark,
    isFretBoardEmpty,
    currentRootNote, // 抛出隔离后的根音缓存
    openStringsUIState,
    getGroupChords,
    toggleOpenString,
    resetEditor,
    handleChordClick,
    handleGroupHeaderClick,
  };
});
