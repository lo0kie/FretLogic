<template>
  <div class="pt-4 pb-0 px-4 relative flex items-center shrink-0">
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
        class="absolute right-7 w-4 h-4 rounded-full flex items-center justify-center text-[var(--text-disabled)] hover:text-white hover:bg-[var(--color-danger)] transition-all font-black text-[9px] select-none"
      >
        ✕
      </button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.search-input {
  .mixin-input-base();

  width: 100%;
}
</style>
