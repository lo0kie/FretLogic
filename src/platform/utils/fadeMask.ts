/**
 * 边缘羽化遮罩共享实现：
 * vMarquee（跑马灯，端点由动画相位逐帧驱动）与 useScrollEdgeFades（滚动渐隐，端点由
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
    `@property --fade-end{syntax:'<number>';inherits:false;initial-value:0;}`;
  document.head.appendChild(style);
};

/** 端点透明度参与过渡的 transition 属性串（过渡时长由消费方指定） */
export const fadeTransition = (ms: number): string => `--fade-start ${ms}ms ease, --fade-end ${ms}ms ease`;

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
