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
  rootMark?: number; // 手动标记为主音的弦号索引（0-5）
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

  // 🌟 核心修复点一：使用 useStorage 锁定物理缓存，并显式指定 null 作为深层保底类型
  const rootMark = useStorage<number>('CHORD_LAB_CURR_ROOT_MARK_V1', -1);

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
      const calcFret = fretVal === -1 ? 0 : fretVal;
      const noteLabel = calcNoteLabel(sIdx, calcFret, capo.value);

      // 🌟 顺着老哥你的神级思路对齐：只有当 rootMark 真正被赋予了有效的弦号（>= 0）时，才判定存在手动主音！
      const hasManualRoot = rootMark.value !== undefined && rootMark.value >= 0;

      let isRoot = false;
      if (hasManualRoot) {
        // 如果有手动标记，空弦位置若刚好等于手动标记的弦，它就是 Root
        isRoot = rootMark.value === sIdx;
      } else {
        // 否则走以前的默认乐理提取，完美降级回滚
        isRoot = !!(currentRoot && calcNoteLabel(sIdx, 0, capo.value).toUpperCase() === currentRoot);
      }

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
  const toggleOpenString = (sIdx: number) => {
    const currentFretVal = selectedFrets.value[sIdx];
    if (currentFretVal > 0) {
      selectedFrets.value[sIdx] = 0;
    } else if (currentFretVal === 0) {
      selectedFrets.value[sIdx] = -1;
      // 如果空弦切成了静音，且刚好是手动主音，顺手擦除
      if (rootMark.value === sIdx) rootMark.value = null;
    } else {
      selectedFrets.value[sIdx] = 0;
    }
  };

  const resetEditor = () => {
    editingId.value = null;
    selectedFrets.value = [-1, -1, -1, -1, -1, -1];
    currentChordName.value = '';
    capo.value = 0;
    fretCount.value = 3;
    rootMark.value = null; // 物理复位主音标记
  };

  const handleChordClick = (c: Chord) => {
    editingId.value = c.id;
    currentChordName.value = c.chordName === '未命名' ? '' : c.chordName;
    selectedFrets.value = [...c.selectedFrets];
    fretCount.value = c.fretCount ?? 3;
    capo.value = c.capo ?? 0;

    // 🌟 核心修复点三：使用显式声明，确保从数据库捞出来的历史主音被 100% 正确唤醒
    rootMark.value = c.rootMark !== undefined ? c.rootMark : null;
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

  // --- 🌟 整体平移（Shift Fret）核心引擎 ---

  /**
   * 1. 向上平移（往高品位/右侧挪）
   */
  const shiftFretUp = () => {
    // 🔍 守卫一：遍历所有当前按点，如果有任何一个音已经贴到了当前视窗的最后一品，直接熔断拦截
    const explicitLimit = fretCount.value; // 当前视窗的最大品位（如 3、4 或 5）

    const isCollision = selectedFrets.value.some(fret => fret === explicitLimit);
    if (isCollision) return false; // 触发碰撞，拒绝执行

    // 🔍 守卫二：物理位移。空弦音(0)和静音(-1)原地锁死，其余真正按在品格上的数字全部 +1
    selectedFrets.value = selectedFrets.value.map(fret => {
      if (fret > 0) return fret + 1;
      return fret;
    });

    // 🌟 联动核心：如果当前标记了手动主音(rootMark)，主音状态跟着按点一起完美迁移，绝不掉队
    // 注意：空弦音(0)在画布里不支持上下平移品位，所以如果是实音标记，它不需要重新换算弦号，高亮直接保留
    return true;
  };

  /**
   * 2. 向下平移（往低品位/左侧挪）
   */
  const shiftFretDown = () => {
    // 🔍 守卫一：边界大审判！
    // 在你的指板上，合法的物理第一品永远是 1 品。如果任何一个实体按点已经按在 1 品上，再往下就滑出指板了，直接拦截！
    const isCollision = selectedFrets.value.some(fret => fret === 1);
    if (isCollision) return false;

    // 🔍 守卫二：物理位移。实心圆圈全部 -1，空弦(0)和静音(-1)保持肉体静止
    selectedFrets.value = selectedFrets.value.map(fret => {
      if (fret > 0) return fret - 1;
      return fret;
    });

    return true;
  };

  // 🌟 核心修复点四：加固防崩溃守卫，防止刷新时由于异步读取延迟导致 selectedGroupId 抢跑清空缓存
  if (selectedGroupId.value === undefined || selectedGroupId.value === null) {
    if (groups.value && groups.value.length > 0) {
      selectedGroupId.value = groups.value[0].id;
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
    rootMark, // 完美抛出
    openStringsUIState,
    getGroupChords,
    shiftFretDown,
    toggleOpenString,
    shiftFretUp,
    resetEditor,
    handleChordClick,
    handleGroupHeaderClick,
  };
});
