<template>
  <Teleport to="body">
    <Transition name="modal-fade">
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
}

.modal-mask {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  animation: maskBlurIn @duration-base @bezier-standard forwards;

  :global(.dark) & {
    background-color: rgba(0, 0, 0, 0.55);
  }
}

.modal-card {
  position: relative;
  z-index: 10;
  padding: 1.25rem 0;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  box-sizing: border-box;
  background-color: var(--bg-panel);
  border: 1px solid var(--glass-border);
  border-radius: @radius-xl;
  box-shadow: @shadow-floating;
  animation: cardPopIn @duration-base @bezier-bounce forwards;

  :global(.dark) & {
    box-shadow: @shadow-floating-dark;
  }

  &.w-80 {
    width: 20rem;
  }
}

.modal-title {
  padding: 0 1.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-title);
  margin: 0;
  flex-shrink: 0;
}

.modal-body-content {
  padding: 0.85rem 1.5rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
}

.modal-footer-zone {
  padding: 0 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}

@keyframes maskBlurIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0px);
    -webkit-backdrop-filter: blur(0px);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
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

/* 🌟 Transition 离开渐隐效果 */
.modal-fade-leave-active {
  transition: opacity @duration-fast ease-in;
}

.modal-fade-leave-to {
  opacity: 0;
}
</style>
