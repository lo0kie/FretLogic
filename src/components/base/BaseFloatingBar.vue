<template>
  <Teleport to="body">
    <Transition :name="transitionName" appear>
      <div
        v-if="isBarVisible"
        class="flex items-center fixed left-1/2 [transform:translateX(-50%)] z-fab pointer-events-auto gap-sm py-sm px-md bg-bg-panel/90 backdrop-blur-xl border border-glass-border rounded-full shadow-floating box-border transition-[bottom,background-color,border-color,box-shadow] duration-slow ease-sidebar hover:ring-2 hover:ring-primary/70"
        :style="{ bottom }"
        role="toolbar"
        tabindex="-1"
      >
        <slot :divider="FloatingBarDivider" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, h, onActivated, onDeactivated, ref } from 'vue';

const {
  visible = true,
  bottom = '2rem',
  transitionName = 'v-transition-floating-bar',
} = defineProps<{
  visible?: boolean;
  bottom?: string;
  transitionName?: string;
}>();

const isViewActive = ref(true);

onActivated(() => {
  isViewActive.value = true;
});

onDeactivated(() => {
  isViewActive.value = false;
});

const isBarVisible = computed(() => Boolean(visible && isViewActive.value));

const FloatingBarDivider = () =>
  h('div', {
    'class': 'w-0.5 h-4 bg-border-base opacity-60 shrink-0 rounded-full',
    'role': 'separator',
    'aria-orientation': 'vertical',
  });
</script>
