<template>
  <BaseFloatingBar :visible="!isPristine" :bottom="barBottomPosition" #="{ divider }">
    <ActionButton size="md" variant="ghost" :disabled="isPristine" @click="editorStore.resetEditor">
      {{ editorStore.isEditing ? '放弃修改' : '重置指板' }}
    </ActionButton>

    <template v-if="isGlobalEditable">
      <template v-if="editorStore.isEditing">
        <component :is="divider" />
        <ActionButton size="md" variant="ghost" @click="chordActions.saveAsNewChord"> 作为新和弦保存 </ActionButton>
      </template>

      <component :is="divider" />

      <ActionButton
        size="md"
        variant="subtle"
        color="primary"
        :disabled="isSaveDisabled"
        @click="chordActions.persistCurrentChord"
      >
        {{ editorStore.isEditing ? '更新保存' : '确认保存' }}
      </ActionButton>
    </template>
  </BaseFloatingBar>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseFloatingBar from '@/components/base/BaseFloatingBar.vue';
import { useChordActions } from '@/composables/fretboard/useChordActions';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { isGlobalEditable } from '@/stores/globalState';
import { getChordName } from '@/utils/music/musicTheory';
import { computed } from 'vue';

const editorStore = useChordEditorStore();
const chordActions = useChordActions();

const barBottomPosition = computed(() => (editorStore.draftChord.fretCount === 3 ? '5rem' : '3.5rem'));
const isPristine = computed(() => {
  const cleanName = getChordName(editorStore.draftChord).trim();
  return (
    !editorStore.isEditing &&
    cleanName === '' &&
    editorStore.isFretBoardEmpty &&
    editorStore.draftChord.capo === 0 &&
    editorStore.draftChord.fretCount === 3 &&
    editorStore.draftChord.tuning === 'STANDARD'
  );
});

const isSaveDisabled = computed(() => {
  const cleanName = getChordName(editorStore.draftChord).trim();
  return !cleanName || editorStore.isFretBoardEmpty;
});
</script>
