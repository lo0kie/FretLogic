<template>
  <div class="flex flex-col gap-2">
    <label class="text-xs font-black uppercase tracking-widest" style="color: var(--text-disabled)">调音方案</label>

    <div class="relative w-full">
      <GlobalTooltip class="w-full" content="点击选择不同的琴弦基础调音" placement="top">
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
            <span class="truncate">{{ TUNING_PRESETS[option]?.name }}</span>
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
