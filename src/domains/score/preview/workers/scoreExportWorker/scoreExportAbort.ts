/**
 * 渲染线程的中断闸：标志位 + 中断点。
 *
 * 【为什么单独一个模块】中断点要落在**每个 await 边界**上，而 await 边界散落在两层以上：
 * 消息入口（字体装载、A4 逐页）与分页层（页脚合成逐页）。消息入口在依赖图顶端、分页层在它下面，
 * 中断点不能放在顶端（下层 import 不到）；也不能反向让下层 import 入口（那是循环依赖）。
 * 故把这个「无依赖、只有状态」的最小模块放在 types 之上、两大循环之下，谁都能 import。
 *
 * 【为什么是标志位而不是「收到 cancel 就抛」】cancel 消息与正在跑的渲染是两条互不阻塞的执行流：
 * 渲染函数在 await（字体装载、逐页 convertToBlob）期间挂起时，事件循环照样派发新消息、cancel
 * 也就能被立刻处理。真正的中断只能发生在渲染循环自己的 await 之后，故这里置位、由循环在边界比对。
 *
 * 【生命周期】任何一笔真实请求起跑时由入口复位（cancel 只针对「下发那一刻在跑的那一笔」，
 * 不得误伤后到者）；消息顺序保证复位不会吃掉尚未生效的 cancel —— 主线程是串行队列，cancel 恒在
 * 它要作废的那笔之后、下一笔之前下发。
 */
import { RENDER_ABORT_MESSAGE } from './scoreExportTypes';

/** 当下这一笔是否已被作废 */
let aborted = false;

/** 置位（收到 cancel 请求）；只影响正在跑的那一笔，由下一笔真实请求复位 */
export const markExportAborted = (): void => {
  aborted = true;
};

/** 复位（任何一笔真实请求起跑时）：cancel 早于本笔到达也不会误伤本笔 */
export const resetExportAbort = (): void => {
  aborted = false;
};

/**
 * await 边界上的中断点：已作废即中断，走统一的 error 回报路径。
 *
 * 调用方凭自己的 token 忽略这次失败（与「排队期作废」完全同一套语义）；页脚合成那条路径没有
 * token，靠 RENDER_ABORT_MESSAGE 认领并静默 —— 它本就是可作废的派生工作。
 *
 * 只应放在**真正的 await 之后**：纯粹同步的排版段（折行 / 装箱）内插检查没有意义 ——
 * 消息在同步段里根本送不进来，读了也永远是旧值。
 */
export const throwIfAborted = (): void => {
  if (aborted) throw new Error(RENDER_ABORT_MESSAGE);
};
