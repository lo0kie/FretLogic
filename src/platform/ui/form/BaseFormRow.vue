<template>
  <div
    :class="[
      { 'is-disabled opacity-60': disabled, 'is-compacted': compacted },
      align === 'top' ? 'align-top' : 'align-center',
    ]"
    class="base-form-row flex w-full flex-col"
  >
    <div
      :class="[
        layout === 'vertical'
          ? 'flex-col items-start gap-1.5'
          : [align === 'top' ? 'items-start' : 'items-center', compacted ? 'is-compacted gap-sm' : 'gap-md'],
        layout === 'horizontal' && align === 'center' ? CONTROL_HEIGHT_CLASSES.md : '',
      ]"
      class="form-row-main flex w-full"
    >
      <!-- 元素类型由 labelTag 决定：可关联控件时是 <label>，否则退化为 <span>（理由见 labelTag 说明） -->
      <component
        v-if="label || $slots['label']"
        :class="[
          'form-row-label shrink-0 truncate font-semibold select-none',
          LABEL_SIZE_CLASSES[resolvedLabelSize],
          layout === 'horizontal' && align === 'top' ? labelTopPaddingClass : '',
          required ? 'flex items-center gap-1' : '',
          resolvedLabelTone === 'muted' ? 'text-fg-muted' : 'text-fg-body',
          // 手型只在「点了确实会有反应」时给：标签是真 <label>（有 for 关联），或控件声明了
          // 自己实现激活并已登记按下处理（见 labelIsClickable）。退化为 span 且无登记的标签点它
          // 不会发生任何事（BaseSlider / BaseSegmentedControl / BaseNumberInput），给手型是假暗示。
          // 禁用态与 BaseSwitch / BaseCheckbox 口径一致。
          labelIsClickable ? (disabled ? 'cursor-not-allowed' : 'cursor-pointer') : '',
        ]"
        :for="labelTag === 'label' ? effectiveForId : undefined"
        :id="labelId"
        :is="labelTag"
        :style="layout === 'horizontal' ? labelStyle : undefined"
        @click="handleLabelClick()"
        @pointerdown="handleLabelPointerDown($event)"
      >
        <slot name="label"> {{ label }} </slot>
        <span v-if="required" aria-hidden="true" class="leading-none text-danger">*</span>
      </component>

      <div
        :class="[
          layout === 'vertical' ? 'w-full' : 'flex-1',
          controlAlign === 'start' ? 'justify-start' : controlAlign === 'center' ? 'justify-center' : 'justify-end',
        ]"
        :style="controlStyle"
        class="form-row-control flex min-w-0 items-center *:max-h-full"
      >
        <slot :disabled :required :id="slotControlId" />
      </div>
    </div>

    <div
      v-if="resolvedHelp || resolvedError || $slots['help'] || $slots['error']"
      :class="[resolvedError ? 'text-danger' : 'text-fg-muted']"
      :role="resolvedError ? 'alert' : undefined"
      :style="feedbackStyle"
      aria-live="polite"
      class="form-row-feedback mt-1 w-full text-2xs/relaxed"
    >
      <slot :message="resolvedError" name="error">
        <span v-if="resolvedError">{{ resolvedError }}</span>
      </slot>
      <slot v-if="!resolvedError" :message="resolvedHelp" name="help">
        <span v-if="resolvedHelp">{{ resolvedHelp }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, provide, shallowRef, useId } from 'vue';

// 行高引用控件高度标尺契约（md 档），与全工程控件单一真理源保持一致
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { FORM_ROW_DENSITY_KEY, FORM_ROW_LABELLING_KEY } from '@/platform/ui/form/formRowContext';
import { resolveComponentWidth } from '@/platform/utils/constants';

import type { FormRowDensityContext, FormRowLabelling, FormRowLabelPress } from '@/platform/ui/form/formRowContext';
import type { FormComponentWidth } from '@/platform/utils/constants';

const {
  label = '',
  layout = 'horizontal',
  align = 'center',
  labelWidth,
  controlWidth,
  controlAlign = 'end',
  compacted = false,
  required = false,
  disabled = false,
  error,
  help,
  labelTone,
  labelSize,
  for: forProp,
  inputId,
} = defineProps<{
  /** 行标签文本（无 label 时不渲染标签列） */
  label?: string;
  /** 布局方向：'horizontal' 水平并排（默认） | 'vertical' 上下堆叠 */
  layout?: 'horizontal' | 'vertical';
  /** 水平布局时的垂直对齐：'center' 居中（默认） | 'top' 顶部对齐 */
  align?: 'center' | 'top';
  /** 标签宽度；数值自动补齐 px。未传时回落到 BaseForm 容器下发的 label-width */
  labelWidth?: string | number;
  /** 控件区宽度档位或具体值；未传时自适应拉伸占满 */
  controlWidth?: FormComponentWidth;
  /** 控件区水平对齐：'start' 靠左 | 'center' 居中 | 'end' 靠右（默认） */
  controlAlign?: 'start' | 'center' | 'end';
  /** 紧凑模式：缩小标签与控件区的间距 */
  compacted?: boolean;
  /** 必填标记：显示 *，并通过默认插槽 props 透传 required（控件侧据此输出 aria-required / 原生 required） */
  required?: boolean;
  /** 禁用态：仅置灰 label 并通过默认插槽 props 透传 disabled——控件侧必须自接该 prop 才真正禁用 */
  disabled?: boolean;
  /** 错误信息文案（优先级高于 help），输出 role="alert" */
  error?: string;
  /** 说明文案 */
  help?: string;
  /** 标签亮度：'body' 常规（默认）| 'muted' 次级（弱化标签，用于让分组标题更突出） */
  labelTone?: 'body' | 'muted';
  /**
   * 标签字号：与控件尺寸标尺（sm/md/lg）同构，调用方无需在两套命名间切换。
   * 'xs'（默认）| '2xs' 缩小（弱化层级让分组标题更突出）| 'sm' / 'md' / 'lg' 逐级放大
   */
  labelSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg';
  /**
   * 语义关联：显式指定关联控件 id。
   * 显式传值即强制渲染 <label for>，故目标必须是可标签化元素（input / select / textarea / button…）；
   * 指向 div 类 ARIA 控件只会换回浏览器告警，那种场景应改用自动关联（aria-labelledby）。
   */
  for?: string;
  /** 自动关联控件 id；与 for 二选一（约束同 for） */
  inputId?: string;
}>();

// 使用 Vue 3.5 useId 保证 SSR 与客户端水合一致
const autoId = useId();

/** 行标签元素 id：非可标签化控件（role=slider / radiogroup / combobox / spinbutton）据此用 aria-labelledby 取到名称 */
const labelId = `form-row-label-${autoId}`;
/** 行内控件上报的实际控件 id：label 的 for 只在收到上报后才输出（详见 formRowContext 的关联绑定说明） */
const reportedControlId = shallowRef<string | undefined>();
/** 行内控件登记的「标签按下」处理（③ 标签按下委托）；未登记时点标签不做任何事 */
const labelPress = shallowRef<FormRowLabelPress | undefined>();
const labelling: FormRowLabelling = {
  labelId,
  report: id => {
    reportedControlId.value = id;
  },
  reportLabelPress: target => {
    labelPress.value = target;
  },
};
provide(FORM_ROW_LABELLING_KEY, labelling);

// 密度上下文：BaseForm 等容器注入默认值，行内显式 props 优先
const densityContext = inject<FormRowDensityContext | null>(FORM_ROW_DENSITY_KEY, null);
const resolvedLabelTone = computed(() => labelTone ?? densityContext?.labelTone ?? 'body');
const resolvedLabelSize = computed(() => labelSize ?? densityContext?.labelSize ?? 'xs');
const resolvedLabelWidth = computed(() => labelWidth ?? densityContext?.labelWidth);

/**
 * 标签字号档位 → 文本类：新增档位只在此补一行。
 * 与控件尺寸标尺（CONTROL_HEIGHT_CLASSES）刻意解耦——标签是文本语义，不复用控件高度档位。
 */
const LABEL_SIZE_CLASSES: Record<'2xs' | 'xs' | 'sm' | 'md' | 'lg', string> = {
  '2xs': 'text-2xs',
  'xs': 'text-xs',
  'sm': 'text-sm',
  // @theme 无 --text-md 令牌，md 档落到 --text-base（16px）
  'md': 'text-base',
  'lg': 'text-lg',
};
/**
 * 供默认插槽接收的控件 id。行内自动关联（控件自行上报 id）已覆盖绝大多数场景，本项保留为
 * 「控件不吃自动关联、调用方需自行绑 id」时的显式出口。
 */
const slotControlId = computed(() => forProp || inputId || `form-row-control-${autoId}`);
/**
 * label 的 for：显式 for / inputId > 行内控件上报的 id > 不输出。
 *
 * 默认不输出是关键——for 指向不存在的元素属悬空关联（浏览器告警，且点击标签无反应），
 * 故只有当行内确有控件（BaseInput / BaseTextarea / BaseSwitch / BaseCheckbox…）上报了自己的
 * 元素 id 时才输出；该上报由控件侧 useFormRowControlId 完成，关联因此无需调用方手工接线。
 *
 * 注意「不输出」同时会降级标签元素——此时根本没有可关联的控件，标签元素不该是 label（见 labelTag）。
 */
const effectiveForId = computed(() => forProp || inputId || reportedControlId.value);

/**
 * 标签元素的类型：只在**确有可标签化控件可关联**时渲染 <label>，否则退化为 <span>。
 *
 * HTML 的 label 只有两种成立方式 —— for 指向一个可标签化表单元素（input / select / textarea /
 * button / meter / output / progress），或把该元素包在自己内部。两者都不满足时，label 就是个
 * 「没关联任何控件的空壳」，Chrome 会在控制台逐行报 FormLabelHasNeitherForNorNestedInput。
 *
 * 行内的 role=slider / radiogroup / combobox / spinbutton 控件（BaseSlider / BaseSegmentedControl /
 * BaseSelector / BaseNumberInput）是 div：label 的 for 指不到它们（指到了也无效，Chrome 只认标签化元素），
 * 它们又在兄弟节点而非 label 内部 —— 正是上面那种空壳。这类行的无障碍名走 aria-labelledby
 * （控件侧 useFormRowLabelId 取 labelId），而 aria-labelledby 可以指向任意元素，所以标签元素退成
 * span 之后**关联完全不受影响**（span 照样带 id），只是不再是一个没关联任何控件的 label。
 *
 * 两种元素共用同一套 class / id / 布局类，外观无差：本行是 flex 容器，两种标签都会被 blockify，
 * 且全仓没有任何以 label 标签名为选择器的样式（类名 form-row-label 才是外观来源）。
 */
const labelTag = computed(() => (effectiveForId.value ? 'label' : 'span'));

/**
 * 标签点了是否会有反应：或它是真 `<label>`（有 for 关联，激活由浏览器完成），或行内控件声明了
 * 自己实现激活并已登记委托（③ 的 selfActivating，如 BaseSelector —— 其触发器不可标签化、
 * label 的 for 指不到，只能由控件自己开面板）。
 *
 * 给手型、放行「按下」与放行「点击」是同一个判断，故同源出一处：写成三份条件会漂移成
 * 「有手型但点了没事」。
 */
const labelIsClickable = computed(() => labelTag.value === 'label' || labelPress.value?.selfActivating === true);

/**
 * 标签被**按下** → 把这件事交给行内控件登记的 press（③ 标签交互委托，见 formRowContext）。
 *
 * 只走「按下」这一档：这一档专供**补波纹** —— 墨水必须在指针落下的瞬间就晕开，这才与指令对
 * 「直接按在控件上」的口径一致。**激活不在这里**（见下面的 handleLabelClick），两者的时机语义不同。
 *
 * 放行判据与手型同源（labelIsClickable）：真 <label> 走浏览器 for，或控件自认能自己激活；
 * 两者都不满足的行（标签退化为 span 且控件未声明）点标签根本激活不了控件，委托只是为
 * 「什么都没发生」喝彩。判据不另设开关，就用 labelTag 与 selfActivating 本身。
 *
 * 刻意不在此处判 disabled：波纹该不该出现交给控件自己的 v-wave 选项裁决（指令内部即检查），
 * 行再存一份就是第二个真理源 —— 两边不一致时会出现「点标签没波纹、点控件反而有波纹」。
 * 行的 disabled 只管置灰标签与向插槽透传，是否真的禁用取决于控件自接（见该 prop 说明）。
 *
 * 只认主键：标签的激活行为本就只由主键点击触发，右键 / 中键不该给出「按下」的反馈。
 * （控件侧 v-wave 是库内实现，其 pointerdown 监听不筛按键，本行不沿用那一档宽口径。）
 * 参数类型由模板推断，此处按 pointerdown 取 button，不做 instanceof 收窄 ——
 * jsdom 未实现 PointerEvent，运行时收窄会变成测试环境里的 ReferenceError。
 */
const handleLabelPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  if (!labelIsClickable.value) return;
  labelPress.value?.press();
};

/**
 * 标签被**点击**（同点按下并松开）→ 交给行内控件登记的 activate。
 *
 * 为什么激活不能复用上面那档「按下」：激活是**点击**语义，浏览器原生 click 的时机就是「同一次
 * 按压在同一个元素上松开」—— 直接点控件（或点 `<label for>`）走的都是它。若把激活挂在 pointerdown
 * 上，按住标签往外一拖再松手也会把面板打开，而同样手法按触发器却什么都不会发生。
 * （真实缺陷案例：BaseSelector 的行标签此前一按就开面板，与点触发器本身的时机不一致。）
 *
 * 波纹不在这里补：那已在按下时补过，此处再补就是两圈 —— 分工是「按下＝墨水、点击＝激活」，不可互换。
 * 点击事件不带有意义的 button（右键走 contextmenu、不派发 click），故此处不筛按键。
 */
const handleLabelClick = () => {
  if (!labelIsClickable.value) return;
  labelPress.value?.activate?.();
};

const normalizedLabelWidth = computed(() => {
  const width = resolvedLabelWidth.value;
  if (width === undefined) return undefined;
  return typeof width === 'number' ? `${width}px` : width;
});

const labelStyle = computed(() => {
  if (normalizedLabelWidth.value === undefined) return {};
  return { width: normalizedLabelWidth.value, maxWidth: normalizedLabelWidth.value };
});

const controlStyle = computed(() => {
  const width = resolveComponentWidth(controlWidth);
  return width ? { width, flex: 'none' } : {};
});

const feedbackStyle = computed(() => {
  if (layout !== 'horizontal' || normalizedLabelWidth.value === undefined || controlAlign === 'end') return {};

  // 补偿值必须与 form-row-main 的 gap-sm / gap-md 同源：直接引用 Tailwind @theme 注入的
  // --spacing-* 变量，间距 token 调整时此处的对齐缩进自动跟随，无需手工同步
  return {
    paddingLeft: `calc(${normalizedLabelWidth.value} + var(--spacing-${compacted ? 'sm' : 'md'}))`,
  };
});

const resolvedError = computed(() => error || undefined);
const resolvedHelp = computed(() => (resolvedError.value ? undefined : help || undefined));

/**
 * align="top" 时 label 的顶部内边距：间距档 sm 对齐控件内边距，+1px 补偿控件的 1px 边框宽度，
 * 使 label 首行文字与输入框内文字基线对齐（控件边框宽度变更时需同步调整此补偿值）
 */
const labelTopPaddingClass = 'pt-[calc(var(--spacing-sm)+1px)]';
</script>
