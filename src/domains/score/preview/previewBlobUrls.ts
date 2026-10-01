/**
 * 预览页图 object URL 的唯一生命周期入口：create 建号、release 撤销。
 *
 * 预览域里 URL 的「建」与「撤」此前散在三处（scorePreviewCache 的回收分支、usePreviewPageStream
 * 的页脚覆盖、ScorePreviewPane 的逐页上屏），配对关系全靠各处自觉；收敛到一个模块后，「哪里建、
 * 哪里撤」至少有一个可 grep 的单一词汇。**何时撤销不归本模块决定** —— 所有权记账（哪一格归哪个
 * 条目、屏上展示项延迟回收）仍在 scorePreviewCache，本模块只提供配对原语，行为与散写时逐字一致。
 *
 * 刻意**不在这里再记一份「还活着的 URL」**：撤销的幂等由 `URL.revokeObjectURL` 本身保证（对已撤销的
 * URL 是 no-op），而「哪些 URL 还活着」的唯一权威是 scorePreviewCache 的所有权记账 —— 在这里记第二份
 * 只会是一份没人读的死账（此前确有一份 `liveUrls`，注释称它是 release 的依据，实际只写不读）。
 */

/** 为页图 Blob 建号（等价于 URL.createObjectURL，入口收敛处） */
export const createPageUrl = (blob: Blob): string => URL.createObjectURL(blob);

/** 撤销页图 object URL（等价于 URL.revokeObjectURL）：重复调用是 no-op，调用方不必自己去重 */
export const releasePageUrl = (url: string): void => URL.revokeObjectURL(url);
