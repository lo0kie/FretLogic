<template>
  <!-- 角标叠加模式：外层作为定位锚点容器，徽标本体递归复用本组件渲染（不再内联一份残缺副本），
       因此 closable / hoverClose / interactive / 键盘激活等行为与独立模式完全一致，
       此处仅额外叠加定位类与偏移量。 -->
  <span v-if="hasTarget" class="relative inline-flex shrink-0">
    <slot name="target" />
    <BaseBadge
      v-bind="forwardedProps"
      v-if="!isHidden"
      :style="offsetStyle"
      @click="emit('click', $event)"
      @close="emit('close', $event)"
      class="absolute top-0 right-0 z-panel translate-x-1/2 -translate-y-1/2 shadow-xs"
    >
      <!-- 转发除 target 外的全部插槽（含 target 会导致无限递归）。
           不捕获 slot props：BaseBadge 的插槽均不向父级暴露 props，且动态插槽名的作用域绑定
           会让 vue-tsc 无法推断类型、把 slotProps 判为隐式 any（TS7022），故直接透传 -->
      <template v-for="name in forwardedSlotNames" :key="name">
        <slot :name />
      </template>
    </BaseBadge>
  </span>

  <!-- 独立模式：徽标本体即根元素（保持既有 DOM，父组件的 class / 指令仍落到本体上） -->
  <component
    v-auto-width="width === undefined"
    v-else-if="!isHidden"
    :aria-disabled="disabled || undefined"
    :aria-label="ariaLabelText"
    :class="[
      sizeClasses,
      variantAppearanceClasses,
      {
        'cursor-pointer hover:-translate-y-px hover:opacity-85 active:translate-y-0 active:scale-95':
          isClickable && !disabled,
        'cursor-not-allowed opacity-40': disabled,
        'px-0!': Boolean(width),
        'group hover:border-tint-danger-75! hover:bg-tint-danger-88! hover:text-danger! focus-visible:border-tint-danger-75! focus-visible:bg-tint-danger-88! focus-visible:text-danger!':
          hoverClose && !disabled,
      },
    ]"
    :disabled="isNativeButton ? disabled : undefined"
    :is="isNativeButton ? 'button' : 'span'"
    :role="badgeRole"
    :style="normalizedStyle"
    :tabindex="clickableNonButton ? 0 : undefined"
    :type="isNativeButton ? 'button' : undefined"
    @click="handleClick($event)"
    @keydown="handleKeydown($event)"
    data-focusable-inline
    class="box-border inline-flex shrink-0 items-center justify-center rounded-full border border-transparent leading-none font-semibold tracking-tight whitespace-nowrap transition-all duration-fast outline-none select-none"
  >
    <span v-if="hasDot" aria-hidden="true" class="size-1.5 shrink-0 rounded-full bg-current" />

    <slot name="prefix" />

    <span
      v-if="!isDotOnly && ($slots['default'] || content !== undefined)"
      :class="{ 'relative size-full': hoverClose }"
      class="inline-flex h-full items-center justify-center overflow-hidden leading-none text-ellipsis"
    >
      <span
        :class="{ 'group-hover:opacity-0': hoverClose && !disabled }"
        class="inline-flex h-full items-center justify-center leading-none transition-opacity duration-fast"
      >
        <slot> {{ formattedContent }} </slot>
      </span>
      <BaseIcon
        v-if="hoverClose"
        :icon-size="closeIconSize"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 m-auto flex items-center justify-center opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        icon-stroke="bold"
        name="x"
      />
    </span>

    <button
      v-if="closable && !hoverClose"
      :disabled
      @click.stop="handleClose($event)"
      aria-label="关闭"
      class="ml-0.5 flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-65 transition-all duration-fast outline-none hover:bg-tint-current-82 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
      title="关闭"
      type="button"
    >
      <BaseIcon :icon-size="closeIconSize" aria-hidden="true" icon-stroke="bold" name="x" />
    </button>
  </component>
</template>

<script setup lang="ts">
import { computed, useAttrs, useSlots, watch } from 'vue';

import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { logger } from '@/platform/utils/logger';

import type { IconSizePreset, IconSizeValue } from '@/platform/ui/icons/iconSizes';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
type BadgeSize = '2xs' | 'xs' | 'sm' | 'md' | 'lg';
type BadgeAppearance = 'filled' | 'subtle' | 'outline';

defineOptions({ name: 'BaseBadge' });

const props = withDefaults(
  defineProps<{
    /** 徽标语义色：neutral/primary/success/warning/danger */
    variant?: BadgeVariant;
    /** 尺寸档位：2xs（微型角标）~lg；dot 模式下决定红点直径 */
    size?: BadgeSize;
    /** 视觉形态：filled 实底 / subtle 浅底 / outline 描边 */
    appearance?: BadgeAppearance;
    /** 徽标文本内容（数字超长时按 max 截断为 N+） */
    content?: string | number;
    /** 数字内容的上限，超出显示 N+（默认 99）；显式传 0 时非零内容即显示 0+ */
    max?: number;
    /** 是否在数值为 0 时展示，默认为 true；设为 false 时 content===0 将隐藏 */
    showZero?: boolean;
    /** 小红点模式：仅渲染一个无内容的小圆点，忽略 content；直径随 size 档位变化 */
    dot?: boolean;
    /** 在文字前显示状态指示灯（前缀圆点） */
    statusDot?: boolean;
    /** 显示独立关闭小按钮，点击派发 close 事件（可与 interactive 同时生效） */
    closable?: boolean;
    /** 悬停显示关闭图标，整体作为关闭按钮（点击派发 close 事件而非 click） */
    hoverClose?: boolean;
    /** 显式声明为交互按钮，支持键盘焦点与原生 button 交互 */
    interactive?: boolean;
    /** 禁用状态，屏蔽点击与关闭事件并置灰 */
    disabled?: boolean;
    /** 显式固定宽度，数值按 px、字符串原样使用 */
    width?: string | number;
    /** 角标偏移量 [x, y]，支持数值（px）或带单位字符串；仅提供 target 插槽时有意义 */
    offset?: [number | string, number | string];
  }>(),
  {
    variant: 'neutral',
    size: 'sm',
    appearance: 'filled',
    max: 99,
    showZero: true,
    dot: false,
    statusDot: false,
    closable: false,
    hoverClose: false,
    interactive: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'close', event: MouseEvent | KeyboardEvent): void;
  (e: 'click', event: MouseEvent | KeyboardEvent): void;
}>();

const attrs = useAttrs();
const slots = useSlots();

/** 角标叠加模式：提供了 target 插槽，徽标绝对定位于目标元素右上角 */
const hasTarget = computed(() => Boolean(slots['target']));

// offset 依赖定位锚点，无 target 时无意义且会被静默忽略——开发期显式提示，避免使用者踩空。
// 用 watch 而非裸读 hasTarget.value：后者在非响应式上下文会被 vue/no-ref-object-reactivity-loss 判为响应性丢失
watch(
  () => [props.offset, hasTarget.value] as const,
  ([offset, hasTargetVal]) => {
    if (import.meta.env.DEV && offset && !hasTargetVal) {
      logger.warn('BaseBadge', 'offset 仅在提供 target 插槽（角标叠加）时生效，当前无锚点已被忽略');
    }
  },
  { immediate: true }
);

/** 递归复用本体时转发的插槽名：排除 target，否则内层又进入角标模式造成无限递归 */
const forwardedSlotNames = computed(() => Object.keys(slots).filter(name => name !== 'target'));

/** 递归复用本体时转发的 props：offset 由外层以 style 形式叠加，不再下传（内层无锚点会误告警） */
const forwardedProps = computed(() => ({ ...props, offset: undefined }));

/**
 * 本体是否需要响应点击：显式 interactive，或 hoverClose（后者整体即关闭按钮）。
 * 与 closable 互不排斥——closable 只决定是否额外渲染一个独立关闭按钮。
 */
const isClickable = computed(() => props.interactive || props.hoverClose);

/**
 * 是否渲染为原生 button：仅在「可点击且无内嵌关闭按钮」时成立。
 * button 内嵌 button 属非法 HTML（且会导致点击穿透与焦点异常），
 * 故 closable + interactive 组合退化为 span[role=button]，由脚本接管 tabindex 与键盘激活。
 */
const isNativeButton = computed(() => isClickable.value && !props.closable);
/** 可点击但非原生 button（closable + interactive 组合）：需手写 role / tabindex / 键盘激活 */
const clickableNonButton = computed(() => isClickable.value && !isNativeButton.value && !props.disabled);

const badgeRole = computed(() => {
  if (isNativeButton.value) return undefined;
  return isClickable.value ? 'button' : 'status';
});

// 小红点模式：仅渲染一个无内容的小圆点，忽略 content
const isDotOnly = computed(() => props.dot);
// 状态指示灯：在文字前显示前缀圆点（不与 dot 模式叠加）
const hasDot = computed(() => props.statusDot && !isDotOnly.value);

// showZero 控制：当 showZero 为 false 且 content 为 0 时自动隐藏
const isHidden = computed(() => {
  if (props.dot) return false;
  if (!props.showZero && props.content === 0) return true;
  return false;
});

const normalizedStyle = computed(() => {
  if (props.width === undefined) return {};
  const parsedWidth = typeof props.width === 'number' ? `${props.width}px` : props.width;
  return {
    width: parsedWidth,
    minWidth: parsedWidth,
  };
});

const offsetStyle = computed(() => {
  if (!props.offset) return {};
  const [x, y] = props.offset;
  const xStr = typeof x === 'number' ? `${x}px` : x;
  const yStr = typeof y === 'number' ? `${y}px` : y;
  return {
    transform: `translate(calc(50% + ${xStr}), calc(-50% + ${yStr}))`,
  };
});

/** 数字超上限时的截断文本；未触发截断为 undefined。
 *  展示文本与无障碍标签共用此结果，避免两处各写一遍 max 判断后逐渐漂移 */
const truncatedContent = computed(() =>
  typeof props.content === 'number' && props.max !== undefined && props.content > props.max
    ? `${props.max}+`
    : undefined
);

const formattedContent = computed(() => truncatedContent.value ?? props.content);

/** 通用无障碍描述：外部传入优先；其余仅在「可见文本不足以表意」时补齐 */
const ariaLabelText = computed(() => {
  if (attrs['aria-label']) return String(attrs['aria-label']);
  if (props.hoverClose) return '关闭';
  // 纯红点没有任何可见文本，给屏幕阅读器一个兜底语义
  if (isDotOnly.value) return '有更新';
  return truncatedContent.value;
});

/**
 * 各尺寸档位的完整呈现配置：容器类 + 关闭图标档 + 纯红点直径。
 * 三处原本分散在两张映射表与 dot 的 !important 覆盖里，新增档位易漏改且被 ?? 兜底静默吞掉；
 * 合并后 Record 的类型约束会直接要求三项一并补齐。
 */
const SIZE_PRESETS: Record<BadgeSize, { classes: string; closeIcon: IconSizePreset; dot: string }> = {
  // 2xs：更紧凑的微型徽标（角标/密集列表行内），文字沿用最小档 text-2xs
  '2xs': { classes: 'h-[0.95rem] gap-2xs px-[0.3rem] text-2xs', closeIcon: 'xs', dot: 'size-1' },
  'xs': { classes: 'h-[1.15rem] gap-2xs px-[0.35rem] text-2xs', closeIcon: 'xs', dot: 'size-1.5' },
  'sm': { classes: 'h-[1.35rem] gap-xs px-sm text-2xs', closeIcon: 'sm', dot: 'size-2' },
  'md': { classes: 'h-[1.55rem] gap-xs px-[0.6rem] text-xs', closeIcon: 'md', dot: 'size-2.5' },
  'lg': { classes: 'h-[1.8rem] gap-sm px-md text-xs', closeIcon: 'lg', dot: 'size-3' },
};

const sizePreset = computed(() => SIZE_PRESETS[props.size] ?? SIZE_PRESETS.sm);
/** 纯红点走独立尺寸档（无内边距、无文字），不再靠 !important 覆盖容器类来「伪装」圆点 */
const sizeClasses = computed(() => (isDotOnly.value ? sizePreset.value.dot : sizePreset.value.classes));
const closeIconSize = computed<IconSizeValue>(() => sizePreset.value.closeIcon);

const VARIANT_APPEARANCE_MAP: Record<BadgeVariant, Record<BadgeAppearance, string>> = {
  neutral: {
    filled: 'border-border-light bg-surface-body text-fg-disabled',
    subtle: 'border-transparent bg-surface-panel-hover text-fg-body',
    outline: 'border-border-base bg-transparent text-fg-body',
  },
  primary: {
    filled: 'border-transparent bg-primary text-fg-on-accent',
    subtle: 'border-transparent bg-tint-primary-88 text-primary',
    outline: 'border-primary bg-transparent text-primary',
  },
  success: {
    filled: 'border-transparent bg-success text-fg-on-accent',
    subtle: 'border-transparent bg-tint-success-88 text-success',
    outline: 'border-success bg-transparent text-success',
  },
  warning: {
    filled: 'border-transparent bg-warning text-fg-on-accent',
    subtle: 'border-transparent bg-tint-warning-88 text-warning',
    outline: 'border-warning bg-transparent text-warning',
  },
  danger: {
    filled: 'border-transparent bg-danger text-fg-on-accent',
    subtle: 'border-transparent bg-tint-danger-88 text-danger',
    outline: 'border-danger bg-transparent text-danger',
  },
};

const variantAppearanceClasses = computed(
  () => VARIANT_APPEARANCE_MAP[props.variant]?.[props.appearance] ?? VARIANT_APPEARANCE_MAP.neutral.filled
);

/** 关闭按钮：禁用态屏蔽，派发 close */
const handleClose = (e: MouseEvent | KeyboardEvent) => {
  if (props.disabled) return;
  emit('close', e);
};

/**
 * 本体激活：hoverClose 模式下整体即关闭按钮，只派发 close 后直接返回——
 * 此处必须再判一次 hoverClose，否则一次点击会同时触发 click 与 close 两个语义。
 * 其余可点击态派发 click。
 */
const handleClick = (e: MouseEvent | KeyboardEvent) => {
  if (props.disabled) return;
  if (props.hoverClose) {
    emit('close', e);
    return;
  }
  if (isClickable.value) {
    emit('click', e);
  }
};

/** 非原生 button 的可点击态（closable + interactive 组合）：补齐 Enter / Space 键盘激活 */
const handleKeydown = (e: KeyboardEvent) => {
  if (!clickableNonButton.value) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  handleClick(e);
};
</script>
