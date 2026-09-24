/**
 * 箭头容器剪影的**框架无关实现**：在宿主面板里挂一层 `<svg>`，用一条连续轮廓同时画出
 * 「面板描边 + 指向箭头」。
 *
 * 为什么核心必须是原生的：四个消费方里有两个是指令（`vTooltip`、`v-scrollbar` 读数气泡），
 * 指令拿不到组件实例。故几何、配色复刻、尺寸观察都落在这里，Vue 侧只留一层薄壳
 * （BaseArrowPanel.vue）—— 薄壳自己用模板渲染 `<svg>`（**不能**由本模块往组件管理的元素里
 * 塞节点：宿主的 children 归 Vue 的补丁锚点管，外来节点会让 `insertBefore` 抛 NotFoundError），
 * 只复用本模块的绘制与观察能力。
 *
 * 与「旋转方块 + clip-path 楔形」的旧做法相比，差别只有一条但很关键：旧做法里面板描边与箭头
 * 描边是**两条独立的边**，各自抗锯齿、在接缝处叠加出比两侧都暗的缝，只能靠「把楔形插进面板
 * 1px」去盖 —— 而插入量以 px 计，宿主一旦处在 `transform: scale()` 内（指板气泡就是），
 * 1px 描边视觉上只剩 0.85px，插入量随之缩水，缝又露出来。现在整条轮廓是一条路径，
 * **没有接缝**，与缩放无关。
 *
 * 配色不另行声明：从宿主的 computed style 复刻 `background-color` / `border-color` /
 * `border-width` / `border-radius`。于是消费方照旧用 `bg-*` / `border-*` 工具类（含
 * `panelClass` 覆盖）表达观感，剪影只负责把它画成带箭头的形状。
 */

import { buildArrowFillPath, buildArrowPanelPath } from './arrowPanelPath';

import type { ArrowSide } from './arrowPanelPath';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 剪影层类名：仅作标识（样式全部内联，见 ARROW_PANEL_STYLE），可 grep */
export const ARROW_PANEL_CLASS = 'arrow-panel-silhouette';

/** 默认箭头方块边长（px），与旧 floatingArrow 的默认值同口径 */
export const ARROW_PANEL_SIZE = 12;

/**
 * 剪影层的内联样式（不走样式表：原生与 Vue 两条路径共用同一份，避免两处漂移）。
 * - `inset: 0` 铺满宿主 border-box；
 * - `overflow: visible` 必需 —— 楔形本来就在盒子之外，默认的 `hidden` 会把它整个裁掉；
 * - `pointer-events: none` 让剪影不参与命中测试（它是纯装饰，绘制在内容层之上）；
 * - `z-index: 2` 必需：剪影**与宿主内容同为兄弟节点**时（vTooltip 把剪影挂在浮层根、观感取自
 *   `.v-tooltip-box`，而后者是 `position:relative;z-index:1`），不抬层级就会被内容盒自己的
 *   描边压住 —— 表现正是「本体与箭头之间有一条线」。宿主自身是剪影的父元素时（BasePopover、
 *   读数气泡、指板气泡）子元素本就盖住父元素的背景与描边，这个层级只是顺带固定。
 */
export const ARROW_PANEL_STYLE =
  'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;display:block;z-index:2';

/**
 * 箭头方块边长 → 楔形底宽 / 高度。旧做法是「边长 size 的方块转 45° 后裁掉一半」，
 * 其楔形底宽恒为 `size·√2`、高恒为 `size/√2`；这里保持同一组换算，
 * 使消费方传的 `size` 与 `floatingCore.ARROW_MIN_OFFSET` 的推算口径都不必改。
 */
export const arrowBaseOf = (size: number): number => size * Math.SQRT2;
export const arrowRiseOf = (size: number): number => size / Math.SQRT2;

export interface ArrowPanelPaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

/** 从宿主复刻观感与圆角。`border-radius` 可能是 `rounded-full` 的极大值，收敛交给几何层 */
export const readArrowPanelPaint = (host: HTMLElement): ArrowPanelPaint => {
  const cs = getComputedStyle(host);
  const strokeWidth = parseFloat(cs.borderTopWidth) || 0;
  const stroke = cs.borderTopColor;
  return {
    fill: cs.backgroundColor,
    // 描边宽为 0、或描边色完全透明时按「无描边」处理：否则会凭空多出一圈实色轮廓
    stroke: strokeWidth > 0 && !/rgba?\([^)]*,\s*0\s*\)$/.test(stroke) ? stroke : 'none',
    strokeWidth,
    radius: parseFloat(cs.borderTopLeftRadius) || 0,
  };
};

/** 剪影层的尺寸与朝向：尺寸取宿主 border-box（分数 px），朝向即箭头贴哪条边 */
export interface ArrowPanelBox {
  width: number;
  height: number;
}

export interface ArrowPanelPlacement {
  side: ArrowSide;
  /** 箭头中心沿该边的位置（px）：上下边取 x、左右边取 y；缺省该边中点 */
  center?: number;
}

export interface ArrowPanelPaths {
  /** 楔形内部的填充（面板底色） */
  fill: SVGPathElement;
  /** 整条连续轮廓（面板描边 + 楔形两翼），`fill="none"` */
  outline: SVGPathElement;
}

/**
 * 把几何与配色写进两条 path。填充在前、轮廓在后由调用方保证（DOM 顺序即绘制顺序）：
 * 楔形底边向面板内多伸的那一截会压在描边之上，需由轮廓重新盖回描边色。
 *
 * **坐标系平移**：绝对定位子元素的包含块是父元素的 **padding box**（`left:0/top:0` 落在描边内侧），
 * 而几何以**宿主 border-box** 左上角为原点。故当剪影层正是宿主的子元素时，要给它
 * `translate(-borderWidth, …)` 把原点搬回 border-box（平移不缩放，`stroke-width` 不受影响；
 * SVG 视口小于路径时由 `overflow: visible` 兜住，见 ARROW_PANEL_STYLE）。
 * 这一判断由剪影层自己的父子关系推出，无需调用方声明：挂在宿主的**无描边祖先**下时两者原点本就
 * 重合（如 vTooltip 的 `.v-tooltip-root` 与 `.v-tooltip-box`），平移量自动归零。
 */
export const paintArrowPanel = (
  paths: ArrowPanelPaths,
  host: HTMLElement,
  box: ArrowPanelBox,
  placement: ArrowPanelPlacement,
  size: number
): void => {
  const { fill, stroke, strokeWidth, radius } = readArrowPanelPaint(host);
  const geometry = {
    width: box.width,
    height: box.height,
    radius,
    strokeWidth,
    side: placement.side,
    center: placement.center,
    base: arrowBaseOf(size),
    rise: arrowRiseOf(size),
  };
  const nested = paths.fill.ownerSVGElement?.parentElement === host;
  const shift = `translate(${nested ? -strokeWidth : 0} ${nested ? -strokeWidth : 0})`;
  // 取**目标色**而不是当前 computed 值：过渡在跑时后者只是当前帧的中间值（见 targetValueOf）
  const targetFill = targetValueOf(host, ['backgroundColor'], fill);
  const targetStroke = targetValueOf(host, ['borderTopColor', 'borderColor'], stroke);
  // 过渡口径每次重绘现读、按属性对齐：fill 跟宿主的 background-color、stroke 跟 border-color。
  // 两者必须同速同曲线，否则箭头与本体不同步（见 transitionOf）
  const fillTransition = transitionOf(host, 'background-color');
  const strokeTransition = transitionOf(host, 'border-color') ?? transitionOf(host, 'border-top-color');
  paths.fill.style.transition = fillTransition ? `fill ${fillTransition}` : 'none';
  paths.outline.style.transition = strokeTransition ? `stroke ${strokeTransition}` : 'none';
  paths.fill.setAttribute('transform', shift);
  paths.fill.setAttribute('d', buildArrowFillPath(geometry));
  paths.fill.style.fill = targetFill;
  paths.outline.setAttribute('transform', shift);
  paths.outline.setAttribute('d', buildArrowPanelPath(geometry));
  paths.outline.style.stroke = targetStroke;
  paths.outline.style.strokeWidth = `${strokeWidth}`;

  // 顺带把**同一条轮廓**挂成 CSS 变量，供 v-wave 的波纹容器做裁剪（见 patches/v-wave.patch）：
  // 面板 + 箭头是一条非凸曲线，容器用「矩形 + border-radius」表达不了 —— 为让水波扫到箭头而把容器
  // 撑开之后，border-radius 会被浏览器按容器高度收敛成胶囊，箭头左右也跟着放开，水波就从那儿溢出来。
  // 变量取「不内缩」的轮廓（描边外沿），与容器的 border-box 原点一致。
  host.style.setProperty('--arrow-panel-clip', `path("${buildArrowPanelPath({ ...geometry, strokeWidth: 0 })}")`);
};

/**
 * 观察宿主 border-box 尺寸，回调给**未缩放的分数 px**。
 *
 * 三个候选来源里只有它可用：`getBoundingClientRect` 会带上祖先 `transform: scale()`（指板气泡
 * 就在 0.85 缩放内，量出来偏小），`offsetWidth/offsetHeight` 会取整（0.4px 的误差足以让剪影与
 * 面板错开一像素），而 `borderBoxSize` 既不带缩放也不取整。
 */
const observeBox = (host: HTMLElement, onBox: (box: ArrowPanelBox) => void): (() => void) => {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(entries => {
    const box = entries[0]?.borderBoxSize?.[0];
    if (box) onBox({ width: box.inlineSize, height: box.blockSize });
  });
  observer.observe(host);
  return () => observer.disconnect();
};

/**
 * 取宿主某属性的**目标值**：过渡正在跑就取它的终值，否则取当前 computed 值。
 *
 * 为什么必须取终值：`transition` 生效期间 computed style 返回的是**当前帧的中间值**，
 * 换色刚开始那一刻（`pointerenter` 触发的重绘）读到的正是过渡起点，也就是旧色 ——
 * 于是剪影的 fill 被设成旧色、之后再无触发，箭头就永远停在旧色上（表现为「主体 hover 时箭头不变色」）。
 *
 * 从动画的末帧取终值还顺带避开了对帧回调的依赖：后台标签页里 `requestAnimationFrame` 会被节流，
 * 靠逐帧跟随的写法在那儿会失效。
 */
const targetValueOf = (host: HTMLElement, properties: string[], fallback: string): string => {
  if (typeof host.getAnimations !== 'function') return fallback;
  for (const animation of host.getAnimations()) {
    if (animation.playState !== 'running') continue;
    const keyframes = (animation.effect as KeyframeEffect | null)?.getKeyframes?.() ?? [];
    const last = keyframes[keyframes.length - 1] as Record<string, unknown> | undefined;
    for (const property of properties) {
      const value = last?.[property];
      if (typeof value === 'string') return value;
    }
  }
  return fallback;
};

/** 监听一组「可能与配色有关」的变化，任一触发即回调（返回解绑函数） */
const observeRepaintTriggers = (host: HTMLElement, onRepaint: () => void): (() => void) => {
  const cleanups: (() => void)[] = [];

  // 1. 宿主的类名 / 内联样式变化：`isMarked` 这类状态切换会换掉 `bg-*` / `border-*`，
  //    浮层定位又每帧写 left/top（顺带成为「宿主刚变过」的重绘时机）
  if (typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(onRepaint);
    mo.observe(host, { attributes: true, attributeFilter: ['class', 'style'] });
    // 2. 主题切换：`data-theme` / `.dark` 挂在 <html> 上，颜色令牌整体换档
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    cleanups.push(() => mo.disconnect());
  }
  // 3. 悬停 / 聚焦态：`hover:bg-*` 由 CSS 伪类命中，类名不变，观察者看不见，只能靠事件补
  for (const [type, capture] of [
    ['pointerenter', false],
    ['pointerleave', false],
    ['focusin', true],
    ['focusout', true],
  ] as const) {
    host.addEventListener(type, onRepaint, capture);
    cleanups.push(() => host.removeEventListener(type, onRepaint, capture));
  }

  return () => {
    for (const off of cleanups) off();
  };
};

export interface ArrowPanelSync {
  /**
   * 当前应使用的宿主尺寸（px，未缩放）。
   *
   * `ResizeObserver` 给的是未缩放的分数 px，但它**可能晚到、甚至在某些环境完全不投递**
   * （无头 Chrome 的虚拟时间下实测一次都不投递）。故这里做一致性校验：与当前布局尺寸差到 1px
   * 以上就认定它已过期，改以现读的整数尺寸为准 —— 整数精度足够画出正确轮廓，而过期的分数值会让
   * 轮廓停在旧尺寸上（宿主变宽后水波仍按旧轮廓裁，看起来正是「波纹残留在上一个宽度的位置」）。
   */
  box(): ArrowPanelBox;
  destroy(): void;
}

/**
 * 剪影层与宿主的同步总入口：尺寸变化 → 重算几何；配色可能变化 → 重绘。
 *
 * **配色为什么要在变化时重绘而不是交给 CSS**：剪影的 `fill` / `stroke` 是从宿主 computed style
 * 复刻来的字面量，宿主换色（悬停、标记态、主题）时它不会自己跟。故这里补上三类触发源，
 * 并把宿主的过渡时长/曲线一并抄到两条 path 上 —— 否则剪影会瞬变、面板在过渡，接缝处露出异色。
 *
 * `measure` 与 `paint` 多数场景是同一个元素；分开是为了容纳「量尺寸的元素与声明观感的元素不是
 * 同一个」的消费方（vTooltip：量 `.v-tooltip-root`，观感在 `.v-tooltip-box`）。
 */
export const syncArrowPanel = (
  targets: { measure: HTMLElement; paint: HTMLElement },
  onRepaint: () => void
): ArrowPanelSync => {
  let observed: ArrowPanelBox | null = null;
  const offBox = observeBox(targets.measure, next => {
    observed = next;
    onRepaint();
  });
  const offRepaint = observeRepaintTriggers(targets.paint, onRepaint);
  return {
    box: () => {
      const width = targets.measure.offsetWidth;
      const height = targets.measure.offsetHeight;
      // 观察者的值只在**与当前布局一致**时才算数（差 1px 以上即认定它已过期）
      if (observed && Math.abs(observed.width - width) < 1 && Math.abs(observed.height - height) < 1) return observed;
      return { width, height };
    },
    destroy: () => {
      offBox();
      offRepaint();
    },
  };
};

/**
 * 按**顶层**逗号切分：`transition-timing-function` 的 `cubic-bezier(0.4, 0, 0.2, 1)` 自带逗号，
 * 朴素的 `split(',')` 会把它切成四段，拼回去的值非法、整条 transition 声明会被浏览器丢掉
 * （表现为箭头完全没有过渡，或停在上一次成功写入的旧值上）。
 */
const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts;
};

/**
 * 从宿主当前的 transition 列表里取出**某个属性**的时长 / 曲线 / 延迟，未参与过渡则返回 null。
 *
 * 两个必须按属性对齐的理由：
 * - 宿主的 `transition-property` 是多值列表，第 0 项未必是要跟的那个属性（横按气泡的入场态就是
 *   `opacity, transform`），只取首项会让箭头拿到错误的时长 —— 表现为「颜色不是一起变的，有一个慢一点」；
 * - 快照也不行：绑定那一刻宿主可能正挂着入场过渡，之后才换成真正的换色过渡。故每次重绘都现读。
 */
const transitionOf = (host: HTMLElement, property: string): string | null => {
  const cs = getComputedStyle(host);
  const properties = splitTopLevel(cs.transitionProperty);
  const index = properties.includes('all') ? 0 : properties.indexOf(property);
  if (index < 0) return null;
  const pick = (list: string): string => {
    const items = splitTopLevel(list);
    return items[index % items.length] ?? items[0] ?? '';
  };
  const duration = pick(cs.transitionDuration);
  if (!duration || duration === '0s') return null;
  return `${duration} ${pick(cs.transitionTimingFunction)} ${pick(cs.transitionDelay)}`;
};

export interface ArrowPanelHandle {
  /** 剪影层元素（消费方可能需要挂类名或读它，如调试） */
  readonly element: SVGSVGElement;
  /** 重绘：朝向 / 箭头位置变化时调用；尺寸与配色由内部同步接管 */
  render(placement: ArrowPanelPlacement): void;
  destroy(): void;
}

export interface ArrowPanelOptions extends Omit<ArrowPanelPlacement, 'side'> {
  /**
   * 箭头贴哪条边，缺省 `bottom`。
   *
   * 可缺省：原生消费方**创建时未必知道朝向** —— vTooltip 先建好浮层，直到第一次定位拿到
   * placement 才知道箭头贴哪边。默认值只作用于首次 `render()` 之前那一帧。
   */
  side?: ArrowSide;
  /** 箭头方块边长（px），默认 ARROW_PANEL_SIZE */
  size?: number;
  /**
   * 观感（底色 / 描边 / 圆角）与换色触发源的来源，默认同宿主。
   * 仅当「量尺寸的元素」与「声明观感的元素」不是同一个时才需要显式指定。
   */
  paintHost?: HTMLElement;
}

/**
 * 原生入口：自建剪影层挂进宿主并接管后续重绘。
 *
 * **只给不经过 Vue 模板的消费方用**（指令创建的浮层）。组件侧请走 BaseArrowPanel.vue ——
 * 由外部往组件管理的元素里追加节点会破坏 Vue 的补丁锚点（insertBefore NotFoundError）。
 *
 * 宿主兼作尺寸来源（取它的 border-box）与默认观感来源；剪影层挂在宿主**内部**，
 * 故宿主的 `overflow` 必须是 `visible`，否则楔形会被裁掉。
 */
export const createArrowPanel = (host: HTMLElement, options: ArrowPanelOptions = {}): ArrowPanelHandle => {
  const size = options.size ?? ARROW_PANEL_SIZE;
  const paintHost = options.paintHost ?? host;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', ARROW_PANEL_CLASS);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = ARROW_PANEL_STYLE;

  const fill = document.createElementNS(SVG_NS, 'path');
  const outline = document.createElementNS(SVG_NS, 'path');
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke-linejoin', 'round');
  svg.append(fill, outline);
  host.appendChild(svg);

  const paths: ArrowPanelPaths = { fill, outline };
  let placement: ArrowPanelPlacement = { side: options.side ?? 'bottom', center: options.center };
  const paint = (box: ArrowPanelBox) => paintArrowPanel(paths, paintHost, box, placement, size);
  // 回调在 syncArrowPanel 返回之后才可能触发，故此处引用 sync 自身是安全的
  const sync = syncArrowPanel({ measure: host, paint: paintHost }, () => paint(sync.box()));
  paint(sync.box());

  return {
    element: svg,
    render: next => {
      placement = next;
      paint(sync.box());
    },
    destroy: () => {
      sync.destroy();
      // 剪影层没了，波纹容器就不该再按这条轮廓裁（留着会让水波按幽灵形状裁剪）
      paintHost.style.removeProperty('--arrow-panel-clip');
      svg.remove();
    },
  };
};
