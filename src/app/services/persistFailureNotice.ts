/**
 * 持久化失败提示（应用装配层）：订阅平台层的写入失败上报，转成常驻通知。
 *
 * 之所以由装配层做：写入方（chordStore / songPersistence）都在 domains 层，
 * 不允许反向依赖 app 层的 UI 状态；「怎么提示」属于呈现策略，归装配层决定。
 * 在 App 装配时调用一次即可。
 */
import { isQuotaExceededError, onPersistFailure } from '@/platform/services/storage';
import { useUiStore } from '@/platform/store/uiStore';

/** 跨键提示节流：配额超限通常整块存储同时写失败（和弦列表 + 歌曲分片），
 *  仅按 key 去重挡不住这种并发，故再加一道全局节流，避免叠出多条通知。
 *  **按级别分桶**：熔断通知不能被紧随其后的普通写失败吃掉 —— 同一段存储出问题时，它是唯一
 *  告知用户「自动保存已暂停、请先导出备份」的那条，且给出的是可执行的补救步骤。 */
const NOTICE_THROTTLE_MS = 5000;

export function setupPersistFailureNotice(): void {
  const uiStore = useUiStore();
  /** 各桶的上次提示时刻：熔断（关键）与普通写失败互不挤占 */
  const lastNoticeAt: Record<'quota' | 'other', number> = { quota: 0, other: 0 };

  onPersistFailure(({ key, error }) => {
    const bucket = isQuotaExceededError(error) ? 'quota' : 'other';
    const now = Date.now();
    if (now - lastNoticeAt[bucket] < NOTICE_THROTTLE_MS) return;
    lastNoticeAt[bucket] = now;

    // 用常驻通知而非 Message：这类失败「飘走即失忆」，用户必须能回看并按提示导出备份
    if (bucket === 'quota') {
      uiStore.notice.error({
        title: '本地存储空间已满，自动保存已暂停',
        message: '已触发熔断：后续改动仅保留在当前页面内存中，请先导出备份，删除部分和弦或乐谱后刷新页面恢复保存。',
      });
      return;
    }
    uiStore.notice.error({
      title: '本地数据保存失败，最近的改动未能写入',
      message: `存储键：${key}`,
    });
  });
}
