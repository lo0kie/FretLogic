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
import { setupFocusOutlineRing } from '@/platform/ui/focus-ring/focusRingOverlay';
import { logger } from '@/platform/utils/logger';

import { vChordName } from './domains/chord/directives/vChordName.ts';
import { vActionCard } from './platform/directives/vActionCard.ts';
import { vAutoHeight } from './platform/directives/vAutoHeight.ts';
import { vAutoWidth } from './platform/directives/vAutoWidth.ts';
import { vEdgeFade } from './platform/directives/vEdgeFade.ts';
import { vFocus } from './platform/directives/vFocus.ts';
import { vGridNav } from './platform/directives/vGridNav.ts';
import { vMarquee } from './platform/directives/vMarquee.ts';
import { vScrollbar } from './platform/directives/vScrollbar';
import { vScrollIntoView } from './platform/directives/vScrollIntoView.ts';
import { vTooltip } from './platform/directives/vTooltip.ts';
import { vWheelScroll } from './platform/directives/vWheelScroll.ts';

// AppDBSchema 的 declaration merging 必须在程序内生效（idb 编译期绑定依赖它）；
// 显式引用一次，防止构建路径裁剪掉这个只有类型声明的模块
import '@/app/services/storage/appDbSchema';
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
    // IDB 升级被其它标签页阻塞时 open 可能永久挂起（不 resolve 也不 reject），
    // 加超时兜底：超时即继续启动（hydrate 各自容错），避免整屏空白且 console 零报错
    const DATA_LAYER_TIMEOUT_MS = 8000;
    await Promise.race([
      bootstrapDataLayer(),
      new Promise<undefined>(resolve => setTimeout(resolve, DATA_LAYER_TIMEOUT_MS)),
    ]);
  } catch (error) {
    logger.error('main', '数据层引导失败', error);
  }

  // 主题初始化挪到转录之后：首帧观感由 index.html 内联脚本（读 cookie）保障，不闪白；
  // 这里同步重读偏好（cookie 缺失时可从 kv 镜像迁移历史持久化值）并落 cookie
  useTheme().initTheme();

  // 数据域水合：挂载前完成，首帧即有数据。
  // 与上方 bootstrap 同款超时兜底：hydrate 同样打 IDB（open 被其它标签页阻塞时可永久挂起），
  // 裸 await 会让 finally 里的 mount 永远到不了——整屏空白零报错。超时即挂载（水合 Promise
  // 不取消，晚到时 store 各自的响应式赋值仍会把数据补进已挂载的 UI）
  try {
    const HYDRATE_TIMEOUT_MS = 8000;
    await Promise.race([
      Promise.all([useChordStore(pinia).hydrate(), useSongStore(pinia).hydrate()]),
      new Promise<undefined>(resolve => setTimeout(resolve, HYDRATE_TIMEOUT_MS)),
    ]);
  } catch (error) {
    logger.error('main', '数据域水合失败', error);
  } finally {
    app.mount('#app');
    initializeEditor();
    // 外扩聚焦环（JS overlay）：CSS 外扩 outline 会被父 overflow:hidden 裁剪，改由顶层跟随环渲染
    setupFocusOutlineRing();
    // 启动后非阻塞比对云端数据校验和（dataMd5），不一致时 message 提示引导同步（懒加载，不进首屏闭包）
    // 补 .catch 兜底：避免探测异常（未预期的 promise rejection）在控制台成为 unhandled rejection
    void import('@/app/services/sync/syncActions')
      .then(m => m.checkCloudDataChange())
      .catch(error => logger.error('main', '云端数据一致性检测失败', error));
  }
};

void initApp();
