<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <div v-if="visible" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div
          class="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60 transition-opacity"
          @click="closeOnMask && handleCancel()"
        ></div>

        <div
          class="modal-card py-5 px-6 relative z-10 animate-modal-in flex flex-col gap-4 max-h-[80vh]"
          :class="width"
        >
          <h3 v-if="title" class="text-xs font-black opacity-40 uppercase tracking-widest text-title shrink-0">
            {{ title }}
          </h3>

          <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
            <slot></slot>
          </div>

          <div v-if="showFooter" class="flex justify-end gap-2 w-full shrink-0">
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
.modal-card {
  .mixin-floating-layer();
}
</style>
