<template>
  <div class="config-popover-card p-lg gap-lg box-border flex w-[360px] flex-col outline-none">
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
          :editable="false"
          :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
          :max="INTERACTION_CONFIG.MAX_CAPO_LIMIT"
          :min="0"
        />
      </BaseFormRow>

      <BaseFormRow label="调音方案">
        <BaseSelector
          v-model="editorStore.draftChord.tuning"
          :default-value="Tuning.STANDARD"
          :format-option="
            (val: string | number) =>
              (typeof val === 'string' ? TUNING_PRESETS[val as Tuning]?.name : undefined) || Tuning.STANDARD
          "
          :options="tuningOptions"
          clearable
        />
      </BaseFormRow>

      <BaseFormRow help="仅工作台生效" label="符号简写 (M/°/+)">
        <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" />
      </BaseFormRow>

      <BaseFormRow help="仅工作台生效" label="显示音名">
        <BaseSwitch v-model="settingsStore.workbenchShowPitchNames" aria-label="工作台显示音名" />
      </BaseFormRow>

      <BaseFormRow help="指板有可横按弦组时自动标记" label="自动横按">
        <BaseSwitch v-model="editorStore.autoBarre" aria-label="自动标记横按" />
      </BaseFormRow>

      <div class="action-full-row w-full">
        <ActionButton @click="handleRepairData" color="primary" variant="subtle" width="100%">
          <template #prefix>
            <BaseIcon :size="13" :stroke-width="2.5" name="wrench" />
          </template>
          修复与对齐数据
        </ActionButton>
      </div>
    </template>

    <template v-else-if="currentMode === 'score'">
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

      <BaseFormRow help="仅乐谱生效" label="显示音名">
        <BaseSwitch v-model="settingsStore.scoreShowPitchNames" aria-label="乐谱显示音名" />
      </BaseFormRow>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/ui/BaseSegmentedControl.vue';
import BaseSelector from '@/components/ui/BaseSelector.vue';
import BaseSlider from '@/components/ui/BaseSlider.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import { Tuning, TUNING_PRESETS } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/utils/core/constants';

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

/** 用户点击"修复与对齐数据"：扫描本地和弦并修复结构，按修复数量给出结果提示 */
const handleRepairData = () => {
  const repairedCount = chordStore.repairData();
  if (repairedCount > 0) {
    uiStore.toast.success(`已扫描本地数据，修复并对齐了 ${repairedCount} 个和弦！`);
  } else {
    uiStore.toast.info('所有和弦数据结构完好，已处于最新对齐状态。');
  }
};
</script>
