<template>
  <div class="chord-content-outer" :class="{ 'is-open': isOpen }" :aria-hidden="!isOpen" :inert="!isOpen">
    <div class="chord-content-inner" @contextmenu.stop>
      <div
        v-if="groupedCards.length > 0"
        ref="gridContainerRef"
        v-auto-animate
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
      </div>
      <EmptyState v-else-if="chordsCount === 0" size="sm" description="暂无和弦" />
      <EmptyState v-else-if="searchQuery" size="sm" description="无匹配" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import type { Chord, Group, GroupedChordCard } from '@/types';
import EmptyState from '@/ui/components/EmptyState.vue';
import { useGridNavigation } from '@/ui/composables/useGridNavigation';
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
  (e: 'open-references', cardData: GroupedChordCard): void;
}>();

const chordStore = useChordStore();
const editorStore = useEditorStore();
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
    const draftName = draft.chordName.trim().toLowerCase();
    if (draftName) {
      for (const card of groupedCards.value) {
        if (card.mainChord.groupId === draft.groupId && card.mainChord.chordName.trim().toLowerCase() === draftName) {
          return card.mainChord.id;
        }
      }
    }
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
  gap: @space-sm;
  padding: @space-md @space-sm @space-xs @space-sm;
  align-items: center;
  position: relative;
  z-index: var(--z-panel);
  min-height: 2.2rem;
  box-sizing: border-box;
}
</style>
