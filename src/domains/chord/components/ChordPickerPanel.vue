<template>
  <!-- 和弦选择面板（和弦域装配）：通用浮动外壳 BaseFloatingPanel（platform/ui）+ 和弦业务内容。
       面板只作「拖动来源」——把卡片拖出面板即调用宿主注入的 dragChordStarter，
       落到哪里、落上执行什么全由宿主决定（面板不知道宿主是谱面、工作台还是别的）；
       宿主若不接拖拽，可改用 select 事件拿到点击/回车选中的和弦，交互自动退化为纯选择。
       留白拦截与拖拽让位交给外壳的 intercept / offsetActive 能力，本组件不再自管浮层与进出场动画 -->
  <BaseFloatingPanel
    v-model:visible="visibleModel"
    :offset-active="isDragging"
    :title="title ?? DEFAULT_TITLE"
    :width="PANEL_WIDTH"
    preserve-on-close
  >
    <template #header-extra>
      <ActionButton
        @click="openCreateDrawer()"
        appearance="subtle"
        color="primary"
        icon="plus"
        label="新建和弦"
        size="sm"
      />
    </template>

    <div class="picker-fixed-header relative z-10 flex shrink-0 flex-col">
      <!-- 筛选表单：面板宽度恒为 PANEL_WIDTH（窄视口下由外壳收窄到「视口 − 2×留白」），与视口尺寸无关，
           因此绝不使用 sm:/md: 这类视口断点——那会让同一块面板在宽屏与窄屏下变成两套布局。
           搜索独占一行铺满（宽度 100% 跟随面板），排序规则与调式键在下一行左对齐成组：
           三者同取 sm 控件档位（1.6rem）保证同行同高；排序组永不压缩，窄面板下也不挤压。
           **必须是两行**：三者挤进同一行时，搜索框（宽度 100%、可收缩）会被压到几乎不可见，
           分段控件与调式键也一并被挤出面板 —— 窄面板（手机上「视口 − 2×留白」只剩 300 余像素）
           下三个控件同时被截断。排序组用子行包住而不是各占一行，是为了两者左对齐成组；
           子行自身允许换行：极端窄的视口（360px 上下）里排序组已接近一行放不下的宽度，
           换行总好过被裁掉。
           三者的**尺寸档**在手机上整体降一档（见 headerControlSize）：那是「一行占多高」，
           与上面那条「不按视口切布局」不冲突 —— 降的是标尺、不是行数。 -->
      <div class="picker-controls-row flex flex-col gap-xs px-lg py-2xs">
        <BaseInput
          v-model="pickerSearchQuery"
          :maxlength="15"
          :size="headerControlSize"
          clearable
          aria-label="搜索和弦"
          font-size="xs"
          prefix-icon="search"
          width="full"
        />
        <div class="sort-action-group flex shrink-0 flex-wrap items-center gap-xs">
          <BaseSegmentedControl
            v-model="sortOverride"
            :options="SORT_RULE_CONFIG"
            :size="headerControlSize"
            @update:model-value="handleSortRuleChange($event)"
            compacted
            width="auto"
          />
          <KeySelector
            v-model="tempSortKey"
            :disabled="sortOverride !== GroupSortRule.KEY_DEGREE"
            :size="headerControlSize"
            @update:model-value="handleSortKeyChange($event)"
            width="sm"
          />
        </div>
      </div>

      <div class="picker-group-pills-shell px-lg py-2xs">
        <BaseScrollArea
          :scrollbar="false"
          :wheel="{ smooth: true }"
          axis="x"
          class="picker-group-pills-bar scroll-smooth"
        >
          <!-- 分组页签是一条**横向滚动带**：手指落在页签上横滑，用户要的是「滚去看后面的分组」，
               而分段控件默认会把这套横滑消费掉（touch-action: pan-y + 拖动滑块切换），于是整条带子
               在页签上根本滚不动 —— 横滑被挡下、也不起滚。关掉拖动（no-drag）即同时把横向手势让回
               外层滚动；点击切换分组不受影响，只是少了「按住拖滑块」这条快捷方式 -->
          <BaseSegmentedControl
            v-model="selectedGroupId"
            :options="groupTabOptions"
            :size="groupTabSize"
            @change="handleGroupTabChange($event)"
            block
            no-drag
            variant="underline"
          >
            <template #item-suffix="{ option }">
              <span class="group-count pl-1.5 text-2xs font-semibold">{{ option.count }}</span>
            </template>
          </BaseSegmentedControl>
        </BaseScrollArea>
      </div>
    </div>
    <BaseScrollArea
      v-grid-nav="{ cols: pickerGridCols, selector: '.picker-chord-card', onEdge: handleNavEdge }"
      :scrollbar="pickerScrollbar"
      axis="y"
      class="picker-scroll-content min-h-0 flex-1 px-lg pt-sm pb-lg"
      ref="scrollAreaRef"
    >
      <Transition name="v-transition-fade">
        <div v-if="filteredChords.length === 0" class="flex size-full items-center justify-center">
          <Feedback description="当前搜索或分组下暂无匹配和弦。" size="lg" />
        </div>
      </Transition>
      <!-- 虚拟化分区列表：分区壳（标题行）常驻——分区滚动定位与滚动高亮联动都依赖真实 DOM；
           网格行按窗口挂载（见 updateWindow），容器高度由行规划精确给出，滚动条不跳 -->
      <div
        v-if="filteredChords.length > 0"
        class="picker-sections-list relative flex w-full flex-col gap-xl"
        ref="sectionsListRef"
      >
        <div
          v-for="(section, sectionIndex) in chordSections"
          :data-section-id="section.id"
          :key="section.id"
          class="picker-section-block flex flex-col gap-sm"
        >
          <!-- 分区标题吸顶：定位（sticky / top / z）由 useStickyHeads 经 pickerHeadBind 统一下发，不手写 ——
               容器自带 pt-sm，头用 top:0 会停在 padding 之下、滚过的卡片从头顶那条带里漏出来，
               故 top 取容器 padding 的负值，让头齐平贴住容器可视上沿；底色必须不透明，否则
               卡片会从标题底下透出。id 钩子用 data-head-section-id 而非 data-section-id：后者是
               分区定位与滚动高亮（scrollToSection / updateActiveSection）的选择器，挂到头会多匹配一批元素 -->
          <div
            v-bind="pickerHeadBind(section.id)"
            class="picker-section-header flex items-center gap-md bg-surface-panel py-xs select-none"
          >
            <span
              v-chord-name="section.title"
              class="picker-section-title text-sm font-extrabold tracking-tight text-fg-title"
            >
              {{ section.title }}
            </span>
            <BaseBadge :title="`${section.chords.length} 个和弦`"> {{ section.chords.length }} </BaseBadge>
          </div>
          <div
            :aria-label="`${section.title} 和弦组`"
            :style="{ height: (sectionPlans[sectionIndex]?.gridHeight ?? 0) + 'px' }"
            class="picker-cards-grid relative w-full"
            role="group"
          >
            <!-- 行内**等高**：行高由规划给出（= 本行最高卡片），故网格取 `items-stretch` 让矮卡撑到行高。
                 不这样时，一行里混着 3 品与 5 品指法就会参差 —— 画布高度随品数变（3 品 129px / 5 品 173px，
                 pickerScale 1.6 下），矮卡只到自己内容的高度、贴行顶，行内下缘一条锯齿。
                 ⚠️ 撑的是**卡片**（画布的父元素），画布自身保持原尺寸并随之垂直居中 ——
                 卡片是 `flex-col items-center justify-center`，多出来的高度落在画布上下两侧均分。
                 绝不能让画布跟着拉伸：它的宽高是指板几何的产物（见 FretboardCanvas 的 canvasStyle），
                 拉高只会把整张指板连同品距一起拉变形。
                 改这里必须同步 CHORD_CARD_BASE_CLASS —— 卡片上不能留 `self-start`，否则单卡仍按内容高。 -->
            <div
              v-for="row in visibleRows(sectionIndex)"
              :class="pickerGridCols === 3 ? 'grid-cols-3' : 'grid-cols-2'"
              :key="row.top"
              :style="{ top: row.top + 'px', height: row.height + 'px' }"
              class="picker-cards-grid-cols absolute inset-x-0 grid items-stretch gap-md"
              role="group"
            >
              <div
                v-action-card
                v-wave
                v-for="chord in row.items"
                :aria-label="`和弦 ${getPickerChordName(chord)}`"
                :class="CHORD_CARD_BASE_CLASS"
                :data-chord-id="chord.id"
                :key="chord.id"
                @click="handleCardSelect(chord)"
                @mouseenter="handleCardHover($event, true)"
                @mouseleave="handleCardHover($event, false)"
                @pointerdown="handleCardPointerDown($event, chord)"
                data-focusable-outline
              >
                <!-- 编辑钮：**按需浮现的动作**，因此用与左侧常驻信息不同的重量 —— 无描边、无常态底色，
                     只在指针落到按钮上时才补一层中性软底（ghost：hover 背景 + 前景由 disabled 升到 body）。
                     与左上角注的分工就一句话：常驻的最轻（信息），召唤来的才带底（动作）。
                     于是卡面不再出现任何「描边色块」：整张卡只剩自身一条边框，两角都是无线条的轻元素。
                     浮现时机不变 —— 仍是 hover / 卡内 focus 才出现，不占常驻视觉。
                     它纵向会伸进画布的名字带（top-1 + 1.6rem 见方），但**横向必然空开**：
                     名字以板中线居中、宽度上限 chordNameMaxWidth = 板宽 − 2×CHORD_NAME_EDGE_PAD，
                     而本钮贴在卡右缘 —— 二者最宽时仍差 10px 以上，故无需为它在上边单留一条带。 -->
                <ActionButton
                  :tabindex="-1"
                  @mousedown.stop
                  @pointerdown.stop
                  @click.stop="openEditDrawer(chord)"
                  data-focusable-outline
                  icon-only
                  appearance="ghost"
                  aria-label="去修改该和弦"
                  class="picker-edit-btn pointer-events-auto absolute top-1 right-1 z-float opacity-0 transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                  color="neutral"
                  icon="pencil"
                  icon-inset="sm"
                  icon-size="sm"
                  icon-stroke="thin"
                  size="sm"
                  title="去修改该和弦"
                />
                <!-- 来源分组角注（仅"全部"视图）：**常驻的信息**，因此取最轻的形态 —— 无框、无底，只留一行小字。
                     原先是描边 + 中性底 + 内边距的胶囊，与右上编辑钮凑成卡角一对「贴纸」，
                     一张卡上最多同时出现三条框线（卡自身 + 两角），而胶囊底色与卡底本就同档
                     （bg-surface-panel 与 bg-surface-body：暗色同为 #1c1c1e，亮色 #fbfbfd vs #ffffff），
                     真正构成视觉重量的只有那条 1px 描边 —— 去掉描边与底色即等于去掉全部重量，
                     分组名本身与 hover 提示（title）都保留。
                     仍是绝对定位、可截断、不吃指针事件（不遮住底下的指板拖拽起手）。
                     卡片四边留白同宽后（p-2），本角注会压到画布「名字区块」最上面那条空白带。
                     ⚠️ 名字带 = 基准的「顶部留白 + 名字字号」，经 picker 的 1.6× 放大后仍明显高于本角注
                     （top-1 起、一行小字高）；本角注落在名字带**上半段的那条留白**里，名字字形在其下 ——
                     两者不重叠，但间隙只剩几个像素，字号或留白再动一档就可能相撞，需实测确认。 -->
                <span
                  v-if="selectedGroupId === 'ALL' && getSourceGroupName(chord)"
                  :title="getSourceGroupName(chord)"
                  class="picker-source-group pointer-events-none absolute top-1 left-2 z-panel max-w-[60%] truncate text-2xs leading-none font-semibold text-fg-muted select-none"
                >
                  {{ getSourceGroupName(chord) }}
                </span>
                <FretboardCanvas :chord :is-dark-mode="isDark" :scale="pickerScale" hide-barre />
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseScrollArea>

    <BaseFab
      :hidden="!scrollTopVisible"
      @click="scrollToTop()"
      disabled-teleport
      align="end"
      aria-label="滚动到顶部"
      bottom="4rem"
      icon="chevron-up"
      position="absolute"
      tooltip="滚动到顶部"
    />
    <BaseFab
      :hidden="!scrollBottomVisible"
      @click="scrollToBottom()"
      disabled-teleport
      align="end"
      aria-label="滚动到底部"
      bottom="1rem"
      icon="chevron-down"
      position="absolute"
      tooltip="滚动到底部"
    />

    <template #footer>
      <!-- 横向留白贴在**滚动容器的外面**（自带 padding 的包裹元素），绝不做成宿主自己的 px-*：
           横向滚动容器一旦带 padding-left，content box 与 scroll origin 就不再重合 ——
           scrollLeft=0 时内容左缘并不贴容器内缘，scrollWidth 还把 padding 计进可滚动区，
           两端必然一端露出一截、另一端反而对齐（滚动前后各溢出一次）。
           与侧栏「顶部留白放在滚动容器外」同一条理由：padding 不许落在滚动轴上。 -->
      <div class="w-full shrink-0 px-lg">
        <BaseScrollArea
          :scrollbar="false"
          :wheel="{ smooth: true }"
          aria-label="和弦分区定位"
          axis="x"
          class="picker-section-nav flex w-full items-center scroll-smooth pt-lg pb-lg"
          role="navigation"
        >
          <!-- 居中与横向滚动不能靠 min-w-full：它的百分比解析的是容器**内容盒**宽度，
               内层一旦再带内边距就恒超出内容盒，只会被 overflow-x 白裁掉。
               改 w-max + mx-auto：宽度只由内容决定，分区少时自动居中，
               分区多时撑开横向滚动且左端可达（溢出后 auto margin 按 0 处理，不切左端）。 -->
          <div class="mx-auto flex w-max justify-center">
            <!-- 分区定位条同理：它本身就是横向滚动容器（分区多时撑开横滚），
                 分段控件留在原地会与这条横滚轴争同一套横向手势（理由同上面的分组页签） -->
            <BaseSegmentedControl
              v-model="activeSectionValue"
              :disabled="chordSections.length <= 1"
              :options="sectionOptions"
              no-drag
              aria-label="切换和弦分区"
              size="sm"
              width="auto"
            />
          </div>
        </BaseScrollArea>
      </div>
    </template>
  </BaseFloatingPanel>

  <!-- 和弦编辑抽屉（同域组件）：新建/编辑就地完成，不跳转任何页面；面板保持打开，保存后列表经响应式自动刷新 -->
  <ChordEditorDrawer
    v-model:visible="editorDrawerVisible"
    :editing-chord="editorDrawerChord"
    :preset-group-id="selectedGroupId"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

import { useMediaQuery } from '@vueuse/core';

import KeySelector from '@/domains/chord/components/KeySelector.vue';
import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseFab from '@/platform/ui/floating-bar/BaseFab.vue';
import BaseFloatingPanel from '@/platform/ui/floating-panel/BaseFloatingPanel.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { SORT_RULE_CONFIG } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useResponsive } from '@/platform/composables/useResponsive';
import { isDark } from '@/platform/composables/useTheme';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';

import ChordEditorDrawer from './ChordEditorDrawer.vue';
import { getPickerChordName } from './ChordPickerPanel.logic';
import { usePickerSelection } from './usePickerSelection';
import { usePickerVirtualList } from './usePickerVirtualList';

import type { Chord } from '@/domains/chord/types';
import type { ComponentSize } from '@/platform/types';
import type { ScrollAreaHandle, ScrollAreaScrollbar } from '@/platform/ui/scroll-area/scrollAreaHandle';

/** 面板可见性（v-model:visible）：模型声明即 props 声明，勿再在 defineProps 里重复写一份 */
const visibleModel = defineModel<boolean>('visible', { required: true });

const props = defineProps<{
  /** 面板标题（宿主可覆盖，如「选择和弦」）；默认面向「拖到字符槽」这一用法 */
  title?: string;
  /** 发起外部拖拽（把和弦卡片拖出面板交给宿主）：由宿主注入拖拽会话入口（如谱面编辑器的 useLyricsDragDrop）。
   *  不注入时卡片不参与拖拽，交互走 select 事件 */
  dragChordStarter?: (chord: Chord, event: PointerEvent) => void;
  /** 宿主拖拽会话进行中：面板整体右移只留一小截，避免遮挡宿主的落点 */
  isDragging?: boolean;
  /** 宿主上下文标识（如当前乐谱 / 文档 id）：其值变化即清空面板的选择记忆（分组 / 排序 / 调式键）。
   *  有意用透传的普通值而非直接读宿主 store，使本组件与宿主域解耦 */
  contextKey?: string | number | null;
}>();

const emit = defineEmits<{
  /** 点击 / 回车 / 空格选中某张和弦卡片（宿主未接拖拽时的取用路径；接了拖拽的宿主可忽略） */
  (e: 'select', chord: Chord): void;
}>();

/** 默认标题：面向谱面编辑器「拖到字符槽即绑定」的用法 */
const DEFAULT_TITLE = '拖动添加和弦';

/** 面板宽度：固定值，与视口无关（外壳内部再统一施加「视口 − 2×留白」的上限，见 BaseFloatingPanel） */
const PANEL_WIDTH = 520;

/**
 * 视口宽到「面板不再被外壳的宽度上限压窄」的那一点：面板宽恒为 min(PANEL_WIDTH, 视口 − 2×留白)，
 * 留白在窄屏（< md）是 sm = 11.1px、宽屏是 lg = 22.25px，故最坏一档是 2×lg = 44.5px ——
 * 视口 ≥ 520 + 44.5 = 564.5px 时面板满宽。取 565 而不是临界值 541（见下），是留一档安全余量。
 *
 * 上限口径 2026-09-28 由 `92vw` 改为「视口 − 2×留白」（原口径在窄视口下左右边距不等，
 * 见 BaseFloatingPanel 的 PANEL_MAX_WIDTH），同日窄屏那一档的留白又由 lg 收到 sm
 * （见该组件的 PANEL_GUTTER_CLASS）：565 在新旧口径下都仍是「面板已满宽」的安全值，
 * 故这个阈值不必跟着动 —— 代价是 542 ~ 565px 这一段面板其实已满宽、列数仍保守取 2 列。
 *
 * 阈值留在本组件而不进 useResponsive：它是**几何算出来的**「这一行还放不放得下 3 列」，
 * 不是布局断点（同 TopHeader 的 isActionFold，见 useResponsive 文件头）。
 */
const isPanelFullWidth = useMediaQuery('(min-width: 565px)');

/**
 * 网格列数：面板满宽时 3 列，被视口压窄时退回 2 列。
 * 必须与模板的行网格类同步（`pickerGridCols === 3 ? 'grid-cols-3' : 'grid-cols-2'`），
 * 两处不一致时键盘上下导航会跨列跳、虚拟化的行切分也会与实际排版错位。
 *
 * 判据是**卡片内容宽度**：卡内是指板画布，宽度是**固定几何**（基准宽 × pickerScale，
 * 6 弦 4 品下 115px），既不随列宽收缩也不换行 —— 列宽一旦小于它，画布就横向溢出卡片、
 * 吃掉与相邻卡片的间距（观感即「整片挤压」）。面板宽 520px 时网格内宽 = 520 − 两侧边框(2)
 * − 2×px-lg(22.25) = 473.5px，逐档核：
 *   3 列 —— 每列 146.7px，扣掉卡片 p-2(11.125×2) 与两侧边框(1×2) 后内容宽 122.5px，
 *          画布 115px 放得下，余量 7px；临界点（内容宽压到 115px）在面板 497.6px、即视口 541px。
 *   2 列 —— 每列 228.4px、内容宽 204px，余量充裕。
 * 故 3 列只在「面板满宽」这一段成立，视口一窄就必须退回 2 列 —— 面板被压窄是外壳那条
 * 「视口 − 2×留白」上限生效的结果，媒体查询量得准（面板宽只与视口有关，与宿主布局无关，
 * 与 useResponsive 文件头记的第 ② 项那种「内容区宽度视口量不到」的情形不同）。
 *
 * 已知边界：7 / 8 弦调弦（SEVEN_* / EIGHT_*）的画布为 129 / 143px，两种列数下都会溢出 ——
 * 这是既有状况（手机 390px 下 2 列的内容宽只有 123.6px），不是本次改动引入的，也不值得为它
 * 把列数再绑上「库里最宽的指法」，那会让一张 8 弦和弦拖累整个面板。
 */
const pickerGridCols = computed(() => (isPanelFullWidth.value ? 3 : 2));

/**
 * 头部各控件的尺寸档：手机（< md）整体降一档 —— 搜索框 / 排序分段 / 调式键 `md → sm`，
 * 分组页签 `lg → md`（与顶栏 Tab 栏的窄档同档，见 TopHeader 的 `isNarrow ? 'md' : 'lg'`）。
 *
 * 手机上「头部占比太多」的成因与工作台保存操作栏同源：根字号不恒为 16px（本仓 22.25px，不随视口变），
 * 而尺寸档都是 rem —— 一行 `md` 控件 42.3px、分组页签 `lg` 51.2px，四行 chrome（面板标题行 +
 * 搜索 + 排序 + 页签）实测占掉面板高度的 31%（390×844：247.5 / 799.5）。
 *
 * 只降**尺寸**、不动**布局**：搜索与排序仍是两行、页签仍在固定头里（见模板里那两条注释），
 * 故与「面板宽度与视口无关、不按视口切两套布局」那条口径不冲突 —— 降的是标尺，不是行数。
 * 判据用 isMobile（< md，与浮层 / 表单 / 预览缩放同源）而不是 isPanelFullWidth：后者量的是
 * 「面板够不够宽」（决定列数），而这里要的是「屏幕够不够小」。
 */
const headerControlSize = computed<ComponentSize>(() => (isMobile.value ? 'sm' : 'md'));
const groupTabSize = computed<ComponentSize>(() => (isMobile.value ? 'md' : 'lg'));

const pickerScale = 1.6;
/** 和弦卡片类名（留白四边同宽：卡内只放「指板图 + 两枚卡角控件」，不再为控件单留上边）。
 *  卡片只作拖动来源，不再有「当前已绑定」的激活态变体 */
const CHORD_CARD_BASE_CLASS =
  // 四边同取 p-2(0.5rem)：卡片留白是**四周等宽**的。此前上边单给 pt-4(1rem)、其余 0.5rem，
  // 是为了给卡角两枚控件（来源分组角注 / 编辑钮）让出落脚带；但那一带本就压在画布的**名字区块**
  // 上半截 —— 名字区块 = 顶部留白 + 字号，字形顶之下只剩空白。
  // ⚠️ 名字区块 = 顶部留白 + 名字字号，字形顶距卡顶只隔着 p-2 与那条留白；本角注（top-1 起）正落在
  // 这条留白里 —— 与字形不重叠，但间隙只剩几个像素，字号或留白再动一档就可能相撞，需实测确认；
  // 右上角的编辑钮不受影响（横向必然空开：名字与卡同宽居中，上限 chordNameMaxWidth = 板宽 −
  // 2×CHORD_NAME_EDGE_PAD，最宽的名字也够不到它）。
  // 四周同宽后：卡顶到名字字形 = 卡内边距 + 名字块上空档，与卡底到网格底、
  // 左右到画布边缘同量级；纵向相邻两卡的净距也随之与横向看齐。
  // 改这里必须同步 ChordPickerPanel.logic 的 getPickerCardChromePx（虚拟行高的唯一口径）。
  // `items-center justify-center` 是**行内等高**的另一半：卡片被行网格拉伸到行高后，画布作为唯一
  // 在流子元素由 justify-center 在纵向居中（见模板里行网格那条注释）。故这里**不能加 `self-start`**
  // ——它会让卡片退回内容高，矮的那几张（3 品指法）重新贴行顶、行内下缘参差。
  'picker-chord-card group relative z-card flex w-full cursor-grab flex-col items-center justify-center rounded-md border border-border-light bg-surface-body p-2 transition-all duration-fast outline-none hover:shadow-md active:scale-[0.97] active:cursor-grabbing [&:has(.picker-edit-btn:active)]:scale-100';

/** 手机档（< md）判据：本组件只用来给头部控件的尺寸档降一档（见 headerControlSize） */
const { isMobile } = useResponsive();

const scrollAreaRef = useTemplateRef<ScrollAreaHandle>('scrollAreaRef');
/** 和弦列表滚动容器元素（分区定位 / 边缘滚动入口 / 滚动监听都需要元素本身） */
const scrollWrapperRef = useScrollAreaElement(scrollAreaRef);

/** 边缘滚动入口：顶部/底部浮动按钮。列表可滚且未贴该边时显示，点击平滑滚至对应边 */
const {
  visible: edgeVisible,
  scrollToTop,
  scrollToBottom,
} = useEdgeScroll(scrollWrapperRef, {
  edges: ['top', 'bottom'],
});
const scrollTopVisible = computed(() => edgeVisible.top);
const scrollBottomVisible = computed(() => edgeVisible.bottom);

/**
 * 卡片悬停：只影响「编辑按钮可否 Tab 聚焦」这一件事，**不做任何记忆**。
 * 曾用 reactive Map + 模板 :tabindex 读取 —— 任意卡片的 mouseenter/mouseleave 都会让
 * 整个面板重渲染（所有分区与卡片 vnode 全量重建再 diff，775 卡下每次悬停都是一次
 * 全量 vnode 创建），而视觉上的按钮显隐本就由 CSS group-hover 承担，响应式纯属浪费。
 * 改为直接写按钮 DOM 的 tabIndex（初次渲染静态 tabindex="-1"）。
 * 也不再保留「已处理」去重表：行窗口化会让卡片在悬停中随滚动卸载，mouseleave 不再触发，
 * 表里残留的 true 会让重挂载后的 mouseenter 被早退跳过，按钮永久停在 tabindex="-1"（悬停也 Tab 不到）。
 * 直接写 DOM 本就幂等，不需要去重。
 */
const handleCardHover = (e: MouseEvent, entering: boolean) => {
  const btn = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('.picker-edit-btn');
  if (btn) btn.tabIndex = entering ? 0 : -1;
};

/** 选择器选择态：分组页签 / 搜索 / 排序 / 调式键 + 记忆（口径见 usePickerSelection） */
const {
  selectedGroupId,
  pickerSearchQuery,
  sortOverride,
  tempSortKey,
  groupTabOptions,
  filteredChords,
  chordSections,
  getSourceGroupName,
  handleGroupTabChange,
  handleSortRuleChange,
  handleSortKeyChange,
  restoreForOpen,
} = usePickerSelection({
  contextKey: () => props.contextKey,
  // 下面两项来自 usePickerVirtualList（声明在本调用之后）：只在用户切分组时取用，惰性求值即可
  resetScrollTop: () => resetScrollTop(),
  setActiveSectionId: id => {
    activeSectionId.value = id;
  },
});

/* ---- 分区读数滚动条气泡 ----
   长列表里「滚到哪个分区了」没有别的读数（分区定位条要瞄准、不承担读数）。气泡本体由
   vScrollbar 托管（bubble.format 回调，随拇指移动、闲置淡出），本组件只回答一个问题：
   视口顶当前落在哪个分区之下。format 只在滚动帧里现查 DOM，不闭包捕获响应式列表 ——
   指令侧对 binding 只做引用替换、不重建滚动条（与 SidebarLeft 的拼音分组读数同款口径）。
   判据刻意取**分区块**（data-section-id，正常流布局）而不是分区头：头是吸顶的，钉在容器
   上沿时 top 恒等于 hostTop，按「头已越过上沿」判定会把当前分区慢报成上一个。 */
const pickerScrollbar: ScrollAreaScrollbar = {
  bubble: {
    axis: 'y',
    format: () => {
      const host = scrollWrapperRef.value;
      if (!host) return '';
      const hostTop = host.getBoundingClientRect().top;
      const blocks = host.querySelectorAll<HTMLElement>('[data-section-id]');
      let current = '';
      for (const block of blocks) {
        if (block.getBoundingClientRect().top > hostTop) break;
        current = block.dataset['sectionId'] ?? '';
      }
      if (!current) return chordSections.value[0]?.title ?? '';
      return chordSections.value.find(section => section.id === current)?.title ?? '';
    },
    roll: false,
    hideDelay: 1500,
  },
};

watch(
  () => visibleModel.value,
  async val => {
    if (!val) {
      // 摘滚动监听 + 取消已排队的合帧回调 + 解冻 + 清空激活分区。
      // 三条都要做：关闭后若还跑一次「算高亮」，读的是 display:none 下的零矩形（白算且可能写成空）；
      // 冻结态若跨开关存活，下次打开后滚动推导会停摆；激活分区留着则再打开时高亮停在旧分区。
      deactivate();
      // 同步收起内嵌的「新建 / 编辑和弦」抽屉：它同样 Teleport 到 body，若只关面板不关它，
      // 宿主被 KeepAlive 停用（切路由 / 切页签）后该抽屉会失去所属面板上下文独自残留
      editorDrawerVisible.value = false;
      return;
    }
    // 复位位移基线：面板打开时不论上次停在哪，首帧都按「无位移」给足缓冲
    resetScrollBaseline();
    // 分组 / 排序只恢复「上次用过的选择」，不跟随宿主的当前选中（见 usePickerSelection 的 restoreForOpen）
    restoreForOpen();

    await nextTick();
    // 快速「开 → 关」时本分支的续体会在关闭之后才跑到：此时补挂监听会在面板关闭态留下一条
    // scroll 监听（display:none 不派发 scroll，功能上无害，但属真实竞态），故落地前复检一次
    if (!visibleModel.value) return;
    // 挂滚动监听 + 重建元素缓存 + 初算高亮（分区定位/高亮的状态机见 useSectionScrollSpy）
    activate();
    updateWindow();

    // 面板刚挂载/刚显形时内容高度可能还没落定（外壳进场是纯横向位移，纵向几何已终值，但
    // 首帧的字形度量与滚动条注入仍会改高度），故补一次重测。与上面同样的理由：跑之前复检可见性
    setTimeout(() => {
      if (!visibleModel.value) return;
      refresh();
      updateWindow();
    }, 150);
  }
);

/** 分区行虚拟化 / 滚动定位与高亮 / 标题吸顶 / 键盘边缘导航（口径见 usePickerVirtualList） */
const {
  sectionPlans,
  visibleRows,
  pickerHeadBind,
  activeSectionId,
  sectionOptions,
  activeSectionValue,
  resetScrollTop,
  updateWindow,
  resetScrollBaseline,
  activate,
  refresh,
  deactivate,
  handleNavEdge,
} = usePickerVirtualList({
  scrollWrapperRef,
  chordSections,
  pickerGridCols,
  pickerScale,
});

/** 和弦卡片按下：交给宿主拖拽系统登记外部拖拽会话（移动超阈值起拖，落点与落地动作由宿主决定）。
 *  宿主未注入 dragChordStarter 时卡片不参与拖拽，交互退化为点击派发 select */
const handleCardPointerDown = (event: PointerEvent, chord: Chord) => void props.dragChordStarter?.(chord, event);

/** 卡片点击 / 回车 / 空格：派发 select 给宿主（拖拽起手后指针已移开，卡片收不到 click，不会误触发） */
const handleCardSelect = (chord: Chord) => void emit('select', chord);

/**
 * 用户点击"新建和弦"：就地打开和弦编辑抽屉（不跳转任何页面）；
 * 若当前选中的是具体分组，则把新和弦草稿预归入该组
 */
const editorDrawerVisible = ref(false);
const editorDrawerChord = ref<Chord | null>(null);
const openCreateDrawer = () => {
  editorDrawerChord.value = null;
  editorDrawerVisible.value = true;
};

/** 用户点击卡片上的编辑按钮：打开和弦编辑抽屉加载该和弦（不跳转任何页面） */
const openEditDrawer = (chord: Chord) => {
  editorDrawerChord.value = chord;
  editorDrawerVisible.value = true;
};
</script>
