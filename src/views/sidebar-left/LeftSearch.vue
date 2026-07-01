<template>
  <div class="pt-4 pb-0 px-4 relative flex items-center shrink-0 w-full box-border">
    <div class="absolute left-7 flex items-center justify-center pointer-events-none opacity-40">
      <Search class="w-3.5 h-3.5" :style="{ color: 'var(--text-title)' }" stroke-width="2.5" />
    </div>

    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      type="text"
      :disabled="disabled"
      placeholder="搜索和弦..."
      class="search-input font-black cursor-pointer"
    />

    <Transition name="fade-standard">
      <button
        v-if="modelValue"
        @click="$emit('update:modelValue', '')"
        class="absolute right-6 w-4 h-4 rounded-full flex items-center justify-center transition-all select-none btn-clear-search"
        title="清空搜索"
      >
        <X class="w-2.5 h-2.5" stroke-width="3" />
      </button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Search, X } from '@lucide/vue';

defineProps<{
  modelValue: string;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.search-input {
  .mixin-input-base();
  @apply px-9;
  width: 100%;
  height: 2.2rem;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}

.btn-clear-search {
  color: var(--text-disabled);
  background-color: transparent;

  &:hover {
    color: #ffffff;
    background-color: var(--color-danger);
  }

  &:active {
    transform: scale(0.9);
  }
}

.fade-standard-enter-active,
.fade-standard-leave-active {
  transition: all @duration-fast @bezier-standard;
}
.fade-standard-enter-from,
.fade-standard-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
</style>
