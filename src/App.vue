<template>
  <GlobalToast />

  <AppShell>
    <template #header>
      <TopHeader @toggle-theme="executeToggleThemeWithAnimation" />
    </template>

    <template #left-sidebar>
      <SidebarLeft />
    </template>

    <div class="app-main-content" :style="{ paddingLeft: mainPaddingLeft }">
      <RouterView #="{ Component, route }">
        <Transition name="page-fade" mode="out-in">
          <KeepAlive>
            <component :is="Component" :key="route.name || route.path" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import AppShell from '@/components/AppShell.vue';
import GlobalToast from '@/components/GlobalToast.vue';
import { useUiStore } from '@/stores/uiStore';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/constants';
import TopHeader from '@/views/header-top/TopHeader.vue';
import { computed, defineAsyncComponent } from 'vue';
import { toggleDarkMode } from './stores/globalState.ts';

const uiStore = useUiStore();
const SidebarLeft = defineAsyncComponent(() => import('@/views/sidebar-left/SidebarLeft.vue'));
const mainPaddingLeft = computed(() => (uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL.value : '0px'));

const executeToggleThemeWithAnimation = (mode?: 'light' | 'dark' | 'auto') => {
  const rootEl = document.documentElement;
  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  const applyTheme = () => toggleDarkMode(mode);

  if (!document.startViewTransition) {
    applyTheme();
    disableChangingAttribute();
    return;
  }

  const transition = document.startViewTransition(applyTheme);
  transition.finished.then(disableChangingAttribute).catch(disableChangingAttribute);
};
</script>

<style scoped lang="scss">
.app-main-content {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  transition: padding-left $duration-slow $bezier-sidebar;
}

// 主视图（和弦-乐谱）平滑切换过渡
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity $duration-fast $bezier-standard;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}
</style>
