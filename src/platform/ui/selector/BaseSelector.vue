<template>
  <BasePopover
    v-model="isOpen"
    :disabled
    :block="width === 'full'"
    :offset-distance="6"
    match-trigger-width
    panel-class="p-0 overflow-hidden"
    placement="bottom-start"
  >
    <template #trigger="{ isOpen: _isOpen }">
      <div
        v-bind="$attrs"
        v-wave="{ disabled }"
        :aria-disabled="disabled || undefined"
        :aria-expanded="_isOpen"
        :class="[
          currentConfig.triggerClass,
          _isOpen ? 'border-primary ring-1 ring-primary' : '',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        ]"
        :style="{ width: triggerWidthStyle }"
        :tabindex="disabled ? -1 : 0"
        :title="triggerTitle"
        @keydown="handleTriggerKeydown($event)"
        data-focusable-outline
        aria-haspopup="listbox"
        class="group relative flex items-center justify-between gap-2 rounded-full border border-border-light bg-surface-body text-fg-title transition-all duration-150 outline-none select-none hover:border-border-base"
        ref="referenceRef"
        role="combobox"
      >
        <span
          :class="[
            isEmpty && placeholder ? 'font-normal text-fg-disabled' : isNonDefault ? 'text-primary' : 'text-fg-title',
          ]"
          class="flex min-w-0 flex-1 items-center gap-sm overflow-hidden font-semibold"
        >
          <slot name="prefix" />
          <BaseIcon
            v-if="typeof currentTriggerIcon === 'string'"
            :name="currentTriggerIcon as IconName"
            aria-hidden="true"
            class="shrink-0 opacity-80"
            icon-size="md"
            icon-stroke="bold"
          />
          <component
            v-else-if="currentTriggerIcon"
            :is="currentTriggerIcon"
            aria-hidden="true"
            class="shrink-0 opacity-80"
            icon-size="md"
            icon-stroke="bold"
          />
          <span class="flex w-full items-center gap-1 overflow-hidden">
            <template v-if="isMultiple && selectedValues.length">
              <span
                v-for="opt in displayedTags"
                :key="String(getOptionValue(opt))"
                class="inline-flex max-w-32 shrink-0 items-center gap-1 rounded-sm bg-tint-primary-90 px-1.5 py-0.5 text-2xs font-bold text-primary"
              >
                <span class="truncate">{{ formattedOption(opt) }}</span>
                <BaseIcon
                  @mousedown.stop.prevent
                  @pointerdown.stop.prevent
                  @click.stop.prevent="handleRemoveTag(opt)"
                  @keydown.enter.prevent.stop="handleRemoveTag(opt)"
                  @keydown.space.prevent.stop="handleRemoveTag(opt)"
                  aria-label="移除选项"
                  class="shrink-0 cursor-pointer opacity-60 hover:text-danger hover:opacity-100"
                  icon-size="xs"
                  icon-stroke="bold"
                  name="x"
                  role="button"
                  tabindex="0"
                  title="移除"
                />
              </span>
              <span
                v-if="collapsedCount > 0"
                class="inline-flex shrink-0 items-center rounded-sm bg-surface-panel-hover px-1.5 py-0.5 text-2xs font-bold text-fg-muted"
              >
                +{{ collapsedCount }}
              </span>
            </template>
            <div v-else v-marquee.fade class="min-w-0 flex-1">
              <slot :rolling-label="BaseRollingText" :selected="modelValue" name="label">
                <BaseRollingText v-if="rollingText" :text="displayText" always-roll class="tabular-nums" />
                <template v-else>{{ displayText }}</template>
              </slot>
            </div>
          </span>
          <slot name="suffix" />
        </span>

        <template v-if="clearable && canClear && !disabled">
          <BaseIcon
            @mousedown.stop.prevent
            @pointerdown.stop.prevent
            @click.stop.prevent="handleClear()"
            @keydown.enter.prevent.stop="handleClear()"
            @keydown.space.prevent.stop="handleClear()"
            aria-label="清空选择"
            class="hidden shrink-0 cursor-pointer bg-surface-body text-fg-disabled transition-colors group-focus-within:block group-hover:block hover:text-danger"
            icon-size="md"
            icon-stroke="bold"
            name="x"
            role="button"
            tabindex="0"
            title="清空"
          />
          <BaseIcon
            :class="{ 'rotate-180': _isOpen }"
            class="block shrink-0 text-fg-disabled transition-transform duration-200 group-focus-within:hidden group-hover:hidden"
            icon-size="md"
            icon-stroke="bold"
            name="chevron-down"
          />
        </template>
        <BaseIcon
          v-else
          :class="{ 'rotate-180': _isOpen }"
          class="block shrink-0 text-fg-disabled transition-transform duration-200"
          icon-size="md"
          icon-stroke="bold"
          name="chevron-down"
        />
      </div>
    </template>

    <template #default="{ close }">
      <div class="dropdown-inner-container relative flex w-full flex-col">
        <div v-if="$slots['header'] || filterable" class="shrink-0 border-b border-glass-border">
          <div v-if="filterable" class="px-2 py-1.5">
            <input
              v-model="searchQuery"
              :placeholder="filterPlaceholder"
              @pointerdown.stop
              @keydown.down.prevent="handleFilterKeydownDown()"
              @keydown.enter.prevent="handleFilterKeydownEnter(close)"
              data-focusable-outline
              class="h-7 w-full rounded-sm border border-border-light bg-surface-body px-2 text-xs outline-none"
              ref="filterInputRef"
              type="text"
            />
          </div>
          <slot name="header" />
        </div>

        <div class="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <BaseScrollArea
            :aria-multiselectable="isMultiple || undefined"
            :fade="{ size: 16, flushEps: 2 }"
            :scrollbar="{ endInset: 8 }"
            :style="{
              maxHeight: dropdownMaxHeight,
              // 空选项时禁止滚动（空占位可能略高于容器，避免出现可滚动的空面板）
              ...(filteredOptions.length === 0 ? { overflow: 'hidden' } : {}),
            }"
            @keydown="handleDropdownKeydown($event, close)"
            axis="y"
            class="flex w-full flex-col gap-0.5 p-xs outline-none"
            ref="dropdownAreaRef"
            role="listbox"
            tabindex="-1"
          >
            <div
              v-if="filteredOptions.length === 0"
              class="m-auto flex min-h-22 w-full flex-col items-center justify-center py-6"
            >
              <Feedback :description="filterable ? '无匹配结果' : '暂无选项'" size="sm" />
            </div>
            <template v-else>
              <div
                v-for="(entry, index) in filteredEntries"
                v-wave="{ disabled: isOptionDisabled(entry.option) }"
                :aria-selected="isSelected(getOptionValue(entry.option))"
                :class="[
                  currentConfig.itemClass,
                  isSelected(getOptionValue(entry.option))
                    ? 'bg-tint-primary-88! font-bold text-primary!'
                    : fontBlackItems
                      ? 'font-black'
                      : 'font-bold',
                  { 'pointer-events-none cursor-not-allowed opacity-40': isOptionDisabled(entry.option) },
                ]"
                :key="entry.key"
                :ref="el => setOptionEl(el, index)"
                :tabindex="isOptionDisabled(entry.option) ? -1 : 0"
                :title="getOptionTitle(entry.option)"
                @click="handleSelect(entry.option, close)"
                @keydown.enter.prevent.stop="handleSelect(entry.option, close)"
                @keydown.space.prevent.stop="handleSelect(entry.option, close)"
                class="flex min-w-0 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md bg-transparent px-2.5 text-xs text-fg-body transition-colors outline-none hover:bg-surface-panel-hover hover:text-fg-title"
                role="option"
              >
                <span class="flex max-w-full min-w-0 flex-1 items-center gap-2">
                  <BaseIcon
                    v-if="typeof getOptionIcon(entry.option) === 'string'"
                    :name="getOptionIcon(entry.option) as IconName"
                    aria-hidden="true"
                    class="shrink-0 opacity-80"
                    icon-size="md"
                    icon-stroke="bold"
                  />
                  <component
                    v-else-if="getOptionIcon(entry.option)"
                    :is="getOptionIcon(entry.option)"
                    aria-hidden="true"
                    class="shrink-0 opacity-80"
                    icon-size="md"
                    icon-stroke="bold"
                  />
                  <div v-marquee.fade class="min-w-0">
                    <slot :index :option="entry.option" name="option">
                      {{ formattedOption(entry.option) }}
                    </slot>
                  </div>
                </span>
                <BaseIcon
                  v-if="isSelected(getOptionValue(entry.option))"
                  aria-hidden="true"
                  class="shrink-0 text-primary"
                  icon-size="md"
                  icon-stroke="bold"
                  name="check"
                />
              </div>
            </template>
          </BaseScrollArea>
        </div>

        <slot v-if="$slots['footer']" name="footer" />
      </div>
    </template>
  </BasePopover>
</template>

<script lang="ts">
// 双 script 块的 SFC 视为同一模块：import 必须整体置于第一个块顶部（import/first），
// 下方 <script setup> 直接复用这些绑定；<script setup> 内禁止 export，
// 对外的类型导出也只能放在本块
import { computed, inject, nextTick, onBeforeUpdate, ref, useAttrs, useTemplateRef, watch } from 'vue';

import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { calcDropdownMaxHeight, createOptionHelpers, SELECTOR_CONFIG } from '@/platform/ui/selector/BaseSelector.logic';
import { resolveComponentWidth } from '@/platform/utils/constants';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';
import type { BaseSelectorOption, OptionValue, SelectorFieldNames } from '@/platform/ui/selector/BaseSelector.logic';
import type { FormComponentWidth } from '@/platform/utils/constants';
import type { Component } from 'vue';

// 键名/选项/绑值类型以 BaseSelector.logic.ts 为唯一来源，此处 re-export 保持既有从 .vue 导入的路径兼容
export type { BaseSelectorOption, OptionValue, SelectorFieldNames };
</script>

<script setup generic="O extends object | string | number, M extends boolean = false, V = OptionValue<O>" lang="ts">
type AnyOption = O;

defineOptions({ inheritAttrs: false });

const modelValue = defineModel<M extends true ? V[] : V>({ required: true });

const {
  options,
  size = undefined,
  width = 'md',
  placeholder = '请选择...',
  icon = undefined,
  clearable = false,
  disabled = false,
  displayItems = 6,
  defaultValue = undefined,
  fontBlackItems = false,
  formatOption = undefined,
  multiple = false as M,
  maxTagCount = undefined,
  collapseTags = false,
  fieldNames = undefined,
  filterable = false,
  filterPlaceholder = '搜索...',
  filterMethod = undefined,
  valueComparator = undefined,
  highlightNonDefault = false,
  keepOpenOnSelect = false,
  /** 触发器选中标签是否启用翻页动画：true 时整段标签随文案变化翻滚；false = 普通文本 */
  rollingText = false,
} = defineProps<{
  /** 选项列表：对象数组（label/value 等字段）或原始值数组。
   *  元素类型 O 即绑值类型的推导来源（见 OptionValue）。两点约束取舍：
   *  - 用 `object` 而非 `Record<string, unknown>`：后者要求隐式索引签名，而**接口声明的选项类型
   *    （如 BaseSelectorOption）拿不到它**，传进来会报 “Index signature is missing”；
   *  - 声明为 readonly：可以直接传 `as const` / readonly 常量表，不必再由调用方展开拷贝一份。 */
  options: readonly O[];
  /** 尺寸档位：sm/md/lg */
  size?: ComponentSize;
  /** 触发器宽度：预设档位（sm/md/lg/xl/auto/full）或具体 CSS 宽度值，默认 md */
  width?: FormComponentWidth;
  /** 未选中时的占位提示文本 */
  placeholder?: string;
  /** 触发器前缀图标（不传则自动取当前选中项的 icon） */
  icon?: IconName | Component;
  /** 是否显示清空按钮 */
  clearable?: boolean;
  /** 禁用整个选择器 */
  disabled?: boolean;
  /** 下拉面板不滚动时直接可见的选项数量（决定面板最大高度） */
  displayItems?: number;
  /** 默认值：清空时回退到该值，多选形态为数组 */
  defaultValue?: M extends true ? V[] : V;
  /** 选项文字是否统一加重（未选中项以 font-black 呈现） */
  fontBlackItems?: boolean;
  /** 自定义选项展示文本（仅原始值选项；对象选项走 fieldNames.label） */
  formatOption?: (option: AnyOption) => string;
  /** 多选模式：绑定值为数组，选中项以 Tag 形式展示 */
  multiple?: M;
  /** 多选模式下最多展示的 Tag 数量 */
  maxTagCount?: number;
  /** 多选模式下是否折叠超出的 Tag 为 +N */
  collapseTags?: boolean;
  /** 对象选项的字段名映射（label/value/disabled/icon） */
  fieldNames?: SelectorFieldNames;
  /** 是否在面板顶部显示搜索过滤输入框 */
  filterable?: boolean;
  /** 搜索过滤输入框的占位提示文本 */
  filterPlaceholder?: string;
  /** 自定义过滤函数（默认按展示文本包含关键字过滤） */
  filterMethod?: (query: string, option: AnyOption) => boolean;
  /** 自定义值相等比较器 */
  valueComparator?: (a: V, b: V) => boolean;
  /** 是否启用"非默认值高亮"：true（默认）保持原行为 —— 传了 defaultValue 且当前值偏离时标签高亮；
   *  false 则关闭该高亮，标签恒用默认文字色。仅控制高亮，不影响清空按钮的判定 */
  highlightNonDefault?: boolean;
  /** 单选选中后是否保持面板打开（默认 false 选中即关；用于快捷切换场景，Esc/点外部仍可关闭） */
  keepOpenOnSelect?: boolean;
  /** 触发器选中标签是否启用翻页动画：true 时整段标签随文案变化翻滚；false = 普通文本 */
  rollingText?: boolean;
}>();

const emit = defineEmits<{
  (e: 'change', value: M extends true ? V[] : V): void;
  (e: 'clear'): void;
  (e: 'removeTag', option: AnyOption, value: V): void;
}>();
const attrs = useAttrs();
/** 尺寸解析优先级：行内 size props > BaseForm 下发的 FormControlContext > 默认 md */
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => size ?? controlContext?.size ?? 'md');
/** 选项访问器：字段名映射 / 比较器 / 格式化注入到纯逻辑工厂（见 BaseSelector.logic.ts） */
const {
  getOptionLabel,
  getOptionValue,
  isOptionDisabled,
  getOptionIcon,
  equalsValue,
  formattedOption,
  getOptionTitle,
} = createOptionHelpers<V>({
  labelKey: fieldNames?.label ?? 'label',
  valueKey: fieldNames?.value ?? 'value',
  disabledKey: fieldNames?.disabled ?? 'disabled',
  iconKey: fieldNames?.icon ?? 'icon',
  formatOption,
  valueComparator,
});

const selectedOption = computed(() => {
  if (isMultiple.value) return undefined;
  return options.find(opt => equalsValue(getOptionValue(opt), modelValue.value as V));
});

const currentTriggerIcon = computed<IconName | Component | undefined>(() => {
  if (icon) return icon;
  if (!isMultiple.value && selectedOption.value) return getOptionIcon(selectedOption.value);

  return undefined;
});

const isOpen = ref(false);
const dropdownAreaRef = useTemplateRef<ScrollAreaHandle>('dropdownAreaRef');
/** 下拉选项滚动容器元素（键盘导航 / 滚动到选中项需要原生能力） */
const dropdownRef = useScrollAreaElement(dropdownAreaRef);
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const optionEls = ref<(HTMLElement | null)[]>([]);
const filterInputRef = useTemplateRef<HTMLInputElement>('filterInputRef');
const searchQuery = ref('');

/** 收集选项 DOM（函数式 ref），供键盘导航聚焦使用 */
const setOptionEl = (el: unknown, index: number) => {
  if (el instanceof HTMLElement) optionEls.value[index] = el;
};

onBeforeUpdate(() => {
  optionEls.value = [];
});

// 选项增删后渐隐遮罩由 v-edge-fade 的 MutationObserver 自动重测，无需手动同步

const isMultiple = computed(() => multiple);

const currentConfig = computed(() => SELECTOR_CONFIG[resolvedSize.value] ?? SELECTOR_CONFIG.md);

/** 读取选项展示文本 / 绑值 / 禁用态 / 比较等纯函数由 createOptionHelpers 工厂提供 */

const selectedValues = computed<V[]>(() =>
  isMultiple.value
    ? Array.isArray(modelValue.value)
      ? (modelValue.value as unknown as V[])
      : []
    : [modelValue.value as unknown as V]
);

/** 某值是否处于选中态（多选在集合中查找，单选直接比较） */
const isSelected = (val: V): boolean => selectedValues.value.some(v => equalsValue(v, val));

const filteredOptions = computed(() => {
  if (!filterable || !searchQuery.value.trim()) return options;
  const q = searchQuery.value.trim().toLowerCase();
  return options.filter(opt => {
    if (filterMethod) return filterMethod(q, opt);
    return getOptionLabel(opt).toLowerCase().includes(q);
  });
});

/**
 * 过滤结果行：附带完整 options 中的原始下标作为稳定 key。
 * filterable 时行序随关键字变动，若用「过滤后的行内下标」作 key，Vue 会按位复用错位 DOM，
 * 焦点所在的旧行节点会被填进另一个选项的内容（键盘导航定位与实际可见项脱节）。
 * 原始下标不随过滤变化，能保证行与选项一一对应。
 */
const filteredEntries = computed(() => {
  const list = filteredOptions.value;
  if (list === options)
    // 未过滤 / 非 filterable：行序即原始序，下标即稳定 key
    return list.map((option, index) => ({ option, key: index }));

  // 已过滤：按引用回查原始下标（选项列表通常为常驻数组且规模小，indexOf 成本可忽略）
  return list.map(option => ({ option, key: options.indexOf(option) }));
});

const selectedOptions = computed(() => options.filter(opt => isSelected(getOptionValue(opt))));

const maxTags = computed(() => {
  if (maxTagCount !== undefined) return maxTagCount;
  if (collapseTags) return 1;
  return Infinity;
});

const displayedTags = computed(() => selectedOptions.value.slice(0, maxTags.value));
const collapsedCount = computed(() => Math.max(0, selectedOptions.value.length - maxTags.value));

const isEmpty = computed(() =>
  isMultiple.value
    ? selectedValues.value.length === 0
    : modelValue.value === undefined || modelValue.value === null || modelValue.value === ''
);

/** 当前值是否已偏离 defaultValue：仅描述值状态，与是否高亮无关（共清空按钮判定使用） */
const isNonDefaultValue = computed(() => {
  if (defaultValue === undefined) return false;
  if (isMultiple.value) {
    // 多选按集合语义比较（忽略勾选顺序）：长度不等即偏离；否则双向逐项 equalsValue。
    // equalsValue 对数组会落到 JSON.stringify 的字符串比较，顺序敏感——['a','b'] 与 ['b','a']
    // 在多选下语义等价，若按字符串比较会把清空按钮/高亮状态误判为"已偏离默认值"。
    const current = selectedValues.value;
    const fallback = Array.isArray(defaultValue) ? (defaultValue as unknown as V[]) : [];
    if (current.length !== fallback.length) return true;
    return !fallback.every(dv => current.some(v => equalsValue(v, dv)));
  }
  return !equalsValue(modelValue.value as V, defaultValue as V);
});

/** 标签是否高亮：由 highlightNonDefault 开关控制，开启时仅在值偏离 defaultValue 时高亮 */
const isNonDefault = computed(() => highlightNonDefault && isNonDefaultValue.value);

const canClear = computed(() => {
  if (isEmpty.value) return false;
  if (defaultValue !== undefined) return isNonDefaultValue.value;

  return true;
});

const presetWidth = computed(() => resolveComponentWidth(width) ?? '100%');

/**
 * 触发器宽度样式。auto 宽度模式下由动画逻辑临时接管为具体像素值，
 * 动画结束后回归 undefined（交还给 presetWidth 的 auto），从而实现宽度自动过渡。
 */
const animatingWidth = ref<string | undefined>(undefined);
const triggerWidthStyle = computed(() => animatingWidth.value ?? presetWidth.value);

const triggerTitle = computed(() => {
  const explicit = attrs['title'];
  return typeof explicit === 'string' && explicit ? explicit : displayText.value || undefined;
});

const displayText = computed(() => {
  if (isMultiple.value) {
    if (!selectedValues.value.length) return placeholder;
    return `已选 ${selectedValues.value.length} 项`;
  }
  if (isEmpty.value) return placeholder;
  const currentOption = options.find(opt => isSelected(getOptionValue(opt)));
  if (currentOption !== undefined) return formattedOption(currentOption);

  return String(modelValue.value ?? '');
});

const dropdownMaxHeight = computed(() =>
  calcDropdownMaxHeight({
    optionCount: filteredOptions.value.length,
    displayItems,
    size: resolvedSize.value,
  })
);

/** auto 宽度模式下，选项文案变化（标签宽度随之变化）时平滑过渡触发器宽度 */
let widthAnim: Animation | undefined;

const animateTriggerWidth = () => {
  const el = referenceRef.value;
  if (!el || width !== 'auto') return;
  if (widthAnim) widthAnim.cancel();
  // 1) 捕获变更前宽度并锁定，使新文案渲染后宽度不跳变
  const fromWidth = el.getBoundingClientRect().width;
  animatingWidth.value = `${fromWidth}px`;
  nextTick(() => {
    // 2) 新文案已渲染且宽度仍锁定为 fromWidth，临时释放测量目标自然宽度
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    const savedWidth = el.style.width;
    el.style.width = 'auto';
    const toWidth = el.getBoundingClientRect().width;
    el.style.width = savedWidth;
    el.style.transition = prevTransition;
    if (Math.abs(toWidth - fromWidth) < 0.5) {
      // 宽度无变化，无需动画，直接回到自适应
      animatingWidth.value = undefined;
      return;
    }
    // 3) 用 WAAPI 显式播放宽度过渡：不依赖 CSS 过渡的起点提交时机，
    //    规避增长方向（如切到最宽的「线上服务器」）transition 不触发导致宽度直跳的问题
    widthAnim = el.animate([{ width: `${fromWidth}px` }, { width: `${toWidth}px` }], {
      duration: 150,
      easing: 'ease',
      fill: 'forwards',
    });
    // 4) 动画结束后交还 auto（toWidth 即 auto 宽度，无回弹）；
    //    期间关闭 CSS 过渡，避免 revert 触发二次宽度过渡或回弹闪烁
    widthAnim.onfinish = () => {
      el.style.transition = 'none';
      el.style.width = 'auto';
      animatingWidth.value = undefined;
      widthAnim?.cancel();
      requestAnimationFrame(() => {
        el.style.transition = '';
      });
    };
  });
};

watch(displayText, () => {
  if (width !== 'auto') return;
  animateTriggerWidth();
});

/**
 * 写入 modelValue 并派发 change 的唯一出口。
 *
 * `multiple` 只活在类型层（`M extends boolean`）：运行时它就是个普通 prop，所以「写入形态与
 * multiple 一致」编译器无从保证，这里必然需要一次断言。原先 `as unknown as M extends true ?
 * V[] : V` 在 4 个调用点各写一遍——改错任何一处都不会被发现，值类型等于零保护；集中到此后
 * 只剩一处，并在开发期校验形态：多选却写单值、单选却写数组，都会立刻在控制台点名，而不是等
 * 下游按错误形态消费（把单值当数组取 .length、把数组当单值比较，都是静默出错）。
 *
 * 想把它升级为**编译期**保护，只能改组件 API（拆成单选/多选两个组件，或把 (multiple, modelValue)
 * 收成一个判别联合 prop）——那是一次对外契约变更，不属于本轮修复范围。
 *
 * `source` 仅用于告警文案，指向调用点。
 */
const commitValue = (value: V | V[] | undefined, source: string): void => {
  if (import.meta.env.DEV && value !== undefined) {
    const expectsArray = isMultiple.value;
    if (Array.isArray(value) !== expectsArray)
      console.warn(
        `[BaseSelector] ${source}：写入值与 multiple=${String(isMultiple.value)} 形态不符（期望${expectsArray ? '数组' : '单值'}）`,
        value
      );
  }
  const typed = value as unknown as M extends true ? V[] : V;
  modelValue.value = typed;
  emit('change', typed);
};

/** 选择选项：多选切换勾选，单选写值后关闭面板（keepOpenOnSelect 时保持面板打开便于连续切换） */
const handleSelect = (option: AnyOption, close: () => void) => {
  if (isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  if (isMultiple.value) {
    const arr = selectedValues.value.slice();
    const i = arr.findIndex(v => equalsValue(v, val));
    if (i >= 0) arr.splice(i, 1);
    else arr.push(val);
    commitValue(arr, 'handleSelect');
  } else {
    commitValue(val, 'handleSelect');
    if (!keepOpenOnSelect) close();
  }
};

/** 移除多选 Tag：从选中集合剔除并派发 change / removeTag */
const handleRemoveTag = (option: AnyOption) => {
  if (disabled || isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  commitValue(
    selectedValues.value.filter(v => !equalsValue(v, val)),
    'handleRemoveTag'
  );
  emit('removeTag', option, val);
};

/** 清空选择：回退到 defaultValue（多选为空数组）并派发 change / clear；
 *  无论 keepOpenOnSelect 如何，清空都关闭面板（清空即结束本次选择交互） */
const handleClear = () => {
  if (disabled) return;
  commitValue(defaultValue !== undefined ? defaultValue : isMultiple.value ? [] : undefined, 'handleClear');
  emit('clear');
  isOpen.value = false;
};

/** 触发器键盘：方向键 / 回车 / 空格打开面板 */
const handleTriggerKeydown = (e: KeyboardEvent) => {
  if (disabled) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!isOpen.value) isOpen.value = true;
  }
};

/** 搜索框按 ↓：聚焦首个可用选项 */
const handleFilterKeydownDown = () => {
  const firstValidIndex = filteredOptions.value.findIndex(o => !isOptionDisabled(o));
  if (firstValidIndex !== -1) optionEls.value[firstValidIndex]?.focus();
};

/** 搜索框按回车：直接选中首个可用选项 */
const handleFilterKeydownEnter = (close: () => void) => {
  const firstValid = filteredOptions.value.find(o => !isOptionDisabled(o));
  if (firstValid) handleSelect(firstValid, close);
};

/** 列表键盘导航：跳过禁用项，↑ 在顶部时回到搜索框，Esc / Tab 关闭 */
const handleDropdownKeydown = (e: KeyboardEvent, close: () => void) => {
  const elements = optionEls.value;
  if (!elements || elements.length === 0) return;

  const currentIndex = elements.findIndex(el => el === document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIndex = currentIndex + 1;
    while (nextIndex < filteredOptions.value.length && isOptionDisabled(filteredOptions.value[nextIndex]!)) nextIndex++;

    if (nextIndex < filteredOptions.value.length) elements[nextIndex]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentIndex === 0 && filterable) {
      filterInputRef.value?.focus();
      return;
    }
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0 && isOptionDisabled(filteredOptions.value[prevIndex]!)) prevIndex--;

    if (prevIndex >= 0) elements[prevIndex]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'Tab') {
    // 显式拦截原生 Tab：面板经 Teleport 挂在 body 下，若放任浏览器默认焦点移动，
    // 焦点可能落在「即将随面板卸载的列表节点」上，导致焦点意外掉回 document.body。
    // 改由手动把焦点交还触发器，面板关闭后的下一次 Tab 自然前进到下一个控件。
    e.preventDefault();
    close();
    referenceRef.value?.focus();
  }
};

watch(
  () => disabled,
  isDisabled => {
    if (isDisabled) isOpen.value = false;
  }
);

watch(isOpen, opened => {
  if (opened) {
    if (filterable) searchQuery.value = '';
    scrollToSelected();
  }
});

// 选项变化时无需重测渐隐：子元素增删由 v-edge-fade 的 MutationObserver 捕获（原 nextTick(syncEdgeFades) 已随 composable 移除）

// 打开后：将焦点移入列表（或搜索框），确保键盘方向键从当前/首个有效项开始定位
const scrollToSelected = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    const container = dropdownRef.value;
    if (!container) return;

    if (filterable) filterInputRef.value?.focus();
    else {
      const list = filteredOptions.value;
      const activeIdx = list.findIndex(o => isSelected(getOptionValue(o)));
      const targetIdx = activeIdx !== -1 ? activeIdx : 0;
      const targetElement = optionEls.value[targetIdx];
      if (targetElement) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = targetElement.getBoundingClientRect();
        // 间距对齐 v-edge-fade.y 的 size:16：低于该值选中项落在上下渐隐遮罩区内，观感如同贴边
        const gapOffset = 16;
        if (itemRect.top - gapOffset < containerRect.top)
          container.scrollTop -= containerRect.top - itemRect.top + gapOffset;
        else if (itemRect.bottom + gapOffset > containerRect.bottom)
          container.scrollTop += itemRect.bottom - containerRect.bottom + gapOffset;

        // focus 原生的 focus scrolling 以「恰好可见 = 零间距」为准，会在面板 scale 过渡期间
        // （rect 为缩放中坐标，滚动计算失真）把刚定位好的选项重滚成贴边——焦点必须与滚动解耦
        targetElement.focus({ preventScroll: true });
      }
    }
  });
};
</script>
