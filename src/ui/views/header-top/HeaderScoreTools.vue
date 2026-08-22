<template>
  <BaseSegmentedControl
    v-model="scoreEditor.activeTab"
    :options="scoreModeOptions"
    size="md"
    texted
    @change="handleTabChange"
  />
</template>

<script setup lang="ts">
import BaseSegmentedControl, { type SegmentOption } from '@/ui/components/BaseSegmentedControl.vue';
import { isGlobalEditable } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useUiStore } from '@/stores/uiStore';
import { computed } from 'vue';

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const scoreModeOptions = computed<SegmentOption<'edit' | 'interactive'>[]>(() => [
  { label: '编辑歌词', value: 'edit', disabled: !isGlobalEditable.value },
  {
    label: '排列和弦',
    value: 'interactive',
    disabled: !scoreEditor.hasLyrics,
  },
]);

const handleTabChange = (val: 'edit' | 'interactive') => {
  if (val === 'interactive' && !scoreEditor.hasLyrics) {
    uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
  }
};
</script>
