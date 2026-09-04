<template>
  <BaseModal :title :visible @confirm="emit('confirm')" @update:visible="emit('update:visible', $event)">
    <BaseInput
      v-focus="selectOnFocus ? { select: true } : true"
      :maxlength
      :model-value
      :placeholder
      @enter="emit('confirm')"
      @update:model-value="emit('update:modelValue', $event)"
      clearable
    />
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';

/**
 * 名称输入弹窗：封装「BaseModal + BaseInput（Enter 确认 / 可清空 / 自动聚焦）」样板，
 * 供新建分组、重命名分组、新建乐谱等单输入弹窗复用。
 * selectOnFocus 为 true 时聚焦并全选已有文本（重命名场景）。
 */
defineProps<{
  visible: boolean;
  title: string;
  modelValue: string;
  maxlength?: number;
  placeholder?: string;
  selectOnFocus?: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'update:modelValue': [value: string];
  'confirm': [];
}>();
</script>
