<template>
  <component :is="iconComponent" class="app-icon" :size="pixelSize" :stroke-width="strokeWidth" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  /** 图标组件（Lucide 图标是函数式组件，运行时校验需同时允许对象与函数） */
  icon: { type: [Object, Function], required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: Number, default: 2 },
});

const iconComponent = computed(() => props.icon);
const pixelSize = computed(() => {
  const n = Number(props.size);
  return Number.isFinite(n) ? n : 16;
});
</script>

<style scoped lang="less">
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
