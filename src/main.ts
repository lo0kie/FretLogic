import { createApp } from 'vue';

import VWave from 'v-wave';
import { createPinia } from 'pinia';

import App from '@/app/App.vue';
import { router } from '@/app/router';
import { bootstrapDataLayer } from '@/app/services/data/bootstrap';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useTheme } from '@/platform/composables/useTheme';
import { logger } from '@/platform/utils/logger';

import { vChordName } from './domains/chord/directives/vChordName.ts';
import { vActionCard } from './platform/directives/vActionCard.ts';
import { vAutoHeight } from './platform/directives/vAutoHeight.ts';
import { vAutoWidth } from './platform/directives/vAutoWidth.ts';
import { vEdgeFade } from './platform/directives/vEdgeFade.ts';
import { vFocus } from './platform/directives/vFocus.ts';
import { vGridNav } from './platform/directives/vGridNav.ts';
import { vMarquee } from './platform/directives/vMarquee.ts';
import { vScrollbar } from './platform/directives/vScrollbar.ts';
import { vScrollIntoView } from './platform/directives/vScrollIntoView.ts';
import { vTooltip } from './platform/directives/vTooltip.ts';
import { vWheelScroll } from './platform/directives/vWheelScroll.ts';

import '@/assets/tailwind.css';
import '@/assets/main.scss';

const app = createApp(App);
const pinia = createPinia();

app.config.performance = true;

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
app.directive('edge-fade', vEdgeFade);
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

/**
 * 应用启动：kv 水合 + 旧存储转录 → 主题同步初始化 → 数据域异步水合 → 挂载。
 * 水合失败不阻断启动（store 各自兜底为空列表/默认值，持久化链路照常工作）。
 */
const initApp = async () => {
  try {
    await bootstrapDataLayer();
  } catch (error) {
    logger.error('main', '数据层引导失败', error);
  }

  // 主题初始化挪到转录之后：首帧观感由 index.html 内联脚本（读 cookie）保障，不闪白；
  // 这里同步重读偏好（cookie 缺失时可从 kv 镜像迁移历史持久化值）并落 cookie
  useTheme().initTheme();

  // 数据域水合：挂载前完成，首帧即有数据
  try {
    await Promise.all([useChordStore(pinia).hydrate(), useSongStore(pinia).hydrate()]);
  } catch (error) {
    logger.error('main', '数据域水合失败', error);
  } finally {
    app.mount('#app');
    initializeEditor();
  }
};

void initApp();
