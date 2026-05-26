<template>
  <div
    class="p-4 border-t border-slate-100 dark:border-slate-800 min-w-[335px] bg-slate-50/50 dark:bg-slate-900/20 rounded-b-16"
  >
    <div class="grid grid-cols-2 gap-2">
      <ActionButton @click="uiStore.triggerSaveChord()" :primary="!isSaveDisabled" :disabled="isSaveDisabled">
        {{ chordLabStore.editingId ? '更新修改' : '保存和弦' }}
      </ActionButton>

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
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { computed } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();

/**
 * 智能判定保存/更新按钮是否应该置灰禁用
 * 统一标准：无核心资产数据（名字为空 OR 主脑判定指板全空）才禁用
 */
const isSaveDisabled = computed(() => {
  const cleanName = chordLabStore.currentChordName ? chordLabStore.currentChordName.trim() : '';

  // 100% 连通主脑全局空状态 Getter，名字为空或指板全空则禁用
  return !cleanName || chordLabStore.isFretBoardEmpty;
});

/**
 * 🌟 智能判定清空/放弃修改按钮是否应该置灰禁用
 * 逻辑闭环：
 * - 在新建模式下（!editingId），如果主脑判定指板本来就是全空的，直接熔断禁用“清空指板”按钮。
 * - 在编辑模式下（!!editingId），为了防止用户因清空音符而被死锁在编辑状态中，退出通道永远保持畅通，不触发禁用！
 */
const isClearDisabled = computed(() => !chordLabStore.editingId && chordLabStore.isFretBoardEmpty);
</script>
