<template>
  <div
    class="chord-thumb-card h-11 px-3 flex items-center justify-between active:cursor-grabbing"
    :class="{ 'is-editing': isEditing }"
  >
    <span class="chord-name-text text-xs font-black tracking-tight truncate pr-4 block leading-tight">
      {{ chord.chordName }}
    </span>
    <button
      @click.stop="$emit('delete', chord)"
      class="text-[12px] delete-button w-5 h-5 rounded-full font-bold flex items-center justify-center"
      style="color: var(--color-danger)"
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
    opacity: 0.4;
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
