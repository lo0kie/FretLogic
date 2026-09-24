<template>
  <!-- buttonized：直接用 ActionButton 渲染（勾选=subtle 浅主色高亮、未勾选=ghost），
       复用其原生 button 的 mousedown 聚焦/键盘/禁用语义；点击驱动 toggle -->
  <ActionButton
    v-if="buttonized"
    :disabled
    :icon
    :icon-only
    :label
    :size
    :aria-checked="ariaCheckedState"
    :aria-disabled="disabled || undefined"
    :aria-label="ariaLabel || label"
    :color="isChecked && !indeterminate ? color : 'default'"
    :variant="isChecked && !indeterminate ? 'subtle' : 'ghost'"
    @click="toggle()"
    class="base-checkbox"
    icon-size="lg"
    role="checkbox"
  >
    <slot>{{ label }}</slot>
  </ActionButton>

  <label
    v-else
    :class="[
      sizeConfig.containerClass,
      hasDescription ? 'items-start' : 'items-center',
      {
        'cursor-not-allowed opacity-50': disabled,
        'cursor-pointer': !disabled && !readonly,
        'rounded-lg border border-border-base p-2.5 hover:bg-surface-panel-hover': bordered,
        'bg-surface-panel-subtle': bordered && isChecked,
      },
    ]"
    :for="resolvedId"
    @pointerdown="handleSelfPointerDown($event)"
    class="base-checkbox group relative inline-flex transition-colors duration-fast select-none"
  >
    <input
      :aria-describedby
      :name
      :required
      :value
      :aria-checked="ariaCheckedState"
      :aria-disabled="disabled || undefined"
      :aria-label="ariaLabel || label"
      :aria-readonly="readonly || undefined"
      :checked="isChecked"
      :disabled="disabled || undefined"
      :id="resolvedId"
      @blur="emit('blur', $event)"
      @change="toggle()"
      @focus="emit('focus', $event)"
      class="peer sr-only"
      ref="inputRef"
      type="checkbox"
    />

    <span
      v-wave="{ disabled: disabled || readonly }"
      :class="[
        sizeConfig.boxClass,
        hasDescription ? 'mt-0.5' : '',
        isChecked || indeterminate ? colorConfig.checkedClass : colorConfig.uncheckedClass,
      ]"
      aria-hidden="true"
      class="checkbox-box relative inline-flex shrink-0 items-center justify-center transition-all duration-fast"
      ref="boxRef"
    >
      <!-- 勾选 / 半选图标：**单枚常驻 BaseIcon**，名字由状态派生 —— 半选 ↔ 勾选是同一个实例改名，
           BaseIcon 里 watch(name) 驱动的形变才会触发。原先写成两支 v-if 各带一枚 BaseIcon：
           Vue 3.5 会给 v-if/v-else-if 分支注入隐式 key（key: 0 / key: 1），两态切换是卸载再挂载、
           name 从未变化 ⇒ 形变引擎永远看不到这次变化（与 MenuItems 前导槽同一形态）。
           两个具名插槽仍是覆盖入口：插槽内容由调用方提供、无从配对，故各自独立成支，
           命中插槽时按老路渲染、不参与形变。 -->
      <slot v-if="indeterminate && $slots['indeterminate-icon']" name="indeterminate-icon" />

      <slot v-else-if="isChecked && !indeterminate && $slots['icon']" name="icon" />

      <BaseIcon
        v-else-if="indicatorIcon"
        :icon-size="sizeConfig.iconSize"
        :name="indicatorIcon"
        class="scale-100 transition-transform duration-fast"
      />
    </span>

    <div
      v-if="label || description || $slots['default'] || $slots['description']"
      :class="sizeConfig.labelWrapperClass"
      class="checkbox-content flex min-w-0 flex-col justify-center"
    >
      <span
        v-if="label || $slots['default']"
        :class="[
          sizeConfig.labelClass,
          isChecked ? 'font-medium text-fg-title' : 'text-fg-body',
          hasDescription ? 'leading-tight' : 'leading-none',
        ]"
        class="checkbox-label transition-colors duration-fast"
      >
        <slot>{{ label }}</slot>
      </span>

      <span
        v-if="description || $slots['description']"
        :class="sizeConfig.descriptionClass"
        class="checkbox-description text-fg-description mt-0.5 leading-normal"
      >
        <slot name="description">{{ description }}</slot>
      </span>
    </div>
  </label>
</template>

<script setup lang="ts">
import { computed, ref, useId, useSlots, useTemplateRef } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { useFormRowControlId, useFormRowLabelPress } from '@/platform/ui/form/formRowContext';
import { ICON_SIZE_PRESETS } from '@/platform/ui/icons/iconSizes';

import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';

export interface BaseCheckboxProps {
  /** 当绑定为数组/集合时的选项自身值，或表单 value */
  value?: unknown;
  /** 选中时的映射值（默认 true） */
  trueValue?: unknown;
  /** 未选中时的映射值（默认 false） */
  falseValue?: unknown;
  /** 禁用交互 */
  disabled?: boolean;
  /** 只读状态（保留视觉但不可交互） */
  readonly?: boolean;
  /** 表单必填 */
  required?: boolean;
  /** 原生 name 属性 */
  name?: string;
  /** 元素 ID，默认自动生成全局唯一 ID */
  id?: string;
  /** 复选框标题文本 */
  label?: string;
  /** 标题下方的辅助说明文案 */
  description?: string;
  /** 尺寸大小 */
  size?: ComponentSize;
  /** 主题色风格 */
  color?: 'primary' | 'success' | 'warning' | 'danger';
  /** 是否以带边框卡片形式展示 */
  bordered?: boolean;
  /** 按钮化：隐藏勾选框，渲染为方形/胶囊高亮按钮（选中=主色浅底、未选=幽灵按钮），保留 checkbox 语义与点击切换 */
  buttonized?: boolean;
  /** buttonized 形态前缀图标（注册表枚举），颜色随选中态前景色 */
  icon?: IconName;
  /** buttonized 形态为 icon-only（无 label/默认插槽文本时自动开启；方形等宽） */
  iconOnly?: boolean;
  /** 无障碍描述文字 */
  ariaLabel?: string;
  /** 无障碍关联描述元素 ID */
  ariaDescribedby?: string;
}

const modelValue = defineModel<unknown>({ default: undefined });

const indeterminate = defineModel<boolean>('indeterminate', { default: false });

const {
  value = undefined,
  trueValue = undefined,
  falseValue = undefined,
  disabled = false,
  readonly = false,
  required = false,
  name = undefined,
  id = undefined,
  label = undefined,
  description = undefined,
  size = 'md',
  color = 'primary',
  bordered = false,
  buttonized = false,
  icon = undefined,
  iconOnly = false,
  ariaLabel = undefined,
  ariaDescribedby = undefined,
} = defineProps<BaseCheckboxProps>();

const emit = defineEmits<{
  (e: 'change', checked: boolean, value: unknown): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();
const slots = useSlots();
const hasDescription = computed(() => Boolean(description || slots['description']));

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
/** 勾选框（非 buttonized 形态的波纹元素）；buttonized 形态渲染的是 ActionButton，此处恒为空 */
const boxRef = useTemplateRef<HTMLSpanElement>('boxRef');
const generatedId = useId();
const resolvedId = computed(() => id || generatedId);
/** 是否自带标签文案（label prop 或默认插槽）——决定它能否自我命名 */
const hasOwnLabelText = computed(() => Boolean(label || slots['default']));

/**
 * 上报原生 checkbox 的 id 给所在 BaseFormRow：行的 label 据此输出 for。两种情形不上报
 * （行标签随之降级为 span、不输出 for）：
 *  - buttonized：渲染的是 ActionButton（role=checkbox，非可标签化元素），行的 for 指不到会悬空；
 *  - 自身已有标签文案：控件用 <label for> 包着 input 自我命名，若行的 label 再指向同一个 input，
 *    无障碍名会按树序拼接成「行标签 + 自身标签」，读屏把同一件事念两遍。此时行标签只是分组名，
 *    名字交给控件自身更准。
 * 只有「裸复选框」（无自身文案、行内仅一个勾选框）才依赖行的 for 取得无障碍名。
 */
const shouldReportIdToRow = computed(() => !buttonized && !hasOwnLabelText.value);
useFormRowControlId(() => (shouldReportIdToRow.value ? resolvedId.value : undefined));

/**
 * 标签按下委托：点所在行的标签时，把波纹补在勾选框上（口径见 formRowContext ③）。
 *
 * 缺口成因与 BaseSwitch 同构：行标签的 for 指向的是原生 <input>，而波纹元素是与它**兄弟**的
 * 勾选框 span。标签的激活行为只在 input 上派发一次合成 click，事件自 input 向上冒泡，
 * 到不了旁边那个 span —— 点勾选框有波纹，点行标签没有。
 *
 * 补法是复用指令给键盘 / 合成激活预留的分支：一个 detail=0 且不冒泡的 click。指令的 click 监听
 * 只认 detail===0，命中后以元素中心为圆心、不等抬起（拿不到指针坐标时的口径），故不传坐标。
 * 不冒泡同样是硬要求：冒泡会经由外层 <label> 触达 input 的 change，等于替用户多点了一次。
 * 不能用 el.click()（它固定冒泡）。buttonized 形态下 boxRef 为空，回调自然空转；
 * 那种形态本就不上报 id、行标签退化为 span、点它激活不了控件，行也不会来调（见 labelTag 与
 * shouldReportIdToRow）。
 *
 * 不传 selfActivating：激活本身由浏览器经 label 的 for 完成，本项只负责补波纹（缺省即
 * 「行标签是真 <label> 时才委托」）—— 而自带文案的复选框根本不上报 id（行标签无 for，见
 * shouldReportIdToRow），那种形态下点行标签激活不了控件，行也就不会委托过来，正好自动排除。
 */
useFormRowLabelPress(() => void boxRef.value?.dispatchEvent(new MouseEvent('click', { bubbles: false })));

/**
 * 自身的文字标签（`label` prop / 默认插槽，如弹窗头部的「全选」）同样是激活入口 —— 它与勾选框同在
 * 本组件的 <label> 内，点文字即可勾选，但波纹元素只有勾选框那一小块，文字是兄弟节点 ⇒ 点文字没有波纹。
 * 与行标签的缺口同源、补法相同：往波纹元素补一个 detail=0 且不冒泡的合成 click（口径见 ③）。
 *
 * 落在勾选框上的按压**跳过**：那条路径由指令自己的 pointerdown 监听负责，再补一次会放出两圈波纹
 * （外层 label 会收到来自勾选框的冒泡事件）。禁用 / 只读的判定仍由指令内部的 wave() 负责。
 */
const handleSelfPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  if (boxRef.value?.contains(event.target as Node)) return;
  boxRef.value?.dispatchEvent(new MouseEvent('click', { bubbles: false }));
};

const resolvedTrueValue = computed(() => (trueValue !== undefined ? trueValue : true));
const resolvedFalseValue = computed(() => (falseValue !== undefined ? falseValue : false));

/** 内部非受控备用状态（当未传 v-model 时保证组件自身可独立交互） */
const innerChecked = ref(false);

/**
 * 受控 / 非受控契约：`modelValue === undefined` 视为「未绑定 v-model」→ 组件自管内部态。
 * 注意：因此绑定值**不可有意用 undefined 承接**（例如 `v-model="obj.maybeUndefinedField"` 且字段恰为
 * undefined 时会静默切到内部态，与外部脱节）；需占位请用 null 或具体空值。此语义为固有设计权衡。
 */

const SIZE_CONFIGS = {
  sm: {
    containerClass: 'gap-1.5',
    boxClass: 'h-3.5 w-3.5 rounded-[3px]',
    iconSize: ICON_SIZE_PRESETS.md,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-xs',
    descriptionClass: 'text-2xs',
  },
  md: {
    containerClass: 'gap-2',
    boxClass: 'h-4 w-4 rounded-sm',
    iconSize: ICON_SIZE_PRESETS.lg,
    labelWrapperClass: 'ml-0.5',
    labelClass: 'text-sm',
    descriptionClass: 'text-xs',
  },
  lg: {
    containerClass: 'gap-2.5',
    boxClass: 'h-5 w-5 rounded-md',
    iconSize: ICON_SIZE_PRESETS.xl,
    labelWrapperClass: 'ml-1',
    labelClass: 'text-base',
    descriptionClass: 'text-sm',
  },
} as const;

/**
 * 勾选态走「实心强调色底 + 实心档上的浅色字」（`--text-on-solid`）—— 这是勾选控件的通用形态：
 * 勾选必须一眼可辨，浅底浅勾与未选中态同属浅色系、会糊在一起（看上去像没有选中）。
 * 此前一度改成浅底，是因为当时令牌集里**没有**「实心底 + 浅字」这一档，只能落到 --text-on-accent
 * 的深墨，而深墨压饱和色正是要消掉的眩光。
 *
 * ⚠️ 底色一律取 `bg-<色>-solid`（压深到白字过 AA 的实心档），不取常规强调色：
 * 白字落在常规强调色上先天不够（success 2.22 / warning 2.20，连图形下限 3:1 都不保），
 * 故 --text-on-solid 的授权范围只到实心档为止（口径见 tokens/themes/light.ts 的该条注释）。
 * warning 没有实心档（亮黄压深会毁掉警示语义），它的勾选态改用 --text-on-accent 深墨，约 9.6:1。
 *
 * `border` 宽度两态都要显式给：原先只有未选中态带宽度，选中态宽度为 0，比未选中态少一圈、显得发平。
 * 勾/减号图标不写死色值，随 checkbox-box 的 currentColor 继承本表的前景色。
 *
 * 悬停提亮取 --color-lift-<色>-10（= 语义色与纯白 10% 混合，口径见 tokens/lift.ts），
 * 替代原先的 `group-hover:brightness-105`：滤镜由引擎现算，产物色值无法审查、也进不了对比度门禁，
 * 且 brightness() 是通道乘系数而非混合，对通道触顶的饱和色并非真的提亮。
 * lift 以纯白为绝对锚点（不像 tint 会随主题底色漂移），亮色与暗色主题下悬停都是「更亮」——
 * 这正是实心档悬停该有的方向。取色一律走 lift 档，不再让引擎现算。
 * 已知残留：悬停色是「常规强调色提亮」，故白勾在悬停帧上又回到饱和底 —— 图形下限 3:1 在 HC 下不保
 * （该帧等比改动前更差的情况并未变坏：改前连常态底都是 2.62:1）。要连悬停帧也严格达标，
 * 得再补一族「实心档 + 提亮」的令牌，本轮不做。
 */
const COLOR_CONFIGS = {
  primary: {
    checkedClass: 'border border-primary-solid bg-primary-solid text-fg-on-solid group-hover:bg-lift-primary-10',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-primary-20 dark:bg-(--bg-surface)',
  },
  success: {
    checkedClass: 'border border-success-solid bg-success-solid text-fg-on-solid group-hover:bg-lift-success-10',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-success-20 dark:bg-(--bg-surface)',
  },
  warning: {
    checkedClass: 'border border-warning bg-warning text-fg-on-accent group-hover:bg-lift-warning-10',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-warning-20 dark:bg-(--bg-surface)',
  },
  danger: {
    checkedClass: 'border border-danger-solid bg-danger-solid text-fg-on-solid group-hover:bg-lift-danger-10',
    uncheckedClass:
      'border border-border-base bg-surface-body group-hover:border-tint-danger-20 dark:bg-(--bg-surface)',
  },
} as const;

const sizeConfig = computed(() => SIZE_CONFIGS[size]);
const colorConfig = computed(() => COLOR_CONFIGS[color]);

// ===== buttonized（按钮化）形态：直接渲染 ActionButton =====
// 勾选→subtle（浅主色高亮）、未勾选→ghost；Appearance/尺寸/聚焦环/禁用/键盘等全部由
// ActionButton 自身承载（原生 button 在 mousedown 即聚焦，聚焦环按下即显），不再手写样式。
// 未选中态刻意统一用 ghost 中性色、不随 color 变化（未选中无需强调色），仅选中态按 color 取 subtle 色板。

/** 当前选中态解析（自动兼容数组列表绑定、Set 集合、自定义 trueValue 与基础 boolean） */
const isChecked = computed<boolean>(() => {
  const model = modelValue.value;
  if (model === undefined) return innerChecked.value;

  if (Array.isArray(model)) return model.includes(value);

  if (model instanceof Set) return model.has(value);

  return model === resolvedTrueValue.value;
});

const ariaCheckedState = computed<'true' | 'false' | 'mixed'>(() => {
  if (indeterminate.value) return 'mixed';
  return isChecked.value ? 'true' : 'false';
});

/**
 * 勾选框内的指示图标名（未选中时无图标）。
 * 半选优先于勾选：半选态下 isChecked 可能同时为真（由调用方设定），横线必须压过勾。
 */
const indicatorIcon = computed<IconName | undefined>(() => {
  if (indeterminate.value) return 'minus';
  return isChecked.value ? 'check' : undefined;
});

/** 切换勾选状态并派发更新 */
const toggle = () => {
  if (disabled || readonly) return;
  const currentChecked = isChecked.value;
  const nextChecked = indeterminate.value ? true : !currentChecked;

  if (indeterminate.value) indeterminate.value = false;

  const model = modelValue.value;
  let nextModelValue: unknown;

  if (model === undefined) {
    innerChecked.value = nextChecked;
    nextModelValue = nextChecked ? resolvedTrueValue.value : resolvedFalseValue.value;
  } else if (Array.isArray(model)) {
    const list = (model as unknown[]).slice();
    const idx = list.indexOf(value);
    if (nextChecked && idx === -1) list.push(value);
    else if (!nextChecked && idx !== -1) list.splice(idx, 1);

    nextModelValue = list;
  } else if (model instanceof Set) {
    const set = new Set(model);
    if (nextChecked) set.add(value);
    else set.delete(value);

    nextModelValue = set;
  } else nextModelValue = nextChecked ? resolvedTrueValue.value : resolvedFalseValue.value;

  modelValue.value = nextModelValue;
  emit('change', nextChecked, nextModelValue);
};

defineExpose({
  input: inputRef,
  checked: isChecked,
  toggle,
});
</script>
