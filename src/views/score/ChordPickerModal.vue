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
      <ActionButton size="sm" variant="subtle" primary @click="goToWorkbenchToCreate">
        <template #prefix><Plus :size="14" stroke-width="2.5" aria-hidden="true" /></template>
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
              size="sm"
              autofocus
              fontSize="xs"
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
              size="sm"
              :options="SORT_RULE_CONFIG"
              @update:model-value="handleSortRuleChange"
            />

            <BaseSelector
              :disabled="sortOverride !== 'KEY_DEGREE'"
              v-model="tempSortKey"
              size="sm"
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
            size="sm"
            :variant="selectedGroupId === group.value ? 'subtle' : 'ghost'"
            :primary="selectedGroupId === group.value"
            @click="handleGroupTabChange(String(group.value))"
          >
            {{ group.label }}
          </ActionButton>
        </div>
      </div>

      <div class="picker-scroll-content no-scrollbar" ref="scrollWrapperRef" v-auto-animate>
        <EmptyState v-if="filteredChords.length === 0" description="当前搜索或分组下暂无匹配和弦。" size="lg" />

        <div v-else class="picker-cards-grid-4cols" role="group" aria-label="和弦选择列表" v-auto-animate>
          <div
            v-wave
            v-for="chord in filteredChords"
            :key="chord.id"
            :ref="el => setCardObserverRef(el, chord.id)"
            role="button"
            :tabindex="isCurrentBound(chord) ? -1 : 0"
            :aria-pressed="isCurrentBound(chord)"
            :aria-disabled="isCurrentBound(chord)"
            :aria-label="`和弦 ${chord.chordName}${isCurrentBound(chord) ? '（当前已绑定）' : ''}`"
            class="picker-chord-card"
            :class="{ 'is-current-bound': isCurrentBound(chord) }"
            @click="!isCurrentBound(chord) && handleSelectChord(chord)"
            @keydown.enter.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
            @keydown.space.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
          >
            <span class="card-name">{{ chord.chordName }}</span>

            <Fretboard
              v-if="visibleMap[chord.id]"
              :chord="chord"
              :ref="el => setFretboardMeasureRef(el, chord.fretCount)"
              :interactive="false"
              :scale="PICKER_FRETBOARD_SCALE"
              :is-dark-mode="settingsStore.isDarkMode"
            />
            <div v-else :style="getCalculatedOrCachedSize(chord.fretCount)" />
          </div>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script lang="ts">
const fretboardSizeCache = reactive<Record<number, { width: string; height: string }>>({});
</script>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import { KEY_OPTIONS, PICKER_FRETBOARD_SCALE, SORT_RULE_CONFIG } from '@/constants';
import { useScoreLinesData } from '@/services/useScoreLinesData';
import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Chord, GroupSortRule } from '@/types';
import { getPlaceholderSize } from '@/utils/fretboardVisuals';
import { sortChordsByRule } from '@/utils/musicTheory';
import { vAutoAnimate } from '@formkit/auto-animate';
import { Plus, Search } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, onDeactivated, reactive, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

const router = useRouter();
const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const { chordsLookupMap } = useScoreLinesData();

const scrollWrapperRef = useTemplateRef<HTMLElement>('scrollWrapperRef');
const visibleMap = reactive<Record<string, boolean>>({});

const cardObservers = new Map<string, IntersectionObserver>();

const setCardObserverRef = (el: Element | ComponentPublicInstance | null, chordId: string) => {
  if (!el) {
    cardObservers.get(chordId)?.disconnect();
    cardObservers.delete(chordId);
    return;
  }

  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;

  if (visibleMap[chordId] || cardObservers.has(chordId)) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        visibleMap[chordId] = true;
        observer.disconnect();
        cardObservers.delete(chordId);
      }
    },
    { root: scrollWrapperRef.value }
  );

  observer.observe(domEl);
  cardObservers.set(chordId, observer);
};

const clearAllCardObservers = () => {
  cardObservers.forEach(observer => observer.disconnect());
  cardObservers.clear();
};

const setFretboardMeasureRef = (el: Element | ComponentPublicInstance | null, fretCount: number) => {
  if (!el || fretboardSizeCache[fretCount]) return;

  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;

  const rect = domEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    fretboardSizeCache[fretCount] = {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }
};

const getCalculatedOrCachedSize = (fretCount: number) => {
  if (fretboardSizeCache[fretCount]) return fretboardSizeCache[fretCount];

  const coreSize = getPlaceholderSize(fretCount, PICKER_FRETBOARD_SCALE);
  const coreHeight = parseFloat(coreSize.height);
  const calculatedSize = { width: `100%`, height: `${coreHeight}px` };

  fretboardSizeCache[fretCount] = calculatedSize;
  return calculatedSize;
};

const selectedGroupId = ref<string>('ALL');
const pickerSearchQuery = ref<string>('');

const debouncedPickerQuery = refDebounced(pickerSearchQuery, 150);

const sortOverride = ref<GroupSortRule>('ROOT_PITCH');
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

const getDefaultSortForGroup = (groupId: string): { sortRule: GroupSortRule; sortKey: string } => {
  if (groupId === 'ALL') return { sortRule: 'ROOT_PITCH', sortKey: 'C' };
  const targetGroup = chordStore.groups.find(g => g.id === groupId);
  return {
    sortRule: targetGroup?.sortRule || 'ROOT_PITCH',
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
    Object.keys(fretboardSizeCache).forEach(key => delete fretboardSizeCache[Number(key)]);
    clearAllCardObservers();

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
      sortOverride.value = 'ROOT_PITCH';
      tempSortKey.value = 'C';
    }
  }
);

const currentBoundChordId = computed(() => {
  if (scoreEditor.selectedSlotKey === null || !scoreEditor.activeSong?.chordMap) return null;
  return scoreEditor.activeSong.chordMap[scoreEditor.selectedSlotKey] || null;
});

const isCurrentBound = (chord: Chord) => {
  const boundId = currentBoundChordId.value;
  if (!boundId) return false;
  return chord.id === boundId || chord.fingerprint === boundId;
};

const filteredChords = computed(() => {
  let list =
    selectedGroupId.value === 'ALL'
      ? chordStore.savedChordsList
      : chordStore.savedChordsList.filter(c => c.groupId === selectedGroupId.value);

  const query = debouncedPickerQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter(c => c.chordName.toLowerCase().includes(query));
  }

  const activeGroup = chordStore.groups.find(g => g.id === selectedGroupId.value);
  const effectiveKey = sortOverride.value === 'KEY_DEGREE' ? tempSortKey.value : activeGroup?.sortKey;

  return sortChordsByRule(list, sortOverride.value, effectiveKey);
});

const handleSelectChord = (chord: Chord) => {
  if (scoreEditor.selectedSlotKey !== null && scoreEditor.activeSong) {
    scoreEditor.setSlotChord(scoreEditor.selectedSlotKey, chord);
  }
  visibleModel.value = false;
};

const goToWorkbenchToCreate = () => {
  visibleModel.value = false;
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
}

.picker-fixed-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex-shrink: 0;
  padding-bottom: 0.6rem;
  margin-bottom: 0.6rem;
  background-color: var(--bg-panel);
  border-bottom: 1px solid var(--border-light);
}

.picker-controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
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
  gap: 0.5rem;
}

.sort-label {
  font-size: 0.7rem;
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
  gap: 0.4rem;
  overflow-x: auto;
  padding: 0.1rem 0;
  scroll-behavior: smooth;
}

.selector-pop-enter-active,
.selector-pop-leave-active {
  transition:
    opacity @duration-fast ease,
    transform @duration-fast @bezier-standard;
}

.selector-pop-enter-from,
.selector-pop-leave-to {
  opacity: 0;
  transform: translateX(-6px) scale(0.95);
}

.picker-scroll-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.2rem;
}

.picker-cards-grid-4cols {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}

.picker-chord-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  align-self: start;
  padding: 0.6rem;
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

  &:hover,
  &:focus-visible {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: @shadow-md;
  }

  &:focus-visible {
    box-shadow: @focus-ring-primary;
  }

  &.is-current-bound {
    background-color: color-mix(in srgb, @primary, transparent 88%);
    border-color: @primary;
    box-shadow: @focus-ring-primary;
    cursor: default !important;
    pointer-events: none !important;

    .card-name {
      color: @primary;
    }
  }
}

.card-name {
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.2rem;
  height: 1.2rem;
  color: var(--text-title);
  margin-bottom: 0.25rem;
}
</style>
