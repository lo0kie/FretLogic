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
          :card-data="cardData"
          :is-active="cardData.mainChord.id === activeMainId"
          class="chord-item-grab-handle"
          @delete-variants="data => emit('open-delete-variants', data)"
          @delete="chord => emit('delete-chord', chord)"
          @move="chord => emit('open-move', chord)"
          @select="chord => emit('select-chord', chord)"
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

const chordStore = useChordStore();
const editorStore = useEditorStore();
const gridContainerRef = useTemplateRef<HTMLElement>('gridContainerRef');

const chordsCount = computed(() => chordStore.groupChordMap.get(props.group.id)?.length ?? 0);
const groupedCards = computed(() => chordStore.getGroupedCards(props.group.id, props.searchQuery));

/** 本分组内：当前 draft 落在哪张卡（只查一次） */
const activeMainId = computed(() => {
  const id = editorStore.draftChord.id;
  if (!id) return null;
  for (const card of groupedCards.value) {
    if (card.variants.some(v => v.id === id)) return card.mainChord.id;
  }
  return null;
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
