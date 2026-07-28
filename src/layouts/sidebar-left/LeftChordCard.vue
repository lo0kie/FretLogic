<template>
  <GlobalTooltip placement="top">
    <GlobalContextMenu ref="contextMenuRef" :items="menuItems">
      <div class="chord-card-frame" :title="chord.chordName">
        <div
          class="chord-thumb-card"
          :class="{
            'is-editing': isEditing,
            'is-context-open': isMenuOpen,
          }"
          tabindex="0"
          @click="$emit('click')"
          @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
        >
          <BaseMarquee class="chord-marquee-wrapper">
            <span class="chord-name-text">
              {{ chord.chordName }}
            </span>
          </BaseMarquee>
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
import { computed, ref } from 'vue';

import BaseMarquee from '@/components/BaseMarquee.vue';
import Fretboard from '@/components/Fretboard.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';

import { useSettingsStore } from '@/stores/settingsStore';
import { Move, Trash2 } from '@lucide/vue';

const props = defineProps<{ chord: Chord; isEditing: boolean }>();
const emit = defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
  (e: 'click'): void;
}>();

const uiStore = useUiStore();
const settingsStore = useSettingsStore();
const contextMenuRef = ref<InstanceType<typeof GlobalContextMenu> | null>(null);

const isMenuOpen = computed(() => contextMenuRef.value?.isOpen ?? false);
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

<style scoped lang="less">
@import '@/assets/tokens.module';

.chord-card-frame {
  box-sizing: border-box;
}

.chord-thumb-card {
  height: 2rem;
  padding-left: 0.6rem;
  padding-right: 0.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  outline: none;
  position: relative;
  box-sizing: border-box;
  cursor: pointer;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  transition: @transition-fast;

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
  }

  &.is-context-open {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
    box-shadow: 0 0 0 1px var(--border-base);
  }

  &.is-editing {
    background-color: color-mix(in srgb, @primary, transparent 90%);
    border-color: @primary !important;
    box-shadow: 0 0 0 1px @primary !important;

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
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
  pointer-events: none;
  color: var(--text-body);
}
</style>
