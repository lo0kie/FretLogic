<template>
  <div
    ref="referenceRef"
    v-wave="{ disabled }"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled || undefined"
    role="combobox"
    :aria-expanded="isOpen"
    aria-haspopup="listbox"
    class="selector-trigger-bar"
    :class="[
      `size-${size}`,
      {
        'is-active': isOpen,
        'is-disabled': disabled,
        'show-clear': clearable && canClear && !disabled,
      },
    ]"
    :data-focusable-inline="!disabled || undefined"
    v-bind="$attrs"
    @click="toggleDropdown"
    @keydown="handleTriggerKeydown"
  >
    <span
      class="label-zone"
      :class="[isEmpty && placeholder ? 'is-placeholder' : isNonDefault ? 'is-custom' : 'is-default']"
    >
      <span class="label-text">
        <slot name="label" :selected="modelValue">
          {{ displayText }}
        </slot>
      </span>
    </span>

    <!-- 同时存在，通过 CSS 控制显隐 -->
    <X
      v-if="clearable && canClear && !disabled"
      :size="14"
      :stroke-width="2.5"
      class="clear-icon"
      tabindex="-1"
      @pointerdown.stop.prevent
      @mousedown.stop.prevent
      @click.stop="handleClear"
    />
    <ChevronDown :size="14" :stroke-width="2.5" class="arrow-icon" :class="{ 'rotate-180': isOpen }" />
  </div>

  <Teleport to="body">
    <div
      v-if="isRendered"
      ref="floatingRef"
      v-on-click-outside="[() => (isOpen = false), { ignore: [referenceRef] }]"
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
        @after-leave="isRendered = false"
      >
        <div v-if="isOpen" class="dropdown-inner-container">
          <Transition name="hint-fade">
            <div v-if="canScrollUp" class="scroll-hint hint-top" aria-hidden="true">
              <ChevronUp :size="9" stroke-width="3" />
            </div>
          </Transition>

          <div
            ref="dropdownRef"
            role="listbox"
            tabindex="-1"
            class="selector-dropdown-box no-scrollbar"
            :style="{ maxHeight: dropdownMaxHeight }"
            @scroll.passive="checkScroll"
            @keydown="handleDropdownKeydown"
          >
            <EmptyState v-if="options.length === 0" size="sm" description="暂无选项" />
            <template v-else>
              <div
                v-for="(option, index) in options"
                :key="typeof getOptionValue(option) === 'object' ? index : String(getOptionValue(option))"
                ref="optionEls"
                v-wave="{ disabled: isOptionDisabled(option) }"
                role="option"
                :tabindex="isOptionDisabled(option) ? -1 : 0"
                :aria-selected="modelValue === option || modelValue === getOptionValue(option)"
                class="selector-item"
                data-focusable-inline
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
                <slot name="option" :option :index>
                  {{ formattedOption(option) }}
                </slot>
              </div>
            </template>
          </div>

          <Transition name="hint-fade">
            <div v-if="canScrollDown" class="scroll-hint hint-bottom" aria-hidden="true">
              <ChevronDown :size="9" stroke-width="3" />
            </div>
          </Transition>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts" generic="T">
import { HEIGHT_LG, HEIGHT_MD, HEIGHT_SM, SPACE_REM } from '@/utils/constants';
import { useFocusReturn } from '@/composables/useFocusReturn';
import { autoUpdate, flip, size as floatingSize, offset, shift, useFloating } from '@floating-ui/vue';
import { ChevronDown, ChevronUp, X } from '@lucide/vue';
import { vOnClickOutside } from '@vueuse/components';
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import EmptyState from './EmptyState.vue';
interface SelectorOptionObject<T> {
  label: string;
  value: T;
  disabled?: boolean;
}

defineOptions({ inheritAttrs: false });

const {
  options,
  size = 'md',
  width = 'auto',
  placeholder = '请选择...',
  clearable = false,
  disabled = false,
  defaultValue = undefined,
  highlightNonDefault = false,
  fontBlackItems = false,
  visibleCount = 6,
  formatter = undefined,
  labelFormatter = undefined,
  optionFormatter = undefined,
} = defineProps<{
  options: (T | SelectorOptionObject<T>)[];
  size?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  defaultValue?: T;
  highlightNonDefault?: boolean;
  fontBlackItems?: boolean;
  visibleCount?: number;
  formatter?: (value: T) => string;
  labelFormatter?: (value: T) => string;
  optionFormatter?: (value: T) => string;
  width?: 'auto' | 'full' | 'sm' | 'md' | 'lg';
}>();

const presetWidth = computed(() => {
  if (!width) return '100%';
  switch (width) {
    case 'auto':
      return 'auto';
    case 'full':
      return '100%';
    case 'sm':
      return '5.5rem';
    case 'md':
      return '8rem';
    case 'lg':
      return '11rem';
    default:
      return '100%';
  }
});

const modelValue = defineModel<T>({ required: true });
const emit = defineEmits<{
  (e: 'clear'): void;
}>();

const isOpen = ref(false);
const isRendered = ref(false);
const canScrollUp = ref(false);
const canScrollDown = ref(false);
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const dropdownRef = useTemplateRef<HTMLDivElement>('dropdownRef');
const optionEls = useTemplateRef<HTMLElement[]>('optionEls');
const { captureTrigger, restoreFocusAfter } = useFocusReturn({
  warnLabel: '[BaseSelector]',
});

const checkScroll = () => {
  const el = dropdownRef.value;
  if (!el) return;

  const { scrollTop, scrollHeight, clientHeight } = el;
  canScrollUp.value = scrollTop > 2;
  canScrollDown.value = scrollTop + clientHeight < scrollHeight - 2;
};

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

const isEmpty = computed(() => {
  return modelValue.value === '' || modelValue.value === null || modelValue.value === undefined;
});

const displayText = computed(() => {
  if (isEmpty.value && placeholder) {
    return placeholder;
  }
  return formattedLabel(modelValue.value);
});

const DROPDOWN_ITEM_HEIGHT = 1.9;
const DROPDOWN_PADDING_Y = SPACE_REM.XS;
const DROPDOWN_GAP = SPACE_REM.XS_2;
const DROPDOWN_BORDER_Y = 0.125;

const dropdownMaxHeight = computed(() => {
  const n = Math.max(1, visibleCount);
  const height =
    DROPDOWN_BORDER_Y + DROPDOWN_PADDING_Y * 2 + n * DROPDOWN_ITEM_HEIGHT + Math.max(0, n - 1) * DROPDOWN_GAP;
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

const canClear = computed(() => {
  if (defaultValue !== undefined) {
    return modelValue.value !== defaultValue;
  }

  return !isEmpty.value;
});

const handleClear = () => {
  if (disabled) return;
  modelValue.value = (defaultValue !== undefined ? defaultValue : '') as T;
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

watch(isOpen, open => {
  if (open) {
    isRendered.value = true;
    captureTrigger();
  }
});

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
  restoreFocusAfter(() => {
    isOpen.value = false;
  });
};

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
    restoreFocusAfter(() => {
      isOpen.value = false;
    });
  } else if (e.key === 'Tab') {
    e.preventDefault();
    restoreFocusAfter(() => {
      isOpen.value = false;
    });
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
    checkScroll();
  });
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

<style scoped lang="less">
@import '@/assets/tokens.module';

.selector-trigger-bar {
  position: relative;
  width: v-bind(presetWidth);
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
  border-radius: @radius-pill;
  cursor: pointer;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  color: var(--text-title);
  box-sizing: border-box;
  transition: @transition-fast;

  &:hover:not(.is-disabled) {
    border-color: var(--border-base);
  }

  &.is-active {
    border-color: @primary;
    box-shadow: inset 0 0 0 1px @primary;
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
    font-size: @fs-2xs;
  }

  &.size-md {
    height: v-bind(HEIGHT_MD);
    padding-left: 0.6rem;
    padding-right: 0.6rem;
    font-size: @fs-xs;
  }

  &.size-lg {
    height: v-bind(HEIGHT_LG);
    padding-left: 0.85rem;
    padding-right: 0.85rem;
    font-size: @fs-xs;
  }
}

.label-zone {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: @space-sm;
  flex: 1;
  min-width: 0;
  overflow: hidden;

  &.is-placeholder {
    color: var(--text-disabled);
    font-weight: 400;
  }

  &.is-custom {
    color: var(--color-primary);
  }

  &.is-default {
    color: var(--text-title);
  }
}

.label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

/* 默认状态下：隐藏清除图标，显示箭头 */
.clear-icon {
  display: none;
  color: var(--text-disabled);
  transition: color @duration-fast @bezier-standard;

  &:hover {
    color: var(--color-danger) !important;
  }
}

.arrow-icon {
  display: block;
  color: var(--text-disabled);
  transition: transform @duration-fast @bezier-standard;

  &.rotate-180 {
    transform: rotate(180deg);
  }
}

/* 当满足可清除条件（.show-clear）且处于 鼠标悬停、内部聚焦 或 下拉框展开（.is-active）时：显示 X，隐藏箭头 */
.selector-trigger-bar.show-clear:hover,
.selector-trigger-bar.show-clear:focus-within,
.selector-trigger-bar.show-clear.is-active {
  .clear-icon {
    display: block;
  }
  .arrow-icon {
    display: none;
  }
}

.floating-position-wrapper {
  z-index: var(--z-menu);
  pointer-events: auto;
  box-sizing: border-box;
}

.dropdown-inner-container {
  position: relative;
  width: 100%;
}

.scroll-hint {
  position: absolute;
  left: 0.25rem;
  right: 0.25rem;
  height: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  z-index: var(--z-panel);
  color: var(--text-disabled);
  pointer-events: none;
  transition: color @duration-fast ease;

  &.hint-top {
    top: 0.25rem;

    &::after {
      bottom: 0;
    }
  }

  &.hint-bottom {
    bottom: 0.25rem;

    &::after {
      top: 0;
    }
  }
}

.selector-dropdown-box {
  width: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  padding: @space-xs;
  gap: @space-2xs;
  transform-origin: top left;
  outline: none;
}

.selector-item {
  height: 1.9rem;
  padding-left: 0.625rem;
  padding-right: 0.625rem;
  display: flex;
  align-items: center;
  font-size: @fs-xs;
  color: var(--text-body);
  background-color: transparent;
  border-radius: @radius-lg;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;
  flex-shrink: 0;
  white-space: nowrap;
  outline: none;

  &:hover {
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }

  &.is-selected {
    background-color: var(--tint-primary-88) !important;
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
.fade-scale-transition(hint-fade);
</style>
