<template>
  <GlobalToast />

  <div class="app-window-shell">
    <TopHeader @toggle-theme="executeToggleThemeWithAnimation" />

    <div class="app-split-view-body">
      <Transition name="drawer-fade">
        <div
          v-if="uiStore.isMobile && uiStore.isLeftOpen"
          class="mobile-drawer-mask"
          @click="uiStore.isLeftOpen = false"
        />
      </Transition>

      <SidebarLeft :class="{ 'is-mobile-drawer': uiStore.isMobile }" />

      <main class="app-main-content" :style="{ paddingLeft: mainPaddingLeft }">
        <RouterView #="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUiStore } from '@/stores/uiStore';
import TopHeader from '@/views/header-top/TopHeader.vue';
import { computed, defineAsyncComponent, watch } from 'vue';
import { useRoute } from 'vue-router';
import GlobalToast from './components/GlobalToast.vue';
import { LEFT_SIDEBAR_WIDTH_PIXEL } from './constants/layout.ts';
import { toggleDarkMode } from './stores/globalState.ts';

const SidebarLeft = defineAsyncComponent(() => import('./views/sidebar-left/SidebarLeft.vue'));

const route = useRoute();
const uiStore = useUiStore();

const mainPaddingLeft = computed(() => {
  if (uiStore.isMobile || !uiStore.isLeftOpen || route.meta.overlapSidebar) return '0px';
  return LEFT_SIDEBAR_WIDTH_PIXEL;
});

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

watch(
  () => uiStore.isMobile,
  isMobile => {
    uiStore.isLeftOpen = !isMobile;
  },
  { immediate: true } // 初始化时也检查一次
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.app-window-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.app-split-view-body {
  flex: 1;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  min-height: 0;
  display: flex;
}

.app-main-content {
  position: absolute;
  inset: 0;
  z-index: 1;
  box-sizing: border-box;
  transition: padding-left @duration-slow @bezier-sidebar;
}

.mobile-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.fade-scale-transition(drawer-fade);
</style>
