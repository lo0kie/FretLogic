<script setup lang="ts">
/**
 * 通用功能按钮组件 - 支持状态切换和普通点击
 */
interface Props {
  activeIcon?: string; // 激活/普通状态的图标
  inactiveIcon?: string; // 未激活时的图标
  activeTooltip?: string; // 激活/普通状态的提示
  inactiveTooltip?: string; // 未激活时的提示[cite: 1]
  customClass?: string; // 额外的样式类[cite: 1]
  isToggle?: boolean; // 是否开启状态切换模式[cite: 1]
}

const active = defineModel<boolean>('active', { default: false });

const props = withDefaults(defineProps<Props>(), {
  activeIcon: '',
  inactiveIcon: '',
  activeTooltip: '',
  inactiveTooltip: '',
  customClass: '',
  isToggle: false,
});

const emit = defineEmits(['click']);

const handleClick = (event: MouseEvent) => {
  // 只有开启 isToggle 时，点击才会切换 active 状态[cite: 1]
  if (props.isToggle) {
    active.value = !active.value;
  }
  emit('click', event);
};
</script>

<template>
  <button
    @click="handleClick"
    class="common-btn w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-all duration-200 active:scale-95"
    :class="[
      // 核心修改：只有在 isToggle 为 true 且 active 为 true 时才应用蓝色高亮[cite: 1]
      // 否则（包括非切换模式）统一使用 Slate 灰色背景[cite: 1]
      props.isToggle && active
        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      customClass,
    ]"
    :data-tooltip="props.isToggle && !active ? inactiveTooltip : activeTooltip"
  >
    <span class="text-base select-none">
      {{ props.isToggle && !active ? inactiveIcon || activeIcon : activeIcon }}
    </span>
  </button>
</template>

<style lang="less" scoped>
.common-btn {
  position: relative;
  cursor: pointer;

  // 悬停时稍微加深一点，增加交互感
  &:hover {
    filter: brightness(0.95);

    &::after {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    &::before {
      opacity: 1;
    }
  }

  &::after {
    content: attr(data-tooltip);
    position: absolute;
    top: 125%;
    left: 50%;
    transform: translateX(-50%) scale(0.9);
    padding: 4px 8px;
    background-color: rgba(30, 41, 59, 0.95);
    color: #fff;
    font-size: 11px;
    border-radius: 6px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: all 0.15s ease-in-out;
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &::before {
    content: '';
    position: absolute;
    top: 110%;
    left: 50%;
    transform: translateX(-50%) translateY(-50%) rotate(180deg);
    border: 5px solid transparent;
    border-top-color: rgba(30, 41, 59, 0.95);
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 100;
  }
}
</style>
