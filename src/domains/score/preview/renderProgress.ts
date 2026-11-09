/**
 * 功能谱（预览 tab）分页渲染的进度账本：渲染轮次把「已就位页 / 排版总页数」写在这里，顶栏那枚
 * 构建指示器据此显示百分比。
 *
 * 【为什么只覆盖功能谱】排列和弦区（编辑 tab）的绘制是**按视口分片**的 —— 挂进 DOM 的行才画，
 * 没挂的那几百行这一轮压根不存在，「已画 / 总共」算出来的是一个随时在变的分数（滚动一下就变），
 * 既不是全量渲染的进度，也不该拿来报百分比。那里保持原样：指示器只回答「正在出图」。
 *
 * 【为什么是模块级单例】写侧在 preview 域内的预览面板，读侧在 app 层顶栏，两者不是父子，
 * 走 props / emit 要穿四层。同目录已有先例 —— `scorePreviewCache` 的 isPreviewRendering 同样由
 * 顶栏直接 import，本模块与它并列。
 *
 * 【为什么只做账本、不判断「在不在跑」】是否在跑由 `isPreviewRendering` 回答（那份状态机归
 * scorePreviewCache），本模块只记数。把两者混在一起，读侧就再也没法单独验证取数。
 *
 * 【为什么记 done / total 而不是直接记百分比】百分比是**有损**读数：四舍五入之后「4/5 页」与
 * 「79/100 页」看不出差别，而调试与后续加读数（如「x / y 页」）都要原始账。换算留给展示层。
 */
import { ref } from 'vue';

/** 进度账：已就位页 / 排版得到的总页数。**total 为 0 表示总数未知**（排版尚未上报） */
export interface RenderProgress {
  /** 已就位页数（含同键续跑、按页继承来的页 —— 它们本轮确实不用再画） */
  done: number;
  /** 本轮排版得到的总页数 */
  total: number;
}

/** 空闲账：total 为 0 —— 展示层据此退回「只显示 spinner」，而不是显示一个恒为 0% 的假进度 */
export const IDLE_RENDER_PROGRESS: RenderProgress = { done: 0, total: 0 };

/** 本轮渲染的页账（写侧见 preview/components/ScorePreviewPane 的 publishPreviewProgress） */
export const previewRenderProgress = ref<RenderProgress>({ ...IDLE_RENDER_PROGRESS });

/**
 * 百分比读数（0~100 的整数）；总数未知时返回 **null**（不是 0）—— 两者的含义不同：
 * 「未知」应当只显示 spinner，「已知且一页没出」才是 0%。混成一个值，指示器在排版上报之前
 * 会先亮一个假的 0%。
 *
 * 钳到 [0, 100]：账是「先记总数、后记完成数」的自增口径，正常不会越界；但上一轮被作废时它的
 * 收尾刻意不再复位（见 ScorePreviewPane 的 adoptCachedRender 说明），旧回调可能晚于新一轮的
 * 复位到达 —— 那时显示 100% 比显示 137% 体面，读侧也不必各自兜底。
 */
export const percentOf = (progress: RenderProgress): number | null => {
  if (progress.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((progress.done / progress.total) * 100)));
};

/**
 * 预览渲染的超采样比（设备像素 / 逻辑像素）：**低于导出档**（`SCORE_EXPORT_CONFIG.PIXEL_RATIO` = 2.0）。
 *
 * 【为什么预览要低】超采样是对最终观看尺度的补偿。A4 逻辑 794×1123，2.0 下设备 1588×2246 ≈ 3.57M px/页
 * —— 印到纸上（A4 210mm 宽 ≈ 192dpi）这是应有的清晰度；预览只在屏幕上按几百 CSS px 显示，同样的 2.0
 * 纯属浪费。而整页成本里 JPEG 编码占九成以上、且随像素面积缩放，实测（本机 chromium，质量 0.95）
 * 单页编码：2.0 ≈ 25~37ms、1.5 ≈ 16ms、1.25 ≈ 12ms、1.0 ≈ 6ms。几十页长谱因此能从 ~30s 掉到 ~10s 量级。
 *
 * 【为什么取 1.25 而不是 1.0】1.0 在屏幕上已够清晰，但预览允许放大（scale 滑杆 / 双指）——
 * 1.25 给放大留了半档余量，代价仅为 1.0 的两倍编码（仍远低于 2.0）；再高收益递减、再低放大即糊。
 *
 * 【为什么是独立常量、不进设置】它是「预览该有多清晰」的实现细节，不是用户偏好：导出图必须自包含、
 * 必须清晰，预览图只在屏上存在。混进设置会让「导出清晰度」被预览档位污染。
 */
export const PREVIEW_RENDER_RATIO = 1.25;
