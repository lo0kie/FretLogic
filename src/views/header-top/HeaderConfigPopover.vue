<!-- src/views/header-top/HeaderConfigPopover.vue -->
<template>
  <HeaderPopoverShell tooltip="指板配置 (品数 / Capo / 调音)">
    <div class="config-row">
      <label class="config-label">显示品数</label>
      <div class="control-wrapper">
        <BaseSegmentedControl v-model="editorStore.fretCount" :options="FRET_OPTIONS" />
      </div>
    </div>

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

    <div class="config-divider"></div>
    <div class="config-row">
      <ActionButton size="sm" variant="subtle" width="100%" @click="handleRepairData">
        <template #prefix><Wrench :size="13" stroke-width="2.5" /></template>
        修复与对齐数据
      </ActionButton>
    </div>
  </HeaderPopoverShell>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import { FRET_COUNTS } from '@/constants';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useUiStore } from '@/stores/uiStore';
import { computeChordFingerprint, computeIsInverted, TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { Wrench } from '@lucide/vue';
import HeaderPopoverShell from './HeaderPopoverShell.vue';

const editorStore = useEditorStore();
const chordStore = useChordStore();
const uiStore = useUiStore();

const tuningOptions = Object.values(TuningEnum);

const FRET_OPTIONS: SegmentOption<number>[] = FRET_COUNTS.map(f => ({
  label: `${f}品`,
  value: f,
}));

const handleRepairData = () => {
  let repairedCount = 0;

  const repairedList = chordStore.savedChordsList.map(chord => {
    const freshInverted = computeIsInverted(
      chord.strings,
      chord.capo ?? 0,
      chord.tuning || TuningEnum.STANDARD,
      chord.chordName
    );

    const freshFingerprint = computeChordFingerprint({
      groupId: chord.groupId,
      chordName: chord.chordName,
      capo: chord.capo ?? 0,
      fretCount: chord.fretCount ?? 3,
      tuning: chord.tuning || TuningEnum.STANDARD,
      strings: chord.strings,
      isInverted: freshInverted,
    });

    if (chord.isInverted !== freshInverted || chord.fingerprint !== freshFingerprint) {
      repairedCount++;
    }

    return {
      ...chord,
      fretCount: chord.fretCount ?? 3,
      capo: chord.capo ?? 0,
      tuning: chord.tuning || TuningEnum.STANDARD,
      isInverted: freshInverted,
      fingerprint: freshFingerprint,
    };
  });

  chordStore.overwriteChords(repairedList);

  if (repairedCount > 0) {
    uiStore.toast.success(`已扫描本地数据，修复并对齐了 ${repairedCount} 个和弦！`);
  } else {
    uiStore.toast.info('所有和弦数据结构完好，已处于最新对齐状态。');
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.config-divider {
  height: 1px;
  background-color: var(--border-light);
  margin: 0.2rem 0;
}
</style>
