<template>
  <WorkbenchPanel
    :has-content="hasFrettedNotes"
    :storage-key="STORAGE_KEYS.WORKBENCH_SETTINGS_COLLAPSED"
    icon="sliders-horizontal"
    title="指板设置"
  >
    <div class="gap-md flex flex-col px-1 pt-2">
      <BaseFormRow label="显示品数">
        <BaseSegmentedControl
          :model-value="editorStore.draftChord.fretCount"
          :options="FRET_OPTIONS"
          @update:model-value="val => editorStore.setFretCount(val as 3 | 4)"
        />
      </BaseFormRow>

      <BaseFormRow label="品位偏移 (Offset)">
        <BaseNumberInput
          v-model="editorStore.draftChord.fretOffset"
          :editable="false"
          :max="INTERACTION_CONFIG.MAX_CAPO_LIMIT"
          :min="0"
          wheelable
          width="auto"
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
          width="auto"
        />
      </BaseFormRow>

      <BaseFormRow help="仅工作台生效" label="符号简写 (M/°/+)">
        <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" />
      </BaseFormRow>

      <BaseFormRow help="指板有可横按弦组时自动标记" label="自动横按">
        <BaseSwitch v-model="editorStore.autoBarre" aria-label="自动标记横按" />
      </BaseFormRow>
    </div>
  </WorkbenchPanel>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/ui/BaseSegmentedControl.vue';
import BaseSelector from '@/components/ui/BaseSelector.vue';
import BaseSwitch from '@/components/ui/BaseSwitch.vue';
import { Tuning, TUNING_PRESETS } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { FRET_COUNTS, INTERACTION_CONFIG, STORAGE_KEYS } from '@/utils/core/constants';

import WorkbenchPanel from './WorkbenchPanel.vue';

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();

/** auto 模式的展开依据：与导出面板一致——草稿存在至少一根按音弦（指板有内容才需要设置） */
const hasFrettedNotes = () => editorStore.draftChord.strings.some(str => str && str[0] > 0);

const tuningOptions = computed(() =>
  (Object.keys(TUNING_PRESETS) as Tuning[]).filter(t => TUNING_PRESETS[t]?.stringCount === editorStore.stringCount)
);
const FRET_OPTIONS: SegmentOption<3 | 4>[] = FRET_COUNTS.map(f => ({
  label: `${f}品`,
  value: f,
}));
</script>
