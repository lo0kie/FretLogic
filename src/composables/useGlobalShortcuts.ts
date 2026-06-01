import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { useModal } from '@/composables/useModal';
import { useChordService } from '@/services/useChordService';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { useEventListener } from '@vueuse/core';

export function useGlobalShortcuts() {
  const chordStore = useChordLabStore();
  const uiStore = useUiStore();
  const chordService = useChordService();
  const modal = useModal();
  const { isPlaying, playCurrentChord } = useAudioPlayer();

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    // 🌟 防火墙 1：如果用户正在输入框/文本域里打字，绝对不要劫持快捷键
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') return;

    // 🌟 防火墙 2：如果弹窗正在显示，拦截底层操作
    if (modal.modalShow.value) return;

    // ⌨️ [Ctrl + S] / [Cmd + S]: 沉浸式保存当前修改
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      chordService.persistCurrentChord();
    }

    // ⌨️ [Ctrl + Z] / [Cmd + Z]: 时间回溯，恢复快照
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      uiStore.executeUndoRestore();
    }

    // ⌨️ [Space] 空格键: 一键触发物理级混响试听
    else if (e.code === 'Space') {
      e.preventDefault();
      if (!chordStore.isFretBoardEmpty && !isPlaying.value) {
        playCurrentChord();
      }
    }

    // ⌨️ [Delete] / [Backspace]: 极速删除当前处于编辑态的和弦
    else if ((e.key === 'Delete' || e.key === 'Backspace') && chordStore.editingId) {
      e.preventDefault();
      const target = chordStore.savedChordsList.find(c => c.id === chordStore.editingId);
      if (target) {
        chordService.triggerDeleteChord(target);
        chordStore.resetEditor();
      }
    }
  });
}
