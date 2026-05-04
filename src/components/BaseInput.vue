<script setup lang="ts">
/**
 * 这是一个通用的基础输入框组件
 * 专为你的指板库设计，支持双向绑定和自动聚焦
 */
const props = defineProps<{
  placeholder?: string;
  type?: 'text' | 'password' | 'number';
  autoFocus?: boolean;
}>();

// 使用 defineModel 实现双向绑定
const text = defineModel<string>({ default: '' });

// 处理挂载后的自动聚焦逻辑
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  if (props.autoFocus) {
    inputRef.value?.focus();
  }
});
</script>

<template>
  <input
    ref="inputRef"
    v-model="text"
    :type="props.type || 'text'"
    :placeholder="props.placeholder"
    class="w-full bg-slate-100 dark:bg-white/5 rounded-xl px-4 py-3.5 text-sm font-bold outline-none border-2 border-transparent focus:border-blue-500/50 transition-all text-slate-900 dark:text-white placeholder:opacity-30"
  />
</template>

<script lang="ts">
import { onMounted, ref } from 'vue';
export default {
  name: 'CommonInput',
};
</script>
