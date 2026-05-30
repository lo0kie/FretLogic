<template>
  <div class="flex flex-col gap-2">
    <label class="text-xs font-black uppercase tracking-widest" style="color: var(--text-disabled)">调音方案</label>

    <div class="relative w-full">
      <GlobalTooltip content="点击选择不同的琴弦基础调音" placement="top">
        <div
          @click="isDropdownOpen = !isDropdownOpen"
          class="tuning-trigger-bar flex items-center justify-between px-3 select-none"
          :class="{ 'is-active': isDropdownOpen }"
        >
          <span class="font-black text-[14px] text-title flex items-center gap-2">
            {{ TUNING_PRESETS[chordLabStore.currentTuning]?.name || 'Standard' }}
          </span>

          <svg
            class="w-3 h-3 transition-transform duration-200"
            style="color: var(--text-disabled)"
            :class="{ 'rotate-180': isDropdownOpen }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </GlobalTooltip>

      <div v-if="isDropdownOpen" class="fixed inset-0 z-[40]" @click="isDropdownOpen = false"></div>

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
            :class="{ 'is-selected': chordLabStore.currentTuning === key }"
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
import { useChordLabStore } from '@/stores/chordLabStore';
import { TUNING_PRESETS, type TuningType } from '@/utils/musicTheory';
import { ref } from 'vue';

const chordLabStore = useChordLabStore();
const isDropdownOpen = ref(false);

const handleTuningChange = (tuningKey: TuningType) => {
  chordLabStore.currentTuning = tuningKey;
  isDropdownOpen.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

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
