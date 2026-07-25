<template>
  <GlobalToast />

  <AppLayout>
    <Workbench />
  </AppLayout>
</template>

<script setup lang="ts">
import GlobalToast from '@/components/GlobalToast.vue';
import { AppLayout } from '@/layouts';
import Workbench from '@/layouts/Workbench.vue';
</script>
