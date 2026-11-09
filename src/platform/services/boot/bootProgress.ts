/**
 * 启动占位的真实进度上报。
 *
 * 【为什么要一个独立模块，而不是让各加载器直接摸 DOM】
 * 启动占位（index.html 的 `.boot-splash`）在**应用挂载前**就要显示进度，而它既在 Vue 之外、
 * 又在 IDB 读取链路的下游 —— 数据域各 store 是 domain 层，不允许反向 import app 层；
 * platform 是双向可见的唯一合法汇合点，故进度写入收在这里，domain 只调一个无依赖的 `reportBootProgress`。
 *
 * 【为什么直接写 DOM 而不是走响应式】
 * 此刻 Vue 尚未 mount（main.ts 的 `app.mount` 在 finally 里，晚于全部 hydrate），任何 store / ref
 * 都没有渲染出口。占位元素是 index.html 里的静态节点，唯一可行的通路就是直接改它的文本与宽度。
 *
 * 【为什么必须有节流】
 * 读取链路是「每 100 首清洗一次」的分片循环（见 songRepository.SANITIZE_CHUNK_SIZE），顶满规模下
 * 会调用上百次。每次都写 DOM 会让样式重算挤占本就不宽裕的主线程 —— 而这条链路的全部意义就是
 * 让主线程有机会喘气。故按「比例变化超过 1% 或走过 MIN_INTERVAL_MS」才真正落笔。
 */

/** 占位根节点的选择器与其中的可变节点：与 index.html 的 .boot-splash 结构一一对应 */
const SPLASH_SELECTOR = '.boot-splash';
const LABEL_SELECTOR = '.boot-splash__label';
const BAR_FILL_SELECTOR = '.boot-splash__bar-fill';

/**
 * 两次落笔之间的最小间隔（ms）。
 * 取 60 ≈ 一帧：比这更密的更新用户看不出来，却要付一次样式重算。
 */
const MIN_INTERVAL_MS = 60;

/** 进度比例的变化阈值：不足 1% 的推进不值得落笔 */
const MIN_DELTA = 0.01;

/**
 * 启动全程的阶段区间（全局贯穿式）。
 *
 * 【为什么是「一条总进度 + 各阶段占固定区间」，而不是每阶段各自 0→100%】
 * 启动期的各段是**并发**的（`bootstrapDataLayer` 与两个 store 的 hydrate 并行），若各段各自
 * 从 0 走到 100%，条儿会在段与段之间来回横跳 —— 实测「和弦库 100%」之后紧接「乐谱库 40%」，
 * 观感是进度倒退。改成把整段启动视作一条总进度、每段只占其中一段区间之后，条儿**全程只增不减**。
 *
 * 区间划分按实测耗时量级定（顶满规模下乐谱库远大于其余各段）：准备工作区（kv 水合 + 旧存储
 * 转录）通常极快但可能被阻塞，给 15%；和弦库是单次 getAll，给 15%；乐谱库是整段的大头，给 70%；
 * 最后的挂载与首帧同步工作给 5%。
 *
 * 【代价，必须说清楚】条宽不再等于**当前阶段自身**的完成度 —— 乐谱库读到一半时条儿在 65%，
 * 而它自己才走了一半。文案因此显示的是**该阶段自己的真实读数**（`正在加载乐谱 1000 / 2000`），
 * 与条宽是两个口径：条宽回答「整段启动还剩多久」，数字回答「当前这项做到哪了」。
 */
export const BOOT_PHASES = {
  /** kv 水合 + 旧存储转录 */
  prepare: { from: 0, to: 0.15 },
  /** 和弦库读取与清洗（两步） */
  chords: { from: 0.15, to: 0.3 },
  /** 乐谱库读取与分片清洗（整段的大头） */
  songs: { from: 0.3, to: 0.95 },
  /** 挂载、路由解析、编辑器装配 */
  mount: { from: 0.95, to: 1 },
} as const;

export type BootPhaseName = keyof typeof BOOT_PHASES;

export interface BootProgress {
  /** 阶段名（显示在进度条上方，如「正在加载乐谱」） */
  label: string;
  /**
   * 该阶段所在的总进度区间。**必须给** —— 缺省会让条儿退回不确定态。
   * 用 `BOOT_PHASES.<name>` 传，不要手写字面量。
   */
  phase?: { from: number; to: number };
  /**
   * 该阶段内已完成量 / 总量。**两者一起给才有意义**，故都可省：
   * 只给 label 表示「进入了无法定量分片的新阶段」，此时条儿停在区间起点而不是沿用上一段的读数。
   * total 为 0 等同于未知（空库没有进度可言）。
   */
  done?: number;
  total?: number;
  /**
   * 读数是否为**时长估算**（见 `withBootPhase`）。为 true 时条儿照常推进，但**文案不显示数字**。
   *
   * 必须区分：估算值的分母是模块内定的模拟量（10000），与真实读数的分母（2000 首）不是一个口径。
   * 不区分的话用户会看到「正在加载乐谱 1260 / 10000」紧接「正在加载乐谱 200 / 1200」——
   * 一组没有意义、还会跳变的数字。估算期间只说明「正在做这件事」，数字等真实读数到了再出。
   */
  estimated?: boolean;
}

let lastRatio = -1;
let lastLabel = '';
let lastStamp = 0;

/**
 * 把「阶段内完成度」映射到「总进度」。
 *
 * `inner` 为负表示该阶段无法定量（只报了 label）：此时停在区间起点 —— 起点比「沿用上一段的
 * 读数」诚实，后者会让用户以为还在做上一件事。
 */
const globalRatioOf = (phase: { from: number; to: number }, inner: number): number =>
  inner < 0 ? phase.from : phase.from + (phase.to - phase.from) * inner;

/**
 * 上报一次进度。**幂等且廉价**：查不到占位节点（已挂载 / 单测环境）时立即返回。
 *
 * 不抛错：这是一条纯观感链路，任何失败都不该影响启动 —— 占位上的文字最多停在上一帧。
 */
export const reportBootProgress = (progress: BootProgress): void => {
  if (typeof document === 'undefined') return;
  const root = document.querySelector<HTMLElement>(SPLASH_SELECTOR);
  // 已挂载（Vue 清空了 #app，占位随之消失）或占位结构被改坏：静默放弃
  if (!root) return;

  const { label, done, total, phase, estimated } = progress;
  const known = typeof total === 'number' && total > 0 && typeof done === 'number';
  const innerRate = known ? Math.min(1, Math.max(0, (done as number) / (total as number))) : -1;
  const rawRatio = phase ? globalRatioOf(phase, innerRate) : -1;

  // 【为什么全程只增不减】各段并发推进、互不知情，任何一段报出一个比当前条宽更小的值都不该
  // 让条儿退回去 —— 退回去是启动页最刺眼的观感缺陷。这条守卫对整个启动期生效（不限于同阶段），
  // 因为总进度本就是单调的。
  //
  // 下限取「当前值」与「本阶段起点」中的**较大者**：并发段报出更小的值时条儿停住不动（取当前值），
  // 同时保证不会低于本阶段的起点 —— 后者只在区间配置错误（写反 / 段与段重叠）时才起作用，
  // 此时条儿停在正确的位置上不再前进，比倒退回去更容易看出配置有问题。
  const floor = phase ? Math.max(phase.from, lastRatio) : lastRatio;
  const ratio = rawRatio < 0 ? rawRatio : Math.max(rawRatio, floor);
  const now = Date.now();

  // 标签变了必须落笔（阶段切换是用户最需要看到的信息），比例推进则按阈值节流
  const labelChanged = label !== lastLabel;
  const ratioChanged = ratio >= 0 && Math.abs(ratio - lastRatio) >= MIN_DELTA;
  const intervalElapsed = now - lastStamp >= MIN_INTERVAL_MS;
  if (!labelChanged && !(ratioChanged && intervalElapsed)) return;

  lastLabel = label;
  lastRatio = ratio;
  lastStamp = now;

  const labelNode = root.querySelector<HTMLElement>(LABEL_SELECTOR);
  if (labelNode) {
    // 文案显示**该阶段自己的**真实读数（不是按条宽反算）—— 条宽是「整段启动还剩多久」，
    // 数字是「当前这项做到哪了」，两个口径，故不能用比例互推。
    // 估算值（estimated）不带数字：它的分母是内部模拟量，与真实读数的分母不是一个口径。
    const showCount = known && !estimated;
    const next = showCount ? `${label} ${String(done)} / ${String(total)}` : label;
    if (labelNode.textContent !== next) labelNode.textContent = next;
  }

  // 不确定进度：去掉宽度（让 CSS 的滑动动画接管）。**只在没有区间时**才这样 —— 有区间时
  // 即使该阶段无法定量，也应停在区间起点（一条短实心）而不是滑动的空轨。
  const fill = root.querySelector<HTMLElement>(BAR_FILL_SELECTOR);
  if (fill)
    if (ratio >= 0) {
      fill.style.width = `${(ratio * 100).toFixed(1)}%`;
      fill.removeAttribute('data-indeterminate');
    } else {
      fill.style.removeProperty('width');
      fill.setAttribute('data-indeterminate', '');
    }
};

/**
 * 测试用：清空节流基线。
 *
 * 必须导出：基线是模块级状态，而一个测试文件会连续跑多个用例 —— 前一个用例把比例推到 1 之后，
 * 后一个用例从头开始的小增量会被阈值吞掉，表现为「上报了却没写进 DOM」，与实现缺陷不可区分。
 */
export const resetBootProgressThrottle = (): void => {
  lastRatio = -1;
  lastLabel = '';
  lastStamp = 0;
};

/**
 * 启动占位是否仍在屏幕上。
 *
 * 给需要「自报一个粗进度」的调用方用（见 `withBootPhase`）：占位已消失时它们不必白开一个定时器。
 */
export const isBootSplashMounted = (): boolean =>
  typeof document !== 'undefined' && document.querySelector(SPLASH_SELECTOR) !== null;

/**
 * 包一段「没有天然分片、但耗时可能不短」的异步工作，给它一条**基于时长估算**的粗进度。
 *
 * 【为什么需要它】有些段落内部没有可切分的计数（一次 `idb.getAll` 就是一次不可分割的异步调用，
 * 拿不到「已读多少条」）。若这些段只报 label，条儿会**停在区间起点一动不动** —— 顶满规模下
 * 一段可能有好几秒。按预期耗时给一条缓慢推进的粗进度，比静止的条更能说明「还没有卡死」。
 *
 * 【必然不准，这是刻意的】把这段时间按 `expectedMs` 线性映射到区间内。真进度一到（外层调
 * reportBootProgress）就立刻接管：估算只走到区间的 90%，留下末段给真实读数，避免出现
 * 「估算先撞到 100%、真实读数再报 40%」这种条儿先满后缩的形态。
 *
 * **用完必须 stop()**：不 stop 的定时器会一直跑到占位消失（或 `expectedMs` 耗尽），
 * 在每个 tick 里做一次无用的 DOM 查询。
 *
 * @param phase  这段工作占用的总进度区间（传 `BOOT_PHASES.<name>`）
 * @param label  这段工作的阶段名（与前后阶段不同才能触发落笔，见 reportBootProgress）
 * @param expectedMs 预期耗时（ms），用于把时间映射成比例
 * @returns 一个在任何时刻调用都能停表的收尾句柄（幂等）
 */
export const withBootPhase = (
  phase: { from: number; to: number },
  label: string,
  expectedMs: number
): { stop: () => void } => {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = (): void => {
    if (stopped || !isBootSplashMounted()) return;
    const progress = Math.min((Date.now() - startedAt) / expectedMs, 1);
    // 上报的是**阶段内**完成度（不是全局比例）：reportBootProgress 会把它映射到区间里，
    // 这里先算全局值再传进去会套两遍映射（实测条儿只能走到区间的 87.5% 而不是 88.5%）。
    // 阶段内 0.9 对应全局 from + (to-from)*0.9 —— 末段留给真实读数。
    const inner = Math.min(progress, 1) * 0.9;
    const total = 10000;
    reportBootProgress({ label, phase, done: Math.round(inner * total), total, estimated: true });
    if (progress < 1) timer = setTimeout(tick, 80);
  };
  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
};
