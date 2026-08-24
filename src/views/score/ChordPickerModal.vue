<template>
  <BaseModal
    v-model:visible="visibleModel"
    title="选择要绑定的和弦"
    :show-footer="false"
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
              placeholder="搜索和弦名称..."
              clearable
              autofocus
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
        <div class="picker-group-pills-bar no-scrollbar">
          <ActionButton
            v-for="group in groupTabOptions"
            :key="String(group.value)"
            :variant="selectedGroupId === group.value ? 'subtle' : 'ghost'"
            :primary="selectedGroupId === group.value"
            @click="handleGroupTabChange(String(group.value))"
          >
            {{ group.label }}
          </ActionButton>
        </div>
      </div>
      <div ref="scrollWrapperRef" class="picker-scroll-content no-scrollbar">
        <EmptyState v-if="filteredChords.length === 0" description="当前搜索或分组下暂无匹配和弦。" size="lg" />
        <div
          v-auto-animate
          class="picker-cards-grid-cols"
          role="group"
          aria-label="和弦选择列表"
          @keydown="handleKeydown"
        >
          <div
            v-for="(chord, index) in filteredChords"
            :key="chord.id"
            :ref="
              el => {
                setCardObserverRef(el, chord.id);
                setItemRef(el, index);
              }
            "
            v-wave
            v-memo="[
              chord.id,
              computeChordFingerprint(chord),
              visibleMap[chord.id],
              isCurrentBound(chord),
              pickerScale,
              globalDarkMode,
            ]"
            role="button"
            :tabindex="isCurrentBound(chord) ? -1 : 0"
            :aria-pressed="isCurrentBound(chord)"
            :aria-disabled="isCurrentBound(chord)"
            :aria-label="`和弦 ${chord.chordName}${isCurrentBound(chord) ? '（当前已绑定）' : ''}`"
            class="picker-chord-card"
            :class="{ 'is-current-bound': isCurrentBound(chord) }"
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
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script lang="ts">
const fretboardSizeCache = reactive<Record<string, { width: string; height: string }>>({});
</script>

<script setup lang="ts">
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import type { Chord } from '@/types';
import { GroupSortRule } from '@/types';
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { useScoreLinesData } from '@/composables/useScoreLinesData';
import { getPlaceholderSize } from '@/utils/chord-fretboard';
import { KEY_OPTIONS, SORT_RULE_CONFIG, computeChordFingerprint } from '@/utils/musicTheory';
import { observeVisibility } from '@/utils/common';
import { vAutoAnimate } from '@formkit/auto-animate';
import { Plus, Search } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, onDeactivated, reactive, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue';
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
const { setItemRef, handleKeydown } = useGridNavigation(4, () => filteredChords.value.length);

// 所有卡片共享同一个 IntersectionObserver（见 observeVisibility），命中即停
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
  const coreHeight = parseFloat(coreSize.height);
  const calculatedSize = { width: `100%`, height: `${coreHeight}px` };
  fretboardSizeCache[cacheKey] = calculatedSize;
  return calculatedSize;
};

const selectedGroupId = ref<string>('ALL');
const pickerSearchQuery = ref<string>('');
const debouncedPickerQuery = refDebounced(pickerSearchQuery, 150);
const sortOverride = ref<GroupSortRule>(GroupSortRule.ROOT_PITCH);
const tempSortKey = ref<string>('C');
const savedUserPickerState = ref<{
  groupId: string;
  sortRule: GroupSortRule;
  sortKey: string;
} | null>(null);

const groupTabOptions = computed<SegmentOption<string>[]>(() => {
  const options: SegmentOption<string>[] = [{ label: '全部和弦', value: 'ALL' }];
  chordStore.groups.forEach(g => {
    options.push({ label: g.name, value: g.id });
  });
  return options;
});

const boundId = computed(() => {
  if (scoreEditor.selectedSlotKey == null) return null;
  return scoreEditor.activeSong?.chordMap?.[scoreEditor.selectedSlotKey] ?? null;
});

const boundFingerprint = computed(() => {
  const id = boundId.value;
  if (!id) return null;
  const boundChord = chordsLookupMap.value.get(id);
  return boundChord ? computeChordFingerprint(boundChord) : null;
});

const isCurrentBound = (chord: Chord) =>
  chord.id === boundId.value || (!!boundFingerprint.value && computeChordFingerprint(chord) === boundFingerprint.value);

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

const handleGroupTabChange = (newGid: string) => {
  selectedGroupId.value = newGid;
  const { sortRule, sortKey } = getDefaultSortForGroup(newGid);
  sortOverride.value = sortRule;
  tempSortKey.value = sortKey;
  saveUserPickerState();
};

const handleSortRuleChange = (newRule: GroupSortRule) => {
  sortOverride.value = newRule;
  saveUserPickerState();
};

const handleSortKeyChange = (newKey: string) => {
  tempSortKey.value = newKey;
  saveUserPickerState();
};

watch(
  () => scoreEditor.activeSongId,
  () => {
    savedUserPickerState.value = null;
  }
);

watch(
  () => props.visible,
  val => {
    if (!val) return;
    pickerSearchQuery.value = '';
    // fretboardSizeCache 按弦数_缩放键控（最多几项），保留可避免重开时重新测量
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
  }
);

const filteredChords = computed(() => {
  const activeGroup = chordStore.groups.find(g => g.id === selectedGroupId.value);
  const effectiveKey = sortOverride.value === GroupSortRule.KEY_DEGREE ? tempSortKey.value : activeGroup?.sortKey;
  return chordStore.getFilteredChords(selectedGroupId.value, {
    searchQuery: debouncedPickerQuery.value,
    sortRule: sortOverride.value,
    sortKey: effectiveKey,
  });
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
  router.push('/');
};

onDeactivated(() => {
  clearAllCardObservers();
});
</script>
<style scoped lang="less">
@import '@/assets/tokens.module';
:deep(.chord-picker-modal .modal-card) {
  width: 56rem !important;
  max-width: 95vw;
}
.chord-picker-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: @space-sm;
}
.picker-fixed-header {
  display: flex;
  flex-direction: column;
  gap: @space-md;
  flex-shrink: 0;
  padding-bottom: 0.6rem;
  margin-bottom: 0.6rem;
  border-bottom: 1px solid var(--border-light);
}
.picker-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: @space-lg;
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
  gap: @space-sm;
}
.sort-label {
  font-size: @fs-xs;
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
  gap: @space-sm;
  overflow-x: auto;
  padding: @space-xs 0 @space-xs @space-xs;
  scroll-behavior: smooth;
}
.picker-scroll-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: @space-xs;
}
.picker-cards-grid-cols {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: @space-lg;
}
.picker-chord-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  align-self: start;
  padding: @space-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  transition:
    border-color @duration-fast ease,
    background-color @duration-fast ease,
    box-shadow @duration-fast ease,
    transform @duration-fast ease;
  outline: none;
  :deep(*) {
    cursor: inherit !important;
    pointer-events: inherit !important;
  }
  &:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: @shadow-md;
  }
  &.is-current-bound {
    background-color: var(--tint-primary-88);
    border-color: @primary;
    box-shadow: @focus-ring-primary;
    cursor: default !important;
    pointer-events: none !important;
  }
}
</style>
