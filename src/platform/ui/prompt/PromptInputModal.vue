<template>
  <BaseModal v-model:visible="visible" :title @confirm="emit('confirm')">
    <BaseInput
      v-focus="selectOnFocus ? { select: true } : true"
      v-model="modelValue"
      :maxlength
      :placeholder
      @enter="emit('confirm')"
      clearable
    />
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';

/** 弹窗是否可见 */
const visible = defineModel<boolean>('visible', { required: true });
/** 输入框内容（v-model） */
const modelValue = defineModel<string>({ required: true });

/**
 * 名称输入弹窗：封装「BaseModal + BaseInput（Enter 确认 / 可清空 / 自动聚焦）」样板，
 * 供新建分组、重命名分组、新建乐谱等单输入弹窗复用。
 * selectOnFocus 为 true 时聚焦并全选已有文本（重命名场景）。
 */
defineProps<{
  /** 弹窗标题 */
  title: string;
  /** 输入字符数上限（原生 maxlength） */
  maxlength?: number;
  /** 输入框占位提示文本 */
  placeholder?: string;
  /** 聚焦时是否自动全选已有文本（重命名场景） */
  selectOnFocus?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
}>();
</script>
