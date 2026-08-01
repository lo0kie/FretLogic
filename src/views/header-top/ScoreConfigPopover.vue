<template>
  <div class="popover-wrapper" ref="popoverContainerRef">
    <GlobalTooltip content="曲谱配置 (调性 / Capo / 模式)" placement="bottom">
      <ActionButton icon-only variant="ghost" :active="isConfigOpen" @click="isConfigOpen = !isConfigOpen">
        <SlidersHorizontal :size="18" stroke-width="2.2" />
      </ActionButton>
    </GlobalTooltip>

    <Transition name="dropdown-fade">
      <div v-if="isConfigOpen && scoreEditor.activeSong" class="config-popover-card" ref="cardRef">
        <!-- 1. 调性 (Key) 选择 -->
        <div class="config-row">
          <label class="config-label">调性 (Key)</label>
          <div class="key-select-wrapper">
            <BaseSelector
              :model-value="scoreEditor.activeSong.key || 'C'"
              :options="KEY_OPTIONS"
              default-value="C"
              @update:model-value="val => scoreEditor.updateKey(val)"
            />
          </div>
        </div>

        <!-- 2. 变调夹 (Capo) -->
        <div class="config-row">
          <label class="config-label">变调夹 (Capo)</label>
          <BaseNumberInput
            :model-value="scoreEditor.activeSong.capo || 0"
            :min="0"
            :max="12"
            :formatter="val => (val === 0 ? 'CAPO 0' : `CAPO ${val}`)"
            @update:model-value="val => scoreEditor.updateCapo(val)"
          />
        </div>

        <!-- 3. 编辑模式 -->
        <div class="config-row">
          <label class="config-label">编辑模式</label>
          <BaseSegmentedControl v-model="scoreEditor.activeTab" :options="scoreModeOptions" @change="handleTabChange" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { SlidersHorizontal } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core';
import { computed, ref } from 'vue';

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

// 🌟 使用 computed 响应式传入 item.disabled 属性
const scoreModeOptions = computed<SegmentOption<'edit' | 'interactive'>[]>(() => [
  { label: '编辑歌词', value: 'edit' },
  {
    label: '排列和弦',
    value: 'interactive',
    disabled: !scoreEditor.hasLyrics, // 无歌词时直接禁用选项
  },
]);

const KEY_OPTIONS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const isConfigOpen = ref(false);
const popoverContainerRef = ref<HTMLDivElement | null>(null);
const cardRef = ref<HTMLDivElement | null>(null);

const handleTabChange = (val: 'edit' | 'interactive') => {
  if (val === 'interactive' && !scoreEditor.hasLyrics) {
    uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
  }
};

onClickOutside(
  popoverContainerRef,
  () => {
    isConfigOpen.value = false;
  },
  { ignore: [cardRef, '.floating-position-wrapper'] }
);
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

.fade-scale-transition(dropdown-fade, -6px, 0.96);
</style>
