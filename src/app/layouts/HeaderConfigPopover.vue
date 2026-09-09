<template>
  <div
    v-scrollbar="{ endInset: 8 }"
    :style="maskStyle"
    @scroll="handleScroll()"
    class="config-popover-card flex max-h-80 w-[360px] flex-col gap-1 p-md outline-none"
    ref="scrollRef"
  >
    <template v-if="isScoreRoute">
      <BaseCollapse
        :class="scoreOpenGroup === 'layout' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="scoreOpenGroup === 'layout'"
        @update:expanded="toggleScoreGroup('layout', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="layout"
        icon="type"
        icon-size="xl"
        title="排版"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
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
        </BaseForm>
      </BaseCollapse>

      <BaseCollapse
        :class="scoreOpenGroup === 'display' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="scoreOpenGroup === 'display'"
        @update:expanded="toggleScoreGroup('display', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="display"
        icon="eye"
        icon-size="xl"
        title="显示"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
          <BaseFormRow help="仅乐谱生效" label="符号简写 (M/°/+)">
            <BaseSwitch v-model="settingsStore.scoreChordShorthand" aria-label="乐谱符号简写" />
          </BaseFormRow>

          <BaseFormRow help="关闭后指板图仅保留按弦圆点" label="显示横按">
            <BaseSwitch v-model="settingsStore.scoreShowBarre" aria-label="是否显示大横按" />
          </BaseFormRow>
        </BaseForm>
      </BaseCollapse>

      <BaseCollapse
        v-if="isPreviewTab"
        :class="scoreOpenGroup === 'export' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="scoreOpenGroup === 'export'"
        @update:expanded="toggleScoreGroup('export', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="export"
        icon="layout-template"
        icon-size="xl"
        title="版面"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
          <BaseFormRow label="乐谱对齐">
            <BaseSegmentedControl
              v-model="settingsStore.scoreLayoutAlign"
              :options="[
                { value: 'start', label: '起始位置' },
                { value: 'center', label: '居中对齐' },
              ]"
              compacted
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
              compacted
            />
          </BaseFormRow>

          <BaseFormRow help="A4 分页预览底部居中显示页码" label="显示页脚">
            <BaseSwitch v-model="settingsStore.scoreShowFooter" aria-label="是否显示页脚页码" />
          </BaseFormRow>

          <BaseFormRow help="标准单页尺寸，A4/Letter 常用于打印输出" label="单页尺寸">
            <BaseSegmentedControl
              v-model="settingsStore.scorePageSize"
              :options="SCORE_PAGE_SIZE_PRESETS.map(p => ({ label: p.label, value: p.id }))"
              compacted
            />
          </BaseFormRow>

          <BaseFormRow label="页边距">
            <BaseSegmentedControl
              v-model="settingsStore.scorePageMargin"
              :options="SCORE_PAGE_MARGIN_PRESETS.map(p => ({ label: p.label, value: p.value }))"
              compacted
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
            />
          </BaseFormRow>
        </BaseForm>
      </BaseCollapse>
    </template>

    <template v-else>
      <BaseCollapse
        :class="workbenchOpenGroup === 'timbre' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="workbenchOpenGroup === 'timbre'"
        @update:expanded="toggleWorkbenchGroup('timbre', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="timbre"
        icon="audio-lines"
        icon-size="xl"
        title="音色"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
          <BaseFormRow help="和弦试听音色" label="音色">
            <BaseSegmentedControl
              v-model="settingsStore.audioPlayback.timbre"
              :options="[
                { value: 'standard', label: '标准' },
                { value: 'soft', label: '柔和' },
                { value: 'bright', label: '明亮' },
                { value: 'pluck', label: '拨弦' },
              ]"
              compacted
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
              compacted
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
        </BaseForm>
      </BaseCollapse>

      <BaseCollapse
        :class="workbenchOpenGroup === 'effect' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="workbenchOpenGroup === 'effect'"
        @update:expanded="toggleWorkbenchGroup('effect', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="effect"
        icon="audio-waveform"
        icon-size="xl"
        title="效果"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
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

          <BaseFormRow help="开启后每弦力度与触发时机带随机拟真" label="力度随机">
            <BaseSwitch v-model="settingsStore.audioPlayback.humanize" aria-label="扫弦力度随机拟真" />
          </BaseFormRow>

          <BaseFormRow help="为试听音色添加合唱摆动效果" label="合唱">
            <BaseSwitch v-model="settingsStore.audioPlayback.chorusEnabled" aria-label="合唱效果" />
          </BaseFormRow>
        </BaseForm>
      </BaseCollapse>

      <BaseCollapse
        :class="workbenchOpenGroup === 'display' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="workbenchOpenGroup === 'display'"
        @update:expanded="toggleWorkbenchGroup('display', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="display"
        icon="eye"
        icon-size="xl"
        title="显示"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
          <BaseFormRow help="仅工作台生效" label="符号简写 (M/°/+)">
            <BaseSwitch v-model="settingsStore.workbenchChordShorthand" aria-label="工作台符号简写" />
          </BaseFormRow>
        </BaseForm>
      </BaseCollapse>

      <BaseCollapse
        :class="workbenchOpenGroup === 'fretboard' ? 'bg-tint-panelhover-50!' : ''"
        :expanded="workbenchOpenGroup === 'fretboard'"
        @update:expanded="toggleWorkbenchGroup('fretboard', $event)"
        initial-auto
        class="scroll-mt-2"
        data-collapse-key="fretboard"
        icon="guitar"
        icon-size="xl"
        title="指板"
      >
        <BaseForm gap="sm" label-size="2xs" label-tone="title" size="sm">
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
              :format-option="formatTuningOption"
              :options="tuningOptions"
              clearable
              keep-open-on-select
              width="md"
            />
          </BaseFormRow>

          <BaseFormRow help="指板有可横按弦组时自动标记" label="自动横按">
            <BaseSwitch v-model="editorStore.autoBarre" aria-label="自动标记横按" />
          </BaseFormRow>
        </BaseForm>
      </BaseCollapse>
    </template>
  </div>
</template>

<script lang="ts">
// 双 script 块：imports 整体置于首个块顶部（import/first）；
// 折叠分组展开态声明于模块作用域（而非 <script setup> 体内），实现会话级记忆——重开设置弹窗
// 仍停留上次展开的分组，且乐谱/工作台两 tab 各自独立、互不干扰；<script setup> 经别名暴露给模板。
import { computed, ref, useTemplateRef, watch } from 'vue';

import { useRoute } from 'vue-router';

import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import BaseSwitch from '@/platform/ui/switch/BaseSwitch.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { Tuning, TUNING_PRESETS } from '@/domains/chord/theory/theory';
import { FRET_COUNTS, INTERACTION_CONFIG } from '@/domains/fretboard/constants';
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
const workbenchOpenGroupState = ref<'' | 'timbre' | 'effect' | 'display' | 'fretboard'>('timbre');
/** 会话级滚动位置记忆：关闭/重开设置弹窗仍返回上次滚动位置（浮层 v-if 销毁重建容器，避免"闪回顶部"） */
const scoreScrollTopState = ref(0);
const workbenchScrollTopState = ref(0);
</script>

<script setup lang="ts">
const scrollRef = useTemplateRef('scrollRef');
const { syncEdgeFades, maskStyle } = useScrollEdgeFades(scrollRef);
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const editorStore = useChordEditorStore();
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
  if (value) scrollGroupIntoView(group);
}

/** 切换工作台页分组：展开即排他选中该组，收起（value=false）则回到全部折叠 */
function toggleWorkbenchGroup(group: '' | 'timbre' | 'effect' | 'display' | 'fretboard', value: boolean) {
  workbenchOpenGroupState.value = value ? group : '';
  if (value) scrollGroupIntoView(group);
}

/**
 * 打开分组后待高度过渡（--duration-base: 0.18s）稳定，再把该分组头部滚入弹层可视区顶部（策略 B）。
 * 之所以延迟再滚：若在过渡中途滚动，scrollIntoView 量到的是动画中的中间态高度，最终落点会偏移。
 * 折叠头经 BaseCollapse 的 $attrs 落到 <button> 本体，故可直接以 data-collapse-key 查询该按钮。
 */
function scrollGroupIntoView(group: string) {
  const target = scrollRef.value?.querySelector<HTMLElement>(`[data-collapse-key="${group}"]`);
  if (!target) return;
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 220);
}

/** 调音方案选项：仅列出与当前弦数匹配的预设 */
const tuningOptions = computed(() =>
  (Object.keys(TUNING_PRESETS) as Tuning[]).filter(t => TUNING_PRESETS[t]?.stringCount === editorStore.stringCount)
);
/** 可选品数段选项 */
const FRET_OPTIONS = computed(() => FRET_COUNTS.map(f => ({ label: `${f}品`, value: f })));
/** 调音方案格式化为预设名（无匹配时回退标准调弦），供调音选择器展示 */
const formatTuningOption = (val: string | number) =>
  (typeof val === 'string' ? TUNING_PRESETS[val as Tuning]?.name : undefined) || Tuning.STANDARD;

/** 按当前路由维度读取会话级滚动位置（乐谱/工作台各自独立记忆，高度不同避免交错钳位） */
const getSessionScrollTop = () => (isScoreRoute.value ? scoreScrollTopState : workbenchScrollTopState).value;
/** 写入当前路由维度对应的会话级滚动位置 */
const setSessionScrollTop = (top: number) => {
  (isScoreRoute.value ? scoreScrollTopState : workbenchScrollTopState).value = top;
};

/** 滚动时刷新边缘渐隐遮罩，并维护会话级滚动位置 */
function handleScroll() {
  const el = scrollRef.value;
  if (el) setSessionScrollTop(el.scrollTop);
  syncEdgeFades();
}

/**
 * 浮层以 v-if 在重建/换绑容器后默认 scrollTop=0，这里在容器重建（scrollRef 换绑）后立即恢复
 * 会话级滚动位置，保证重新打开时不闪回顶部。
 *
 * 历史说明：此处曾有一套「MutationObserver 监听 -leave- 类 + rAF 逐帧贴回 scrollTop」的离场保持机制，
 * 用于对抗"关闭瞬间浏览器把 scrollTop 静默钳回 0"。逐帧采样（scrollTop / scrollHeight / clientHeight /
 * computed overflow-y）证明该假设不成立：关闭期间 scroll 事件正常派发、可滚动空间始终充裕，
 * 真正原因是 v-scrollbar 卸载时摘掉内联 overflow-y，导致元素 scrolling box 被销毁、scrollTop 随之丢弃。
 * 根因已在 vScrollbar.ts 修复，故这套逐帧纠偏机制一并移除。
 */
watch(
  scrollRef,
  el => {
    if (el) el.scrollTop = getSessionScrollTop();
  },
  { flush: 'post' }
);
</script>
