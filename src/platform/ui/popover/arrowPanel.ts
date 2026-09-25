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
 * `border-width` / `border-radius`，以及 `box-shadow` 里那圈纯扩散的发丝边（见 `ArrowPanelRim`）。
 * 于是消费方照旧用 `bg-*` / `border-*` / `shadow-*` 工具类（含 `panelClass` 覆盖）表达观感，
 * 剪影只负责把它画成带箭头的形状。
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
 *
 * 两者都是**缺省值**：宿主用 `--arrow-width` / `--arrow-height` 可分别覆盖（见 readArrowPanelPaint），
 * 覆盖后不再受 √2 比例约束 —— 例如 `--arrow-width: 24` + `--arrow-height: 8` 得到一枚扁平箭头。
 */
export const arrowBaseOf = (size: number): number => size * Math.SQRT2;
export const arrowRiseOf = (size: number): number => size / Math.SQRT2;

/** 箭头内角圆角的默认半径（px），宿主未声明 `--arrow-radius` 时用它 */
export const ARROW_PANEL_RADIUS = 2;

/**
 * 宿主阴影里那圈**纯扩散**的发丝边（`0 0 0 1px <color>`）。
 *
 * 它不是投影而是一圈紧贴 border-box 外侧的描边：暗色与高对比主题的每一档 `--shadow-*` 都带它
 * （见 `tokens/themes/dark.ts`：「深底上靠描边分层，纯投影读不出来」）。剪影复刻的是宿主的
 * **整份外观**，漏掉这一圈，本体就有两道边（CSS `border` + 发丝边）而箭头只有一道 ——
 * 而它偏偏是 box-shadow，只跟着宿主的矩形走，永远不会绕到楔形上。
 */
export interface ArrowPanelRim {
  /** 扩散量（px），即这圈边的宽度 */
  width: number;
  color: string;
}

export interface ArrowPanelPaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  /** 箭头内角的圆角半径（px）：宿主的 `--arrow-radius`，未声明时为 ARROW_PANEL_RADIUS */
  arrowRadius: number;
  /** 箭头底宽覆盖值（px）：宿主的 `--arrow-width`，0 = 未声明（沿用 size 的换算） */
  arrowWidth: number;
  /** 箭头凸出高度覆盖值（px）：宿主的 `--arrow-height`，0 = 未声明（沿用 size 的换算） */
  arrowHeight: number;
  /** 宿主阴影里那圈纯扩散的发丝边；没有（如亮色主题）则 null */
  rim: ArrowPanelRim | null;
}

/** 读一个 px 形式的自定义属性：未声明（空串）或不可解析时取兜底值 */
const pxVarOf = (cs: CSSStyleDeclaration, name: string, fallback: number): number => {
  const raw = cs.getPropertyValue(name).trim();
  if (raw === '') return fallback;
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
};

/**
 * 从宿主复刻观感与圆角。`border-radius` 可能是 `rounded-full` 的极大值，收敛交给几何层。
 *
 * 三个箭头相关的自定义属性都走 CSS 而不是组件 prop：箭头是四个消费方共用的（两个指令拿不到组件
 * 实例），而「面板长什么样」本来就由面板自己的 CSS 声明 —— 与 `--arrow-panel-clip` 同一口径，
 * 消费方写一行即可，不必改任何组件签名。自定义属性可继承，写在高层即对所有箭头生效。
 * - `--arrow-radius`：内角圆角半径；**未声明时取 `ARROW_PANEL_RADIUS`**，写 0 即尖角；
 * - `--arrow-width` / `--arrow-height`：底宽 / 凸出高度覆盖值；未声明时按 `size` 的 √2 比例。
 *
 * 另从 `box-shadow` 里挑出那圈纯扩散的发丝边（见 `ArrowPanelRim`）—— 它与上面四项同类：都是
 * 「面板长什么样」的一部分，由宿主自己的 CSS 声明。
 */
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
    arrowRadius: Math.max(0, pxVarOf(cs, '--arrow-radius', ARROW_PANEL_RADIUS)),
    // 尺寸类覆盖值 ≤ 0 视同未声明：0 宽 / 0 高的箭头没有意义，只会把楔形收缩成空
    arrowWidth: Math.max(0, pxVarOf(cs, '--arrow-width', 0)),
    arrowHeight: Math.max(0, pxVarOf(cs, '--arrow-height', 0)),
    rim: rimOf(cs),
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
  /**
   * 宿主 box-shadow 里那圈纯扩散的发丝边（见 `ArrowPanelRim`），`fill="none"`。
   *
   * 必须夹在填充与轮廓之间：本体上它与 box-shadow 那一圈逐像素重合，而贴着楔形底边的那一段
   * 会被填充压掉（填充是往面板内多伸 overlap 的一整块），所以要由它自己盖回来。
   */
  rim: SVGPathElement;
  /** 整条连续轮廓（面板描边 + 楔形两翼），`fill="none"` */
  outline: SVGPathElement;
}

/**
 * 把几何与配色写进三条 path。填充在前、轮廓在后由调用方保证（DOM 顺序即绘制顺序）：
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
  const { fill, stroke, strokeWidth, radius, arrowRadius, arrowWidth, arrowHeight, rim } = readArrowPanelPaint(host);
  // 宿主声明了覆盖值就用它，否则按 size 的 √2 比例
  const base = arrowWidth > 0 ? arrowWidth : arrowBaseOf(size);
  const rise = arrowHeight > 0 ? arrowHeight : arrowRiseOf(size);
  const geometry = {
    width: box.width,
    height: box.height,
    radius,
    strokeWidth,
    side: placement.side,
    center: placement.center,
    base,
    rise,
    arrowRadius,
  };
  const nested = paths.fill.ownerSVGElement?.parentElement === host;
  /** 剪影层的坐标平移：先补回上面那一格 border-box 原点，再整体外挪 `extra`（发丝边用） */
  const shiftOf = (extra: number): string => {
    const dx = (nested ? -strokeWidth : 0) - extra;
    return `translate(${dx} ${dx})`;
  };
  const drift = (rim?.width ?? 0) / 2;
  // 取**目标色**而不是当前 computed 值：过渡在跑时后者只是当前帧的中间值（见 targetValueOf）
  const targetFill = targetValueOf(host, ['backgroundColor'], fill);
  const targetStroke = targetValueOf(host, ['borderTopColor', 'borderColor'], stroke);
  // 过渡口径每次重绘现读、按属性对齐：fill 跟宿主的 background-color、stroke 跟 border-color。
  // 两者必须同速同曲线，否则箭头与本体不同步（见 transitionOf）
  const fillTransition = transitionOf(host, 'background-color');
  const strokeTransition = transitionOf(host, 'border-color') ?? transitionOf(host, 'border-top-color');
  // 发丝边跟着宿主的 box-shadow 过渡（它本来就是从那儿读来的）
  const rimTransition = transitionOf(host, 'box-shadow');
  paths.fill.style.transition = fillTransition ? `fill ${fillTransition}` : 'none';
  paths.outline.style.transition = strokeTransition ? `stroke ${strokeTransition}` : 'none';
  paths.rim.style.transition = rimTransition ? `stroke ${rimTransition}` : 'none';
  paths.fill.setAttribute('transform', shiftOf(0));
  paths.fill.setAttribute('d', buildArrowFillPath(geometry));
  paths.fill.style.fill = targetFill;
  // 发丝边：把整条轮廓（含楔形）向外挪 `drift`，再以 `rim.width` 描边 —— 中心线落在「border-box
  // 外扩 drift」处，描边的内外沿正好落在 border-box 与其外扩 `rim.width` 处，与本体的 box-shadow
  // 那一圈**逐像素重合**（本体上不会冒出第三道边），而楔形也因此有了它。
  //
  // 三个参数里只有两个要外扩：方框与**圆角**。楔形的底宽 +rim.width、`rise` 与 `arrowRadius` 保持
  // 原值 —— 差别在于口径：`radius` 是 CSS `border-radius`，量的是**描边外沿**，故要 +drift；而
  // `rise` / `arrowRadius` 是轮廓骨架自身的量，骨架到描边外沿的那一格由轮廓那条 path 的内缩抵掉，
  // 环的内沿于是恰好贴住箭尖与刀口（给它们也加外扩量会在箭尖外留出 1px 空档）。
  paths.rim.setAttribute('transform', shiftOf(drift));
  paths.rim.setAttribute(
    'd',
    rim
      ? buildArrowPanelPath({
          ...geometry,
          width: box.width + rim.width,
          height: box.height + rim.width,
          radius: radius + drift,
          // 以「描边宽 0」取轮廓：这条路径要落在环的中心线上，宽度由 stroke-width 另给
          strokeWidth: 0,
          base: base + rim.width,
          // 沿轴锚点必须补回 `drift`。整条环路径随后被 `translate(-drift, -drift)` 往左上挪了
          // 半格：帧的宽高外扩了 `rim.width`，不移回来环就会整体偏在一边。但**楔形的沿轴位置
          // 是绝对量**（箭头指向锚点），不该跟着挪 —— 忽略这一格，环相对本体就左偏 `drift`，
          // 表现为楔形两翼上的间距左右不等：左侧离出一条缝、右侧压在描边上（实测左 0.59px 的
          // 空隙 / 右侧 0.29px 的重叠，约 0.9px 的不对称）。
          // 缺省 `center`（取该边中点）是**帧相对量**，两侧同样外扩又同样偏移，自己抵消，故保持
          // 缺省即可，不必补。
          center: geometry.center === undefined ? undefined : geometry.center + drift,
        })
      : ''
  );
  paths.rim.style.stroke = rim ? rim.color : 'none';
  paths.rim.style.strokeWidth = `${rim?.width ?? 0}`;
  paths.outline.setAttribute('transform', shiftOf(0));
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
 * 从宿主的 `box-shadow` 里挑出那圈**纯扩散**的发丝边（见 `ArrowPanelRim`）。
 *
 * 判定刻意严格 —— 只认「offset 与 blur 都是 0、只有 spread > 0」的那一条：
 * - 有偏移或模糊的是**投影**，照它扩出去会变成一圈糊边，复刻它比不复刻更错；
 * - `inset` 打在盒内侧，与轮廓无关；
 * - 多条符合时取**最大**的一圈（外圈才是看得见的分层线）。
 *
 * 放到这里是因为要复用 `splitTopLevel`：`rgba(255, 255, 255, 0.06)` 自带逗号，
 * 朴素的 `split(',')` 会把一条阴影切成几段，lengths 对不上就被整条丢掉、发丝边静默消失。
 */
const rimOf = (cs: CSSStyleDeclaration): ArrowPanelRim | null => {
  const raw = (cs.boxShadow ?? '').trim();
  if (raw === '' || raw === 'none') return null;
  let best: ArrowPanelRim | null = null;
  for (const member of splitTopLevel(raw)) {
    if (/\binset\b/.test(member)) continue;
    const lengths = [...member.matchAll(/(-?\d*\.?\d+)px/g)].map(m => Number(m[1]));
    if (lengths.length < 4) continue;
    const [x, y, blur, spread] = lengths as [number, number, number, number];
    if (x !== 0 || y !== 0 || blur !== 0 || !(spread > 0)) continue;
    // 颜色 = 去掉那四个长度之后的余项（颜色的数值不带 px，不会被误删）
    const color = member.replace(/(-?\d*\.?\d+)px/g, '').trim();
    if (color === '' || /rgba?\([^)]*,\s*0\s*\)$/.test(color)) continue;
    if (!best || spread > best.width) best = { width: spread, color };
  }
  return best;
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
  /** 箭头方块边长（px），默认 ARROW_PANEL_SIZE；宿主可用 `--arrow-width` / `--arrow-height` 分别覆盖 */
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
  const rim = document.createElementNS(SVG_NS, 'path');
  const outline = document.createElementNS(SVG_NS, 'path');
  rim.setAttribute('fill', 'none');
  rim.setAttribute('stroke-linejoin', 'round');
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke-linejoin', 'round');
  // 文档序即绘制序：填充 → 发丝边 → 轮廓（见 ArrowPanelPaths 的说明）
  svg.append(fill, rim, outline);
  host.appendChild(svg);

  const paths: ArrowPanelPaths = { fill, rim, outline };
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
