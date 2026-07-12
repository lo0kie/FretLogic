<template>
  <GlobalTooltip placement="top">
    <GlobalContextMenu :items="menuItems">
      <div class="chord-card-frame" :title="chord.chordName">
        <div
          class="chord-thumb-card group"
          :class="{ 'is-editing': isEditing }"
          tabindex="0"
          @click="$emit('click')"
          @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
        >
          <BaseMarquee class="chord-marquee-wrapper">
            <span class="chord-name-text">
              {{ chord.chordName }}
            </span>
          </BaseMarquee>

          <div class="delete-button-container" :class="{ 'is-visible': isEditing }">
            <button
              @click.stop="$emit('delete', chord)"
              @mousedown.stop
              @touchstart.stop
              @pointerdown.stop
              class="action-button"
            >
              <X :size="14" stroke-width="3" />
            </button>
          </div>
        </div>
      </div>
    </GlobalContextMenu>

    <template #content v-if="uiStore.isPreviewEnabled">
      <Fretboard
        :is-dark-mode="settingsStore.isDarkMode"
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
import { useUiStore } from '@/stores/uiStore';
import type { Chord } from '@/types';
import { computed } from 'vue';

import BaseMarquee from '@/components/BaseMarquee.vue';
import Fretboard from '@/components/Fretboard.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';

import { useSettingsStore } from '@/stores/settingsStore';
import { Move, Trash2, X } from '@lucide/vue';

const props = defineProps<{ chord: Chord; isEditing: boolean }>();
const emit = defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
  (e: 'click'): void;
}>();

const uiStore = useUiStore();
const settingsStore = useSettingsStore();

const menuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '移动',
    icon: Move,
    action: () => emit('move', props.chord),
  },
  {
    label: '删除',
    icon: Trash2,
    danger: true,
    action: () => emit('delete', props.chord),
  },
]);
</script>

<script lang="ts">
export default { name: 'LeftChordCard' };
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.chord-card-frame {
  box-sizing: border-box;
}

.chord-thumb-card {
  height: 2rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  outline: none;
  position: relative;
  box-sizing: border-box;
  cursor: pointer;
  background-color: var(--bg-body);
  border: @border-solid-light;
  border-radius: @radius-md;
  transition: @transition-fast;

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-light);
  }

  &:focus {
    box-shadow: 0 0 0 2px var(--color-primary);
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

.chord-marquee-wrapper {
  flex: 1;
  min-width: 0;
}

.chord-name-text {
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: -0.025em;
  line-height: 1;
  pointer-events: none;
  color: var(--text-body);
}

.delete-button-container {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  opacity: 0;
  transform: translate(40%, -40%);
  transition: opacity 0.2s ease;
  box-sizing: border-box;

  .group:hover &,
  &:focus-within,
  &.is-visible {
    opacity: 1;
  }
}

.action-button {
  color: var(--text-disabled);
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: @border-solid-light;
  background-color: var(--bg-main);
  padding: 0;
  cursor: pointer;
  box-sizing: border-box;
  transition: @transition-fast;

  &:hover {
    color: #ffffff;
    background-color: var(--color-danger);
  }

  &:active {
    transform: scale(0.9);
  }
}
</style>
