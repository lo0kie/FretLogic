<template>
  <BasePopover
    v-model="isOpen"
    placement="bottom-start"
    :offset-distance="6"
    :disabled="disabled"
    match-trigger-width
    :block="width === 'full'"
    panel-class="p-0 overflow-hidden"
    @open="scrollToSelected"
  >
    <template #trigger="{ isOpen: _isOpen }">
      <div
        ref="referenceRef"
        v-wave="{ disabled }"
        :tabindex="disabled ? -1 : 0"
        :aria-disabled="disabled || undefined"
        role="combobox"
        :aria-expanded="_isOpen"
        aria-haspopup="listbox"
        :style="{ width: presetWidth }"
        class="group relative flex items-center justify-between select-none rounded-full bg-bg-body border border-border-light text-text-title box-border transition-all duration-150 outline-none hover:border-border-base focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/70"
        :class="[
          currentConfig.triggerClass,
          _isOpen ? 'border-primary ring-1 ring-primary' : '',
          disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer',
        ]"
        :data-focusable-inline="!disabled || undefined"
        v-bind="$attrs"
        @keydown="handleTriggerKeydown($event)"
      >
        <span
          class="font-semibold flex items-center gap-sm flex-1 min-w-0 overflow-hidden"
          :class="[
            isEmpty && placeholder
              ? 'text-text-disabled font-normal'
              : isNonDefault
                ? 'text-primary'
                : 'text-text-title',
          ]"
        >
          <slot name="prefix" />
          <span class="overflow-hidden text-ellipsis whitespace-nowrap w-full flex items-center gap-1">
            <template v-if="isMultiple && selectedValues.length">
              <span
                v-for="opt in displayedTags"
                :key="String(getOptionValue(opt))"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-tint-primary-90 text-primary text-2xs font-bold shrink-0 max-w-[8rem]"
              >
                <span class="truncate">{{ formattedOption(opt) }}</span>
                <X
                  :size="10"
                  :stroke-width="3"
                  class="cursor-pointer opacity-60 hover:opacity-100 hover:text-danger shrink-0"
                  title="移除"
                  aria-label="移除选项"
                  @pointerdown.stop.prevent
                  @mousedown.stop.prevent
                  @click.stop.prevent="handleRemoveTag(opt)"
                />
              </span>
              <span
                v-if="collapsedCount > 0"
                class="inline-flex items-center px-1.5 py-0.5 rounded bg-bg-panel-hover text-text-muted text-2xs font-bold shrink-0"
              >
                +{{ collapsedCount }}
              </span>
            </template>
            <slot v-else name="label" :selected="modelValue"> {{ displayText }} </slot>
          </span>
          <slot name="suffix" />
        </span>

        <template v-if="clearable && canClear && !disabled">
          <X
            :size="14"
            :stroke-width="2.5"
            class="hidden group-hover:block group-focus-within:block cursor-pointer text-text-disabled hover:text-danger transition-colors shrink-0 bg-bg-body"
            tabindex="-1"
            title="清空"
            aria-label="清空选择"
            @pointerdown.stop.prevent
            @mousedown.stop.prevent
            @click.stop.prevent="handleClear"
          />
          <ChevronDown
            :size="14"
            :stroke-width="2.5"
            class="block group-hover:hidden group-focus-within:hidden text-text-disabled transition-transform duration-200 shrink-0"
            :class="{ 'rotate-180': _isOpen }"
          />
        </template>
        <ChevronDown
          v-else
          :size="14"
          :stroke-width="2.5"
          class="block text-text-disabled transition-transform duration-200 shrink-0"
          :class="{ 'rotate-180': _isOpen }"
        />
      </div>
    </template>

    <template #default="{ close }">
      <div class="dropdown-inner-container relative w-full flex flex-col">
        <div v-if="$slots.header || filterable" class="shrink-0 border-b border-glass-border">
          <div v-if="filterable" class="px-2 py-1.5">
            <input
              ref="filterInputRef"
              v-model="searchQuery"
              type="text"
              :placeholder="filterPlaceholder"
              class="w-full h-7 px-2 text-xs rounded border border-border-light bg-bg-body outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
              @keydown.down.prevent="handleFilterKeydownDown"
              @keydown.enter.prevent="handleFilterKeydownEnter(close)"
              @pointerdown.stop
            />
          </div>
          <slot name="header" />
        </div>

        <Transition name="v-transition-fade">
          <div
            v-if="canScrollUp"
            class="absolute left-1 right-1 top-1 h-2 flex items-center justify-center z-panel text-text-disabled pointer-events-none transition-colors"
            aria-hidden="true"
          >
            <ChevronUp :size="9" :stroke-width="3" />
          </div>
        </Transition>

        <div
          ref="dropdownRef"
          role="listbox"
          tabindex="-1"
          :aria-multiselectable="isMultiple || undefined"
          class="no-scrollbar w-full overflow-y-auto flex flex-col box-border p-xs gap-0.5 outline-none"
          :style="{
            maxHeight: dropdownMaxHeight,
            // 空选项时禁止滚动（空占位可能略高于容器，避免出现可滚动的空面板）
            ...(filteredOptions.length === 0 ? { overflow: 'hidden' } : {}),
          }"
          @scroll.passive="checkScroll"
          @keydown="handleDropdownKeydown($event, close)"
        >
          <div
            v-if="filteredOptions.length === 0"
            class="flex flex-col items-center justify-center py-6 w-full min-h-[5.5rem] box-border m-auto"
          >
            <EmptyState size="sm" :description="filterable ? '无匹配结果' : '暂无选项'" />
          </div>
          <template v-else>
            <div
              v-for="(option, index) in filteredOptions"
              :key="index"
              :ref="el => setOptionEl(el, index)"
              v-wave="{ disabled: isOptionDisabled(option) }"
              role="option"
              :tabindex="isOptionDisabled(option) ? -1 : 0"
              :aria-selected="isSelected(getOptionValue(option))"
              class="px-2.5 flex items-center justify-between text-xs text-text-body bg-transparent rounded-lg box-border cursor-pointer transition-colors shrink-0 outline-none hover:bg-bg-panel-hover hover:text-text-title gap-2 min-w-0"
              :class="[
                currentConfig.itemClass,
                isSelected(getOptionValue(option))
                  ? '!bg-tint-primary-88 !text-primary font-bold'
                  : fontBlackItems
                    ? 'font-black'
                    : 'font-bold',
                { 'opacity-40 cursor-not-allowed pointer-events-none': isOptionDisabled(option) },
              ]"
              @click="handleSelect(option, close)"
              @keydown.enter.prevent.stop="handleSelect(option, close)"
              @keydown.space.prevent.stop="handleSelect(option, close)"
            >
              <span class="truncate flex-1 min-w-0 max-w-full">
                <slot name="option" :option="option" :index="index">
                  {{ formattedOption(option) }}
                </slot>
              </span>
              <Check
                v-if="isSelected(getOptionValue(option))"
                :size="13"
                :stroke-width="2.5"
                class="shrink-0 text-primary"
                aria-hidden="true"
              />
            </div>
          </template>
        </div>

        <Transition name="v-transition-fade">
          <div
            v-if="canScrollDown"
            class="absolute left-1 right-1 bottom-1 h-2 flex items-center justify-center z-panel text-text-disabled pointer-events-none transition-colors"
            aria-hidden="true"
          >
            <ChevronDown :size="9" :stroke-width="3" />
          </div>
        </Transition>

        <slot v-if="$slots.footer" name="footer" />
      </div>
    </template>
  </BasePopover>
</template>

<script setup lang="ts" generic="T">
import BasePopover from '@/components/base/BasePopover.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { resolveComponentWidth, type FormComponentWidth } from '@/utils/core/constants';
import { Check, ChevronDown, ChevronUp, X } from '@lucide/vue';
import { computed, nextTick, onBeforeUpdate, ref, useTemplateRef, watch } from 'vue';

type AnyOption = Record<string, unknown> | string | number;

interface SelectorFieldNames {
  label?: string;
  value?: string;
  disabled?: string;
}

defineOptions({ inheritAttrs: false });

const {
  options,
  size = 'md',
  width = 'full',
  placeholder = '请选择...',
  clearable = false,
  disabled = false,
  displayItems = 6,
  defaultValue = undefined,
  fontBlackItems = false,
  formatOption = undefined,
  multiple = false,
  maxTagCount = undefined,
  collapseTags = false,
  fieldNames = undefined,
  filterable = false,
  filterPlaceholder = '搜索...',
  filterMethod = undefined,
  valueComparator = undefined,
} = defineProps<{
  options: Array<Record<string, unknown> | string | number>;
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  displayItems?: number;
  defaultValue?: T;
  fontBlackItems?: boolean;
  formatOption?: (opt: AnyOption) => string;
  multiple?: boolean;
  /** 多选模式下最多展示的 Tag 数量 */
  maxTagCount?: number;
  /** 多选模式下是否折叠超出的 Tag 为 +N */
  collapseTags?: boolean;
  fieldNames?: SelectorFieldNames;
  filterable?: boolean;
  filterPlaceholder?: string;
  filterMethod?: (query: string, option: AnyOption) => boolean;
  /** 自定义值相等比较器 */
  valueComparator?: (a: unknown, b: unknown) => boolean;
}>();

const modelValue = defineModel<T | T[]>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: T | T[]): void;
  (e: 'clear'): void;
  (e: 'removeTag', option: AnyOption, value: T): void;
}>();

const labelKey = computed(() => fieldNames?.label ?? 'label');
const valueKey = computed(() => fieldNames?.value ?? 'value');
const disabledKey = computed(() => fieldNames?.disabled ?? 'disabled');

const isOpen = ref(false);
const dropdownRef = useTemplateRef<HTMLElement>('dropdownRef');
const optionEls = ref<Array<HTMLElement | null>>([]);
const filterInputRef = useTemplateRef<HTMLInputElement>('filterInputRef');
const searchQuery = ref('');

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
const equalsValue = (a: unknown, b: unknown): boolean => {
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

const getOptionLabel = (option: AnyOption): string => {
  if (option !== null && typeof option === 'object' && labelKey.value in option) {
    return String((option as Record<string, unknown>)[labelKey.value]);
  }
  return String(option);
};

const getOptionValue = (option: AnyOption): T => {
  if (option !== null && typeof option === 'object' && valueKey.value in option) {
    return (option as Record<string, unknown>)[valueKey.value] as T;
  }
  return option as unknown as T;
};

const isOptionDisabled = (option: AnyOption): boolean => {
  return (
    option !== null && typeof option === 'object' && Boolean((option as Record<string, unknown>)[disabledKey.value])
  );
};

const formattedOption = (option: AnyOption): string => {
  if (formatOption) return formatOption(option);
  return getOptionLabel(option);
};

const selectedValues = computed<T[]>(() =>
  isMultiple.value ? (Array.isArray(modelValue.value) ? (modelValue.value as T[]) : []) : [modelValue.value as T]
);

const isSelected = (val: T): boolean => selectedValues.value.some(v => equalsValue(v, val));

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
  return !equalsValue(modelValue.value, defaultValue);
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

const handleSelect = (option: AnyOption, close: () => void) => {
  if (isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  if (isMultiple.value) {
    const arr = selectedValues.value.slice();
    const i = arr.findIndex(v => equalsValue(v, val));
    if (i >= 0) arr.splice(i, 1);
    else arr.push(val);
    modelValue.value = arr as T | T[];
    emit('change', arr);
  } else {
    modelValue.value = val;
    emit('change', val);
    close();
  }
};

const handleRemoveTag = (option: AnyOption) => {
  if (disabled || isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  const arr = selectedValues.value.filter(v => !equalsValue(v, val));
  modelValue.value = arr as T | T[];
  emit('change', arr);
  emit('removeTag', option, val);
};

const handleClear = () => {
  if (disabled) return;
  const fallback = defaultValue !== undefined ? defaultValue : (undefined as unknown as T);
  modelValue.value = isMultiple.value ? [] : fallback;
  emit('change', modelValue.value);
  emit('clear');
};

const handleTriggerKeydown = (e: KeyboardEvent) => {
  if (disabled) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!isOpen.value) {
      isOpen.value = true;
    }
  }
};

const handleFilterKeydownDown = () => {
  const firstValidIndex = filteredOptions.value.findIndex(o => !isOptionDisabled(o));
  if (firstValidIndex !== -1) {
    optionEls.value[firstValidIndex]?.focus();
  }
};

const handleFilterKeydownEnter = (close: () => void) => {
  const firstValid = filteredOptions.value.find(o => !isOptionDisabled(o));
  if (firstValid) {
    handleSelect(firstValid, close);
  }
};

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
