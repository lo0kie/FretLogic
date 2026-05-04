<script setup lang="ts">
import { computed } from 'vue';

// 定义按钮支持的视觉类型
type ButtonType = 'primary' | 'success' | 'danger' | 'warning' | 'secondary' | 'ghost';

interface Props {
  text?: string;
  type?: ButtonType;
  disabled?: boolean;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  text: '确认',
  type: 'primary',
  disabled: false,
  loading: false,
});

const emit = defineEmits(['click']);

// 根据 type 映射不同的 Tailwind 类名
const typeClasses = computed(() => {
  const mapping: Record<ButtonType, string> = {
    // 蓝色：主色调，用于确认、保存
    primary: 'bg-blue-600 text-white shadow-blue-500/20 active:bg-blue-700',
    // 绿色：用于导出成功、新建成功
    success: 'bg-emerald-500 text-white shadow-emerald-500/20 active:bg-emerald-600',
    // 红色：用于删除、重置
    danger: 'bg-red-500 text-white shadow-red-500/20 active:bg-red-600',
    // 橙色：用于警告、覆盖提醒
    warning: 'bg-amber-500 text-white shadow-amber-500/20 active:bg-amber-600',
    // 灰色：用于取消、次要操作
    secondary: 'bg-slate-100 text-slate-600 active:bg-slate-200 shadow-none',
    // 幽灵态：用于列表中的小功能，不干扰视线
    ghost: 'bg-transparent text-slate-400 hover:bg-slate-50 active:bg-slate-100 shadow-none',
  };
  return mapping[props.type];
});

function handleClick() {
  if (!props.disabled && !props.loading) emit('click');
}
</script>

<template>
  <button
    @click="handleClick"
    :disabled="disabled || loading"
    :class="[
      'w-full h-14 rounded-xl font-black text-lg transition-all duration-200 active:scale-95 cursor-pointer flex items-center justify-center gap-2 select-none',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
      typeClasses,
    ]"
  >
    <span v-if="loading" class="animate-spin text-xl opacity-70">🌀</span>
    <span>{{ text }}</span>
  </button>
</template>
