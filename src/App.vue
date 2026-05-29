<template>
  <div class="w-full h-screen flex relative overflow-y-hidden overflow-x-auto min-w-[1480px]">
    <GlobalToast />

    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <Modal v-if="uiStore.modalShow" />
    </Transition>

    <SidebarLeft />
    <Workbench />
    <SidebarRight />
  </div>
</template>

<script setup lang="ts">
import GlobalToast from '@/components/GlobalToast.vue';
import { useUiStore } from '@/stores/uiStore';
import SidebarLeft from '@/views/sidebar-left/SidebarLeft.vue';
import SidebarRight from '@/views/sidebar-right/SidebarRight.vue';
import Workbench from '@/views/workbench/Workbench.vue';
import { defineAsyncComponent } from 'vue';

const uiStore = useUiStore();

// 🌟 优化：按需懒加载弹窗组件（Code Splitting）
const Modal = defineAsyncComponent(() => import('@/components/Modal.vue'));
</script>
