<template>
  <GlobalToast />

  <div class="app-window-shell">
    <TopHeader @export-image="handleExportImage" @toggle-theme="executeToggleThemeWithAnimation" />

    <div class="app-split-view-body">
      <Transition name="drawer-fade">
        <div
          v-if="uiStore.isMobile && uiStore.isLeftOpen && route.meta.showSidebar"
          class="mobile-drawer-mask"
          @click="uiStore.isLeftOpen = false"
        ></div>
      </Transition>

      <SidebarLeft :class="{ 'is-mobile-drawer': uiStore.isMobile }" />

      <!-- 主视图路由出口 -->
      <main class="app-main-content">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordService } from '@/services/useChordService';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import TopHeader from '@/views/header-top/TopHeader.vue';
import { defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import GlobalToast from './components/GlobalToast.vue';

const SidebarLeft = defineAsyncComponent(() => import('./views/sidebar-left/SidebarLeft.vue'));

const route = useRoute();
const uiStore = useUiStore();
const settingsStore = useSettingsStore();

const chordService = useChordService();

const handleExportImage = (isTransparent: boolean) => {
  let targetEl: HTMLElement | null = null;

  if (route.path === '/') {
    targetEl = document.querySelector('.workbench-card') as HTMLElement;
  } else if (route.path === '/score') {
    targetEl = document.querySelector('.interactive-score-zone') as HTMLElement;
  }

  chordService.exportFretboardImage(targetEl, isTransparent);
};

const executeToggleThemeWithAnimation = (event?: MouseEvent) => {
  const rootEl = document.documentElement;
  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  if (!document.startViewTransition || !event) {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
    disableChangingAttribute();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = document.startViewTransition(() => {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 350,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });

  transition.finished.then(() => {
    disableChangingAttribute();
  });
};
</script>

<style scoped lang="less">
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
  flex: 1;
  height: 100%;
  position: relative;
  min-width: 0;
}

.mobile-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 99;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

:deep(.panel-left.is-mobile-drawer) {
  position: fixed;
  top: 3.2rem;
  bottom: 0;
  left: 0;
  z-index: 100;
  box-shadow: var(--shadow-xl);
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.25s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
</style>
