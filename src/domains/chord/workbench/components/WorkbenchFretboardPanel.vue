<template>
  <div class="flex flex-col gap-sm">
    <!-- 指板设置：管的就是左侧那块交互指板本身（品数窗口 / 品位偏移 / 调音 / 自动横按），
         原挂在顶部设置弹窗的「指板」分组里，与指板隔了一层浮层；收进工作台面板后与指板同屏，
         调完即刻看见指板变化。
         两类设置的作用域不同，必须用小标题在视觉上分开——此前五行同构、外观无差，
         用户无从判断「改了这一项会不会影响别的和弦」：
         「当前和弦」三项绑定 draftChord，随草稿走（切和弦即换）；
         「全局偏好」两项写进 store，改一次影响所有和弦。
         小标题刻意做成「短标签 + 尾部横线」，而不是靠加大字号：本面板字号区间极窄
         （字段标签 2xs/10px、面板标题 xs/12px），10↔12px 之间分不出第三级——写成 2xs 会与字段标签
         同尺寸，写成 xs 又会与面板标题同尺寸，两种都试过、都被指出撞车。故改用结构区分：
         文字保持 2xs（明显小于面板标题），靠「后接一条横线」读成分区栏，与纯文字的字段标签、
         带图标与 chevron 的面板标题都不会混淆。 -->
    <div class="flex flex-col gap-xs">
      <div class="flex items-center gap-2">
        <span class="shrink-0 text-2xs font-semibold text-fg-body">当前和弦</span>
        <!-- 用一层 flex-1 容器承接：BaseDivider 不传 length 时自带 w-full，
             与 flex-1 同时存在会形成「谁生效取决于 flex-basis 覆盖」的隐式依赖，显式包裹更稳 -->
        <div class="flex-1"><BaseDivider /></div>
      </div>
      <BaseForm class="px-2xs" gap="sm" label-size="2xs" label-tone="muted" size="sm">
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
      </BaseForm>
    </div>

    <!-- 组间分隔线：与上方「标题 + 尾部横线」的分区栏是两种角色，不要合并——
         分区栏贴在标题右侧，用于「认出这是一段的分区栏」；这条横线跨满整宽，
         用于「看清两段在哪分开」。 -->
    <div class="flex flex-col gap-xs">
      <div class="flex items-center gap-2">
        <span class="shrink-0 text-2xs font-semibold text-fg-body">全局偏好</span>
        <div class="flex-1"><BaseDivider /></div>
      </div>
      <BaseForm class="px-2xs" gap="sm" label-size="2xs" label-tone="muted" size="sm">
        <BaseFormRow help="指板有可横按弦组时自动标记" label="自动横按">
          <BaseSwitch v-model="editorStore.autoBarre" aria-label="自动标记横按" />
        </BaseFormRow>

        <BaseFormRow help="工作台面板的和弦名" label="符号简写 (M/°/+)">
          <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" />
        </BaseFormRow>
      </BaseForm>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { Tuning, TUNING_PRESETS } from '@/domains/chord/theory/theory';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/domains/fretboard/constants';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();

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
