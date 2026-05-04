<script setup lang="ts">
interface Props {
  // 宽度可以是百分比、px、或 Tailwind 类名，这里建议支持灵活定义
  width?: string;
  padding?: string;
  height?: string;
}

// 设置默认值
const props = withDefaults(defineProps<Props>(), {
  width: '100%',
  padding: '0',
});

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<template>
  <div
    class="base-card-container rounded-xl relative box-border p-6 flex flex-col items-center"
    :style="{ width, padding, height }"
    @click="$emit('click')"
  >
    <!-- 头部插槽：通常放标题、标签 -->
    <template v-if="$slots.header">
      <slot name="header"></slot>
    </template>

    <!-- 默认插槽：放核心内容（如指板图） -->
    <slot></slot>

    <!-- 底部插槽：放操作按钮 -->
    <template v-if="$slots.footer">
      <slot name="footer"></slot>
    </template>
  </div>
</template>

<style lang="less" scoped>
@import '@/styles/variables.less';

.base-card-container {
  .glass-effect(); // 复用你之前的玻璃拟态混合
}
</style>
