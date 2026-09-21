<template>
  <GlobalNotification />

  <!-- 首次打开引导：询问是否从线上（默认 Gitee）拉取备份数据，仅弹一次 -->
  <FirstRunPullModal v-if="showFirstRunPull" />

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
            <!-- 并行过渡（不用 out-in）：旧页淡出与新页挂载/淡入同时进行，省掉「等旧页 leave 结束才开始
                 挂载新页」的整段串行等待。两页能重叠是因为被路由的组件根元素本身就已铺满定位
                 （WorkbenchView 是 absolute inset-0，ScoreView 是 relative size-full），
                 无需额外的叠层容器；out-in 的串行在这里纯属白等。 -->
            <Transition name="v-transition-fade">
              <KeepAlive :max="12">
                <component :is="Component" :key="route.name || route.path" />
              </KeepAlive>
            </Transition>
          </RouterView>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';

import TopHeader from '@/app/layouts/TopHeader.vue';
import GlobalNotification from '@/platform/ui/feedback/GlobalNotification.vue';
import { setupChordScoreBridge } from '@/app/services/chordScoreBridge';
import { setupPersistFailureNotice } from '@/app/services/persistFailureNotice';
import { setupShareLinkBridge } from '@/app/services/shareLinkBridge';
import { kvGet } from '@/platform/services/storage/idbKv';
import { useUiStore } from '@/platform/store/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL, STORAGE_KEYS } from '@/platform/utils/constants';

const uiStore = useUiStore();
// 跨领域装配：和弦删除/撤销与乐谱槽位解绑的事件桥接（chord 域因此无需依赖 score 域）
setupChordScoreBridge();
// 跨领域装配：消费 URL 上的分享载荷（乐谱 / 和弦 / 分组），导入落地后从 URL 移除参数
setupShareLinkBridge();
// 持久化失败提示：domain 层只上报「写入失败」，此处统一转成 Message（配额满时用户必须知情）
setupPersistFailureNotice();
const SidebarLeft = defineAsyncComponent(() => import('@/app/layouts/SidebarLeft.vue'));
// 首访引导改为条件渲染 + 异步组件：只有首访才拉取该 chunk（内含同步/备份服务与 zod），
// 非首访会话完全不加载，同时把这条静态依赖链移出首屏闭包（check-bundle 220KB 预算）。
// 判据与组件内部一致：HAS_VISITED 标记存在即视为已访问（kv 已在 initApp 中水合，可同步读）。
const showFirstRunPull = !kvGet(STORAGE_KEYS.HAS_VISITED);
const FirstRunPullModal = defineAsyncComponent(() => import('@/app/modals/FirstRunPullModal.vue'));
const mainPaddingLeft = computed(() => (uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL : '0px'));
</script>
