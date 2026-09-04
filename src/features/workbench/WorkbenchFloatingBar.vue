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

<script lang="ts" setup>
import { computed } from 'vue';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseFloatingBar from '@/components/ui/BaseFloatingBar.vue';
import { getChordName } from '@/services/music/theory';
import { useChordActions } from '@/shared/composables/useChordActions';
import { useChordEditorStore } from '@/stores/chordEditorStore';

const editorStore = useChordEditorStore();
const chordActions = useChordActions();

const barBottomPosition = computed(() => (editorStore.draftChord.fretCount === 3 ? '5rem' : '3.5rem'));
const isPristine = computed(() => {
  const cleanName = getChordName(editorStore.draftChord).trim();
  return (
    !editorStore.isEditing &&
    cleanName === '' &&
    editorStore.isFretBoardEmpty &&
    editorStore.draftChord.fretOffset === 0 &&
    editorStore.draftChord.fretCount === 3 &&
    editorStore.draftChord.tuning === 'STANDARD'
  );
});

const isSaveDisabled = computed(() => {
  const cleanName = getChordName(editorStore.draftChord).trim();
  return !cleanName || editorStore.isFretBoardEmpty;
});
</script>
