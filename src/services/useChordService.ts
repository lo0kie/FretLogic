import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types/chord';
import { copyElementToClipboard } from '@/utils/domExporter';
import { nextTick, toRaw } from 'vue';

export function useChordService() {
  const chordStore = useChordLabStore();
  const uiStore = useUiStore();

  /**
   * 🌟 领域动作 1：恢复高内聚实体模型载入编辑器沙盒
   */
  const loadChordToEditor = (chord: Chord) => {
    chordStore.editingId = chord.id;
    chordStore.currentChordName = chord.chordName === '未命名' ? '' : chord.chordName;
    chordStore.strings = structuredClone(toRaw(chord.strings)); // 🚀 单一出口深拷贝
    chordStore.fretCount = chord.fretCount ?? 3;
    chordStore.capo = chord.capo ?? 0;
    chordStore.currentTuning = chord.tuning || 'STANDARD';
  };

  /**
   * 🌟 领域动作 2：处理分组头部的点击推开折叠，加装平滑滚动对齐
   */
  const executeGroupToggle = (gid: string) => {
    const target = chordStore.groups.find(g => g.id === gid);
    if (!target) return;

    if (target.collapsed) {
      chordStore.selectedGroupId = gid;
      chordStore.groups.forEach(g => {
        if (g.id !== gid) g.collapsed = true;
      });
      nextTick(() => {
        document.getElementById(`group-${gid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    } else if (chordStore.selectedGroupId === gid) {
      chordStore.selectedGroupId = null;
    }
    target.collapsed = !target.collapsed;
  };

  /**
   * 🌟 领域动作 3：排序后基于 $O(1)$ 字典同步覆盖本地和弦物理序列
   */
  const handleChordSort = (event: any, groupId: string) => {
    const { oldIndex, newIndex } = event;
    if (oldIndex === undefined || newIndex === undefined) return;

    const currentGroupChords = chordStore.savedChordsList.filter(c => c.groupId === groupId);
    const [movedChord] = currentGroupChords.splice(oldIndex, 1);
    currentGroupChords.splice(newIndex, 0, movedChord);

    const otherGroupsChords = chordStore.savedChordsList.filter(c => c.groupId !== groupId);
    chordStore.overwriteChords([...otherGroupsChords, ...currentGroupChords]);
  };

  /**
   * 🌟 领域动作 4：基于实体更迭触发带撤回线索的物理销毁
   */
  const triggerDeleteChord = (chord: Chord) => {
    chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.id !== chord.id));
    uiStore.showToast(`🗑️ 已删除和弦 "${chord.chordName}"`, true);
  };

  /**
   * 🌟 领域动作 5：多维快照生成与异步剪贴板流分发
   */
  const exportFretboardImage = async (selector: string, isTransparent: boolean = true) => {
    if (uiStore.isCopying) return;
    uiStore.isCopying = true;
    uiStore.showToast(isTransparent ? '📸 正在导出透明底色快照...' : '📸 正在导出带卡片背景快照...');

    try {
      await copyElementToClipboard(selector, isTransparent);
      uiStore.showToast('✅ 成功复制至系统剪贴板');
    } catch (err) {
      console.error('Fretboard Exporter Error:', err);
      uiStore.showToast('❌ 导出失败：当前浏览器内核环境受限');
    } finally {
      uiStore.isCopying = false;
    }
  };

  /**
   * 🌟 领域动作 6：铁腕清洗并封存编辑器当前配置实体
   */
  const persistCurrentChord = () => {
    const cleanName = chordStore.currentChordName.trim();
    if (!cleanName || chordStore.isFretBoardEmpty) {
      uiStore.showToast('❌ 保存失败：请输入名称并指定指板有效音符');
      return;
    }

    const targetGroupId = chordStore.editingId
      ? chordStore.savedChordsList.find(c => c.id === chordStore.editingId)?.groupId || chordStore.selectedGroupId
      : chordStore.selectedGroupId;

    const payload: Chord = {
      id: chordStore.editingId || 'c_' + crypto.randomUUID().slice(0, 10),
      chordName: cleanName,
      strings: structuredClone(toRaw(chordStore.strings)), // 🚀 打包物理弦结构
      fretCount: chordStore.fretCount,
      capo: chordStore.capo,
      groupId: targetGroupId || 'default',
      tuning: chordStore.currentTuning,
    };

    const idx = chordStore.savedChordsList.findIndex(c => c.id === chordStore.editingId);
    if (idx !== -1) {
      chordStore.savedChordsList[idx] = payload;
    } else {
      chordStore.savedChordsList.unshift(payload);
    }

    chordStore.resetEditor();
    uiStore.showToast('👍 和弦已完美封存');
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
