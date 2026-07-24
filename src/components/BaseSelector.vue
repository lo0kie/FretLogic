<template>
  <div ref="containerRef" class="relative-container">
    <div
      @click="toggleDropdown"
      @wheel="handleWheel"
      class="selector-trigger-bar group"
      :class="{ 'is-active': isOpen }"
    >
      <span class="label-zone" :class="[isNonDefault ? 'is-custom' : 'is-default']">
        <slot name="label" :selected="modelValue">
          {{ modelValue }}
        </slot>
      </span>

      <X v-if="clearable && isNonDefault" :size="18" :stroke-width="3" class="clear-icon" @click.stop="handleClear" />

      <ChevronDown
        :size="18"
        :stroke-width="3"
        class="arrow-icon"
        :class="[{ 'rotate-180': isOpen }, clearable && isNonDefault ? 'has-clear' : '']"
      />
    </div>

    <Transition
      enter-from-class="dropdown-enter-from"
      leave-to-class="dropdown-leave-to"
      enter-active-class="dropdown-enter-active"
      leave-active-class="dropdown-leave-active"
    >
      <div v-if="isOpen" ref="dropdownRef" class="selector-dropdown-box no-scrollbar">
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
            {{ option }}
          </slot>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts" generic="T">
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
  }>(),
  {
    clearable: false,
    fontBlackItems: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value?: T): void;
  (e: 'clear'): void;
  (e: 'wheel-change', direction: 'up' | 'down'): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);
const dropdownRef = ref<HTMLDivElement | null>(null);

const optionRefsMap = new Map<T, HTMLElement>();

const setOptionRef = (el: unknown, option: T) => {
  if (el) {
    optionRefsMap.set(option, el as HTMLElement);
  }
};

onBeforeUpdate(() => {
  optionRefsMap.clear();
});

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
  emit('update:modelValue', props.defaultValue);
  emit('clear');
  isOpen.value = false;
};

const handleSelect = (option: T) => {
  emit('update:modelValue', option);
  isOpen.value = false;
};

useEventListener(window, 'pointerdown', e => {
  if (isOpen.value && containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
});

watch(isOpen, opened => {
  if (opened) {
    nextTick(() => {
      const container = dropdownRef.value;
      const targetElement = optionRefsMap.get(props.modelValue);

      if (!container || !targetElement) return;

      const computedStyle = window.getComputedStyle(container);
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();

      const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
      const relativeBottom = relativeTop + targetRect.height;

      const viewVisibleTop = container.scrollTop + paddingTop;
      const viewVisibleBottom = container.scrollTop + containerRect.height - paddingBottom;

      if (relativeTop < viewVisibleTop) {
        container.scrollTop = relativeTop - paddingTop;
      } else if (relativeBottom > viewVisibleBottom) {
        container.scrollTop = relativeBottom - containerRect.height + paddingBottom;
      }
    });
  }
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
  height: 2.5rem;
  border-radius: @radius-lg;
  cursor: pointer;
  background-color: var(--bg-body);
  border: @border-solid-base;
  color: var(--text-title);
  box-sizing: border-box;
  transition:
    border-color @transition-fast,
    box-shadow @transition-fast,
    background-color @transition-fast;

  &:hover {
    border-color: color-mix(in srgb, @primary, transparent 50%);
  }

  &.is-active {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
    background-color: var(--bg-panel);
  }
}

.label-zone {
  font-weight: 900;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &.is-custom {
    color: var(--color-primary);
    font-size: 0.79rem;
  }

  &.is-default {
    color: var(--text-title);
    font-size: 0.692rem;
  }
}

.clear-icon {
  display: none;
  color: var(--text-disabled);
  transition: color @duration-fast @bezier-standard;

  .group:hover & {
    display: block;
  }

  &:hover {
    color: var(--color-danger) !important;
  }
}

.arrow-icon {
  color: var(--text-disabled);
  transition: transform 0.2s @bezier-standard;

  &.rotate-180 {
    transform: rotate(180deg);
  }

  &.has-clear {
    .group:hover & {
      display: none;
    }
  }
}

.selector-dropdown-box {
  position: absolute;
  left: 0;
  right: 0;
  margin-top: 0.375rem;
  overflow-y: auto;
  z-index: 50;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  border: @border-solid-base;
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  backdrop-filter: blur(0.6rem);
  -webkit-backdrop-filter: blur(0.6rem);

  /* 🌟 回归原生 padding 区间 */
  padding: 0.25rem;
  gap: 0.25rem;

  /* 🌟 固定裁剪容纳 6 个选项的最大高度 (13.25rem 内容 + 0.5rem 上下 padding) */
  max-height: 13.75rem;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }

  &.no-scrollbar {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.selector-item {
  height: 2rem;
  padding-left: 0.625rem;
  padding-right: 0.625rem;
  padding-top: 0.025rem;
  padding-bottom: 0.025rem;
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  color: var(--text-body);
  background-color: transparent;
  border: 0.05rem solid transparent;
  border-radius: @radius-md;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;
  flex-shrink: 0;

  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-light);
  }

  &.font-black {
    font-weight: 900;
  }

  &.font-bold {
    font-weight: 700;
  }

  &.is-selected {
    background-color: color-mix(in srgb, @primary, transparent 90%) !important;
    color: @primary !important;
    border-color: color-mix(in srgb, @primary, transparent 70%);
  }
}

.dropdown-enter-active {
  transition:
    opacity 0.2s ease-out,
    transform 0.2s ease-out;
}

.dropdown-leave-active {
  transition:
    opacity 0.2s ease-in,
    transform 0.2s ease-in;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-0.4rem);
}
</style>
