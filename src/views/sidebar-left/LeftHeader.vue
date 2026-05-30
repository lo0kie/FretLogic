<template>
  <div
    class="p-4 px-5 h-[76px] border-b border-[var(--control-border)] flex items-center justify-between relative"
    :class="`min-w-[${SIDEBAR_WIDTH_PIXEL}]`"
  >
    <div>
      <h1 class="text-lg font-black tracking-tight uppercase text-title">Fret Logic</h1>
    </div>

    <div class="relative flex items-center justify-center">
      <GlobalTooltip placement="bottom" content="新建分组">
        <button
          @click="uiStore.openModal('createGroup', '新建分组')"
          class="w-7 h-7 rounded-lg text-[var(--color-primary)] font-black flex items-center justify-center text-sm active:scale-95 transition-transform header-add-btn"
        >
          ＋
        </button>
      </GlobalTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { SIDEBAR_WIDTH_PIXEL } from '@/constants';
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.header-add-btn {
  background-color: color-mix(in srgb, @primary, transparent 90%);
  border: @border-solid-light;
  transition: @transition-fast;

  &:hover {
    background-color: color-mix(in srgb, @primary, transparent 80%);
    border-color: color-mix(in srgb, @primary, transparent 50%);
  }
}
</style>
