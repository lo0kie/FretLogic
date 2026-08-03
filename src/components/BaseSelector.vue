<template>
  <!-- 1. 触发条：移除 .prevent.stop，改用函数内精细化拦截 -->
  <div
    ref="referenceRef"
    tabindex="0"
    role="combobox"
    :aria-expanded="isOpen"
    aria-haspopup="listbox"
    class="selector-trigger-bar"
    :class="[`size-${size}`, { 'is-active': isOpen, 'is-disabled': disabled }]"
    @click="toggleDropdown"
    @keydown="handleTriggerKeydown"
  >
    <span class="label-zone" :class="[isNonDefault ? 'is-custom' : 'is-default']">
      <slot name="label" :selected="modelValue">
        {{ formattedLabel(modelValue) }}
      </slot>
    </span>

    <X
      v-if="clearable && isNonDefault && !disabled"
      :size="14"
      :stroke-width="2.5"
      class="clear-icon"
      tabindex="-1"
      @click.stop="handleClear"
    />

    <ChevronDown :size="14" :stroke-width="2.5" class="arrow-icon" :class="{ 'rotate-180': isOpen }" />
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      v-on-click-outside="[() => (isOpen = false), { ignore: [referenceRef] }]"
      ref="floatingRef"
      :style="floatingStyles"
      class="floating-position-wrapper"
      data-floating-layer
    >
      <Transition
        enter-from-class="dropdown-enter-from"
        leave-to-class="dropdown-leave-to"
        enter-active-class="dropdown-enter-active"
        leave-active-class="dropdown-leave-active"
        appear
      >
        <!-- 2. 下拉容器 -->
        <div
          ref="dropdownRef"
          role="listbox"
          tabindex="-1"
          class="selector-dropdown-box no-scrollbar"
          :style="{ maxHeight: dropdownMaxHeight }"
          @keydown="handleDropdownKeydown"
        >
          <!-- 3. 选项节点：移除模板行的 @keydown.esc.prevent.stop -->
          <div
            v-for="(option, index) in options"
            :key="index"
            ref="optionEls"
            role="option"
            :tabindex="isOptionDisabled(option) ? -1 : 0"
            :aria-selected="modelValue === option || modelValue === getOptionValue(option)"
            class="selector-item"
            :class="{
              'is-selected': modelValue === option || modelValue === getOptionValue(option),
              'is-item-disabled': isOptionDisabled(option),
              'font-black': fontBlackItems,
              'font-bold': !fontBlackItems,
            }"
            @click="handleSelect(option)"
            @keydown.enter.prevent.stop="handleSelect(option)"
            @keydown.space.prevent.stop="handleSelect(option)"
          >
            <slot name="option" :option="option" :index="index">
              {{ formattedOption(option) }}
            </slot>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts" generic="T">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM } from '@/constants';
import { autoUpdate, flip, size as floatingSize, offset, shift, useFloating } from '@floating-ui/vue';
import { ChevronDown, X } from '@lucide/vue';
import { vOnClickOutside } from '@vueuse/components';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

export interface SelectorOptionObject<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
}

const {
  options,
  size = 'md',
  clearable = false,
  disabled = false,
  defaultValue,
  highlightNonDefault = false,
  fontBlackItems = false,
  visibleCount = 6,
  formatter,
  labelFormatter,
  optionFormatter,
} = defineProps<{
  options: (T | SelectorOptionObject<T>)[];
  size?: 'sm' | 'md' | 'lg';
  clearable?: boolean;
  disabled?: boolean;
  defaultValue?: T;
  highlightNonDefault?: boolean;
  fontBlackItems?: boolean;
  visibleCount?: number;
  formatter?: (value: T) => string;
  labelFormatter?: (value: T) => string;
  optionFormatter?: (value: T) => string;
}>();

const modelValue = defineModel<T>({ required: true });

const emit = defineEmits<{
  (e: 'clear'): void;
}>();

const isOpen = ref(false);
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const dropdownRef = useTemplateRef<HTMLDivElement>('dropdownRef');
const optionEls = useTemplateRef<HTMLElement[]>('optionEls');

const formattedLabel = (val: T): string => {
  if (labelFormatter) return labelFormatter(val);
  if (formatter) return formatter(val);
  return String(val ?? '');
};

const formattedOption = (opt: T | SelectorOptionObject<T>): string => {
  const value = getOptionValue(opt);

  if (optionFormatter) return optionFormatter(value);
  if (formatter) return formatter(value);
  return String(value ?? '');
};

const ITEM_HEIGHT = 1.9;
const PADDING_Y = 0.25;
const GAP = 0.15;

const dropdownMaxHeight = computed(() => {
  const n = Math.max(1, visibleCount);
  const height = PADDING_Y * 2 + n * ITEM_HEIGHT + Math.max(0, n - 1) * GAP;
  return `${height}rem`;
});

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: 'bottom-start',
  strategy: 'fixed',
  whileElementsMounted: (reference, floating, update) =>
    autoUpdate(reference, floating, update, {
      ancestorScroll: true,
      elementResize: true,
    }),
  middleware: [
    offset(6),
    flip(),
    shift({ padding: 8 }),
    floatingSize({
      apply({ rects, elements }) {
        Object.assign(elements.floating.style, {
          width: `${rects.reference.width}px`,
        });
      },
    }),
  ],
});

const toggleDropdown = () => {
  if (disabled) return;
  isOpen.value = !isOpen.value;
};

const isNonDefault = computed(
  () => highlightNonDefault && defaultValue !== undefined && modelValue.value !== defaultValue
);

const handleClear = () => {
  if (disabled) return;
  modelValue.value = defaultValue!;
  emit('clear');
  isOpen.value = false;
  referenceRef.value?.focus();
};

watch(
  () => disabled,
  isDisabled => {
    if (isDisabled) isOpen.value = false;
  }
);

const getOptionValue = (opt: T | SelectorOptionObject<T>): T => {
  if (opt && typeof opt === 'object' && 'value' in opt) {
    return opt.value;
  }
  return opt as T;
};

const isOptionDisabled = (opt: T | SelectorOptionObject<T>): boolean => {
  if (opt && typeof opt === 'object' && 'disabled' in opt) {
    return Boolean(opt.disabled);
  }
  return false;
};

const handleSelect = (option: T | SelectorOptionObject<T>) => {
  if (disabled || isOptionDisabled(option)) return;
  modelValue.value = getOptionValue(option);
  isOpen.value = false;
  referenceRef.value?.focus();
};

// 🌟 精准按键拦截：仅在需要时 prevent/stop，不误伤 Modal
const handleTriggerKeydown = (e: KeyboardEvent) => {
  if (disabled) return;

  if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault();
    if (!isOpen.value) {
      isOpen.value = true;
    } else if (e.key === 'Enter' || e.key === ' ') {
      isOpen.value = false;
    }
  } else if (e.key === 'Escape' && isOpen.value) {
    e.preventDefault();
    e.stopPropagation();
    isOpen.value = false;
  }
  // 若 isOpen 为 false 且按下 Escape，不拦截，事件向上冒泡给 Modal 关闭自身
};

const handleDropdownKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value || !optionEls.value) return;

  const activeElement = document.activeElement as HTMLElement;
  const currentIndex = optionEls.value.indexOf(activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIdx = currentIndex < optionEls.value.length - 1 ? currentIndex + 1 : 0;
    optionEls.value[nextIdx]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prevIdx = currentIndex > 0 ? currentIndex - 1 : optionEls.value.length - 1;
    optionEls.value[prevIdx]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    isOpen.value = false;
    referenceRef.value?.focus();
  } else if (e.key === 'Tab') {
    isOpen.value = false;
    referenceRef.value?.focus();
  }
};

watch(isOpen, opened => {
  if (!opened) return;

  nextTick(() => {
    const container = dropdownRef.value;
    const idx = options.findIndex(opt => getOptionValue(opt) === modelValue.value);
    const targetIdx = idx !== -1 ? idx : 0;
    const targetElement = optionEls.value?.[targetIdx];

    if (targetElement) {
      targetElement.focus();
    }

    if (!container || !targetElement) return;

    const style = window.getComputedStyle(container);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;

    const itemTop = targetElement.offsetTop;
    const itemBottom = itemTop + targetElement.offsetHeight;

    const viewTop = container.scrollTop + paddingTop;
    const viewBottom = container.scrollTop + container.clientHeight - paddingBottom;

    if (itemTop < viewTop) {
      container.scrollTop = itemTop - paddingTop;
    } else if (itemBottom > viewBottom) {
      container.scrollTop = itemBottom - container.clientHeight + paddingBottom;
    }
  });
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.selector-trigger-bar {
  position: relative;
  width: 100%;

  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  border-radius: 9999px;
  cursor: pointer;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  color: var(--text-title);
  box-sizing: border-box;
  transition: @transition-fast;
  outline: none;

  &:hover:not(.is-disabled) {
    border-color: var(--border-base);
  }

  &:focus-visible,
  &.is-active {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
  }

  &.is-disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: auto;

    .label-zone,
    .arrow-icon,
    .clear-icon {
      cursor: not-allowed;
    }
  }

  &.size-sm {
    height: v-bind(HEIGHT_SM);
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    font-size: 0.68rem;
  }

  &.size-md {
    height: v-bind(HEIGHT_MD);
    padding-left: 0.65rem;
    padding-right: 0.65rem;
    font-size: 0.72rem;
  }

  &.size-lg {
    height: v-bind(HEIGHT_LG);
    padding-left: 0.85rem;
    padding-right: 0.85rem;
    font-size: 0.78rem;
  }
}

.label-zone {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;

  &.is-custom {
    color: var(--color-primary);
  }

  &.is-default {
    color: var(--text-title);
  }
}

.clear-icon {
  color: var(--text-disabled);
  transition: color @duration-fast @bezier-standard;

  &:hover {
    color: var(--color-danger) !important;
  }
}

.arrow-icon {
  color: var(--text-disabled);
  transition: transform @duration-fast @bezier-standard;

  &.rotate-180 {
    transform: rotate(180deg);
  }
}

.floating-position-wrapper {
  z-index: 9999;
  pointer-events: auto;
  box-sizing: border-box;
}

.selector-dropdown-box {
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  padding: 0.25rem;
  gap: 0.15rem;
  transform-origin: top left;
  outline: none;
}

.selector-item {
  height: 1.9rem;
  padding-left: 0.625rem;
  padding-right: 0.625rem;
  display: flex;
  align-items: center;
  font-size: 0.73rem;
  color: var(--text-body);
  background-color: transparent;
  border-radius: @radius-md;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;
  flex-shrink: 0;
  white-space: nowrap;
  outline: none;

  &:hover,
  &:focus-visible {
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }

  &.is-selected {
    background-color: color-mix(in srgb, @primary, transparent 88%) !important;
    color: @primary !important;
    font-weight: 700;
  }

  &.is-item-disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;

    &:hover {
      background-color: transparent;
      color: var(--text-body);
    }
  }
}

.fade-scale-transition(dropdown);
</style>
