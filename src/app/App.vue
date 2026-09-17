<template>
  <GlobalToast />

  <!-- 首次打开引导：询问是否从线上（默认 Gitee）拉取备份数据，仅弹一次 -->
  <FirstRunPullModal />

  <Suspense>
    <div class="flex h-screen w-full min-w-[320px] flex-col overflow-hidden">
      <div class="shrink-0">
        <TopHeader />
      </div>

      <div class="relative flex min-h-0 flex-1 overflow-hidden">
        <SidebarLeft />

        <main class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            :style="{ paddingLeft: mainPaddingLeft }"
            class="absolute inset-0 transition-[padding-left] duration-slow ease-sidebar"
          >
            <RouterView #="{ Component, route }">
              <Transition mode="out-in" name="v-transition-fade">
                <KeepAlive :max="12">
                  <component :is="Component" :key="route.name || route.path" />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>
        </main>
      </div>
    </div>
  </Suspense>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';

import TopHeader from '@/app/layouts/TopHeader.vue';
import FirstRunPullModal from '@/app/modals/FirstRunPullModal.vue';
import GlobalToast from '@/platform/ui/feedback/GlobalToast.vue';
import { setupChordScoreBridge } from '@/app/services/chordScoreBridge';
import { setupShareLinkBridge } from '@/app/services/shareLinkBridge';
import { useUiStore } from '@/platform/store/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/platform/utils/constants';

const uiStore = useUiStore();
// 跨领域装配：和弦删除/撤销与乐谱槽位解绑的事件桥接（chord 域因此无需依赖 score 域）
setupChordScoreBridge();
// 跨领域装配：消费 URL 上的分享载荷（乐谱 / 和弦 / 分组），导入落地后从 URL 移除参数
setupShareLinkBridge();
const SidebarLeft = defineAsyncComponent(() => import('@/app/layouts/SidebarLeft.vue'));
const mainPaddingLeft = computed(() => (uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL.value : '0px'));
</script>
