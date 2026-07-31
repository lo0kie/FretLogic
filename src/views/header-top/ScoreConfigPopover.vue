<template>
  <div class="popover-wrapper" ref="popoverContainerRef">
    <GlobalTooltip content="曲谱配置 (调性 / Capo / 模式)" placement="bottom">
      <ActionButton icon-only variant="ghost" :active="isConfigOpen" @click="isConfigOpen = !isConfigOpen">
        <SlidersHorizontal :size="18" stroke-width="2.2" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div v-if="isConfigOpen" class="config-popover-card" ref="cardRef">
        <div class="config-row">
          <label class="config-label">调性 (Key)</label>
          <div class="key-select-wrapper">
            <BaseSelector v-model="songStore.activeSong!.key" :options="KEY_OPTIONS" default-value="C" />
          </div>
        </div>

        <div class="config-row">
          <label class="config-label">变调夹 (Capo)</label>
          <div class="capo-quick-picker" @wheel="handleCapoWheel">
            <button
              @click="songStore.activeSong!.capo = Math.max(0, (songStore.activeSong!.capo || 0) - 1)"
              class="capo-step-btn"
              :disabled="(songStore.activeSong!.capo || 0) <= 0"
            >
              -
            </button>
            <span class="capo-readout-text">
              {{ (songStore.activeSong!.capo || 0) === 0 ? 'CAPO 0' : `CAPO ${songStore.activeSong!.capo}` }}
            </span>
            <button
              @click="songStore.activeSong!.capo = Math.min(12, (songStore.activeSong!.capo || 0) + 1)"
              class="capo-step-btn"
              :disabled="(songStore.activeSong!.capo || 0) >= 12"
            >
              +
            </button>
          </div>
        </div>

        <div class="config-row">
          <label class="config-label">编辑模式</label>
          <div class="mode-switcher">
            <ActionButton
              size="sm"
              :variant="uiStore.scoreActiveTab === 'edit' ? 'subtle' : 'ghost'"
              @click="uiStore.scoreActiveTab = 'edit'"
            >
              编辑歌词
            </ActionButton>
            <ActionButton
              size="sm"
              :variant="uiStore.scoreActiveTab === 'interactive' ? 'subtle' : 'ghost'"
              @click="uiStore.scoreActiveTab = 'interactive'"
            >
              排列和弦
            </ActionButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import { SlidersHorizontal } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core';
import { ref } from 'vue';

const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const songStore = useSongStore();
const uiStore = useUiStore();

const isConfigOpen = ref(false);
const popoverContainerRef = ref<HTMLDivElement | null>(null);
const cardRef = ref<HTMLDivElement | null>(null);

onClickOutside(
  popoverContainerRef,
  () => {
    isConfigOpen.value = false;
  },
  { ignore: [cardRef] }
);

const handleCapoWheel = (e: WheelEvent) => {
  if (!songStore.activeSong) return;
  e.preventDefault();
  const current = songStore.activeSong.capo || 0;
  if (e.deltaY < 0) {
    songStore.activeSong.capo = Math.max(0, current - 1);
  } else {
    songStore.activeSong.capo = Math.min(12, current + 1);
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.popover-wrapper {
  position: relative;
  z-index: 1001;
}

.config-popover-card {
  position: absolute;
  top: calc(100% + 1rem);
  right: 0;
  width: 15.5rem;
  padding: 0.8rem 1rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  z-index: 1100;
  box-sizing: border-box;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.config-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-disabled);
}

.key-select-wrapper {
  min-width: 6.5rem;

  :deep(.selector-trigger-bar) {
    height: 1.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}

.capo-quick-picker {
  display: flex;
  align-items: center;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  height: 1.5rem;
  padding: 0 0.2rem;
  gap: 0.2rem;
}

.capo-step-btn {
  border: none;
  background: transparent;
  width: 1.1rem;
  height: 1.1rem;
  font-weight: 800;
  font-size: 0.75rem;
  color: var(--text-title);
  cursor: pointer;
  border-radius: @radius-sm;

  &:hover:not(:disabled) {
    background-color: var(--bg-panel-hover);
  }

  &:disabled {
    opacity: 0.3;
  }
}

.capo-readout-text {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-primary);
  min-width: 3.5rem;
  text-align: center;
}

.mode-switcher {
  display: flex;
  gap: 0.15rem;
  background-color: var(--bg-body);
  padding: 0.1rem;
  border-radius: 9999px;
  border: 1px solid var(--border-light);
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition:
    opacity @duration-fast @bezier-standard,
    transform @duration-fast @bezier-standard;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
</style>
