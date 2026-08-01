<template>
  <div class="popover-wrapper" ref="popoverContainerRef">
    <GlobalTooltip content="指板配置 (品数 / Capo / 调音)" placement="bottom">
      <ActionButton icon-only variant="ghost" :active="isConfigOpen" @click="isConfigOpen = !isConfigOpen">
        <SlidersHorizontal :size="18" stroke-width="2.2" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div v-if="isConfigOpen" class="config-popover-card" ref="cardRef">
        <!-- 1. 显示品数 -->
        <div class="config-row">
          <label class="config-label">显示品数</label>
          <div class="fret-select-wrapper">
            <BaseSegmentedControl v-model="editorStore.fretCount" :options="FRET_OPTIONS" />
          </div>
        </div>

        <!-- 2. 变调夹 (Capo) 替换为公共 BaseNumberInput 组件 -->
        <div class="config-row">
          <label class="config-label">变调夹 (Capo)</label>
          <BaseNumberInput
            v-model="editorStore.capo"
            :min="0"
            :max="12"
            :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
          />
        </div>

        <!-- 3. 调音方案 -->
        <div class="config-row">
          <label class="config-label">调音方案</label>
          <div class="tuning-select-wrapper">
            <BaseSelector
              v-model="editorStore.currentTuning"
              :options="tuningOptions"
              :default-value="TuningEnum.STANDARD"
              :formatter="val => TUNING_PRESETS[val]?.name || TuningEnum.STANDARD"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { FRET_COUNTS } from '@/constants';
import { useEditorStore } from '@/stores/chordEditorStore';
import { TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { SlidersHorizontal } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core';
import { ref } from 'vue';

const editorStore = useEditorStore();
const tuningOptions = Object.values(TuningEnum);

// 品数配置选项定义
const FRET_OPTIONS: SegmentOption<number>[] = FRET_COUNTS.map(f => ({
  label: `${f}品`,
  value: f,
}));

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
  width: 15rem;
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

.tuning-select-wrapper {
  min-width: 8rem;
  flex: 1;

  :deep(.selector-trigger-bar) {
    height: 1.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}

.option-text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fade-scale-transition(dropdown-fade, -6px, 0.96);

@media (max-width: 768px) {
  .config-popover-card {
    position: fixed;
    top: 3.6rem;
    left: 4rem;
    right: 1rem;
    width: auto;
    max-width: none;
    padding: 1rem 1.15rem;
    gap: 1rem;
    border-radius: calc(@radius-lg * 1.3);
  }

  .config-row {
    gap: 1rem;
  }

  .config-label {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .tuning-select-wrapper {
    :deep(.selector-trigger-bar) {
      height: 2rem;
      padding-left: 0.7rem;
      padding-right: 0.7rem;
      font-size: 0.78rem;
    }
  }
}
</style>
