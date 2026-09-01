<template>
  <div class="config-popover-card w-[360px] p-lg flex flex-col gap-lg box-border outline-none">
    <template v-if="currentMode === 'fretboard'">
      <BaseFormRow label="显示品数">
        <BaseSegmentedControl
          :model-value="editorStore.draftChord.fretCount"
          :options="FRET_OPTIONS"
          @update:model-value="editorStore.setFretCount"
        />
      </BaseFormRow>

      <BaseFormRow label="变调夹 (Capo)">
        <BaseNumberInput
          v-model="editorStore.draftChord.capo"
          :min="0"
          :max="INTERACTION_CONFIG.MAX_CAPO_LIMIT"
          :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
          :editable="false"
        />
      </BaseFormRow>

      <BaseFormRow label="调音方案">
        <BaseSelector
          v-model="editorStore.draftChord.tuning"
          :options="tuningOptions"
          :default-value="Tuning.STANDARD"
          :format-option="
            (val: string | number) =>
              (typeof val === 'string' ? TUNING_PRESETS[val as Tuning]?.name : undefined) || Tuning.STANDARD
          "
          clearable
        />
      </BaseFormRow>

      <BaseFormRow label="符号简写 (M/°/+)" help="仅工作台生效">
        <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" />
      </BaseFormRow>

      <BaseFormRow label="显示音名" help="仅工作台生效">
        <BaseSwitch v-model="settingsStore.workbenchShowPitchNames" aria-label="工作台显示音名" />
      </BaseFormRow>

      <div class="action-full-row w-full">
        <ActionButton variant="subtle" color="primary" width="100%" @click="handleRepairData">
          <template #prefix>
            <Wrench :size="13" :stroke-width="2.5" />
          </template>
          修复与对齐数据
        </ActionButton>
      </div>
    </template>

    <template v-else-if="currentMode === 'score'">
      <BaseFormRow label="滚动速度">
        <BaseSlider
          v-model="scoreEditor.scrollSpeed"
          readout-position="left"
          :show-buttons="false"
          :min="40"
          :max="120"
          :step="5"
          :default-value="60"
        />
      </BaseFormRow>

      <BaseFormRow label="字号缩放">
        <BaseSlider
          v-model="scoreEditor.fontScale"
          readout-position="left"
          :show-buttons="false"
          :min="0.6"
          :max="1.5"
          :step="0.05"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
        />
      </BaseFormRow>

      <BaseFormRow label="和弦缩放">
        <BaseSlider
          v-model="scoreEditor.fretboardScale"
          readout-position="left"
          :show-buttons="false"
          :min="0.6"
          :max="1.5"
          :step="0.1"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
        />
      </BaseFormRow>

      <BaseFormRow label="符号简写 (M/°/+)" help="仅乐谱生效">
        <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
      </BaseFormRow>

      <BaseFormRow label="显示音名" help="仅乐谱生效">
        <BaseSwitch v-model="settingsStore.scoreShowPitchNames" aria-label="乐谱显示音名" />
      </BaseFormRow>
    </template>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseFormRow from '@/components/base/BaseFormRow.vue';
import BaseNumberInput from '@/components/base/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/base/BaseSegmentedControl.vue';
import BaseSelector from '@/components/base/BaseSelector.vue';
import BaseSlider from '@/components/base/BaseSlider.vue';
import BaseSwitch from '@/components/base/BaseSwitch.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/utils/core/constants';
import { TUNING_PRESETS, Tuning } from '@/utils/music/musicTheory';
import { Wrench } from '@lucide/vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const editorStore = useChordEditorStore();
const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const currentMode = computed<'fretboard' | 'score'>(() => {
  return route.path === '/score' ? 'score' : 'fretboard';
});

const tuningOptions = Object.values(Tuning);
const FRET_OPTIONS: SegmentOption<3 | 4>[] = FRET_COUNTS.map(f => ({
  label: `${f}品`,
  value: f,
}));

const handleRepairData = () => {
  const repairedCount = chordStore.repairData();
  if (repairedCount > 0) {
    uiStore.toast.success(`已扫描本地数据，修复并对齐了 ${repairedCount} 个和弦！`);
  } else {
    uiStore.toast.info('所有和弦数据结构完好，已处于最新对齐状态。');
  }
};
</script>
