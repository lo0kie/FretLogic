<template>
  <GlobalToast />

  <div class="w-screen h-screen min-w-[320px] flex flex-col overflow-hidden box-border">
    <div class="shrink-0">
      <TopHeader />
    </div>

    <div class="flex-1 min-h-0 flex relative overflow-hidden">
      <SidebarLeft />

      <main class="flex-1 min-w-0 min-h-0 relative overflow-hidden">
        <div
          class="absolute inset-0 box-border transition-[padding-left] duration-slow ease-sidebar"
          :style="{ paddingLeft: mainPaddingLeft }"
        >
          <RouterView #="{ Component, route }">
            <KeepAlive>
              <Transition name="v-transition-fade" mode="out-in">
                <component :is="Component" :key="route.name || route.path" />
              </Transition>
            </KeepAlive>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalToast from '@/components/base/GlobalToast.vue';
import { useUiStore } from '@/stores/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/core/constants';
import TopHeader from '@/views/header-top/TopHeader.vue';
import { computed, defineAsyncComponent } from 'vue';

const uiStore = useUiStore();
const SidebarLeft = defineAsyncComponent(() => import('@/views/sidebar-left/SidebarLeft.vue'));
const mainPaddingLeft = computed(() => (uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL.value : '0px'));
</script>
