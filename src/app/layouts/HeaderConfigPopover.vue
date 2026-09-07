<template>
  <div class="config-popover-card box-border flex w-[360px] flex-col gap-lg p-lg outline-none">
    <template v-if="isScoreRoute">
      <BaseFormRow label="字号缩放">
        <BaseSlider
          v-model.lazy="scoreEditor.fontScale"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
          :max="1.5"
          :min="0.6"
          :show-buttons="false"
          :step="0.05"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow label="和弦缩放">
        <BaseSlider
          v-model.lazy="scoreEditor.fretboardScale"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
          :max="1.5"
          :min="0.6"
          :show-buttons="false"
          :step="0.1"
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

      <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
        <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
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
          :default-value="0.2"
          :formatter="val => `${Math.round(val * 100)}%`"
          :max="1"
          :min="0"
          :show-buttons="false"
          :step="0.05"
          bordered
          readout-position="left"
        />
      </BaseFormRow>

      <BaseFormRow help="为试听音色添加合唱摆动效果" label="合唱">
        <BaseSwitch v-model="settingsStore.audioPlayback.chorusEnabled" aria-label="合唱效果" />
      </BaseFormRow>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useRoute } from 'vue-router';

import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const route = useRoute();
/** 乐谱专属子项（缩放/对齐/简写）仅在乐谱页显示；音频项在工作台显示 */
const isScoreRoute = computed(() => route.path === ROUTE_PATHS.SCORE);
/** 乐谱对齐仅在预览 tab 显示（对齐排版只作用于预览/导出图片） */
const isPreviewTab = computed(() => route.path === ROUTE_PATHS.SCORE && scoreEditor.activeTab === 'preview');
</script>
