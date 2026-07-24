<template>
  <div class="search-input-container">
    <BaseInput
      :model-value="modelValue"
      @update:model-value="val => $emit('update:modelValue', val)"
      :disabled="disabled"
      placeholder="搜索和弦..."
      clearable
    >
      <template #prefix>
        <Search class="search-icon" stroke-width="2.5" />
      </template>
    </BaseInput>
  </div>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import { Search } from '@lucide/vue';

defineProps<{
  modelValue: string;
  disabled?: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.search-input-container {
  padding-top: 1rem;
  padding-bottom: 0;
  padding-left: 1rem;
  padding-right: 1rem;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
}

.search-icon {
  width: 0.7rem;
  height: 0.7rem;
  color: var(--text-title);
}
</style>
