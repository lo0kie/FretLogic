<template>
  <BaseModal
    v-model:visible="visibleModel"
    title="选择要绑定的和弦"
    :show-footer="chordSections.length > 0"
    class="chord-picker-modal"
    width="w-wide"
    height="h-full"
  >
    <template #header-extra>
      <ActionButton variant="subtle" color="primary" @click="goToWorkbenchToCreate">
        <template #prefix>
          <Plus :size="14" :stroke-width="2.5" aria-hidden="true" />
        </template>
        新建和弦
      </ActionButton>
    </template>

    <div class="chord-picker-wrapper flex flex-col h-full overflow-hidden box-border">
      <div class="picker-fixed-header flex flex-col gap-md shrink-0 pb-2.5 mb-2.5 border-b border-border-light">
        <div class="picker-controls-row p-1 flex items-center justify-between gap-lg">
          <div class="search-input-wrapper flex-1 max-w-64 min-w-0">
            <BaseInput
              v-model="pickerSearchQuery"
              v-focus
              placeholder="搜索和弦名称..."
              clearable
              font-size="xs"
              :maxlength="15"
              aria-label="搜索和弦"
              show-count
            >
              <template #prefix>
                <Search class="search-icon text-text-disabled" :size="14" :stroke-width="2.5" aria-hidden="true" />
              </template>
            </BaseInput>
          </div>
          <div class="sort-action-group flex items-center gap-sm shrink-0">
            <span class="sort-label text-xs font-semibold text-text-disabled whitespace-nowrap">排序</span>
            <BaseSegmentedControl
              v-model="sortOverride"
              :options="SORT_RULE_CONFIG"
              @update:model-value="handleSortRuleChange"
            />
            <BaseSelector
              v-model="tempSortKey"
              :disabled="sortOverride !== GroupSortRule.KEY_DEGREE"
              :options="KEY_OPTIONS"
              default-value="C"
              :format-option="(val: string | number) => `${val} 调`"
              class="picker-key-selector w-20"
              width="md"
              @update:model-value="handleSortKeyChange"
            />
          </div>
        </div>
        <div
          v-wheel-scroll.smooth
          class="picker-group-pills-bar no-scrollbar flex items-center gap-sm overflow-x-auto py-xs pl-xs scroll-smooth"
        >
          <ActionButton
            v-for="group in groupTabOptions"
            :key="String(group.value)"
            :variant="selectedGroupId === group.value ? 'subtle' : 'ghost'"
            :color="selectedGroupId === group.value ? 'primary' : 'default'"
            @click="handleGroupTabChange(String(group.value))"
          >
            <span class="group-label text-xs font-semibold"> {{ group.label }} </span>
            <span
              class="group-count pl-2 text-2xs font-semibold"
              :class="{ 'is-selected font-extrabold': selectedGroupId === group.value }"
            >
              {{ group.count }}
            </span>
          </ActionButton>
        </div>
      </div>
      <div
        ref="scrollWrapperRef"
        v-grid-nav="{ cols: 5, selector: '.picker-chord-card' }"
        class="picker-scroll-content no-scrollbar flex-1 min-h-0 overflow-y-auto p-xs"
      >
        <EmptyState v-if="filteredChords.length === 0" description="当前搜索或分组下暂无匹配和弦。" size="lg" />
        <TransitionGroup
          v-else
          name="v-transition-list"
          tag="div"
          class="picker-sections-list flex flex-col gap-xl w-full relative"
        >
          <div
            v-for="section in chordSections"
            :key="section.id"
            class="picker-section-block flex flex-col gap-sm"
            :data-section-id="section.id"
          >
            <div class="picker-section-header flex items-center gap-md py-md select-none">
              <span class="picker-section-title text-sm font-extrabold text-text-title tracking-tight">
                {{ section.title }}
              </span>
              <BaseBadge appearance="outline"> {{ section.chords.length }} </BaseBadge>
            </div>
            <TransitionGroup
              name="v-transition-list"
              tag="div"
              class="picker-cards-grid-cols grid grid-cols-5 gap-lg items-start relative"
              role="group"
              :aria-label="`${section.title} 和弦组`"
            >
              <div
                v-for="chord in section.chords"
                :key="chord.id"
                :ref="el => setCardObserverRef(el, chord.id)"
                v-wave
                role="button"
                :tabindex="isCurrentBound(chord) ? -1 : 0"
                :aria-pressed="isCurrentBound(chord)"
                :aria-disabled="isCurrentBound(chord)"
                :aria-label="`和弦 ${chordMeta.get(chord.id)?.name ?? ''}${isCurrentBound(chord) ? '（当前已绑定）' : ''}`"
                class="picker-chord-card group flex flex-col items-center justify-center self-start w-full box-border relative z-card p-md bg-bg-body border border-border-light rounded-md cursor-pointer outline-none transition-all duration-fast hover:border-primary hover:shadow-md active:scale-[0.97] [&:has(.picker-edit-btn:active)]:scale-100"
                :class="{
                  '!bg-tint-primary-88 !border-primary cursor-default !pointer-events-none ring-2 ring-primary/70 !shadow-none !active:scale-100':
                    isCurrentBound(chord),
                }"
                :data-chord-id="chord.id"
                data-focusable-inline
                @click="!isCurrentBound(chord) && handleSelectChord(chord)"
                @keydown.enter.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
                @keydown.space.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
                @mouseenter="editHoverMap.set(chord.id, true)"
                @mouseleave="editHoverMap.set(chord.id, false)"
              >
                <ActionButton
                  variant="ghost"
                  size="sm"
                  icon-only
                  :tabindex="editHoverMap.get(chord.id) ? 0 : -1"
                  aria-label="去修改该和弦"
                  title="去修改该和弦"
                  class="picker-edit-btn absolute top-1 right-1 z-20 pointer-events-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-fast !p-1.5"
                  @pointerdown.stop
                  @mousedown.stop
                  @click.stop="goToWorkbenchToEdit(chord)"
                >
                  <Pencil :size="13" :stroke-width="2.2" />
                </ActionButton>
                <span
                  v-if="selectedGroupId === 'ALL' && getSourceGroupName(chord)"
                  class="picker-source-group absolute top-1 left-1 z-10 max-w-[60%] truncate px-1 py-0.5 rounded-sm bg-bg-panel/90 border border-border-light text-2xs font-semibold text-text-muted leading-none pointer-events-none select-none"
                  :title="getSourceGroupName(chord)"
                >
                  {{ getSourceGroupName(chord) }}
                </span>
                <Fretboard
                  v-if="visibleMap.get(chord.id)"
                  :ref="el => setFretboardMeasureRef(el, chord.fretCount)"
                  :chord
                  :interactive="false"
                  :is-score-mode="true"
                  :scale="pickerScale"
                  :is-dark-mode="globalDarkMode"
                  fret-number-size="lg"
                />
                <div v-else :style="getCalculatedOrCachedSize(chord.fretCount)" />
              </div>
            </TransitionGroup>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <template #footer>
      <div
        v-wheel-scroll.smooth
        class="picker-section-nav no-scrollbar flex items-center justify-center gap-sm w-full overflow-x-auto py-xs scroll-smooth"
        role="navigation"
        aria-label="和弦分区快速跳转"
      >
        <ActionButton
          v-for="section in chordSections"
          :key="section.id"
          :variant="activeSectionId === section.id ? 'subtle' : 'ghost'"
          :color="activeSectionId === section.id ? 'primary' : 'default'"
          size="sm"
          class="section-nav-chip shrink-0"
          :aria-label="`跳转到 ${section.title} 区`"
          :aria-current="activeSectionId === section.id ? 'true' : undefined"
          @click="scrollToSection(section.id)"
        >
          <span class="group-label text-xs font-semibold"> {{ section.title }} </span>
          <span
            class="group-count pl-2 text-2xs font-semibold"
            :class="{ 'is-selected font-extrabold': activeSectionId === section.id }"
          >
            {{ section.chords.length }}
          </span>
        </ActionButton>
      </div>
    </template>
  </BaseModal>
</template>

<script lang="ts">
const fretboardSizeCache = reactive(new Map<string, { width: string; height: string }>());
</script>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseSegmentedControl from '@/components/base/BaseSegmentedControl.vue';
import BaseSelector from '@/components/base/BaseSelector.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { useScoreLinesData } from '@/composables/score/useScoreLinesData';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { GroupSortRule } from '@/types';
import { observeVisibility } from '@/utils/core/common';
import { getPlaceholderSize } from '@/utils/music/chord-fretboard';
import { getGroupSortKey, toGroupId } from '@/utils/music/entityFactories';
import {
  KEY_OPTIONS,
  SORT_RULE_CONFIG,
  computeChordFingerprint,
  getChordName,
  parseChordName,
  resolveChordRootPitch,
} from '@/utils/music/musicTheory';
import { Pencil, Plus, Search } from '@lucide/vue';
import {
  computed,
  nextTick,
  onDeactivated,
  reactive,
  ref,
  useTemplateRef,
  watch,
  type ComponentPublicInstance,
} from 'vue';
import { useRouter } from 'vue-router';

const pickerScale = 0.32;
const props = defineProps<{
  visible: boolean;
}>();
const getCacheKey = (fretCount: number) => `${fretCount}_${pickerScale}`;
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();
const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});
const router = useRouter();
const editorStore = useChordEditorStore();
const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
const { chordsLookupMap } = useScoreLinesData();

const scrollWrapperRef = useTemplateRef<HTMLElement>('scrollWrapperRef');
const visibleMap = reactive(new Map<string, boolean>());
const editHoverMap = reactive(new Map<string, boolean>());
const cardObserverStops = new Map<string, () => void>();

const setCardObserverRef = (el: Element | ComponentPublicInstance | null, chordId: string) => {
  if (!el) {
    cardObserverStops.get(chordId)?.();
    cardObserverStops.delete(chordId);
    return;
  }
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;
  if (visibleMap.get(chordId) || cardObserverStops.has(chordId)) return;
  const stop = observeVisibility(
    domEl,
    visible => {
      if (visible) {
        visibleMap.set(chordId, true);
        stop();
        cardObserverStops.delete(chordId);
      }
    },
    scrollWrapperRef.value
  );
  cardObserverStops.set(chordId, stop);
};

const clearAllCardObservers = () => {
  cardObserverStops.forEach(stop => stop());
  cardObserverStops.clear();
};

const setFretboardMeasureRef = (el: Element | ComponentPublicInstance | null, fretCount: number) => {
  const cacheKey = getCacheKey(fretCount);
  if (!el || fretboardSizeCache.has(cacheKey)) return;
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;
  const rect = domEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    fretboardSizeCache.set(cacheKey, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }
};

const getCalculatedOrCachedSize = (fretCount: number) => {
  const cacheKey = getCacheKey(fretCount);
  const cached = fretboardSizeCache.get(cacheKey);
  if (cached) return cached;
  const coreSize = getPlaceholderSize(fretCount, pickerScale, true, true);
  fretboardSizeCache.set(cacheKey, coreSize);
  return coreSize;
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
  const options: Array<{ label: string; value: string; count: number }> = [
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

const isCurrentBound = (chord: Chord) => chordMeta.value.get(chord.id)?.isBound ?? false;

const getDefaultSortForGroup = (groupId: string): { sortRule: GroupSortRule; sortKey: string } => {
  if (groupId === 'ALL') return { sortRule: GroupSortRule.ROOT_PITCH, sortKey: 'C' };
  const targetGroup = chordStore.groups.find(g => g.id === groupId);
  return {
    sortRule: targetGroup?.sortRule || GroupSortRule.ROOT_PITCH,
    sortKey: targetGroup ? getGroupSortKey(targetGroup) || 'C' : 'C',
  };
};

const saveUserPickerState = () => {
  savedUserPickerState.value = {
    groupId: selectedGroupId.value,
    sortRule: sortOverride.value,
    sortKey: tempSortKey.value,
  };
};

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

const handleSortRuleChange = (newRule: GroupSortRule) => {
  sortOverride.value = newRule;
  saveUserPickerState();
  resetScrollTop();
};

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
        const rootPitch = resolveChordRootPitch(chord.strings, chord.capo, chord.tuning, chord, chord.rootStringIndex);
        if (rootPitch >= 0 && rootPitch < 12) {
          const SHARP_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const SHARP_LABELS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
          result = { key: SHARP_KEYS[rootPitch] ?? 'OTHER', label: SHARP_LABELS[rootPitch] ?? '其他' };
        } else {
          result = { key: 'OTHER', label: '其他' };
        }
      }
    } else {
      const rootPitch = resolveChordRootPitch(chord.strings, chord.capo, chord.tuning, chord, chord.rootStringIndex);
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

  return orderedKeys.map(k => sectionMap.get(k)!);
});

const handleSelectChord = (chord: Chord) => {
  if (scoreEditor.selectedSlotKey !== null && scoreEditor.activeSong) {
    scoreEditor.setSlotChord(scoreEditor.selectedSlotKey, chord);
  }
  visibleModel.value = false;
};

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

const goToWorkbenchToEdit = (chord: Chord) => {
  visibleModel.value = false;
  editorStore.setEditor(chord);
  chordStore.selectAndExpandGroup(chord.groupId);
  router.push('/');
};

const scrollToSection = (sectionId: string) => {
  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl) return;
  const target = scrollEl.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  if (!target) return;

  activeSectionId.value = sectionId;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const activeSectionId = ref<string | null>(null);

let scrollRafId = 0;
const rebuildSectionEls = () => {};

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

const handleScroll = () => {
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0;
    updateActiveSection();
  });
};

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
  clearAllCardObservers();
  if (scrollRafId) cancelAnimationFrame(scrollRafId);
  scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
});
</script>
