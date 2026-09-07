import { createApp } from 'vue';

import VWave from 'v-wave';
import { createPinia } from 'pinia';

import App from '@/app/App.vue';
import { router } from '@/app/router';
import { bootstrapDataLayer, syncLocalStorageToIdb } from '@/app/services/data/bootstrap';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useTheme } from '@/platform/composables/useTheme';
import { logger } from '@/platform/utils/logger';

import '@/assets/main.scss';
import '@/assets/tailwind.css';

import { vChordName } from './domains/chord/directives/vChordName.ts';
import { vActionCard } from './platform/directives/vActionCard.ts';
import { vAutoHeight } from './platform/directives/vAutoHeight.ts';
import { vAutoWidth } from './platform/directives/vAutoWidth.ts';
import { vFocus } from './platform/directives/vFocus.ts';
import { vGridNav } from './platform/directives/vGridNav.ts';
import { vMarquee } from './platform/directives/vMarquee.ts';
import { vScrollbar } from './platform/directives/vScrollbar.ts';
import { vScrollIntoView } from './platform/directives/vScrollIntoView.ts';
import { vTooltip } from './platform/directives/vTooltip.ts';
import { vWheelScroll } from './platform/directives/vWheelScroll.ts';

const app = createApp(App);
const pinia = createPinia();

useTheme().initTheme();

app.use(pinia);
app.use(VWave, { easing: 'ease-out' });
app.use(router);
app.directive('tooltip', vTooltip);
app.directive('action-card', vActionCard);
app.directive('wheel-scroll', vWheelScroll);
app.directive('focus', vFocus);
app.directive('scroll-into-view', vScrollIntoView);
app.directive('scrollbar', vScrollbar);
app.directive('grid-nav', vGridNav);
app.directive('marquee', vMarquee);
app.directive('chord-name', vChordName);
app.directive('auto-width', vAutoWidth);
app.directive('auto-height', vAutoHeight);

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
