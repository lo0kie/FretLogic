<template>
  <Transition name="floating-bar-fade">
    <div v-if="isFloatingBarVisible" class="floating-action-bar" :style="{ bottom: barBottomPosition }">
      <ActionButton size="md" variant="ghost" :disabled="isClearDisabled" @click="editorStore.resetEditor()">
        {{ editorStore.editingId ? '放弃修改' : '重置指板' }}
      </ActionButton>

      <div class="bar-divider"></div>

      <ActionButton size="md" variant="subtle" :disabled="isSaveDisabled" @click="chordActions.persistCurrentChord()">
        {{ editorStore.editingId ? '更新保存' : '确认保存' }}
      </ActionButton>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordActions } from '@/services/useChordActions';
import { useEditorStore } from '@/stores/chordEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { computed } from 'vue';

const editorStore = useEditorStore();
const uiStore = useUiStore();
const chordActions = useChordActions();

const barBottomPosition = computed(() => {
  if (uiStore.isMobile) return 'calc(1.8rem + env(safe-area-inset-bottom, 0px))';
  else return editorStore.fretCount === 3 ? '3.3rem' : '1.8rem';
});

const isFloatingBarVisible = computed(() => {
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return (
    cleanName !== '' ||
    !editorStore.isFretBoardEmpty ||
    editorStore.capo > 0 ||
    editorStore.fretCount > 3 ||
    editorStore.editingId !== null
  );
});

const isSaveDisabled = computed(() => {
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return !cleanName || editorStore.isFretBoardEmpty;
});

const isClearDisabled = computed(() => {
  if (editorStore.editingId) return false;
  const cleanName = editorStore.currentChordName ? editorStore.currentChordName.trim() : '';
  return (
    cleanName === '' &&
    editorStore.isFretBoardEmpty &&
    editorStore.capo === 0 &&
    editorStore.fretCount === 3 &&
    editorStore.currentTuning === 'STANDARD'
  );
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
  z-index: 90;
  pointer-events: auto;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  box-shadow: @shadow-floating;
  box-sizing: border-box;

  transition:
    bottom 0.35s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.28s ease,
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.bar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--border-base);
  opacity: 0.6;
}

.fade-scale-transition(floating-bar-fade, ~'-50%, 20px', 0.95, ~'-50%, 0');
</style>
