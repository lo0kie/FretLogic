<template>
  <div ref="referenceRef" class="tooltip-trigger-container" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Teleport to="body">
      <Transition name="tooltip-native">
        <div
          v-if="show && (content || $slots.content)"
          ref="floatingRef"
          class="tooltip-box"
          :class="[`theme-${theme}`, $slots.content ? 'rich-content' : 'pure-text']"
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

type TooltipTheme = 'dark' | 'light' | 'auto';

const props = withDefaults(
  defineProps<{
    content?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
    theme?: TooltipTheme;
  }>(),
  {
    placement: 'top',
    theme: 'auto',
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
@import '@/assets/tokens.module';

.tooltip-trigger-container {
  position: relative;
  display: inline-block;
}

.tooltip-box {
  position: fixed;
  z-index: 9999;
  padding: 0.375rem 0.75rem;
  font-weight: 900;
  border-radius: @radius-md;
  box-shadow: @shadow-xl;
  pointer-events: none;
  font-size: 0.7rem;
  line-height: 1.6;
  text-align: center;
  box-sizing: border-box;

  transition:
    opacity 0.12s ease-out,
    background-color 0.15s ease,
    color 0.15s ease;

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

  &.theme-dark {
    background-color: #0f172a;
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  &.theme-light {
    background-color: #ffffff;
    color: #0f172a;
    border: 1px solid rgba(15, 23, 42, 0.08);
  }

  &.theme-auto {
    background-color: var(--bg-panel);
    color: var(--text-title);
    border: @border-solid-base;

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
