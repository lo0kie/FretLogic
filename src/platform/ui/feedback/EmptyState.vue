<template>
  <div
    :class="[
      sizeClass,
      gapClass,
      { 'is-bordered rounded-md border border-dashed border-border-light bg-surface-body': bordered },
    ]"
    aria-live="polite"
    class="empty-state-wrapper box-border flex size-full flex-col items-center justify-center text-center select-none"
    role="status"
  >
    <div :class="zoneClass" class="icon-zone shrink-0 text-fg-disabled opacity-80">
      <slot :size="iconSize" name="icon">
        <img
          v-if="image && !isImageError"
          :src="image"
          @error="isImageError = true"
          alt=""
          aria-hidden="true"
          class="max-h-28 max-w-32 object-contain"
        />
        <BaseIcon v-else-if="typeof resolvedIcon === 'string'" :icon-size :name="resolvedIcon" class="empty-icon" />
        <component v-else :is="resolvedIcon" :size="resolveIconSize(iconSize)" class="empty-icon" />
      </slot>
    </div>

    <div v-if="hasText" class="text-zone flex flex-col items-center gap-1">
      <div
        v-if="title || $slots['title']"
        :class="titleClass"
        class="title-text max-w-72 leading-tight wrap-break-word text-fg-title"
      >
        <slot name="title"> {{ title }} </slot>
      </div>

      <div
        v-if="resolvedDescription || $slots['default']"
        :class="descriptionClass"
        class="description-text max-w-88 leading-relaxed font-medium wrap-break-word text-fg-disabled"
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
import { computed, ref, useSlots, watch } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { resolveIconSize } from '@/platform/ui/icons/iconSizes';

import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizeValue } from '@/platform/ui/icons/iconSizes';
import type { Component } from 'vue';

type EmptyType = 'empty' | '404' | 'network' | 'search';

const props = withDefaults(
  defineProps<{
    /** 预设状态场景类型：empty 缺省 | 404 未找到 | network 网络错误 | search 搜索无结果 */
    type?: EmptyType;
    /** 支持传入图标名称或组件；未传时根据 type 自动匹配。
     *  传组件时该组件须接受 `size: number` prop（像素值），否则尺寸档位静默不生效 */
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

const slots = useSlots();

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

// 开发期提示：type 新增枚举但漏加 TYPE_CONFIG_MAP 时给出警告，避免静默降级为默认图标/文案
if (import.meta.env.DEV) {
  watch(
    () => props.type,
    t => {
      if (t && !(t in TYPE_CONFIG_MAP)) {
        console.warn(`[EmptyState] type "${t}" 未在 TYPE_CONFIG_MAP 中配置，已回退为默认图标/文案。`);
      }
    },
    { immediate: true }
  );
}

const resolvedIcon = computed<IconName | Component>(() => {
  if (props.icon) return props.icon;
  return TYPE_CONFIG_MAP[props.type]?.icon ?? 'inbox';
});

const resolvedDescription = computed(() => {
  if (props.description !== undefined) return props.description;
  return TYPE_CONFIG_MAP[props.type]?.description;
});

// text-zone 是外层容器：必须把插槽一并纳入，否则 description 显式传空串时
// hasText 为 false，会连内层本该显示的 #title / #default 插槽一起挡掉
const hasText = computed(() => Boolean(props.title || slots['title'] || resolvedDescription.value || slots['default']));

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
    sizeClass: 'empty-size-sm px-0 py-md',
    gapClass: 'gap-1.5',
    iconSize: 'lg',
    actionBtnSize: 'sm',
    titleClass: 'text-2xs font-semibold',
    descriptionClass: 'text-2xs',
  },
  md: {
    sizeClass: 'empty-size-md px-lg py-3xl',
    gapClass: 'gap-2.5',
    iconSize: '2xl',
    actionBtnSize: 'sm',
    titleClass: 'text-xs font-semibold',
    descriptionClass: 'text-2xs',
  },
  lg: {
    sizeClass: 'empty-size-lg px-xl py-3xl',
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
    // lg 下图标容器是 64px 圆形区；图片分支预留同尺寸，加载失败回退时不再有明显布局跳变
    //（sm/md 两分支本就同为 flex 居中，无需预留）
    return props.size === 'lg'
      ? 'flex min-h-16 min-w-16 items-center justify-center'
      : 'flex items-center justify-center';
  }
  if (props.size === 'lg') {
    return 'w-16 h-16 rounded-full bg-surface-panel-hover flex items-center justify-center';
  }
  return 'flex items-center justify-center';
});

const titleClass = computed(() => sizeConfig.value.titleClass);
const descriptionClass = computed(() => sizeConfig.value.descriptionClass);
</script>
