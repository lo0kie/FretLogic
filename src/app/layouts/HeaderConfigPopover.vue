<template>
  <div
    v-scrollbar="{ endInset: 8 }"
    :style="maskStyle"
    @scroll="syncEdgeFades()"
    class="config-popover-card box-border flex max-h-80 w-[360px] flex-col gap-1 p-lg outline-none"
    ref="scrollRef"
  >
    <template v-if="isScoreRoute">
      <BaseCollapse
        :expanded="scoreOpenGroup === 'layout'"
        @update:expanded="toggleScoreGroup('layout', $event)"
        title="排版"
      >
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
            size="sm"
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
            size="sm"
          />
        </BaseFormRow>
      </BaseCollapse>

      <BaseCollapse
        :expanded="scoreOpenGroup === 'display'"
        @update:expanded="toggleScoreGroup('display', $event)"
        title="显示"
      >
        <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
          <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" size="sm" />
        </BaseFormRow>

        <BaseFormRow help="关闭后指板图仅保留按弦圆点" label="显示横按">
          <BaseSwitch v-model="settingsStore.scoreShowBarre" aria-label="是否显示大横按" size="sm" />
        </BaseFormRow>
      </BaseCollapse>

      <BaseCollapse
        v-if="isPreviewTab"
        :expanded="scoreOpenGroup === 'export'"
        @update:expanded="toggleScoreGroup('export', $event)"
        title="版面"
      >
        <BaseFormRow label="乐谱对齐">
          <BaseSegmentedControl
            v-model="settingsStore.scoreLayoutAlign"
            :options="[
              { value: 'start', label: '起始位置' },
              { value: 'center', label: '居中对齐' },
            ]"
            size="sm"
          />
        </BaseFormRow>

        <BaseFormRow label="歌词字重">
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

        <BaseFormRow help="标准单页尺寸，A4/Letter 常用于打印输出" label="单页尺寸">
          <BaseSegmentedControl
            v-model="settingsStore.scorePageSize"
            :options="SCORE_PAGE_SIZE_PRESETS.map(p => ({ label: p.label, value: p.id }))"
            compacted
            size="sm"
          />
        </BaseFormRow>

        <BaseFormRow label="页边距">
          <BaseSegmentedControl
            v-model="settingsStore.scorePageMargin"
            :options="SCORE_PAGE_MARGIN_PRESETS.map(p => ({ label: p.label, value: p.value }))"
            compacted
            size="sm"
          />
        </BaseFormRow>

        <BaseFormRow help="JPEG 压缩质量，越高越清晰" label="导出质量">
          <BaseSlider
            v-model.lazy="settingsStore.scoreExportQuality"
            :default-value="95"
            :formatter="val => `${Math.round(val)}%`"
            :max="100"
            :min="30"
            :show-buttons="false"
            :step="5"
            bordered
            readout-position="left"
            size="sm"
          />
        </BaseFormRow>
      </BaseCollapse>
    </template>

    <template v-else>
      <BaseCollapse
        :expanded="workbenchOpenGroup === 'timbre'"
        @update:expanded="toggleWorkbenchGroup('timbre', $event)"
        title="音色"
      >
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
            size="sm"
          />
        </BaseFormRow>
      </BaseCollapse>

      <BaseCollapse
        :expanded="workbenchOpenGroup === 'effect'"
        @update:expanded="toggleWorkbenchGroup('effect', $event)"
        title="效果"
      >
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
            size="sm"
          />
        </BaseFormRow>

        <BaseFormRow help="开启后每弦力度与触发时机带随机拟真" label="力度随机">
          <BaseSwitch v-model="settingsStore.audioPlayback.humanize" aria-label="扫弦力度随机拟真" size="sm" />
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
            size="sm"
          />
        </BaseFormRow>

        <BaseFormRow help="为试听音色添加合唱摆动效果" label="合唱">
          <BaseSwitch v-model="settingsStore.audioPlayback.chorusEnabled" aria-label="合唱效果" size="sm" />
        </BaseFormRow>
      </BaseCollapse>

      <BaseCollapse
        :expanded="workbenchOpenGroup === 'display'"
        @update:expanded="toggleWorkbenchGroup('display', $event)"
        title="显示"
      >
        <BaseFormRow help="仅工作台生效" label="符号简写 (M/°/+)">
          <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" size="sm" />
        </BaseFormRow>
      </BaseCollapse>
    </template>
  </div>
</template>

<script lang="ts">
// 双 script 块：imports 整体置于首个块顶部（import/first）；
// 折叠分组展开态声明于模块作用域（而非 <script setup> 体内），实现会话级记忆——重开设置弹窗
// 仍停留上次展开的分组，且乐谱/工作台两 tab 各自独立、互不干扰；<script setup> 经别名暴露给模板。
import { computed, ref, useTemplateRef } from 'vue';

import { useRoute } from 'vue-router';

import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { SCORE_PAGE_MARGIN_PRESETS, SCORE_PAGE_SIZE_PRESETS } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useScrollEdgeFades } from '@/platform/composables/useScrollEdgeFades';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';

/** 乐谱页折叠分组展开项（排他手风琴：会话级记忆，重开仍停留原分组，可收起至全部折叠）。
 *  按编辑 tab（排列和弦）与预览 tab 分维度记忆，两 tab 各自独立、互不共用 */
const scoreEditOpenGroupState = ref<'' | 'layout' | 'display' | 'export'>('layout');
const scorePreviewOpenGroupState = ref<'' | 'layout' | 'display' | 'export'>('layout');
/** 工作台页折叠分组展开项（排他手风琴：会话级记忆，重开仍停留原分组，可收起至全部折叠） */
const workbenchOpenGroupState = ref<'' | 'timbre' | 'effect' | 'display'>('timbre');
</script>

<script setup lang="ts">
const scrollRef = useTemplateRef('scrollRef');
const { syncEdgeFades, maskStyle } = useScrollEdgeFades(scrollRef);
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const route = useRoute();
/** 乐谱专属子项（缩放/对齐/简写）仅在乐谱页显示；音频项在工作台显示 */
const isScoreRoute = computed(() => route.path === ROUTE_PATHS.SCORE);
/** 乐谱对齐仅在预览 tab 显示（对齐排版只作用于预览/导出图片） */
const isPreviewTab = computed(() => route.path === ROUTE_PATHS.SCORE && scoreEditor.activeTab === 'preview');
/** 会话级展开态：按当前 tab（排列和弦 / 预览）取对应维度记忆，暴露给模板（重开弹窗不重置） */
const scoreOpenGroup = computed(() =>
  isPreviewTab.value ? scorePreviewOpenGroupState.value : scoreEditOpenGroupState.value
);
const workbenchOpenGroup = workbenchOpenGroupState;

/** 切换乐谱页分组：展开即排他选中该组，收起（value=false）则回到全部折叠；按当前 tab 记忆到对应维度 */
function toggleScoreGroup(group: '' | 'layout' | 'display' | 'export', value: boolean) {
  const target = isPreviewTab.value ? scorePreviewOpenGroupState : scoreEditOpenGroupState;
  target.value = value ? group : '';
}

/** 切换工作台页分组：展开即排他选中该组，收起（value=false）则回到全部折叠 */
function toggleWorkbenchGroup(group: '' | 'timbre' | 'effect' | 'display', value: boolean) {
  workbenchOpenGroupState.value = value ? group : '';
}
</script>
