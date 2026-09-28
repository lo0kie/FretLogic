/**
 * 触觉反馈：起拖那一刻的短震动。
 *
 * 只有**手势型**交互用它，且只在「手势已经成立」的那一刻发一次 —— 震动是不可撤销的物理反馈，
 * 发早了（如 pointerdown 就发）会在用户只是想点一下时白震一下，发晚了（松手才发）则毫无意义。
 *
 * 两处调用点（面板/列表排序的起拖、歌词槽位拖拽的起拖）口径一致：
 * 都在「越阈值 / 长按到点、影像开始跟随指针」那一步触发。
 *
 * 设备差异一律吞掉：`navigator.vibrate` 是 Android Chrome / Firefox 的 API，iOS Safari 根本没有；
 * 部分内核在缺少用户激活（user activation）时会抛 `NotAllowedError`。两者都不是错误场景，
 * 只是「这台设备没有这个反馈」，不能因此打断手势 —— 故判据用 `in` 收窄、调用包在 try 里。
 */

/** 轻触级时长（ms）：与系统「轻触」反馈同量级，短到不与随后的视觉反馈抢注意力 */
export const HAPTIC_TAP_MS = 20;

/** 触发一次轻触级震动；设备不支持时静默无操作（永不抛错） */
export const hapticTap = (duration: number = HAPTIC_TAP_MS): void => {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(duration);
  } catch {
    /* 内核不支持或缺少用户激活：静默忽略，不影响手势本身 */
  }
};
