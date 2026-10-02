<template>
  <BaseModal v-model:visible="visible" :title :confirm-button-disabled="!canConfirm" @confirm="emit('confirm')">
    <BaseInput
      v-focus="selectOnFocus ? { select: true } : true"
      v-model="modelValue"
      :maxlength
      :placeholder
      @enter="handleEnter()"
      clearable
      width="auto"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

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

/**
 * 空内容时确认按钮禁用（Enter 也一并挡下）：单输入弹窗里「空」从来不是有效值，
 * 先灰掉比让用户点下去再看一条「请输入有效内容」更直接。
 * 调用方各自的空值校验仍保留 —— 那是领域侧自己的契约，不只服务于这一个弹窗。
 */
const canConfirm = computed(() => modelValue.value.trim() !== '');

/** Enter 走与确认按钮同一条判据：禁用的按钮点不了，但 Enter 仍会冒上来 */
const handleEnter = () => {
  if (canConfirm.value) emit('confirm');
};
</script>
