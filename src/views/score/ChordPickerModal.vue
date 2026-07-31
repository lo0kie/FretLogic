<template>
  <BaseModal
    v-model:visible="visibleModel"
    title="选择要绑定的和弦"
    :show-footer="false"
    class="chord-picker-modal"
    width="w-wide"
  >
    <div class="chord-picker-wrapper no-scrollbar">
      <div v-if="chordStore.savedChordsList.length === 0" class="empty-chords-tip">
        当前库中暂无保存的和弦，请先在工作台创建并保存和弦。
      </div>

      <template v-else>
        <div class="picker-header-bar">
          <BaseInput
            v-model="pickerSearchQuery"
            placeholder="搜索和弦..."
            clearable
            size="sm"
            fontSize="xs"
            class="picker-search-input"
          >
            <template #prefix>
              <Search class="search-icon" :size="14" stroke-width="2.5" />
            </template>
          </BaseInput>

          <button
            v-if="selectedSlotKey !== null && songStore.activeSong?.chordMap[selectedSlotKey]"
            class="clear-chord-btn"
            @click="handleRemoveChord"
          >
            清除当前和弦
          </button>
        </div>

        <div class="picker-toolbar">
          <div class="group-select-tabs no-scrollbar">
            <button
              class="group-tab-item"
              :class="{ 'is-active': selectedGroupId === 'ALL' }"
              @click="selectedGroupId = 'ALL'"
            >
              全部和弦
            </button>
            <button
              v-for="group in chordStore.groups"
              :key="group.id"
              class="group-tab-item"
              :class="{ 'is-active': selectedGroupId === group.id }"
              @click="selectedGroupId = group.id"
            >
              {{ group.name }}
            </button>
          </div>
        </div>

        <div v-if="filteredChords.length === 0" class="empty-chords-tip">未找到匹配的和弦</div>

        <div v-else class="picker-cards-grid-4cols">
          <div
            v-for="chord in filteredChords"
            :key="chord.id"
            class="picker-chord-card"
            @click="handleSelectChord(chord)"
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
import Fretboard from '@/components/Fretboard.vue';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import type { Chord } from '@/types';
import { Search } from '@lucide/vue';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  selectedSlotKey: string | number | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

const chordStore = useChordStore();
const songStore = useSongStore();
const settingsStore = useSettingsStore();

const selectedGroupId = ref<string>('ALL');
const pickerSearchQuery = ref<string>('');

watch(
  () => props.visible,
  val => {
    if (val) {
      pickerSearchQuery.value = '';
      if (chordStore.selectedGroupId && chordStore.groups.some(g => g.id === chordStore.selectedGroupId)) {
        selectedGroupId.value = chordStore.selectedGroupId;
      } else {
        selectedGroupId.value = 'ALL';
      }
    }
  }
);

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
  if (props.selectedSlotKey !== null && songStore.activeSong) {
    songStore.setCharChord(songStore.activeSong.id, props.selectedSlotKey, chord);
  }
  visibleModel.value = false;
};

const handleRemoveChord = () => {
  if (props.selectedSlotKey !== null && songStore.activeSong) {
    songStore.removeCharChord(songStore.activeSong.id, props.selectedSlotKey);
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

.group-tab-item {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
  background-color: var(--bg-body);
  color: var(--text-body);
  cursor: pointer;
  white-space: nowrap;
  transition: @transition-fast;

  &:hover {
    border-color: var(--border-base);
  }

  &.is-active {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: transparent;
  }
}

.empty-chords-tip {
  font-size: 0.8rem;
  color: var(--text-disabled);
  text-align: center;
  padding: 2rem 0;
}

.clear-chord-btn {
  padding: 0.35rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid var(--color-danger);
  background-color: color-mix(in srgb, var(--color-danger), transparent 90%);
  color: var(--color-danger);
  font-weight: 700;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background-color: var(--color-danger);
    color: #ffffff;
  }
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
}

.card-name {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-title);
  margin-bottom: 0.25rem;
}
</style>
