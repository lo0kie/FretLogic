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
      <RouterView #="{ Component }">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import AppShell from '@/components/AppShell.vue';
import { useUiStore } from '@/stores/uiStore';
import TopHeader from '@/views/header-top/TopHeader.vue';
import { computed, defineAsyncComponent } from 'vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from '@/utils/constants';
import { toggleDarkMode } from './stores/globalState.ts';
import GlobalToast from '@/components/GlobalToast.vue';

const uiStore = useUiStore();
const SidebarLeft = defineAsyncComponent(() => import('@/views/sidebar-left/SidebarLeft.vue'));
const mainPaddingLeft = computed(() => (uiStore.isLeftOpen ? LEFT_SIDEBAR_WIDTH_PIXEL.value : '0px'));

const executeToggleThemeWithAnimation = () => {
  const rootEl = document.documentElement;

  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  if (!document.startViewTransition) {
    toggleDarkMode();
    disableChangingAttribute();

    return;
  }

  const transition = document.startViewTransition(toggleDarkMode);

  transition.finished.then(disableChangingAttribute).catch(disableChangingAttribute);
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-main-content {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  transition: padding-left @duration-slow @bezier-sidebar;
}
</style>
