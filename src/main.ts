import App from '@/App.vue';
import { useTheme } from '@/composables/app/useTheme';
import { router } from '@/router';
import { bootstrapDataLayer, syncLocalStorageToIdb } from '@/services/data/bootstrap';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { logger } from '@/utils/core/logger';
import { createPinia } from 'pinia';
import VWave from 'v-wave';
import { createApp } from 'vue';

import '@/assets/main.scss';
import '@/assets/tailwind.css';
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

const initializeEditor = () => {
  try {
    useChordEditorStore(pinia).initEditor();
  } catch (error) {
    logger.error('main', '初始化编辑器时出错', error);
  }
};

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
