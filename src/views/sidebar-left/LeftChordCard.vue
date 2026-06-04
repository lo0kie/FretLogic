<template>
  <div class="chord-card-frame relative">
    <div
      class="chord-thumb-card group h-10 px-2 flex items-center justify-between outline-none focus:ring-2 focus:ring-[var(--color-primary)] box-border"
      :class="{ 'is-editing': isEditing }"
      tabindex="0"
      @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
      @contextmenu.prevent.stop="$emit('move', chord)"
    >
      <span class="chord-name-text text-xs font-black tracking-tight truncate leading-tight pointer-events-none">
        {{ chord.chordName }}
      </span>

      <div
        class="absolute top-1 right-1 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
        :class="{ 'opacity-100': isEditing }"
      >
        <button
          @click.stop="$emit('delete', chord)"
          class="action-button text-[var(--text-disabled)] hover:text-white w-4 h-4 rounded-full flex items-center justify-center bg-[var(--bg-main)] hover:bg-[var(--color-danger)]"
        >
          <X :size="14" stroke-width="3" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type Chord } from '@/types';
import { X } from '@lucide/vue';

defineProps<{ chord: Chord; isEditing: boolean }>();
defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

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
