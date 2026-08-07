import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { onBeforeUnmount, ref } from 'vue';

export function useLyricsDragDrop() {
  const scoreEditor = useScoreEditorStore();

  const draggingSlotKey = ref<string | number | null>(null);
  const dragOverSlotKey = ref<string | number | null>(null);

  const setMoveEffect = (e: DragEvent) => {
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleGlobalDragOver = (e: DragEvent) => {
    setMoveEffect(e);
  };

  const handleDragStart = (e: DragEvent, slotKey: string | number) => {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
    draggingSlotKey.value = slotKey;
    document.body.classList.add('is-global-dragging');
  };

  const handleDragOver = (e: DragEvent, slotKey: string | number) => {
    setMoveEffect(e);
    if (dragOverSlotKey.value !== slotKey) {
      dragOverSlotKey.value = slotKey;
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    const currentTarget = e.currentTarget as HTMLElement;
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!currentTarget || !relatedTarget || !currentTarget.contains(relatedTarget)) {
      dragOverSlotKey.value = null;
    }
  };

  const handleDragEnd = () => {
    draggingSlotKey.value = null;
    dragOverSlotKey.value = null;
    document.body.classList.remove('is-global-dragging');
  };

  const handleDrop = (targetSlotKey: string | number) => {
    if (!draggingSlotKey.value || !scoreEditor.activeSong) {
      handleDragEnd();
      return;
    }

    const sourceKey = draggingSlotKey.value;
    if (sourceKey === targetSlotKey) {
      handleDragEnd();
      return;
    }

    scoreEditor.swapSlotChords(sourceKey, targetSlotKey);
    handleDragEnd();
  };

  onBeforeUnmount(() => {
    document.body.classList.remove('is-global-dragging');
  });

  return {
    draggingSlotKey,
    dragOverSlotKey,
    handleGlobalDragOver,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,
  };
}
