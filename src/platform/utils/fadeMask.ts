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

/** 起始缘内缩量属性名：注册为 <length> 后可参与 transition，羽化带位置变化才是平滑移动而非瞬跳
 *  （渐变色标的数值位置本身不可插值，只能靠可动画的自定义属性驱动） */
export const FADE_OFFSET_PROP = '--fade-offset';

/** 宿主编写的「目标内缩量」属性名：指令不直接采用它，而是按「先淡出 → 改位置 → 再淡入」的
 *  时序接管（见 vEdgeFade），避免位置变化被看见（瞬跳=闪，过渡=整条羽化带平移过去） */
export const FADE_OFFSET_TARGET_PROP = '--fade-offset-target';

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
    `@property --fade-y-end{syntax:'<number>';inherits:false;initial-value:0;}` +
    // 起始缘内缩量（羽化带整体下移的距离）。宿主常按「此刻有没有常驻吸附头」动态改写它
    // （见 vEdgeFade 的 offset 选项），注册后位置变化可过渡，不会瞬跳成一次闪烁
    `@property --fade-offset{syntax:'<length>';inherits:false;initial-value:0px;}`;
  document.head.appendChild(style);
};

/**
 * 端点透明度参与过渡的 transition 属性串（过渡时长由消费方指定）。
 * 统一包含单轴与双轴全部端点：未变化的属性不产生过渡成本，消费方无需按模式挑选。
 */
export const fadeTransition = (ms: number): string =>
  [
    '--fade-start',
    '--fade-end',
    '--fade-x-start',
    '--fade-x-end',
    '--fade-y-start',
    '--fade-y-end',
    // 内缩量与端点同批过渡：两者常常同时变化（吸附头出现/消失），同步才不会一跳一滑
    FADE_OFFSET_PROP,
  ]
    .map(prop => `${prop} ${ms}ms ease`)
    .join(', ');

/**
 * 构建双端羽化遮罩模板：端点透明度全由 --fade-start/--fade-end 驱动，
 * 两端点均为 0 时渐变整体不透明（等价于无遮罩），无需单独的 none 分支。
 *
 * offset 把**起始缘**的羽化带整体内移：0~offset 一段保持全不透明，羽化从 offset 处才开始。
 * 常驻吸附头（sticky 分组标题）贴在容器上沿时会把贴边的羽化带整条挡住，羽化看起来「没贴在
 * 标题下面」——给起始缘一个等于标题高度的 offset，羽化带正好落在标题下沿。
 *
 * offset 不走参数而走可动画的 --fade-offset（缺省 0px）：宿主按吸附态动态改写它的场景里，
 * 位置变化必须是过渡而非瞬跳，否则回顶/离顶时羽化带会「闪一下」。
 * @param axis 'x' 横向（to right）/ 'y' 纵向（to bottom）
 * @param size 羽化带宽（px 数值或 CSS 长度字符串）
 */
export const buildEdgeFadeMask = (axis: 'x' | 'y', size: number | string): string => {
  const w = typeof size === 'number' ? `${size}px` : size;
  const o = `var(${FADE_OFFSET_PROP}, 0px)`;
  // 同位置双色标（offset 处「不透明 → 按端点量半透明」）形成硬切：offset 之前不羽化，之后渐变到 offset+size
  return axis === 'x'
    ? `linear-gradient(to right, rgb(0 0 0) ${o}, rgb(0 0 0 / calc(1 - var(--fade-start))) ${o}, rgb(0 0 0) calc(${o} + ${w}), rgb(0 0 0) calc(100% - ${w}), rgb(0 0 0 / calc(1 - var(--fade-end))))`
    : `linear-gradient(to bottom, rgb(0 0 0) ${o}, rgb(0 0 0 / calc(1 - var(--fade-start))) ${o}, rgb(0 0 0) calc(${o} + ${w}), rgb(0 0 0) calc(100% - ${w}), rgb(0 0 0 / calc(1 - var(--fade-end))))`;
};

/**
 * 构建双轴羽化遮罩模板：x/y 两层渐变（各引用独立的 --fade-x- --fade-y-* 端点），
 * 消费方必须以 mask-composite: intersect 合成——默认 add 为并集，角落处只取较亮一层，
 * 两个方向的渐隐无法同时生效。
 * @param xSize 横向羽化带宽
 * @param ySize 纵向羽化带宽（起始缘内缩量同 buildEdgeFadeMask，走 --fade-offset）
 */
export const buildDualEdgeFadeMask = (xSize: number | string, ySize: number | string): string => {
  const wx = typeof xSize === 'number' ? `${xSize}px` : xSize;
  const wy = typeof ySize === 'number' ? `${ySize}px` : ySize;
  const o = `var(${FADE_OFFSET_PROP}, 0px)`;
  return [
    `linear-gradient(to right, rgb(0 0 0) ${o}, rgb(0 0 0 / calc(1 - var(--fade-x-start))) ${o}, rgb(0 0 0) calc(${o} + ${wx}), rgb(0 0 0) calc(100% - ${wx}), rgb(0 0 0 / calc(1 - var(--fade-x-end))))`,
    `linear-gradient(to bottom, rgb(0 0 0) ${o}, rgb(0 0 0 / calc(1 - var(--fade-y-start))) ${o}, rgb(0 0 0) calc(${o} + ${wy}), rgb(0 0 0) calc(100% - ${wy}), rgb(0 0 0 / calc(1 - var(--fade-y-end))))`,
  ].join(', ');
};
