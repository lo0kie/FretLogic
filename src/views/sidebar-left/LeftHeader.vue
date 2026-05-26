<template>
  <div
    class="p-4 px-5 h-[76px] border-b border-slate-100 dark:border-slate-800 flex items-center justify-between min-w-[335px] relative"
  >
    <div>
      <h1 class="text-lg font-black tracking-tight uppercase text-title">Fret Logic</h1>
    </div>

    <div class="relative flex items-center justify-center">
      <GlobalTooltip placement="bottom" content="新建分组">
        <button
          @click="uiStore.openModal('createGroup', '新建分组')"
          class="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-primary font-black flex items-center justify-center text-sm border border-slate-200 dark:border-slate-700 active:scale-95 transition-transform"
        >
          ＋
        </button>
      </GlobalTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';
// 补充字色，对齐设计系统
.text-title {
  color: @text-title;
}
</style>
