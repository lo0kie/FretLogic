import { useChordLabStore } from '@/stores/chordLabStore';
import type { Toast, ToastType } from '@/types';
import { useRefHistory, useToggle } from '@vueuse/core';
import { defineStore } from 'pinia';
import { nextTick, ref, toRaw, toRef } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const chordStore = useChordLabStore();
  const savedChordsRef = toRef(chordStore, 'savedChordsList');

  const { undo: rawUndo } = useRefHistory(savedChordsRef, {
    capacity: 10,
    clone: v => structuredClone(toRaw(v.map(toRaw))),
    deep: true,
  });

  const toasts = ref<Toast[]>([]);
  const isLeftOpen = ref(true);
  const isRightOpen = ref(true);
  const isCopying = ref(false);
  const isCapoOpen = ref(false);
  const toggleCapoPanel = useToggle(isCapoOpen);

  const clearUndoToasts = () => {
    toasts.value = toasts.value.filter(t => !t.canUndo);
  };

  const showToast = (msg: string, canUndo = false, type: ToastType = 'info') => {
    const id = performance.now();
    if (canUndo) clearUndoToasts();
    toasts.value.push({ id, msg, type, canUndo });
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id);
    }, 3000);
  };

  const promiseToast = async <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ): Promise<T> => {
    const id = performance.now();
    toasts.value.push({ id, msg: messages.loading, type: 'loading' });

    try {
      const res = await promise;
      const target = toasts.value.find(t => t.id === id);
      if (target) {
        target.msg = messages.success;
        target.type = 'success';
      }
      setTimeout(() => {
        toasts.value = toasts.value.filter(x => x.id !== id);
      }, 3000);
      return res;
    } catch (err) {
      const target = toasts.value.find(t => t.id === id);
      if (target) {
        target.msg = messages.error;
        target.type = 'error';
      }
      setTimeout(() => {
        toasts.value = toasts.value.filter(x => x.id !== id);
      }, 3500);
      throw err;
    }
  };

  const executeUndoRestore = () => {
    rawUndo();
    const validGroupIds = new Set(chordStore.groups.map(g => g.id));
    let hasOrphans = false;
    chordStore.savedChordsList.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) hasOrphans = true;
    });

    if (hasOrphans) {
      let targetGroupId = chordStore.selectedGroupId || chordStore.groups[0]?.id || null;
      if (!targetGroupId) {
        targetGroupId = 'g_recovery_' + crypto.randomUUID().slice(0, 8);
        chordStore.groups.forEach(g => {
          g.collapsed = true;
        });
        chordStore.groups.unshift({ id: targetGroupId, name: '已恢复的和弦', collapsed: false });
        chordStore.selectedGroupId = targetGroupId;
        nextTick(() => {
          document.getElementById(`group-${targetGroupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      chordStore.savedChordsList.forEach(c => {
        if (!validGroupIds.has(c.groupId)) c.groupId = targetGroupId as string;
      });
    }
    clearUndoToasts();
  };

  return {
    executeUndoRestore,
    clearUndoToasts,
    isLeftOpen,
    isRightOpen,
    isCopying,
    isCapoOpen,
    toggleCapoPanel,
    toasts,
    showToast,
    promiseToast,
  };
});
