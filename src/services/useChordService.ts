/**
 * @Author likan
 * @Date 2026-05-31
 * @Filepath fret-logic/src/services/useChordService.ts
 */

import { useChordLabStore } from '@/stores/chordLabStore';
import type { BoolTuple, Chord, FretTuple } from '@/stores/types';
import { useUiStore } from '@/stores/uiStore';
import { copyElementToClipboard } from '@/utils/domExporter'; // 🌟 引入物理 DOM 导出工具
import { nextTick } from 'vue';

export function useChordService() {
  const chordStore = useChordLabStore();
  const uiStore = useUiStore();

  /**
   * 🌟 业务动作 1：加载历史保存的和弦数据回归编辑器沙盒
   */
  const loadChordToEditor = (chord: Chord) => {
    chordStore.editingId = chord.id;
    chordStore.currentChordName = chord.chordName === '未命名' ? '' : chord.chordName;
    chordStore.selectedFrets = [...chord.selectedFrets] as FretTuple;
    chordStore.fretCount = chord.fretCount ?? 3;
    chordStore.capo = chord.capo ?? 0;
    chordStore.rootMark = chord.rootMark ?? -1;
    chordStore.useFlat = chord.useFlat ? ([...chord.useFlat] as BoolTuple) : [false, false, false, false, false, false];
    chordStore.currentTuning = chord.tuning || 'STANDARD';
  };

  /**
   * 🌟 业务动作 2：处理侧边栏分组折叠与独占式推开平滑滚动对齐
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
   * 🌟 业务动作 3：拖拽排序更新完毕后，重排同步本地和弦物理链
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
   * 🌟 业务动作 4：在 Service 中执行铁腕删除并派发带撤销机制的通知
   */
  const triggerDeleteChord = (chord: Chord) => {
    chordStore.overwriteChords(chordStore.savedChordsList.filter(c => c.id !== chord.id));
    uiStore.showToast(`🗑️ 已删除和弦 "${chord.chordName}"`, true);
  };

  /**
   * 🌟 核心补齐 业务动作 5：解耦原 uiStore.copyFretBoardToClipboard [cite: 256]
   * 将画布快照捕获、异步生成二进制流及剪贴板分发收拢至此，并执行严格的状态锁锁死防抖 [cite: 256, 257]
   */
  const exportFretboardImage = async (selector: string, isTransparent: boolean = true) => {
    if (uiStore.isCopying) return; // 🌟 锁死防抖，防止高频点击引发 DOM 渲染层死锁 [cite: 256, 257]

    uiStore.isCopying = true; // 🌟 激活全局高亮等待状态 [cite: 257]
    uiStore.showToast(isTransparent ? '📸 正在导出透明底色快照...' : '📸 正在导出带卡片背景快照...'); // [cite: 257]

    try {
      await copyElementToClipboard(selector, isTransparent); // [cite: 257]
      uiStore.showToast('✅ 成功复制至系统剪贴板'); // [cite: 258]
    } catch (err) {
      console.error('Fretboard Exporter Error:', err);
      uiStore.showToast('❌ 导出失败：当前浏览器内核环境受限'); // [cite: 258]
    } finally {
      uiStore.isCopying = false; // 🌟 物理链路释放 [cite: 259]
    }
  };

  /**
   * 🌟 业务动作 6：清洗当前指板沙盒数据并打包封存入本地
   */
  const persistCurrentChord = () => {
    const cleanName = chordStore.currentChordName.trim();
    if (!cleanName || chordStore.isFretBoardEmpty) {
      uiStore.showToast('❌ 保存失败：请输入名称并指定指板有效音符');
      return;
    }

    const targetGroupId = chordStore.editingId
      ? chordStore.savedChordsList.find(c => c.id == chordStore.editingId)?.groupId || chordStore.selectedGroupId
      : chordStore.selectedGroupId;

    const payload: Chord = {
      id: chordStore.editingId || 'c_' + crypto.randomUUID().slice(0, 10),
      chordName: cleanName,
      selectedFrets: [...chordStore.selectedFrets] as FretTuple,
      fretCount: chordStore.fretCount,
      capo: chordStore.capo,
      groupId: targetGroupId || 'default',
      rootMark: chordStore.rootMark,
      useFlat: [...chordStore.useFlat] as BoolTuple,
      tuning: chordStore.currentTuning,
    };

    const idx = chordStore.savedChordsList.findIndex(c => c.id == chordStore.editingId);
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
    exportFretboardImage, // 🌟 暴露全新的快照分发服务
    persistCurrentChord,
  };
}
