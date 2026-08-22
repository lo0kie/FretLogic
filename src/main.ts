import App from '@/App.vue';
import { bootstrapDataLayer, syncLocalStorageToIdb } from '@/core/data/bootstrap';
import { logger } from '@/core/logger';
import { useTheme } from '@/core/theme';
import { router } from '@/router';
import { useEditorStore } from '@/stores/chordEditorStore';
import { createPinia } from 'pinia';
import VWave from 'v-wave';
import { createApp } from 'vue';

import '@/assets/main.less';
import { vTooltip } from './directives/vTooltip';

const app = createApp(App);
const pinia = createPinia();

useTheme().initTheme();

app.use(pinia);
app.use(VWave, { easing: 'ease-out' });
app.use(router);
app.directive('tooltip', vTooltip);

const initializeEditor = () => {
  try {
    useEditorStore(pinia).initEditor();
  } catch (error) {
    logger.error('main', '初始化编辑器时出错', error);
  }
};

bootstrapDataLayer(window.localStorage)
  .then(() => {
    app.mount('#app');
    initializeEditor();
  })
  .catch(error => {
    logger.error('main', '数据层引导失败', error);
    app.mount('#app');
    initializeEditor();
  });

const syncOnExit = () => {
  syncLocalStorageToIdb(window.localStorage).catch(() => {});
};
window.addEventListener('pagehide', syncOnExit);
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') syncOnExit();
});
