<template>
  <div class="chord-card-frame">
    <div
      class="chord-thumb-card group h-11 pl-3 pr-2 flex items-center justify-between outline-none focus:ring-2 focus:ring-[var(--color-primary)] box-border"
      :class="{ 'is-editing': isEditing }"
      tabindex="0"
      @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
      @contextmenu.prevent.stop="$emit('move', chord)"
    >
      <span
        class="chord-name-text text-xs font-black tracking-tight truncate pr-2 block leading-tight pointer-events-none"
      >
        {{ chord.chordName }}
      </span>

      <div
        class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
        :class="{ 'opacity-100': isEditing }"
      >
        <button
          @click.stop="$emit('delete', chord)"
          class="text-[10px] action-button text-[var(--text-disabled)] hover:text-white w-4 h-4 rounded-full font-black flex items-center justify-center bg-[var(--bg-main)] hover:bg-[var(--color-danger)]"
        >
          <Trash2 class="w-2 h-2" stroke-width="2.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Chord } from '@/types/types';
import { Trash2 } from '@lucide/vue';

defineProps<{ chord: Chord; isEditing: boolean }>();
defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.chord-thumb-card {
  .mixin-interactive-card();
  background-color: var(--bg-body);
  border: @border-solid-light;

  .chord-name-text,
  .action-button {
    transition: @transition-fast;
  }

  &.is-editing {
    background-color: color-mix(in srgb, @primary, transparent 90%);
    border-color: @primary !important;
    box-shadow:
      inset 0 0 0 1px @primary,
      @shadow-sm;

    .chord-name-text {
      color: @primary !important;
    }
  }
}
</style>
