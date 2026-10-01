/**
 * 预览页图 object URL 的唯一生命周期入口：create 建号、release 撤销。
 *
 * 预览域里 URL 的「建」与「撤」此前散在三处（scorePreviewCache 的回收分支、usePreviewPageStream
 * 的页脚覆盖、ScorePreviewPane 的逐页上屏），配对关系全靠各处自觉；收敛到一个模块后，「哪里建、
 * 哪里撤」至少有一个可 grep 的单一词汇。**何时撤销不归本模块决定** —— 所有权记账（哪一格归哪个
 * 条目、屏上展示项延迟回收）仍在 scorePreviewCache，本模块只提供配对原语，行为与散写时逐字一致。
 */

/** 本模块登记在案、尚未撤销的 URL（release 的记账依据；重复 release 幂等） */
const liveUrls = new Set<string>();

/** 为页图 Blob 建号并登记（等价于 URL.createObjectURL，附带本模块的生命周期记账） */
export const createPageUrl = (blob: Blob): string => {
  const url = URL.createObjectURL(blob);
  liveUrls.add(url);
  return url;
};

/** 撤销页图 object URL（等价于 URL.revokeObjectURL；未登记的 URL 原样照撤，不做拦截） */
export const releasePageUrl = (url: string): void => {
  liveUrls.delete(url);
  URL.revokeObjectURL(url);
};
