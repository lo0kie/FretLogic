<template>
  <BaseSelector
    v-model="modelValue"
    :disabled="disabled"
    :highlight-non-default="false"
    :options="KEY_OPTIONS"
    :width="width"
    default-value="C"
  >
    <template #label="{ selected }">
      <span v-chord-name="{ name: `${selected}调` }" />
    </template>

    <template #option="{ option }">
      <span v-chord-name="{ name: `${option}调` }" />
    </template>
  </BaseSelector>
</template>

<script lang="ts" setup>
import BaseSelector from '@/components/ui/BaseSelector.vue';
import { KEY_OPTIONS } from '@/services/music/theory';

/**
 * 调式选择器：封装「BaseSelector + KEY_OPTIONS + 调名和弦样式双插槽」样板，
 * 供排序配置 / 乐谱指法调、演唱调等场景复用。
 */
defineProps<{
  disabled?: boolean;
  width?: string;
}>();

const modelValue = defineModel<string>({ required: true });
</script>
