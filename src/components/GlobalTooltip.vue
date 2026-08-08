<template>
  <div
    ref="referenceRef"
    class="tooltip-trigger-container"
    role="presentation"
    @mouseenter="show = true"
    @mouseleave="show = false"
    @focus="show = true"
    @blur="show = false"
  >
    <slot :tooltip-id="show ? tooltipId : undefined">
      <span :aria-describedby="show && (content || $slots.content) ? tooltipId : undefined">
        <slot name="trigger"></slot>
      </span>
    </slot>

    <Teleport to="body">
      <div
        v-if="isRendered"
        :id="tooltipId"
        ref="floatingRef"
        role="tooltip"
        class="tooltip-floating-wrapper"
        :style="floatingStyles"
      >
        <Transition name="tooltip-native" appear @after-leave="onAfterLeave">
          <div
            v-if="show"
            class="tooltip-box"
            :class="[`theme-${theme}`, $slots.content ? 'rich-content' : 'pure-text']"
          >
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
import { useUiStore } from '@/stores/uiStore';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/vue';
import { computedAsync } from '@vueuse/core';
import { type DOMPurify } from 'dompurify';
import { computed, ref, useId, useSlots, useTemplateRef, watch } from 'vue';

type TooltipTheme = 'dark' | 'light' | 'auto';

const {
  content,
  placement = 'top',
  theme = 'auto',
} = defineProps<{
  content?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
  theme?: TooltipTheme;
}>();

const slots = useSlots();
const uiStore = useUiStore();
const show = ref(false);
const tooltipId = useId();

const referenceRef = useTemplateRef<HTMLElement>('referenceRef');
const floatingRef = useTemplateRef<HTMLElement>('floatingRef');

let cachedDOMPurify: DOMPurify | null = null;

const isHtmlContent = computed(() => /[<>&]/.test(content || ''));

const sanitizedHtmlContent = computedAsync(async () => {
  if (!show.value || !content) return '';
  if (!isHtmlContent.value) return content.replace(/\\n/g, '<br />').replace(/\n/g, '<br />');

  cachedDOMPurify ??= (await import('dompurify')).default;

  const rawHtml = content.replace(/\\n/g, '<br />').replace(/\n/g, '<br />');
  return cachedDOMPurify.sanitize(rawHtml ?? '');
}, '');

const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  strategy: 'fixed',
  placement: computed(() => placement),
  whileElementsMounted: (reference, floating, update) => autoUpdate(reference, floating, update),
  middleware: [offset(8), flip({ fallbackAxisSideDirection: 'start' }), shift({ padding: 12 })],
});

const isRendered = ref(false);

watch(
  () => show.value && !uiStore.isMobile && (content || slots.content),
  shouldShow => {
    if (shouldShow) isRendered.value = true;
  }
);

const onAfterLeave = () => {
  isRendered.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.tooltip-trigger-container {
  position: relative;
  display: inline-block;
  outline: none;
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
