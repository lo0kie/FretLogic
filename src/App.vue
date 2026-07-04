<template>
  <div class="w-full h-screen flex relative overflow-auto min-w-[1480px] min-h-[800px]">
    <GlobalToast />

    <SidebarLeft />
    <Workbench />
    <SidebarRight />
  </div>
</template>

<script setup lang="ts">
import GlobalToast from '@/components/GlobalToast.vue';
import Workbench from '@/views/workbench/Workbench.vue';
import { defineAsyncComponent } from 'vue';

const SidebarLeft = defineAsyncComponent(() => import('@/views/sidebar-left/SidebarLeft.vue'));
const SidebarRight = defineAsyncComponent(() => import('@/views/sidebar-right/SidebarRight.vue'));
</script>
