<template>
  <div class="pointer-events-auto absolute inset-0 z-content overflow-hidden">
    <div class="relative flex size-full items-start overflow-auto p-2xl">
      <!-- 交互指板卡片：点击/编辑即写和弦草稿，含横按标记与和弦名直改 -->
      <div
        class="pointer-events-auto relative z-base mx-auto flex shrink-0 flex-col items-center justify-evenly rounded-md border border-glass-border bg-surface-panel px-2xl py-xl shadow-panel transition-[border-color,box-shadow] duration-slow ease-sidebar hover:border-border-base hover:shadow-lg hover:delay-150"
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
           列顶 32px 与指板同高：未滚动时首卡顶边距父容器上下缘均为 32px。宿主盒上缘另行上移到
           父容器内 8px 处（见下），故滚动时卡片理论上可上移到 8px，但该段落在 20px 羽化带内，
           观感仍是「升到列顶即淡出」。

           卡片投影四周留白：宿主是卡片祖先链上唯一的 overflow!=visible 节点（v-scrollbar 注入的
           overflow-y:auto），它在自己的内容盒边界裁掉后代的一切绘制；而 overflow 只裁内容与后代、
           不裁元素自身，投影也不可能挪到宿主盒外去画。唯一出路是让宿主盒比内容盒大：宿主盒向外
           扩 P，内容再补等量 padding 把卡片拉回原位——可视区与 scrollHeight 同时 +2P，可滚量与
           卡片位置逐像素不变，空出来的那段 P 正好给投影落地。横向两处、纵向两处必须成对同步，
           漏改任一处卡片位置都会漂移：
           · 横向 P=32：宿主盒右缘贴父容器（right-8→right-0）、w-72→w-88、补 px-2xl；
             滚动条 edgeOffset 同步 +32 才停在原处。
           · 纵向 P=24：宿主盒上下各内缩 32-P（inset-y-2xl→inset-y-sm）、内容补 py-xl；
             滚动条 endInset 12→36（盒高增 48 的一半）才停在原处（轨道顶 8+36=44＝原 32+12）。
           P 只需 ≥ 卡片投影在该轴上的最大延展（shadow-md：纵向 4+14=18、横向 14）；横向 32 由原本
           right-8 的内缩决定、不必再收，纵向取最近的 spacing token 24。 -->
      <div class="pointer-events-auto absolute inset-y-sm right-0 z-panel">
        <BaseScrollArea
          :scrollbar="{ endInset: 44, edgeOffset: EDGE_OFFSET + 44 }"
          close-popovers
          axis="y"
          class="flex size-full w-88 flex-col px-2xl"
        >
          <!-- 面板列表：拖拽排序容器，其直接子元素即四张面板卡片。
               刻意不把排序容器与滚动宿主合并：滚动宿主是 v-scrollbar 的书写目标（加宿主类 + 写内联
               overflow），而 Sortable 会把容器的直接子元素一律当成可排序项，两种语义不该共用一个节点。
               shrink-0 必需——本容器是滚动宿主的唯一 flex 子项，若能收缩则永远滚不动。 -->
          <!-- 纵向留白的下半：py-xl（24）把卡片拉回宿主盒外扩前的原位，同时把这 24px 计入
               scrollHeight，于是两端各多出 24px 空白可供投影落地——滚到底时末卡底边距可视化下缘
               仍有 24px，底部投影不再断在裁切线上；未滚动时首卡上方的 24px 也让顶部投影首次可见。
               留白必须落在内容上、而不是给滚动宿主加 padding：宿主 height 被外层 inset 锁定且是
               border-box，padding 只会压缩内容盒（可视内容白白少一截），而 scrollHeight 的增量两者
               完全相同。也不必逐卡套 padding 壳：卡间距 gap-lg(16) 与纵向投影的下延展（浅色 16、
               深色/高对比 18）同量级，卡间那段横跨空白本就容得下投影，纵深溢出的 2px 尾端落在下一张
               卡片的不透明背景之下、肉眼不可见，所以每张卡外面再包一层 padding 壳买不到任何东西，
               两端留白用本容器的 padding 一次给足即可。
               加在本容器上等同末尾占位块，但不新增节点，也不会让 Sortable 多认一项（padding 不产生
               子元素）。 -->
          <div class="flex w-full shrink-0 flex-col items-stretch gap-lg py-xl *:shrink-0" ref="panelListRef">
            <!-- 面板卡片外壳：由 View 统一封装（卡片 chrome + 折叠 + 展开态持久化），各业务面板保持纯内容。
       useWorkbenchPanelExpanded 为 composable（内部封装 useStorage），在此调用符合项目约束 -->
            <div
              v-for="panelId in panels"
              :key="panelId"
              class="group/panel w-full overflow-hidden rounded-xl border border-glass-border bg-surface-panel p-xs shadow-md"
            >
              <BaseCollapse
                :description="panelDescription(panelId)"
                :emphasize-on-expand="false"
                :expanded="getPanelExpanded(panelId)"
                :icon="PANEL_META[panelId].icon"
                :title="PANEL_META[panelId].title"
                @update:expanded="setPanelExpanded(panelId, $event)"
                initial-auto
                class="panel-title-row"
              >
                <!-- 拖拽把手的可发现性线索：排序的 handle 就是这个折叠头（见下方 useSortableList 的
                     handle: '.panel-title-row'），但折叠头外观与普通折叠头毫无差别，用户无从得知
                     标题栏可以拖。悬停整张面板卡片时在标题后淡入抓手图标（卡片带 group/panel）——
                     只悬停头部触发的话可发现性仍受限于「用户先注意到头部」，整卡悬停的命中面大得多。
                     常驻会污染四个面板头，故默认 opacity-0，悬停整卡时淡入（图标占位始终保留，
                     不产生布局跳动）。
                     过渡只留 opacity、位移已去掉：位移原本写 translate-x-1 → 0，但 Tailwind v4 的
                     translate-x-* 落在 `translate` 独立属性上，而 transition-[opacity,transform] 并不
                     覆盖它 —— 位移从头到尾没有真正过渡过，hover 时是瞬跳 4px（淡入平滑、位置突跳，
                     观感就像掉帧）。去掉后零视觉损失（非 hover 态本就不可见、占位也不变），
                     过渡属性还从两个收窄为一个合成属性。
                     注：触屏没有 hover 状态，此线索对触屏无效，触屏仍依赖长按拖拽。 -->
                <template #trailing>
                  <BaseIcon
                    class="shrink-0 cursor-grab text-fg-muted opacity-0 transition-opacity duration-base ease-out group-hover/panel:opacity-100"
                    icon-size="sm"
                    name="grip-vertical"
                  />
                </template>
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
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import {
  useChordDraftEditing,
  useChordDraftSaveState,
} from '@/domains/chord/workbench/composables/useChordDraftEditing';
import { useChordVariants } from '@/domains/chord/workbench/composables/useChordVariants';
import { useWorkbenchPanelExpanded } from '@/domains/chord/workbench/composables/useWorkbenchPanelExpanded';
import { useWorkbenchPanelsOrder } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder';
import { useWorkbenchRouteSync } from '@/domains/chord/workbench/composables/useWorkbenchRouteSync';
import { getFloatingBarBottom } from '@/domains/fretboard/constants';
import { useSortableList } from '@/platform/composables/useSortableList';
import { EDGE_OFFSET } from '@/platform/directives/vScrollbar';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchExportPanel from './WorkbenchExportPanel.vue';
import WorkbenchFretboardPanel from './WorkbenchFretboardPanel.vue';
import WorkbenchVariantsPanel from './WorkbenchVariantsPanel.vue';

import type { WorkbenchPanelId } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder';
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
 * 用于一眼区分五张同构卡片里装的是什么——标题只两三个字，光看标题分不清内容边界。
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
      description: '图片与背景',
      storageKey: STORAGE_KEYS.WORKBENCH_EXPORT_COLLAPSED,
    },
  };

/**
 * 折叠头 description：多指法面板额外带上候选总数。
 * 该面板是横向滚动列表，边缘渐隐（BaseScrollArea 的 fade）提示很弱——变体数只比可视区宽一点点时
 * 几乎看不出来，用户会以为「就这么多」而漏看后面的变体；标题上给出总数即可消除这个误判。
 * 与列表渲染共用同一份判定（useChordVariants），避免标题数与实际卡片数漂移。
 */
const { variants, hasVariants } = useChordVariants();

const panelDescription = (panelId: WorkbenchPanelId): string => {
  const base = PANEL_META[panelId].description;
  if (panelId !== 'variants' || !hasVariants.value) return base;
  return `${base} · 共 ${variants.value.length} 个`;
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
