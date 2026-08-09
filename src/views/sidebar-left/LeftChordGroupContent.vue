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
          :key="cardData.mainChord.chordName"
          :card-data="cardData"
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
import { groupChordsByName, sortChordsByRule } from '@/utils/musicTheory';
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

const filteredChords = computed(() => {
  const original = chordStore.groupChordMap.get(props.group.id) || [];
  const query = props.searchQuery.toLowerCase().trim();
  if (!query) return original;
  return original.filter(c => c.chordName.toLowerCase().includes(query));
});

const groupedCards = computed(() => {
  const sorted = sortChordsByRule(filteredChords.value, props.group.sortRule, props.group.sortKey);
  return groupChordsByName(sorted);
});

// 绑定容器 ref，自动按 3 列进行上下左右键盘寻路
// selector 限定只收集本组的和弦卡片，避免与外层分组标题行的导航互相干扰
// stop: true 阻止事件冒泡到外层 VueDraggable 容器，防止被外层 handleKeydown 二次处理
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
