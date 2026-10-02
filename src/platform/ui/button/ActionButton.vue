<template>
  <!-- 宽度补间（v-auto-width）：文案 / 图标 / 尺寸档变化时按 FLIP 补间宽度，而不是瞬跳。
       两个前提不成立时不启用（与 BaseBadge 同一口径，见其 `autoWidth && width === undefined`）：
       ① `width` 显式给了 —— 定宽，本就不会变；② `block`（w-full）—— 宽度由父容器决定，
       那是布局变化，补间只会与父级的重排打架。
       组件样式里的 transition-property 刻意不含 width（见文件末尾）：两者叠加会互相顶掉，
       宽度补间只由本指令驱动。 -->
  <button
    v-auto-width="width === undefined && !block"
    v-wave="{ disabled: disabled || loading }"
    :aria-label
    :tabindex
    :type
    :aria-busy="loading || undefined"
    :aria-disabled="disabled || loading || undefined"
    :class="[sizeClasses, themeAppearanceClasses, roundedClasses, { 'w-full': block }]"
    :disabled="disabled || loading"
    :style="normalizedStyle"
    :title="resolvedTitle"
    @click="handleInternalClick($event)"
    @pointercancel="handlePointerCancel($event)"
    @pointerdown="handlePointerDown($event)"
    @pointerleave="handlePointerLeave($event)"
    @pointerup="handlePointerUp($event)"
    data-focusable-outline
    class="action-button inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid font-semibold outline-none select-none active:not-disabled:brightness-95 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:shadow-none"
  >
    <!-- loading 态**刻意不接形变**（进/出 loading 仍是瞬切），两条各自成立的理由：
         ① 结构上这是另一枚节点 —— `v-if="loading"` 与 `<slot v-else>` 里的主图标是两支，实例被卸载重建、
            `name` 从未变化，形变引擎（BaseIcon 内 `watch(() => name)`）看不到；
         ② 即便并成单枚常驻，`loader-2` 也得与**所有**按钮图标两两登记，而按钮图标由调用方随手给
            （play / copy / clipboard-paste / refresh-cw / cloud-download / trash-2…），是开放集合 ——
            覆盖范围收不住，形状匹配在这些对上的观感也无从保证。故维持瞬切。
         描边档照常透传（`:icon-stroke`）：loading 图标就是按钮的图标，线宽该与另外三处图标一致；
         少这一绑，`icon-stroke` 在 loading 态静默失效（调用方看不出，只当档位没生效）。 -->
    <BaseIcon
      v-if="loading"
      :icon-stroke
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

    <!-- 主图标有两处落点：有文案时是 `#prefix` 槽里那一枚、纯图标时是下面 span 里这一枚（图标即按钮主体）。
         同一枚图标在「有文案 ↔ 纯图标」之间切换会换支 ⇒ 实例被卸载重建、改名不触发形变。
         当前无调用方在运行中改文案（`label` / 默认插槽都是静态传入的），故不并支、只记在这里。 -->
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
  BUTTON_DISABLED_THEME_MAP,
  BUTTON_GHOST_THEME_MAP,
  BUTTON_ICON_ONLY_SIZE_MAP,
  BUTTON_LOADER_SIZE_MAP,
  BUTTON_ROUNDED_MAP,
  BUTTON_SIZE_MAP,
  BUTTON_SUBTLE_THEME_MAP,
  BUTTON_TEXT_THEME_MAP,
} from '@/platform/ui/button/buttonThemes';
import { hasOwn, isNumber } from '@/platform/utils/common';
import { resolveTextTitle } from '@/platform/utils/dom';

import type { ComponentSize, ThemeColor } from '@/platform/types';
import type { BaseIconProps } from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { IconSizePreset, IconSizeValue, IconStrokeValue } from '@/platform/ui/icons/iconSizes';

const {
  type = 'button',
  color = 'neutral',
  disabled = false,
  loading = false,
  iconOnly = false,
  iconInset = 'none',
  icon = undefined,
  iconSize = undefined,
  iconStroke = 'regular',
  iconColor = undefined,
  label = undefined,
  appearance = 'default',
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
  title = undefined,
} = defineProps<{
  /** 原生 button 的 type，默认 'button' 避免在表单内意外触发表单提交 */
  type?: 'button' | 'submit' | 'reset';
  /** 语义色轴（见 ThemeColor）：neutral 中性 / primary 主色 / danger / warning / success */
  color?: ThemeColor;
  /** 禁用交互并置灰（原生 disabled） */
  disabled?: boolean;
  /** 加载态：显示 spinner 并阻止点击 */
  loading?: boolean;
  /** 图标按钮模式：渲染为方形图标钮（label 不显示） */
  iconOnly?: boolean;
  /** iconOnly 时的内边距档：默认 `none`（方形无内边距，与既有行为一致）；
   *  `sm` 补一圈紧凑内边距 —— 抽屉 / 模态的关闭按钮需要在窄行里留出可点面积，
   *  此前由消费方 `class="p-1.5!"` 硬压回来，与组件自身的 `p-0!` 对拉 */
  iconInset?: 'none' | 'sm';
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
  /**
   * 外观档轴（底 / 描边的浓淡）：default 实底 / subtle 浅底 / ghost 透明 / text 纯文字。
   * 与 `color`（语义色轴）正交 —— 本轴只管「有没有底、底有多浓」，上什么颜色由 `color` 决定。
   */
  appearance?: 'default' | 'subtle' | 'ghost' | 'text';
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
  /** 悬停提示文本；缺省时回退到 label，其次默认插槽文本 */
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
  /** 已按住 holdDelay 时长、进入持续态（配合 holdable） */
  (e: 'hold-start', event: PointerEvent): void;
  /** 松开/离开/取消指针，结束持续态（配合 holdable） */
  (e: 'hold-end'): void;
}>();

defineSlots<{
  /** 主内容（标签文本 / 图标）；缺省渲染 label 与 icon */
  default?: (props: { disabled: boolean; loading: boolean; size: ComponentSize }) => unknown;
  /** 前导内容，渲染在图标之前 */
  prefix?: (props: { disabled: boolean; loading: boolean; size: ComponentSize }) => unknown;
  /** 尾部内容，渲染在图标之后 */
  suffix?: (props: { disabled: boolean; loading: boolean; size: ComponentSize }) => unknown;
}>();

// —— 长按（holdable）状态机：内部闭环 holdTimer 与次生 click 吞没协议 ——
// 长按达到阈值后松手，浏览器会在 pointerup 之后派发原生 click，这里用 suppressClick
// 拦截该次 click，避免“已持续发声再触发一次短按扫弦”。新一次 pointerdown 会清除残留标志。
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let isHolding = false;
let suppressClick = false;
/** 发起本次长按的指针 id：多指触摸下用于过滤其它手指的 up/leave/cancel 事件 */
let activePointerId: number | null = null;
/**
 * 本次按压是否仍在进行中（pointerdown 起，pointerup / leave / cancel 止）。
 *
 * **不能拿 `activePointerId !== null` 代替**：触摸端轻点的事件序是
 * `pointerdown → pointerup → pointerout → pointerleave → click`（Chromium 触摸模拟实测，
 * 鼠标端则没有 pointerup 之后的那两个 out/leave）—— 触点抬起时浏览器释放触摸的**隐式指针捕获**，
 * 同时触点已不存在，于是补发一次 pointerout / pointerleave。那一次并不代表「按住时滑出了按钮」，
 * 若按取消处理就会把紧随其后的 click 一并吞掉：表现为**手机上点按钮毫无反应**，而桌面鼠标正常。
 * 故必须区分「指针仍按着时离开」（真取消）与「指针已抬起后补发的离开」（不是取消）。
 */
let isPressActive = false;

/** 按下：holdable 时启动长按计时，达到阈值进入持续态并派发 hold-start */
const handlePointerDown = (event: PointerEvent) => {
  // 仅响应主指针左键：右键/副指针长按不应触发持续态
  if (event.button !== 0 || !event.isPrimary) return;
  // 新按压开始即清除上一次遗留的抑制标志（长按后指针滑出按钮、浏览器不派发 click 时，标志会滞留）
  suppressClick = false;
  if (!holdable || disabled || loading) return;
  isPressActive = true;
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
  isPressActive = false;
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
  // 本次按压已结算过（典型：pointerup 之后补发的 pointerleave，见 isPressActive 注释）：
  // 重复结算不仅无意义，还会把「已松手」误判成「按住时滑出」，顺手吞掉正常轻点的 click
  if (!isPressActive) return;
  // 多指触摸下第二指的 up/leave/cancel 也会派发回本按钮（触摸隐式捕获）：
  // 仅允许发起长按的那个指针结束本次序列，避免提前打断第一指的长按/持续态
  if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  activePointerId = null;
  isPressActive = false;
  if (isHolding) {
    isHolding = false;
    suppressClick = true;
    emit('hold-end');
  } else if (cancelled) suppressClick = true;
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
  if (holdable)
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

  emit('click', e);
};

type ThemeType = ThemeColor;

const slots = useSlots();
const resolvedColor = computed<ThemeType>(() => color ?? 'neutral');

/** 是否传入了默认插槽内容 */
const hasDefaultSlot = computed(() => Boolean(slots['default']));
/** 统一解析主图标（兼容 prefixIcon 历史别名） */
const resolvedIcon = computed<IconName | undefined>(() => icon ?? prefixIcon);
/** 是否有文案内容（默认插槽或 label），决定 icon 属性是作前缀还是主体 */
const hasText = computed(() => hasDefaultSlot.value || Boolean(label));

/** 悬停提示：显式 title > label > 默认插槽纯文本 */
const resolvedTitle = computed(() => resolveTextTitle(title, label, slots['default']?.() ?? []));
/** 图标主体态：显式 iconOnly，或主图标且无文案（图标即整个按钮主体） */
const isIconOnly = computed(() => iconOnly || (Boolean(resolvedIcon.value) && !hasText.value));

/**
 * 按钮尺寸 → 图标尺寸档位的**显式映射**。
 * 严禁再写 `iconSize ?? size`：组件尺寸（ComponentSize）与图标尺寸（IconSizePreset）是两套语义，
 * 二者档位名重合只是巧合，直接透传会在尺寸档位变动时静默降级为无效 CSS。
 */
const ICON_SIZE_BY_BUTTON_SIZE: Record<ComponentSize, IconSizePreset> = { sm: 'sm', md: 'md', lg: 'xl' };
// `size` 运行时来自 props，TS 的联合类型拦不住模板里的动态绑定 —— 裸查表会把 `constructor`
// 这类继承键命中成 `Object`（truthy，`?? 'md'` 兜不住）。只看自身属性。
const resolvedIconSize = computed<IconSizeValue>(
  () => iconSize ?? (hasOwn(ICON_SIZE_BY_BUTTON_SIZE, size) ? ICON_SIZE_BY_BUTTON_SIZE[size] : 'md')
);

// 仅在开发环境中注册 a11y 警告监听，生产环境构建时被完全 Tree-shaking
if (import.meta.env.DEV)
  watch(
    () => [isIconOnly.value, ariaLabel] as const,
    ([io, label]) => {
      if (io && !label)
        console.warn('[ActionButton] iconOnly 为 true 时应传入 ariaLabel，否则屏幕阅读器无法识别该按钮。');
    },
    { immediate: true }
  );

const sizeClasses = computed(() => {
  if (isIconOnly.value) {
    // iconOnly 走 BUTTON_ICON_ONLY_SIZE_MAP（内含 p-0! 强制方形无内边距），compacted 不再叠加；
    // iconInset='sm' 时再补 p-1.5!：两者同为 important，由 Tailwind 的刻度顺序决定（1.5 在 0 之后）生效
    const base = BUTTON_ICON_ONLY_SIZE_MAP[size] ?? BUTTON_ICON_ONLY_SIZE_MAP['md'];
    return iconInset === 'sm' ? [base, 'p-1.5!'] : base;
  }

  const map = compacted ? BUTTON_COMPACTED_SIZE_MAP : BUTTON_SIZE_MAP;
  return map[size] ?? map['md'];
});

const loaderSizeClass = computed(() => BUTTON_LOADER_SIZE_MAP[size] ?? BUTTON_LOADER_SIZE_MAP['md']);
const roundedClasses = computed(() => BUTTON_ROUNDED_MAP[rounded] ?? BUTTON_ROUNDED_MAP['full']);

/**
 * 外观档色板 + 该档的禁用列。禁用列**必须跟着外观档走**：有填充面的档（default / subtle）
 * 走令牌三件套，透明底的档（ghost / text）只收前景色，理由见 BUTTON_DISABLED_THEME_MAP 的注释。
 * 类名一律以完整字面量出现，供 Tailwind 静态扫描。
 */
const themeAppearanceClasses = computed(() => {
  const disabled = BUTTON_DISABLED_THEME_MAP[appearance] ?? BUTTON_DISABLED_THEME_MAP.default;
  // 语义色查表一律带中性档兜底：`color` 是运行时值，TS 联合拦不住调用方写下的**过期字面量**
  // （本仓把语义色首档由 `default` 更名为 `neutral` 时，`isOpen ? 'primary' : 'default'` 这类
  // 动态绑定就曾整条落空 —— 前景色类消失，按钮只剩继承色，看着比邻座亮一档）。
  const tint = resolvedColor.value;

  if (appearance === 'ghost')
    return `bg-transparent border-transparent ${BUTTON_GHOST_THEME_MAP[tint] ?? BUTTON_GHOST_THEME_MAP.neutral} ${disabled}`;

  if (appearance === 'subtle') return `${BUTTON_SUBTLE_THEME_MAP[tint] ?? BUTTON_SUBTLE_THEME_MAP.neutral} ${disabled}`;

  if (appearance === 'text')
    // 紧凑模式下进一步收紧文字按钮的左右内边距（类名必须以完整字面量出现，供 Tailwind 静态扫描）
    return `${compacted ? 'px-[0.15rem]' : 'px-[0.3rem]'} bg-transparent! border-transparent active:enabled:border-primary ${BUTTON_TEXT_THEME_MAP[tint] ?? BUTTON_TEXT_THEME_MAP.neutral} ${disabled}`;

  return `${BUTTON_DEFAULT_THEME_MAP[tint] ?? BUTTON_DEFAULT_THEME_MAP.neutral} ${disabled}`;
});

const normalizedStyle = computed(() => {
  const style: Record<string, string> = {};
  if (width !== undefined) style['width'] = isNumber(width) ? `${width}px` : width;
  if (height !== undefined) style['height'] = isNumber(height) ? `${height}px` : height;

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
@use '@/assets/token-vars' as *;

.action-button {
  transition-duration: $duration-fast;
  transition-property:
    color, background-color, border-color, box-shadow, filter, opacity, transform, translate, scale, rotate;
  transition-timing-function: $bezier-standard;
}
</style>
