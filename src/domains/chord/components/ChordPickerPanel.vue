<template>
  <!-- 和弦选择面板（和弦域装配）：通用浮动外壳 BaseFloatingPanel（platform/ui）+ 和弦业务内容。
       面板只作「拖动来源」——把卡片拖出面板即调用宿主注入的 dragChordStarter，
       落到哪里、落上执行什么全由宿主决定（面板不知道宿主是谱面、工作台还是别的）；
       宿主若不接拖拽，可改用 select 事件拿到点击/回车选中的和弦，交互自动退化为纯选择。
       留白拦截与拖拽让位交给外壳的 intercept / offsetActive 能力，本组件不再自管浮层与进出场动画 -->
  <BaseFloatingPanel
    v-model:visible="visibleModel"
    :destroy-on-close="false"
    :offset-active="isDragging"
    :title="title ?? DEFAULT_TITLE"
    :width="PANEL_WIDTH"
  >
    <template #header-extra>
      <ActionButton
        @click="openCreateDrawer()"
        color="primary"
        icon="plus"
        label="新建和弦"
        size="sm"
        variant="subtle"
      />
    </template>

    <div class="picker-fixed-header relative z-10 flex shrink-0 flex-col">
      <!-- 筛选表单：面板宽度恒为 PANEL_WIDTH（窄视口下 max-w-92vw），与视口尺寸无关，
           因此绝不使用 sm:/md: 这类视口断点——那会让同一块面板在宽屏与窄屏下变成两套布局。
           搜索独占一行铺满（宽度 100% 跟随面板），排序规则与调式键在下一行左对齐成组：
           三者同取 sm 控件档位（1.6rem）保证同行同高；排序组永不压缩，窄面板下也不挤压 -->
      <div class="picker-controls-row flex gap-xs px-lg py-2xs">
        <BaseInput
          v-model="pickerSearchQuery"
          :maxlength="15"
          clearable
          aria-label="搜索和弦"
          font-size="xs"
          prefix-icon="search"
          width="full"
        />
        <BaseSegmentedControl
          v-model="sortOverride"
          :options="SORT_RULE_CONFIG"
          @update:model-value="handleSortRuleChange($event)"
          compacted
          width="auto"
        />
        <KeySelector
          v-model="tempSortKey"
          :disabled="sortOverride !== GroupSortRule.KEY_DEGREE"
          @update:model-value="handleSortKeyChange($event)"
          width="sm"
        />
      </div>

      <div class="picker-group-pills-shell px-lg py-2xs">
        <BaseScrollArea
          :scrollbar="false"
          :wheel="{ smooth: true }"
          axis="x"
          class="picker-group-pills-bar scroll-smooth"
        >
          <BaseSegmentedControl
            v-model="selectedGroupId"
            :options="groupTabOptions"
            @change="handleGroupTabChange($event)"
            block
            tabbed
            size="lg"
          >
            <template #item-suffix="{ option }">
              <span class="group-count pl-1.5 text-2xs font-semibold">{{ option.count }}</span>
            </template>
          </BaseSegmentedControl>
        </BaseScrollArea>
      </div>
    </div>
    <BaseScrollArea
      v-grid-nav="{ cols: PICKER_GRID_COLS, selector: '.picker-chord-card', onEdge: handleNavEdge }"
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
            <div
              v-for="row in visibleRows(sectionIndex)"
              :key="row.top"
              :style="{ top: row.top + 'px', height: row.height + 'px' }"
              class="picker-cards-grid-cols absolute inset-x-0 grid grid-cols-3 items-start gap-md"
              role="group"
            >
              <div
                v-wave
                v-for="chord in row.items"
                :aria-label="`和弦 ${getPickerChordName(chord)}`"
                :class="CHORD_CARD_BASE_CLASS"
                :data-chord-id="chord.id"
                :key="chord.id"
                @click="handleCardSelect(chord)"
                @keydown.enter.prevent="handleCardSelect(chord)"
                @keydown.space.prevent="handleCardSelect(chord)"
                @mouseenter="handleCardHover($event, true)"
                @mouseleave="handleCardHover($event, false)"
                @pointerdown="handleCardPointerDown($event, chord)"
                data-focusable-outline
                role="button"
                tabindex="0"
              >
                <!-- 编辑钮：与左上角的「来源分组角标」统一为同一套圆角描边胶囊语汇。
                     原先是无底无边的裸 ghost 图标 —— 同一张卡片两个角上放「贴纸」和「裸图标」
                     两种语汇，卡角视觉重量失衡。此处换成 subtle 中性胶囊（border-light 描边 +
                     中性底色 + rounded-sm，与左侧角标同形），图标留在中性色阶、不抢指板；
                     仍是 hover/focus 才浮现，不占卡面常驻视觉。 -->
                <ActionButton
                  :tabindex="-1"
                  @mousedown.stop
                  @pointerdown.stop
                  @click.stop="openEditDrawer(chord)"
                  data-focusable-outline
                  icon-only
                  aria-label="去修改该和弦"
                  class="picker-edit-btn pointer-events-auto absolute top-1 right-1 z-float p-1.5! opacity-0 transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                  color="default"
                  icon="pencil"
                  icon-size="sm"
                  icon-stroke="thin"
                  rounded="sm"
                  size="sm"
                  title="去修改该和弦"
                  variant="subtle"
                />
                <span
                  v-if="selectedGroupId === 'ALL' && getSourceGroupName(chord)"
                  :title="getSourceGroupName(chord)"
                  class="picker-source-group pointer-events-none absolute top-1 left-1 z-panel max-w-[60%] truncate rounded-sm border border-border-light bg-surface-panel px-1 py-0.5 text-2xs leading-none font-semibold text-fg-muted select-none"
                >
                  {{ getSourceGroupName(chord) }}
                </span>
                <FretboardCanvas :chord :chord-name-scale="0.75" :is-dark-mode="isDark" :scale="pickerScale" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseScrollArea>

    <BaseFab
      :visible="scrollTopVisible"
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
      :visible="scrollBottomVisible"
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
            <BaseSegmentedControl
              v-model="activeSectionValue"
              :disabled="chordSections.length <= 1"
              :options="sectionOptions"
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
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';

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
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { SORT_RULE_CONFIG } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { useRowWindowing } from '@/platform/composables/useRowWindowing';
import { useStickyHeads } from '@/platform/composables/useStickyHeads';
import { isDark } from '@/platform/composables/useTheme';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { resolveScrollBehavior } from '@/platform/utils/motion';

import ChordEditorDrawer from './ChordEditorDrawer.vue';
import {
  buildChordSections,
  buildPickerRowPlan,
  getPickerChordName,
  getPickerGridGapPx,
} from './ChordPickerPanel.logic';

import type { ChordPickerSection } from './ChordPickerPanel.logic';
import type { Chord } from '@/domains/chord/types';
import type { VirtualSectionPlan } from '@/platform/composables/useRowWindowing';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';

const props = defineProps<{
  visible: boolean;
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
  (e: 'update:visible', value: boolean): void;
  /** 点击 / 回车 / 空格选中某张和弦卡片（宿主未接拖拽时的取用路径；接了拖拽的宿主可忽略） */
  (e: 'select', chord: Chord): void;
}>();

/** 默认标题：面向谱面编辑器「拖到字符槽即绑定」的用法 */
const DEFAULT_TITLE = '拖动添加和弦';

/** 面板宽度：固定值，与视口无关（外壳内部再统一施加 92vw 上限） */
const PANEL_WIDTH = 520;

/** 网格列数：面板固定 3 列（与模板 grid-cols-3 同步），供键盘上下导航换行与行规划切分 */
const PICKER_GRID_COLS = 3;

const pickerScale = 1.6;
/** 和弦卡片类名（设定充足 min-h 与顶部呼吸空间，避免顶栏操作压住和弦名）。
 *  卡片只作拖动来源，不再有「当前已绑定」的激活态变体 */
const CHORD_CARD_BASE_CLASS =
  'picker-chord-card group relative z-card flex w-full cursor-grab flex-col items-center justify-center self-start rounded-md border border-border-light bg-surface-body px-2 pt-4 pb-2 transition-all duration-fast outline-none hover:shadow-md active:scale-[0.97] active:cursor-grabbing [&:has(.picker-edit-btn:active)]:scale-100';

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});
const chordStore = useChordStore();

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

const selectedGroupId = ref<string>('ALL');
const pickerSearchQuery = ref<string>('');
const sortOverride = ref<GroupSortRule>(GroupSortRule.ROOT_PITCH);
const tempSortKey = ref<string>('C');
const savedUserPickerState = ref<{
  groupId: string;
  sortRule: GroupSortRule;
  sortKey: string;
} | null>(null);

const groupTabOptions = computed(() => {
  const totalCount = chordStore.savedChordsList.length;
  const options: { label: string; value: string; count: number }[] = [
    { label: '全部和弦', value: 'ALL', count: totalCount },
  ];
  chordStore.groups.forEach(g => {
    const count = chordStore.groupChordMap.get(g.id)?.length ?? 0;
    options.push({ label: g.name, value: g.id, count });
  });
  return options;
});

/* 面板不读取宿主的任何状态：不预选分组、不滚动定位、也不高亮「已绑定」卡片，
   和弦的取用只经「把卡片交给宿主」一条路径完成（拖拽 dragChordStarter / 点击 select） */

/** 取分组的默认排序规则与调式键（"全部"固定按根音音高 + C 调） */
const getDefaultSortForGroup = (groupId: string): { sortRule: GroupSortRule; sortKey: string } => {
  if (groupId === 'ALL') return { sortRule: GroupSortRule.ROOT_PITCH, sortKey: 'C' };
  const targetGroup = chordStore.groups.find(g => g.id === groupId);
  return {
    sortRule: targetGroup?.sortRule || GroupSortRule.ROOT_PITCH,
    sortKey: targetGroup ? getGroupSortKey(targetGroup) || 'C' : 'C',
  };
};

/** 记录用户当前的选择器状态（分组/排序规则/调式键），下次打开抽屉时恢复 */
const saveUserPickerState = () => {
  savedUserPickerState.value = {
    groupId: selectedGroupId.value,
    sortRule: sortOverride.value,
    sortKey: tempSortKey.value,
  };
};

/** 滚动区回到顶部，并同步高亮第一个分区 */
const resetScrollTop = () => {
  const scrollEl = scrollWrapperRef.value;
  if (scrollEl) scrollEl.scrollTop = 0;
  if (chordSections.value.length > 0) activeSectionId.value = chordSections.value[0]!.id;

  nextTick(() => void updateActiveSection());
};

/** 用户切换分组页签：应用该组默认排序、记录状态并回到顶部 */
const handleGroupTabChange = (newGid: string) => {
  selectedGroupId.value = newGid;
  const { sortRule, sortKey } = getDefaultSortForGroup(newGid);
  sortOverride.value = sortRule;
  tempSortKey.value = sortKey;
  saveUserPickerState();

  nextTick(() => {
    if (chordSections.value.length > 0) activeSectionId.value = chordSections.value[0]?.id ?? null;
  });
  resetScrollTop();
};

/** 用户切换排序规则：记录状态并回到顶部 */
const handleSortRuleChange = (newRule: GroupSortRule) => {
  sortOverride.value = newRule;
  saveUserPickerState();
  resetScrollTop();
};

/** 用户切换调式键（仅"调内度数"排序时可用）：记录状态并回到顶部 */
const handleSortKeyChange = (newKey: string | string[]) => {
  if (typeof newKey === 'string') {
    tempSortKey.value = newKey;
    saveUserPickerState();
    resetScrollTop();
  }
};

/** 宿主上下文切换（如换乐谱 / 换文档）：清空选择记忆，下次打开回到默认分组与排序 */
watch(
  () => props.contextKey,
  () => {
    savedUserPickerState.value = null;
  }
);

watch(
  () => props.visible,
  async val => {
    if (!val) {
      scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
      // 关闭时把已排队的合帧回调一并取消：否则面板关闭后还会跑一次「算高亮 + 算窗口」，
      // 读的是 display:none 下的零矩形，白算且可能把窗口写成空
      cancelActiveSectionUpdate();
      // 冻结态不能跨开关存活：面板关了但 sectionSyncFrozen 还留着的话，下次打开后
      // 滚动推导会处于停摆状态（高亮不再跟随滚动），且 rAF/超时监听白白挂到到期
      releaseSectionSync();
      activeSectionId.value = null;
      // 同步收起内嵌的「新建 / 编辑和弦」抽屉：它同样 Teleport 到 body，若只关面板不关它，
      // 宿主被 KeepAlive 停用（切路由 / 切页签）后该抽屉会失去所属面板上下文独自残留
      editorDrawerVisible.value = false;
      return;
    }
    pickerSearchQuery.value = '';
    // 分组/排序只恢复「上次用过的选择」，不跟随宿主的当前选中
    if (savedUserPickerState.value) {
      selectedGroupId.value = savedUserPickerState.value.groupId;
      sortOverride.value = savedUserPickerState.value.sortRule;
      tempSortKey.value = savedUserPickerState.value.sortKey;
    } else {
      selectedGroupId.value = 'ALL';
      sortOverride.value = GroupSortRule.ROOT_PITCH;
      tempSortKey.value = 'C';
    }

    await nextTick();
    // 快速「开 → 关」时本分支的续体会在关闭之后才跑到：此时补挂监听会在面板关闭态留下一条
    // scroll 监听（display:none 不派发 scroll，功能上无害，但属真实竞态），故落地前复检一次
    if (!props.visible) return;
    scrollWrapperRef.value?.addEventListener('scroll', handleScroll, { passive: true });
    rebuildSectionEls();
    updateActiveSection();
    updateWindow();
    if (chordSections.value.length > 0) activeSectionId.value = chordSections.value[0]?.id ?? null;

    // 面板刚挂载/刚显形时内容高度可能还没落定（外壳进场是纯横向位移，纵向几何已终值，但
    // 首帧的字形度量与滚动条注入仍会改高度），故补一次重测。与上面同样的理由：跑之前复检可见性
    setTimeout(() => {
      if (!props.visible) return;
      rebuildSectionEls();
      updateActiveSection();
      updateWindow();
    }, 150);
  }
);

const groupNameMap = computed(() => new Map(chordStore.groups.map(g => [g.id, g.name])));
/** 取和弦所属分组的名称（"全部"视图下用于卡片左上角来源角标） */
const getSourceGroupName = (chord: Chord) => groupNameMap.value.get(chord.groupId) ?? '';

const filteredChords = computed(() => {
  const activeGroup = chordStore.groups.find(g => g.id === selectedGroupId.value);
  const effectiveKey =
    sortOverride.value === GroupSortRule.KEY_DEGREE
      ? tempSortKey.value
      : activeGroup
        ? getGroupSortKey(activeGroup)
        : undefined;
  return chordStore.getFilteredChords(selectedGroupId.value, {
    searchQuery: pickerSearchQuery.value,
    sortRule: sortOverride.value,
    sortKey: effectiveKey,
  });
});

/** 根音类别解析与分区构建：纯逻辑见 ChordPickerPanel.logic.ts（含卡片 aria-label 的和弦名按需解析） */

const chordSections = computed<ChordPickerSection[]>(() => buildChordSections(filteredChords.value));

/* ---- 网格行虚拟化 ----
   卡片挂载是选择器的性能大头（卡片壳 + ActionButton + FretboardCanvas 的整套 setup，
   实测 ~0.8ms/张：775 卡全量挂载（打开面板 / 切回"全部"）单帧 ~600ms，且与位图缓存冷热无关）。
   分区壳（标题行）常驻——分区滚动定位与滚动高亮联动都依赖真实 DOM；只有网格**行**参与窗口化：
   未挂载的行由行规划（纯几何高度）预留空间，滚动条与行位置因此不跳。
   窗口随滚动合帧更新（与激活分区高亮共用同一 rAF），overscan 多渲染约 4 行，滚动无感。 */
const OVERSCAN_PX = 260;

/** 每个分区的行规划（行高 / 行偏移 / 网格总高）；通用切分机制见 useRowWindowing */
const sectionPlans = computed<VirtualSectionPlan<Chord>[]>(() =>
  buildPickerRowPlan(chordSections.value, PICKER_GRID_COLS, pickerScale)
);

const sectionsListRef = useTemplateRef<HTMLElement>('sectionsListRef');

/* ---- 滚动帧的元素缓存 ----
   分区壳常驻，元素集合只在「分区增删」与「列表被 v-if 重建」两类事件上变，却原本每滚动帧
   各查一遍：updateWindow 查一次 .picker-cards-grid、updateActiveSection 再查一次 [data-section-id]，
   而两次查询都要遍历整棵子树（含已挂载卡片的全部节点）。改为查一次、缓存复用：
   计数守卫发现分区数与缓存不符即重查，其余帧零 DOM 查询。 */
const sectionElsCache: HTMLElement[] = [];
const gridElsCache: HTMLElement[] = [];

/** 重建分区 / 网格元素缓存：分区集合变化、面板打开时调用（计数守卫也会兜底调它） */
const rebuildSectionEls = () => {
  sectionElsCache.length = 0;
  gridElsCache.length = 0;
  const list = sectionsListRef.value;
  if (!list) return;
  for (const el of list.querySelectorAll<HTMLElement>('[data-section-id]')) sectionElsCache.push(el);
  for (const el of list.querySelectorAll<HTMLElement>('.picker-cards-grid')) gridElsCache.push(el);
};

/** 计数守卫：分区数与缓存不符（含列表刚从空态重建）就重查，否则直接用缓存 */
const ensureSectionEls = () => {
  if (sectionElsCache.length !== chordSections.value.length) rebuildSectionEls();
};

/** 分区行窗口化：滚动时重算各分区可见行区间 [first, last]，分区壳常驻、网格行按窗口挂载 */
const { updateWindow, visibleRows } = useRowWindowing<Chord>({
  getScroller: () => scrollWrapperRef.value,
  getList: () => sectionsListRef.value,
  getPlans: () => sectionPlans.value,
  gridSelector: '.picker-cards-grid',
  // 回传缓存：窗口计算每帧都要按顺序取各分区网格元素，走缓存省掉一次子树查询
  getGridEls: () => {
    ensureSectionEls();
    return gridElsCache;
  },
  overscanPx: OVERSCAN_PX,
});

/** 分区标题吸顶：与侧栏和弦库分组、设置弹层、开发者面板同源 ——
 *  发现滚动容器、监听滚动与尺寸变化、批量判定哪些头被顶在吸附线上、按吸附头实测高度
 *  让开容器顶部羽化带（否则吸附中的标题会被顶部羽化冲淡）统一交给 useStickyHeads；
 *  头/段的 DOM 结构用面板自己的类名钩子，id 用 data-head-section-id（不与分区定位的
 *  data-section-id 争用同一属性）。 */
const { headBind } = useStickyHeads({
  listRef: sectionsListRef,
  headSelector: '.picker-section-header',
  idAttribute: 'data-head-section-id',
  sectionSelector: '.picker-section-block',
  // 吸附线 = 容器可视上沿：头的 top 由 headBind 取容器 padding 的负值抵消，头顶不留缝隙
  offset: '0px',
  fadeOffset: true,
});

/**
 * 吸附头的接线：headBind 一次给全「id 钩子 + 定位（sticky / top / z）+ 滚动容器」，
 * 其中 `scroll-container` 是喂给 BaseCollapse 的**组件 prop**（另外三处宿主都是折叠组件，
 * 折叠头用它做收起时的滚动补偿）。本面板的头是普通 div、没有这条 prop 可接 ——
 * 直接 v-bind 会把它落成一个值为 "[object HTMLElement]" 的 DOM 属性，故此处摘掉，其余照旧。
 */
const pickerHeadBind = (id: string) => {
  const { 'scroll-container': _unusedForPlainDiv, ...rest } = headBind(id);
  return rest;
};

/** 吸顶分区标题的实测高度（px）：键盘导航把目标行顶到容器上沿时要按它让位。
 *  只在「方向键到窗口边缘」这条按键路径上求值，不进滚动帧，故直接量一次即可 */
const getStickyHeadPx = (): number =>
  sectionsListRef.value?.querySelector<HTMLElement>('.picker-section-header')?.offsetHeight ?? 0;

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

/** 当前激活分区 id：由列表滚动位置推导（顶部=首区、底部=末区、否则最靠近容器顶部的分区） */
const activeSectionId = ref<string | null>(null);

/** 目标位置与当前位置之差在此容差内即视为「无需滚动」：既免去一次空滚动，也避免挂上下一次
 *  永不派发的 scroll 事件（那样冻结状态就没人来解，用户之后的手动滚动高亮会永久停摆） */
const SETTLE_EPSILON_PX = 1;

/** 平滑滚动的兜底解冻时限：scrollend 与轮询两条路都断了也要把推导交还回去 */
const SCROLL_SETTLE_TIMEOUT_MS = 1200;

/**
 * 点选期间冻结「滚动推导高亮」的状态机。
 *
 * 为什么需要它：底部定位条有两套写入 activeSectionId 的来源 —— 用户点选（明确意图，应立刻生效）
 * 与 scroll 事件按视口反推（随滚动连续变化）。平滑滚动会连续派发 scroll，若不放后者停手，
 * 刚点下的高亮会在滚动途中被途经分区的判定逐帧覆盖、抵达目标才回来，表现为「高亮不连贯」。
 *
 * 解冻条件取「滚动落定」而非固定时长：scrollend 为主（Chromium 支持），
 * rAF 轮询重读 scrollTop 为辅（老引擎缺该事件时兜底），超时兜底第三条，
 * 三条都断裂会留下永久冻结，故宁可早解也不晚解。
 */
let sectionSyncFrozen = false;
let frozenScrollTop = 0;
let settleRafId = 0;
let settleTimerId: ReturnType<typeof setTimeout> | null = null;

const releaseSectionSync = () => {
  sectionSyncFrozen = false;
  if (settleRafId) {
    cancelAnimationFrame(settleRafId);
    settleRafId = 0;
  }
  if (settleTimerId !== null) {
    clearTimeout(settleTimerId);
    settleTimerId = null;
  }
  // scrollend 必须显式摘除：三条解冻路径谁先到都算数，若由轮询/超时先解冻而把这条留着，
  // 它会在未来某次滚动结束时才触发（那时早已解冻，属残留监听）
  scrollWrapperRef.value?.removeEventListener('scrollend', releaseSectionSync);
};

/** 轮询等待滚动落定：连续两帧 scrollTop 不变即认为到位 */
const pollScrollSettled = () => {
  const el = scrollWrapperRef.value;
  if (!sectionSyncFrozen || !el) {
    releaseSectionSync();
    return;
  }
  if (el.scrollTop === frozenScrollTop) {
    releaseSectionSync();
    // 落定后再按最终视口补算一次：滚动途中被冻结的推导在此归位，高亮与视口严格一致
    updateActiveSection();
    return;
  }
  frozenScrollTop = el.scrollTop;
  settleRafId = requestAnimationFrame(pollScrollSettled);
};

const freezeSectionSync = () => {
  const el = scrollWrapperRef.value;
  if (!el) return;
  releaseSectionSync();
  sectionSyncFrozen = true;
  frozenScrollTop = el.scrollTop;
  settleRafId = requestAnimationFrame(pollScrollSettled);
  settleTimerId = setTimeout(releaseSectionSync, SCROLL_SETTLE_TIMEOUT_MS);
  // scrollend 是首选信号：它精确对应「滚动真的停了」，比轮询与超时都更早、更准。
  // 不用 { once: true } —— 解冻要能把这条监听摘干净（见 releaseSectionSync）
  el.addEventListener('scrollend', releaseSectionSync);
};

/** 底部定位分段控制的选项：每个根音类别（分区）一段 */
const sectionOptions = computed(() => chordSections.value.map(s => ({ label: s.title, value: s.id })));

/**
 * 底部定位分段控制的模型：读侧跟随当前激活分区（列表滚动 → 高亮段同步移动）；
 * 写侧点击/键盘切换时平滑滚动到该分区。
 * 只单向「滚动 → 状态」在上游写入 activeSectionId，此处 set 只触发滚动，不回写状态，避免与 scroll 事件形成回环。
 */
const activeSectionValue = computed({
  get: () => activeSectionId.value ?? chordSections.value[0]?.id ?? '',
  set: (sectionId: string) => {
    if (sectionId) scrollToSection(sectionId);
  },
});

/**
 * 点击底部定位分段控制的某一段：平滑滚动到该分区并将其标记为激活。
 *
 * 滚动期间必须**冻结**滚动推导（见 scrollSettlingBoundary）：本函数的 scrollTo 会连续派发
 * scroll，若放 updateActiveSection 每帧按视口重算，刚点下的高亮会在滚动途中被中间分区的
 * 判定逐帧改掉，直到抵达目标才回来 —— 视觉上就是「高亮不连贯、来回跳」。
 * 点选是明确的用户意图，滚动途中它说了算；落定后才交还给滚动推导。
 */
const scrollToSection = (sectionId: string) => {
  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl) return;
  const target = scrollEl.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  if (!target) return;

  activeSectionId.value = sectionId;
  freezeSectionSync();

  // 不用 scrollIntoView(block:'start')：它把分区顶齐到滚动容器最顶端，吞掉了分区列表
  // 的 gap-xl 间距，视觉上多滚一段。改为手动定位：目标绝对偏移减去列表行间距（gap），
  // 让分区标题落定后上方仍保留与其他分区一致的间距
  const list = sectionsListRef.value;
  const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
  const top = target.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - gap;

  // 目标已在当前视口顶部（含容差）：不会产生任何滚动，也就没有 scroll / scrollend 事件来解冻，
  // 必须就地解冻，否则下一次用户手动滚动的高亮会永久停摆
  if (Math.abs(top - scrollEl.scrollTop) <= SETTLE_EPSILON_PX) {
    releaseSectionSync();
    return;
  }

  scrollEl.scrollTo({ top, behavior: resolveScrollBehavior('smooth') });
};

/** 按滚动位置计算当前应高亮的分区：顶部取首区、底部取末区，否则取最接近容器顶部的分区 */
const updateActiveSection = () => {
  // 点选平滑滚动途中：本函数每帧都会被 scroll 唤起，但此期间高亮由用户意图说了算，
  // 按视口重算只会把点选的段改掉（高亮不连贯的成因，见 freezeSectionSync 的说明）
  if (sectionSyncFrozen) return;

  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl || chordSections.value.length === 0) {
    activeSectionId.value = null;
    return;
  }

  if (scrollEl.scrollTop <= 10) {
    activeSectionId.value = chordSections.value[0]!.id;
    return;
  }

  if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 6) {
    activeSectionId.value = chordSections.value[chordSections.value.length - 1]!.id;
    return;
  }

  // 分区元素走缓存（计数守卫兜底重查），不再每帧 querySelectorAll
  ensureSectionEls();
  const sections = sectionElsCache;
  if (sections.length === 0) {
    activeSectionId.value = chordSections.value[0]!.id;
    return;
  }

  const containerRect = scrollEl.getBoundingClientRect();
  let currentId: string | null = null;

  for (const sec of sections) {
    const rect = sec.getBoundingClientRect();
    if (rect.top - containerRect.top <= 80) currentId = sec.getAttribute('data-section-id');
  }

  activeSectionId.value = currentId ?? chordSections.value[0]!.id;
};

/** 滚动事件按帧合帧：每帧只做一次激活分区计算 + 可见行窗口更新 */
const { schedule: scheduleActiveSectionUpdate, cancel: cancelActiveSectionUpdate } = useRafThrottle(() => {
  updateActiveSection();
  updateWindow();
});
const handleScroll = () => scheduleActiveSectionUpdate();

watch(
  chordSections,
  newSections => {
    if (newSections.length > 0) {
      if (!newSections.some(s => s.id === activeSectionId.value)) activeSectionId.value = newSections[0]!.id;
    } else activeSectionId.value = null;

    // 分区集合变化 ⇒ 元素缓存失效：先重查再算窗口与高亮（顺序不能反，否则这一帧仍按旧元素算）
    nextTick(() => {
      rebuildSectionEls();
      updateActiveSection();
      updateWindow();
    });
  },
  { immediate: true }
);

/**
 * 键盘导航到窗口边缘的兜底：网格里只挂了可见行，方向键在已渲染卡片间找不到下一张时由
 * v-grid-nav 的 onEdge 回调到这里。按行规划的几何直接算出目标行应到的滚动位置并滚动
 * （目标行尚未挂载，不能 scrollIntoView），窗口随滚动更新后再聚焦目标卡。
 */
const handleNavEdge = (key: string, currentEl: HTMLElement) => {
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
  const scroller = scrollWrapperRef.value;
  const list = sectionsListRef.value;
  if (!scroller || !list) return;
  const { chordId } = currentEl.dataset;
  if (!chordId) return;
  const sectionIndex = chordSections.value.findIndex(section => section.chords.some(c => c.id === chordId));
  const plan = sectionPlans.value[sectionIndex];
  if (!plan) return;
  const fromRow = plan.rows.findIndex(row => row.items.some(c => c.id === chordId));
  if (fromRow < 0) return;
  const colIndex = plan.rows[fromRow]!.items.findIndex(c => c.id === chordId);
  const targetRowIndex = key === 'ArrowDown' ? fromRow + 1 : fromRow - 1;
  const targetRow = plan.rows[targetRowIndex];
  if (!targetRow) return;
  const target = targetRow.items[Math.min(colIndex, targetRow.items.length - 1)];
  if (!target) return;
  const gridEl = list.querySelectorAll<HTMLElement>('.picker-cards-grid')[sectionIndex];
  if (!gridEl) return;
  const scRect = scroller.getBoundingClientRect();
  const rowScreenTop = gridEl.getBoundingClientRect().top + targetRow.top;
  const margin = getPickerGridGapPx();
  if (key === 'ArrowDown' && rowScreenTop + targetRow.height > scRect.bottom)
    scroller.scrollTop += rowScreenTop + targetRow.height - scRect.bottom + margin;
  else if (key === 'ArrowUp' && rowScreenTop < scRect.top)
    // 向上时额外让开吸顶的分区标题：只留行间距会把目标行顶到标题底下，而卡片顶部的和弦名
    // 正是画在那一带（分区标题吸在容器上沿，遮挡带恒为头高）
    scroller.scrollTop -= scRect.top - rowScreenTop + margin + getStickyHeadPx();

  // 两跳 rAF：滚动事件合帧 → 窗口更新渲染 → 目标卡可查询。偶尔仍未就绪再退避一帧重试
  const focusTarget = (retry = true) => {
    const el = list.querySelector<HTMLElement>(`[data-chord-id="${target.id}"]`);
    if (el) el.focus({ preventScroll: true });
    else if (retry) requestAnimationFrame(() => focusTarget(false));
  };
  requestAnimationFrame(() => requestAnimationFrame(() => focusTarget()));
};

onDeactivated(() => {
  cancelActiveSectionUpdate();
  releaseSectionSync();
  scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
});

onBeforeUnmount(() => {
  cancelActiveSectionUpdate();
  releaseSectionSync();
  scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
});
</script>
