<template>
  <HeaderPopoverShell tooltip="曲谱配置 (演唱调 / 指法调 / Capo)">
    <div class="config-row">
      <label class="config-label">滚动速度</label>
      <div class="control-wrapper">
        <BaseSlider
          readout-position="left"
          v-model="scoreEditor.scrollSpeed"
          :showButtons="false"
          :min="40"
          :max="120"
          :step="5"
          :default-value="60"
        />
      </div>
    </div>

    <div class="config-row">
      <label class="config-label">字号缩放</label>
      <div class="control-wrapper">
        <BaseSlider
          readout-position="left"
          v-model="scoreEditor.fontScale"
          :showButtons="false"
          :min="0.6"
          :max="1.5"
          :step="0.05"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
        />
      </div>
    </div>

    <div class="config-row">
      <label class="config-label">和弦缩放</label>
      <div class="control-wrapper">
        <BaseSlider
          readout-position="left"
          v-model="scoreEditor.fretboardScale"
          :showButtons="false"
          :min="0.6"
          :max="1.5"
          :step="0.1"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
        />
      </div>
    </div>
  </HeaderPopoverShell>
</template>

<script setup lang="ts">
import BaseSlider from '@/components/BaseSlider.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import HeaderPopoverShell from './HeaderPopoverShell.vue';

const scoreEditor = useScoreEditorStore();
</script>
