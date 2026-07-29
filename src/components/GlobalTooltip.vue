<template>
  <div ref="referenceRef" class="tooltip-trigger-container" @mouseenter="show = true" @mouseleave="show = false">
    <slot></slot>

    <Teleport to="body">
      <div
        v-if="show && (content || $slots.content)"
        ref="floatingRef"
        class="tooltip-floating-wrapper"
        :style="floatingStyles"
      >
        <Transition name="tooltip-native" appear>
          <div class="tooltip-box" :class="[`theme-${theme}`, $slots.content ? 'rich-content' : 'pure-text']">
            <slot name="content">
              <div v-html="sanitizedHtmlContent"></div>
            </slot>
          </div>
        </Transition>
      </div>
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
  strategy: 'fixed',
  placement: computed(() => props.placement),
  whileElementsMounted: (reference, floating, update) => autoUpdate(reference, floating, update),
  middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })],
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.tooltip-trigger-container {
  position: relative;
  display: inline-block;
}

.tooltip-floating-wrapper {
  z-index: 9999;
  pointer-events: none;
  box-sizing: border-box;
}

.tooltip-box {
  padding: 0.35rem 0.65rem;
  font-weight: 500;
  border-radius: @radius-md;
  box-shadow: @shadow-lg;
  font-size: 0.72rem;
  line-height: 1.45;
  text-align: center;
  box-sizing: border-box;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  max-width: calc(100vw - 24px);
  word-break: break-word;

  &.pure-text {
    white-space: nowrap;
  }

  &.rich-content {
    white-space: normal;
    width: max-content;
    max-width: calc(100vw - 24px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &.theme-dark {
    background-color: rgba(28, 28, 30, 0.88);
    color: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  &.theme-light {
    background-color: rgba(255, 255, 255, 0.88);
    color: #000000;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  &.theme-auto {
    background-color: var(--bg-panel);
    color: var(--text-title);
    border: 1px solid var(--glass-border);
  }
}

.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition:
    opacity @duration-fast @bezier-standard,
    transform @duration-fast @bezier-standard;
}

.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0 !important;
  transform: scale(0.94) !important;
}
</style>
