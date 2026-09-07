<template>
  <BaseFloatingBar #="{ divider }" :bottom="barBottomPosition" :visible="!isPristine">
    <ActionButton
      :disabled="isPristine"
      :label="editorStore.isEditing ? '放弃修改' : '重置指板'"
      @click="editorStore.resetEditor"
      variant="ghost"
    />

    <template v-if="editorStore.isEditing">
      <component :is="divider" />
      <ActionButton @click="chordActions.saveAsNewChord" label="作为新和弦保存" variant="ghost" />
    </template>

    <component :is="divider" />

    <ActionButton
      :disabled="isSaveDisabled"
      :label="editorStore.isEditing ? '更新保存' : '确认保存'"
      @click="chordActions.persistCurrentChord"
      color="primary"
      variant="subtle"
    />
  </BaseFloatingBar>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseFloatingBar from '@/platform/ui/floating-bar/BaseFloatingBar.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName, Tuning } from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT, getFloatingBarBottom } from '@/domains/fretboard/constants';

const editorStore = useChordEditorStore();
const chordActions = useChordActions();

const barBottomPosition = computed(() => getFloatingBarBottom(editorStore.draftChord.fretCount));
const isPristine = computed(() => {
  const cleanName = getChordName(editorStore.draftChord).trim();
  return (
    !editorStore.isEditing &&
    cleanName === '' &&
    editorStore.isFretBoardEmpty &&
    editorStore.draftChord.fretOffset === 0 &&
    editorStore.draftChord.fretCount === DEFAULT_FRET_COUNT &&
    editorStore.draftChord.tuning === Tuning.STANDARD
  );
});

const isSaveDisabled = computed(() => {
  const cleanName = getChordName(editorStore.draftChord).trim();
  return !cleanName || editorStore.isFretBoardEmpty;
});
</script>
