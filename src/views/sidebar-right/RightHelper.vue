<template>
  <div class="helper-action-box flex flex-col gap-2">
    <label class="plate-label text-xs font-black tracking-widest uppercase text-subtitle">系统辅助</label>

    <div class="flex flex-col gap-4">
      <ActionButton
        @click="uiStore.copyFretBoardToClipboard('#fretBoard-capture-area')"
        :disabled="uiStore.isCopying"
        class="w-full h-9 rounded-xl border border-control flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200"
        :class="[
          uiStore.isCopying
            ? 'bg-slate-100 dark:bg-slate-800 opacity-50 cursor-not-allowed text-slate-400'
            : 'bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]',
        ]"
      >
        <span class="text-sm leading-none">{{ uiStore.isCopying ? '⌛' : '📸' }}</span>
        <span>{{ uiStore.isCopying ? '正在导出...' : '复制当前到剪切板' }}</span>
      </ActionButton>

      <ActionButton
        @click="chordLabStore.isDarkMode = !chordLabStore.isDarkMode"
        class="w-full h-9 rounded-xl border border-control flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200 bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]"
      >
        <span class="text-sm leading-none">
          {{ chordLabStore.isDarkMode ? '🌙' : '☀️' }}
        </span>

        <span>
          {{ chordLabStore.isDarkMode ? '深色模式' : '浅色模式' }}
        </span>
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore } from '@/stores/chordLabStore'; // 🌟 引入数据主脑
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore(); // 🌟 实例化数据主脑
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.helper-action-box {
  button {
    border-color: var(--control-border);
    color: @text-body;

    &:not(:disabled):hover {
      border-color: @brand-primary;
      color: @brand-primary;
    }
  }
}
</style>
