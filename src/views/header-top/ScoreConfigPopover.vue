<template>
  <div class="popover-wrapper" ref="popoverContainerRef">
    <GlobalTooltip content="曲谱配置 (演唱调 / 指法调 / Capo)" placement="bottom">
      <ActionButton icon-only variant="ghost" :active="isConfigOpen" @click="isConfigOpen = !isConfigOpen">
        <SlidersHorizontal :size="18" stroke-width="2.2" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div v-if="isConfigOpen && scoreEditor.activeSong" class="config-popover-card" ref="cardRef">
        <!-- 1. 演唱调 (Key) -->
        <div class="config-row">
          <label class="config-label">演唱调 (Key)</label>
          <div class="key-select-wrapper">
            <BaseSelector
              :model-value="scoreEditor.activeSong.key || 'C'"
              :options="KEY_OPTIONS"
              default-value="C"
              @update:model-value="val => scoreEditor.updateKey(val)"
              :labelFormatter="val => `${val} 调`"
            />
          </div>
        </div>

        <!-- 2. 指法调式 (PlayKey) -->
        <div class="config-row">
          <label class="config-label">指法调 (Play)</label>
          <div class="key-select-wrapper">
            <BaseSelector
              :model-value="scoreEditor.activeSong.playKey || 'C'"
              :options="KEY_OPTIONS"
              default-value="C"
              @update:model-value="val => scoreEditor.updatePlayKey(val)"
              :labelFormatter="val => `${val} 调`"
            />
          </div>
        </div>

        <!-- 3. 变调夹 (Capo) -->
        <div class="config-row">
          <label class="config-label">变调夹 (Capo)</label>
          <BaseNumberInput
            :model-value="scoreEditor.activeSong.capo || 0"
            :min="0"
            :max="12"
            :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
            @update:model-value="val => scoreEditor.updateCapo(val)"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { SlidersHorizontal } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core';
import { ref } from 'vue';

const scoreEditor = useScoreEditorStore();

const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const isConfigOpen = ref(false);
const popoverContainerRef = ref<HTMLDivElement | null>(null);
const cardRef = ref<HTMLDivElement | null>(null);

onClickOutside(
  popoverContainerRef,
  () => {
    isConfigOpen.value = false;
  },
  { ignore: [cardRef, '.floating-position-wrapper'] }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.popover-wrapper {
  position: relative;
  z-index: 1001;
}

.config-popover-card {
  position: absolute;
  top: calc(100% + 1rem);
  right: 0;
  width: 15.5rem;
  padding: 0.8rem 1rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  z-index: 1100;
  box-sizing: border-box;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.config-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-disabled);
}

.key-select-wrapper {
  min-width: 6.5rem;

  :deep(.selector-trigger-bar) {
    height: 1.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}

.fade-scale-transition(dropdown-fade, -6px, 0.96);
</style>
