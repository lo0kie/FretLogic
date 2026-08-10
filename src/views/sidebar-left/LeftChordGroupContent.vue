<!-- src/views/sidebar-left/LeftChordGroupContent.vue -->
<template>
  <div class="chord-content-outer" :class="{ 'is-open': isOpen }" :aria-hidden="!isOpen" :inert="!isOpen">
    <div class="chord-content-inner" v-auto-animate @contextmenu.stop>
      <div
        v-if="groupedCards.length > 0"
        ref="gridContainerRef"
        class="chords-grid-layout"
        @keydown="handleKeydown"
        v-auto-animate
      >
        <LeftChordCard
          v-for="cardData in groupedCards"
          :key="cardData.mainChord.id"
          :card-data
          @delete-variants="cardData => emit('open-delete-variants', cardData)"
          :is-editing="cardData.variants.some(c => c.id === editorStore.draftChord.id)"
          @delete="chord => emit('delete-chord', chord)"
          @move="chord => emit('open-move', chord)"
          @select="chord => emit('select-chord', chord)"
          class="chord-item-grab-handle"
        />
      </div>
      <EmptyState v-else-if="chordsCount === 0" size="sm" description="暂无和弦" />
      <EmptyState v-else-if="searchQuery" size="sm" description="无匹配" />
    </div>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { useGridNavigation } from '@/services/useGridNavigation';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { sortChordsByRule } from '@/utils/musicTheory.ts';
import { vAutoAnimate } from '@formkit/auto-animate';
import { computed, useTemplateRef } from 'vue';
import LeftChordCard from './LeftChordCard.vue';

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
}>();

const editorStore = useEditorStore();
const chordStore = useChordStore();

const gridContainerRef = useTemplateRef<HTMLElement>('gridContainerRef');
const chordsCount = computed(() => chordStore.groupChordMap.get(props.group.id)?.length ?? 0);

const groupedCards = computed<GroupedChordCard[]>(() => {
  const groupCards = chordStore.groupedChordMap.get(props.group.id) ?? [];
  const query = props.searchQuery.toLowerCase().trim();

  const targetCards = query
    ? groupCards.filter(card => card.mainChord.chordName.toLowerCase().includes(query))
    : groupCards;

  const cardMap = new Map(targetCards.map(c => [c.mainChord.id, c]));
  const sortedMainChords = sortChordsByRule(
    targetCards.map(c => c.mainChord),
    props.group.sortRule,
    props.group.sortKey
  );

  return sortedMainChords.map(main => cardMap.get(main.id)!).filter(Boolean);
});

const { handleKeydown } = useGridNavigation(3, gridContainerRef, {
  selector: '.chord-thumb-card',
  stop: true,
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.chord-content-outer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows @duration-base @bezier-standard;
  pointer-events: none;

  &.is-open {
    grid-template-rows: 1fr;
    pointer-events: auto;
  }
}

.chord-content-inner {
  overflow: hidden;
  min-height: 0;
  padding-top: 0;
  box-sizing: border-box;
  transition: padding-top @duration-base @bezier-standard;
}

.chords-grid-layout {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  align-items: center;
  position: relative;
  z-index: 10;
  min-height: 2.2rem;
  box-sizing: border-box;
  padding: 0.55rem 0.4rem 0.55rem 0.4rem;
}
</style>
