<template>
  <div class="config-popover-card">
    <template v-if="currentMode === 'fretboard'">
      <BaseFormRow label="显示品数">
        <BaseSegmentedControl
          :model-value="editorStore.draftChord.fretCount"
          :options="FRET_OPTIONS"
          :disabled="!isGlobalEditable"
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
          :disabled="!isGlobalEditable"
        />
      </BaseFormRow>

      <BaseFormRow label="调音方案">
        <BaseSelector
          v-model="editorStore.draftChord.tuning"
          :options="tuningOptions"
          :default-value="Tuning.STANDARD"
          :formatter="val => TUNING_PRESETS[val]?.name || Tuning.STANDARD"
          width="full"
          :disabled="!isGlobalEditable"
          clearable
        />
      </BaseFormRow>

      <BaseFormRow>
        <template #label>
          <span title="开启后 maj7/dim/m7b5/aug 将简写为 M7/°/ø7/+">符号简写 (M/°/+)</span>
        </template>
        <BaseSwitch v-model="settingsStore.useChordShorthand" aria-label="符号简写" />
      </BaseFormRow>

      <div class="action-full-row">
        <ActionButton variant="subtle" primary width="100%" :disabled="!isGlobalEditable" @click="handleRepairData">
          <template #prefix>
            <Wrench :size="13" stroke-width="2.5" />
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
          v-model="localFretboardScale"
          readout-position="left"
          :show-buttons="false"
          :min="0.6"
          :max="1.5"
          :step="0.1"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
          @commit="commitFretboardScale"
        />
      </BaseFormRow>
    </template>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseFormRow from '@/components/BaseFormRow.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import BaseSlider from '@/components/BaseSlider.vue';
import BaseSwitch from '@/components/BaseSwitch.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/utils/constants';
import { TUNING_PRESETS, Tuning } from '@/utils/musicTheory';
import { Wrench } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
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

const localFretboardScale = ref(scoreEditor.fretboardScale);

watch(
  () => scoreEditor.fretboardScale,
  val => {
    if (val !== localFretboardScale.value) localFretboardScale.value = val;
  }
);

const commitFretboardScale = (val: number) => {
  if (val !== scoreEditor.fretboardScale) scoreEditor.fretboardScale = val;
};

const handleRepairData = () => {
  const repairedCount = chordStore.repairData();
  if (repairedCount > 0) {
    uiStore.toast.success(`已扫描本地数据，修复并对齐了 ${repairedCount} 个和弦！`);
  } else {
    uiStore.toast.info('所有和弦数据结构完好，已处于最新对齐状态。');
  }
};
</script>

<style scoped lang="scss">
.config-popover-card {
  width: 360px; /* 固定的面板宽度，不再随内部控件变化而跳动 */
  padding: $space-lg;
  display: flex;
  flex-direction: column;
  gap: $space-lg;
  box-sizing: border-box;
  outline: none;
}

.action-full-row {
  width: 100%;
}
</style>
