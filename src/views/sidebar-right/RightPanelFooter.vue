<template>
  <div class="p-4 border-t border-[var(--control-border)] min-w-[335px] bg-[var(--bg-body)] rounded-b-xl">
    <div class="grid grid-cols-2 gap-2">
      <GlobalTooltip :content="saveDisabledReason">
        <ActionButton @click="uiStore.triggerSaveChord()" :primary="!isSaveDisabled" :disabled="isSaveDisabled">
          {{ chordLabStore.editingId ? '更新修改' : '保存和弦' }}
        </ActionButton>
      </GlobalTooltip>

      <ActionButton
        @click="chordLabStore.resetEditor()"
        :danger="!chordLabStore.editingId"
        :warning="!!chordLabStore.editingId"
        :disabled="isClearDisabled"
      >
        {{ chordLabStore.editingId ? '放弃本次修改' : '清空指板' }}
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { computed } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();

const isSaveDisabled = computed(() => {
  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';
  return !cleanName || chordLabStore.isFretBoardEmpty;
});

const saveDisabledReason = computed(() => {
  if (!isSaveDisabled.value) return undefined;
  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';
  if (!cleanName) return '请输入和弦名称（如 C, Am）';
  if (chordLabStore.isFretBoardEmpty) return '指板上至少需要指定一个有效音符';
  return undefined;
});

const isClearDisabled = computed(() => {
  if (chordLabStore.editingId) return false;
  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';
  return !cleanName && chordLabStore.isFretBoardEmpty;
});
</script>
