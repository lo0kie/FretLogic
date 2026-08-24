<template>
  <div class="config-popover-card">
    <template v-if="currentMode === 'fretboard'">
      <div class="config-row">
        <label class="config-label">显示品数</label>
        <div class="control-wrapper">
          <BaseSegmentedControl
            :model-value="editorStore.draftChord.fretCount"
            :options="FRET_OPTIONS"
            :disabled="!isGlobalEditable"
            @update:model-value="editorStore.setFretCount"
          />
        </div>
      </div>

      <div class="config-row">
        <label class="config-label">变调夹 (Capo)</label>
        <div class="control-wrapper">
          <BaseNumberInput
            v-model="editorStore.draftChord.capo"
            :min="0"
            :max="INTERACTION_CONFIG.MAX_CAPO_LIMIT"
            :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
            :editable="false"
            :disabled="!isGlobalEditable"
          />
        </div>
      </div>

      <div class="config-row">
        <label class="config-label">调音方案</label>
        <div class="control-wrapper">
          <BaseSelector
            v-model="editorStore.draftChord.tuning"
            :options="tuningOptions"
            :default-value="Tuning.STANDARD"
            :formatter="val => TUNING_PRESETS[val]?.name || Tuning.STANDARD"
            width="full"
            :disabled="!isGlobalEditable"
            clearable
          />
        </div>
      </div>

      <div class="config-row">
        <ActionButton variant="subtle" primary width="100%" :disabled="!isGlobalEditable" @click="handleRepairData">
          <template #prefix>
            <Wrench :size="13" stroke-width="2.5" />
          </template>
          修复与对齐数据
        </ActionButton>
      </div>
    </template>

    <template v-else-if="currentMode === 'score'">
      <div class="config-row">
        <label class="config-label">滚动速度</label>
        <div class="control-wrapper">
          <BaseSlider
            v-model="scoreEditor.scrollSpeed"
            readout-position="left"
            :show-buttons="false"
            :min="40"
            :max="120"
            :step="5"
            :default-value="60"
          />
        </div>
      </div>

      <div class="config-row">
        <label class="config-label">字号缩放</label>
        <div class="control-wrapper">
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
        </div>
      </div>

      <div class="config-row">
        <label class="config-label">和弦缩放</label>
        <div class="control-wrapper">
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
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/utils/constants';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import ActionButton from '@/components/ActionButton.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import BaseSlider from '@/components/BaseSlider.vue';
import { TUNING_PRESETS, Tuning } from '@/utils/musicTheory';
import { Wrench } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const editorStore = useChordEditorStore();
const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
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

<style scoped lang="less">
@import '@/assets/tokens.module';

.config-popover-card {
  padding: @space-lg @space-lg;
  background-color: var(--bg-elevated);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  gap: @space-lg;
  z-index: var(--z-popover-top);
  box-sizing: border-box;
  outline: none;
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: @space-md;
}

.config-label {
  font-size: @fs-xs;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.control-wrapper {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}
</style>
