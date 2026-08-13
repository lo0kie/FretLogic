<template>
  <div class="empty-state-wrapper" :class="[sizeClass, { 'is-bordered': bordered }]">
    <div v-if="icon || $slots.icon" class="icon-zone">
      <slot name="icon">
        <component :is="icon" :size="iconSize" stroke-width="2.5" class="empty-icon" />
      </slot>
    </div>

    <div v-if="title || $slots.title" class="title-text">
      <slot name="title">{{ title }}</slot>
    </div>

    <div v-if="description || $slots.default" class="description-text">
      <slot>{{ description }}</slot>
    </div>

    <div v-if="$slots.action" class="action-zone">
      <slot name="action"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 支持传入 Lucide 图标组件 */
    icon?: Component;
    /** 主标题 */
    title?: string;
    /** 描述/副文本 */
    description?: string;
    /** 尺寸档位：sm (小卡片内) | md (侧边栏/列表) | lg (主视图大区) */
    size?: 'sm' | 'md' | 'lg';
    /** 是否带有虚线边框外框 */
    bordered?: boolean;
  }>(),
  {
    size: 'md',
    bordered: false,
  }
);

const sizeClass = computed(() => `size-${props.size}`);

const iconSize = computed(() => {
  switch (props.size) {
    case 'sm':
      return 16;
    case 'lg':
      return 36;
    case 'md':
    default:
      return 22;
  }
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.empty-state-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  user-select: none;
  text-align: center;

  &.is-bordered {
    border: 1px dashed var(--border-light);
    border-radius: @radius-md;
    background-color: var(--bg-body);
  }
}

/* 尺寸变体控制 */
.size-sm {
  padding: 0.8rem 0;

  .icon-zone {
    margin-bottom: 0.2rem;
  }

  .title-text {
    font-size: 0.62rem;
    font-weight: 500;
  }

  .description-text {
    font-size: 0.58rem;
  }
}

.size-md {
  padding: 2.5rem 1rem;

  .icon-zone {
    margin-bottom: 0.5rem;
  }

  .title-text {
    font-size: 0.76rem;
    font-weight: 600;
  }

  .description-text {
    font-size: 0.68rem;
  }
}

.size-lg {
  padding: 3rem 1.5rem;

  .icon-zone {
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    background-color: var(--bg-panel-hover);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .title-text {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .description-text {
    font-size: 0.78rem;
    margin-top: 0.3rem;
  }
}

.icon-zone {
  color: var(--text-disabled);
  opacity: 0.75;
}

.title-text {
  color: var(--text-title);
  line-height: 1.3;
}

.description-text {
  color: var(--text-disabled);
  font-weight: 500;
  line-height: 1.4;
}

.action-zone {
  margin-top: 0.8rem;
}
</style>
