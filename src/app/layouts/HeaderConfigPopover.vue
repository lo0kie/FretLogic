<template>
  <div
    v-scrollbar="{ endInset: 8 }"
    :style="maskStyle"
    @scroll="syncEdgeFades()"
    class="config-popover-card box-border flex max-h-80 w-[360px] flex-col gap-lg p-lg outline-none"
    ref="scrollRef"
  >
    <template v-if="isScoreRoute">
      <BaseFormRow label="字号缩放">
        <BaseSlider
          v-model.lazy="scoreEditor.fontScale"
          :default-value="100"
          :formatter="val => `${Math.round(val)}%`"
          :max="150"
          :min="60"
          :show-buttons="false"
          :step="5"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow label="和弦缩放">
        <BaseSlider
          v-model.lazy="scoreEditor.fretboardScale"
          :default-value="100"
          :formatter="val => `${Math.round(val)}%`"
          :max="150"
          :min="60"
          :show-buttons="false"
          :step="5"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow v-if="isPreviewTab" help="导出与预览对齐排版" label="乐谱对齐">
        <BaseSegmentedControl
          v-model="settingsStore.scoreLayoutAlign"
          :options="[
            { value: 'start', label: '起始位置' },
            { value: 'center', label: '居中对齐' },
          ]"
          size="sm"
        />
      </BaseFormRow>

      <BaseFormRow v-if="isPreviewTab" help="仅影响预览与导出图片的歌词文字" label="歌词字重">
        <BaseSegmentedControl
          v-model="settingsStore.scoreLyricsFontWeight"
          :options="[
            { value: 'light', label: '细' },
            { value: 'regular', label: '常规' },
            { value: 'bold', label: '粗' },
          ]"
          size="sm"
        />
      </BaseFormRow>

      <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
        <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
      </BaseFormRow>

      <BaseFormRow help="关闭后指板图仅保留按弦圆点" label="显示横按">
        <BaseSwitch v-model="settingsStore.scoreShowBarre" aria-label="是否显示大横按" />
      </BaseFormRow>
    </template>

    <template v-else>
      <BaseFormRow help="和弦试听音色" label="音色">
        <BaseSegmentedControl
          v-model="settingsStore.audioPlayback.timbre"
          :options="[
            { value: 'standard', label: '标准' },
            { value: 'soft', label: '柔和' },
            { value: 'bright', label: '明亮' },
            { value: 'pluck', label: '拨弦' },
          ]"
          size="sm"
        />
      </BaseFormRow>

      <BaseFormRow help="扫弦相邻弦触发间隔" label="弦间间隔">
        <BaseSlider
          v-model="settingsStore.audioPlayback.strumDelayMs"
          :default-value="60"
          :formatter="val => `${Math.round(val)}ms`"
          :max="150"
          :min="20"
          :show-buttons="false"
          :step="5"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow help="和弦试听音量" label="试听音量">
        <BaseSlider
          v-model="settingsStore.audioPlayback.volumeDb"
          :default-value="-8"
          :formatter="val => `${Math.round(val)}dB`"
          :max="0"
          :min="-30"
          :show-buttons="false"
          :step="2"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow help="扫弦方向（由内向外：从中音弦向两侧交替展开）" label="扫弦方向">
        <BaseSegmentedControl
          v-model="settingsStore.audioPlayback.strumDirection"
          :options="[
            { value: 'low', label: '下扫' },
            { value: 'high', label: '上扫' },
            { value: 'inside-out', label: '由内向外' },
          ]"
          size="sm"
        />
      </BaseFormRow>

      <BaseFormRow help="开启后每弦力度与触发时机带随机拟真" label="力度随机">
        <BaseSwitch v-model="settingsStore.audioPlayback.humanize" aria-label="扫弦力度随机拟真" />
      </BaseFormRow>

      <BaseFormRow help="混响尾音占比" label="混响">
        <BaseSlider
          v-model="settingsStore.audioPlayback.reverbWet"
          :default-value="20"
          :formatter="val => `${Math.round(val)}%`"
          :max="100"
          :min="0"
          :show-buttons="false"
          :step="5"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow help="为试听音色添加合唱摆动效果" label="合唱">
        <BaseSwitch v-model="settingsStore.audioPlayback.chorusEnabled" aria-label="合唱效果" />
      </BaseFormRow>

      <BaseFormRow help="仅工作台生效" label="符号简写 (M/°/+)">
        <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" />
      </BaseFormRow>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import { useRoute } from 'vue-router';

import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useScrollEdgeFades } from '@/platform/composables/useScrollEdgeFades';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';

const scrollRef = useTemplateRef('scrollRef');
const { syncEdgeFades, maskStyle } = useScrollEdgeFades(scrollRef);
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const route = useRoute();
/** 乐谱专属子项（缩放/对齐/简写）仅在乐谱页显示；音频项在工作台显示 */
const isScoreRoute = computed(() => route.path === ROUTE_PATHS.SCORE);
/** 乐谱对齐仅在预览 tab 显示（对齐排版只作用于预览/导出图片） */
const isPreviewTab = computed(() => route.path === ROUTE_PATHS.SCORE && scoreEditor.activeTab === 'preview');
</script>
