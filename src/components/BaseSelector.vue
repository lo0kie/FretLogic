<template>
  <div ref="containerRef" class="relative-container">
    <div
      ref="referenceRef"
      @click="toggleDropdown"
      @wheel="handleWheel"
      class="selector-trigger-bar"
      :class="{ 'is-active': isOpen }"
    >
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
              :ref="el => setOptionRef(el, option)"
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
  </div>
</template>

<script setup lang="ts" generic="T">
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/vue';
import { ChevronDown, X } from '@lucide/vue';
import { useEventListener } from '@vueuse/core';
import { computed, nextTick, onBeforeUpdate, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: T[];
    clearable?: boolean;
    defaultValue?: T;
    fontBlackItems?: boolean;
    /** 可视区域内最多显示的选项数量，默认 6 */
    visibleCount?: number;
    /** 🌟 通用格式化函数（若未单独指定 labelFormatter/optionFormatter，则两者均使用此函数） */
    formatter?: (value: T) => string;
    /** 🌟 专属：仅用于格式化选中后显示在触发栏上的文本 */
    labelFormatter?: (value: T) => string;
    /** 🌟 专属：仅用于格式化下拉菜单中每一项的文本 */
    optionFormatter?: (value: T) => string;
  }>(),
  {
    clearable: false,
    fontBlackItems: false,
    visibleCount: 6,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
  (e: 'clear'): void;
  (e: 'wheel-change', direction: 'up' | 'down'): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);
const referenceRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);
const dropdownRef = ref<HTMLDivElement | null>(null);

// ---------- 文本格式化计算 ----------
const formattedLabel = (val: T): string => {
  if (props.labelFormatter) return props.labelFormatter(val);
  if (props.formatter) return props.formatter(val);
  return String(val ?? '');
};

const formattedOption = (opt: T): string => {
  if (props.optionFormatter) return props.optionFormatter(opt);
  if (props.formatter) return props.formatter(opt);
  return String(opt ?? '');
};

// ---------- 高度计算（与 CSS 保持同步） ----------
const ITEM_HEIGHT = 1.9; // rem，对应 .selector-item height
const PADDING_Y = 0.25; // rem，上下各 0.25rem
const GAP = 0.15; // rem，对应 gap

const dropdownMaxHeight = computed(() => {
  const n = Math.max(1, props.visibleCount);
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
const optionRefsMap = new Map<T, HTMLElement>();

const setOptionRef = (el: unknown, option: T) => {
  if (el) {
    optionRefsMap.set(option, el as HTMLElement);
  }
};

onBeforeUpdate(() => {
  optionRefsMap.clear();
});

// ---------- 交互逻辑 ----------
const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const isNonDefault = computed(() => props.modelValue !== props.defaultValue);

let wheelAccumulator = 0;
const WHEEL_THRESHOLD = 35;

const handleWheel = (e: WheelEvent) => {
  if (isOpen.value) return;

  e.preventDefault();
  wheelAccumulator += e.deltaY;

  if (Math.abs(wheelAccumulator) < WHEEL_THRESHOLD) return;

  emit('wheel-change', wheelAccumulator < 0 ? 'up' : 'down');
  wheelAccumulator = 0;
};

const handleClear = () => {
  emit('update:modelValue', props.defaultValue!);
  emit('clear');
  isOpen.value = false;
};

const handleSelect = (option: T) => {
  emit('update:modelValue', option);
  isOpen.value = false;
};

// 点击外部关闭
useEventListener(window, 'pointerdown', e => {
  const target = e.target as Node;
  if (
    isOpen.value &&
    containerRef.value &&
    !containerRef.value.contains(target) &&
    floatingRef.value &&
    !floatingRef.value.contains(target)
  ) {
    isOpen.value = false;
  }
});

// 打开时滚动到当前选中项
watch(isOpen, opened => {
  if (!opened) return;

  nextTick(() => {
    const container = dropdownRef.value;
    const targetElement = optionRefsMap.get(props.modelValue);

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

.relative-container {
  position: relative;
  width: 100%;
}

.selector-trigger-bar {
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

.dropdown-enter-active {
  transition:
    opacity @duration-fast ease-out,
    transform @duration-fast ease-out;
}

.dropdown-leave-active {
  transition:
    opacity @duration-fast ease-in,
    transform @duration-fast ease-in;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-0.3rem) scale(0.96);
}
</style>
