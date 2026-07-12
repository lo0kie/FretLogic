<template>
  <div class="tuning-selector-container">
    <label class="tuning-label">调音方案</label>

    <div class="selector-wrapper">
      <GlobalTooltip class="tooltip-full-width" content="点击选择不同的琴弦基础调音" placement="top">
        <BaseSelector
          v-model="editorStore.currentTuning"
          :options="tuningOptions"
          clearable
          :defaultValue="TuningEnum.STANDARD"
          maxHeightClass="max-h-60"
          fontBlackItems
          optionIdPrefix="tuning-opt-"
        >
          <template #label="{ selected }">
            {{ TUNING_PRESETS[selected]?.name || TuningEnum.STANDARD }}
          </template>

          <template #option="{ option }">
            <span class="option-text-truncate">{{ TUNING_PRESETS[option]?.name }}</span>
          </template>
        </BaseSelector>
      </GlobalTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useEditorStore } from '@/stores/editorStore';
import { TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';

const editorStore = useEditorStore();
const tuningOptions = Object.values(TuningEnum);
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.tuning-selector-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-sizing: border-box;
}

.tuning-label {
  font-size: 0.7rem;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-disabled);
}

.selector-wrapper {
  position: relative;
  width: 100%;
  box-sizing: border-box;
}

.tooltip-full-width {
  width: 100%;
}

.option-text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
