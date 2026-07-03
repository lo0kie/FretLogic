import type { Toast, ToastType } from '@/types';
import { useRefHistory, useStorage } from '@vueuse/core';
import cloneDeep from 'lodash.clonedeep';
import { defineStore } from 'pinia';
import { ref, toRaw, toRef } from 'vue';
import { useChordStore } from './chordStore';

export const useUiStore = defineStore('ui', () => {
  const chordStore = useChordStore();
  const savedChordsRef = toRef(chordStore, 'savedChordsList');

  const { undo: rawUndo } = useRefHistory(savedChordsRef, {
    capacity: 15,
    deep: true,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  const toasts = ref<Toast[]>([]);
  const isCopying = ref(false);
  const isLeftOpen = useStorage('CHORD_LAB_UI_LEFT_OPEN', true);
  const isRightOpen = useStorage('CHORD_LAB_UI_RIGHT_OPEN', true);
  const isPreviewEnabled = useStorage('CHORD_LAB_UI_PREVIEW_ENABLED', true);

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
    toasts,
    showToast,
    promiseToast,
    isPreviewEnabled,
  };
});
