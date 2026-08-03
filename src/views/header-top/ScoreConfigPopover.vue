<template>
  <HeaderPopoverShell tooltip="曲谱配置 (演唱调 / 指法调 / Capo)">
    <div class="config-row">
      <label class="config-label">字号缩放</label>
      <div class="control-wrapper">
        <BaseScaleSlider
          readout-position="left"
          v-model="scoreEditor.fontScale"
          :showButtons="false"
          :min="0.6"
          :max="1.5"
          :step="0.05"
          :default-value="1.0"
        />
      </div>
    </div>

    <div class="config-row">
      <label class="config-label">和弦缩放</label>
      <div class="control-wrapper">
        <BaseScaleSlider
          readout-position="left"
          v-model="scoreEditor.fretboardScale"
          :showButtons="false"
          :min="0.6"
          :max="1.5"
          :step="0.1"
          :default-value="1.0"
        />
      </div>
    </div>
  </HeaderPopoverShell>
</template>

<script setup lang="ts">
import BaseScaleSlider from '@/components/BaseScaleSlider.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import HeaderPopoverShell from './HeaderPopoverShell.vue';

const scoreEditor = useScoreEditorStore();
</script>
