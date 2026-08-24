<template>
  <div class="empty-state-wrapper" :class="[sizeClass, { 'is-bordered': bordered }]">
    <div v-if="icon || $slots.icon" class="icon-zone">
      <slot name="icon">
        <component :is="icon" :size="iconSize" stroke-width="2.5" class="empty-icon" />
      </slot>
    </div>

    <div v-if="title || $slots.title" class="title-text">
      <slot name="title">
        {{ title }}
      </slot>
    </div>

    <div v-if="description || $slots.default" class="description-text">
      <slot>{{ description }}</slot>
    </div>

    <div v-if="$slots.action" class="action-zone">
      <slot name="action" />
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
    icon: undefined,
    title: '',
    description: '',
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
  padding: @space-md 0;

  .icon-zone {
    margin-bottom: 0.2rem;
  }

  .title-text {
    font-size: @fs-2xs;
    font-weight: 500;
  }

  .description-text {
    font-size: @fs-2xs;
  }
}

.size-md {
  padding: @space-3xl @space-lg;

  .icon-zone {
    margin-bottom: 0.5rem;
  }

  .title-text {
    font-size: @fs-xs;
    font-weight: 600;
  }

  .description-text {
    font-size: @fs-2xs;
  }
}

.size-lg {
  padding: @space-3xl @space-xl;

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
    font-size: @fs-base;
    font-weight: 700;
  }

  .description-text {
    font-size: @fs-xs;
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
