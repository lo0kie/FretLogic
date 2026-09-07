import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useUiStore } from '@/platform/store/uiStore';
import { TOAST_WARNING_DURATION_MS } from '@/platform/utils/constants';

import type { Chord, Group } from '@/domains/chord/types';

const warningMessages: Record<string, string> = {
  DUPLICATE_FINGERPRINT: '保存失败：该分组下已存在一模一样的和弦',
  EMPTY_NAME: '保存失败：请输入名称并指定指板有效音符',
  INVALID_CHORD_SYNTAX: '保存失败：和弦格式不合法（如 C、Am7、G7/B）',
  NO_GROUPS: '保存失败：请先新建分组',
  NO_SELECTED_GROUP: '保存失败：请先选择目标分组',
};

/** 和弦实体的通用动作：加载编辑、分组折叠、删除（可撤销）、保存/另存 */
export function useChordActions() {
  const chordStore = useChordStore();
  const editorStore = useChordEditorStore();
  const uiStore = useUiStore();

  /** 把和弦载入指板编辑器 */
  const loadChordToEditor = (chord: Chord) => {
    editorStore.setEditor(chord);
  };

  /**
   * 切换分组折叠/展开：仅在编辑现有和弦、且操作后草稿所属分组不再是当前展开的分组时复位编辑器
   * （折叠本组 / 切到其他组都满足；重新展开本组继续编辑则不受影响）。自由草稿与新建态一律不处理。
   */
  const executeGroupToggle = (group: Group) => {
    chordStore.toggleGroupCollapsed(group.id);
    const draftLeftVisibleGroup =
      editorStore.isEditing && editorStore.draftChord.groupId !== chordStore.expandedGroupId;
    if (draftLeftVisibleGroup) editorStore.resetEditor();
  };

  /** 批量删除指法：乐谱槽位解绑由 chordStore 删除事件经应用层桥接完成，toast 提供 4 秒撤销 */
  const triggerDeleteChords = (chords: Chord[]) => {
    if (chords.length === 0) return;

    chordStore.removeChords(chords);

    if (editorStore.isEditing && chords.some(c => c.id === editorStore.draftChord.id)) {
      editorStore.resetEditor();
    }

    uiStore.toast.info(`已删除 ${chords.length} 个指法`, {
      actionText: '撤销',
      duration: TOAST_WARNING_DURATION_MS,
      onAction: () => {
        // 撤销恢复和弦后，乐谱槽位回填由 chordStore 恢复事件经应用层桥接完成
        chordStore.executeUndoRestore();
        uiStore.toast.success('已恢复刚才删除的和弦');
      },
    });
  };

  /** 删除单个指法（批量删除的单数封装） */
  const triggerDeleteChord = (chord: Chord) => {
    triggerDeleteChords([chord]);
  };

  /** 保存/更新当前编辑草稿：构建校验后的 payload；未变更时仅提示，成功后立即落盘防刷新丢失 */
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
    // 立即落盘（绕过 useStorage 防抖），保证保存后刷新不丢失横按等数据
    chordStore.flushChordsToStorage();

    if (result.warn) {
      uiStore.toast.warning(result.warn);
    }

    editorStore.resetEditor();
    uiStore.clearActionToasts();
  };

  /** 把当前草稿转为「另存为新和弦」模式，提示选择目标分组 */
  const saveAsNewChord = () => {
    editorStore.saveAsNewChord();
    uiStore.toast.info('请选择目标分组后保存');
  };

  return {
    loadChordToEditor,
    executeGroupToggle,
    triggerDeleteChord,
    triggerDeleteChords,
    persistCurrentChord,
    saveAsNewChord,
  };
}
