import { createApp } from 'vue';

import { createPinia } from 'pinia';
import VWave from 'v-wave';

import App from '@/app/App.vue';
import { router } from '@/app/router';
import { bootstrapDataLayer, syncLocalStorageToIdb } from '@/services/data/bootstrap';
import { useTheme } from '@/shared/composables/useTheme';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { logger } from '@/utils/core/logger';

import '@/assets/main.scss';
import '@/assets/tailwind.css';

import { vChordName } from './directives/vChordName';
import { vFocus } from './directives/vFocus';
import { vGridNav } from './directives/vGridNav';
import { vMarquee } from './directives/vMarquee';
import { vScrollCache } from './directives/vScrollCache';
import { vTooltip } from './directives/vTooltip';
import { vWheelScroll } from './directives/vWheelScroll';

const app = createApp(App);
const pinia = createPinia();

useTheme().initTheme();

app.use(pinia);
app.use(VWave, { easing: 'ease-out' });
app.use(router);
app.directive('tooltip', vTooltip);
app.directive('wheel-scroll', vWheelScroll);
app.directive('focus', vFocus);
app.directive('scroll-cache', vScrollCache);
app.directive('grid-nav', vGridNav);
app.directive('marquee', vMarquee);
app.directive('chord-name', vChordName);

/** 恢复上次编辑中的和弦草稿（含异常兜底日志），避免应用启动后编辑态丢失。 */
const initializeEditor = () => {
  try {
    useChordEditorStore(pinia).initEditor();
  } catch (error) {
    logger.error('main', '初始化编辑器时出错', error);
  }
};

/** 应用启动：先完成数据层引导（旧数据迁移），无论成败都挂载应用并初始化编辑器。 */
const initApp = async () => {
  try {
    await bootstrapDataLayer(window.localStorage);
  } catch (error) {
    logger.error('main', '数据层引导失败', error);
  } finally {
    app.mount('#app');
    initializeEditor();
  }
};

void initApp();

/** 退出/切后台前把 localStorage 数据同步到 IndexedDB 备份（异常静默，不中断生命周期）。 */
const syncOnExit = async () => {
  try {
    await syncLocalStorageToIdb(window.localStorage);
  } catch {
    // 页面退出/切后台时同步异常不中断生命周期
  }
};
window.addEventListener('pagehide', () => void syncOnExit());
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void syncOnExit();
});
