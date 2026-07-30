<template>
  <div class="app-window-shell">
    <TopHeader @export-image="handleExportImage" @toggle-theme="executeToggleThemeWithAnimation" />

    <div class="app-split-view-body">
      <!-- 移动端抽屉遮罩 -->
      <Transition name="drawer-fade">
        <div
          v-if="uiStore.isMobile && uiStore.isLeftOpen"
          class="mobile-drawer-mask"
          @click="uiStore.isLeftOpen = false"
        ></div>
      </Transition>

      <SidebarLeft :class="{ 'is-mobile-drawer': uiStore.isMobile }" />

      <main class="app-main-content">
        <Workbench ref="workbenchRef" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordService } from '@/services/useChordService';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import { defineAsyncComponent, ref, watch } from 'vue';
import TopHeader from './header-top/TopHeader.vue';
import Workbench from './workbench/Workbench.vue';

const SidebarLeft = defineAsyncComponent(() => import('./sidebar-left/SidebarLeft.vue'));

const uiStore = useUiStore();
const settingsStore = useSettingsStore();
const chordService = useChordService();

const workbenchRef = ref<InstanceType<typeof Workbench> | null>(null);

watch(
  () => uiStore.isMobile,
  mobile => {
    uiStore.isLeftOpen = !mobile;
  },
  { immediate: true }
);

const handleExportImage = (isTransparent: boolean) => {
  const captureEl = workbenchRef.value?.$el?.querySelector('.workbench-card') || workbenchRef.value?.$el;

  if (captureEl) {
    chordService.exportFretboardImage(captureEl, isTransparent);
  } else {
    console.error('未找到可供导出的 DOM 节点');
  }
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
}

.app-main-content {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
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
