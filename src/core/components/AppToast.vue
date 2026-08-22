<template>
  <Teleport to="body">
    <TransitionGroup name="app-toast-list">
      <div v-for="toast in toasts" :key="toast.id" class="app-toast" :class="`is-variant-${toast.type}`" role="status">
        <span class="app-toast-msg">{{ toast.message }}</span>
        <button
          v-if="toast.closable"
          type="button"
          class="app-toast-close"
          aria-label="关闭"
          @click="dismiss(toast.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';

export type AppToastType = 'info' | 'success' | 'warning' | 'error';

export interface AppToastItem {
  id: number;
  type: AppToastType;
  message: string;
  duration: number;
  closable: boolean;
}

withDefaults(
  defineProps<{
    toasts?: AppToastItem[];
  }>(),
  { toasts: () => [] }
);

const emit = defineEmits<{
  (e: 'dismiss', id: number): void;
}>();

function dismiss(id: number) {
  emit('dismiss', id);
}

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-toast {
  display: flex;
  align-items: center;
  gap: @space-sm;
  padding: @space-sm @space-md;
  border-radius: @radius-md;
  background: var(--bg-panel);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-lg);
  color: var(--text-body);
  font-size: var(--fs-sm);
  min-width: 12rem;
  max-width: 22rem;

  &.is-variant-success {
    border-color: var(--color-success);
  }

  &.is-variant-warning {
    border-color: var(--color-warning);
  }

  &.is-variant-error {
    border-color: var(--color-danger);
  }
}

.app-toast-msg {
  flex: 1;
  line-height: 1.4;
}

.app-toast-close {
  flex: none;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: @space-2xs;

  &:hover {
    color: var(--text-title);
  }
}

.app-toast-list-enter-active,
.app-toast-list-leave-active {
  transition:
    opacity var(--duration-base) var(--bezier-out),
    transform var(--duration-base) var(--bezier-out);
}

.app-toast-list-enter-from,
.app-toast-list-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
