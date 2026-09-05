<template>
  <div
    :aria-hidden="!isOpen"
    :class="isOpen ? 'grid-rows-[1fr]' : 'pointer-events-none grid-rows-[0fr]'"
    :inert="!isOpen ? true : undefined"
    class="duration-base ease-standard grid transition-[grid-template-rows]"
    ref="groupContentRef"
  >
    <div
      @contextmenu.stop
      class="duration-base ease-standard box-border min-h-0 overflow-hidden pt-0 transition-[padding-top]"
    >
      <TransitionGroup
        v-grid-nav.stop="{ cols: gridCols, selector: '.chord-thumb-card' }"
        v-if="groupedCards.length > 0"
        class="gap-sm pt-md px-sm pb-xs z-panel relative box-border grid min-h-[2.2rem] grid-cols-3 items-center"
        name="v-transition-list"
        tag="div"
      >
        <LeftChordCard
          v-for="cardData in groupedCards"
          v-memo="[
            cardData.mainChord,
            cardData.variantCount,
            cardData.mainChord.id === activeMainId,
            cardData.mainChord.id === activeMainId ? editorStore.draftChord.id : '',
            settingsStore.workbenchChordShorthand,
          ]"
          v-scroll-into-view.y.once="cardData.mainChord.id === activeMainId"
          :card-data
          :is-active="cardData.mainChord.id === activeMainId"
          :key="cardData.mainChord.id"
          @delete="chord => emit('delete-chord', chord)"
          @delete-variants="data => emit('open-delete-variants', data)"
          @move="chord => emit('open-move', chord)"
          @open-references="cardData => emit('open-references', cardData)"
          @select="chord => emit('select-chord', chord)"
        />
      </TransitionGroup>
      <EmptyState v-else-if="chordsCount === 0" description="暂无和弦" size="sm" />
      <Transition name="v-transition-fade">
        <EmptyState v-if="chordsCount > 0 && searchQuery" description="无匹配" size="sm" />
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import LeftChordCard from '@/domains/chord/library/components/ChordCard.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';
import { useSettingsStore } from '@/platform/store/settingsStore';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';

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

const groupContentRef = useTemplateRef<HTMLElement>('groupContentRef');

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
