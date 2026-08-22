<template>
  <HeaderPopoverShell tooltip="曲谱配置 (演唱调 / 指法调 / Capo)">
    <div class="config-row">
      <label class="config-label">滚动速度</label>
      <div class="control-wrapper">
        <BaseSlider
          v-model="scoreEditor.scrollSpeed"
          readout-position="left"
          :show-buttons="false"
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
          v-model="scoreEditor.fontScale"
          readout-position="left"
          :show-buttons="false"
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
          v-model="localFretboardScale"
          readout-position="left"
          :show-buttons="false"
          :min="0.6"
          :max="1.5"
          :step="0.1"
          :default-value="1.0"
          :formatter="val => `${Math.round(val * 100)}%`"
          @commit="commitFretboardScale"
        />
      </div>
    </div>
  </HeaderPopoverShell>
</template>

<script setup lang="ts">
import BaseSlider from '@/ui/components/BaseSlider.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { ref, watch } from 'vue';
import HeaderPopoverShell from './HeaderPopoverShell.vue';

const scoreEditor = useScoreEditorStore();

// 字号缩放走 CSS 变量级联（行级 v-memo 不依赖它），直连 store 拖动即实时预览；
// 和弦缩放会触发整谱行级重渲染，拖动期间只更新本地值，松手（commit）才写入 store
const localFretboardScale = ref(scoreEditor.fretboardScale);

watch(
  () => scoreEditor.fretboardScale,
  val => {
    if (val !== localFretboardScale.value) localFretboardScale.value = val;
  }
);

const commitFretboardScale = (val: number) => {
  if (val !== scoreEditor.fretboardScale) scoreEditor.fretboardScale = val;
};
</script>
