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
      <div class="picker-controls-row flex flex-col gap-md px-lg pt-2xs pb-md">
        <BaseInput
          v-model="pickerSearchQuery"
          :maxlength="15"
          clearable
          show-count
          aria-label="搜索和弦"
          font-size="xs"
          placeholder="搜索和弦名称..."
          prefix-icon="search"
          width="full"
        />
        <div class="sort-action-group flex shrink-0 items-center gap-md">
          <BaseSegmentedControl
            v-model="sortOverride"
            :options="SORT_RULE_CONFIG"
            @update:model-value="handleSortRuleChange($event)"
            width="auto"
          />
          <KeySelector
            v-model="tempSortKey"
            :disabled="sortOverride !== GroupSortRule.KEY_DEGREE"
            @update:model-value="handleSortKeyChange($event)"
            width="sm"
          />
        </div>
      </div>
      <BaseScrollArea
        :scrollbar="false"
        :wheel="{ smooth: true }"
        axis="x"
        class="picker-group-pills-bar flex items-center scroll-smooth px-lg pt-sm"
      >
        <BaseSegmentedControl
          v-model="selectedGroupId"
          :options="groupTabOptions"
          @change="handleGroupTabChange($event)"
          tabbed
          size="lg"
        >
          <template #item-suffix="{ option }">
            <span class="group-count pl-1.5 text-2xs font-semibold">{{ option.count }}</span>
          </template>
        </BaseSegmentedControl>
      </BaseScrollArea>
    </div>
    <BaseScrollArea
      v-grid-nav="{ cols: gridCols, selector: '.picker-chord-card' }"
      axis="y"
      class="picker-scroll-content min-h-0 flex-1 px-lg pt-sm pb-lg"
      ref="scrollAreaRef"
    >
      <Transition name="v-transition-fade">
        <div v-if="filteredChords.length === 0" class="flex size-full items-center justify-center">
          <Feedback description="当前搜索或分组下暂无匹配和弦。" size="lg" />
        </div>
      </Transition>
      <TransitionGroup
        v-if="filteredChords.length > 0"
        class="picker-sections-list relative flex w-full flex-col gap-xl"
        name="v-transition-list"
        tag="div"
      >
        <div
          v-for="section in chordSections"
          :data-section-id="section.id"
          :key="section.id"
          class="picker-section-block flex flex-col gap-sm"
        >
          <div class="picker-section-header flex items-center gap-md py-xs select-none">
            <span
              v-chord-name="section.title"
              class="picker-section-title text-sm font-extrabold tracking-tight text-fg-title"
            >
              {{ section.title }}
            </span>
            <BaseBadge :title="`${section.chords.length} 个和弦`"> {{ section.chords.length }} </BaseBadge>
          </div>
          <TransitionGroup
            :aria-label="`${section.title} 和弦组`"
            class="picker-cards-grid-cols relative grid grid-cols-3 items-start gap-md"
            name="v-transition-list"
            role="group"
            tag="div"
          >
            <div
              v-wave
              v-for="chord in section.chords"
              :aria-label="`和弦 ${chordNameMap.get(chord.id) ?? ''}`"
              :class="CHORD_CARD_BASE_CLASS"
              :data-chord-id="chord.id"
              :key="chord.id"
              @click="handleCardSelect(chord)"
              @keydown.enter.prevent="handleCardSelect(chord)"
              @keydown.space.prevent="handleCardSelect(chord)"
              @mouseenter="editHoverMap.set(chord.id, true)"
              @mouseleave="editHoverMap.set(chord.id, false)"
              @pointerdown="handleCardPointerDown($event, chord)"
              data-focusable-inline
              role="button"
              tabindex="0"
            >
              <ActionButton
                :tabindex="editHoverMap.get(chord.id) ? 0 : -1"
                @mousedown.stop
                @pointerdown.stop
                @click.stop="openEditDrawer(chord)"
                icon-only
                aria-label="去修改该和弦"
                class="picker-edit-btn pointer-events-auto absolute top-1 right-1 z-float p-1.5! opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100"
                color="primary"
                icon="pencil"
                icon-size="sm"
                icon-stroke="thin"
                size="sm"
                title="去修改该和弦"
                variant="ghost"
              />
              <span
                v-if="selectedGroupId === 'ALL' && getSourceGroupName(chord)"
                :title="getSourceGroupName(chord)"
                class="picker-source-group pointer-events-none absolute top-1 left-1 z-panel max-w-[60%] truncate rounded-sm border border-border-light bg-surface-panel/90 px-1 py-0.5 text-2xs leading-none font-semibold text-fg-muted select-none"
              >
                {{ getSourceGroupName(chord) }}
              </span>
              <FretboardCanvas :chord :chord-name-scale="0.75" :is-dark-mode="isDark" :scale="pickerScale" lazy />
            </div>
          </TransitionGroup>
        </div>
      </TransitionGroup>
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
      <BaseScrollArea
        :fade="false"
        :scrollbar="false"
        :wheel="{ smooth: true }"
        aria-label="和弦分区定位"
        axis="x"
        class="picker-section-nav flex w-full shrink-0 items-center scroll-smooth px-2xl pt-lg pb-lg"
        role="navigation"
      >
        <!-- w-max + min-w-full：分区少时整条居中，分区多时横向滚动且左端可达 -->
        <div class="flex w-max min-w-full justify-center">
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
import { computed, nextTick, onBeforeUnmount, onDeactivated, reactive, ref, useTemplateRef, watch } from 'vue';

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
import { getChordName, SORT_RULE_CONFIG } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { isDark } from '@/platform/composables/useTheme';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { useRafThrottle } from '@/platform/utils/useRafThrottle';

import ChordEditorDrawer from './ChordEditorDrawer.vue';
import { buildChordSections } from './ChordPickerPanel.logic';

import type { ChordPickerSection } from './ChordPickerPanel.logic';
import type { Chord } from '@/domains/chord/types';
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

/** 网格列数：面板固定 2 列（与模板 grid-cols-2 同步），供键盘上下导航换行 */
const gridCols = computed(() => 2);

const pickerScale = 1.6;
/** 和弦卡片类名（设定充足 min-h 与顶部呼吸空间，避免顶栏操作压住和弦名）。
 *  卡片只作拖动来源，不再有「当前已绑定」的激活态变体 */
const CHORD_CARD_BASE_CLASS =
  'picker-chord-card group relative z-card flex w-full cursor-grab flex-col items-center justify-center self-start rounded-md border border-border-light bg-surface-body px-2 pt-4 pb-2 transition-all duration-fast outline-none hover:border-primary hover:shadow-md active:scale-[0.97] active:cursor-grabbing [&:has(.picker-edit-btn:active)]:scale-100';

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

const editHoverMap = reactive(new Map<string, boolean>());

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
  if (chordSections.value.length > 0) {
    activeSectionId.value = chordSections.value[0]!.id;
  }
  nextTick(() => {
    updateActiveSection();
  });
};

/** 用户切换分组页签：应用该组默认排序、记录状态并回到顶部 */
const handleGroupTabChange = (newGid: string) => {
  selectedGroupId.value = newGid;
  const { sortRule, sortKey } = getDefaultSortForGroup(newGid);
  sortOverride.value = sortRule;
  tempSortKey.value = sortKey;
  saveUserPickerState();

  nextTick(() => {
    if (chordSections.value.length > 0) {
      activeSectionId.value = chordSections.value[0]?.id ?? null;
    }
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
    scrollWrapperRef.value?.addEventListener('scroll', handleScroll, { passive: true });
    rebuildSectionEls();
    updateActiveSection();
    if (chordSections.value.length > 0) {
      activeSectionId.value = chordSections.value[0]?.id ?? null;
    }
    setTimeout(() => {
      rebuildSectionEls();
      updateActiveSection();
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

/** 和弦名查表（按 id 缓存，避免模板重复解析名称；卡片无障碍标签用） */
const chordNameMap = computed(() => {
  const map = new Map<string, string>();
  for (const chord of filteredChords.value) {
    map.set(chord.id, getChordName(chord));
  }
  return map;
});

/** 根音类别解析与分区构建：纯逻辑见 ChordPickerPanel.logic.ts */

const chordSections = computed<ChordPickerSection[]>(() => buildChordSections(filteredChords.value));

/** 和弦卡片按下：交给宿主拖拽系统登记外部拖拽会话（移动超阈值起拖，落点与落地动作由宿主决定）。
 *  宿主未注入 dragChordStarter 时卡片不参与拖拽，交互退化为点击派发 select */
const handleCardPointerDown = (event: PointerEvent, chord: Chord) => {
  props.dragChordStarter?.(chord, event);
};

/** 卡片点击 / 回车 / 空格：派发 select 给宿主（拖拽起手后指针已移开，卡片收不到 click，不会误触发） */
const handleCardSelect = (chord: Chord) => {
  emit('select', chord);
};

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

/** 点击底部定位分段控制的某一段：平滑滚动到该分区并将其标记为激活 */
const scrollToSection = (sectionId: string) => {
  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl) return;
  const target = scrollEl.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  if (!target) return;

  activeSectionId.value = sectionId;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** 预留的分区元素重建钩子，当前为空实现 */
const rebuildSectionEls = () => {};

/** 按滚动位置计算当前应高亮的分区：顶部取首区、底部取末区，否则取最接近容器顶部的分区 */
const updateActiveSection = () => {
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

  const sections = Array.from(scrollEl.querySelectorAll<HTMLElement>('[data-section-id]'));
  if (sections.length === 0) {
    activeSectionId.value = chordSections.value[0]!.id;
    return;
  }

  const containerRect = scrollEl.getBoundingClientRect();
  let currentId: string | null = null;

  for (const sec of sections) {
    const rect = sec.getBoundingClientRect();
    if (rect.top - containerRect.top <= 80) {
      currentId = sec.getAttribute('data-section-id');
    }
  }

  activeSectionId.value = currentId ?? chordSections.value[0]!.id;
};

/** 滚动事件按帧合帧：每帧只做一次激活分区计算 */
const { schedule: scheduleActiveSectionUpdate, cancel: cancelActiveSectionUpdate } = useRafThrottle(() =>
  updateActiveSection()
);
const handleScroll = () => scheduleActiveSectionUpdate();

watch(
  chordSections,
  newSections => {
    if (newSections.length > 0) {
      if (!newSections.some(s => s.id === activeSectionId.value)) {
        activeSectionId.value = newSections[0]!.id;
      }
    } else {
      activeSectionId.value = null;
    }
    nextTick(() => {
      updateActiveSection();
    });
  },
  { immediate: true }
);

onDeactivated(() => {
  cancelActiveSectionUpdate();
  scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
});

onBeforeUnmount(() => {
  cancelActiveSectionUpdate();
  scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
});
</script>
