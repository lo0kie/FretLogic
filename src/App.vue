<template>
  <GlobalToast />

  <AppLayout>
    <Workbench />
  </AppLayout>
</template>

<script setup lang="ts">
import GlobalToast from '@/components/GlobalToast.vue';
import AppLayout from '@/layouts/AppLayout.vue';
import Workbench from '@/layouts/workbench/Workbench.vue';
</script>
