<template>
  <div class="popover-wrapper" ref="popoverContainerRef">
    <GlobalTooltip content="指板配置 (品数 / Capo / 调音)" placement="bottom">
      <ActionButton icon-only variant="ghost" :active="isConfigOpen" @click="isConfigOpen = !isConfigOpen">
        <SlidersHorizontal :size="18" stroke-width="2.2" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div v-if="isConfigOpen" class="config-popover-card" ref="cardRef">
        <div class="config-row">
          <label class="config-label">显示品数</label>
          <div class="fret-segmented-picker">
            <button
              v-for="f in FRET_COUNTS"
              :key="f"
              @click="editorStore.fretCount = f"
              class="fret-picker-item"
              :class="{ 'is-selected': editorStore.fretCount === f }"
            >
              {{ f }}品
            </button>
          </div>
        </div>

        <div class="config-row">
          <label class="config-label">变调夹 (Capo)</label>
          <div class="capo-quick-picker" @wheel="handleCapoWheel">
            <button
              @click="editorStore.capo = Math.max(0, editorStore.capo - 1)"
              class="capo-step-btn"
              :disabled="editorStore.capo === 0"
            >
              -
            </button>
            <span class="capo-readout-text">
              {{ editorStore.capo === 0 ? 'CAPO 0' : `CAPO ${editorStore.capo}` }}
            </span>
            <button
              @click="editorStore.capo = Math.min(12, editorStore.capo + 1)"
              class="capo-step-btn"
              :disabled="editorStore.capo === 12"
            >
              +
            </button>
          </div>
        </div>

        <div class="config-row">
          <label class="config-label">调音方案</label>
          <div class="tuning-select-wrapper">
            <BaseSelector
              v-model="editorStore.currentTuning"
              :options="tuningOptions"
              :default-value="TuningEnum.STANDARD"
            >
              <template #label="{ selected }">
                {{ TUNING_PRESETS[selected]?.name || TuningEnum.STANDARD }}
              </template>

              <template #option="{ option }">
                <span class="option-text-truncate">{{ TUNING_PRESETS[option]?.name }}</span>
              </template>
            </BaseSelector>
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
import { useEditorStore } from '@/stores/editorStore';
import { FRET_COUNTS } from '@/utils/constants';
import { TUNING_PRESETS, TuningEnum } from '@/utils/musicTheory';
import { SlidersHorizontal } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core';
import { ref } from 'vue';

const editorStore = useEditorStore();
const tuningOptions = Object.values(TuningEnum);

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
  e.preventDefault();
  if (e.deltaY < 0) {
    editorStore.capo = Math.max(0, editorStore.capo - 1);
  } else {
    editorStore.capo = Math.min(12, editorStore.capo + 1);
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
  width: 15rem;
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

.fret-segmented-picker {
  display: flex;
  align-items: center;
  padding: 0.12rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: 9999px;
  gap: 0.1rem;
}

.fret-picker-item {
  height: 1.35rem;
  padding: 0 0.5rem;
  font-size: 0.68rem;
  font-weight: 600;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: var(--text-disabled);
  cursor: pointer;

  &.is-selected {
    background-color: var(--bg-panel);
    color: var(--color-primary);
    font-weight: 700;
    box-shadow: @shadow-sm;
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

.tuning-select-wrapper {
  min-width: 8rem;
  flex: 1;

  :deep(.selector-trigger-bar) {
    height: 1.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}

.option-text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (max-width: 768px) {
  .config-popover-card {
    position: fixed;
    top: 3.6rem;
    left: 4rem;
    right: 1rem;
    width: auto;
    max-width: none;
    padding: 1rem 1.15rem;
    gap: 1rem;
    border-radius: calc(@radius-lg * 1.3);
  }

  .config-row {
    gap: 1rem;
  }

  .config-label {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .fret-segmented-picker {
    padding: 0.2rem;
  }

  .fret-picker-item {
    height: 1.8rem;
    padding: 0 0.75rem;
    font-size: 0.78rem;
  }

  .capo-quick-picker {
    height: 2rem;
    padding: 0 0.3rem;
  }

  .capo-step-btn {
    width: 1.6rem;
    height: 1.6rem;
    font-size: 0.95rem;
  }

  .capo-readout-text {
    font-size: 0.78rem;
    min-width: 4.5rem;
  }

  .tuning-select-wrapper {
    :deep(.selector-trigger-bar) {
      height: 2rem;
      padding-left: 0.7rem;
      padding-right: 0.7rem;
      font-size: 0.78rem;
    }
  }
}
</style>
