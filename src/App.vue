<template>
  <div class="w-full h-screen flex relative overflow-y-hidden overflow-x-auto min-w-[1480px]">
    <GlobalToast />

    <Modal />

    <SidebarLeft />
    <Workbench />
    <SidebarRight />
  </div>
</template>

<script setup lang="ts">
import GlobalToast from '@/components/GlobalToast.vue';
import Modal from '@/components/Modal.vue';
import { useGlobalShortcuts } from '@/composables/useGlobalShortcuts';
import SidebarLeft from '@/views/sidebar-left/SidebarLeft.vue';
import SidebarRight from '@/views/sidebar-right/SidebarRight.vue';
import Workbench from '@/views/workbench/Workbench.vue';

useGlobalShortcuts();
</script>
