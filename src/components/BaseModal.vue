<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        v-bind="$attrs"
        class="modal-overlay-container"
        @mousedown="handleMaskMousedown"
        @click.self="handleMaskClick"
      >
        <div
          ref="modalCardRef"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '对话框'"
          tabindex="-1"
          class="modal-card"
          :class="[width, height]"
          @click.stop
          @keydown="handleKeydownTrap"
        >
          <div v-if="hasHeader" class="modal-header-zone">
            <slot name="header">
              <div class="modal-header-left">
                <slot name="title">
                  <h3 v-if="title" class="modal-title" :title>
                    {{ title }}
                  </h3>
                </slot>
              </div>
              <div v-if="$slots['header-extra']" class="modal-header-extra">
                <slot name="header-extra" />
              </div>
            </slot>
          </div>
          <div class="modal-body-content no-scrollbar" :class="{ 'has-header': hasHeader, 'has-footer': showFooter }">
            <slot />
          </div>
          <div v-if="showFooter" class="modal-footer-zone">
            <slot name="footer">
              <ActionButton @click="handleCancel">
                {{ cancelText }}
              </ActionButton>
              <ActionButton
                :primary="confirmType === 'primary'"
                :danger="confirmType === 'danger'"
                :warning="confirmType === 'warning'"
                @click="handleConfirm"
              >
                {{ confirmText }}
              </ActionButton>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
<script setup lang="ts">
import { useFocusReturn } from '@/composables/useFocusReturn';
import { useEventListener, useScrollLock } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, useSlots, useTemplateRef, watch } from 'vue';
import ActionButton from './ActionButton.vue';

defineOptions({ inheritAttrs: false });

const {
  title = '',
  width = 'w-80',
  height = 'h-auto',
  showFooter = true,
  cancelText = '取消',
  confirmText = '确认',
  confirmType = 'primary',
  closeOnMask = true,
} = defineProps<{
  title?: string;
  width?: 'w-sm' | 'w-md' | 'w-80' | 'w-lg' | 'w-large' | 'w-xl' | 'w-wide' | 'w-full';
  height?: 'h-auto' | 'h-sm' | 'h-md' | 'h-lg' | 'h-xl' | 'h-full';
  showFooter?: boolean;
  cancelText?: string;
  confirmText?: string;
  confirmType?: 'primary' | 'danger' | 'warning' | 'default';
  closeOnMask?: boolean;
}>();
const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
const slots = useSlots();
const visible = defineModel<boolean>('visible', { required: true });
const isBodyLocked = useScrollLock(document.body);
const modalCardRef = useTemplateRef<HTMLDivElement>('modalCardRef');
const { captureTrigger, restoreFocusAfter } = useFocusReturn({
  warnLabel: '[BaseModal]',
});
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const hasHeader = computed(() => Boolean(slots.header || slots['header-extra'] || slots.title || title));
const setExternalInert = (isInert: boolean) => {
  const targetEl = document.body.firstElementChild as HTMLElement;
  if (!targetEl) return;
  if (isInert) {
    targetEl.setAttribute('inert', '');
  } else {
    targetEl.removeAttribute('inert');
  }
};
let stopKeydownListener: (() => void) | null = null;
watch(
  visible,
  async isOpen => {
    isBodyLocked.value = isOpen;
    setExternalInert(isOpen);
    if (isOpen) {
      stopKeydownListener = useEventListener(window, 'keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleCancel();
      });
      captureTrigger();
      await nextTick();
    } else {
      stopKeydownListener?.();
      stopKeydownListener = null;
    }
  },
  { immediate: true }
);
const handleKeydownTrap = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !modalCardRef.value) return;
  const focusables = Array.from(modalCardRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusables.length === 0) {
    modalCardRef.value.focus();
    return;
  }
  const firstEl = focusables[0]!;
  const lastEl = focusables[focusables.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === firstEl || document.activeElement === modalCardRef.value) {
      e.preventDefault();
      lastEl.focus();
    }
  } else {
    if (document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }
};
onBeforeUnmount(() => {
  setExternalInert(false);
});
const handleConfirm = () => {
  emit('confirm');
};
const handleCancel = () => {
  emit('cancel');
  restoreFocusAfter(() => {
    visible.value = false;
  });
};
let mousedownTarget: EventTarget | null = null;
const handleMaskMousedown = (e: MouseEvent) => {
  mousedownTarget = e.target;
};
const handleMaskClick = (e: MouseEvent) => {
  if (closeOnMask && e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
    handleCancel();
  }
  mousedownTarget = null;
};
</script>
<style scoped lang="less">
@import '@/assets/tokens.module';
.modal-overlay-container {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: @space-lg;
  box-sizing: border-box;
  /* 全屏遮罩不做 backdrop-filter：大面积实时模糊在内容滚动/动画时每帧重采样，代价过高 */
  background-color: #00000080;
}
.modal-card {
  position: relative;
  z-index: var(--z-panel);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  border: 1px solid var(--glass-border);
  border-radius: @radius-lg;
  box-shadow: var(--shadow-floating);
  animation: cardPopIn @duration-base @bezier-bounce forwards;
  transition:
    height @duration-base @bezier-standard,
    width @duration-base @bezier-standard;
  outline: none;

  &.w-sm {
    width: 380px;
    max-width: 380px;
    min-width: 380px;
  }
  &.w-md,
  &.w-80 {
    width: 480px;
    max-width: 480px;
    min-width: 480px;
  }
  &.w-lg {
    width: 640px;
    max-width: 640px;
    min-width: 640px;
  }
  &.w-large,
  &.w-xl {
    width: 840px;
    max-width: 840px;
    min-width: 840px;
  }
  &.w-wide {
    width: 1080px;
    max-width: 1080px;
    min-width: 1080px;
  }
  &.w-full {
    width: 1320px;
    max-width: 1320px;
    min-width: 1320px;
  }
  &.h-auto {
    height: auto;
    max-height: 640px;
  }
  &.h-sm {
    height: 320px;
    max-height: 320px;
    min-height: 320px;
  }
  &.h-md {
    height: 480px;
    max-height: 480px;
    min-height: 480px;
  }
  &.h-lg {
    height: 640px;
    max-height: 640px;
    min-height: 640px;
  }
  &.h-xl {
    height: 800px;
    max-height: 800px;
    min-height: 800px;
  }
  &.h-full {
    height: 920px;
    max-height: 920px;
    min-height: 920px;
  }
}
.modal-header-zone {
  padding: @space-xl @space-xl 0 @space-xl;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: @space-lg;
}
.modal-header-left {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}
.modal-header-extra {
  display: flex;
  align-items: center;
  gap: @space-sm;
  flex-shrink: 0;
}
.modal-title {
  font-size: @fs-sm;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-title);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.modal-body-content {
  padding: @space-xl @space-xl;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  &.has-header {
    padding-top: 0.85rem;
  }
  &.has-footer {
    padding-bottom: 0.85rem;
  }
}
.modal-footer-zone {
  padding: 0 @space-xl @space-xl @space-xl;
  display: flex;
  justify-content: flex-end;
  gap: @space-sm;
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}
.modal-fade-enter-active {
  transition: opacity @duration-base @bezier-standard;
}
.modal-fade-leave-active {
  transition: opacity @duration-fast ease-in;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
@keyframes cardPopIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
