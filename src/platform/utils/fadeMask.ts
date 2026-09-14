/**
 * 边缘羽化遮罩共享实现：
 * vMarquee（跑马灯，端点由动画相位逐帧驱动）与 vEdgeFade（滚动渐隐指令，端点由
 * 滚动位置二元驱动）共用同一套「双端羽化 mask-image + 注册自定义属性端点」机制。
 * 两者语义一致：贴住内容的一侧不渐隐，另一侧羽化柔化切口。
 *
 * 端点透明度由注册 @property 的 --fade-start / --fade-end（0~1，0=不渐隐，1=全羽化）驱动，
 * 注册后可参与 CSS transition——端点变化时羽化以过渡动画平滑展开/收起，
 * 而非整段 mask-image 渐变字符串瞬变（渐变图片本身不可插值）。
 */

/** @property 注册规则注入的 <style> 节点 id（幂等注入） */
const FADE_PROPS_STYLE_ID = 'v-fade-mask-props';

/** 一次性注入 @property 注册规则（注册后的自定义属性才能参与 transition），幂等可重复调用 */
export const ensureFadeProperties = (): void => {
  if (typeof document === 'undefined' || document.getElementById(FADE_PROPS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FADE_PROPS_STYLE_ID;
  style.textContent =
    `@property --fade-start{syntax:'<number>';inherits:false;initial-value:0;}` +
    `@property --fade-end{syntax:'<number>';inherits:false;initial-value:0;}` +
    // 双轴羽化端点（vEdgeFade auto 模式下两轴均有溢出时的独立端点，见 buildDualEdgeFadeMask）
    `@property --fade-x-start{syntax:'<number>';inherits:false;initial-value:0;}` +
    `@property --fade-x-end{syntax:'<number>';inherits:false;initial-value:0;}` +
    `@property --fade-y-start{syntax:'<number>';inherits:false;initial-value:0;}` +
    `@property --fade-y-end{syntax:'<number>';inherits:false;initial-value:0;}`;
  document.head.appendChild(style);
};

/**
 * 端点透明度参与过渡的 transition 属性串（过渡时长由消费方指定）。
 * 统一包含单轴与双轴全部端点：未变化的属性不产生过渡成本，消费方无需按模式挑选。
 */
export const fadeTransition = (ms: number): string =>
  ['--fade-start', '--fade-end', '--fade-x-start', '--fade-x-end', '--fade-y-start', '--fade-y-end']
    .map(prop => `${prop} ${ms}ms ease`)
    .join(', ');

/**
 * 构建双端羽化遮罩模板：端点透明度全由 --fade-start/--fade-end 驱动，
 * 两端点均为 0 时渐变整体不透明（等价于无遮罩），无需单独的 none 分支。
 * @param axis 'x' 横向（to right）/ 'y' 纵向（to bottom）
 * @param size 羽化带宽（px 数值或 CSS 长度字符串）
 */
export const buildEdgeFadeMask = (axis: 'x' | 'y', size: number | string): string => {
  const w = typeof size === 'number' ? `${size}px` : size;
  return axis === 'x'
    ? `linear-gradient(to right, rgb(0 0 0 / calc(1 - var(--fade-start))), rgb(0 0 0) ${w}, rgb(0 0 0) calc(100% - ${w}), rgb(0 0 0 / calc(1 - var(--fade-end))))`
    : `linear-gradient(to bottom, rgb(0 0 0 / calc(1 - var(--fade-start))), rgb(0 0 0) ${w}, rgb(0 0 0) calc(100% - ${w}), rgb(0 0 0 / calc(1 - var(--fade-end))))`;
};

/**
 * 构建双轴羽化遮罩模板：x/y 两层渐变（各引用独立的 --fade-x- --fade-y-* 端点），
 * 消费方必须以 mask-composite: intersect 合成——默认 add 为并集，角落处只取较亮一层，
 * 两个方向的渐隐无法同时生效。
 * @param xSize 横向羽化带宽
 * @param ySize 纵向羽化带宽
 */
export const buildDualEdgeFadeMask = (xSize: number | string, ySize: number | string): string => {
  const wx = typeof xSize === 'number' ? `${xSize}px` : xSize;
  const wy = typeof ySize === 'number' ? `${ySize}px` : ySize;
  return [
    `linear-gradient(to right, rgb(0 0 0 / calc(1 - var(--fade-x-start))), rgb(0 0 0) ${wx}, rgb(0 0 0) calc(100% - ${wx}), rgb(0 0 0 / calc(1 - var(--fade-x-end))))`,
    `linear-gradient(to bottom, rgb(0 0 0 / calc(1 - var(--fade-y-start))), rgb(0 0 0) ${wy}, rgb(0 0 0) calc(100% - ${wy}), rgb(0 0 0 / calc(1 - var(--fade-y-end))))`,
  ].join(', ');
};
