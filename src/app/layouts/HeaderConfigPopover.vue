<template>
  <div class="config-popover-card p-lg gap-lg box-border flex w-[360px] flex-col outline-none">
    <BaseFormRow label="字号缩放">
      <BaseSlider
        v-model="scoreEditor.fontScale"
        :default-value="1.0"
        :formatter="val => `${Math.round(val * 100)}%`"
        :max="1.5"
        :min="0.6"
        :show-buttons="false"
        :step="0.05"
        readout-position="left"
      />
    </BaseFormRow>

    <BaseFormRow label="和弦缩放">
      <BaseSlider
        v-model="scoreEditor.fretboardScale"
        :default-value="1.0"
        :formatter="val => `${Math.round(val * 100)}%`"
        :max="1.5"
        :min="0.6"
        :show-buttons="false"
        :step="0.1"
        readout-position="left"
      />
    </BaseFormRow>

    <BaseFormRow help="导出与预览对齐排版" label="乐谱对齐">
      <BaseSegmentedControl
        v-model="settingsStore.scoreLayoutAlign"
        :options="[
          { value: 'start', label: '起始位置' },
          { value: 'center', label: '居中对齐' },
        ]"
        size="sm"
      />
    </BaseFormRow>

    <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
      <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
    </BaseFormRow>
  </div>
</template>

<script setup lang="ts">
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSettingsStore } from '@/platform/store/settingsStore';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
</script>
