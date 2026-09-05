<template>
  <div
    :class="[
      sizeClass,
      gapClass,
      { 'is-bordered border-border-light bg-bg-body rounded-md border border-dashed': bordered },
    ]"
    aria-live="polite"
    class="empty-state-wrapper box-border flex h-full w-full flex-col items-center justify-center text-center select-none"
    role="status"
  >
    <div :class="zoneClass" class="icon-zone text-text-disabled shrink-0 opacity-80">
      <slot :size="iconSize" name="icon">
        <img
          v-if="image && !isImageError"
          :src="image"
          @error="isImageError = true"
          alt=""
          aria-hidden="true"
          class="max-h-28 max-w-[8rem] object-contain"
        />
        <BaseIcon v-else-if="typeof resolvedIcon === 'string'" :icon-size :name="resolvedIcon" class="empty-icon" />
        <component v-else :is="resolvedIcon" :size="resolveIconSize(iconSize)" class="empty-icon" />
      </slot>
    </div>

    <div v-if="hasText" class="text-zone flex flex-col items-center gap-1">
      <div
        v-if="title || $slots['title']"
        :class="titleClass"
        class="title-text text-text-title max-w-[18rem] leading-tight wrap-break-word"
      >
        <slot name="title"> {{ title }} </slot>
      </div>

      <div
        v-if="resolvedDescription || $slots['default']"
        :class="descriptionClass"
        class="description-text text-text-disabled max-w-[22rem] leading-relaxed font-medium wrap-break-word"
      >
        <slot> {{ resolvedDescription }} </slot>
      </div>
    </div>

    <div v-if="$slots['action'] || actionText" class="action-zone">
      <slot name="action">
        <ActionButton
          v-if="actionText"
          :color="actionColor"
          :disabled="actionLoading"
          :label="actionText"
          :loading="actionLoading"
          :size="actionBtnSize"
          :variant="actionVariant"
          @click="emit('action')"
        />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';

import type { ComponentSize } from '@/platform/types';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import { resolveIconSize, type IconSizeValue } from '@/platform/ui/icons/iconSizes';

import ActionButton from '../button/ActionButton.vue';

type EmptyType = 'empty' | '404' | 'network' | 'search';

const props = withDefaults(
  defineProps<{
    /** 预设状态场景类型：empty 缺省 | 404 未找到 | network 网络错误 | search 搜索无结果 */
    type?: EmptyType;
    /** 支持传入图标名称或组件；未传时根据 type 自动匹配 */
    icon?: IconName | Component;
    /** 自定义插画 URL，加载失败时自动回退至图标 */
    image?: string;
    /** 主标题 */
    title?: string;
    /** 描述/副文本 */
    description?: string;
    /** 尺寸档位：sm (小卡片内) | md (侧边栏/列表) | lg (主视图大区) */
    size?: ComponentSize;
    /** 是否带有虚线边框外框 */
    bordered?: boolean;
    /** 便捷操作按钮文字；传入后自动渲染 ActionButton 并触发 'action' 事件 */
    actionText?: string;
    /** 操作按钮 Loading 态 */
    actionLoading?: boolean;
    /** 操作按钮风格 */
    actionVariant?: 'default' | 'subtle' | 'ghost' | 'text';
    /** 操作按钮颜色 */
    actionColor?: 'primary' | 'danger' | 'warning' | 'success';
  }>(),
  {
    type: 'empty',
    size: 'md',
    bordered: false,
    actionLoading: false,
    actionVariant: 'subtle',
    actionColor: 'primary',
  }
);

const emit = defineEmits<{
  (e: 'action'): void;
}>();

const isImageError = ref(false);
watch(
  () => props.image,
  () => {
    isImageError.value = false;
  }
);

const TYPE_CONFIG_MAP: Record<EmptyType, { icon: IconName; description: string }> = {
  empty: { icon: 'inbox', description: '暂无数据' },
  404: { icon: 'file-question', description: '未找到相关资源' },
  network: { icon: 'wifi-off', description: '网络连接异常，请重试' },
  search: { icon: 'search-x', description: '未找到匹配结果' },
};

const resolvedIcon = computed<IconName | Component>(() => {
  if (props.icon) return props.icon;
  return TYPE_CONFIG_MAP[props.type]?.icon ?? 'inbox';
});

const resolvedDescription = computed(() => {
  if (props.description !== undefined) return props.description;
  return TYPE_CONFIG_MAP[props.type]?.description;
});

const hasText = computed(() => Boolean(props.title || resolvedDescription.value));

const SIZE_CONFIG_MAP: Record<
  'sm' | 'md' | 'lg',
  {
    sizeClass: string;
    gapClass: string;
    iconSize: IconSizeValue;
    actionBtnSize: 'sm' | 'md';
    titleClass: string;
    descriptionClass: string;
  }
> = {
  sm: {
    sizeClass: 'empty-size-sm py-md px-0',
    gapClass: 'gap-1.5',
    iconSize: 'lg',
    actionBtnSize: 'sm',
    titleClass: 'text-2xs font-semibold',
    descriptionClass: 'text-2xs',
  },
  md: {
    sizeClass: 'empty-size-md py-3xl px-lg',
    gapClass: 'gap-2.5',
    iconSize: '2xl',
    actionBtnSize: 'sm',
    titleClass: 'text-xs font-semibold',
    descriptionClass: 'text-2xs',
  },
  lg: {
    sizeClass: 'empty-size-lg py-3xl px-xl',
    gapClass: 'gap-4',
    iconSize: '3xl',
    actionBtnSize: 'md',
    titleClass: 'text-base font-bold',
    descriptionClass: 'text-xs',
  },
};

const sizeConfig = computed(() => SIZE_CONFIG_MAP[props.size] ?? SIZE_CONFIG_MAP.md);
const sizeClass = computed(() => sizeConfig.value.sizeClass);
const gapClass = computed(() => sizeConfig.value.gapClass);
const iconSize = computed(() => sizeConfig.value.iconSize);
const actionBtnSize = computed(() => sizeConfig.value.actionBtnSize);

const zoneClass = computed(() => {
  if (props.image && !isImageError.value) {
    return 'flex items-center justify-center';
  }
  if (props.size === 'lg') {
    return 'w-16 h-16 rounded-full bg-bg-panel-hover flex items-center justify-center';
  }
  return 'flex items-center justify-center';
});

const titleClass = computed(() => sizeConfig.value.titleClass);
const descriptionClass = computed(() => sizeConfig.value.descriptionClass);
</script>
