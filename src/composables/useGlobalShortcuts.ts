import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { useModal } from '@/composables/useModal';
import { useChordService } from '@/services/useChordService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import { useEventListener } from '@vueuse/core';

export function useGlobalShortcuts() {
  const chordStore = useChordStore();
  const uiStore = useUiStore();
  const chordService = useChordService();
  const modal = useModal();
  const { isPlaying, playCurrentChord } = useAudioPlayer();
  const editorStore = useEditorStore();

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') return;

    if (modal.modalShow.value) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      chordService.persistCurrentChord();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      uiStore.executeUndoRestore();
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (!editorStore.isFretBoardEmpty && !isPlaying.value) {
        playCurrentChord();
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && editorStore.editingId) {
      e.preventDefault();
      const target = chordStore.savedChordsList.find(c => c.id === editorStore.editingId);
      if (target) {
        chordService.triggerDeleteChord(target);
        editorStore.resetEditor();
      }
    }
  });
}
