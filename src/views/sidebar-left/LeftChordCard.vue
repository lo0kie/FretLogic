<template>
  <div
    class="chord-thumb-card h-11 px-3 flex items-center justify-between outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
    :class="{ 'is-editing': isEditing }"
    tabindex="0"
    @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
  >
    <span class="chord-name-text text-xs font-black tracking-tight truncate pr-4 block leading-tight">
      {{ chord.chordName }}
    </span>
    <button
      @click.stop="$emit('delete', chord)"
      aria-label="删除该和弦"
      class="text-[10px] delete-button text-[var(--text-disabled)] hover:text-white w-4 h-4 rounded-full font-black flex items-center justify-center"
    >
      ✕
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Chord } from '@/stores/chordLabStore';

defineProps<{
  chord: Chord;
  isEditing: boolean;
}>();

defineEmits<{
  (e: 'delete', chord: Chord): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.chord-thumb-card {
  .mixin-interactive-card();
  background-color: var(--bg-body);
  border: @border-solid-light;

  .chord-name-text {
    color: var(--text-body);
    transition: @transition-fast;
  }
  .delete-button {
    transition: @transition-fast;
    &:hover {
      background-color: @danger;
      color: white !important;
      opacity: 1;
    }
  }

  &.is-editing {
    background-color: color-mix(in srgb, @primary, transparent 90%);
    border-color: @primary !important;
    box-shadow: @shadow-sm;
    .chord-name-text {
      color: @primary !important;
    }
  }
}
</style>
