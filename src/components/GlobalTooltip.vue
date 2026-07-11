<template>
  <div ref="referenceRef" class="relative inline-block" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Teleport to="body">
      <Transition name="tooltip-native">
        <div
          v-if="show && (content || $slots.content)"
          ref="floatingRef"
          class="tooltip-box px-3 py-1.5 fixed font-black rounded-md shadow-2xl pointer-events-none text-xs"
          :class="[
            // 💡 1. 动态绑定主题类名：theme-dark, theme-light, theme-auto
            `theme-${theme}`,
            $slots.content ? 'rich-content' : 'pure-text',
          ]"
          :style="floatingStyles"
        >
          <slot name="content">
            <div v-html="sanitizedHtmlContent"></div>
          </slot>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { computedAsync } from '@vueuse/core';
import { computed, ref } from 'vue';

// 💡 2. 定义主题类型
type TooltipTheme = 'dark' | 'light' | 'auto';

const props = withDefaults(
  defineProps<{
    content?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
    theme?: TooltipTheme; // 💡 3. 新增参数控制状态
  }>(),
  {
    placement: 'top',
    theme: 'auto', // 💡 4. 默认设为反差暗色，体验最好
  }
);

const show = ref(false);
const referenceRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

let cachedDOMPurify: any = null;

const sanitizedHtmlContent = computedAsync(async () => {
  if (!show.value || !props.content) return '';

  const rawHtml = props.content.replace(/\\n/g, '<br />').replace(/\n/g, '<br />');

  if (!cachedDOMPurify) {
    const dompurifyModule = await import('dompurify');
    cachedDOMPurify = dompurifyModule.default || dompurifyModule;
  }

  return cachedDOMPurify.sanitize(rawHtml);
}, '');

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: computed(() => props.placement),
  whileElementsMounted: (reference, floating, update) => {
    return autoUpdate(reference, floating, update);
  },
  middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 6 })],
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.tooltip-box {
  z-index: 9999;
  transition:
    opacity 0.12s ease-out,
    background-color 0.15s ease,
    color 0.15s ease;
  line-height: 1.6;
  text-align: center;

  &.pure-text {
    white-space: nowrap;
  }

  &.rich-content {
    white-space: normal;
    width: max-content;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  // ==========================================
  // 🎯 核心样式重构：根据 Props 传来的类名进行状态流转
  // ==========================================

  // 🕶️ 状态一：强制深色模式 (默认)
  &.theme-dark {
    background-color: #0f172a; // 深 slate 色
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  // ☀️ 状态二：强制浅色模式
  &.theme-light {
    background-color: #ffffff;
    color: #0f172a;
    border: 1px solid rgba(15, 23, 42, 0.08);
  }

  // 🔄 状态三：自适应跟随系统/项目暗黑模式切换
  &.theme-auto {
    // 默认（浅色时）为白底黑字
    background-color: var(--bg-panel);
    color: var(--text-title);
    border: @border-solid-base;

    // 当页面根节点带有 .dark 时自动切换为黑底白字
    :global(.dark) & {
      background-color: #0f172a;
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.1);
    }
  }
}

.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition: opacity 0.12s ease-out;
}
.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0 !important;
}
</style>
