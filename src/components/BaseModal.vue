<template>
  <Teleport to="body">
    <Transition
      enter-from-class="modal-fade-enter-from"
      leave-to-class="modal-fade-leave-to"
      enter-active-class="modal-fade-enter-active"
      leave-active-class="modal-fade-leave-active"
    >
      <div v-if="visible" class="modal-overlay-container">
        <div class="modal-mask" @click="closeOnMask && handleCancel()"></div>

        <div class="modal-card" :class="width">
          <h3 v-if="title" class="modal-title">
            {{ title }}
          </h3>

          <div class="modal-body-content no-scrollbar">
            <slot></slot>
          </div>

          <div v-if="showFooter" class="modal-footer-zone">
            <slot name="footer">
              <ActionButton width="auto" @click="handleCancel">{{ cancelText }}</ActionButton>

              <ActionButton
                width="auto"
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
import { watch } from 'vue';
import ActionButton from './ActionButton.vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title?: string;
    width?: string;
    showFooter?: boolean;
    cancelText?: string;
    confirmText?: string;
    confirmType?: 'primary' | 'danger' | 'warning' | 'default';
    closeOnMask?: boolean;
  }>(),
  {
    title: '',
    width: 'w-80',
    showFooter: true,
    cancelText: '取消',
    confirmText: '确认',
    confirmType: 'primary',
    closeOnMask: true,
  }
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const isBodyLocked = useScrollLock(document.body);

watch(
  () => props.visible,
  isOpen => {
    isBodyLocked.value = isOpen;
  },
  { immediate: true }
);

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.visible) {
    handleCancel();
  }
});

const handleConfirm = () => {
  emit('confirm');
};

const handleCancel = () => {
  emit('cancel');
  emit('update:visible', false);
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.modal-overlay-container {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

.modal-mask {
  position: absolute;
  inset: 0;
  background-color: rgba(2, 6, 23, 0.4);
  transition: opacity 0.2s @bezier-standard;

  :global(.dark) & {
    background-color: rgba(2, 6, 23, 0.6);
  }
}

.modal-card {
  position: relative;
  z-index: 10;
  padding-top: 1.25rem;
  padding-bottom: 1.25rem;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  border: @border-solid-base;
  border-radius: @radius-lg;
  box-shadow: @shadow-floating;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: modalSlideIn @duration-base @bezier-standard;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }

  &.w-80 {
    width: 20rem;
  }
}

.modal-title {
  font-size: 0.75rem;
  font-weight: 900;
  opacity: 0.4;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-title);
  margin: 0;
  flex-shrink: 0;
}

.modal-body-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 1rem;
  padding-bottom: 1rem;
  box-sizing: border-box;

  &.no-scrollbar {
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }
}

.modal-footer-zone {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease-out;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
