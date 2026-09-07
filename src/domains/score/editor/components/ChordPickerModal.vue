<template>
  <BaseModal
    v-model:visible="visibleModel"
    :destroy-on-close="false"
    show-footer
    class="chord-picker-modal"
    height="h-full"
    title="选择要绑定的和弦"
    width="w-wide"
  >
    <template #header-extra>
      <ActionButton @click="goToWorkbenchToCreate()" color="primary" icon="plus" label="新建和弦" variant="subtle" />
    </template>

    <div class="chord-picker-wrapper relative box-border flex h-full flex-col overflow-hidden">
      <div class="picker-fixed-header flex shrink-0 flex-col gap-md">
        <div class="picker-controls-row flex flex-wrap items-center justify-between gap-sm p-1 sm:gap-lg">
          <div class="search-input-wrapper min-w-[200px] flex-1 sm:max-w-64">
            <BaseInput
              v-focus
              v-model="pickerSearchQuery"
              :maxlength="15"
              clearable
              show-count
              aria-label="搜索和弦"
              font-size="xs"
              placeholder="搜索和弦名称..."
              prefix-icon="search"
            />
          </div>
          <div class="sort-action-group flex shrink-0 items-center gap-sm">
            <span class="sort-label text-xs font-semibold whitespace-nowrap text-fg-disabled">排序</span>
            <BaseSegmentedControl
              v-model="sortOverride"
              :options="SORT_RULE_CONFIG"
              @update:model-value="handleSortRuleChange($event)"
            />
            <KeySelector
              v-model="tempSortKey"
              :disabled="sortOverride !== GroupSortRule.KEY_DEGREE"
              @update:model-value="handleSortKeyChange($event)"
              class="picker-key-selector w-20"
              width="md"
            />
          </div>
        </div>
        <div
          v-wheel-scroll.smooth
          class="picker-group-pills-bar no-scrollbar flex items-center overflow-x-auto scroll-smooth pt-xs"
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
        </div>
      </div>
      <div
        v-scrollbar
        v-grid-nav="{ cols: gridCols, selector: '.picker-chord-card' }"
        class="picker-scroll-content no-scrollbar min-h-0 flex-1 overflow-y-auto p-xs"
        ref="scrollWrapperRef"
      >
        <Transition name="v-transition-fade">
          <div v-if="filteredChords.length === 0" class="flex size-full items-center justify-center">
            <EmptyState description="当前搜索或分组下暂无匹配和弦。" size="lg" />
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
            <div class="picker-section-header flex items-center gap-md py-md select-none">
              <span
                v-chord-name="section.title"
                class="picker-section-title text-sm font-extrabold tracking-tight text-fg-title"
              >
                {{ section.title }}
              </span>
              <BaseBadge> {{ section.chords.length }} </BaseBadge>
            </div>
            <TransitionGroup
              :aria-label="`${section.title} 和弦组`"
              class="picker-cards-grid-cols relative grid grid-cols-2 items-start gap-sm sm:grid-cols-3 sm:gap-md md:grid-cols-4 lg:grid-cols-5 lg:gap-lg"
              name="v-transition-list"
              role="group"
              tag="div"
            >
              <div
                v-wave
                v-for="chord in section.chords"
                :aria-disabled="isCurrentBound(chord)"
                :aria-label="`和弦 ${chordMeta.get(chord.id)?.name ?? ''}${isCurrentBound(chord) ? '（当前已绑定）' : ''}`"
                :aria-pressed="isCurrentBound(chord)"
                :class="[CHORD_CARD_BASE_CLASS, { [CHORD_CARD_ACTIVE_CLASS]: isCurrentBound(chord) }]"
                :data-chord-id="chord.id"
                :key="chord.id"
                :tabindex="isCurrentBound(chord) ? -1 : 0"
                @click="!isCurrentBound(chord) && handleSelectChord(chord)"
                @keydown.enter.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
                @keydown.space.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
                @mouseenter="editHoverMap.set(chord.id, true)"
                @mouseleave="editHoverMap.set(chord.id, false)"
                data-focusable-inline
                role="button"
              >
                <ActionButton
                  :tabindex="editHoverMap.get(chord.id) ? 0 : -1"
                  @mousedown.stop
                  @pointerdown.stop
                  @click.stop="goToWorkbenchToEdit(chord)"
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
                <FretboardCanvas
                  :chord
                  :chord-name-scale="0.7"
                  :is-dark-mode="isDark"
                  :scale="pickerScale"
                  :shorthand="settingsStore.scoreChordShorthand"
                  lazy
                />
              </div>
            </TransitionGroup>
          </div>
        </TransitionGroup>
      </div>

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
        aria-label="滚动到底部查看全部和弦"
        bottom="1rem"
        icon="chevron-down"
        position="absolute"
        tooltip="滚动到底部查看全部和弦"
      />
    </div>

    <template #footer>
      <div
        v-wheel-scroll.smooth
        aria-label="和弦分区快速跳转"
        class="picker-section-nav no-scrollbar flex w-full items-center justify-center gap-sm overflow-x-auto scroll-smooth py-xs"
        role="navigation"
      >
        <!-- 有分区时渲染真实跳转 chip；空状态用一个不可见占位 chip 撑出相同行高，
             使 footer 区域高度恒定、modal 主体高度不随空/非空切换变化，避免空状态垂直跳动 -->
        <template v-if="chordSections.length > 0">
          <ActionButton
            v-for="section in chordSections"
            :aria-current="activeSectionId === section.id ? 'true' : undefined"
            :aria-label="`跳转到 ${section.title} 区`"
            :color="activeSectionId === section.id ? 'primary' : 'default'"
            :key="section.id"
            :variant="activeSectionId === section.id ? 'subtle' : 'ghost'"
            @click="scrollToSection(section.id)"
            class="section-nav-chip shrink-0"
            size="sm"
          >
            <span v-chord-name="section.title" class="group-label text-xs font-semibold" />

            <span
              :class="{ 'is-selected font-extrabold': activeSectionId === section.id }"
              class="group-count pl-2 text-2xs font-semibold"
            >
              {{ section.chords.length }}
            </span>
          </ActionButton>
        </template>

        <ActionButton
          v-else
          disabled
          aria-hidden="true"
          class="pointer-events-none invisible"
          label="占位"
          size="sm"
          variant="ghost"
        />
      </div>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onDeactivated, reactive, ref, useTemplateRef, watch } from 'vue';

import { useRouter } from 'vue-router';

import KeySelector from '@/domains/chord/components/KeySelector.vue';
import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseFab from '@/platform/ui/floating-bar/BaseFab.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey, toGroupId } from '@/domains/chord/theory/entityFactories';
import {
  computeChordFingerprint,
  getChordName,
  parseChordName,
  resolveChordRootPitch,
  SORT_RULE_CONFIG,
} from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useResponsive } from '@/platform/composables/useResponsive';
import { isDark } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useRafThrottle } from '@/platform/utils/useRafThrottle';

import type { Chord } from '@/domains/chord/types';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const { isMobile, isTablet, isDesktop } = useResponsive();

/** 响应式网格列数：与 CSS grid-cols 阶梯精准同步，确保键盘上下导航正确换行 */
const gridCols = computed(() => {
  if (isMobile.value) return 2;
  if (isTablet.value) return 3;
  if (!isDesktop.value) return 4;
  return 5;
});

const pickerScale = 2;
/** 和弦选择卡片基础与激活态类名（设定充足 min-h 与顶部呼吸空间，避免顶栏操作压住和弦名） */
const CHORD_CARD_BASE_CLASS =
  'picker-chord-card group relative z-card box-border flex min-h-[196px] w-full cursor-pointer flex-col items-center justify-center self-start rounded-md border border-border-light bg-surface-body px-2 pt-4 pb-2 transition-all duration-fast outline-none hover:border-primary hover:shadow-md active:scale-[0.97] [&:has(.picker-edit-btn:active)]:scale-100';
const CHORD_CARD_ACTIVE_CLASS =
  // 不加 pointer-events-none：active 卡需整卡可 hover 才能显示「去编辑」按钮，
  // 选中防护由 click 守卫 + cursor-default + important 覆盖 hover 变体兜底
  'cursor-default border-primary! bg-tint-primary-88! shadow-none! ring-2 ring-primary/70 active:scale-100!';

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});
const router = useRouter();
const editorStore = useChordEditorStore();
const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const { chordsLookupMap } = useScoreLinesData();

const scrollWrapperRef = useTemplateRef<HTMLElement>('scrollWrapperRef');

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

const boundChord = computed(() => {
  if (scoreEditor.selectedSlotKey == null) return null;
  const id = scoreEditor.activeSong?.chordMap.get(scoreEditor.selectedSlotKey) ?? null;
  return id ? (chordsLookupMap.value.get(id) ?? null) : null;
});

const boundFingerprint = computed(() => (boundChord.value ? computeChordFingerprint(boundChord.value) : null));
const boundGroupId = computed(() => boundChord.value?.groupId ?? null);

/** 判断和弦是否为当前槽位已绑定的和弦（同 id 或等价指法指纹匹配，用于禁用重复选择） */
const isCurrentBound = (chord: Chord) => chordMeta.value.get(chord.id)?.isBound ?? false;

/** 取分组的默认排序规则与调式键（"全部"固定按根音音高 + C 调） */
const getDefaultSortForGroup = (groupId: string): { sortRule: GroupSortRule; sortKey: string } => {
  if (groupId === 'ALL') return { sortRule: GroupSortRule.ROOT_PITCH, sortKey: 'C' };
  const targetGroup = chordStore.groups.find(g => g.id === groupId);
  return {
    sortRule: targetGroup?.sortRule || GroupSortRule.ROOT_PITCH,
    sortKey: targetGroup ? getGroupSortKey(targetGroup) || 'C' : 'C',
  };
};

/** 记录用户当前的选择器状态（分组/排序规则/调式键），下次打开弹窗时恢复 */
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

watch(
  () => scoreEditor.activeSongId,
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
      return;
    }
    pickerSearchQuery.value = '';
    const currentSlotKey = scoreEditor.selectedSlotKey;
    const boundChordId =
      currentSlotKey !== null ? (scoreEditor.activeSong?.chordMap.get(currentSlotKey) ?? null) : null;
    const boundChord = boundChordId ? chordsLookupMap.value.get(boundChordId) : null;
    if (boundChord && boundChord.groupId) {
      selectedGroupId.value = boundChord.groupId;
      const { sortRule, sortKey } = getDefaultSortForGroup(boundChord.groupId);
      sortOverride.value = sortRule;
      tempSortKey.value = sortKey;
    } else if (savedUserPickerState.value) {
      selectedGroupId.value = savedUserPickerState.value.groupId;
      sortOverride.value = savedUserPickerState.value.sortRule;
      tempSortKey.value = savedUserPickerState.value.sortKey;
    } else {
      selectedGroupId.value = 'ALL';
      sortOverride.value = GroupSortRule.ROOT_PITCH;
      tempSortKey.value = 'C';
    }

    if (boundChordId) {
      await nextTick();
      await new Promise<void>(resolve => setTimeout(resolve, 300));
      const scrollEl = scrollWrapperRef.value;
      const boundCard = scrollEl?.querySelector(`[data-chord-id="${boundChordId}"]`) as HTMLElement | null;

      boundCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    await nextTick();
    scrollWrapperRef.value?.addEventListener('scroll', handleScroll, { passive: true });
    rebuildSectionEls();
    updateActiveSection();
    if (!boundChordId && chordSections.value.length > 0) {
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

const chordMeta = computed(() => {
  const map = new Map<string, { name: string; isBound: boolean }>();
  const bChord = boundChord.value;
  const bFp = boundFingerprint.value;
  const bGid = boundGroupId.value;
  for (const chord of filteredChords.value) {
    let isBound = false;
    if (bChord) {
      isBound = chord.id === bChord.id || (!!bFp && chord.groupId === bGid && computeChordFingerprint(chord) === bFp);
    }
    map.set(chord.id, { name: getChordName(chord), isBound });
  }
  return map;
});

const rootCategoryCache = new WeakMap<Chord, { key: string; label: string }>();

/**
 * 解析和弦根音类别：优先取名称段的根音，其次解析和弦名，最后按根音音高反推；
 * key 用 ASCII（分区 id 与排序），label 用 ♯/♭ 展示。结果按和弦实例缓存
 */
const getChordRootCategory = (chord: Chord): { key: string; label: string } => {
  const cached = rootCategoryCache.get(chord);
  if (cached) return cached;

  let result: { key: string; label: string };
  if (chord.nameSegments?.root) {
    const [letter, acc] = chord.nameSegments.root;
    const accAscii = acc === 1 ? '#' : acc === -1 ? 'b' : '';
    const accUnicode = acc === 1 ? '♯' : acc === -1 ? '♭' : '';
    result = { key: `${letter}${accAscii}`, label: `${letter}${accUnicode}` };
  } else {
    const name = getChordName(chord).trim();
    if (name) {
      const parsed = parseChordName(name);
      if (parsed.rootLabel) {
        const natural = parsed.rootLabel[0] || '';
        const accChar = parsed.rootLabel.slice(1);
        const accAscii = accChar === '#' || accChar === '♯' ? '#' : accChar === 'b' || accChar === '♭' ? 'b' : '';
        const accUnicode = accAscii === '#' ? '♯' : accAscii === 'b' ? '♭' : '';
        result = { key: `${natural}${accAscii}`, label: `${natural}${accUnicode}` };
      } else {
        const rootPitch = resolveChordRootPitch(
          chord.strings,
          chord.fretOffset,
          chord.tuning,
          chord,
          chord.rootStringIndex
        );
        if (rootPitch >= 0 && rootPitch < 12) {
          const SHARP_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const SHARP_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
          result = { key: SHARP_KEYS[rootPitch] ?? 'OTHER', label: SHARP_LABELS[rootPitch] ?? '其他' };
        } else {
          result = { key: 'OTHER', label: '其他' };
        }
      }
    } else {
      const rootPitch = resolveChordRootPitch(
        chord.strings,
        chord.fretOffset,
        chord.tuning,
        chord,
        chord.rootStringIndex
      );
      if (rootPitch >= 0 && rootPitch < 12) {
        const SHARP_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const SHARP_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        result = { key: SHARP_KEYS[rootPitch] ?? 'OTHER', label: SHARP_LABELS[rootPitch] ?? '其他' };
      } else {
        result = { key: 'OTHER', label: '其他' };
      }
    }
  }

  rootCategoryCache.set(chord, result);
  return result;
};

interface ChordPickerSection {
  id: string;
  title: string;
  chords: Chord[];
}

const chordSections = computed<ChordPickerSection[]>(() => {
  const chords = filteredChords.value;
  if (chords.length === 0) return [];

  const sectionMap = new Map<string, ChordPickerSection>();
  const orderedKeys: string[] = [];

  for (const chord of chords) {
    const rootInfo = getChordRootCategory(chord);
    let sec = sectionMap.get(rootInfo.key);
    if (!sec) {
      sec = {
        id: rootInfo.key,
        title: rootInfo.label,
        chords: [],
      };
      sectionMap.set(rootInfo.key, sec);
      orderedKeys.push(rootInfo.key);
    }
    sec.chords.push(chord);
  }

  // 分区顺序跟随当前排序规则（filteredChords 已按右上角 selector 的规则排好）中首个音符出现的次序，
  // 使「按主音分组 + 跟随分组排序」同时成立；C-B 规则下自然呈现 C→C♯→D…，此时为稳定排序保持原序
  return orderedKeys.map(k => sectionMap.get(k)!);
});

/** 用户点击候选和弦：绑定到当前选中的槽位并关闭弹窗 */
const handleSelectChord = (chord: Chord) => {
  if (scoreEditor.selectedSlotKey !== null && scoreEditor.activeSong) {
    scoreEditor.setSlotChord(scoreEditor.selectedSlotKey, chord);
  }
  visibleModel.value = false;
};

/**
 * 用户点击"新建和弦"：关闭弹窗并重置编辑器后跳转工作台；
 * 若当前选中的是具体分组，则把新和弦草稿预归入该组
 */
const goToWorkbenchToCreate = () => {
  visibleModel.value = false;
  editorStore.resetEditor();
  if (selectedGroupId.value && selectedGroupId.value !== 'ALL') {
    chordStore.selectAndExpandGroup(selectedGroupId.value);
    editorStore.draftChord.groupId = toGroupId(selectedGroupId.value);
  } else {
    chordStore.collapseAllGroups();
    chordStore.setSelectedGroupId(null);
  }
  router.push('/');
};

/** 用户点击卡片上的编辑按钮：关闭弹窗并加载该和弦到工作台编辑 */
const goToWorkbenchToEdit = (chord: Chord) => {
  visibleModel.value = false;
  editorStore.setEditor(chord);
  chordStore.selectAndExpandGroup(chord.groupId);
  router.push('/');
};

/** 用户点击 footer 跳转 chip：平滑滚动到指定分区并将其标记为激活 */
const scrollToSection = (sectionId: string) => {
  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl) return;
  const target = scrollEl.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  if (!target) return;

  activeSectionId.value = sectionId;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const activeSectionId = ref<string | null>(null);

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
</script>
