<template>
  <div class="app-window-shell">
    <TopHeader @export-image="handleExportImage" @toggle-theme="executeToggleThemeWithAnimation" />

    <div class="app-split-view-body">
      <SidebarLeft />

      <main class="app-main-content">
        <!-- 🌟 直接在这里渲染 Workbench 并绑定 ref，省去繁琐的插槽透传 -->
        <Workbench ref="workbenchRef" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordService } from '@/services/useChordService';
import { useSettingsStore } from '@/stores/settingsStore';
import { defineAsyncComponent, ref } from 'vue';
import TopHeader from './header-top/TopHeader.vue';
import Workbench from './Workbench.vue';

const SidebarLeft = defineAsyncComponent(() => import('./sidebar-left/SidebarLeft.vue'));

const settingsStore = useSettingsStore();
const chordService = useChordService();

const workbenchRef = ref<InstanceType<typeof Workbench> | null>(null);

const handleExportImage = (isTransparent: boolean) => {
  // 🌟 此时 workbenchRef.value 必然存在，可以稳定获取组件 DOM 或 .workbench-card
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
  min-width: 1628px;
  min-height: 880px;
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
</style>
