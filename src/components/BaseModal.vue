<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="visible"
        class="modal-overlay-container"
        v-bind="$attrs"
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
                  <h3 v-if="title" class="modal-title" :title="title">
                    {{ title }}
                  </h3>
                </slot>
              </div>
              <div v-if="$slots['header-extra']" class="modal-header-extra">
                <slot name="header-extra"></slot>
              </div>
            </slot>
          </div>

          <div class="modal-body-content no-scrollbar" :class="{ 'has-header': hasHeader, 'has-footer': showFooter }">
            <slot></slot>
          </div>

          <div v-if="showFooter" class="modal-footer-zone">
            <slot name="footer">
              <ActionButton width="auto" @click="handleCancel" size="sm">{{ cancelText }}</ActionButton>

              <ActionButton
                width="auto"
                size="sm"
                @click="handleConfirm"
                :primary="confirmType === 'primary'"
                :danger="confirmType === 'danger'"
                :warning="confirmType === 'warning'"
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
import { BASE_MODAL_DEFAULTS } from '@/constants/ui.ts';
import { useFocusReturn } from '@/services/useFocusReturn';
import { useEventListener, useScrollLock } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, useSlots, useTemplateRef, watch } from 'vue';
import ActionButton from './ActionButton.vue';

defineOptions({ inheritAttrs: false });

const {
  title = '',
  width = BASE_MODAL_DEFAULTS.WIDTH,
  height = 'h-auto',
  showFooter = BASE_MODAL_DEFAULTS.SHOW_FOOTER,
  cancelText = BASE_MODAL_DEFAULTS.CANCEL_TEXT,
  confirmText = BASE_MODAL_DEFAULTS.CONFIRM_TEXT,
  confirmType = BASE_MODAL_DEFAULTS.CONFIRM_TYPE,
  closeOnMask = BASE_MODAL_DEFAULTS.CLOSE_ON_MASK,
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

const { captureTrigger, restoreFocusAfter } = useFocusReturn({ warnLabel: '[BaseModal]' });

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

      // 记录打开前的焦点来源，Modal 关闭后统一归还
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

  const firstEl = focusables[0];
  const lastEl = focusables[focusables.length - 1];

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
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
  background-color: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  :global(.dark) & {
    background-color: rgba(0, 0, 0, 0.55);
  }
}

.modal-card {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  border: 1px solid var(--glass-border);
  border-radius: @radius-xl;
  box-shadow: @shadow-floating;
  animation: cardPopIn @duration-base @bezier-bounce forwards;
  transition:
    height @duration-base @bezier-standard,
    width @duration-base @bezier-standard;
  outline: none;

  &.w-sm {
    width: 16rem;
    max-width: 90vw;
  }

  &.w-md,
  &.w-80 {
    width: 20rem;
    max-width: 90vw;
  }

  &.w-lg {
    width: 28rem;
    max-width: 90vw;
  }

  &.w-large,
  &.w-xl {
    width: 38rem;
    max-width: 90vw;
  }

  &.w-wide {
    width: 52rem;
    max-width: 92vw;
  }

  &.w-full {
    width: 64rem;
    max-width: 95vw;
  }

  &.h-auto {
    height: auto;
    max-height: 80vh;
  }

  &.h-sm {
    height: 16rem;
    max-height: 80vh;
  }

  &.h-md {
    height: 24rem;
    max-height: 80vh;
  }

  &.h-lg {
    height: 32rem;
    max-height: 85vh;
  }

  &.h-xl {
    height: 40rem;
    max-height: 90vh;
  }

  &.h-full {
    height: 90vh;
  }
}

.modal-header-zone {
  padding: 1.25rem 1.5rem 0 1.5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
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
  gap: 0.5rem;
  flex-shrink: 0;
}

.modal-title {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-title);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-body-content {
  padding: 1.25rem 1.5rem;
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
  padding: 0 1.5rem 1.25rem 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
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
