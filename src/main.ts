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
import { setupExitFlush } from '@/platform/services/lifecycle/exitFlush';
import { setupFocusOutlineRing } from '@/platform/ui/focus-ring/focusRingOverlay';
import { logger } from '@/platform/utils/logger';

import { vChordName } from './domains/chord/directives/vChordName';
import { vActionCard } from './platform/directives/vActionCard';
import { vAutoHeight } from './platform/directives/vAutoHeight';
import { vAutoWidth } from './platform/directives/vAutoWidth';
import { vEdgeFade } from './platform/directives/vEdgeFade';
import { vFocus } from './platform/directives/vFocus';
import { vGridNav } from './platform/directives/vGridNav';
import { vMarquee } from './platform/directives/vMarquee';
import { vScrollbar } from './platform/directives/vScrollbar';
import { vScrollIntoView } from './platform/directives/vScrollIntoView';
import { vTooltip } from './platform/directives/vTooltip';
import { vWheelScroll } from './platform/directives/vWheelScroll';

// AppDBSchema 的 declaration merging 必须在程序内生效（idb 编译期绑定依赖它）；
// 显式引用一次，防止构建路径裁剪掉这个只有类型声明的模块
import '@/app/services/storage/appDbSchema';
import '@/assets/tailwind.css';
import '@/assets/main.scss';
// 颜色令牌（单一来源在仓库根 tokens/，构建期由 culori 派生）。经 Vite 虚拟模块注入，与其余样式同走 CSS 管线。
// 刻意排在样式之后：注入内容不包 @layer，而未分层声明优先于 Tailwind @theme 所在的 @layer。
import 'virtual:color-tokens.css';

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
  // 这里同步重读偏好（cookie 缺失时可从 kv 镜像迁移历史持久化值）并落 cookie。
  // 必须兜底：initTheme 内的 writeCookie 是裸 `document.cookie=`（useTheme.ts:32，无 try），
  // 浏览器禁用 cookie / 沙箱 iframe 下会抛。此前它是两个 try 之间的裸调用，一旦抛出即成为
  // unhandled rejection → 下方 finally 里的 app.mount 永远到不了 → 永久白屏（且全 src 无 errorHandler）。
  // 与上下两段同口径：初始化失败不阻断启动。
  try {
    useTheme().initTheme();
  } catch (error) {
    logger.error('main', '主题初始化失败', error);
  }

  // 数据域水合：挂载前完成，首帧即有数据。
  // 与上方 bootstrap 同款超时兜底：hydrate 同样打 IDB（open 被其它标签页阻塞时可永久挂起），
  // 裸 await 会让 finally 里的 mount 永远到不了——整屏空白零报错。超时即挂载；晚到的水合数据
  // 由各 store 的「窗口期保护」处理：窗口内已有本地改动时跳过覆盖赋值，避免把用户已编辑的
  // 内存状态顶回磁盘快照（见 chordStore.hydrate / songStore.hydrate）
  // 真正的 hydration 单独留一份引用：超时只决定**挂载**时机，不代表水合已经完成。
  // 启动期的云端比对必须等它 settle —— 比对读的是两个 store 的完整内存状态，水合未完成时
  // 读到的空初值会被当成「本地库是空的」，与云端一比必然报「云端较新」，而那个常驻通知上
  // 挂着一键「拉取云端覆盖本地」（见 checkCloudDataChange 的就绪门禁）。
  //
  // 声明必须在 try **之外**：消费点在下方 finally 块内，而 finally 与 try 是两个独立作用域，
  // 看不见 try 里 const 声明的东西。初值给一个已决议的 Promise —— 万一 try 内连 Promise.all
  // 那行都没走到（store 求值抛出等），它立即 settle，await 行为等价于不等待。
  let hydration: Promise<unknown> = Promise.resolve();
  try {
    const HYDRATE_TIMEOUT_MS = 8000;
    hydration = Promise.all([useChordStore(pinia).hydrate(), useSongStore(pinia).hydrate()]);
    await Promise.race([hydration, new Promise<undefined>(resolve => setTimeout(resolve, HYDRATE_TIMEOUT_MS))]);
  } catch (error) {
    logger.error('main', '数据域水合失败', error);
  } finally {
    app.mount('#app');
    initializeEditor();
    // 外扩聚焦环（JS overlay）：CSS 外扩 outline 会被父 overflow:hidden 裁剪，改由顶层跟随环渲染
    setupFocusOutlineRing();
    // 退出落盘兜底：唯一的那对 pagehide / visibilitychange 监听由平台层持有，各 store 只登记回调。
    // 幂等（registerExitFlusher 首次登记时也会补挂），这里显式挂接以保持装配层自述
    setupExitFlush();
    // 启动后非阻塞比对云端数据校验和（dataMd5），不一致时 message 提示引导同步（懒加载，不进首屏闭包）
    // 补 .catch 兜底：避免探测异常（未预期的 promise rejection）在控制台成为 unhandled rejection
    void import('@/app/services/sync/syncActions')
      .then(async m => {
        // 等水合真正结束再比对。hydration 失败时各 store 内部已 catch 并保持未水合，
        // 那种情形由 checkCloudDataChange 内部的门禁跳过比对，不在这里重复记日志。
        await hydration.catch(() => {});
        return m.checkCloudDataChange();
      })
      .catch(error => logger.error('main', '云端数据一致性检测失败', error));
  }
};

void initApp();
