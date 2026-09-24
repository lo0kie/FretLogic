<template>
  <button
    :name
    :aria-busy="isCurrentLoading || undefined"
    :aria-checked="isChecked"
    :aria-disabled="disabled || isCurrentLoading"
    :aria-label="ariaLabel || label"
    :class="{ 'cursor-grabbing': isDragging }"
    :disabled="disabled || isCurrentLoading"
    :id="resolvedId"
    @click="handleClick()"
    @pointercancel="handlePointerCancel($event)"
    @pointerdown="handlePointerDown($event)"
    @pointermove="handlePointerMove($event)"
    @pointerup="handlePointerUp($event)"
    data-focusable-outline
    class="group m-0 inline-flex cursor-pointer touch-none items-center gap-sm rounded-full border-none bg-transparent p-0 align-middle outline-none select-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    ref="switchBtnRef"
    role="switch"
    type="button"
  >
    <span
      v-wave="{ disabled: disabled || isCurrentLoading }"
      :class="[currentConfig.trackClass, trackColorClass]"
      class="switch-track relative inline-flex shrink-0 items-center overflow-hidden rounded-full transition-all duration-base"
      ref="trackRef"
    >
      <!-- 开/关读数文字：轨道是**常规强调色**实心底，故墨色取 --text-on-accent 深墨，
           不取 --text-on-solid —— 白字的授权范围只到「压深到白字过 AA 的实心档」（bg-<色>-solid），
           配常规强调色先天不够（success 2.22 / warning 2.20 连图形下限 3:1 都不保，本滑槽是文字、要 4.5:1）。
           深墨在五个强调色 × 三主题上全部过 AA，这条口径由 colorTokens.test.ts 常驻执行。
           当前该插槽零消费方：若将来要启用，轨道得同步换成实心档才能改用白字。 -->
      <span
        v-if="$slots['checked-text'] || $slots['unchecked-text']"
        :class="isChecked ? 'justify-start' : 'justify-end'"
        class="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1.5 text-2xs leading-none font-bold text-fg-on-accent select-none"
      >
        <span class="inline-block max-w-[calc(100%-1.1rem)] truncate">
          <slot v-if="isChecked" name="checked-text" />
          <slot v-else name="unchecked-text" />
        </span>
      </span>

      <span
        :class="[
          currentConfig.thumbClass,
          !isDragging && (isChecked ? currentConfig.checkedClass : 'translate-x-0'),
          isPressed && !isDragging && !hasMovedSignificantly && 'scale-y-[0.82]',
        ]"
        :style="dragThumbStyle"
        class="switch-thumb pointer-events-none inline-flex items-center justify-center rounded-full bg-(--switch-thumb-bg) shadow-(--switch-thumb-shadow) transition-transform duration-base ease-spring"
        ref="thumbRef"
      >
        <slot v-if="isChecked" name="checked-icon" />
        <slot v-else name="unchecked-icon" />

        <svg
          v-if="isCurrentLoading"
          :height="currentConfig.spinnerSize"
          :width="currentConfig.spinnerSize"
          aria-hidden="true"
          class="animate-spin text-primary"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            :stroke-width="3"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-dasharray="47 17"
            stroke-linecap="round"
          />
        </svg>
      </span>
    </span>

    <span
      v-if="label || $slots['default']"
      @pointerdown="handleLabelPointerDown($event)"
      class="switch-label text-xs leading-none font-medium text-fg-body"
    >
      <slot> {{ label }} </slot>
    </span>
  </button>
</template>

<script setup generic="T extends string | number | boolean = boolean" lang="ts">
import { computed, inject, ref, useId, useTemplateRef } from 'vue';

import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { useFormRowControlId, useFormRowLabelPress } from '@/platform/ui/form/formRowContext';
import { clamp } from '@/platform/utils/common';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';

const modelValue = defineModel<T>({ required: true });

const loadingModel = defineModel<boolean>('loading', { default: false });

const props = withDefaults(
  defineProps<{
    /** 尺寸档位：sm/md/lg */
    size?: ComponentSize;
    /** 激活态轨道配色主题（primary/success/danger/warning） */
    color?: 'primary' | 'success' | 'danger' | 'warning' | (string & {});
    /** 禁用开关，不可点击与拖拽 */
    disabled?: boolean;
    /** 加载中：拇指显示旋转 spinner 并禁止切换 */
    loading?: boolean;
    /** 原生表单 name 属性 */
    name?: string;
    /** 开关右侧的文字标签 */
    label?: string;
    /** 原生 id，不传时自动生成 */
    id?: string;
    /** 无障碍标签（缺省回退到 label） */
    ariaLabel?: string;
    /**
     * 以下三项用 NoInfer 挡住推断：T 的唯一推断源应当是 v-model 的绑值。
     * 否则调用方传字面量（如 `active-value="on"`）时，TS 会在「模型值类型」与「字面量」
     * 之间取公共父类型，把 T 从模型值拽宽，写回的 update 事件也随之失去精度。
     * 挡掉之后 T 恒等于模型值类型，这三项仍按 T 做赋值校验，只是不再影响推断。
     */
    /** 激活时的值，默认 true */
    activeValue?: NoInfer<T>;
    /** 关闭时的值，默认 false */
    inactiveValue?: NoInfer<T>;
    /** 切换前拦截钩子：返回 false（或抛错）阻止本次变更，等待期间显示 loading */
    beforeChange?: NoInfer<(val: T) => boolean | Promise<boolean>>;
  }>(),
  {
    size: undefined,
    color: 'primary',
    disabled: false,
    loading: false,
  }
);

const emit = defineEmits<{
  (e: 'change', value: T): void;
}>();

/**
 * 轨道配色的悬停档一律取令牌、不让引擎现算：
 *  - on（实心强调色）取 --color-lift-<色>-10（语义色与纯白 10% 混合，口径见 tokens/lift.ts）；
 *  - off（中性底 --border-base）取 --color-shade-borderbase-12（与纯黑 12% 混合，口径见 tokens/shade.ts）。
 * 二者都以绝对色（白 / 黑）为锚点，故亮色与暗色主题下方向一致——on 一律更亮、off 一律更深。
 * 原先是 `group-hover:brightness-105 / 95`：滤镜现算使产物色值不可审查、上不了对比度门禁。
 *
 * group-disabled 段不可省：:hover 在 disabled 的 button 上仍会命中，少了它，禁用开关被指针划过
 * 依旧会变色，观感上像是可交互的。
 */
const COLOR_CLASS: Record<string, { on: string; off: string }> = {
  primary: {
    on: 'bg-primary group-hover:bg-lift-primary-10 group-disabled:bg-primary',
    off: 'bg-border-base group-hover:bg-shade-borderbase-12 group-disabled:bg-border-base',
  },
  success: {
    on: 'bg-success group-hover:bg-lift-success-10 group-disabled:bg-success',
    off: 'bg-border-base group-hover:bg-shade-borderbase-12 group-disabled:bg-border-base',
  },
  danger: {
    on: 'bg-danger group-hover:bg-lift-danger-10 group-disabled:bg-danger',
    off: 'bg-border-base group-hover:bg-shade-borderbase-12 group-disabled:bg-border-base',
  },
  warning: {
    on: 'bg-warning group-hover:bg-lift-warning-10 group-disabled:bg-warning',
    off: 'bg-border-base group-hover:bg-shade-borderbase-12 group-disabled:bg-border-base',
  },
};

const SWITCH_CONFIG: Record<
  'sm' | 'md' | 'lg',
  {
    trackClass: string;
    thumbClass: string;
    checkedClass: string;
    travelPx: number;
    spinnerSize: number;
  }
> = {
  sm: {
    trackClass: 'h-4 w-7 p-0.5',
    thumbClass: 'h-3 w-3',
    checkedClass: 'translate-x-3',
    travelPx: 12,
    spinnerSize: 9,
  },
  md: {
    trackClass: 'h-5 w-9 p-0.5',
    thumbClass: 'h-4 w-4',
    checkedClass: 'translate-x-4',
    travelPx: 16,
    spinnerSize: 11,
  },
  lg: {
    trackClass: 'h-6 w-11 p-0.5',
    thumbClass: 'h-5 w-5',
    checkedClass: 'translate-x-5',
    travelPx: 20,
    spinnerSize: 13,
  },
};

/** 未显式给 active/inactiveValue 时按布尔开关语义取值。调用方用非布尔模型值时必须成对给出这两个 prop——
 *  「T 含 boolean 时才可省略」类型层无从表达，断言集中在此一处 */
const DEFAULT_ACTIVE_VALUE = true as unknown as T;
const DEFAULT_INACTIVE_VALUE = false as unknown as T;

const resolvedActiveValue = computed<T>(() => props.activeValue ?? DEFAULT_ACTIVE_VALUE);
const resolvedInactiveValue = computed<T>(() => props.inactiveValue ?? DEFAULT_INACTIVE_VALUE);

const autoId = useId();
const resolvedId = computed(() => props.id || autoId);
// 上报切换按钮（button 属可标签化元素）的 id 给所在 BaseFormRow：行的 label 据此输出 for
useFormRowControlId(() => resolvedId.value);

const switchBtnRef = useTemplateRef<HTMLButtonElement>('switchBtnRef');
const trackRef = useTemplateRef<HTMLElement>('trackRef');
const thumbRef = useTemplateRef<HTMLElement>('thumbRef');

/**
 * 标签按下委托：点所在行的标签时，把波纹补在轨道上（口径见 formRowContext ③）。
 *
 * 缺口成因：行标签的 for 指向本组件的 <button>，而波纹元素是按钮**内部**的轨道。标签的激活行为
 * 只在按钮上派发一次合成 click，事件自按钮向**上**冒泡，永远到不了按钮内部的轨道；波纹指令的
 * 点击监听又只挂在所在元素上 —— 于是「点按钮有波纹、点标签没有」，同一个动作两条入口两种反馈。
 *
 * 补法刻意复用指令**给键盘 / 合成激活预留的那条分支**：派发一个 detail=0 且不冒泡的 click。
 * 指令的 click 监听只认 detail===0（真指针点击走 pointerdown，不进这条），命中后以元素中心为
 * 圆心、不等抬起 —— 正是「拿不到指针坐标时」的口径，故此处不传坐标：指针落在标签上，
 * 拿标签坐标当圆心只会把波纹甩到轨道盒外。
 *
 * 不冒泡是硬要求：冒泡会撞上外层按钮自己的 @click，等于替用户多点了一次开关 —— 两次切换让值回到
 * 原处，肉眼就是「点标签没反应」（tests/ui/form/formRowWaveDelegation.test.ts 钉住了这一条）。
 * 同理不能用 el.click()（它固定冒泡）。禁用 / 加载中的判定仍由指令内部的 wave() 负责，
 * 与本组件对直接点击的守卫同源，无需在此重复。
 *
 * 不传 selfActivating：激活本身由浏览器经 label 的 for 完成，本项只负责补波纹（缺省即
 * 「行标签是真 <label> 时才委托」）。本组件 <button> 上的原生 @click 在收到这次激活时会正常
 * 切换值 —— 波纹与切换是两个层次，互不兼任。
 */
useFormRowLabelPress(() => void trackRef.value?.dispatchEvent(new MouseEvent('click', { bubbles: false })));

/**
 * 自身的文字标签（`label` prop / 默认插槽）同样是激活入口 —— 它在 `<button>` 内、与轨道是兄弟节点，
 * 点文字即可切换（click 冒泡到按钮），但波纹元素只有轨道那一小块 ⇒ 点文字没有波纹。
 * 与行标签的缺口同源、补法相同：往轨道补一个 detail=0 且不冒泡的合成 click（口径见 formRowContext ③）。
 *
 * 不冒泡在这里同样是硬要求：合成 click 一旦冒泡就会撞上按钮自己的 @click，等于替用户多点一次开关 ——
 * 两次切换让值回到原处，肉眼就是「点标签没反应」（tests/ui/form/formRowWaveDelegation.test.ts 钉住）。
 *
 * 无需「跳过落在轨道上的按压」：本处理器挂在标签自身，而轨道是它的兄弟节点、指针不可能落在其中 ——
 * 真按在轨道上的那条路径由指令自己的 pointerdown 监听负责。（和 BaseCheckbox 那处的差别就在这里：
 * 它的处理器挂在外层 `<label>`，那个元素**包着**勾选框，故必须显式跳过。）
 * 禁用 / 加载中的判定仍由指令内部的 wave() 负责，与本组件对直接点击的守卫同源。
 */
const handleLabelPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  trackRef.value?.dispatchEvent(new MouseEvent('click', { bubbles: false }));
};

const isDragging = ref(false);
const isPressed = ref(false);
const isPending = ref(false);
const dragOffset = ref(0);

// 手势生命周期中间变量：仅在 pointerdown -> pointerup 期间通过局部状态追踪，无需全局响应式追踪
let dragStartX = 0;
let startValue = false;
let maxTravelDistance = 16;
let pressBasePos = 0;
let hasMovedSignificantly = false;

const isCurrentLoading = computed(() => props.loading || loadingModel.value || isPending.value);

const isChecked = computed(() => Object.is(modelValue.value, resolvedActiveValue.value));

// 尺寸解析：行内 props > BaseForm 注入上下文 > 默认 md
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => props.size ?? controlContext?.size ?? 'md');

const currentConfig = computed(() => SWITCH_CONFIG[resolvedSize.value] ?? SWITCH_CONFIG.md);

const isDragPastHalf = computed(() => {
  if (!isDragging.value) return null;
  const initialPos = startValue ? maxTravelDistance : 0;
  const clampedX = clamp(initialPos + dragOffset.value, 0, maxTravelDistance);
  return clampedX >= maxTravelDistance * 0.5;
});

const trackColorClass = computed(() => {
  const on = isDragPastHalf.value ?? isChecked.value;
  const palette = (COLOR_CLASS[props.color] ?? COLOR_CLASS['primary'])!;
  return on ? palette.on : palette.off;
});

/**
 * 结算一次切换（点击 / 拖拽共用单一真源）：统一走 beforeChange 拦截；返回 false 或抛错则阻止变更并返回 false，
 * 通过后写回 model 并派发 change、返回 true。避免两路各自维护一份导致行为分歧。
 */
const settleChange = async (nextVal: T): Promise<boolean> => {
  if (props.beforeChange) {
    isPending.value = true;
    loadingModel.value = true;
    try {
      const allowed = await props.beforeChange(nextVal);
      if (!allowed) return false;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[BaseSwitch] beforeChange 抛错，已阻止本次切换。', err);

      return false;
    } finally {
      isPending.value = false;
      loadingModel.value = false;
    }
  }
  modelValue.value = nextVal;
  emit('change', nextVal);
  return true;
};

/** 切换开关（键盘/点击统一由 handleClick 收敛，源于原生 button 的 Enter/Space click） */
const toggle = async () => {
  if (props.disabled || isCurrentLoading.value) return;
  const nextChecked = !isChecked.value;
  const nextVal = nextChecked ? resolvedActiveValue.value : resolvedInactiveValue.value;
  await settleChange(nextVal);
};

/** 点击切换：刚拖拽过则吞掉本次 click（拖拽结果已在 pointerup 按落点结算） */
const handleClick = () => {
  if (hasMovedSignificantly) {
    hasMovedSignificantly = false;
    return;
  }
  toggle();
};

/** 按下：实测滑轨行程并记录拖拽起点与按压缩放状态 */
const handlePointerDown = (e: PointerEvent) => {
  if (props.disabled || isCurrentLoading.value || e.button !== 0) return;

  if (trackRef.value && thumbRef.value) {
    const style = window.getComputedStyle(trackRef.value);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const calculatedTravel = trackRef.value.clientWidth - thumbRef.value.offsetWidth - (padLeft + padRight);
    maxTravelDistance = Math.max(0, calculatedTravel);
  } else maxTravelDistance = currentConfig.value.travelPx;

  pressBasePos = isChecked.value ? maxTravelDistance : 0;
  dragStartX = e.clientX;
  dragOffset.value = 0;
  startValue = isChecked.value;
  hasMovedSignificantly = false;
  isPressed.value = true;
  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
};

/** 拖拽中：跟踪横向位移，超过阈值进入拖拽态 */
const handlePointerMove = (e: PointerEvent) => {
  // 禁用/加载中不参与拖拽：pointer 事件在 disabled 按钮上仍会派发（与 mouse 事件不同），
  // 且此场景下 dragStartX 未被 pointerdown 初始化（保持 0），不拦截会把巨大位移误判为拖拽
  if (props.disabled || isCurrentLoading.value) return;
  if (e.buttons === 0) {
    if (isDragging.value) {
      isDragging.value = false;
      dragOffset.value = 0;
    }
    return;
  }
  // 未经过本组件 pointerdown 的按压（如在别处按下拖入）：无有效起点，忽略
  if (!isPressed.value) return;
  const deltaX = e.clientX - dragStartX;
  dragOffset.value = deltaX;
  if (!isDragging.value && Math.abs(deltaX) > 4) {
    isDragging.value = true;
    hasMovedSignificantly = true;
  }
};

/** 松开：按落点是否过半结算开关值（同样走 beforeChange 拦截） */
const handlePointerUp = async (e: PointerEvent) => {
  const wasDragging = isDragging.value;
  const deltaX = dragOffset.value;
  // 提前复位拖拽/按压态是刻意的时序：若 beforeChange 拒绝或抛错，
  // 滑块依赖 isDragging=false + isChecked 未变 的过渡类自动弹回原位，而非停留在拖拽中间态
  isDragging.value = false;
  isPressed.value = false;
  dragOffset.value = 0;

  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }

  // 禁用/加载中禁止结算：拖拽态可能由指针拖入产生，不得改值
  if (props.disabled || isCurrentLoading.value) return;

  if (wasDragging && hasMovedSignificantly) {
    const initialPos = startValue ? maxTravelDistance : 0;
    const targetPos = clamp(initialPos + deltaX, 0, maxTravelDistance);
    const finalChecked = targetPos >= maxTravelDistance * 0.5;

    if (finalChecked !== isChecked.value) {
      const nextVal = finalChecked ? resolvedActiveValue.value : resolvedInactiveValue.value;
      await settleChange(nextVal);
    }
  }
};

/** 指针取消：仅复位拖拽/按压状态，不改变开关值 */
const handlePointerCancel = (e: PointerEvent) => {
  isDragging.value = false;
  isPressed.value = false;
  dragOffset.value = 0;
  try {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
  } catch {
    // ignore
  }
};

const dragThumbStyle = computed(() => {
  if (isDragging.value) {
    const deltaX = dragOffset.value;
    const initialPos = pressBasePos;
    const clampedX = clamp(initialPos + deltaX, 0, maxTravelDistance);

    const dir = deltaX >= 0 ? 1 : -1;
    const travelRatio = maxTravelDistance > 0 ? Math.min(Math.abs(deltaX) / maxTravelDistance, 1) : 0;

    // 拇指直径复用 travelPx 单一真源：SWITCH_CONFIG 构造上 travelPx === 拇指尺寸
    // （track 宽 - 拇指 - 两侧 p-0.5），无需再维护一份 THUMB_PX 硬编码
    const thumbSize = currentConfig.value.travelPx;
    const desiredStretch = 1 + travelRatio * 0.18;
    const desiredSqueeze = 1 - travelRatio * 0.08;

    const remainingSpace = dir > 0 ? maxTravelDistance - clampedX : clampedX;
    const maxAllowedStretch = thumbSize > 0 ? 1 + Math.max(0, remainingSpace) / thumbSize : desiredStretch;

    const stretch = Math.min(desiredStretch, maxAllowedStretch);

    return {
      transform: `translateX(${clampedX}px) scaleX(${stretch}) scaleY(${desiredSqueeze})`,
      transformOrigin: dir > 0 ? 'left center' : 'right center',
      transition: 'none',
    };
  }
  return {};
});
</script>
