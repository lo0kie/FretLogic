<template>
  <WorkbenchPanel
    :has-content="hasFrettedNotes"
    :storage-key="STORAGE_KEYS.WORKBENCH_SETTINGS_COLLAPSED"
    icon="sliders-horizontal"
    title="指板设置"
  >
    <div class="flex flex-col gap-md px-1 pt-2">
      <BaseFormRow label="显示品数">
        <BaseSegmentedControl
          :model-value="editorStore.draftChord.fretCount"
          :options="FRET_OPTIONS"
          @update:model-value="editorStore.setFretCount($event)"
          compacted
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
          keep-open-on-select
          width="lg"
        />
      </BaseFormRow>

      <BaseFormRow help="指板有可横按弦组时自动标记" label="自动横按">
        <BaseSwitch v-model="editorStore.autoBarre" aria-label="自动标记横按" />
      </BaseFormRow>
    </div>
  </WorkbenchPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { Tuning, TUNING_PRESETS } from '@/domains/chord/theory/theory';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/domains/fretboard/constants';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import WorkbenchPanel from './WorkbenchPanel.vue';

import type { Chord } from '@/domains/chord/types';
import type { SegmentOption } from '@/platform/ui/segmented/BaseSegmentedControl.vue';

const editorStore = useChordEditorStore();

/** auto 模式的展开依据：与导出面板一致——草稿存在至少一根按音弦（指板有内容才需要设置） */
const hasFrettedNotes = () => editorStore.draftChord.strings.some(str => str && str[0] > 0);

const tuningOptions = computed(() =>
  (Object.keys(TUNING_PRESETS) as Tuning[]).filter(t => TUNING_PRESETS[t]?.stringCount === editorStore.stringCount)
);
const FRET_OPTIONS: SegmentOption<Chord['fretCount']>[] = FRET_COUNTS.map(f => ({
  label: `${f}品`,
  value: f,
}));
</script>
