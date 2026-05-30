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
        {{ chordLabStore.editingId ? '放弃本次修改' : '重置' }}
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
  // 1. 如果正在编辑（editingId 存在），说明是修改模式，必须允许放弃修改（重置编辑器）
  if (chordLabStore.editingId) return false;

  // 2. 检查所有编辑器状态是否全部处于“初始状态”
  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';
  const isDefaultName = cleanName === '';
  const isDefaultFretBoard = chordLabStore.isFretBoardEmpty;
  const isDefaultCapo = chordLabStore.capo === 0;
  const isDefaultFretCount = chordLabStore.fretCount === 3;

  // 🌟 新增：检查调音方案是否为标准形态
  const isDefaultTuning = chordLabStore.currentTuning === 'STANDARD';

  // 只有当所有属性（包含调音方案）都是初始值时，才禁用“重置”按钮
  return isDefaultName && isDefaultFretBoard && isDefaultCapo && isDefaultFretCount && isDefaultTuning;
});
</script>
