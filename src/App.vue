<template>
  <div class="app-layout-container">
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

<style scoped lang="less">
.app-layout-container {
  width: 100%;
  height: 100vh;
  display: flex;
  position: relative;
  overflow: hidden;
  min-width: 1480px;
  min-height: 800px;
  box-sizing: border-box;
}
</style>
