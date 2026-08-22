<template>
  <Teleport to="body">
    <Transition name="app-modal-fade">
      <div v-if="modelValue" class="app-modal-overlay" data-app-modal-overlay @click.self="handleOverlayClick">
        <div class="app-modal" role="dialog" :aria-modal="true" :aria-label="title">
          <header v-if="title" class="app-modal-header">
            <h2 class="app-modal-title">
              {{ title }}
            </h2>
          </header>
          <div class="app-modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="app-modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    /** 点击遮罩关闭 */
    closeOnOverlay?: boolean;
  }>(),
  { title: '', closeOnOverlay: true }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'close'): void;
}>();

function handleOverlayClick() {
  if (!props.closeOnOverlay) return;
  emit('update:modelValue', false);
  emit('close');
}

// 打开时锁定滚动
watch(
  () => props.modelValue,
  open => {
    document.body.style.overflow = open ? 'hidden' : '';
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-bg);
  z-index: var(--z-overlay);
  padding: @space-lg;
}

.app-modal {
  width: min(100%, 30rem);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  overflow: hidden;
}

.app-modal-header {
  padding: @space-md @space-lg;
  border-bottom: 1px solid var(--separator);
}

.app-modal-title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-title);
}

.app-modal-body {
  padding: @space-lg;
  overflow-y: auto;
}

.app-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: @space-sm;
  padding: @space-md @space-lg;
  border-top: 1px solid var(--separator);
}

.app-modal-fade-enter-active,
.app-modal-fade-leave-active {
  transition: opacity var(--duration-base) var(--bezier-out);
}

.app-modal-fade-enter-from,
.app-modal-fade-leave-to {
  opacity: 0;
}
</style>
