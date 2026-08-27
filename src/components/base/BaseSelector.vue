<template>
  <BasePopover
    v-model="isOpen"
    placement="bottom-start"
    :offset-distance="6"
    :disabled="disabled"
    :auto-focus="false"
    match-trigger-width
    :block="width === 'full'"
    panel-class="p-0 overflow-hidden"
    @open="scrollToSelected"
  >
    <template #trigger="{ isOpen: _isOpen, toggle }">
      <div
        ref="referenceRef"
        v-wave="{ disabled }"
        :tabindex="disabled ? -1 : 0"
        :aria-disabled="disabled || undefined"
        role="combobox"
        :aria-expanded="_isOpen"
        aria-haspopup="listbox"
        :style="{ width: presetWidth }"
        class="group relative flex items-center justify-between select-none rounded-full cursor-pointer bg-bg-body border border-border-light text-text-title box-border transition-all duration-150 outline-none hover:border-border-base focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/70"
        :class="[
          currentConfig.triggerClass,
          _isOpen ? 'border-primary ring-1 ring-primary' : '',
          { 'opacity-45 cursor-not-allowed': disabled },
        ]"
        :data-focusable-inline="!disabled || undefined"
        v-bind="$attrs"
        @click="toggle"
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
          <span class="overflow-hidden text-ellipsis whitespace-nowrap w-full">
            <slot name="label" :selected="modelValue"> {{ displayText }} </slot>
          </span>
        </span>

        <template v-if="clearable && canClear && !disabled">
          <X
            :size="14"
            :stroke-width="2.5"
            class="hidden group-hover:block group-focus-within:block cursor-pointer text-text-disabled hover:text-danger transition-colors shrink-0"
            tabindex="-1"
            @pointerdown.stop.prevent
            @mousedown.stop.prevent
            @click.stop="handleClear"
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
        <Transition name="v-transition-fade">
          <div
            v-if="canScrollUp"
            class="absolute left-1 right-1 top-1 h-2 flex items-center justify-center z-panel text-text-disabled pointer-events-none transition-colors"
            aria-hidden="true"
          >
            <ChevronUp :size="9" stroke-width="3" />
          </div>
        </Transition>

        <div
          ref="dropdownRef"
          role="listbox"
          tabindex="-1"
          class="no-scrollbar w-full overflow-y-auto flex flex-col box-border p-xs gap-0.5 outline-none"
          :style="{ maxHeight: dropdownMaxHeight }"
          @scroll.passive="checkScroll"
          @keydown="handleDropdownKeydown($event, close)"
        >
          <div
            v-if="options.length === 0"
            class="flex flex-col items-center justify-center py-6 w-full min-h-[5.5rem] box-border m-auto"
          >
            <EmptyState size="sm" description="暂无选项" />
          </div>
          <template v-else>
            <div
              v-for="(option, index) in options"
              :key="typeof getOptionValue(option) === 'object' ? index : String(getOptionValue(option))"
              ref="optionEls"
              v-wave="{ disabled: isOptionDisabled(option) }"
              role="option"
              :tabindex="isOptionDisabled(option) ? -1 : 0"
              :aria-selected="modelValue === option || modelValue === getOptionValue(option)"
              class="h-[1.9rem] px-2.5 flex items-center justify-between text-xs text-text-body bg-transparent rounded-lg box-border cursor-pointer transition-colors shrink-0 outline-none hover:bg-bg-panel-hover hover:text-text-title gap-2 min-w-0"
              data-focusable-inline
              :class="[
                modelValue === option || modelValue === getOptionValue(option)
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
                v-if="modelValue === option || modelValue === getOptionValue(option)"
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
            <ChevronDown :size="9" stroke-width="3" />
          </div>
        </Transition>
      </div>
    </template>
  </BasePopover>
</template>

<script setup lang="ts" generic="T">
import BasePopover from '@/components/base/BasePopover.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { resolveComponentWidth, type FormComponentWidth } from '@/utils/core/constants';
import { Check, ChevronDown, ChevronUp, X } from '@lucide/vue';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

interface SelectorOptionObject<T> {
  label: string;
  value: T;
  disabled?: boolean;
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
} = defineProps<{
  options: Array<SelectorOptionObject<T> | string | number>;
  size?: 'sm' | 'md' | 'lg';
  width?: FormComponentWidth;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  displayItems?: number;
  defaultValue?: T;
  fontBlackItems?: boolean;
  formatOption?: (opt: SelectorOptionObject<T> | string | number) => string;
}>();

const modelValue = defineModel<T>({ required: true });

const emit = defineEmits<{
  (e: 'change', value: T): void;
  (e: 'clear'): void;
}>();

const isOpen = ref(false);
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const dropdownRef = useTemplateRef<HTMLElement>('dropdownRef');
const optionEls = useTemplateRef<HTMLElement[]>('optionEls');

const canScrollUp = ref(false);
const canScrollDown = ref(false);

const SELECTOR_CONFIG: Record<'sm' | 'md' | 'lg', { triggerClass: string }> = {
  sm: { triggerClass: 'h-[1.6rem] px-2 text-2xs' },
  md: { triggerClass: 'h-[1.9rem] px-2.5 text-xs' },
  lg: { triggerClass: 'h-[2.3rem] px-3.5 text-xs' },
};

const currentConfig = computed(() => SELECTOR_CONFIG[size] ?? SELECTOR_CONFIG.md);

const checkScroll = () => {
  const el = dropdownRef.value;
  if (!el) {
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

const getOptionLabel = (option: SelectorOptionObject<T> | string | number): string => {
  if (typeof option === 'object' && option !== null && 'label' in option) {
    return String(option.label);
  }
  return String(option);
};

const getOptionValue = (option: SelectorOptionObject<T> | string | number): T => {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return option.value;
  }
  return option as unknown as T;
};

const isOptionDisabled = (option: SelectorOptionObject<T> | string | number): boolean => {
  return typeof option === 'object' && option !== null && Boolean(option.disabled);
};

const formattedOption = (option: SelectorOptionObject<T> | string | number): string => {
  if (formatOption) return formatOption(option);
  return getOptionLabel(option);
};

const displayText = computed(() => {
  if (isEmpty.value) return placeholder;
  const currentOption = options.find(opt => getOptionValue(opt) === modelValue.value);
  if (currentOption !== undefined) {
    return formattedOption(currentOption);
  }
  return String(modelValue.value ?? '');
});

const isEmpty = computed(() => modelValue.value === undefined || modelValue.value === null || modelValue.value === '');
const canClear = computed(() => !isEmpty.value);

const isNonDefault = computed(() => {
  if (defaultValue === undefined) return false;
  return modelValue.value !== defaultValue;
});

const presetWidth = computed(() => resolveComponentWidth(width) ?? '100%');

const ITEM_HEIGHT_REM = 1.9;
const GAP_REM = 0.125;
const PADDING_REM = 0.375 * 2;

const dropdownMaxHeight = computed(() => {
  if (options.length === 0) return '6rem';
  const visibleCount = Math.min(Math.max(1, displayItems), options.length);
  const total = visibleCount * ITEM_HEIGHT_REM + (visibleCount - 1) * GAP_REM + PADDING_REM;
  return `${total}rem`;
});

const handleSelect = (option: SelectorOptionObject<T> | string | number, close: () => void) => {
  if (isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  modelValue.value = val;
  emit('change', val);
  close();
  referenceRef.value?.focus();
};

const handleClear = () => {
  if (disabled) return;
  const fallback = defaultValue !== undefined ? defaultValue : (undefined as unknown as T);
  modelValue.value = fallback;
  emit('change', fallback);
  emit('clear');
  referenceRef.value?.focus();
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

const handleDropdownKeydown = (e: KeyboardEvent, close: () => void) => {
  const elements = optionEls.value;
  if (!elements || elements.length === 0) return;

  const currentIndex = elements.findIndex(el => el === document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIndex = currentIndex + 1;
    while (nextIndex < options.length && isOptionDisabled(options[nextIndex]!)) {
      nextIndex++;
    }
    if (nextIndex < options.length) {
      elements[nextIndex]?.focus();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0 && isOptionDisabled(options[prevIndex]!)) {
      prevIndex--;
    }
    if (prevIndex >= 0) {
      elements[prevIndex]?.focus();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
    referenceRef.value?.focus();
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

const scrollToSelected = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    const container = dropdownRef.value;
    const idx = options.findIndex(opt => getOptionValue(opt) === modelValue.value);
    const targetIdx = idx !== -1 ? idx : 0;
    const targetElement = optionEls.value?.[targetIdx];

    if (targetElement) {
      targetElement.focus({ preventScroll: true });
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = targetElement.getBoundingClientRect();
        const gapOffset = 6; // 额外预留 gap 缓冲距离，避免紧贴容器边缘
        if (itemRect.top - gapOffset < containerRect.top) {
          container.scrollTop -= containerRect.top - itemRect.top + gapOffset;
        } else if (itemRect.bottom + gapOffset > containerRect.bottom) {
          container.scrollTop += itemRect.bottom - containerRect.bottom + gapOffset;
        }
      } else {
        targetElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    checkScroll();
  });
};

watch(isOpen, opened => {
  if (opened) {
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
</script>
