<template>
  <div class="flex flex-col gap-md">
    <!-- 指板设置：管的就是左侧那块交互指板本身（品数窗口 / 品位偏移 / 调音 / 自动横按），
         原挂在顶部设置弹窗的「指板」分组里，与指板隔了一层浮层；收进工作台面板后与指板同屏，
         调完即刻看见指板变化。前三项绑定的都是和弦草稿（draftChord），随草稿走而非全局偏好——
         唯「自动横按」是全局偏好（见 chordEditorStore.autoBarre 的说明）。 -->
    <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
      <BaseFormRow label="显示品数">
        <BaseSegmentedControl
          :model-value="editorStore.draftChord.fretCount"
          :options="fretOptions"
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
          wheel-on-hover
          width="auto"
        />
      </BaseFormRow>

      <BaseFormRow label="调音方案">
        <BaseSelector
          v-model="editorStore.draftChord.tuning"
          :default-value="Tuning.STANDARD"
          :format-option="formatTuningOption"
          :options="tuningOptions"
          clearable
          keep-open-on-select
          rolling-text
        />
      </BaseFormRow>

      <BaseFormRow help="指板有可横按弦组时自动标记" label="自动横按">
        <BaseSwitch v-model="editorStore.autoBarre" aria-label="自动标记横按" />
      </BaseFormRow>
    </BaseForm>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { Tuning, TUNING_PRESETS } from '@/domains/chord/theory/theory';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/domains/fretboard/constants';

import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

const editorStore = useChordEditorStore();

/** 品数档位类型：与 Chord['fretCount'] 同源，取自 FRET_COUNTS 的字面量联合（3 | 4 | 5） */
type FretCount = (typeof FRET_COUNTS)[number];

/**
 * 可选品数段选项（品数档位单一来源见 FRET_COUNTS）。
 * 必须挂在字面量联合上：写成 SegmentOption<number> 会把品数抹成宽类型 number，
 * 分段控件的绑值类型由选项推导（见 SegmentOptionValue），跟着一起退化——
 * setFretCount 收到 number 而非 3|4|5，等于放弃了品数档位的编译期校验。
 */
const fretOptions = computed<SegmentOption<FretCount>[]>(() => FRET_COUNTS.map(f => ({ label: `${f}品`, value: f })));

/** 调音方案选项：仅列出与当前弦数匹配的预设 */
const tuningOptions = computed(() =>
  (Object.keys(TUNING_PRESETS) as Tuning[]).filter(t => TUNING_PRESETS[t]?.stringCount === editorStore.stringCount)
);

/** 调音方案格式化为预设名（无匹配时回退标准调弦），供调音选择器展示 */
const formatTuningOption = (val: string | number) =>
  (typeof val === 'string' ? TUNING_PRESETS[val as Tuning]?.name : undefined) || Tuning.STANDARD;
</script>
