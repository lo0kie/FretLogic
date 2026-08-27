<template>
  <div
    role="status"
    aria-live="polite"
    class="empty-state-wrapper flex flex-col items-center justify-center w-full h-full box-border select-none text-center"
    :class="[
      sizeClass,
      gapClass,
      { 'is-bordered border border-dashed border-border-light rounded-md bg-bg-body': bordered },
    ]"
  >
    <!-- 图标区 / 自定义插画 -->
    <div class="icon-zone text-text-disabled opacity-80 shrink-0" :class="zoneClass">
      <slot name="icon" :size="iconSize">
        <!-- 自定义插画 URL（带加载失败自动降级） -->
        <img
          v-if="image && !isImageError"
          :src="image"
          class="max-w-[8rem] max-h-28 object-contain"
          alt=""
          aria-hidden="true"
          @error="isImageError = true"
        />
        <!-- 传入或预设 Lucide 组件 -->
        <component :is="resolvedIcon" v-else :size="iconSize" stroke-width="1.8" class="empty-icon" />
      </slot>
    </div>

    <!-- 文字说明容器 -->
    <div v-if="hasText" class="text-zone flex flex-col items-center gap-1">
      <div
        v-if="title || $slots.title"
        class="title-text text-text-title leading-tight max-w-[18rem] break-words"
        :class="titleClass"
      >
        <slot name="title"> {{ title }} </slot>
      </div>

      <div
        v-if="resolvedDescription || $slots.default"
        class="description-text text-text-disabled font-medium leading-relaxed max-w-[22rem] break-words"
        :class="descriptionClass"
      >
        <slot> {{ resolvedDescription }} </slot>
      </div>
    </div>

    <!-- 操作区：复用全局 ActionButton 保持风格统一 -->
    <div v-if="$slots.action || actionText" class="action-zone">
      <slot name="action">
        <ActionButton
          v-if="actionText"
          :variant="actionVariant"
          :color="actionColor"
          :size="actionBtnSize"
          :loading="actionLoading"
          :disabled="actionLoading"
          @click="emit('action')"
        >
          {{ actionText }}
        </ActionButton>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FileQuestion, Inbox, SearchX, WifiOff } from '@lucide/vue';
import { computed, ref, watch, type Component } from 'vue';
import ActionButton from './ActionButton.vue';

type EmptyType = 'empty' | '404' | 'network' | 'search';

const props = withDefaults(
  defineProps<{
    /** 预设状态场景类型：empty 缺省 | 404 未找到 | network 网络错误 | search 搜索无结果 */
    type?: EmptyType;
    /** 支持传入 Lucide 图标组件；未传时根据 type 自动匹配 */
    icon?: Component;
    /** 自定义插画 URL，加载失败时自动回退至图标 */
    image?: string;
    /** 主标题 */
    title?: string;
    /** 描述/副文本 */
    description?: string;
    /** 尺寸档位：sm (小卡片内) | md (侧边栏/列表) | lg (主视图大区) */
    size?: 'sm' | 'md' | 'lg';
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

const TYPE_CONFIG_MAP: Record<EmptyType, { icon: Component; description: string }> = {
  empty: { icon: Inbox, description: '暂无数据' },
  404: { icon: FileQuestion, description: '未找到相关资源' },
  network: { icon: WifiOff, description: '网络连接异常，请重试' },
  search: { icon: SearchX, description: '未找到匹配结果' },
};

const resolvedIcon = computed<Component>(() => {
  if (props.icon) return props.icon;
  return TYPE_CONFIG_MAP[props.type]?.icon ?? Inbox;
});

const resolvedDescription = computed(() => {
  if (props.description !== undefined) return props.description;
  return TYPE_CONFIG_MAP[props.type]?.description;
});

const hasText = computed(() => Boolean(props.title || resolvedDescription.value));

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'empty-size-sm py-md px-0';
    case 'lg':
      return 'empty-size-lg py-3xl px-xl';
    default:
      return 'empty-size-md py-3xl px-lg';
  }
});

const gapClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'gap-1.5';
    case 'lg':
      return 'gap-4';
    default:
      return 'gap-2.5';
  }
});

const SIZE_TO_ICON: Record<'sm' | 'md' | 'lg', number> = {
  sm: 18,
  md: 26,
  lg: 38,
};
const iconSize = computed(() => SIZE_TO_ICON[props.size] ?? 26);

const actionBtnSize = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'sm';
    case 'lg':
      return 'md';
    default:
      return 'sm';
  }
});

const zoneClass = computed(() => {
  if (props.image && !isImageError.value) {
    return 'flex items-center justify-center';
  }
  if (props.size === 'lg') {
    return 'w-16 h-16 rounded-full bg-bg-panel-hover flex items-center justify-center';
  }
  return 'flex items-center justify-center';
});

const titleClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'text-2xs font-semibold';
    case 'lg':
      return 'text-base font-bold';
    default:
      return 'text-xs font-semibold';
  }
});

const descriptionClass = computed(() => {
  switch (props.size) {
    case 'lg':
      return 'text-xs';
    default:
      return 'text-2xs';
  }
});
</script>
