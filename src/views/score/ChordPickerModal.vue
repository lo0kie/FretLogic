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
      <ActionButton variant="subtle" primary @click="goToWorkbenchToCreate">
        <template #prefix>
          <Plus :size="14" stroke-width="2.5" aria-hidden="true" />
        </template>
        新建和弦
      </ActionButton>
    </template>
    <div class="chord-picker-wrapper">
      <div class="picker-fixed-header">
        <div class="picker-controls-row">
          <div class="search-input-wrapper">
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
                <Search class="search-icon" :size="14" stroke-width="2.5" aria-hidden="true" />
              </template>
            </BaseInput>
          </div>
          <div class="sort-action-group">
            <span class="sort-label">排序</span>
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
              :label-formatter="val => `${val} 调`"
              class="picker-key-selector"
              width="sm"
              @update:model-value="handleSortKeyChange"
            />
          </div>
        </div>
        <div v-wheel-scroll.smooth class="picker-group-pills-bar no-scrollbar">
          <ActionButton
            v-for="group in groupTabOptions"
            :key="String(group.value)"
            :variant="selectedGroupId === group.value ? 'subtle' : 'ghost'"
            :primary="selectedGroupId === group.value"
            @click="handleGroupTabChange(String(group.value))"
          >
            <span class="group-label">{{ group.label }}</span>
            <span class="group-count" :class="{ 'is-selected': selectedGroupId === group.value }">
              {{ group.count }}
            </span>
          </ActionButton>
        </div>
      </div>
      <div ref="scrollWrapperRef" class="picker-scroll-content no-scrollbar">
        <EmptyState v-if="filteredChords.length === 0" description="当前搜索或分组下暂无匹配和弦。" size="lg" />
        <TransitionGroup v-else name="picker-section" tag="div" class="picker-sections-list">
          <div
            v-for="section in chordSections"
            :key="section.id"
            class="picker-section-block"
            :data-section-id="section.id"
          >
            <div class="picker-section-header">
              <span class="picker-section-title">{{ section.title }}</span>
              <BaseBadge appearance="outline">{{ section.chords.length }}</BaseBadge>
            </div>
            <TransitionGroup
              name="picker-card"
              tag="div"
              class="picker-cards-grid-cols"
              role="group"
              :aria-label="`${section.title} 和弦组`"
              @keydown="handleKeydown"
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
                class="picker-chord-card"
                :class="{ 'is-current-bound': isCurrentBound(chord) }"
                :data-chord-id="chord.id"
                data-focusable-inline
                @click="!isCurrentBound(chord) && handleSelectChord(chord)"
                @keydown.enter.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
                @keydown.space.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
              >
                <Fretboard
                  v-if="visibleMap[chord.id]"
                  :ref="el => setFretboardMeasureRef(el, chord.fretCount)"
                  :chord
                  :interactive="false"
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
        class="picker-section-nav no-scrollbar"
        role="navigation"
        aria-label="和弦分区快速跳转"
      >
        <ActionButton
          v-for="section in chordSections"
          :key="section.id"
          :variant="activeSectionId === section.id ? 'subtle' : 'ghost'"
          :primary="activeSectionId === section.id"
          size="sm"
          class="section-nav-chip"
          :aria-label="`跳转到 ${section.title} 区`"
          :aria-current="activeSectionId === section.id ? 'true' : undefined"
          @click="scrollToSection(section.id)"
        >
          <span class="group-label">{{ section.title }}</span>
          <span class="group-count" :class="{ 'is-selected': activeSectionId === section.id }">
            {{ section.chords.length }}
          </span>
        </ActionButton>
      </div>
    </template>
  </BaseModal>
</template>

<script lang="ts">
const fretboardSizeCache = reactive<Record<string, { width: string; height: string }>>({});
</script>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseBadge from '@/components/BaseBadge.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { useScoreLinesData } from '@/composables/useScoreLinesData';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { GroupSortRule } from '@/types';
import { getPlaceholderSize } from '@/utils/chord-fretboard';
import { observeVisibility } from '@/utils/common';
import {
  KEY_OPTIONS,
  SORT_RULE_CONFIG,
  computeChordFingerprint,
  getChordName,
  parseChordName,
  resolveChordRootPitch,
} from '@/utils/musicTheory';
import { Plus, Search } from '@lucide/vue';
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
const visibleMap = reactive<Record<string, boolean>>({});
const cardObserverStops = new Map<string, () => void>();
const { handleKeydown } = useGridNavigation(5, scrollWrapperRef, { selector: '.picker-chord-card' });

const setCardObserverRef = (el: Element | ComponentPublicInstance | null, chordId: string) => {
  if (!el) {
    cardObserverStops.get(chordId)?.();
    cardObserverStops.delete(chordId);
    return;
  }
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;
  if (visibleMap[chordId] || cardObserverStops.has(chordId)) return;
  const stop = observeVisibility(
    domEl,
    visible => {
      if (visible) {
        visibleMap[chordId] = true;
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
  if (!el || fretboardSizeCache[cacheKey]) return;
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;
  const rect = domEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    fretboardSizeCache[cacheKey] = {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }
};

const getCalculatedOrCachedSize = (fretCount: number) => {
  const cacheKey = getCacheKey(fretCount);
  if (fretboardSizeCache[cacheKey]) return fretboardSizeCache[cacheKey];
  const coreSize = getPlaceholderSize(fretCount, pickerScale);
  fretboardSizeCache[cacheKey] = coreSize;
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
  const id = scoreEditor.activeSong?.chordMap?.[scoreEditor.selectedSlotKey] ?? null;
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
    sortKey: targetGroup?.sortKey || 'C',
  };
};

const saveUserPickerState = () => {
  savedUserPickerState.value = {
    groupId: selectedGroupId.value,
    sortRule: sortOverride.value,
    sortKey: tempSortKey.value,
  };
};

// 切换分组/排序/调后回到顶部并刷新分区高亮
const resetScrollTop = () => {
  nextTick(() => {
    const scrollEl = scrollWrapperRef.value;
    if (scrollEl) scrollEl.scrollTop = 0;
    rebuildSectionEls();
    updateActiveSection();
  });
};

const handleGroupTabChange = (newGid: string) => {
  selectedGroupId.value = newGid;
  const { sortRule, sortKey } = getDefaultSortForGroup(newGid);
  sortOverride.value = sortRule;
  tempSortKey.value = sortKey;
  saveUserPickerState();
  resetScrollTop();
};

const handleSortRuleChange = (newRule: GroupSortRule) => {
  sortOverride.value = newRule;
  saveUserPickerState();
  resetScrollTop();
};

const handleSortKeyChange = (newKey: string) => {
  tempSortKey.value = newKey;
  saveUserPickerState();
  resetScrollTop();
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
    const boundChordId = currentSlotKey !== null ? scoreEditor.activeSong?.chordMap[currentSlotKey] : null;
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
  }
);

const filteredChords = computed(() => {
  const activeGroup = chordStore.groups.find(g => g.id === selectedGroupId.value);
  const effectiveKey = sortOverride.value === GroupSortRule.KEY_DEGREE ? tempSortKey.value : activeGroup?.sortKey;
  return chordStore.getFilteredChords(selectedGroupId.value, {
    searchQuery: pickerSearchQuery.value,
    sortRule: sortOverride.value,
    sortKey: effectiveKey,
  });
});

// 预计算每个和弦的展示名与“是否已绑定”，模板只查表，避免重复 computeChordFingerprint / getChordName
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
    editorStore.draftChord.groupId = selectedGroupId.value;
  } else {
    chordStore.collapseAllGroups();
    chordStore.setSelectedGroupId(null);
  }
  router.push('/');
};

// 点击 footer 分区导航，平滑滚动到对应分区块
const scrollToSection = (sectionId: string) => {
  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl) return;
  const target = scrollEl.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// 滚动联动 footer 分区导航：高亮当前可见分区对应的 button
const activeSectionId = ref<string | null>(null);

// 缓存分区 DOM 元素，避免滚动时反复 querySelectorAll（原强制重排的主要来源）
let sectionElsCache: HTMLElement[] = [];
const rebuildSectionEls = () => {
  const scrollEl = scrollWrapperRef.value;
  sectionElsCache = scrollEl ? Array.from(scrollEl.querySelectorAll<HTMLElement>('[data-section-id]')) : [];
};

let scrollRafId = 0;
const updateActiveSection = () => {
  const scrollEl = scrollWrapperRef.value;
  if (!scrollEl) return;
  const sections = sectionElsCache;
  if (sections.length === 0) {
    activeSectionId.value = null;
    return;
  }
  // 触底时直接高亮最后一个分区
  const lastSection = sections[sections.length - 1];
  if (lastSection && scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1) {
    activeSectionId.value = lastSection.dataset.sectionId ?? null;
    return;
  }
  const containerTop = scrollEl.getBoundingClientRect().top;
  let current: string | null = null;
  for (const sec of sections) {
    const top = sec.getBoundingClientRect().top - containerTop;
    if (top <= 1) current = sec.dataset.sectionId ?? current;
    else break;
  }
  const firstSection = sections[0];
  activeSectionId.value = current ?? firstSection?.dataset.sectionId ?? null;
};

// rAF 节流：滚动事件合并到每帧至多一次，避免一滑触发几十次强制重排
const handleScroll = () => {
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = 0;
    updateActiveSection();
  });
};

// 分区内容（搜索/分组/排序）变化导致重排后，重新计算高亮
watch(chordSections, () => {
  nextTick(() => {
    rebuildSectionEls();
    updateActiveSection();
  });
});

onDeactivated(() => {
  clearAllCardObservers();
  if (scrollRafId) cancelAnimationFrame(scrollRafId);
  scrollWrapperRef.value?.removeEventListener('scroll', handleScroll);
});
</script>

<style scoped lang="scss">
.chord-picker-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: $space-sm;
}

.picker-fixed-header {
  display: flex;
  flex-direction: column;
  gap: $space-md;
  flex-shrink: 0;
  padding-bottom: 0.6rem;
  margin-bottom: 0.6rem;
  border-bottom: 1px solid var(--border-light);
}

.picker-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-lg;
}

.search-input-wrapper {
  flex: 1;
  max-width: 16rem;
}

.search-icon {
  color: var(--text-disabled);
}

.sort-action-group {
  display: flex;
  align-items: center;
  gap: $space-sm;
}

.sort-label {
  font-size: $fs-xs;
  font-weight: 600;
  color: var(--text-disabled);
  white-space: nowrap;
}

.picker-key-selector {
  width: 5.2rem;
}

.picker-group-pills-bar {
  display: flex;
  align-items: center;
  gap: $space-sm;
  overflow-x: auto;
  padding: $space-xs 0 $space-xs $space-xs;
  scroll-behavior: smooth;

  .group-label {
    font-size: $fs-xs;
    font-weight: 600;
  }

  .group-count {
    padding-left: $space-sm;
    font-size: $fs-2xs;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Rounded', sans-serif;

    &.is-selected {
      font-weight: 800;
    }
  }
}

.picker-scroll-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: $space-xs;
}

.picker-sections-list {
  display: flex;
  flex-direction: column;
  gap: $space-xl;
  width: 100%;
  position: relative;
}

.picker-section-block {
  display: flex;
  flex-direction: column;
  gap: $space-sm;
}

// Section FLIP 动画
.picker-section-move {
  transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

.picker-section-enter-active,
.picker-section-leave-active {
  transition: opacity 0.22s ease;
}

.picker-section-enter-from,
.picker-section-leave-to {
  opacity: 0;
}

.picker-section-leave-active {
  position: absolute;
  width: 100%;
  pointer-events: none;
}

.picker-section-header {
  display: flex;
  align-items: center;
  gap: $space-md;
  padding: $space-md 0;
  user-select: none;
}

.picker-section-title {
  font-size: $fs-sm;
  font-weight: 800;
  color: var(--text-title);
  letter-spacing: -0.01em;
}

.picker-section-count {
  font-size: $fs-2xs;
  font-weight: 700;
  color: var(--text-disabled);
  background-color: var(--bg-panel-hover);
  padding: 0.1rem 0.4rem;
  border-radius: $radius-pill;
  line-height: 1.2;
}

.picker-cards-grid-cols {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: $space-lg;
  position: relative;
}

// 卡片 FLIP 重排高性能 GPU 动画（严格保持 Grid 单元格宽度，绝不拉伸）
.picker-card-move {
  transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}

.picker-card-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
}

.picker-card-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  position: absolute;
  width: calc((100% - 4 * $space-lg) / 5);
  pointer-events: none;
  z-index: 0 !important;
}

.picker-card-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.picker-card-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.picker-chord-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  align-self: start;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  padding: $space-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: $radius-md;
  cursor: pointer;
  transition:
    border-color $duration-fast ease,
    background-color $duration-fast ease,
    box-shadow $duration-fast ease;
  outline: none;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: $shadow-md;
  }

  &.is-current-bound {
    background-color: var(--tint-primary-88);
    border-color: $primary;
    box-shadow: $focus-ring-primary;
    cursor: default !important;
    pointer-events: none !important;
  }
}

.tab-count-badge {
  font-size: $fs-2xs;
  padding: 0 0.3rem;
  min-width: 1.4em;
  height: 1.4em;
  line-height: 1.4em;
  opacity: 0.72;
}

.picker-section-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $space-sm;
  width: 100%;
  overflow-x: auto;
  padding: $space-xs 0;
  scroll-behavior: smooth;

  .section-nav-chip {
    flex-shrink: 0;
  }

  .group-label {
    font-size: $fs-xs;
    font-weight: 600;
  }

  .group-count {
    padding-left: $space-sm;
    font-size: $fs-2xs;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Rounded', sans-serif;
  }
}
</style>
