<template>
  <HeaderPopoverShell tooltip="指板配置 (品数 / Capo / 调音)">
    <!-- 1. 显示品数 -->
    <div class="config-row">
      <label class="config-label">显示品数</label>
      <div class="control-wrapper">
        <BaseSegmentedControl v-model="editorStore.fretCount" :options="FRET_OPTIONS" />
      </div>
    </div>

    <!-- 2. 变调夹 (Capo) -->
    <div class="config-row">
      <label class="config-label">变调夹 (Capo)</label>
      <div class="control-wrapper">
        <BaseNumberInput
          v-model="editorStore.capo"
          :min="0"
          :max="12"
          :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
        />
      </div>
    </div>

    <!-- 3. 调音方案 -->
    <div class="config-row">
      <label class="config-label">调音方案</label>
      <div class="control-wrapper">
        <BaseSelector
          v-model="editorStore.currentTuning"
          :options="tuningOptions"
          :default-value="TuningEnum.STANDARD"
          :formatter="val => TUNING_PRESETS[val]?.name || TuningEnum.STANDARD"
        />
      </div>
    </div>
  </HeaderPopoverShell>
</template>

<script setup lang="ts">
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import HeaderPopoverShell from './HeaderPopoverShell.vue';

import { FRET_COUNTS } from '@/constants';
import { useEditorStore } from '@/stores/chordEditorStore';
import { TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';

const editorStore = useEditorStore();
const tuningOptions = Object.values(TuningEnum);

const FRET_OPTIONS: SegmentOption<number>[] = FRET_COUNTS.map(f => ({
  label: `${f}品`,
  value: f,
}));
</script>
