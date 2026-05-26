<template>
  <div
    class="p-4 border-t border-slate-100 dark:border-slate-800 min-w-[335px] bg-slate-50/50 dark:bg-slate-900/20 rounded-b-16"
  >
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

/**
 * 智能判定保存/更新按钮是否应该置灰禁用
 */
const isSaveDisabled = computed(() => {
  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';
  return !cleanName || chordLabStore.isFretBoardEmpty;
});

/**
 * 🌟 乐理状态机：动态推演保存被禁用的核心原因
 * - 只有在按钮确实处于禁用状态时才返回文本，否则返回 undefined 彻底隐藏气泡框
 */
const saveDisabledReason = computed(() => {
  if (!isSaveDisabled.value) return undefined;

  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';

  // 判定优先级 A：如果连和弦名字都还没填，优先提示输入名字
  if (!cleanName) {
    return '请输入和弦名称（如 C, Am）';
  }

  // 判定优先级 B：名字填了但指板全空，提示添加指板音
  if (chordLabStore.isFretBoardEmpty) {
    return '指板上至少需要指定一个有效音符';
  }

  return undefined;
});

/**
 * 智能判定清空/放弃修改按钮是否应该置灰禁用
 */
const isClearDisabled = computed(() => {
  // 如果是编辑模式，永远不禁用退出通道
  if (chordLabStore.editingId) return false;

  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';
  const isNameEmpty = !cleanName;

  // 只有在【名字是空的】并且【指板也是空的】这双重空虚叠加时，才置灰禁用
  return isNameEmpty && chordLabStore.isFretBoardEmpty;
});
</script>
