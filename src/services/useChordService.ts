import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types';
import { cloneDeep } from '@/utils/dataParser';
import { copyElementToClipboard } from '@/utils/domExporter';
import { generateUUID } from '@/utils/validators';
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

    if (uiStore.isMobile) uiStore.isLeftOpen = false;
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

    uiStore.toast.info(`已删除和弦 "${chord.chordName}"`, {
      actionText: '撤销',
      duration: 4000,
      onAction: () => {
        chordStore.executeUndoRestore();
        uiStore.toast.success('已恢复刚才删除的和弦');
      },
    });
  };

  const exportFretboardImage = async (
    target: HTMLElement | Ref<HTMLElement | null | undefined> | null | undefined,
    isTransparent: boolean = true
  ) => {
    if (uiStore.isCopying) return;

    const el = unref(target);

    if (!el) {
      uiStore.toast.error('导出失败：指板 DOM 节点尚未渲染完成');
      return;
    }

    uiStore.isCopying = true;
    uiStore.toast.info(isTransparent ? '正在导出透明底色快照...' : '正在导出带卡片背景快照...');

    try {
      await copyElementToClipboard(el, isTransparent);
      uiStore.toast.success('成功复制至系统剪贴板');
    } catch (err) {
      console.error('Fretboard Exporter Error:', err);
      uiStore.toast.error('导出失败：当前浏览器内核环境受限');
    } finally {
      uiStore.isCopying = false;
    }
  };

  // 1. 物理特征码计算函数
  const computeFingerprint = (chord: Omit<Chord, 'fingerprint'>): string => {
    const strSig = chord.strings.map(s => `${s.fret}_${s.preferFlat ? 1 : 0}_${s.isRoot ? 1 : 0}`).join('|');
    return `${chord.groupId}:${chord.chordName.trim()}:${chord.capo}:${chord.fretCount}:${chord.tuning}:${strSig}`;
  };

  // 2. 获取特征码：若没有，则计算并直接回写给原对象保存！
  const getChordFingerprint = (chord: Chord): string => {
    if (chord.fingerprint) return chord.fingerprint;

    // 🌟 补存逻辑：旧数据第一次读取时计算并持久化赋值
    const fp = computeFingerprint(chord);
    chord.fingerprint = fp;
    return fp;
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

    const rawPayload: Omit<Chord, 'fingerprint'> = {
      id: editorStore.editingId || 'c_' + generateUUID().slice(0, 10),
      chordName: cleanName,
      strings: cloneDeep(toRaw(editorStore.strings)),
      fretCount: editorStore.fretCount,
      capo: editorStore.capo,
      groupId: targetGroupId,
      tuning: editorStore.currentTuning,
    };

    // 3. 计算最新的特征码
    const newFingerprint = computeFingerprint(rawPayload);
    const payload: Chord = {
      ...rawPayload,
      fingerprint: newFingerprint,
    };

    // 4. 比对去重：调用 getChordFingerprint 会自动为没有特征码的旧数据补上并保存
    const isDuplicate = chordStore.savedChordsList.some(
      existing => existing.id !== editorStore.editingId && getChordFingerprint(existing) === newFingerprint
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
    exportFretboardImage,
    persistCurrentChord,
  };
}
