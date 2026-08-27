<template>
  <Teleport to="body">
    <Transition name="v-transition-modal">
      <div
        v-if="visible"
        v-bind="$attrs"
        class="modal-overlay-container fixed inset-0 z-overlay flex items-center justify-center p-md box-border bg-black/50"
        @mousedown="handleMaskMousedown"
        @click.self="handleMaskClick"
      >
        <div
          ref="modalCardRef"
          role="dialog"
          aria-modal="true"
          :aria-label="title || '对话框'"
          tabindex="-1"
          class="modal-card relative z-panel flex flex-col box-border bg-bg-panel border border-glass-border rounded-lg shadow-floating outline-none transition-[width,height] duration-base"
          :class="[computedWidthClass, computedHeightClass]"
          @click.stop
          @keydown="handleKeydownTrap"
        >
          <div v-if="hasHeader" class="modal-header-zone pt-xl px-xl shrink-0 flex items-center justify-between gap-lg">
            <slot name="header">
              <div class="modal-header-left flex items-center min-w-0 flex-1">
                <slot name="title">
                  <h3
                    v-if="title"
                    class="modal-title text-sm font-bold tracking-tight text-text-title m-0 whitespace-nowrap overflow-hidden text-ellipsis"
                    :title
                  >
                    {{ title }}
                  </h3>
                </slot>
              </div>
              <div v-if="$slots['header-extra']" class="modal-header-extra flex items-center gap-sm shrink-0">
                <slot name="header-extra" />
              </div>
            </slot>
          </div>

          <div
            class="modal-body-scrollable px-xl py-lg flex-1 min-h-0 overflow-y-auto box-border no-scrollbar flex flex-col"
            :class="{ 'has-header': hasHeader, 'has-footer': showFooter }"
          >
            <slot />
          </div>

          <div
            v-if="showFooter"
            class="modal-footer-zone pb-xl px-xl pt-0 shrink-0 flex items-center justify-end gap-sm w-full box-border"
          >
            <slot name="footer">
              <slot name="cancel-btn">
                <ActionButton variant="default" size="md" @click="handleCancel">
                  {{ cancelText }}
                </ActionButton>
              </slot>
              <slot name="confirm-btn">
                <ActionButton
                  variant="subtle"
                  :primary="confirmType === 'primary'"
                  :danger="confirmType === 'danger'"
                  :warning="confirmType === 'warning'"
                  size="md"
                  @click="handleConfirm"
                >
                  {{ confirmText }}
                </ActionButton>
              </slot>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useEventListener, useScrollLock } from '@vueuse/core';
import { computed, nextTick, onBeforeUnmount, useSlots, useTemplateRef, watch } from 'vue';
import ActionButton from './ActionButton.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title?: string;
    width?: 'w-sm' | 'w-md' | 'w-80' | 'w-lg' | 'w-large' | 'w-xl' | 'w-wide' | 'w-full';
    height?: 'h-auto' | 'h-sm' | 'h-md' | 'h-lg' | 'h-xl' | 'h-full';
    showFooter?: boolean;
    cancelText?: string;
    confirmText?: string;
    confirmType?: 'primary' | 'danger' | 'warning' | 'default';
    closeOnMask?: boolean;
  }>(),
  {
    title: '',
    width: 'w-80',
    height: 'h-auto',
    showFooter: true,
    cancelText: '取消',
    confirmText: '确认',
    confirmType: 'primary',
    closeOnMask: true,
  }
);

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const slots = useSlots();
const visible = defineModel<boolean>('visible', { required: true });
const isBodyLocked = useScrollLock(document.body);
const modalCardRef = useTemplateRef<HTMLDivElement>('modalCardRef');

const WIDTH_MAP: Record<string, string> = {
  'w-sm': 'w-[380px] max-w-[90vw]',
  'w-md': 'w-[480px] max-w-[90vw]',
  'w-80': 'w-[480px] max-w-[90vw]',
  'w-lg': 'w-[640px] max-w-[90vw]',
  'w-large': 'w-[840px] max-w-[90vw]',
  'w-xl': 'w-[840px] max-w-[90vw]',
  'w-wide': 'w-[1080px] max-w-[92vw]',
  'w-full': 'w-[1320px] max-w-[95vw]',
};

const HEIGHT_MAP: Record<string, string> = {
  'h-auto': 'h-auto max-h-[80vh]',
  'h-sm': 'h-[320px] max-h-[80vh]',
  'h-md': 'h-[480px] max-h-[80vh]',
  'h-lg': 'h-[640px] max-h-[85vh]',
  'h-xl': 'h-[800px] max-h-[90vh]',
  'h-full': 'h-[90vh]',
};

const computedWidthClass = computed(() => WIDTH_MAP[props.width] ?? props.width);
const computedHeightClass = computed(() => HEIGHT_MAP[props.height] ?? props.height);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const hasHeader = computed(() => Boolean(slots.header || slots['header-extra'] || slots.title || props.title));
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
      await nextTick();
      const autoFocusEl = modalCardRef.value?.querySelector<HTMLElement>(
        '[autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled]), select:not([disabled])'
      );
      if (autoFocusEl) {
        autoFocusEl.focus();
      } else {
        modalCardRef.value?.focus();
      }
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
  visible.value = false;
};

let mousedownTarget: EventTarget | null = null;
const handleMaskMousedown = (e: MouseEvent) => {
  mousedownTarget = e.target;
};
const handleMaskClick = (e: MouseEvent) => {
  if (props.closeOnMask && e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
    handleCancel();
  }
  mousedownTarget = null;
};
</script>
