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
          :class="width"
          @click.stop
          @keydown="handleKeydownTrap"
        >
          <h3 v-if="title" class="modal-title" :title="title">
            {{ title }}
          </h3>

          <div class="modal-body-content no-scrollbar" :style="{ paddingBottom: showFooter ? '0.85rem' : '1.5rem' }">
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
import { useEventListener, useScrollLock } from '@vueuse/core';
import { nextTick, onBeforeUnmount, useTemplateRef, watch } from 'vue';
import ActionButton from './ActionButton.vue';

defineOptions({ inheritAttrs: false });

const {
  title = '',
  width = 'w-80',
  showFooter = true,
  cancelText = '取消',
  confirmText = '确认',
  confirmType = 'primary',
  closeOnMask = true,
} = defineProps<{
  title?: string;
  width?: 'w-sm' | 'w-md' | 'w-80' | 'w-lg' | 'w-large' | 'w-xl' | 'w-wide' | 'w-full';
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

const visible = defineModel<boolean>('visible', { required: true });
const isBodyLocked = useScrollLock(document.body);

const modalCardRef = useTemplateRef<HTMLDivElement>('modalCardRef');
let previousActiveElement: HTMLElement | null = null;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 🌟 1. 设置外层节点为 inert（禁掉主应用内所有的键盘/鼠标/读屏焦点）
const setExternalInert = (isInert: boolean) => {
  const appEl = document.getElementById('app') || (document.body.firstElementChild as HTMLElement);
  if (!appEl) return;

  if (isInert) {
    appEl.setAttribute('inert', '');
  } else {
    appEl.removeAttribute('inert');
  }
};

watch(
  visible,
  async isOpen => {
    isBodyLocked.value = isOpen;
    setExternalInert(isOpen); // 🌟 核心：外层挂载/解挂 inert 属性

    if (isOpen) {
      previousActiveElement = document.activeElement as HTMLElement;

      await nextTick();
      if (!modalCardRef.value) return;

      const focusables = modalCardRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        modalCardRef.value.focus();
      }
    } else {
      previousActiveElement?.focus?.();
      previousActiveElement = null;
    }
  },
  { immediate: true }
);

// 🌟 2. Modal 内部 Tab 循环穿透卡死
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

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && visible.value) {
    handleCancel();
  }
});

onBeforeUnmount(() => {
  setExternalInert(false);
});

const handleConfirm = () => {
  emit('confirm');
};

const handleCancel = () => {
  emit('cancel');
  visible.value = false;
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
  max-height: 80vh;
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
}

.modal-title {
  padding: 1.25rem 1.5rem 0 1.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-title);
  margin: 0;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-body-content {
  padding: 0.85rem 1.5rem 1.5rem 1.5rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
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
