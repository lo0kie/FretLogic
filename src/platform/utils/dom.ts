/**
 * DOM 与交互底层：布局查询、尺寸/可见性观察、滚轮增量归一化、边缘淡出遮罩、Vue 插槽文本提取。
 *
 * 合并自 dom.ts + sharedResizeObserver.ts + wheel.ts + fadeMask.ts + slotText.ts：
 * 这五者原先各自成件，但职责同属「浏览器 DOM 能力的一层薄封装」，且彼此经常被同一批指令/composable 同时引用
 * （如 vScrollbar 要 wheel + observer，vMarquee 要 fadeMask + observer），
 * 合并后一次 import 即可取全，不再让调用方在五个文件间跳转。
 */

// ──────────────────────────── 以下原 dom.ts ────────────────────────────

/**
 * 与「宿主滚动容器」打交道的通用 DOM 度量工具。
 *
 * 这类查询天然要沿祖先链向上看（容器是谁、有多少 padding），属于环境适配而非组件职责。
 * 以往每个需要它的地方各写一份循环（折叠面板的收起补偿、吸附头判定、v-scroll-into-view 指令），
 * 判定口径一旦漂移就各错各的；集中到这里才能保证「谁是滚动容器」只有一个定义。
 */

/** 沿祖先链向上找最近的滚动容器（v-scrollbar 注入的内联 overflow 同样命中） */
export const findScrollParent = (from: HTMLElement, direction: 'x' | 'y' = 'y'): HTMLElement | null => {
  let el = from.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflow = direction === 'x' ? style.overflowX : style.overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
};

/**
 * 把 CSS 长度（'8px' / 'var(--spacing-sm)' / '0.5rem' …）解析为像素。
 * 借一个临时探针让浏览器完成换算，避免自己维护 rem / 自定义属性 / calc 的解析规则。
 */
export const resolveLengthToPx = (value: string): number => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0;';
  probe.style.height = value;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
};

// ──────────────────────────── 以下原 sharedResizeObserver.ts ────────────────────────────

/**
 * 共享 ResizeObserver：指令/组合式挂在大量元素上时（乐谱卡标题、和弦卡、别名标签…）复用同一个
 * 观察者实例，避免每元素各建一个 ResizeObserver（过滤时数百元素同时卸载 = 同时 disconnect 数百个观察者）。
 *
 * 形态对齐 common.ts 的 observeVisibility（共享 IntersectionObserver）：按元素维度维护回调集合，
 * 同元素可被多个消费方各自观察、回调互不干扰；返回停止观察的清理函数。
 * vMarquee / vAutoWidth 此前各写了一份同构的单例，现统一走这里。
 */

export type ResizeCallback = (entry: ResizeObserverEntry) => void;

const callbacks = new WeakMap<Element, Set<ResizeCallback>>();
let observer: ResizeObserver | null = null;

const ensureObserver = (): ResizeObserver | null => {
  if (typeof ResizeObserver === 'undefined') return null;
  if (!observer)
    observer = new ResizeObserver(entries => {
      for (const entry of entries) callbacks.get(entry.target)?.forEach(cb => cb(entry));
    });

  return observer;
};

/**
 * 观察元素尺寸变化，返回停止观察的清理函数。
 * 同一元素可被不同消费方各自观察（回调集合隔离）；同一元素同一回调重复观察以最后一次为准。
 * 运行环境无 ResizeObserver 时静默降级（返回空清理函数，不抛错）。
 */
export const observeResize = (el: Element, cb: ResizeCallback): (() => void) => {
  const o = ensureObserver();
  if (!o) return () => {};

  let set = callbacks.get(el);
  if (!set) {
    set = new Set();
    callbacks.set(el, set);
  }
  set.add(cb);
  o.observe(el);

  return () => {
    const current = callbacks.get(el);
    if (!current) return;
    current.delete(cb);
    if (current.size === 0) {
      callbacks.delete(el);
      o.unobserve(el);
    }
  };
};

// ──────────────────────────── 以下原 wheel.ts ────────────────────────────

/**
 * 滚轮增量归一化：把 WheelEvent 的原始滚轮增量按 deltaMode 换算为像素位移。
 *
 * 单一来源——v-wheel-scroll 指令、v-scrollbar 指令（自绘滚动条兜底转发）此前各写了一份，
 * 且 v-scrollbar 的行模式用了硬编码 40 而非真实行高，Firefox 下手感与原生纵向滚动脱节。
 * 本模块收敛后两处同走 toPixelDelta，口径一致。
 *
 * 行/页单位的换算基准取「将要被滚的那个容器」(el) 而非事件落点：交接给外层时，
 * 行高/页高得按外层容器自己的排版算，否则外层拿到的位移与它的滚动节奏对不上。
 */

/** 行高取不到时的兜底系数：line-height 为 normal/auto 时按字号 × 此系数近似一行高度 */
export const LINE_HEIGHT_FALLBACK_RATIO = 1.2;

/**
 * 把某一轴上的一段原始滚轮增量换算为像素。
 *
 * WheelEvent.deltaMode 有三种单位：0=像素 / 1=行 / 2=页。只有像素单位可直接当距离用；
 * 行与页必须按容器实际行高、可视尺寸折算——否则 Firefox（默认行单位，一格约 3 行）的增量
 * 会被当成 3px 处理，横向位移与原生纵向滚动手感完全脱节。
 */
export const toPixelDelta = (e: WheelEvent, raw: number, el: HTMLElement, axis: 'x' | 'y'): number => {
  if (raw === 0) return 0;

  if (e.deltaMode === 1) {
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight);
    const fallback = (parseFloat(style.fontSize) || 16) * LINE_HEIGHT_FALLBACK_RATIO;
    return raw * (Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fallback);
  }
  // 页单位按目标容器该轴的可视尺寸折算：纵向取可视高，横向取可视宽
  if (e.deltaMode === 2) return raw * (axis === 'y' ? el.clientHeight : el.clientWidth);
  return raw;
};

/**
 * 把一次滚轮事件在**容器主轴**（横向）上应产生的位移换算为像素（即真实滚动距离）。
 *
 * 主轴分量识别：触控板原生横滑优先取 deltaX，普通鼠标纵向滚轮取 deltaY。
 */
export const resolveWheelDeltaPx = (e: WheelEvent, el: HTMLElement): number => {
  const dominant: 'x' | 'y' = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? 'x' : 'y';
  const raw = dominant === 'x' ? e.deltaX : e.deltaY !== 0 ? e.deltaY : e.deltaX;
  return toPixelDelta(e, raw, el, dominant);
};

// ──────────────────────────── 以下原 fadeMask.ts ────────────────────────────

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

// ──────────────────────────── 以下原 slotText.ts ────────────────────────────

/**
 * 槽位文本提取与悬停提示兜底：供 ActionButton / BaseBadge 等有默认插槽文案的 UI 组件复用。
 * 纯字符串/VNode 处理，不依赖任何上层模块。
 */

/** 递归提取 VNode 数组中的纯文本并 trim：跳过组件节点，仅收拢字符串文本 */
export function extractSlotText(nodes: unknown[]): string {
  let text = '';
  for (const node of nodes)
    if (typeof node === 'string' || typeof node === 'number') text += node;
    else if (node && typeof node === 'object' && 'children' in node) {
      const { children } = node as { children?: unknown };
      if (typeof children === 'string') text += children;
      else if (Array.isArray(children)) text += extractSlotText(children);
    }

  return text.trim();
}

/**
 * 统一的悬停提示回退规则：显式文案 > 主文案(label/content) > 默认插槽纯文本。
 * @param explicit 显式传入的提示文本（title 等）
 * @param primary 组件主文本字段（字数/内容），缺省时再回退默认插槽
 * @param defaultNodes 默认插槽的 VNode 数组
 */
export function resolveTextTitle(
  explicit: string | undefined,
  primary: string | number | undefined,
  defaultNodes: unknown[]
): string | undefined {
  return (
    explicit ?? (primary !== undefined ? String(primary) : undefined) ?? (extractSlotText(defaultNodes) || undefined)
  );
}

/**
 * 「可聚焦元素」的唯一选择器：浮层 Tab 焦点圈定（overlayGuards）、`v-focus` 自动聚焦、
 * Popover 打开时首焦点三处共用同一份清单。
 *
 * 这三处曾各自写一份互有出入的选择器（圈定含 `a[href]` 却漏 `contenteditable`、
 * `v-focus` 反之、Popover 用的是更宽的 `[href]`），而清单之间的**差集就是缺陷**：
 * Tab 圈定会漏掉可编辑元素导致焦点逃出浮层，自动聚焦会漏掉链接而把焦点停在面板本身。
 * 这里取并集，使「什么算可聚焦」只有一个定义。
 *
 * 注意边界：`vGridNav` 的 `DEFAULT_SELECTOR` 不在此列，它问的是「哪些节点可作方向键导航候选」
 * （须容纳不带 tabindex 的 `[data-focusable-outline]` 格子），是另一件事，不要合并进来。
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
