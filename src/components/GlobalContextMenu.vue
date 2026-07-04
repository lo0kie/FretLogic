<template>
  <div ref="triggerRef" @contextmenu.prevent.stop="handleContextMenu" class="w-full">
    <slot></slot>
  </div>

  <Teleport to="body">
    <Transition name="fade-clear">
      <div
        v-if="isOpen"
        class="context-menu-backdrop fixed inset-0 z-[9998]"
        @pointerdown.prevent.stop="closeMenu"
      ></div>
    </Transition>

    <Transition name="menu-fade">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="context-menu-box fixed z-[9999] p-1 flex flex-col gap-0.5 min-w-[140px]"
        :style="{ left: `${x}px`, top: `${y}px` }"
      >
        <button
          v-for="(item, idx) in items"
          :key="idx"
          :disabled="item.disabled"
          @click.stop="handleItemClick(item)"
          class="menu-item flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold rounded-md transition-colors w-full text-left"
          :class="[
            item.danger
              ? 'text-[var(--color-danger)] hover:bg-red-500/10 dark:hover:bg-red-500/20'
              : 'text-[var(--text-body)] hover:bg-[var(--bg-panel-hover)] hover:text-[var(--text-title)]',
            item.disabled ? 'opacity-30 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
          ]"
        >
          <component :is="item.icon" v-if="item.icon" :size="14" :stroke-width="2.5" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
const globalActiveMenuCloseFn = ref<(() => void) | null>(null);

export default { name: 'GlobalContextMenu' };
</script>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { FunctionalComponent, nextTick, onBeforeUnmount, ref } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: FunctionalComponent;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

defineProps<{
  items: ContextMenuItem[];
}>();

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const triggerRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);

const closeMenu = () => {
  isOpen.value = false;
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
};

const handleContextMenu = (e: MouseEvent) => {
  if (globalActiveMenuCloseFn.value && globalActiveMenuCloseFn.value !== closeMenu) {
    globalActiveMenuCloseFn.value();
  }

  isOpen.value = true;
  x.value = e.clientX;
  y.value = e.clientY;

  globalActiveMenuCloseFn.value = closeMenu;

  nextTick(() => {
    if (!menuRef.value) return;
    const menuRect = menuRef.value.getBoundingClientRect();

    if (x.value + menuRect.width > window.innerWidth) {
      x.value = window.innerWidth - menuRect.width - 8;
    }
    if (y.value + menuRect.height > window.innerHeight) {
      y.value = window.innerHeight - menuRect.height - 8;
    }
  });
};

const handleItemClick = (item: ContextMenuItem) => {
  if (item.disabled) return;
  item.action();
  closeMenu();
};

useEventListener(window, 'pointerdown', (e: PointerEvent) => {
  if (!isOpen.value || !menuRef.value) return;
  if (!menuRef.value.contains(e.target as Node)) {
    closeMenu();
  }
});

onBeforeUnmount(() => {
  if (globalActiveMenuCloseFn.value === closeMenu) {
    globalActiveMenuCloseFn.value = null;
  }
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.context-menu-backdrop {
  background-color: color-mix(in srgb, var(--bg-main) 4%, transparent);

  :global(.dark) & {
    background-color: color-mix(in srgb, #000000 20%, transparent);
  }
}

.context-menu-box {
  .mixin-floating-layer();
  background-color: color-mix(in srgb, var(--bg-panel) 94%, transparent);
  border: 1px solid var(--border-base);
  box-shadow: @shadow-lg;
  @apply rounded-md;
}

.menu-fade-enter-active {
  transition:
    opacity 0.12s @bezier-standard,
    transform 0.12s @bezier-bounce;
}
.menu-fade-leave-active {
  transition:
    opacity 0.08s @bezier-standard,
    transform 0.08s @bezier-standard;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}
</style>
