/**
 * 持久化失败提示（应用装配层）：订阅平台层的写入失败上报，转成用户可见的 Toast。
 *
 * 之所以由装配层做：写入方（chordStore / songPersistence）都在 domains 层，
 * 不允许反向依赖 app 层的 UI 状态；「怎么提示」属于呈现策略，归装配层决定。
 * 在 App 装配时调用一次即可。
 */
import { isQuotaExceededError, onPersistFailure } from '@/platform/services/storage';
import { useUiStore } from '@/platform/store/uiStore';
import { TOAST_WARNING_DURATION_MS } from '@/platform/utils/constants';

/** 跨键提示节流：配额超限通常整块存储同时写失败（和弦列表 + 歌曲分片），
 *  仅按 key 去重挡不住这种并发，故再加一道全局节流，避免叠出多条 Toast */
const NOTICE_THROTTLE_MS = 5000;

export function setupPersistFailureNotice(): void {
  const uiStore = useUiStore();
  let lastNoticeAt = 0;

  onPersistFailure(({ key, error }) => {
    const now = Date.now();
    if (now - lastNoticeAt < NOTICE_THROTTLE_MS) return;
    lastNoticeAt = now;

    // 两条都带副标题，沿用加长时长（默认 3s 读不完两行文案）
    if (isQuotaExceededError(error)) {
      uiStore.toast.error('本地存储空间已满，自动保存已暂停', {
        description: '已触发熔断：后续改动仅保留在当前页面内存中，请先导出备份，删除部分和弦或乐谱后刷新页面恢复保存。',
        duration: TOAST_WARNING_DURATION_MS,
      });
      return;
    }
    uiStore.toast.error('本地数据保存失败，最近的改动未能写入', {
      description: `存储键：${key}`,
      duration: TOAST_WARNING_DURATION_MS,
    });
  });
}
