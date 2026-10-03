<template>
  <div class="pointer-events-auto absolute inset-0 z-content overflow-hidden">
    <!-- 页面标题：视图本身以「指板 + 面板」为视觉主体、无标题位，sr-only 供读屏按标题导航（h1） -->
    <h1 class="sr-only">和弦工作台</h1>
    <!-- 工作台画布：并排时只有**指板卡区**这一个流内子项（右侧面板列是绝对定位，不吃本层内边距），
         故这一圈留白就是**卡片的外侧留白** —— 纵向取图的上下留白、横向取图的左右留白，
         各按本侧 scale 派生（与图自身那两对留白同一个模型）。
         窄屏堆叠时改为「卡片区 → 面板列」两段流内子项、由本层统一纵向滚动（留白口径见 canvasGutterStyle）。

         本层自己就是滚动出口，故与右侧面板列、乐谱互动区取同一套边缘羽化（`v-edge-fade`，不带修饰符
         → 按实际溢出轴自动判定，与 BaseScrollArea 的 axis='both' 写法等价）：内容真溢出时才挂遮罩、
         不溢出时零开销，贴边一侧不渐隐、被裁切一侧羽化。此前只有面板列那一列有羽化，画布这一层
         滚出内容时是硬裁断。
         并排档下遮罩挂在本层盒上，面板列宿主盒的上缘只比本层上缘低 `edgePad − spacing-xl` ≈ 18.4px，
         于是它的最上沿有不到 2px 落在 20px 羽化带内 —— 那一小段是宿主盒自己的留白（卡片在它之下
         还有 `py-xl`），够不着任何内容，观感无差。 -->
    <div
      v-edge-fade
      :class="isStacked ? 'no-scrollbar flex-col' : 'items-start'"
      :style="canvasGutterStyle"
      class="relative flex size-full overflow-auto"
      ref="canvasRef"
    >
      <!-- 指板卡区：卡片在其中水平居中，并排时按 boardAreaInsetRight 在右侧让开面板列。
           面板列是绝对定位、不吃流内空间，而它是不透明的 —— 卡片若按整幅画布居中，画布不够宽时
           右半张指板就被面板压住（1440 屏正是这一档）。让位量**按需给**：画布够宽时归零（卡片回到
           整幅画布居中），不够宽时才逐步让开、最多让出整列（推导见 boardAreaInsetRight）。
           此前固定写 `mr-88` 的版本无论画布多宽都让满一列，宽屏上白白把卡片推左 245px，
           观感就是「指板不居中了」。
           `min-w-0` 必需：flex 项默认 `min-width: auto` = 内容宽度，卡片不肯收缩，让出的宽度会被吃掉。
           本节点还兼任**可用宽度的量取点**：卡片按它贴合缩小（见 Fretboard 的 maxWidth）。

           窄屏（堆叠）时本节点占满整行、自带 spacing 内边距、不让位 —— 此时画布的横向留白已归零。 -->
      <div
        :class="isStacked ? 'w-full px-md' : 'min-w-0 flex-1'"
        :style="boardAreaStyle"
        class="flex items-start justify-center"
        ref="boardAreaRef"
      >
        <!-- 交互指板卡片：点击/编辑即写和弦草稿，含横按标记与和弦名直改。

             整卡版式里**没有任何几何留白**：指板本体已是一个完整的几何体（自带四边留白与各段内容体量），
             卡片直接贴着它 —— 卡片外框因此就等于「画布图 × 本侧 scale」，不需要在外层再补一圈边距。
             要整体缩小时对整卡施加 CSS scale，不回改任何派生值（窄屏的贴合缩放也走这一条）。
             其余版式量（rounded-md / border / shadow-panel）在基准几何里没有对应物，属卡片 chrome，不参与等比。

             **堆叠（窄屏）时本卡改取整宽**（`w-full`）：与面板卡同宽。并排档不能加 —— 那一档卡片是
             「图的自然宽」、由 boardAreaInsetRight 按它算让位量，撑满会把指板推到面板列底下。

             为什么需要这一条：`fitWidth` 只缩不放（见 useFretboardLayout 的 fitScale），故**自然宽
             小于可用宽**的和弦（弦少 / 品位窗口大，如 4 弦 5 品 = 342.18px）压根不参与缩放，卡片就按
             自然宽画 —— 比面板卡窄一截（实测 390 档 344.18 vs 356.63、两侧各空 6.2px，比值 0.965；
             用户报的「指板卡片和面板卡片还是不一样宽」正是这一档）。取整宽后卡片宽度**无条件**等于
             面板卡（两者都等于卡片区的内容盒宽），图的缩放口径一个字节都不用改；
             图仍按原 scale 在卡内居中（本卡是 `items-center`，cross 轴即横向），
             故自然宽小于可用宽时卡内两侧会有一段对称留白 —— 那是「不放大」这条既有规则的代价，
             在手机上约 6px（不可见），换来的是两张卡片永远等宽。 -->
        <div
          v-draw="{ selector: '.fretboard-string-line', gap: 40, once: 'workbench-fretboard' }"
          :class="isStacked ? 'w-full' : ''"
          class="pointer-events-auto relative z-base flex shrink-0 flex-col items-center justify-evenly rounded-md border border-glass-border bg-surface-panel shadow-panel transition-[border-color,box-shadow] duration-slow ease-sidebar hover:border-border-base hover:shadow-lg hover:delay-150"
        >
          <Fretboard
            :chord="editorStore.draftChord"
            :max-width="boardFitWidth"
            @update:barres="handleBarresChange($event)"
            @update:chord-name="handleChordNameChange($event)"
            @update:fret-offset="handleFretOffsetUpdate($event)"
            @update:name-segments="handleNameSegmentsChange($event)"
            @update:root-string-index="handleRootStringChange($event)"
            @update:strings="handleStringsChange($event)"
          />
        </div>
      </div>

      <!-- 右侧卡片列：外层定位且不滚动，内层承载滚动。
           内容边缘用 mask-image 透明渐变柔化（不依赖背景色的 overlay 渐隐，任何背景/玻璃态下无色带）：
           · 未滚动（scrollTop===0）时顶部不遮罩 → 首卡完整可见、与指板顶对齐
           · 上滚后顶部渐隐显示，柔化滚出内容的切口
           · 底部仅未滚到底时渐隐，滚到底自动取消 → 末卡不被遮挡
           列顶与指板卡同高：宿主盒纵向内缩取「画布留白 − 内容补白」（见 panelColumnInsetStyle），
           与内容上的 py-xl 相加恰为画布留白 edgePad —— 未滚动时首卡顶边距父容器上缘即 edgePad，
           与左侧指板卡顶边齐平。宿主盒上缘仍在父容器内（内缩 = 留白 − 补白），故滚动时卡片理论上
           可上移到该处，但该段落在 20px 羽化带内，观感仍是「升到列顶即淡出」。

           卡片投影四周留白：宿主是卡片祖先链上唯一的 overflow!=visible 节点（v-scrollbar 注入的
           overflow-y:auto），它在自己的内容盒边界裁掉后代的一切绘制；而 overflow 只裁内容与后代、
           不裁元素自身，投影也不可能挪到宿主盒外去画。唯一出路是让宿主盒比内容盒大：宿主盒向外
           扩 P，内容再补等量 padding 把卡片拉回原位——可视区与 scrollHeight 同时 +2P，可滚量与
           卡片位置逐像素不变，空出来的那段 P 正好给投影落地。横向两处、纵向两处必须成对同步，
           漏改任一处卡片位置都会漂移：
           · 横向 P：宿主盒右缘贴父容器（right-8→right-0）、w-72→w-88、内容补 px-2xl；
             滚动条 edgeOffset 同步 +PANEL_HALO.x 才停在原处。
           · 纵向 P：宿主盒上下各内缩「画布留白 − P」、内容补 py-xl；滚动条 endInset 同步加大 ——
             宿主盒整体上移了 P，轨道首尾内缩不跟着加就会随盒子上移、与卡片错位。
           数值口径：P 是 rem token（横向 --spacing-2xl = 2rem、纵向 --spacing-xl = 1.5rem），
           本项目根字号 22.25px（src/assets/main.scss），故实际是 44.5 / 33.375 px —— 不是 16px
           根字号下的 32 / 24（旧注释按 16px 算，与 token 实际值互斥）。内容侧的 padding 一律用
           token 类；v-scrollbar 收的是 number、读不到 CSS var，故它的两个值只能写像素（见 PANEL_HALO），
           调 spacing 档位时两处一起改。
           P 只需 ≥ 卡片投影在该轴上的最大延展（shadow-md：纵向 4+14=18、横向 14）；横向由原本
           right-8 的内缩决定、不必再收，纵向取最近的 spacing token。

           窄屏（见 isStacked：实测画布宽度装不下并排所需的「卡片 + 面板列 + 两侧留白」）改为纵向堆叠：
           面板列回到流内、占满整行、不再滚动自身
           （整页由画布统一纵向滚动，故 scrollbar 传 false 走 v-scrollbar 的被动模式、fade 一并关掉），
           上面那整套 P 留白与 inset 补偿随之失效 —— 它们只服务于并排时「面板列与指板卡同高、
           投影有地方落」这一个目的；堆叠后两列不再同高，补偿量无处可对。 -->
      <div
        :class="
          isStacked
            ? 'pointer-events-auto relative mt-lg w-full shrink-0'
            : 'pointer-events-auto absolute right-0 z-panel'
        "
        :style="isStacked ? undefined : panelColumnInsetStyle"
      >
        <BaseScrollArea
          :class="isStacked ? 'flex w-full flex-col px-md' : 'flex size-full w-88 flex-col px-2xl'"
          :fade="!isStacked"
          :scrollbar="isStacked ? false : { endInset: PANEL_HALO.y, edgeOffset: EDGE_OFFSET + PANEL_HALO.x }"
          close-popovers
          axis="y"
        >
          <!-- 面板列表：拖拽排序容器，其直接子元素即四张面板卡片。
               刻意不把排序容器与滚动宿主合并：滚动宿主是 v-scrollbar 的书写目标（加宿主类 + 写内联
               overflow），而 Sortable 会把容器的直接子元素一律当成可排序项，两种语义不该共用一个节点。
               shrink-0 必需——本容器是滚动宿主的唯一 flex 子项，若能收缩则永远滚不动。 -->
          <!-- 纵向留白的上半：pt-xl 把卡片拉回宿主盒外扩前的原位（宿主盒向外扩 P 给卡片投影落地，
               内容再补等量 padding 拉回来），于是首卡上方有 33.375px 空白、顶部投影首次可见。
               留白必须落在内容上、而不是给滚动宿主加 padding：宿主 height 被外层 inset 锁定且是
               border-box，padding 只会压缩内容盒（可视内容白白少一截），而 scrollHeight 的增量两者
               完全相同。也不必逐卡套 padding 壳：卡间距 gap-lg(16) 与纵向投影的下延展（浅色 16、
               深色/高对比 18）同量级，卡间那段横跨空白本就容得下投影，纵深溢出的 2px 尾端落在下一张
               卡片的不透明背景之下、肉眼不可见。
               加在本容器上等同末尾占位块，但不新增节点，也不会让 Sortable 多认一项（padding 不产生
               子元素）。
               **下内边距不给本容器，改由末张卡片自己的 `mb-lg` 出**（见卡片那一段）。容器补 `pb` 虽然也
               落在滚动口内、滚到底同样可见，但那会让「列表末尾」多出一段与卡间距（`gap-lg`）不同源的
               空白；挂到末卡的 margin 上之后，「卡片 → 列表末尾」与「卡片 → 卡片」同源，滚到底的观感
               与卡间一致，且末卡投影正好落在这段 margin 里 —— 不再被宿主盒的裁切线切掉（宿主
               `overflow` 裁在自己的盒边界上，原先内容末端与裁切线齐平时盒外那 18.4px 用不上）。
               `pt-xl` 只在并排时给（`:class` 按 isStacked 下发）：它整个存在的理由就是「把卡片拉回
               宿主盒外扩前的原位」，而堆叠（窄屏）时宿主盒根本没有外扩，没有原位可拉回——那时它
               退化成首卡上方 33.375px 的纯间距，在手机上就是白占一段屏高（画布自身的 py-md 已在管
               这段距离）。判据取 isStacked 而不是宽度断点：同一个视口宽度下侧栏开着与否差 344px，
               媒体查询看不见这个差（见 isStacked 的说明），而模板上的列数、留白也都按它切换，
               三处必须同源。 -->
          <div
            :class="isStacked ? '' : 'pt-xl'"
            class="flex w-full shrink-0 flex-col items-stretch gap-lg *:shrink-0"
            ref="panelListRef"
          >
            <!-- 面板卡片外壳：由 View 统一封装（卡片 chrome + 折叠 + 展开态持久化），各业务面板保持纯内容。
       useWorkbenchPanelExpanded 为 composable（内部封装 useStorage），在此调用符合项目约束。
       `pb-sm` 是本卡自己的底部内边距：折叠体（`BaseCollapse` 的 `p-2`）与卡片 `p-xs` 之外再让出
       一段，内容不再贴着卡片下缘。
       末卡另给 `mb-lg`：列表容器的下内边距已按「下边距由卡片提供」去掉，末卡投影要的落地空间改由
       这段 margin 出（理由见列表容器那一段）。只给末卡 —— 非末卡的下方已有 `gap-lg` 容得下投影。
       `--shadow-md` 的纵向下延展浅色约 16px（y4+blur12）、深色/高对比约 18px，lg（22.25px）是
       唯一够用的间距档。 -->
            <div
              v-for="(panelId, index) in panels"
              :class="index === panels.length - 1 ? 'mb-lg' : ''"
              :key="panelId"
              class="group/panel w-full overflow-hidden rounded-xl border border-glass-border bg-surface-panel p-xs pb-sm shadow-md"
            >
              <BaseCollapse
                :description="panelDescription(panelId)"
                :expanded="getPanelExpanded(panelId)"
                :heading-level="2"
                :icon="PANEL_META[panelId].icon"
                :title="PANEL_META[panelId].title"
                @update:expanded="setPanelExpanded(panelId, $event)"
                initial-auto
                no-emphasize-on-expand
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
                     触屏没有 hover 状态，故在**有粗指针的设备上常驻**（`any-pointer-coarse:opacity-100`）：
                     它不只是线索，而是**触摸端唯一的把手**（见 useSortableList 的 touchHandle）——
                     看不见就等于没有拖拽入口。
                     `-my-2` + `self-stretch`：命中面撑到整条标题栏的高度（头部 `py-2` 那圈内边距
                     被这对外边距抵消），`px-2` 再往两侧各放 11px —— 图标本体只有 16px，手指够不到。 -->
                <template #trailing>
                  <span
                    data-panel-grip
                    class="-my-2 flex shrink-0 touch-none items-center self-stretch px-2 text-fg-muted opacity-0 transition-opacity duration-base ease-out group-hover/panel:opacity-100 any-pointer-coarse:opacity-100"
                  >
                    <BaseIcon class="shrink-0 cursor-grab" icon-size="sm" name="grip-vertical" />
                  </span>
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

    <!-- 保存操作栏：仅草稿有改动时浮现，随指板品位数调整贴底位置。
         手机上整体降一档（见 pillSize）：不恒为 16px 的根字号会把 md 档抬到 42.3px 的钮 / 66.5px 的胶囊 -->
    <BaseFloatingPill :bottom="barBottomPosition" :hidden="isPristine" :size="pillSize">
      <ActionButton
        :disabled="isPristine"
        :label="editorStore.isEditing ? '放弃修改' : '重置指板'"
        :size="pillButtonSize"
        @click="editorStore.resetEditor"
        appearance="ghost"
      />

      <template v-if="editorStore.isEditing">
        <BaseDivider
          class="rounded-full opacity-60"
          color="base"
          length="1rem"
          orientation="vertical"
          thickness="0.125rem"
        />
        <ActionButton
          :size="pillButtonSize"
          @click="chordActions.saveAsNewChord"
          appearance="ghost"
          label="作为新和弦保存"
        />
      </template>

      <BaseDivider
        class="rounded-full opacity-60"
        color="base"
        length="1rem"
        orientation="vertical"
        thickness="0.125rem"
      />

      <ActionButton
        v-shake="saveRejectTick"
        :disabled="isSaveDisabled"
        :label="editorStore.isEditing ? '更新保存' : '确认保存'"
        :size="pillButtonSize"
        @click="handleSave()"
        appearance="subtle"
        color="primary"
      />
    </BaseFloatingPill>

    <!-- 新建和弦且尚无目标分组时的保存分组选择：与抽屉的同名流程共用 GroupPickerGrid（交互、外观与
         列数档位因此天然一致）。

         刻意**不传** active-group-id / active-tooltip（抽屉传了）：本视图里「当前所属分组」这个概念
         不存在 —— 走到这一步时目标分组必为空（判据如此，见 handleSave），网格一开就不该有任何一项
         带高亮；草稿自己那个 groupId 是「另存为新和弦」留下的原分组，它**不参与**这次保存的目标
         （见 targetGroupId），拿它当 active 只会让「将保存到此分组」这句提示说反。

         弹窗 Teleport 到 body，不随本视图的 DOM 一起被 KeepAlive 摘掉，故停用时必须显式收起
         （见脚本里的 onDeactivated）。 -->
    <BaseModal
      v-model:visible="groupModalOpen"
      :confirm-button-disabled="!selectedTargetGroupId"
      @confirm="handleConfirmGroupSelect()"
      title="选择保存分组"
    >
      <GroupPickerGrid
        v-model="selectedTargetGroupId"
        v-shake="groupModalRejectTick"
        :chords-by-group="chordStore.groupChordMap"
        :groups="chordStore.groups"
      />
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, useTemplateRef } from 'vue';

import GroupPickerGrid from '@/domains/chord/library/components/GroupPickerGrid.vue';
import Fretboard from '@/domains/fretboard/components/Fretboard.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseFloatingPill from '@/platform/ui/floating-bar/BaseFloatingPill.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import {
  useChordDraftEditing,
  useChordDraftSaveState,
} from '@/domains/chord/workbench/composables/useChordDraftEditing';
import { useChordVariants } from '@/domains/chord/workbench/composables/useChordVariants';
import { useWorkbenchPanelExpanded } from '@/domains/chord/workbench/composables/useWorkbenchPanelExpanded';
import { useWorkbenchPanelsOrder } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder';
import { useWorkbenchRouteSync } from '@/domains/chord/workbench/composables/useWorkbenchRouteSync';
import { fretboardScaleOf, getFloatingBarBottom } from '@/domains/fretboard/constants';
import { INTERACTIVE_GEOMETRY } from '@/domains/fretboard/model/interactiveGeometry';
import { useResponsive } from '@/platform/composables/useResponsive';
import { useSortableList } from '@/platform/composables/useSortableList';
import { EDGE_OFFSET } from '@/platform/directives/vScrollbar';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { clamp, isClient } from '@/platform/utils/common';
import { LEFT_SIDEBAR_WIDTH_PIXEL, STORAGE_KEYS } from '@/platform/utils/constants';
import { observeResize } from '@/platform/utils/dom';

import ChordAnalysisPanel from './ChordAnalysisPanel.vue';
import WorkbenchExportPanel from './WorkbenchExportPanel.vue';
import WorkbenchFretboardPanel from './WorkbenchFretboardPanel.vue';
import WorkbenchVariantsPanel from './WorkbenchVariantsPanel.vue';

import type { WorkbenchPanelId } from '@/domains/chord/workbench/composables/useWorkbenchPanelsOrder';
import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Component, CSSProperties, Ref } from 'vue';

const uiStore = useUiStore();
/** 抽屉档（小屏）判据：与 App.vue 让位逻辑、SidebarLeft 定位切换同源，三处必须一起看。
 *  手机档（< md）另取一个：与浮层 / 表单 / 预览缩放同源，本页只用来给保存操作栏降一档（见 pillSize） */
const { isDrawerMode, isMobile } = useResponsive();

/**
 * 首帧的**画布宽度估计**：量到之前先按它铺一帧，免得布局先按错的那一种出来再翻。
 *
 * 主内容区 = 视口 − 侧栏让位宽度（App.vue 用 paddingLeft 让位，宽度见 LEFT_SIDEBAR_WIDTH_PIXEL），
 * 故这里必须减掉侧栏：只取 innerWidth 会系统性偏大，在「侧栏开着 + 视口刚好够并排」那一档
 * （约 1100~1430px）先按并排铺一帧、量到之后才翻成堆叠，首屏看得见一次跳版。
 *
 * 两个前提条件与 App.vue 的判据逐字同源：
 * - 抽屉档下侧栏是覆盖式浮层、不让位，故不减；
 * - 展开态可能是 `undefined`（无存储环境），按「未展开」处理。
 */
const initialCanvasWidth = (): number => {
  if (!isClient) return 0;
  const sidebar = !isDrawerMode.value && uiStore.isLeftOpen ? parseFloat(LEFT_SIDEBAR_WIDTH_PIXEL) : 0;
  return Math.max(0, window.innerWidth - sidebar);
};

/**
 * 并排时留给指板卡的宽度**下限**（px）——低于它宁可堆叠，也不把指板压成一条。
 *
 * 取 400：本侧卡片自然宽 453~533px（6 弦 × 本侧 scale，再按品数档位收一档），400 约等于
 * 5 品档的 88%，品格与圆点仍看得清；再窄就该整页堆叠、把整幅宽度让给卡片。
 *
 * 它使阈值落在 `400 + 面板列 489.5 + 2 × 左留白 103.6 ≈ 1097px`（留白与面板列都按满额计，
 * 是个保守上界 —— 实际可用宽度由 boardAreaInsetRight 按需让位，故阈值处仍宽于这个下限）：
 * 侧栏关着时略晚于「< lg（1024）堆叠」，侧栏一开就自动提前堆叠（主区少了 344px）。
 */
const SIDE_BY_SIDE_CARD_MIN = 400;

/**
 * 面板列宽（px）：模板里是 `w-88` = 22rem，本项目根字号 22.25px（src/assets/main.scss）→ 489.5px。
 * 与 PANEL_HALO 同因：这里要的是 CSS 里那个 rem 宽度的像素值，读不到 CSS var，只能写像素；
 * 调 spacing 档位或改根字号时两处一起改。
 */
const PANEL_COLUMN_WIDTH = 489.5;

/** 画布（= 主内容区）的实测宽度（px，边框盒）：堆叠判据的输入，观察装配见下 */
const canvasRef = useTemplateRef<HTMLElement>('canvasRef');
const canvasWidth = ref(initialCanvasWidth());

/**
 * 窄屏改用**纵向堆叠**：指板卡在上、面板列在下，整页由画布统一纵向滚动（见模板注释）。
 *
 * 判据是**实测画布宽度**，不是媒体查询 —— 同一个视口宽度下侧栏开着与否差 344px，媒体查询看不见
 * 这个差：1024px 视口开着侧栏时主区只剩 680px，并排会把指板卡压到 87px。故这里量画布自己。
 * 量的是边框盒，与判据里那两个「两侧留白」对得上（堆叠时画布横向留白归零，边框盒即内容盒，
 * 故同一个阈值在两种形态下含义一致，来回切不会震荡）。
 */
const isStacked = computed(
  () =>
    canvasWidth.value > 0 &&
    canvasWidth.value < SIDE_BY_SIDE_CARD_MIN + PANEL_COLUMN_WIDTH + 2 * INTERACTIVE_GEOMETRY.leftPad
);

/**
 * 工作台画布的留白（= 卡片的外侧留白）：**纵向取图的上下留白、横向取图的左右留白**，
 * 各按本侧 scale 派生 —— 与图自身那两对留白同一个模型（上下与左右分开登记，不共用一个数）。
 *
 * 与卡片内边距**不同源**，因为两者量的是不同的东西：内边距决定卡片外框与图同形（故逐边算），
 * 这里只是把卡片从工作台边缘推开一段「图在该侧的留白」—— 纵向那份保证卡片不会被顶到画布上缘。
 *
 * 堆叠（窄屏）时整圈换成 spacing 档、横向归零：本侧留白是「图在该侧的留白 × 本侧 scale」，
 * 算出来 51.8px —— 那是给宽屏上「卡片四周一圈空」用的，手机上是白占屏宽屏高。窄屏本来就要把
 * 卡片压到可用宽度以内（见 Fretboard 的 maxWidth），留白再按图的比例走没有意义；
 * 横向改由卡片区与面板列各自的 `px-md` 提供，两者对同一档，视觉上仍是一圈等宽留白。
 */
const canvasGutterStyle = computed<CSSProperties>(() =>
  isStacked.value
    ? { padding: 'var(--spacing-md) 0' }
    : { padding: `${INTERACTIVE_GEOMETRY.edgePad}px ${INTERACTIVE_GEOMETRY.leftPad}px` }
);

/**
 * 右侧面板列**宿主盒的纵向内缩** = 画布留白 − 内容补白（内容上是 py-xl，见模板）。
 *
 * 之所以是「减」：宿主盒要比卡片区向外扩 P，卡片投影才落得下（完整推导见模板注释），
 * 内容再补等量 padding 把卡片拉回原位 —— 故「宿主盒顶 + 内容补白」才是卡片顶边。
 * 要让首卡顶边与左侧指板卡顶边齐平（两者都取 edgePad），宿主盒顶就只能内缩 edgePad − P。
 * 横向是同一件事的另一半：宿主盒右缘贴父容器（right-0）、内容补 px-2xl。
 *
 * 用 calc 表达而不是写死像素：spacing token 是 rem，根字号 22.25px 下 1.5rem = 33.375px，
 * 写死一个数就等于把「内容补白」抄了第二份，日后调档位两处必然漂移。
 */
const panelColumnInsetStyle: CSSProperties = {
  top: `calc(${INTERACTIVE_GEOMETRY.edgePad}px - var(--spacing-xl))`,
  bottom: `calc(${INTERACTIVE_GEOMETRY.edgePad}px - var(--spacing-xl))`,
};

/**
 * 面板列「投影落地留白」在滚动条指令里的两个像素值（内容侧对应模板的 px-2xl / py-xl）。
 *
 * v-scrollbar 收的是 number、读不到 CSS var，故这里只能写像素，并与 token 成对同步
 * （根字号 22.25px：--spacing-2xl = 2rem = 44.5px）：
 * - x = 44：横向留白 ≈ --spacing-2xl。宿主盒右缘贴到父容器，滚动条要一起右移同样多才停在原处。
 * - y = 44：纵向留白的补偿量。宿主盒上下各上移了 --spacing-xl，轨道首尾内缩同步加大才不随盒子上移。
 *   ⚠️ 这个值**不是** --spacing-xl 的换算结果（那是 1.5rem × 22.25px = 33.375px），
 *   而是配合现行 edgePad（= 基准留白 × 本侧 scale）实测调定的，与推导值差约 10.6px 是有意的 ——
 *   改成推导值会整体挪动滚动轨。改 spacing 档位或基准留白时都要重新实测复核。
 */
const PANEL_HALO = { x: 44, y: 44 } as const;

/**
 * 指板卡区的**可用宽度**（px）：卡片按它贴合缩小（见 `useFretboardLayout` 的 `fitWidth`）。
 *
 * 初值取上面那个画布估计（上界），不取 0：0 会被 `fitScale` 判成「还没量到 → 不缩」，
 * 于是窄屏首帧先按原尺寸铺出去、量到之后再缩回，画面抖一下。
 *
 * 与画布宽度共用同一份观察装配（见下），量的是**内容盒**：并排时卡片区没有内边距、
 * 堆叠时带 `px-md`，两种形态下内容盒宽都正好是「卡片能用的宽度」。
 */
const boardAreaRef = useTemplateRef<HTMLElement>('boardAreaRef');
const boardAreaWidth = ref(initialCanvasWidth());
const observeStops: (() => void)[] = [];
onMounted(() => {
  const canvas = canvasRef.value;
  if (canvas)
    observeStops.push(
      observeResize(canvas, entry => {
        // 要**边框盒**宽：并排时画布的横向内边距（本侧留白）也在判据里，内容盒会把那一圈漏掉
        const box = entry.borderBoxSize?.[0];
        if (box && box.inlineSize > 0) canvasWidth.value = box.inlineSize;
      })
    );

  // 两个回调都**丢弃非正数**（保留上一次的值）：本视图在 KeepAlive 里，切走时节点被移出文档，
  // 观察者会报一次 0 —— 照收就会把布局翻成并排、把卡片放回原尺寸，切回来再翻一次，看得见跳版。
  const boardArea = boardAreaRef.value;
  if (boardArea)
    observeStops.push(
      observeResize(boardArea, entry => {
        if (entry.contentRect.width > 0) boardAreaWidth.value = entry.contentRect.width;
      })
    );
});
onBeforeUnmount(() => {
  for (const stop of observeStops) stop();
  observeStops.length = 0;
});

/**
 * 指板卡的**左右两道边框**（px）：模板里是 `border border-glass-border`，左右各 1px。
 *
 * 卡片是 `shrink-0` + 宽度自适应（`auto`）的 flex 项，宽度 = 内容宽（Fretboard 根的
 * `realScaledWidth`）+ 这 2px —— 边框画在宽度之外；而面板卡是 `w-full`，宽度就是所在容器的
 * 内容盒宽。两张卡片的容器（卡片区 / 面板列）内边距同档（堆叠时都是 `px-md`）、又都在同一个
 * 画布内容盒里，故「内容盒宽」对两者是同一个数。
 */
const BOARD_CARD_BORDER_X = 2;

/**
 * 下发给 Fretboard 的**贴合宽度**（px）= 卡片区可用宽度 − 卡片自身的左右边框（见上）。
 *
 * 减去这 2px 才是「卡片外框正好填满卡片区」的那个数：不减时指板卡恰好比面板卡宽 2px、
 * 左右各溢出卡片区的内边距 1px（实测 360 档 328.63 vs 326.63、390 档 358.63 vs 356.63，
 * 左边缘也跟着差 1px）。堆叠档下两张卡片一上一下、宽度不一是一眼可见的错位。
 *
 * 并排档不另做分支：那一档卡片取不到这个上限（1440 档实测卡片区可用宽 1109.22px、
 * 卡片自然宽 534.8px，上限够不着），减法在那里是空操作，宽屏渲染逐像素不变。
 *
 * `max(0, …)`：0 与负数的语义都是「还没量到 → 不缩」（见 `useFretboardLayout` 的 fitScale），
 * 初值 0 时保持这个语义。
 */
const boardFitWidth = computed(() => Math.max(0, boardAreaWidth.value - BOARD_CARD_BORDER_X));

const PANEL_COMPONENT_MAP: Record<WorkbenchPanelId, Component> = {
  analysis: ChordAnalysisPanel,
  variants: WorkbenchVariantsPanel,
  export: WorkbenchExportPanel,
  fretboard: WorkbenchFretboardPanel,
};

/**
 * 各面板的卡片元数据：图标 + 标题 + 行尾小标题（description）+ 展开持久化键。
 * 小标题走 BaseCollapse 的 description（标题右侧小字弱色，空间不足时先截断它、标题保持完整），
 * 用于一眼区分四张同构卡片里装的是什么——标题只三四个字，光看标题分不清内容边界。
 *
 * 四条小标题**统一五个字**：它们并排出现在同一条标题行上，字数不齐时行尾参差（标题行右端还挂着
 * 抓手图标与展开箭头，见模板），统一后四张卡的标题行读起来是一条线。改字数时四条一起改。
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
      description: '候选把位图',
      storageKey: STORAGE_KEYS.WORKBENCH_VARIANTS_COLLAPSED,
    },
    analysis: {
      icon: 'chart-column',
      title: '和弦分析',
      description: '名称与音级',
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
//
// `touchDelay: 0`（触摸端按下即起拖，不设长按等待）+ `touchHandle: '[data-panel-grip]'`（触摸端
// 只认那枚抓手图标）：两者是**成对**的取舍，缺一个就会坏一头。
//
// 起因：本列表的把手原先是整条折叠头，而折叠头在触摸端拿不到「按下即拖」—— 保留那 280ms 长按只会让
// 「按下就往目标方向挪」这个最自然的动作被 `touchStartThreshold` 判成「想滚动」而放弃起拖，
// 表现为「怎么拖都没反应、继续拖就滚动页面」（2026-09-28 真机现象；手指不可能在玻璃上静止 280ms
// 且漂移不超过 10px）。于是改成「折叠头按下即拖」——**折叠头整条 `touch-action: none`**。
//
// 但那个代价立刻显现（同日用户反馈「工作台现在不用长按直接拖拽了，都没办法滚动了」）：同一个元素
// 不可能既「按下即拖」又「滑动滚动」——「按下即拖」要的那份 `touch-action: none` 正是关掉滚动的那一份。
// 窄屏下四张卡（折叠时卡身就是折叠头）几乎占满可视区，于是手指落在面板区就再也滚不动画布。
//
// 解法是把两个手势分到两个元素上：**滚动留给整条折叠头**（去掉 `touch-none`），**拖拽收进标题栏里
// 那枚抓手图标**（`data-panel-grip` + `touch-none`，命中面由样式撑到整条标题栏高）。鼠标端仍是
// 「整条折叠头即把手」，不受影响 —— `handle` 与 `touchHandle` 由 useSortableList 按指针类型现切。
// 抓手图标因此在粗指针设备上常驻可见（它是触摸端唯一的入口，见模板处注释）。
//
// 侧栏那两处列表**不要跟着改**：整行/整卡即把手，按住拖动与滑动滚动是同一个手势，那里必须留长按。
useSortableList<WorkbenchPanelId>({
  target: panelListRef,
  items: panels,
  enabled: true,
  handle: '.panel-title-row',
  touchHandle: '[data-panel-grip]',
  touchDelay: 0,
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
const chordStore = useChordStore();
const chordActions = useChordActions();
const { isPristine, isSaveDisabled } = useChordDraftSaveState();
const barBottomPosition = computed(() => getFloatingBarBottom(editorStore.draftChord.fretCount));

/**
 * 保存被拒的令牌：被拒一次 +1，绑在操作栏那枚保存按钮上（`v-shake`）—— 拒绝发生在按钮自己身上
 * （同分组下已有同样的和弦 / 名称或指法不合法），反馈落在刚点下去的地方，视线不用移开去找 toast。
 * 同栏的「作为新和弦保存」不在此列：它只是切到新建态并提示选分组，本身没有失败分支。
 */
const saveRejectTick = ref(0);

/** 新建和弦的目标分组弹窗状态：弹层开关与当前选中分组（层级无需手动管理 —— BaseModal 自行从浮层池取号） */
const groupModalOpen = ref(false);
const selectedTargetGroupId = ref('');

/**
 * 分组弹窗内被拒的令牌：拒绝发生在弹窗打开期间（选的分组下已有同样的和弦）时抖分组网格 ——
 * 此刻操作栏那枚按钮在弹窗之下，抖它没人看得见；而弹窗**刻意不关**，换个分组原地重试即可。
 */
const groupModalRejectTick = ref(0);

/**
 * 本次保存的**目标分组** = 侧栏当前选中的分组，与 `chordDraftValidation` 对新草稿的取值口径**同源**
 * （那边取 `ctx.selectedGroupId`；编辑态另有一条「沿用原实体分组」的路径，在那边处理）。
 *
 * 刻意**不看草稿自己的 groupId**（此前这里写的是 `draft.groupId || selectedGroupId`）：校验对新草稿
 * 根本不读草稿的 groupId，只认 `selectedGroupId` —— 于是那个多出来的来源一旦生效，判据就会以为
 * 分组已就位而跳过本弹窗，紧接着在校验里撞上 `NO_SELECTED_GROUP`（「请先选择目标分组」）。
 * 判据与校验同源，这种「跳过了弹窗、却仍说没选分组」的错位就不可能发生。
 */
const targetGroupId = computed(() => chordStore.selectedGroupId || '');

/**
 * 打开分组选择弹窗。
 *
 * 先把选中清成当前目标 —— 走到这一步它必为空（判据如此，见 handleSave），故这一行实际是**清掉上一次
 * 留下的残留**：用户在上一次弹窗里点过分组、又手动把弹窗关掉时，`selectedTargetGroupId` 会留在那个
 * 分组上，不清就会让网格一开就带高亮、确认钮一开就可点（用户什么都没选却能直接确认）。
 */
const openGroupSelect = () => {
  selectedTargetGroupId.value = targetGroupId.value;
  groupModalOpen.value = true;
};

/**
 * 保存：动作返回 false 即被拒（提示已由动作发出），抖一下按钮。
 *
 * 新建态**没有目标分组时先弹分组选择，而不是把保存按钮禁用掉**：禁用只会让用户对着一个点不动的
 * 按钮猜原因 —— 分组是这次保存唯一还没交代的东西，按钮本身没有任何「还缺什么」的线索；弹窗把缺的
 * 那一步直接摆出来，选完即存。另两档不弹：编辑态的分组沿用和弦自己的（校验里回查原实体，用户此时
 * 取消选中分组也不该拦），「一个分组都没有」时弹窗里也没得选 —— 两档都交给校验流程提示原因。
 */
const handleSave = () => {
  if (editorStore.isEditing || chordStore.groups.length === 0 || targetGroupId.value) {
    if (!chordActions.persistCurrentChord()) saveRejectTick.value += 1;
    return;
  }
  openGroupSelect();
};

/**
 * 确认分组选择：把所选分组写进 store（保存校验的目标分组取自 `selectedGroupId`，见 `chordDraftValidation`），
 * 保存成功才关弹窗；**保存失败要把这次分组选择一并撤回**。
 *
 * 为什么失败必须撤回：失败时弹窗刻意不关、分组也仍高亮着（供原地重试），但**状态不能跟着留下** ——
 * 用户手动关掉弹窗之后，那个分组就成了一份没人认领的残留：下一次保存会以为分组已就位而跳过本弹窗，
 * 紧接着收到一条「请先选择目标分组」（他明明刚在弹窗里选过），「再点一次保存」于是成了一条死路。
 * 撤回即把侧栏选中还原成进弹窗之前的样子（走到这一步时它必为空，故等于取消选中）。
 */
const handleConfirmGroupSelect = () => {
  // 未选分组时确认按钮本就是禁用的（见模板的 confirm-button-disabled），这里只是防旁路的守卫
  if (!selectedTargetGroupId.value) return;

  const previousGroupId = chordStore.selectedGroupId;
  chordStore.selectAndExpandGroup(selectedTargetGroupId.value);

  if (!chordActions.persistCurrentChord()) {
    chordStore.selectAndExpandGroup(previousGroupId);
    groupModalRejectTick.value += 1;
    return;
  }
  groupModalOpen.value = false;
};

/**
 * 本视图随 KeepAlive 停用（切走页面）时收起分组弹窗：它 Teleport 到 body，不随本视图的 DOM 一起
 * 摘除，会独立残留在页面上 —— 与抽屉收起自己那个弹窗是同一条理由。
 */
onDeactivated(() => {
  groupModalOpen.value = false;
});

/**
 * 保存操作栏在手机（< md）上整体降一档：胶囊 `md → sm`、钮 `md → sm`。
 *
 * 手机上「太大」的成因是**应用根字号不恒为 16px**（本仓固定在 22.25px，不随视口变）：
 * `md` 的 1.9rem 随之涨到 42.3px 高、胶囊连内边距一起 66.5px 高（实测 390×844），
 * 一个操作栏就吃掉屏高的 8%，文字按钮的左右内边距也涨到 22.25px。
 *
 * 尺寸档只能经 prop 下发、没有等价的媒体查询写法（标尺字典在 platform/ui/controlSizes，
 * 硬写 `max-md:h-[1.6rem]` 等于把它抄第二份）——与谱面编辑区行内三枚按钮同一条判据与同一种做法
 * （见 ScoreInteractiveArea 的 actionButtonSize）。胶囊与钮**必须同档**：只降其一，
 * 矮一档的钮在宽内边距的胶囊里会显得更小，反而不像一次收紧。
 */
const pillSize = computed<'sm' | 'md'>(() => (isMobile.value ? 'sm' : 'md'));
const pillButtonSize = computed<ComponentSize>(() => (isMobile.value ? 'sm' : 'md'));

// ==================== 指板卡的横向定位 ====================
// 卡片宽由几何声明与品数档位给出，卡片区的让位量由它和画布宽度共同决定。
// 之所以放在这一节而不是几何常量那一节：两者都要读 editorStore.draftChord（草稿在这里才就绪）。

/**
 * 指板卡的**自然宽度**（px）= 板宽 × 按品数那一档比例。
 *
 * 与 Fretboard 内部同源：`useFretboardLayout` 的 `realScaledWidth` 在 fitScale = 1 时正是本式
 * （板宽取自几何声明、比例取自 `fretboardScaleOf`）。此处只读这两个来源，不复制任何算式。
 * 卡片真被贴合缩小时（fitScale < 1）本值偏大，但方向是安全的：让位量偏大 → 卡片略偏左，
 * 绝不会反向压到面板上（见 boardAreaInsetRight）。
 */
const cardNaturalWidth = computed(() => {
  const chord = editorStore.draftChord;
  return INTERACTIVE_GEOMETRY.boardWidth(chord.strings.length) * fretboardScaleOf(chord.fretCount);
});

/**
 * 卡片区**右侧让位的宽度**（px）：让卡片避开右侧面板列，同时尽可能留在整幅画布的中心。
 *
 * 面板列是绝对定位、不吃流内空间，而它不透明 —— 卡片若按整幅画布居中，画布不够宽时右半张指板
 * 就被面板压住（1440 屏正是这一档）。故卡片区要在右侧让开一段：让位后卡片改在剩下的自由区里
 * 居中，位置恰好左移「让位量 ÷ 2」，于是让位量与需要的左移量差一个因子 2 ——
 *
 *   R = clamp(卡片宽 + 2 × 面板列宽 − 画布宽, 0, 面板列宽)
 *
 * 两项边界都是有意的：
 * - **下界 0**：画布够宽（≥ 卡片宽 + 面板列宽 × 2）时卡片本来就不碰面板列，
 *   让位量归零 —— 卡片回到**整幅画布居中**。此前固定让满一列的版本在宽屏上白白把卡片推左
 *   245px，观感就是「指板不居中了」。
 * - **上界 = 面板列宽**：让位不会超过「把整列让出来」，与并排所需的宽度口径同源。并排档下取不到
 *   这个上界（阈值 1096.7px 处约 467px），留着只是保险。
 *
 * 式子原本还带一项「左留白 − 右留白」，已删除：那是把**纵向**留白混进了横向让位 ——
 * `edgePad` 是基准的**上下**留白（`EDGE_PAD`），而画布的**左右**留白是 `FRETBOARD_LEFT_PAD`
 * 一个常量、左右各一份同值（见 constants 的登记），横向差恒为 0，故这一项本就该是 0。
 * 留着它的后果是让位量凭空多出 `(leftPad − edgePad)`（本侧 scale 7.4 下 = 51.8px），
 * 卡片被白白推左一半（25.9px），与上面「尽可能留在整幅画布的中心」正相反。
 *
 * 量的是**边框盒**，与面板列的 `right-0` 差一个滚动条宽（并排时画布可纵向滚动、会出原生滚动条）；
 * 面板列自身那 44.5px 横向内边距（px-2xl）恰好盖住这点误差，故不必再单独量滚动条。
 */
const boardAreaInsetRight = computed(() => {
  const needed = cardNaturalWidth.value + 2 * PANEL_COLUMN_WIDTH - canvasWidth.value;
  return clamp(needed, 0, PANEL_COLUMN_WIDTH);
});

/** 卡片区的内联样式：并排时按 boardAreaInsetRight 让位，堆叠时不让（整行都归卡片） */
const boardAreaStyle = computed<CSSProperties | undefined>(() =>
  isStacked.value ? undefined : { marginRight: `${boardAreaInsetRight.value}px` }
);

// URL ↔ Store 状态同构（#/workbench?group=&chord=&v=）：本组件注册双向 watcher 与 KeepAlive 重激活回放
useWorkbenchRouteSync();
</script>
