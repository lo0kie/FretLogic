<template>
  <div ref="referenceRef" class="selector-trigger-bar" :class="{ 'is-active': isOpen }" @click="toggleDropdown">
    <span class="label-zone" :class="[isNonDefault ? 'is-custom' : 'is-default']">
      <slot name="label" :selected="modelValue">
        {{ formattedLabel(modelValue) }}
      </slot>
    </span>

    <X v-if="clearable && isNonDefault" :size="14" :stroke-width="2.5" class="clear-icon" @click.stop="handleClear" />

    <ChevronDown :size="14" :stroke-width="2.5" class="arrow-icon" :class="{ 'rotate-180': isOpen }" />
  </div>

  <Teleport to="body">
    <div v-if="isOpen" ref="floatingRef" :style="floatingStyles" class="floating-position-wrapper">
      <Transition
        enter-from-class="dropdown-enter-from"
        leave-to-class="dropdown-leave-to"
        enter-active-class="dropdown-enter-active"
        leave-active-class="dropdown-leave-active"
        appear
      >
        <div ref="dropdownRef" class="selector-dropdown-box no-scrollbar" :style="{ maxHeight: dropdownMaxHeight }">
          <div
            v-for="(option, index) in options"
            :key="index"
            ref="optionEls"
            @click="handleSelect(option)"
            class="selector-item"
            :class="{
              'is-selected': modelValue === option,
              'font-black': fontBlackItems,
              'font-bold': !fontBlackItems,
            }"
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
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue';
import { ChevronDown, X } from '@lucide/vue';
import { onClickOutside } from '@vueuse/core'; // 🌟 引入 onClickOutside
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

const {
  options,
  clearable = false,
  defaultValue,
  fontBlackItems = false,
  visibleCount = 6,
  formatter,
  labelFormatter,
  optionFormatter,
} = defineProps<{
  options: T[];
  clearable?: boolean;
  defaultValue?: T;
  fontBlackItems?: boolean;
  visibleCount?: number;
  formatter?: (value: T) => string;
  labelFormatter?: (value: T) => string;
  optionFormatter?: (value: T) => string;
}>();

const modelValue = defineModel<T>({ required: true });

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'wheel-change', direction: 'up' | 'down'): void;
}>();

const isOpen = ref(false);
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');
const dropdownRef = useTemplateRef<HTMLDivElement>('dropdownRef');

// ---------- 文本格式化计算 ----------
const formattedLabel = (val: T): string => {
  if (labelFormatter) return labelFormatter(val);
  if (formatter) return formatter(val);
  return String(val ?? '');
};

const formattedOption = (opt: T): string => {
  if (optionFormatter) return optionFormatter(opt);
  if (formatter) return formatter(opt);
  return String(opt ?? '');
};

// ---------- 高度计算（与 CSS 保持同步） ----------
const ITEM_HEIGHT = 1.9;
const PADDING_Y = 0.25;
const GAP = 0.15;

const dropdownMaxHeight = computed(() => {
  const n = Math.max(1, visibleCount);
  const height = PADDING_Y * 2 + n * ITEM_HEIGHT + Math.max(0, n - 1) * GAP;
  return `${height}rem`;
});

// ---------- Floating UI ----------
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
    size({
      apply({ rects, elements }) {
        Object.assign(elements.floating.style, {
          width: `${rects.reference.width}px`,
        });
      },
    }),
  ],
});

// ---------- 选项 DOM 引用 ----------
const optionEls = useTemplateRef<HTMLElement[]>('optionEls');

// ---------- 交互逻辑 ----------
const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const isNonDefault = computed(() => modelValue.value !== defaultValue);

const handleClear = () => {
  modelValue.value = defaultValue!;
  emit('clear');
  isOpen.value = false;
};

const handleSelect = (option: T) => {
  modelValue.value = option;
  isOpen.value = false;
};

// 🌟 优化：使用 onClickOutside 替代手动判断
// 监听 referenceRef 的外部点击，忽略对 floatingRef 的点击
onClickOutside(
  referenceRef,
  () => {
    if (isOpen.value) {
      isOpen.value = false;
    }
  },
  { ignore: [floatingRef] }
);

// 打开时滚动到当前选中项
watch(isOpen, opened => {
  if (!opened) return;

  nextTick(() => {
    const container = dropdownRef.value;
    const idx = options.indexOf(modelValue.value);
    const targetElement = idx !== -1 ? optionEls.value?.[idx] : null;

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
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  user-select: none;
  height: 2.2rem;
  border-radius: 9999px;
  cursor: pointer;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  color: var(--text-title);
  box-sizing: border-box;
  transition: @transition-fast;

  &:hover {
    border-color: var(--border-base);
  }

  &.is-active {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
  }
}

.label-zone {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &.is-custom {
    color: var(--color-primary);
    font-size: 0.78rem;
  }

  &.is-default {
    color: var(--text-title);
    font-size: 0.75rem;
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

  &:hover {
    background-color: var(--bg-panel-hover);
    color: var(--text-title);
  }

  &.is-selected {
    background-color: color-mix(in srgb, @primary, transparent 88%) !important;
    color: @primary !important;
    font-weight: 700;
  }
}

.fade-scale-transition(dropdown);
</style>
