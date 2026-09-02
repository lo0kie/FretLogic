<template>
  <BasePopover
    v-model="isOpen"
    :block="width === 'full'"
    :disabled
    :offset-distance="6"
    @open="scrollToSelected"
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
          _isOpen ? 'border-primary ring-primary ring-1' : '',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        ]"
        :data-focusable-inline="!disabled || undefined"
        :style="{ width: presetWidth }"
        :tabindex="disabled ? -1 : 0"
        @keydown="handleTriggerKeydown($event)"
        aria-haspopup="listbox"
        class="group bg-bg-body border-border-light text-text-title hover:border-border-base focus-visible:border-primary focus-visible:ring-primary/70 relative box-border flex items-center justify-between rounded-full border transition-all duration-150 outline-none select-none focus-visible:ring-2"
        ref="referenceRef"
        role="combobox"
      >
        <span
          :class="[
            isEmpty && placeholder
              ? 'text-text-disabled font-normal'
              : isNonDefault
                ? 'text-primary'
                : 'text-text-title',
          ]"
          class="gap-sm flex min-w-0 flex-1 items-center overflow-hidden font-semibold"
        >
          <slot name="prefix" />
          <BaseIcon
            v-if="typeof currentTriggerIcon === 'string'"
            :name="currentTriggerIcon as IconName"
            :size="13"
            aria-hidden="true"
            class="shrink-0 opacity-80"
          />
          <component
            v-else-if="currentTriggerIcon"
            :is="currentTriggerIcon"
            :size="13"
            :stroke-width="2.5"
            aria-hidden="true"
            class="shrink-0 opacity-80"
          />
          <span class="flex w-full items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
            <template v-if="isMultiple && selectedValues.length">
              <span
                v-for="opt in displayedTags"
                :key="String(getOptionValue(opt))"
                class="bg-tint-primary-90 text-primary text-2xs inline-flex max-w-[8rem] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-bold"
              >
                <span class="truncate">{{ formattedOption(opt) }}</span>
                <BaseIcon
                  :size="10"
                  :stroke-width="3"
                  @click.stop.prevent="handleRemoveTag(opt)"
                  @keydown.enter.prevent.stop="handleRemoveTag(opt)"
                  @keydown.space.prevent.stop="handleRemoveTag(opt)"
                  @mousedown.stop.prevent
                  @pointerdown.stop.prevent
                  aria-label="移除选项"
                  class="hover:text-danger shrink-0 cursor-pointer opacity-60 hover:opacity-100"
                  name="x"
                  role="button"
                  tabindex="0"
                  title="移除"
                />
              </span>
              <span
                v-if="collapsedCount > 0"
                class="bg-bg-panel-hover text-text-muted text-2xs inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-bold"
              >
                +{{ collapsedCount }}
              </span>
            </template>
            <slot v-else :selected="modelValue" name="label"> {{ displayText }} </slot>
          </span>
          <slot name="suffix" />
        </span>

        <template v-if="clearable && canClear && !disabled">
          <BaseIcon
            :size="14"
            :stroke-width="2.5"
            @click.stop.prevent="handleClear"
            @keydown.enter.prevent.stop="handleClear"
            @keydown.space.prevent.stop="handleClear"
            @mousedown.stop.prevent
            @pointerdown.stop.prevent
            aria-label="清空选择"
            class="text-text-disabled hover:text-danger bg-bg-body hidden shrink-0 cursor-pointer transition-colors group-focus-within:block group-hover:block"
            name="x"
            role="button"
            tabindex="0"
            title="清空"
          />
          <BaseIcon
            :class="{ 'rotate-180': _isOpen }"
            :size="14"
            :stroke-width="2.5"
            class="text-text-disabled block shrink-0 transition-transform duration-200 group-focus-within:hidden group-hover:hidden"
            name="chevron-down"
          />
        </template>
        <BaseIcon
          v-else
          :class="{ 'rotate-180': _isOpen }"
          :size="14"
          :stroke-width="2.5"
          class="text-text-disabled block shrink-0 transition-transform duration-200"
          name="chevron-down"
        />
      </div>
    </template>

    <template #default="{ close }">
      <div class="dropdown-inner-container relative flex w-full flex-col">
        <div v-if="$slots['header'] || filterable" class="border-glass-border shrink-0 border-b">
          <div v-if="filterable" class="px-2 py-1.5">
            <input
              v-model="searchQuery"
              :placeholder="filterPlaceholder"
              @keydown.down.prevent="handleFilterKeydownDown"
              @keydown.enter.prevent="handleFilterKeydownEnter(close)"
              @pointerdown.stop
              class="border-border-light bg-bg-body focus:border-primary focus:ring-primary/50 h-7 w-full rounded border px-2 text-xs outline-none focus:ring-1"
              ref="filterInputRef"
              type="text"
            />
          </div>
          <slot name="header" />
        </div>

        <Transition name="v-transition-fade">
          <div
            v-if="canScrollUp"
            aria-hidden="true"
            class="z-panel text-text-disabled pointer-events-none absolute top-1 right-1 left-1 flex h-2 items-center justify-center transition-colors"
          >
            <BaseIcon :size="9" :stroke-width="3" name="chevron-up" />
          </div>
        </Transition>

        <div
          :aria-multiselectable="isMultiple || undefined"
          :style="{
            maxHeight: dropdownMaxHeight,
            // 空选项时禁止滚动（空占位可能略高于容器，避免出现可滚动的空面板）
            ...(filteredOptions.length === 0 ? { overflow: 'hidden' } : {}),
          }"
          @keydown="handleDropdownKeydown($event, close)"
          @scroll.passive="checkScroll"
          class="no-scrollbar p-xs box-border flex w-full flex-col gap-0.5 overflow-y-auto outline-none"
          ref="dropdownRef"
          role="listbox"
          tabindex="-1"
        >
          <div
            v-if="filteredOptions.length === 0"
            class="m-auto box-border flex min-h-[5.5rem] w-full flex-col items-center justify-center py-6"
          >
            <EmptyState :description="filterable ? '无匹配结果' : '暂无选项'" size="sm" />
          </div>
          <template v-else>
            <div
              v-for="(option, index) in filteredOptions"
              v-wave="{ disabled: isOptionDisabled(option) }"
              :aria-selected="isSelected(getOptionValue(option))"
              :class="[
                currentConfig.itemClass,
                isSelected(getOptionValue(option))
                  ? 'bg-tint-primary-88! text-primary! font-bold'
                  : fontBlackItems
                    ? 'font-black'
                    : 'font-bold',
                { 'pointer-events-none cursor-not-allowed opacity-40': isOptionDisabled(option) },
              ]"
              :key="index"
              :ref="el => setOptionEl(el, index)"
              :tabindex="isOptionDisabled(option) ? -1 : 0"
              @click="handleSelect(option, close)"
              @keydown.enter.prevent.stop="handleSelect(option, close)"
              @keydown.space.prevent.stop="handleSelect(option, close)"
              class="text-text-body hover:bg-bg-panel-hover hover:text-text-title box-border flex min-w-0 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-lg bg-transparent px-2.5 text-xs transition-colors outline-none"
              role="option"
            >
              <span class="flex max-w-full min-w-0 flex-1 items-center gap-2 truncate">
                <BaseIcon
                  v-if="typeof getOptionIcon(option) === 'string'"
                  :name="getOptionIcon(option) as IconName"
                  :size="13"
                  aria-hidden="true"
                  class="shrink-0 opacity-80"
                />
                <component
                  v-else-if="getOptionIcon(option)"
                  :is="getOptionIcon(option)"
                  :size="13"
                  :stroke-width="2.5"
                  aria-hidden="true"
                  class="shrink-0 opacity-80"
                />
                <span class="truncate">
                  <slot :index :option name="option">
                    {{ formattedOption(option) }}
                  </slot>
                </span>
              </span>
              <BaseIcon
                v-if="isSelected(getOptionValue(option))"
                :size="13"
                :stroke-width="2.5"
                aria-hidden="true"
                class="text-primary shrink-0"
                name="check"
              />
            </div>
          </template>
        </div>

        <Transition name="v-transition-fade">
          <div
            v-if="canScrollDown"
            aria-hidden="true"
            class="z-panel text-text-disabled pointer-events-none absolute right-1 bottom-1 left-1 flex h-2 items-center justify-center transition-colors"
          >
            <BaseIcon :size="9" :stroke-width="3" name="chevron-down" />
          </div>
        </Transition>

        <slot v-if="$slots['footer']" name="footer" />
      </div>
    </template>
  </BasePopover>
</template>

<script lang="ts">
import type { Component } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';
import type { IconName } from '@/components/ui/icons.registry';

export interface SelectorFieldNames {
  label?: string;
  value?: string;
  disabled?: string;
  icon?: string;
}

export interface BaseSelectorOption<V = unknown> {
  label: string;
  value: V;
  disabled?: boolean;
  icon?: IconName | Component;
  [key: string]: unknown;
}

/** 从选项类型中提取对应的绑值类型 */
export type OptionValue<Opt> = Opt extends { value: infer V } ? V : Opt;
</script>

<script
  generic="O extends Record<string, unknown> | string | number, M extends boolean = false, V = OptionValue<O>"
  lang="ts"
  setup
>
import { computed, nextTick, onBeforeUpdate, ref, useTemplateRef, watch } from 'vue';

import BasePopover from '@/components/ui/BasePopover.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { resolveComponentWidth, type FormComponentWidth } from '@/utils/core/constants';

type AnyOption = O;

defineOptions({ inheritAttrs: false });

const {
  options,
  size = 'md',
  width = 'full',
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
} = defineProps<{
  options: O[];
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  placeholder?: string;
  /** 触发器前缀图标（不传则自动取当前选中项的 icon） */
  icon?: IconName | Component;
  clearable?: boolean;
  disabled?: boolean;
  displayItems?: number;
  defaultValue?: M extends true ? V[] : V;
  fontBlackItems?: boolean;
  /** 自定义选项展示文本（仅原始值选项；对象选项走 fieldNames.label） */
  formatOption?: (option: AnyOption) => string;
  multiple?: M;
  /** 多选模式下最多展示的 Tag 数量 */
  maxTagCount?: number;
  /** 多选模式下是否折叠超出的 Tag 为 +N */
  collapseTags?: boolean;
  fieldNames?: SelectorFieldNames;
  filterable?: boolean;
  filterPlaceholder?: string;
  filterMethod?: (query: string, option: AnyOption) => boolean;
  /** 自定义值相等比较器 */
  valueComparator?: (a: V, b: V) => boolean;
}>();

const modelValue = defineModel<M extends true ? V[] : V>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: M extends true ? V[] : V): void;
  (e: 'clear'): void;
  (e: 'removeTag', option: AnyOption, value: V): void;
}>();

const labelKey = computed(() => fieldNames?.label ?? 'label');
const valueKey = computed(() => fieldNames?.value ?? 'value');
const disabledKey = computed(() => fieldNames?.disabled ?? 'disabled');
const iconKey = computed(() => fieldNames?.icon ?? 'icon');

/** 读取选项图标：仅对象选项且对应字段存在时返回 */
const getOptionIcon = (option: AnyOption): IconName | Component | undefined => {
  if (option !== null && typeof option === 'object' && iconKey.value in option) {
    return (option as Record<string, unknown>)[iconKey.value] as IconName | Component | undefined;
  }
  return undefined;
};

const selectedOption = computed(() => {
  if (isMultiple.value) return undefined;
  return options.find(opt => equalsValue(getOptionValue(opt), modelValue.value as V));
});

const currentTriggerIcon = computed<IconName | Component | undefined>(() => {
  if (icon) return icon;
  if (!isMultiple.value && selectedOption.value) {
    return getOptionIcon(selectedOption.value);
  }
  return undefined;
});

const isOpen = ref(false);
const dropdownRef = useTemplateRef<HTMLElement>('dropdownRef');
const optionEls = ref<Array<HTMLElement | null>>([]);
const filterInputRef = useTemplateRef<HTMLInputElement>('filterInputRef');
const searchQuery = ref('');

/** 收集选项 DOM（函数式 ref），供键盘导航聚焦使用 */
const setOptionEl = (el: unknown, index: number) => {
  if (el instanceof HTMLElement) {
    optionEls.value[index] = el;
  }
};

onBeforeUpdate(() => {
  optionEls.value = [];
});

const canScrollUp = ref(false);
const canScrollDown = ref(false);

const isMultiple = computed(() => multiple);

const SELECTOR_CONFIG: Record<'sm' | 'md' | 'lg', { triggerClass: string; itemClass: string }> = {
  sm: { triggerClass: 'h-[1.6rem] px-2 text-2xs', itemClass: 'h-[1.6rem]' },
  md: { triggerClass: 'h-[1.9rem] px-2.5 text-xs', itemClass: 'h-[1.9rem]' },
  lg: { triggerClass: 'h-[2.3rem] px-3.5 text-xs', itemClass: 'h-[2.3rem]' },
};

const currentConfig = computed(() => SELECTOR_CONFIG[size] ?? SELECTOR_CONFIG.md);

const ITEM_HEIGHT: Record<'sm' | 'md' | 'lg', number> = { sm: 1.6, md: 1.9, lg: 2.3 };
const GAP_REM = 0.125;
const PADDING_REM = 0.375 * 2;

// 对象类型 value 高性能稳健比较：优先使用主键/比较器，避免每次全量 JSON.stringify
const equalsValue = (a: V, b: V): boolean => {
  if (valueComparator) return valueComparator(a, b);
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;

  if (typeof a === 'object' && typeof b === 'object') {
    const vk = valueKey.value;
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    if (vk in aRecord && vk in bRecord) {
      return Object.is(aRecord[vk], bRecord[vk]);
    }
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
};

/** 读取选项展示文本：对象选项走 fieldNames.label，原始值直接字符串化 */
const getOptionLabel = (option: AnyOption): string => {
  if (option !== null && typeof option === 'object' && labelKey.value in option) {
    return String((option as Record<string, unknown>)[labelKey.value]);
  }
  return String(option);
};

/** 读取选项绑值：对象选项走 fieldNames.value，原始值即其自身 */
const getOptionValue = (option: AnyOption): V => {
  if (option !== null && typeof option === 'object' && valueKey.value in option) {
    return (option as Record<string, unknown>)[valueKey.value] as V;
  }
  return option as unknown as V;
};

/** 读取选项禁用态（原始值恒为可选项） */
const isOptionDisabled = (option: AnyOption): boolean => {
  return (
    option !== null && typeof option === 'object' && Boolean((option as Record<string, unknown>)[disabledKey.value])
  );
};

/** 选项展示文本：原始值选项支持 formatOption 自定义，其余走 label 字段 */
const formattedOption = (option: AnyOption): string => {
  if (formatOption && (typeof option === 'string' || typeof option === 'number')) return formatOption(option);
  return getOptionLabel(option);
};

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

const isNonDefault = computed(() => {
  if (defaultValue === undefined) return false;
  // isNonDefault 仅在非空单选路径参与 canClear；多选时 defaultValue 形态为 V[]，故此处断言为 V
  return !equalsValue(modelValue.value as V, defaultValue as V);
});

const canClear = computed(() => {
  if (isEmpty.value) return false;
  if (defaultValue !== undefined) {
    return isNonDefault.value;
  }
  return true;
});

const presetWidth = computed(() => resolveComponentWidth(width) ?? '100%');

const displayText = computed(() => {
  if (isMultiple.value) {
    if (!selectedValues.value.length) return placeholder;
    return `已选 ${selectedValues.value.length} 项`;
  }
  if (isEmpty.value) return placeholder;
  const currentOption = options.find(opt => isSelected(getOptionValue(opt)));
  if (currentOption !== undefined) {
    return formattedOption(currentOption);
  }
  return String(modelValue.value ?? '');
});

const dropdownMaxHeight = computed(() => {
  const list = filteredOptions.value;
  if (list.length === 0) return '6rem';
  const visibleCount = Math.min(Math.max(1, displayItems), list.length);
  const total = visibleCount * ITEM_HEIGHT[size] + (visibleCount - 1) * GAP_REM + PADDING_REM;
  return `${total}rem`;
});

/** 选择选项：多选切换勾选，单选写值后关闭面板 */
const handleSelect = (option: AnyOption, close: () => void) => {
  if (isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  if (isMultiple.value) {
    const arr = selectedValues.value.slice();
    const i = arr.findIndex(v => equalsValue(v, val));
    if (i >= 0) arr.splice(i, 1);
    else arr.push(val);
    modelValue.value = arr as unknown as M extends true ? V[] : V;
    emit('change', arr as unknown as M extends true ? V[] : V);
  } else {
    modelValue.value = val as unknown as M extends true ? V[] : V;
    emit('change', val as unknown as M extends true ? V[] : V);
    close();
  }
};

/** 移除多选 Tag：从选中集合剔除并派发 change / removeTag */
const handleRemoveTag = (option: AnyOption) => {
  if (disabled || isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  const arr = selectedValues.value.filter(v => !equalsValue(v, val));
  modelValue.value = arr as unknown as M extends true ? V[] : V;
  emit('change', arr as unknown as M extends true ? V[] : V);
  emit('removeTag', option, val);
};

/** 清空选择：回退到 defaultValue（多选为空数组）并派发 change / clear */
const handleClear = () => {
  if (disabled) return;
  const fallback = (defaultValue !== undefined
    ? defaultValue
    : isMultiple.value
      ? []
      : undefined) as unknown as M extends true ? V[] : V;
  modelValue.value = fallback;
  emit('change', modelValue.value);
  emit('clear');
};

/** 触发器键盘：方向键 / 回车 / 空格打开面板 */
const handleTriggerKeydown = (e: KeyboardEvent) => {
  if (disabled) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!isOpen.value) {
      isOpen.value = true;
    }
  }
};

/** 搜索框按 ↓：聚焦首个可用选项 */
const handleFilterKeydownDown = () => {
  const firstValidIndex = filteredOptions.value.findIndex(o => !isOptionDisabled(o));
  if (firstValidIndex !== -1) {
    optionEls.value[firstValidIndex]?.focus();
  }
};

/** 搜索框按回车：直接选中首个可用选项 */
const handleFilterKeydownEnter = (close: () => void) => {
  const firstValid = filteredOptions.value.find(o => !isOptionDisabled(o));
  if (firstValid) {
    handleSelect(firstValid, close);
  }
};

/** 列表键盘导航：跳过禁用项，↑ 在顶部时回到搜索框，Esc / Tab 关闭 */
const handleDropdownKeydown = (e: KeyboardEvent, close: () => void) => {
  const elements = optionEls.value;
  if (!elements || elements.length === 0) return;

  const currentIndex = elements.findIndex(el => el === document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIndex = currentIndex + 1;
    while (nextIndex < filteredOptions.value.length && isOptionDisabled(filteredOptions.value[nextIndex]!)) {
      nextIndex++;
    }
    if (nextIndex < filteredOptions.value.length) {
      elements[nextIndex]?.focus();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentIndex === 0 && filterable) {
      filterInputRef.value?.focus();
      return;
    }
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0 && isOptionDisabled(filteredOptions.value[prevIndex]!)) {
      prevIndex--;
    }
    if (prevIndex >= 0) {
      elements[prevIndex]?.focus();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'Tab') {
    close();
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

watch(
  () => options,
  () => {
    if (isOpen.value) {
      nextTick(checkScroll);
    }
  }
);

/** 根据滚动位置更新上下渐隐箭头的显隐 */
const checkScroll = () => {
  const el = dropdownRef.value;
  // 空选项时不显示滚动提示箭头（空占位可能略高于容器，但面板禁止滚动）
  if (!el || filteredOptions.value.length === 0) {
    canScrollUp.value = false;
    canScrollDown.value = false;
    return;
  }
  const threshold = 2;
  const isScrollable = el.scrollHeight > el.clientHeight + threshold;
  if (!isScrollable) {
    canScrollUp.value = false;
    canScrollDown.value = false;
    return;
  }
  canScrollUp.value = el.scrollTop > threshold;
  canScrollDown.value = el.scrollTop + el.clientHeight < el.scrollHeight - threshold;
};

// 打开后：将焦点移入列表（或搜索框），确保键盘方向键从当前/首个有效项开始定位
const scrollToSelected = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    const container = dropdownRef.value;
    if (!container) return;

    if (filterable) {
      filterInputRef.value?.focus();
    } else {
      const list = filteredOptions.value;
      const activeIdx = list.findIndex(o => isSelected(getOptionValue(o)));
      const targetIdx = activeIdx !== -1 ? activeIdx : 0;
      const targetElement = optionEls.value[targetIdx];
      if (targetElement) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = targetElement.getBoundingClientRect();
        const gapOffset = 6;
        if (itemRect.top - gapOffset < containerRect.top) {
          container.scrollTop -= containerRect.top - itemRect.top + gapOffset;
        } else if (itemRect.bottom + gapOffset > containerRect.bottom) {
          container.scrollTop += itemRect.bottom - containerRect.bottom + gapOffset;
        }
        targetElement.focus();
      }
    }

    checkScroll();
  });
};
</script>
