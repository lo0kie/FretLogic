<template>
  <div ref="tuningContainerRef" class="flex flex-col gap-2">
    <label class="text-xs font-black uppercase tracking-widest" style="color: var(--text-disabled)">调音方案</label>

    <div class="relative w-full">
      <GlobalTooltip class="w-full" content="点击选择不同的琴弦基础调音" placement="top">
        <div
          @click="isDropdownOpen = !isDropdownOpen"
          class="tuning-trigger-bar flex items-center justify-between px-3 select-none group"
          :class="{ 'is-active': isDropdownOpen }"
        >
          <!-- 加入非默认时的高亮主题 -->
          <span
            class="font-black flex items-center gap-2"
            :class="[
              editorStore.currentTuning !== 'STANDARD'
                ? 'text-[var(--color-primary)] text-[16px]'
                : 'text-title text-[14px]',
            ]"
          >
            {{ TUNING_PRESETS[editorStore.currentTuning]?.name || 'Standard' }}
          </span>

          <!-- 悬停时显示的清除按钮 -->
          <X
            v-if="editorStore.currentTuning !== 'STANDARD'"
            :size="18"
            :stroke-width="3"
            class="hidden group-hover:block text-[var(--text-disabled)] hover:!text-[var(--color-danger)] transition-colors"
            @click.stop="
              editorStore.currentTuning = 'STANDARD';
              isDropdownOpen = false;
            "
          />
          <ChevronDown
            :size="18"
            :stroke-width="3"
            style="color: var(--text-disabled)"
            class="transition-transform duration-200"
            :class="[
              { 'rotate-180': isDropdownOpen },
              editorStore.currentTuning !== 'STANDARD' ? 'group-hover:hidden' : '',
            ]"
          />
        </div>
      </GlobalTooltip>

      <Transition
        enter-from-class="opacity-0 translate-y-[-8px]"
        leave-to-class="opacity-0 translate-y-[-8px]"
        enter-active-class="transition duration-200 ease-out"
        leave-active-class="transition duration-200 ease-in"
      >
        <div
          v-if="isDropdownOpen"
          class="tuning-dropdown-box absolute left-0 right-0 mt-1.5 max-h-60 overflow-y-auto no-scrollbar z-[50] p-1.5 flex flex-col gap-1"
        >
          <div
            v-for="(config, key) in TUNING_PRESETS"
            :key="key"
            @click="handleTuningChange(key)"
            class="tuning-item h-10 px-2.5 rounded-lg flex items-center text-[13px] font-black"
            :class="{ 'is-selected': editorStore.currentTuning === key }"
          >
            <span class="truncate">{{ config.name }}</span>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useEditorStore } from '@/stores/editorStore';
import { TUNING_PRESETS, type TuningType } from '@/utils/musicTheory';
import { ChevronDown, X } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core';
import { ref } from 'vue';

const editorStore = useEditorStore();
const isDropdownOpen = ref(false);
const tuningContainerRef = ref<HTMLDivElement | null>(null);

onClickOutside(tuningContainerRef, () => {
  if (isDropdownOpen.value) isDropdownOpen.value = false;
});

const handleTuningChange = (tuningKey: TuningType) => {
  editorStore.currentTuning = tuningKey;
  isDropdownOpen.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.tuning-trigger-bar {
  .mixin-input-base();
  height: 2.5rem;
  border-radius: @radius-lg;
  cursor: pointer;
  background-color: var(--bg-body);
  &.is-active {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
  }
}

.tuning-dropdown-box {
  .mixin-floating-layer();
}

.tuning-item {
  .mixin-interactive-card();
  color: var(--text-body);
  &.is-selected {
    background-color: color-mix(in srgb, @primary, transparent 90%) !important;
    color: @primary !important;
    border-color: color-mix(in srgb, @primary, transparent 70%);
  }
}
</style>
