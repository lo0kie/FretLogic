<template>
  <GlobalToast />

  <div class="box-border flex h-screen w-screen min-w-[320px] flex-col overflow-hidden">
    <div class="shrink-0">
      <TopHeader />
    </div>

    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <SidebarLeft />

      <main class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          :style="{ paddingLeft: mainPaddingLeft }"
          class="duration-slow ease-sidebar absolute inset-0 box-border transition-[padding-left]"
        >
          <RouterView #="{ Component, route }">
            <KeepAlive>
              <Transition mode="out-in" name="v-transition-fade">
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
import { computed, defineAsyncComponent } from 'vue';

import TopHeader from '@/app/layouts/TopHeader.vue';
import { setupChordScoreBridge } from '@/app/services/chordScoreBridge';
import { useUiStore } from '@/platform/store/uiStore';
import GlobalToast from '@/platform/ui/feedback/GlobalToast.vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/platform/utils/constants';

const uiStore = useUiStore();
// 跨领域装配：和弦删除/撤销与乐谱槽位解绑的事件桥接（chord 域因此无需依赖 score 域）
setupChordScoreBridge();
const SidebarLeft = defineAsyncComponent(() => import('@/app/layouts/SidebarLeft.vue'));
const mainPaddingLeft = computed(() => (uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL.value : '0px'));
</script>
