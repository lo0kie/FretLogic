<template>
  <GlobalTooltip placement="top">
    <div class="chord-card-frame" :title="chord.chordName">
      <div
        class="chord-thumb-card group h-8 px-2 flex items-center justify-between outline-none focus:ring-2 focus:ring-[var(--color-primary)] box-border relative"
        :class="{ 'is-editing': isEditing }"
        tabindex="0"
        @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
        @contextmenu.prevent.stop="$emit('move', chord)"
      >
        <BaseMarquee class="flex-1 min-w-0">
          <span class="chord-name-text text-xs font-black tracking-tight leading-none pointer-events-none">
            {{ chord.chordName }}
          </span>
        </BaseMarquee>

        <div
          class="delete-button absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
          :class="{ 'opacity-100': isEditing }"
        >
          <button
            @click.stop="$emit('delete', chord)"
            @mousedown.stop
            @touchstart.stop
            @pointerdown.stop
            class="action-button text-[var(--text-disabled)] hover:text-white w-4 h-4 rounded-full flex items-center justify-center bg-[var(--bg-main)] hover:bg-[var(--color-danger)]"
          >
            <X :size="14" stroke-width="3" />
          </button>
        </div>
      </div>
    </div>

    <template #content v-if="uiStore.isPreviewEnabled">
      <Fretboard
        is-dark-mode
        :interactive="false"
        :scale="0.5"
        :strings="chord.strings"
        :capo="chord.capo"
        :fretCount="chord.fretCount"
      />
    </template>
  </GlobalTooltip>
</template>

<script setup lang="ts">
import BaseMarquee from '@/components/BaseMarquee.vue';
import Fretboard from '@/components/Fretboard.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useUiStore } from '@/stores/uiStore';
import { type Chord } from '@/types';
import { X } from '@lucide/vue';

defineProps<{ chord: Chord; isEditing: boolean }>();
defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
}>();

const uiStore = useUiStore();
</script>

<script lang="ts">
export default { name: 'LeftChordCard' };
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.chord-thumb-card {
  .mixin-interactive-card();
  background-color: var(--bg-body);
  border: @border-solid-light;

  .chord-name-text {
    color: var(--text-body);
  }

  .chord-name-text,
  .action-button {
    transition: @transition-fast;

    &:active {
      transform: scale(0.9);
    }
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

  .delete-button {
    transform: translate(40%, -40%);

    .action-button {
      border: @border-solid-light;
    }
  }
}
</style>
