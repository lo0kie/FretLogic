<template>
  <Transition name="floating-bar-fade">
    <div v-if="!isPristine" class="floating-action-bar" :style="{ bottom: barBottomPosition }">
      <ActionButton size="md" variant="ghost" :disabled="isPristine" @click="editorStore.resetEditor">
        {{ editorStore.isEditing ? '放弃修改' : '重置指板' }}
      </ActionButton>

      <template v-if="isGlobalEditable">
        <template v-if="editorStore.isEditing">
          <div class="bar-divider" />

          <ActionButton size="md" variant="ghost" @click="chordActions.saveAsNewChord"> 作为新和弦保存 </ActionButton>
        </template>

        <div class="bar-divider" />

        <ActionButton
          size="md"
          variant="subtle"
          primary
          :disabled="isSaveDisabled"
          @click="chordActions.persistCurrentChord"
        >
          {{ editorStore.isEditing ? '更新保存' : '确认保存' }}
        </ActionButton>
      </template>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/stores/chordEditorStore';
import { isGlobalEditable } from '@/stores/globalState';
import ActionButton from '@/ui/components/ActionButton.vue';
import { useChordActions } from '@/ui/composables/useChordActions';
import { computed } from 'vue';

const editorStore = useEditorStore();
const chordActions = useChordActions();

const barBottomPosition = computed(() => {
  return editorStore.draftChord.fretCount === 3 ? '4rem' : '2.2rem';
});

const isPristine = computed(() => {
  const cleanName = editorStore.draftChord.chordName.trim();
  return (
    !editorStore.isEditing &&
    cleanName === '' &&
    editorStore.isFretBoardEmpty &&
    editorStore.draftChord.capo === 0 &&
    editorStore.draftChord.fretCount === 3 &&
    editorStore.draftChord.tuning === 'STANDARD'
  );
});

// 4. 保存按钮禁用条件
const isSaveDisabled = computed(() => {
  const cleanName = editorStore.draftChord.chordName.trim();
  return !cleanName || editorStore.isFretBoardEmpty;
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.floating-action-bar {
  display: flex;
  align-items: center;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-fab);
  pointer-events: auto;
  gap: @space-sm;
  padding: calc(@space-xs + 2px) @space-sm;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-xl);
  -webkit-backdrop-filter: var(--blur-xl);
  border: 1px solid var(--glass-border);
  border-radius: @radius-pill;
  box-shadow: @shadow-floating;
  box-sizing: border-box;

  transition:
    bottom var(--duration-slow) var(--bezier-out),
    background-color 0.28s ease,
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.floating-action-bar:hover {
  box-shadow: var(--focus-ring);
}

.bar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--border-base);
  opacity: 0.6;
}

.fade-scale-transition(floating-bar-fade, ~'-50%, 20px', 0.95, ~'-50%, 0');
</style>
