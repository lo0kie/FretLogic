<template>
  <BaseModal
    v-model:visible="visibleModel"
    title="选择要绑定的和弦"
    :show-footer="false"
    class="chord-picker-modal"
    width="w-wide"
  >
    <div class="chord-picker-wrapper no-scrollbar">
      <EmptyState
        v-if="chordStore.savedChordsList.length === 0"
        description="当前库中暂无保存的和弦，请先在工作台创建并保存和弦。"
        size="lg"
      />

      <template v-else>
        <div class="picker-header-bar">
          <BaseInput
            v-model="pickerSearchQuery"
            placeholder="搜索和弦..."
            clearable
            size="sm"
            autofocus
            fontSize="xs"
            class="picker-search-input"
          >
            <template #prefix>
              <Search class="search-icon" :size="14" stroke-width="2.5" />
            </template>
          </BaseInput>
        </div>

        <div class="picker-toolbar">
          <div class="group-select-tabs no-scrollbar">
            <BaseSegmentedControl v-model="selectedGroupId" :options="groupTabOptions" />
          </div>
        </div>

        <EmptyState
          v-if="filteredChords.length === 0"
          description="当前库中暂无保存的和弦，请先在工作台创建并保存和弦。"
          size="lg"
        />

        <div v-else class="picker-cards-grid-4cols">
          <div
            v-for="chord in filteredChords"
            :key="chord.id"
            class="picker-chord-card"
            :class="{ 'is-current-bound': isCurrentBound(chord) }"
            @click="!isCurrentBound(chord) && handleSelectChord(chord)"
          >
            <span class="card-name">{{ chord.chordName }}</span>
            <Fretboard
              :interactive="false"
              :scale="0.38"
              :strings="chord.strings"
              :capo="chord.capo"
              :fret-count="chord.fretCount"
              :is-dark-mode="settingsStore.isDarkMode"
            />
          </div>
        </div>
      </template>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Chord } from '@/types';
import { Search } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

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

const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();

const selectedGroupId = ref<string>('ALL');
const pickerSearchQuery = ref<string>('');

const groupTabOptions = computed<SegmentOption<string>[]>(() => {
  const options: SegmentOption<string>[] = [{ label: '全部和弦', value: 'ALL' }];
  chordStore.groups.forEach(g => {
    options.push({ label: g.name, value: g.id });
  });
  return options;
});

watch(
  () => props.visible,
  val => {
    if (val) {
      pickerSearchQuery.value = '';

      const currentSlotKey = scoreEditor.selectedSlotKey;
      const boundChord = currentSlotKey !== null ? scoreEditor.activeSong?.chordMap[currentSlotKey] : null;

      if (boundChord && boundChord.groupId) {
        selectedGroupId.value = boundChord.groupId;
      } else if (chordStore.selectedGroupId && chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
        selectedGroupId.value = chordStore.selectedGroupId;
      } else {
        selectedGroupId.value = 'ALL';
      }
    }
  }
);

const currentBoundChord = computed(() => {
  if (scoreEditor.selectedSlotKey === null || !scoreEditor.activeSong?.chordMap) return null;
  return scoreEditor.activeSong.chordMap[scoreEditor.selectedSlotKey] || null;
});

const isCurrentBound = (chord: Chord) => {
  const bound = currentBoundChord.value;
  if (!bound) return false;
  if (chord.id && bound.id) {
    return chord.id === bound.id;
  }
  return chord.fingerprint && bound.fingerprint ? chord.fingerprint === bound.fingerprint : false;
};

const filteredChords = computed(() => {
  let list = chordStore.savedChordsList;
  if (selectedGroupId.value !== 'ALL') {
    list = list.filter(c => c.groupId === selectedGroupId.value);
  }
  const query = pickerSearchQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter(c => c.chordName.toLowerCase().includes(query));
  }
  return list;
});

const handleSelectChord = (chord: Chord) => {
  if (scoreEditor.selectedSlotKey !== null && scoreEditor.activeSong) {
    scoreEditor.setSlotChord(scoreEditor.selectedSlotKey, chord);
  }
  visibleModel.value = false;
};
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
  gap: 0.8rem;
  max-height: 68vh;
  overflow-y: auto;
}

.picker-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.picker-search-input {
  flex: 1;
  max-width: 18rem;
}

.search-icon {
  color: var(--text-disabled);
}

.picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 0.6rem;
}

.group-select-tabs {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.1rem;
}

.picker-cards-grid-4cols {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}

.picker-chord-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: @shadow-md;
  }

  &.is-current-bound {
    background-color: color-mix(in srgb, @primary, transparent 88%);
    border-color: @primary;
    box-shadow: @focus-ring-primary;
    cursor: default;
    pointer-events: none;

    .card-name {
      color: @primary;
    }
  }
}

.card-name {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-title);
  margin-bottom: 0.25rem;
}
</style>
