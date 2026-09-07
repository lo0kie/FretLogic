<template>
  <BaseSelector
    v-model="modelValue"
    :disabled
    :width
    :highlight-non-default="false"
    :options="KEY_OPTIONS"
    default-value="C"
  >
    <template #label="{ selected }">
      <span v-chord-name="`${selected}调`" />
    </template>

    <template #option="{ option }">
      <span v-chord-name="`${option}调`" />
    </template>
  </BaseSelector>
</template>

<script setup lang="ts">
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import { KEY_OPTIONS } from '@/domains/chord/theory/theory';

const modelValue = defineModel<string>({ required: true });

/**
 * 调式选择器：封装「BaseSelector + KEY_OPTIONS + 调名和弦样式双插槽」样板，
 * 供排序配置 / 乐谱指法调、演唱调等场景复用。
 */
defineProps<{
  disabled?: boolean;
  width?: string;
}>();
</script>
