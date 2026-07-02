<template>
  <div
    class="p-4 border-t border-[var(--control-border)] bg-[var(--bg-body)] rounded-b-xl"
    :style="{ minWidth: RIGHT_SIDEBAR_WIDTH_PIXEL }"
  >
    <div class="grid grid-cols-2 gap-2">
      <GlobalTooltip :content="saveDisabledReason">
        <ActionButton @click="$emit('save')" :primary="!isSaveDisabled" :disabled="isSaveDisabled">
          {{ editorStore.editingId ? '更新修改' : '保存和弦' }}
        </ActionButton>
      </GlobalTooltip>

      <ActionButton
        @click="$emit('reset')"
        :danger="!editorStore.editingId"
        :warning="!!editorStore.editingId"
        :disabled="isClearDisabled"
      >
        {{ editorStore.editingId ? '放弃本次修改' : '重置' }}
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { RIGHT_SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useEditorStore } from '@/stores/editorStore';
import { computed } from 'vue';

defineEmits<{
  (e: 'save'): void;
  (e: 'reset'): void;
}>();

const editorStore = useEditorStore();

const isSaveDisabled = computed(() => {
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return !cleanName || editorStore.isFretBoardEmpty;
});

const saveDisabledReason = computed(() => {
  if (!isSaveDisabled.value) return undefined;
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  if (!cleanName) return '请输入和弦名称（如 C, Am）';
  if (editorStore.isFretBoardEmpty) return '指板上至少需要指定一个有效音符';
  return undefined;
});

const isClearDisabled = computed(() => {
  if (editorStore.editingId) return false;

  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  const isDefaultName = cleanName === '';
  const isDefaultFretBoard = editorStore.isFretBoardEmpty;
  const isDefaultCapo = editorStore.capo === 0;
  const isDefaultFretCount = editorStore.fretCount === 3;
  const isDefaultTuning = editorStore.currentTuning === 'STANDARD';

  return isDefaultName && isDefaultFretBoard && isDefaultCapo && isDefaultFretCount && isDefaultTuning;
});
</script>
