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

    <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
      <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
    </BaseFormRow>
  </div>
</template>

<script lang="ts" setup>
import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
</script>
