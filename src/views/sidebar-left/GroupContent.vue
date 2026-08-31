<template>
  <div
    class="grid transition-[grid-template-rows] duration-base ease-standard"
    :class="isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] pointer-events-none'"
    :aria-hidden="!isOpen"
    :inert="!isOpen ? true : undefined"
  >
    <div
      class="overflow-hidden min-h-0 pt-0 box-border transition-[padding-top] duration-base ease-standard"
      @contextmenu.stop
    >
      <TransitionGroup
        v-if="groupedCards.length > 0"
        v-grid-nav.stop="{ cols: gridCols, selector: '.chord-thumb-card' }"
        name="v-transition-list"
        tag="div"
        class="grid grid-cols-3 gap-sm pt-md px-sm pb-xs items-center relative z-panel min-h-[2.2rem] box-border"
      >
        <LeftChordCard
          v-for="cardData in groupedCards"
          :key="cardData.mainChord.id"
          v-memo="[
            cardData.mainChord,
            cardData.variantCount,
            cardData.mainChord.id === activeMainId,
            settingsStore.workbenchChordShorthand,
          ]"
          :card-data
          :is-active="cardData.mainChord.id === activeMainId"
          @delete-variants="data => emit('open-delete-variants', data)"
          @delete="chord => emit('delete-chord', chord)"
          @move="chord => emit('open-move', chord)"
          @select="chord => emit('select-chord', chord)"
          @open-references="cardData => emit('open-references', cardData)"
        />
      </TransitionGroup>
      <EmptyState v-else-if="chordsCount === 0" size="sm" description="暂无和弦" />
      <EmptyState v-else-if="searchQuery" size="sm" description="无匹配" />
    </div>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/base/EmptyState.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { getChordName } from '@/utils/music/musicTheory';
import { computed } from 'vue';
import LeftChordCard from './ChordCard.vue';

const gridCols = 3;

const props = defineProps<{
  group: Group;
  searchQuery: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-move', chord: Chord): void;
  (e: 'open-delete-variants', cardData: GroupedChordCard): void;
  (e: 'delete-chord', chord: Chord): void;
  (e: 'select-chord', chord: Chord): void;
  (e: 'open-references', cardData: GroupedChordCard): void;
}>();

const chordStore = useChordStore();
const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();

const chordsCount = computed(() => chordStore.groupChordMap.get(props.group.id)?.length ?? 0);
const groupedCards = computed(() => chordStore.getGroupedCards(props.group.id, props.searchQuery));

const activeMainId = computed(() => {
  const draft = editorStore.draftChord;
  if (draft.id) {
    for (const card of groupedCards.value) {
      if (card.variants.some(v => v.id === draft.id)) return card.mainChord.id;
    }
  }
  if (editorStore.isEditing) {
    const draftName = getChordName(draft).trim().toLowerCase();
    if (draftName) {
      for (const card of groupedCards.value) {
        if (
          card.mainChord.groupId === draft.groupId &&
          getChordName(card.mainChord).trim().toLowerCase() === draftName
        ) {
          return card.mainChord.id;
        }
      }
    }
  }
  return null;
});
</script>
