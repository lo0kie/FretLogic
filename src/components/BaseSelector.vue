<template>
  <div ref="containerRef" class="relative w-full">
    <div
      ref="triggerRef"
      @click="toggleDropdown"
      @wheel="handleWheel"
      class="selector-trigger-bar flex items-center justify-between px-3 select-none group"
      :class="{ 'is-active': isOpen }"
    >
      <span
        class="font-black flex items-center gap-2"
        :class="[isNonDefault ? 'text-[var(--color-primary)] text-[16px]' : 'text-title text-[14px]']"
      >
        <slot name="label" :selected="modelValue">
          {{ modelValue }}
        </slot>
      </span>

      <X
        v-if="clearable && isNonDefault"
        :size="18"
        :stroke-width="3"
        class="hidden group-hover:block text-[var(--text-disabled)] hover:!text-[var(--color-danger)] transition-colors"
        @click.stop="handleClear"
      />

      <ChevronDown
        :size="18"
        :stroke-width="3"
        style="color: var(--text-disabled)"
        class="transition-transform duration-200"
        :class="[{ 'rotate-180': isOpen }, clearable && isNonDefault ? 'group-hover:hidden' : '']"
      />
    </div>

    <Transition
      enter-from-class="opacity-0 translate-y-[-8px]"
      leave-to-class="opacity-0 translate-y-[-8px]"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <div
        v-if="isOpen"
        ref="dropdownRef"
        class="selector-dropdown-box absolute left-0 right-0 mt-1.5 overflow-y-auto no-scrollbar z-[50] p-1.5 flex flex-col gap-1"
        :class="maxHeightClass"
      >
        <div
          v-for="(option, index) in options"
          :key="index"
          :id="`${optionIdPrefix}${option}`"
          @click="handleSelect(option)"
          class="selector-item h-10 px-2.5 py-0.5 flex items-center text-[13px]"
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
import { onClickOutside } from '@vueuse/core';
import { computed, nextTick, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: T[];
    clearable?: boolean;
    defaultValue?: T;
    maxHeightClass?: string;
    fontBlackItems?: boolean;
    optionIdPrefix?: string;
  }>(),
  {
    clearable: false,
    fontBlackItems: false,
    maxHeightClass: 'max-h-60',
    optionIdPrefix: 'sel-opt-',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value?: T): void;
  (e: 'clear'): void;
  (e: 'wheel-change', direction: 'up' | 'down'): void;
}>();

const isOpen = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);
const triggerRef = ref<HTMLDivElement | null>(null);

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

onClickOutside(containerRef, () => {
  if (isOpen.value) isOpen.value = false;
});

watch(isOpen, opened => {
  if (opened) {
    nextTick(() => {
      const targetElement = document.getElementById(`${props.optionIdPrefix}${props.modelValue}`);
      if (targetElement) {
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    });
  }
});

defineExpose({ triggerRef });
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';
.selector-trigger-bar {
  .mixin-input-base();
  height: 2.5rem;
  border-radius: @radius-lg;
  cursor: pointer;
  background-color: var(--bg-body);
  transition:
    border-color @transition-fast,
    box-shadow @transition-fast;
  &.is-active {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
  }
}
.selector-dropdown-box {
  .mixin-floating-layer();
}
.selector-item {
  .mixin-interactive-card();
  color: var(--text-body);
  &.is-selected {
    background-color: color-mix(in srgb, @primary, transparent 90%) !important;
    color: @primary !important;
    border-color: color-mix(in srgb, @primary, transparent 70%);
  }
}
</style>
