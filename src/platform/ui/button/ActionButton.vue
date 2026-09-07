<template>
  <button
    v-wave="{ disabled: disabled || loading }"
    :aria-label
    :tabindex
    :type
    :aria-busy="loading || undefined"
    :aria-disabled="disabled || loading || undefined"
    :class="[sizeClasses, themeVariantClasses, roundedClasses, { 'w-full': block }]"
    :disabled="disabled || loading"
    :style="normalizedStyle"
    @click="handleInternalClick($event)"
    @pointercancel="handlePointerCancel($event)"
    @pointerdown="handlePointerDown($event)"
    @pointerleave="handlePointerLeave($event)"
    @pointerup="handlePointerUp($event)"
    data-focusable-inline
    class="action-button box-border inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid font-semibold outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/70 active:not-disabled:brightness-95 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
  >
    <BaseIcon
      v-if="loading"
      :class="['loading-icon shrink-0 animate-spin opacity-80', loaderSizeClass]"
      name="loader-2"
    />
    <slot v-else :disabled :loading :size name="prefix">
      <BaseIcon
        v-if="resolvedIcon && hasText"
        :icon-size
        :icon-stroke
        :color="iconColor"
        :name="resolvedIcon"
        aria-hidden="true"
        class="shrink-0"
      />
    </slot>

    <span
      v-if="(hasText || resolvedIcon) && (!loading || !isIconOnly)"
      class="button-content flex items-center justify-center whitespace-nowrap"
    >
      <slot v-if="hasDefaultSlot" :disabled :loading :size />
      <span v-else-if="label" class="whitespace-nowrap">{{ label }}</span>
      <BaseIcon
        v-else-if="resolvedIcon"
        :icon-stroke
        :color="iconColor"
        :icon-size="resolvedIconSize"
        :name="resolvedIcon"
        aria-hidden="true"
        class="shrink-0"
      />
    </span>

    <slot v-if="!loading || !isIconOnly" :disabled :loading :size name="suffix">
      <BaseIcon
        v-if="suffixIcon"
        :icon-size
        :icon-stroke
        :color="iconColor"
        :name="suffixIcon"
        aria-hidden="true"
        class="shrink-0"
      />
    </slot>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, useSlots, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import {
  BUTTON_COMPACTED_SIZE_MAP,
  BUTTON_DEFAULT_THEME_MAP,
  BUTTON_GHOST_THEME_MAP,
  BUTTON_ICON_ONLY_SIZE_MAP,
  BUTTON_LOADER_SIZE_MAP,
  BUTTON_ROUNDED_MAP,
  BUTTON_SIZE_MAP,
  BUTTON_SUBTLE_THEME_MAP,
  BUTTON_TEXT_THEME_MAP,
} from '@/platform/ui/button/buttonThemes';

import type { ComponentSize, ThemeColor } from '@/platform/types';
import type { BaseIconProps } from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizePreset, IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';

const {
  type = 'button',
  color = 'default',
  disabled = false,
  loading = false,
  iconOnly = false,
  icon = undefined,
  iconSize = undefined,
  iconStroke = 'regular',
  iconColor = undefined,
  label = undefined,
  variant = 'default',
  ariaLabel,
  size = 'md',
  rounded = 'full',
  block = false,
  width = undefined,
  height = undefined,
  /** 紧凑模式：左右内边距减半 */
  compacted = false,
  prefixIcon = undefined,
  suffixIcon = undefined,
  holdable = false,
  holdDelay = 300,
} = defineProps<{
  /** 原生 button 的 type，默认 'button' 避免在表单内意外触发表单提交 */
  type?: 'button' | 'submit' | 'reset';
  /** 统一主题色 */
  color?: 'default' | 'primary' | 'danger' | 'warning' | 'success';
  /** 禁用交互并置灰（原生 disabled） */
  disabled?: boolean;
  /** 加载态：显示 spinner 并阻止点击 */
  loading?: boolean;
  /** 图标按钮模式：渲染为方形图标钮（label 不显示） */
  iconOnly?: boolean;
  /**
   * 图标名（注册表枚举）：无默认插槽时作为按钮主体（等同 iconOnly 方形图标钮），
   * 有默认插槽时作为前缀图标；#prefix 插槽优先于本属性。
   */
  icon?: IconName;
  /** 透传给内部 BaseIcon 的尺寸；不传时 icon 主体按按钮 size 映射到图标档位，prefix/suffix 用 1em */
  iconSize?: IconSizeValue;
  /** 透传给内部 BaseIcon 的描边粗细（档位名或数值） */
  iconStroke?: IconStrokeValue;
  /** 透传给内部 BaseIcon 的颜色（默认 currentColor） */
  iconColor?: BaseIconProps['color'];
  /** 按钮文案：行为等同默认插槽，传了默认插槽时以插槽为准（label 忽略） */
  label?: string;
  /** 视觉变体：default 实底 / subtle 浅底 / ghost 透明 / text 纯文字 */
  variant?: 'default' | 'subtle' | 'ghost' | 'text';
  /** iconOnly 场景下必须提供，保证无障碍可访问性 */
  ariaLabel?: string;
  /** 尺寸档位（影响高度、内边距与字号） */
  size?: ComponentSize;
  /** 圆角档位：none 直角 ~ full 全圆 */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full';
  /** 是否占满父容器宽度 (w-full) */
  block?: boolean;
  /** 自定义宽度（数字按 px 处理） */
  width?: string | number;
  /** 自定义高度（数字按 px 处理） */
  height?: string | number;
  /** 紧凑模式：左右内边距减半（不影响高度、圆角、iconOnly、显式 width/height） */
  compacted?: boolean;
  /** 原生 button 的 tabindex（不传则保持按钮默认可聚焦） */
  tabindex?: number;
  /** 前缀图标名（注册表枚举）：以 props 渲染，无需包 #prefix slot；传了 slot 时 slot 优先 */
  prefixIcon?: IconName;
  /** 后缀图标名（注册表枚举）：以 props 渲染，无需包 #suffix slot；传了 slot 时 slot 优先 */
  suffixIcon?: IconName;
  /**
   * 长按能力：按下超过 holdDelay 触发 hold-start（进入持续态），松开/离开/取消触发 hold-end，
   * 并自动吞没长按松手后派发的次生 click，业务层无需手写抑制标志位。
   */
  holdable?: boolean;
  /** holdable 时判定“长按”的阈值(ms)，默认 300 */
  holdDelay?: number;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
  /** 已按住 holdDelay 时长、进入持续态（配合 holdable） */
  (e: 'hold-start', event: PointerEvent): void;
  /** 松开/离开/取消指针，结束持续态（配合 holdable） */
  (e: 'hold-end'): void;
}>();

// —— 长按（holdable）状态机：内部闭环 holdTimer 与次生 click 吞没协议 ——
// 长按达到阈值后松手，浏览器会在 pointerup 之后派发原生 click，这里用 suppressClick
// 拦截该次 click，避免“已持续发声再触发一次短按扫弦”。新一次 pointerdown 会清除残留标志。
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let isHolding = false;
let suppressClick = false;
/** 发起本次长按的指针 id：多指触摸下用于过滤其它手指的 up/leave/cancel 事件 */
let activePointerId: number | null = null;

/** 按下：holdable 时启动长按计时，达到阈值进入持续态并派发 hold-start */
const handlePointerDown = (event: PointerEvent) => {
  // 仅响应主指针左键：右键/副指针长按不应触发持续态
  if (event.button !== 0 || !event.isPrimary) return;
  // 新按压开始即清除上一次遗留的抑制标志（长按后指针滑出按钮、浏览器不派发 click 时，标志会滞留）
  suppressClick = false;
  if (!holdable || disabled || loading) return;
  activePointerId = event.pointerId;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    // 计时期间可能被外部禁用（如按下触发异步任务后置 disabled）：
    // 禁用态不得进入持续态，静默放弃本次长按
    if (disabled || loading) {
      activePointerId = null;
      return;
    }
    isHolding = true;
    suppressClick = true; // 持续发声结束后吞掉本次 click，避免再触发短按动作
    emit('hold-start', event);
  }, holdDelay);
};

/** 中止长按：清计时器，若已进入持续态则补发 hold-end（禁用变更与卸载共用） */
const abortHold = () => {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (isHolding) {
    isHolding = false;
    suppressClick = true;
    emit('hold-end');
  }
  activePointerId = null;
};

// 长按中途被外部禁用/进入加载态时主动中止持续态，避免业务侧（如持续发声）卡到下一次指针事件
watch(
  () => [disabled, loading] as const,
  ([d, l]) => {
    if (d || l) abortHold();
  }
);

/** 结束一次指针序列：未达阈值仅清计时（交由短按 click）；已持续则派发 hold-end 并抑制 click */
const endHoldPress = (cancelled: boolean, event?: PointerEvent) => {
  if (!holdable) return;
  // 多指触摸下第二指的 up/leave/cancel 也会派发回本按钮（触摸隐式捕获）：
  // 仅允许发起长按的那个指针结束本次序列，避免提前打断第一指的长按/持续态
  if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  activePointerId = null;
  if (isHolding) {
    isHolding = false;
    suppressClick = true;
    emit('hold-end');
  } else if (cancelled) {
    suppressClick = true;
  }
};

const handlePointerUp = (event: PointerEvent) => endHoldPress(false, event);
const handlePointerLeave = (event: PointerEvent) => endHoldPress(true, event);
const handlePointerCancel = (event: PointerEvent) => endHoldPress(true, event);

// 卸载时清理长按状态：定时器已派发 hold-start 的话必须补发 hold-end，
// 否则业务侧持续态（如持续发声）会永久卡住且再无指针事件可结束它
onBeforeUnmount(() => {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (isHolding) {
    isHolding = false;
    emit('hold-end');
  }
});

/** 统一点击入口：禁用 / 加载中彻底拦截；holdable 时吞没长按后的次生 click，其余透传 click */
const handleInternalClick = (e: MouseEvent) => {
  // 禁用或加载中时彻底拦截点击，阻断事件冒泡与后续监听器执行
  if (disabled || loading) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return;
  }
  if (holdable) {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
  emit('click', e);
};

type ThemeType = ThemeColor;

const slots = useSlots();
const resolvedColor = computed<ThemeType>(() => color ?? 'default');

/** 是否传入了默认插槽内容 */
const hasDefaultSlot = computed(() => Boolean(slots['default']));
/** 统一解析主图标（兼容 prefixIcon 历史别名） */
const resolvedIcon = computed<IconName | undefined>(() => icon ?? prefixIcon);
/** 是否有文案内容（默认插槽或 label），决定 icon 属性是作前缀还是主体 */
const hasText = computed(() => hasDefaultSlot.value || Boolean(label));
/** 图标主体态：显式 iconOnly，或主图标且无文案（图标即整个按钮主体） */
const isIconOnly = computed(() => iconOnly || (Boolean(resolvedIcon.value) && !hasText.value));

/**
 * 按钮尺寸 → 图标尺寸档位的**显式映射**。
 * 严禁再写 `iconSize ?? size`：组件尺寸（ComponentSize）与图标尺寸（IconSizePreset）是两套语义，
 * 二者档位名重合只是巧合，直接透传会在尺寸档位变动时静默降级为无效 CSS。
 */
const ICON_SIZE_BY_BUTTON_SIZE: Record<ComponentSize, IconSizePreset> = { sm: 'sm', md: 'md', lg: 'xl' };
const resolvedIconSize = computed<IconSizeValue>(() => iconSize ?? ICON_SIZE_BY_BUTTON_SIZE[size] ?? 'md');

// 仅在开发环境中注册 a11y 警告监听，生产环境构建时被完全 Tree-shaking
if (import.meta.env.DEV) {
  watch(
    () => [isIconOnly.value, ariaLabel] as const,
    ([io, label]) => {
      if (io && !label) {
        console.warn('[ActionButton] iconOnly 为 true 时应传入 ariaLabel，否则屏幕阅读器无法识别该按钮。');
      }
    },
    { immediate: true }
  );
}

const sizeClasses = computed(() => {
  if (isIconOnly.value) {
    // iconOnly 已通过 p-0! 强制方形无内边距，compacted 不再叠加
    return BUTTON_ICON_ONLY_SIZE_MAP[size] ?? BUTTON_ICON_ONLY_SIZE_MAP['md'];
  }
  const map = compacted ? BUTTON_COMPACTED_SIZE_MAP : BUTTON_SIZE_MAP;
  return map[size] ?? map['md'];
});

const loaderSizeClass = computed(() => BUTTON_LOADER_SIZE_MAP[size] ?? BUTTON_LOADER_SIZE_MAP['md']);
const roundedClasses = computed(() => BUTTON_ROUNDED_MAP[rounded] ?? BUTTON_ROUNDED_MAP['full']);

const themeVariantClasses = computed(() => {
  if (variant === 'ghost') {
    return `bg-transparent border-transparent ${BUTTON_GHOST_THEME_MAP[resolvedColor.value]}`;
  }
  if (variant === 'subtle') {
    return BUTTON_SUBTLE_THEME_MAP[resolvedColor.value];
  }
  if (variant === 'text') {
    // 紧凑模式下进一步收紧文字按钮的左右内边距（类名必须以完整字面量出现，供 Tailwind 静态扫描）
    return `${compacted ? 'px-[0.15rem]' : 'px-[0.3rem]'} bg-transparent! border-transparent focus:border-primary active:enabled:border-primary focus-visible:border-primary focus-visible:ring-2 ${BUTTON_TEXT_THEME_MAP[resolvedColor.value]}`;
  }
  return BUTTON_DEFAULT_THEME_MAP[resolvedColor.value];
});

const normalizedStyle = computed(() => {
  const style: Record<string, string> = {};
  if (width !== undefined) {
    style['width'] = typeof width === 'number' ? `${width}px` : width;
  }
  if (height !== undefined) {
    style['height'] = typeof height === 'number' ? `${height}px` : height;
  }
  return style;
});
</script>

<!--
  统一过渡：颜色 / 背景 / 边框 / 阴影 / 滤镜 / 不透明度 / 位移 一次声明，
  避免多个 Tailwind transition-* 工具类各自重写 transition-property 互相覆盖。
  用长写属性（不写 transition-delay），以免覆盖调用方加在按钮上的
  [transition-delay:40ms] / [transition-delay:80ms] 错峰延迟。
  时长锁定设计令牌 $duration-fast，缓动用 $bezier-standard。
-->
<style scoped lang="scss">
@use '@/assets/tokens' as *;

.action-button {
  transition-property:
    color, background-color, border-color, box-shadow, filter, opacity, transform, translate, scale, rotate;
  transition-duration: $duration-fast;
  transition-timing-function: $bezier-standard;
}
</style>
