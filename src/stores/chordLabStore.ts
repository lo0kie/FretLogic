import { calcNoteLabel, extractRootNote } from '@/utils/musicTheory';
import { useDark, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

// 严格的和弦资产类型声明
export interface Chord {
  id: number;
  chordName: string;
  selectedFrets: number[];
  fretCount: number;
  capo: number;
  groupId: string;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export const useChordLabStore = defineStore('chordLab', () => {
  // 1. 系统底层主题基础设施
  const isDarkMode = useDark({ attribute: 'class', valueDark: 'dark', valueLight: '' });

  // 2. 核心持久化资产数据
  const savedChordsList = useStorage<Chord[]>('CHORD_LAB_LIST_V3', []);
  const groups = useStorage<Group[]>('CHORD_LAB_GROUPS', [{ id: 'default', name: '默认分组', collapsed: false }]);

  // 3. 当前工作区编辑器快照状态
  const currentChordName = useStorage('CHORD_LAB_CURR_NAME_V1', '');
  const selectedFrets = useStorage<number[]>('CHORD_LAB_CURR_FRETS_V1', [-1, -1, -1, -1, -1, -1]);
  const fretCount = useStorage('CHORD_LAB_CURR_FCOUNT_V1', 3);
  const capo = useStorage('CHORD_LAB_CURR_CAPO_V1', 0);
  const editingId = useStorage<number | null>('CHORD_LAB_CURR_EDIT_ID_V1', null);
  const selectedGroupId = useStorage<string | null>('CHORD_LAB_CURR_GROUP_ID_V1', null);

  // 4. 指板物理编辑手势临时状态
  const isDraggingFinger = ref(false);
  const lastPos = ref('');

  // --- Getters 衍生状态计算 ---
  const chordsGroupMap = computed(() => {
    const map = new Map<string, Chord[]>();
    savedChordsList.value.forEach(chord => {
      if (!map.has(chord.groupId)) map.set(chord.groupId, []);
      map.get(chord.groupId)!.push(chord);
    });
    return map;
  });

  const getGroupChords = (gid: string): Chord[] => chordsGroupMap.value.get(gid) || [];

  // 计算指板顶部悬浮空弦/静音圈的全局高亮映射
  const openStringsUIState = computed(() => {
    const currentRoot = extractRootNote(currentChordName.value);
    return selectedFrets.value.map((fretVal, sIdx) => {
      const noteLabel = calcNoteLabel(sIdx, fretVal, capo.value);
      const isRoot = currentRoot && calcNoteLabel(sIdx, 0, capo.value).toUpperCase() === currentRoot;

      // 🌟 架构解耦修正：只对外输出纯粹的乐理状态，彻底移除 var() 样式污染
      let type: 'muted' | 'root' | 'open' | 'normal' = 'normal';
      if (fretVal === -1) {
        type = 'muted';
      } else if (fretVal === 0) {
        type = isRoot ? 'root' : 'open';
      }

      return { fretVal, noteLabel, type };
    });
  });

  // --- Actions 核心业务方法 ---
  const toggleOpenString = (i: number) => {
    selectedFrets.value[i] = selectedFrets.value[i] === 0 ? -1 : 0;
  };

  const resetEditor = () => {
    editingId.value = null;
    selectedFrets.value = [-1, -1, -1, -1, -1, -1];
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
  };

  const handleChordClick = (c: Chord) => {
    editingId.value = c.id;
    currentChordName.value = c.chordName === '未命名' ? '' : c.chordName;
    selectedFrets.value = [...c.selectedFrets];
    fretCount.value = c.fretCount ?? 3;
    capo.value = c.capo ?? 0;
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

  // 保底初始化
  if (!selectedGroupId.value && groups.value.length > 0) {
    selectedGroupId.value = groups.value[0].id;
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
    openStringsUIState,
    getGroupChords,
    toggleOpenString,
    resetEditor,
    handleChordClick,
    handleGroupHeaderClick,
  };
});
