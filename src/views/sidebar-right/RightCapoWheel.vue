<template>
  <div class="capo-wheel-container">
    <label class="capo-label"> Capo (把位平移) </label>

    <div class="selector-wrapper">
      <GlobalTooltip class="tooltip-full-width" content="点击展开或滚动滑轮切换" placement="top">
        <BaseSelector
          v-model="editorStore.capo"
          :options="capoOptions"
          clearable
          :defaultValue="0"
          maxHeightClass="max-h-52"
          optionIdPrefix="capo-opt-"
          @wheel-change="handleCapoWheel"
        >
          <template #label="{ selected }"> {{ selected }} {{ selected === 0 ? '(空弦位)' : '品' }} </template>

          <template #option="{ option }">
            <span class="option-number">{{ option }}</span>
            <span>{{ option === 0 ? '(空弦位)' : '品' }}</span>
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

const editorStore = useEditorStore();
const capoOptions = Array.from({ length: 13 }, (_, i) => i);

const handleCapoWheel = (direction: 'up' | 'down') => {
  if (direction === 'up') {
    editorStore.capo = Math.max(0, editorStore.capo - 1);
  } else {
    editorStore.capo = Math.min(12, editorStore.capo + 1);
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.capo-wheel-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-sizing: border-box;
}

.capo-label {
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
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

.option-number {
  width: 1rem;
  text-align: right;
  margin-right: 0.375rem;
  font-weight: 900;
  display: inline-block;
}
</style>
