<template>
  <!-- 折叠动画由外层 BaseCollapse 的折叠体承担，本组件退化为纯内容：卡片网格 + 空状态 -->
  <div @contextmenu.stop>
    <TransitionGroup
      v-grid-nav.stop="{ cols: gridCols, selector: '.chord-thumb-card' }"
      v-if="groupedCards.length > 0"
      class="relative z-panel grid min-h-[2.2rem] grid-cols-3 items-center gap-sm px-sm pt-md pb-xs"
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
        @delete="emit('delete-chord', $event)"
        @delete-variants="emit('open-delete-variants', $event)"
        @move="emit('open-move', $event)"
        @open-references="emit('open-references', $event)"
        @select="emit('select-chord', $event)"
      />
    </TransitionGroup>
    <Feedback v-else description="暂无和弦" size="sm" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import LeftChordCard from '@/domains/chord/library/components/ChordCard.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';

const props = defineProps<{
  group: Group;
}>();

const emit = defineEmits<{
  (e: 'open-move', chord: Chord): void;
  (e: 'open-delete-variants', cardData: GroupedChordCard): void;
  (e: 'delete-chord', chord: Chord): void;
  (e: 'select-chord', chord: Chord): void;
  (e: 'open-references', cardData: GroupedChordCard): void;
}>();

const gridCols = 3;

const chordStore = useChordStore();
const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();

const groupedCards = computed(() => chordStore.getGroupedCards(props.group.id));

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
