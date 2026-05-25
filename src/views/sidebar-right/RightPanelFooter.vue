<template>
  <div
    class="p-4 border-t border-slate-100 dark:border-slate-800 min-w-[335px] bg-slate-50/50 dark:bg-slate-900/20 rounded-b-16"
  >
    <div class="grid grid-cols-2 gap-2">
      <ActionButton @click="uiStore.triggerSaveChord()" primary>
        {{ chordLabStore.editingId ? '更新修改' : '保存和弦' }}
      </ActionButton>

      <ActionButton
        @click="chordLabStore.resetEditor()"
        :danger="!chordLabStore.editingId"
        :warning="!!chordLabStore.editingId"
      >
        {{ chordLabStore.editingId ? '放弃本次修改' : '清空指板' }}
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
</script>
