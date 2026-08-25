<template>
  <div class="chord-content-outer" :class="{ 'is-open': isOpen }" :aria-hidden="!isOpen" :inert="!isOpen">
    <div class="chord-content-inner" @contextmenu.stop>
      <TransitionGroup
        v-if="groupedCards.length > 0"
        ref="gridContainerRef"
        name="left-chord-card"
        tag="div"
        class="chords-grid-layout"
        @keydown="handleKeydown"
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
          @open-references="cardData => emit('open-references', cardData)"
        />
      </TransitionGroup>
      <EmptyState v-else-if="chordsCount === 0" size="sm" description="暂无和弦" />
      <EmptyState v-else-if="searchQuery" size="sm" description="无匹配" />
    </div>
  </div>
</template>

<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, Group, GroupedChordCard } from '@/types';
import { getChordName } from '@/utils/musicTheory';
import { computed, useTemplateRef } from 'vue';
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
const gridContainerRef = useTemplateRef<HTMLElement>('gridContainerRef');

const chordsCount = computed(() => chordStore.groupChordMap.get(props.group.id)?.length ?? 0);
const groupedCards = computed(() => chordStore.getGroupedCards(props.group.id, props.searchQuery));

const activeMainId = computed(() => {
  const draft = editorStore.draftChord;
  if (draft.id) {
    for (const card of groupedCards.value) {
      if (card.variants.some(v => v.id === draft.id)) return card.mainChord.id;
    }
  }
  // 仅在编辑已有和弦时按名称匹配，新建模式（isCreating）下不匹配任何已有卡片
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

const { handleKeydown } = useGridNavigation(gridCols, gridContainerRef, {
  selector: '.chord-thumb-card',
  stop: true,
});
</script>

<style scoped lang="scss">
.chord-content-outer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows $duration-base $bezier-standard;
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
  transition: padding-top $duration-base $bezier-standard;
}

.chords-grid-layout {
  display: grid;
  grid-template-columns: repeat(v-bind('gridCols'), minmax(0, 1fr));
  gap: $space-sm;
  padding: $space-md $space-sm $space-xs $space-sm;
  align-items: center;
  position: relative;
  z-index: var(--z-panel);
  min-height: 2.2rem;
  box-sizing: border-box;
}

.empty-status-box {
  position: relative;
  z-index: 2;
}

// 左侧卡片 FLIP 重排 GPU 加速动画
.left-chord-card-move {
  transition: transform 0.28s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform;
}

.left-chord-card-enter-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.25, 1, 0.5, 1);
}

.left-chord-card-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
  position: absolute;
  width: calc((100% - 2 * $space-sm) / 3);
  pointer-events: none;
  z-index: 0 !important;
}

.left-chord-card-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.left-chord-card-leave-to {
  opacity: 0;
  transform: scale(0.92);
}
</style>
