<template>
  <div class="pointer-events-auto absolute inset-0 z-content overflow-hidden">
    <div class="relative flex size-full items-start overflow-auto px-2xl pt-2xl pb-3xl">
      <!-- 交互指板卡片：点击/编辑即写和弦草稿，含横按标记与和弦名直改 -->
      <div
        class="pointer-events-auto relative z-base mx-auto flex shrink-0 flex-col items-center justify-evenly rounded-md border border-glass-border bg-surface-panel/90 px-2xl py-xl shadow-panel backdrop-blur-lg transition-[border-color,box-shadow] duration-slow ease-sidebar hover:border-border-base hover:shadow-lg hover:delay-150"
      >
        <Fretboard
          :chord="editorStore.draftChord"
          @update:barres="handleBarresChange($event)"
          @update:chord-name="handleChordNameChange($event)"
          @update:fret-offset="handleFretOffsetUpdate($event)"
          @update:name-segments="handleNameSegmentsChange($event)"
          @update:root-string-index="handleRootStringChange($event)"
          @update:strings="handleStringsChange($event)"
        />
      </div>

      <!-- 右侧卡片列：外层定位且不滚动，内层承载滚动。
           内容边缘用 mask-image 透明渐变柔化（不依赖背景色的 overlay 渐隐，任何背景/玻璃态下无色带）：
           · 未滚动（scrollTop===0）时顶部不遮罩 → 首卡完整可见、与指板顶对齐
           · 上滚后顶部渐隐显示，柔化滚出内容的切口
           · 底部仅未滚到底时渐隐，滚到底自动取消 → 末卡不被遮挡
           列顶 top-8（32px）与指板同高，滚动时卡片最多上移到 32px，不会比指板更高 -->
      <div class="pointer-events-auto absolute inset-y-2xl right-8 z-panel">
        <BaseScrollArea :scrollbar="{ endInset: 12 }" close-popovers axis="y" class="flex size-full w-72 flex-col">
          <!-- 面板列表：拖拽排序容器，其直接子元素即四张面板卡片。
               刻意不把排序容器与滚动宿主合并：滚动宿主是 v-scrollbar 的书写目标（加宿主类 + 写内联
               overflow），而 Sortable 会把容器的直接子元素一律当成可排序项，两种语义不该共用一个节点。
               shrink-0 必需——本容器是滚动宿主的唯一 flex 子项，若能收缩则永远滚不动。 -->
          <div class="flex w-full shrink-0 flex-col items-stretch gap-lg *:shrink-0" ref="panelListRef">
            <!-- 面板卡片外壳：由 View 统一封装（卡片 chrome + 折叠 + 展开态持久化），各业务面板保持纯内容。
       useWorkbenchPanelExpanded 为 composable（内部封装 useStorage），在此调用符合项目约束 -->
            <div
              v-for="panelId in panels"
              :key="panelId"
              class="w-full overflow-hidden rounded-xl border border-glass-border bg-surface-panel p-xs"
            >
              <BaseCollapse
                :description="PANEL_META[panelId].description"
                :expanded="getPanelExpanded(panelId)"
                :icon="PANEL_META[panelId].icon"
                :title="PANEL_META[panelId].title"
                @update:expanded="setPanelExpanded(panelId, $event)"
                initial-auto
                class="panel-title-row"
              >
                <!-- 简写偏好显式传给「和弦分析」面板（其余面板传 undefined 不产生多余属性）：
                   简写只对工作台场景开放，由本视图按场景传入，组件与指令均不自行读取设置 -->
                <component
                  :is="PANEL_COMPONENT_MAP[panelId]"
                  :shorthand="panelId === 'analysis' ? settingsStore.workbenchChordShorthand : undefined"
                />
              </BaseCollapse>
            </div>
          </div>
        </BaseScrollArea>
      </div>
    </div>

    <!-- 保存操作栏：仅草稿有改动时浮现，随指板品位数调整贴底位置 -->
    <BaseFloatingPill :bottom="barBottomPosition" :visible="!isPristine">
      <ActionButton
        :disabled="isPristine"
        :label="editorStore.isEditing ? '放弃修改' : '重置指板'"
        @click="editorStore.resetEditor"
        variant="ghost"
      />

      <template v-if="editorStore.isEditing">
        <BaseDivider
          class="rounded-full opacity-60"
          color="base"
          length="1rem"
          orientation="vertical"
          thickness="0.125rem"
        />
        <ActionButton @click="chordActions.saveAsNewChord" label="作为新和弦保存" variant="ghost" />
      </template>

      <BaseDivider
        class="rounded-full opacity-60"
        color="base"
        length="1rem"
        orientation="vertical"
        thickness="0.125rem"
      />

      <ActionButton
        :disabled="isSaveDisabled"
        :label="editorStore.isEditing ? '更新保存' : '确认保存'"
        @click="chordActions.persistCurrentChord"
        color="primary"
        variant="subtle"
      />
    </BaseFloatingPill>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import Fretboard from '@/domains/fretboard/components/Fretboard.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseFloatingPill from '@/platform/ui/floating-bar/BaseFloatingPill.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import {
  useChordDraftEditing,
  useChordDraftSaveState,
} from '@/domains/chord/workbench/composables/useChordDraftEditing';
import { useWorkbenchPanelExpanded } from '@/domains/chord/workbench/composables/useWorkbenchPanelExpanded';
import { useWorkbenchPanelsOrder } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder.ts';
import { useWorkbenchRouteSync } from '@/domains/chord/workbench/composables/useWorkbenchRouteSync';
import { getFloatingBarBottom } from '@/domains/fretboard/constants';
import { useSortableList } from '@/platform/composables/useSortableList';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchExportPanel from './WorkbenchExportPanel.vue';
import WorkbenchFretboardPanel from './WorkbenchFretboardPanel.vue';
import WorkbenchVariantsPanel from './WorkbenchVariantsPanel.vue';

import type { WorkbenchPanelId } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder.ts';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Component, Ref } from 'vue';

const PANEL_COMPONENT_MAP: Record<WorkbenchPanelId, Component> = {
  analysis: ChordAnalysisPanel,
  variants: WorkbenchVariantsPanel,
  export: WorkbenchExportPanel,
  fretboard: WorkbenchFretboardPanel,
};

/**
 * 各面板的卡片元数据：图标 + 标题 + 行尾小标题（description）+ 展开持久化键。
 * 小标题走 BaseCollapse 的 description（标题右侧小字弱色，空间不足时先截断它、标题保持完整），
 * 用于一眼区分四张同构卡片里装的是什么——标题只两三个字，光看标题分不清内容边界。
 */
const PANEL_META: Record<WorkbenchPanelId, { icon: IconName; title: string; description: string; storageKey: string }> =
  {
    fretboard: {
      icon: 'guitar',
      title: '指板设置',
      description: '品数与调音',
      storageKey: STORAGE_KEYS.WORKBENCH_FRETBOARD_COLLAPSED,
    },
    variants: {
      icon: 'git-branch',
      title: '多指法',
      description: '候选把位',
      storageKey: STORAGE_KEYS.WORKBENCH_VARIANTS_COLLAPSED,
    },
    analysis: {
      icon: 'chart-column',
      title: '和弦分析',
      description: '候选名与音级',
      storageKey: STORAGE_KEYS.WORKBENCH_CHORD_ANALYSIS_COLLAPSED,
    },
    export: {
      icon: 'image-down',
      title: '导出图片',
      description: 'PNG 与背景',
      storageKey: STORAGE_KEYS.WORKBENCH_EXPORT_COLLAPSED,
    },
  };

/** 展开态持久化：每面板独立实例（v-for 循环内不能调用 hook，故按 panelId 逐一索引调用） */
const panelExpanded: Record<WorkbenchPanelId, Ref<boolean>> = {
  fretboard: useWorkbenchPanelExpanded(PANEL_META.fretboard.storageKey),
  analysis: useWorkbenchPanelExpanded(PANEL_META.analysis.storageKey),
  variants: useWorkbenchPanelExpanded(PANEL_META.variants.storageKey),
  export: useWorkbenchPanelExpanded(PANEL_META.export.storageKey),
};

/** 读写面板展开态（模板里索引访问不会自动解包 ref，经 getter/setter 存取显式解包） */
const getPanelExpanded = (id: WorkbenchPanelId): boolean => panelExpanded[id].value;
const setPanelExpanded = (id: WorkbenchPanelId, value: boolean): void => {
  panelExpanded[id].value = value;
};

const { panels, setOrder } = useWorkbenchPanelsOrder();

/** 拖拽排序容器：四张面板卡片的直接父节点（与滚动宿主刻意分开，理由见模板注释） */
const panelListRef = useTemplateRef<HTMLElement>('panelListRef');

// 面板顺序拖拽排序：把手限定在折叠头（标题行），不与面板内容的手势竞争。
// 空列表守卫、容器就绪后再建实例、disabled 的响应式跟随，以及「Sortable 只搬 DOM、
// 新顺序交给宿主落盘」的约定都由 useSortableList 承担。
// 顺序经 setOrder 写回 WORKBENCH_PANEL_ORDER（内部已含 sanitizePanelOrder 校验、去重与默认项补齐）
useSortableList<WorkbenchPanelId>({
  target: panelListRef,
  items: panels,
  enabled: true,
  handle: '.panel-title-row',
  onReorder: next => setOrder(next),
});

/** 工作台偏好：简写开关只在本视图内显式下发给需要它的面板，不扩散到全局推断 */
const settingsStore = useSettingsStore();

// ==================== 指板交互草稿编辑 ====================

/** 和弦草稿编辑：Fretboard 读写 draftChord（交互写入逻辑抽至 useChordDraftEditing 供选器和弦抽屉共用） */
const editorStore = useChordEditorStore();
const {
  handleBarresChange,
  handleChordNameChange,
  handleFretOffsetUpdate,
  handleNameSegmentsChange,
  handleRootStringChange,
  handleStringsChange,
} = useChordDraftEditing();

/** 保存操作栏状态：草稿洁净度决定浮现与否，保存可用性由编辑态派生 */
const chordActions = useChordActions();
const { isPristine, isSaveDisabled } = useChordDraftSaveState();
const barBottomPosition = computed(() => getFloatingBarBottom(editorStore.draftChord.fretCount));

// URL ↔ Store 状态同构（#/workbench?group=&chord=&v=）：本组件注册双向 watcher 与 KeepAlive 重激活回放
useWorkbenchRouteSync();
</script>
