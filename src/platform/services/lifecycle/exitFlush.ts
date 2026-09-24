/**
 * 退出前落盘兜底：全局唯一注册点。
 *
 * 背景：此前三处各自挂了一对 pagehide + visibilitychange 监听（`storage/idbKv.ts`、
 * `domains/chord/store/chordStore/index.ts`、`domains/score/library/store/songStore.ts`），
 * 它们关心的是同一件事——「页面隐藏 / 关闭前，把仍在防抖窗口内的变更强制落盘」，
 * 却把全局事件接线分散在三处，且每处都要自己再判一次 `visibilityState === 'hidden'`。
 * 现收敛为：消费方只登记一个「立即落盘」回调，由本模块持有唯一的那对全局监听。
 *
 * 与 `platform/ui/focus-ring/focusRingOverlay.ts` 同模式——全局行为在装配层挂一次，
 * 消费方只做声明。差别是这里额外允许惰性补挂：`registerExitFlusher()` 首次登记时会
 * 自动调用 `setupExitFlush()`（幂等），避免「装配层漏调 → 落盘静默失效」这种不可见故障。
 *
 * 退出路径不抛：单个回调抛错不得阻断其余回调，也不得把异常逃逸进 pagehide 事件。
 */
import { logger } from '@/platform/utils/logger';

type ExitFlusher = () => void;

const flushers = new Set<ExitFlusher>();
let bound = false;

/** 依次执行登记的回调；单个抛错只记日志、继续执行其余（退出路径要尽力而为） */
const runAllFlushers = () => {
  for (const flush of flushers)
    try {
      flush();
    } catch (error) {
      logger.error('platform', '退出落盘回调异常', error);
    }
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'hidden') runAllFlushers();
};

/**
 * 挂接唯一的那对全局监听；返回清理函数。幂等：重复调用不会重复挂接。
 * 非浏览器环境（SSR / 单测 node 项目）为空操作。
 */
export const setupExitFlush = (): (() => void) => {
  if (bound || typeof window === 'undefined') return () => {};
  bound = true;
  window.addEventListener('pagehide', runAllFlushers);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    bound = false;
    window.removeEventListener('pagehide', runAllFlushers);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
};

/**
 * 登记一个「退出前立即落盘」回调，返回注销函数。
 * 首次登记会自动补挂全局监听，因此调用方无需关心装配层是否已调用过 `setupExitFlush()`。
 */
export const registerExitFlusher = (flush: ExitFlusher): (() => void) => {
  flushers.add(flush);
  setupExitFlush();
  return () => void flushers.delete(flush);
};
