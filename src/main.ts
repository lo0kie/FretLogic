import { createApp } from 'vue';

import VWave from 'v-wave';
import { createPinia } from 'pinia';

import App from '@/app/App.vue';
import { router } from '@/app/router';
import { bootstrapDataLayer } from '@/app/services/data/bootstrap';
import { registerChordDirectives } from '@/domains/chord/directives/register';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { registerFretboardDirectives } from '@/domains/fretboard/directives/register';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useTheme } from '@/platform/composables/useTheme';
import { registerPlatformDirectives } from '@/platform/directives';
import { BOOT_PHASES, reportBootProgress, withBootPhase } from '@/platform/services/boot/bootProgress';
import { setupExitFlush } from '@/platform/services/lifecycle/exitFlush';
import { setupFocusOutlineRing } from '@/platform/ui/focus-ring/focusRingOverlay';
import { logger } from '@/platform/utils/logger';

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

app.use(pinia);
app.use(VWave, { easing: 'ease-out' });
app.use(router);

// 指令注册：清单与注册名都收在各自的指令目录下（platform/directives/register.ts、
// domains/chord/directives/register.ts、domains/fretboard/directives/register.ts），本文件只做装配。
// 分三处是 zone ① 的结果 —— platform 不得反向依赖 domains（含 type-only），故领域指令由各自领域注册。
registerPlatformDirectives(app);
registerChordDirectives(app);
registerFretboardDirectives(app);

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
  // 启动占位上的真实进度：数据域水合是启动页停留的全部原因（顶满规模实测 10~20 秒），
  // 而它自己不知道用户看到的是什么。各加载链路经 reportBootProgress 上报已处理条数，
  // 由 platform 层直接改写 index.html 的占位文本与进度条（此刻 Vue 尚未挂载，无响应式出口）。
  //
  // 整段启动是**一条总进度**，各阶段占固定区间（见 BOOT_PHASES）—— 换成「每段各自 0→100%」
  // 会因为各段并发而让条儿来回横跳（实测「和弦库 100%」紧接「乐谱库 40%」）。
  // 本段（kv 水合 + 旧存储转录）没有天然分片计数，故用 withBootPhase 按**时长**估一条粗进度。
  const bootstrapPhase = withBootPhase(BOOT_PHASES.prepare, '正在准备工作区', 1200);
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
  } finally {
    bootstrapPhase.stop();
  }

  // 主题初始化挪到转录之后：首帧观感由 index.html 内联脚本（读 cookie）保障，不闪白；
  // 这里同步重读偏好（cookie 缺失时可从 kv 镜像迁移历史持久化值）并落 cookie。
  // 必须兜底：initTheme 内的 writeCookie 是裸 `document.cookie=`（见 useTheme.ts 的 writeCookie，无 try），
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
  //
  // 30 秒而非原先的 8 秒：8 秒是「整屏空白」与「挂载后先显示空列表」二选一时调的，而顶满规模的
  // 实测读取（2000 首 × 600 行 ≈ 900 MB，反序列化 + 清洗的纯 CPU 就 6~7 秒，另加真实磁盘读）在
  // 10~20 秒量级 —— 8 秒会稳定误伤：占位消失、应用带着空列表出现，几秒后数据才补进来，看起来像
  // 数据丢了。index.html 的启动占位已经接住「等待期间显示什么」，这个兜底因此只需接住真挂死
  //（open 永久挂起：既不 resolve 也不 reject），放宽到 30 秒即可。
  try {
    const HYDRATE_TIMEOUT_MS = 30000;
    // 两个域并发水合，各自有独立的分母（和弦库 2 步、乐谱库按首数）。两域互不知情，若不加
    // 「同阶段比例只增不减」的守卫，和弦库跑完报 2/2 之后乐谱库会把条儿推回 40/2000 ——
    // 观感是「进度倒退」。该守卫在 reportBootProgress 内部（见其注释），这里只管并发。
    // 仍取并发而不是串行：串行会把总耗时从 max(a,b) 变成 a+b，为条儿的连贯性付这个代价不值。
    await Promise.race([
      Promise.all([useChordStore(pinia).hydrate(), useSongStore(pinia).hydrate()]),
      new Promise<undefined>(resolve => setTimeout(resolve, HYDRATE_TIMEOUT_MS)),
    ]);
  } catch (error) {
    logger.error('main', '数据域水合失败', error);
  } finally {
    // 收起进度读数：接下来是挂载与首帧同步工作（路由解析、编辑器装配），没有可报的分片进度。
    // 落在 mount 区间的起点（95%）而不是 100%：这一段同样会耗时，停在 100% 再消失会像「卡在满格」。
    reportBootProgress({ label: '正在载入界面', phase: BOOT_PHASES.mount, done: 0, total: 1 });
    app.mount('#app');
    initializeEditor();
    // 外扩聚焦环（JS overlay）：CSS 外扩 outline 会被父 overflow:hidden 裁剪，改由顶层跟随环渲染
    setupFocusOutlineRing();
    // 退出落盘兜底：唯一的那对 pagehide / visibilitychange 监听由平台层持有，各 store 只登记回调。
    // 幂等（registerExitFlusher 首次登记时也会补挂），这里显式挂接以保持装配层自述
    setupExitFlush();
  }
};

void initApp();
