/**
 * 排列区逐行画布的**绘制队列**：全应用一条队列、**按片处理**、片间让出事件循环。
 *
 * 【为什么必须是模块级单例】这套东西若写在 `ScoreLineCanvas` 的 `<script setup>` 里，顶层代码是
 * **按组件实例**执行的 —— 每一行都会自带一条只有一条任务的队列，「分片」永远不会生效。
 * 状态收在这里之后，所有行共用同一条队列。
 *
 * 【为什么要分片】行画布是逐行一份绘制任务，一屏几十行几乎同时进来。若在同一帧里把整屏画完，
 * 那一帧就是一个几十毫秒的长任务 —— 拖动、滚动、悬停全排在它后面。故排成队列、每片若干条，
 * 片间用宏任务让出：绘制摊到多帧，输入始终能插进来。
 *
 * 【为什么要取消】父级只挂载视窗内的行（`v-for="visibleLines"`），卸载即离屏。快速拖动时整屏行
 * 被换掉，旧行的待画任务若照画，新入视窗的行就得排在它们后面白等 —— 故卸载时取消。
 * ⚠️ 取消按**请求键**（`行 id#序号`）寻址，**不按行 id**：同一行会被换掉，新实例的任务可能先到、
 * 旧实例的取消后到，按行 id 会把刚发的新任务一并剔掉（症状：一直不渲染，动一下鼠标才出图）。
 * 键里带行 id 是为了跨实例不撞号（序号只是模块内的自增值）。
 */
/** 一条待画任务：`run` 由调用方给（它自己负责画哪张画布、画什么） */
interface ArrangeLinePaintJob {
  key: string;
  run: () => void;
  /** 取消标记。用「标记 + 出队时删除」而不是 Set：取消可能落在**已经画完**的任务上，
   *  只记键的话那张表会随会话无限增长 */
  cancelled: boolean;
}

/** 每片的条数：偏小让绘制更细地摊开，偏大减少让出次数。6 是「一屏行数 / 十」量级 */
const PAINT_SLICE_SIZE = 6;

/** 待画队列（先进先出：先挂载的行先出图，与滚动的观感顺序一致） */
const queue: ArrangeLinePaintJob[] = [];
/** 键 → 任务（取消按它查；任务出队或跑掉即删，故不会随会话增长） */
const pendingByKey = new Map<string, ArrangeLinePaintJob>();
/** 请求键的自增序号：模块内唯一，与行 id 拼成键 */
let keySeq = 0;
let draining = false;
/** 已排入「起跑」的宏任务（见 scheduleDrain）：同一轮里排入几十行只该起跑一次 */
let drainScheduled = false;

/** 从队列里剔除已取消的任务（排空前调一次，避免它们白占切片名额） */
const pruneCancelled = (): void => {
  for (let i = queue.length - 1; i >= 0; i--) {
    const job = queue[i]!;
    if (!job.cancelled) continue;
    queue.splice(i, 1);
    pendingByKey.delete(job.key);
  }
};

/** 片间让出：宏任务让浏览器有机会处理输入与渲染，新排入的任务也不会被排队中的长任务挡住 */
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * 起跑（**宏任务**，不是同步跑第一片）。
 *
 * ⚠️ 这条不是延迟优化，是分片能不能成立的前提：一屏几十行是**在同一轮里逐条排入**的
 * （每行一个 `onMounted` → 一次 `draw()`），若每次排入都同步把队列跑干净，那「队列里永远只有一条」，
 * 分片退化成「逐条同步执行」—— 一帧内照样全画完，与不分片没有区别（首版就是这么写的，单测当场抓到）。
 * 排到宏任务里起跑，同一轮排入的行才能先**攒齐**再按片摊开。
 *
 * 代价是首片晚一个宏任务（那一瞬由「正在渲染」占位顶着），与之前离屏绘制时的时序一致。
 */
const scheduleDrain = (): void => {
  if (draining || drainScheduled) return;
  drainScheduled = true;
  setTimeout(() => {
    drainScheduled = false;
    void drainQueue();
  }, 0);
};

/** 分片排空队列：一次只画一片，片间让出事件循环（见文件头「为什么要分片」） */
const drainQueue = async (): Promise<void> => {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      pruneCancelled();
      if (queue.length === 0) break;
      const slice = queue.splice(0, PAINT_SLICE_SIZE);
      for (const job of slice) {
        pendingByKey.delete(job.key);
        // 出队到开画之间仍可能被取消（本片是在上一个让出点之前取出的）
        if (job.cancelled) continue;
        job.run();
      }
      if (queue.length > 0) await yieldToEventLoop();
    }
  } finally {
    draining = false;
  }
};

/**
 * 排一次绘制。返回的 `key` 是**同步**给出的：调用方卸载时要立刻用它取消。
 *
 * `run` 在出队时才执行，且**可能被跳过**（期间取消）—— 故它内部还要自查一次「是否已被更新的一次
 * 重绘取代 / 组件是否已卸载」。
 */
export const scheduleArrangeLinePaint = (lineId: string, run: () => void): string => {
  const key = `${lineId}#${++keySeq}`;
  const job: ArrangeLinePaintJob = { key, run, cancelled: false };
  queue.push(job);
  pendingByKey.set(key, job);
  scheduleDrain();
  return key;
};

/** 取消一条待画任务（组件卸载即离屏）。已在片内跑掉的无法撤回 */
export const cancelArrangeLinePaint = (key: string): void => {
  const job = pendingByKey.get(key);
  if (!job) return;
  job.cancelled = true;
  pruneCancelled();
};
