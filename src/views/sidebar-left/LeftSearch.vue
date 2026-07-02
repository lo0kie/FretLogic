<template>
  <div class="pt-4 pb-0 px-4 shrink-0 w-full box-border">
    <BaseInput
      :model-value="modelValue"
      @update:model-value="val => $emit('update:modelValue', val)"
      :disabled="disabled"
      placeholder="搜索和弦..."
      clearable
    >
      <template #prefix>
        <Search class="w-3.5 h-3.5" :style="{ color: 'var(--text-title)' }" stroke-width="2.5" />
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

<style scoped lang="less"></style>
