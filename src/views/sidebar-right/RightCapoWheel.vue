<template>
  <div class="relative flex flex-col gap-2">
    <label class="text-xs font-black tracking-widest uppercase" style="color: var(--text-disabled)">
      Capo (把位平移)
    </label>

    <div class="relative w-full">
      <GlobalTooltip class="w-full" content="点击展开或滚动滑轮切换" placement="top">
        <BaseSelector
          v-model="editorStore.capo"
          :options="capoOptions"
          clearable
          :defaultValue="0"
          maxHeightClass="max-h-52"
          optionIdPrefix="capo-opt-"
          @wheel-change="handleCapoWheel"
        >
          <template #label="{ selected }"> {{ selected }} {{ selected === 0 ? '(空弦位)' : '品' }} </template>

          <template #option="{ option }">
            <span class="w-4 text-right mr-1.5 font-black">{{ option }}</span>
            <span>{{ option === 0 ? '(空弦位)' : '品' }}</span>
          </template>
        </BaseSelector>
      </GlobalTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseSelector from '@/components/BaseSelector.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useEditorStore } from '@/stores/editorStore';

const editorStore = useEditorStore();
const capoOptions = Array.from({ length: 13 }, (_, i) => i);

const handleCapoWheel = (direction: 'up' | 'down') => {
  if (direction === 'up') {
    editorStore.capo = Math.max(0, editorStore.capo - 1);
  } else {
    editorStore.capo = Math.min(12, editorStore.capo + 1);
  }
};
</script>
