<template>
  <span class="app-tooltip" data-app-tooltip>
    <slot />
  </span>
</template>

<script setup lang="ts">
// AppTooltip：与全局 vTooltip 指令同机制的组件式封装。
// 把指令的「拥有者」提升为包裹元素，便于在需要时按组件组合而非指令调用。
// 实际浮层逻辑复用全局指令（通过 data-app-tooltip 标记，由 vTooltip 指令统一接管）。
</script>

<style scoped lang="less">
.app-tooltip {
  display: inline-flex;
}
</style>
