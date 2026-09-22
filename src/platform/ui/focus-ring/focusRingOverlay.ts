/**
 * 外扩聚焦环（Canvas overlay 版）。
 *
 * CSS 无法让子元素的外扩 outline / box-shadow 穿透父容器的 overflow:hidden/auto 裁剪，
 * 在滚动容器（如和弦分析面板候选区）内聚焦时，外扩的聚焦圈会被容器裁掉一半。
 * 本模块改为在 document 顶层渲染一个「跟随目标几何」的固定环：它挂在 body 顶层、pointer-events:none，
 * 不属于任何被裁剪的容器，因此外扩圈总是完整可见——既能保留外扩效果，又不被 overflow 截断。
 *
 * 用法：应用装配层调用 setupFocusOutlineRing()。对需要「外部描边聚焦」的键盘可聚焦目标，
 * 标记 data-focusable-outline（与该选择器原有语义一致），聚焦时自动展示外扩环。
 *
 * 跟随策略：focus 期间每帧用 getBoundingClientRect 重算（开销极小），天然覆盖滚动 / 平移 / 尺寸变化，
 * 无需为每个可能的滚动祖先逐一个绑定 scroll。
 *
 * 层级策略：不写死高层号。向上找出焦点目标所在的那一层，overlay 取「该层层号 + 1」，环刚好压住它：
 * - 浮层容器（Popover/Drawer/Modal/Tooltip）的层号由 floatingZ 池分配、写在**内联 style** 上
 *   → 逐帧向上找内联 z-index（池号会在聚焦期间随上层浮层开合而重排，需跟随）；
 * - toast（--z-toast 13000）这类**静态最高层**只把层号写在工具类上、没有内联值 → 只看内联 style
 *   会把它判成「页面内容」，环退回浮层基准层之下、被 toast 整个盖住（toast 里的按钮聚焦时环不可见）。
 *   故 show() 时再按 computed z 认一次，且**只认 ≥ 浮层基准层**的值：页面内容层的
 *   z-card(5) / z-panel(10) / z-float(20) 全在基准层之下，一并认下来会把页面里的环压到侧栏 / 顶栏之下。
 *   computed style 要逐祖先读，因此这一步不进逐帧路径；
 * - 两者都没有 → 焦点在页面内容 → overlay 回退到浮层基准层之下（FLOATING_Z_BASE - 1），
 *   打开中的浮层（≥ 基准层）自然盖住环，不会出现「环穿过浮层」的错层。
 *
 * 挖孔策略：目标内标记 data-ring-punchout 的外凸装饰（如和弦卡片右上角骑缝的变体徽标）
 * 会与外扩环带重叠，而它们与目标同处页面内容层，z-index 无法越过 body 顶层的环；
 * 逐帧把这些元素的矩形从环上擦除（挖孔），装饰即从环上方透出。
 * 擦除按**盒子几何**动手，所以与下面的遮挡物一样，只对**当前可见**的装饰挖孔（见 isElementVisible）：
 * 被 CSS 隐藏却仍留在 DOM 里的装饰，挖出的孔对不上任何东西，看着就是环上平白缺了一块。
 *
 * 可见区域策略：环挂在 body 顶层、**不受任何容器 overflow 裁剪**——这既是它存在的理由
 * （贴边目标的 4px 外扩圈不被容器切掉），也是它的副作用：目标滚出滚动容器后环不会跟着消失，
 * 因为没有任何容器负责裁它，环就孤零零留在页面上。层级越高这个现象越明显。
 * 所以逐帧算出「目标的裁剪祖先 ∩ 视口」这块可见区域（clipRectOf），把环画在
 * 「该区域各自外扩 RING_OUTSET」的范围里：
 * - 目标贴边但完整可见 → 外扩的 4px 仍在允许范围内，环完整（原设计意图不丢）；
 * - 目标滚出容器 → 环露出容器的那部分被裁掉，延伸方向与滚动方向一致，收边自然；
 * - 环的外轮廓与可见区域再无交集 → 直接不画（清空画布即「看不见」，**不走 opacity 过渡**：
 *   那是聚焦 / 失焦的淡入淡出语义，而滚出视窗是同一聚焦态内的几何变化，闪一次渐变反而突兀）。
 *   判据用环的外轮廓而非目标本身，否则「贴着容器边、完整可见」的目标会被误杀。
 *
 * 透明度跟随策略：环挂在 body 顶层，**不在目标的任何祖先子树里**——而 opacity 只沿**后代**做分组
 * 相乘，所以目标自己（或其浮层容器）淡出时，祖先上的 opacity 完全传播不到环上：面板淡到三成，环
 * 还是全不透明，看起来就是「面板走了，环还孤零零飘在原处」。这条规律没有 CSS 解法，只能在 JS 侧
 * 补一次乘法：show() 时把目标自身到 body 的样式对象快照下来（getComputedStyle 返回**活对象**，
 * 缓存它、逐帧读 .opacity 即得当前插值），逐帧相乘后写到 **canvas** 的 opacity 上。
 *
 * 既然是逐帧直写，就绝不能写进 ring 自己的 opacity——那条 140ms 过渡会因每帧重设起点而永远追不上
 * 终点，焦点切换变成拖尾。故分两层，由合成器自动相乘：
 *
 *   ring    opacity = 焦点语义的 0/1（带 140ms 过渡）
 *     └ canvas opacity = 目标可见透明度的乘积（无过渡，逐帧直写）
 *
 * 快照**不做预判筛选**（如「只收带 opacity 过渡的」）：离场过渡的 transition 只存在于过渡期间
 * （v-transition-scale-* 是过渡期才挂上的类名），面板静止时的 computed transition-property 并不含
 * opacity，聚焦那一刻筛一遍必然把面板漏掉，之后它怎么淡都轮不到被读。全链收下来最坏也只是每帧
 * 十来次属性读取（活对象已缓存，不必重取），远小于同帧的画布重绘。整棵树淡到近乎不可见时
 * 直接清画布，与「滚出视窗」「禁用」同一语义——同一聚焦态内目标自己变了样子，不走 opacity 过渡。
 *
 * 遮挡物策略：滚动容器内还有一类「视觉上盖住内容、却不在裁剪祖先里」的元素——sticky 条
 * （折叠面板 / 分组列表的吸顶标题、吸底操作条、吸边列）。它们位于定位层，绘制顺序天然盖住同容器内的
 * 静态内容，而环挂在 body 顶层、层号远高于它们，于是目标滑到 sticky 下面时环反而画在 sticky 之上。
 * 所以把 sticky 元素的矩形也从环上擦除（与挖孔共用同一套 destination-out 动作，
 * 天然支持多块重叠——用 clip 做减法会在重叠区「减两次又填回来」）。
 * 同类还有「既不 sticky、也不在裁剪祖先里」的覆盖元素——自绘滚动条的拇指与滚动气泡：它们挂在滚动容器的
 * 兄弟位置、层号 29-31，同样越不过顶层环。这类没法由位置特征推断，改为**显式声明**：打
 * data-ring-occluder 即纳入同一套擦除（轨道不标——它是贴边整条的长条，擦了会把环的整条边吃掉，
 * 比「轨道被环压住」更刺眼）。
 * 擦除只对**当前可见**的遮挡物做：滚动条靠 `opacity:0; visibility:hidden` 隐藏（overlay 是宿主的
 * 兄弟节点，不能用 display:none，否则收不到 hover），盒子仍在、矩形照旧非零，不判可见性就会在
 * 容器根本没溢出、或滚动条已自动淡出时，从环上挖掉一块空气（观感是「环缺了一角」）。
 * 收集方式是沿目标的祖先链逐层看**同层兄弟**（含目标自己的兄弟与各祖先的兄弟，后者覆盖
 * 「sticky 在滚动容器之外、吸在视口上」的情形），兄弟盒子与环的外轮廓不相交时整棵子树跳过——
 * sticky 元素受包含块约束、跑不出自己的父盒，跳过是安全的。
 * 收集**逐帧做、不缓存**：判据「与环的外轮廓相交」是滚动位置的函数，与聚焦那一刻无关。若在聚焦时
 * 快照，头还停在静态位置（与首行卡片之间隔着网格的 padding）离环更远，当场被剪枝掉，之后无论怎么滚
 * 都不会再被看一眼——环就永远压在吸附头上。逐帧收集时收集判据与擦除判据完全同一（只有相交才需要擦），
 * 结果只活一帧也毫无损失。
 *
 * ★ 为什么用 Canvas 而不是 CSS mask ★
 * 环是「带内孔的环带」，装饰骑在环带上时必须把重叠处抠掉。CSS 的做法是给环元素叠一层
 * mask（铺满层 subtract 掉若干矩形孔层），而 mask 的孔边界是**渐变的硬边**：位于边界上的像素
 * 只被部分遮盖，于是被切开的那 2px 描边在切口外侧透出一条不足 1px 的半透明细弧——选不中、
 * 看不清来源，就是「打洞没裁干净」的残线；而且孔径调到多大都去不掉，因为问题不在孔径，
 * 在「边界像素只被部分遮罩」这个机制本身。
 * Canvas 换成两条互补手段彻底消掉这类像素：
 * 1. 环带用**一条**路径（外圆角矩形 + 内圆角矩形）以 evenodd 一次填充——整圈描边的内外边缘
 *    在同一遍光栅化里抗锯齿，不存在两个元素拼接出来的接缝；
 * 2. 挖孔用 globalCompositeOperation = 'destination-out'——逐像素做 alpha 相乘（dst *= 1 - srcAlpha），
 *    孔内像素被**彻底**清零，且孔边吸附到设备像素线后每个像素要么全在孔内、要么全在孔外，
 *    连「被切一半」的像素都不存在。残线在数学上没有落脚点。
 * 可见区域的裁剪同样吸附到设备像素线，切口也不会带出半透明边。
 */
import { FLOATING_Z_BASE } from '@/platform/ui/popover/floatingZ';
import { clamp } from '@/platform/utils/common';

const FOCUSABLE_OUTLINE_SELECTOR = '[data-focusable-outline]';
/** 环上需要挖孔让位的外凸装饰标记（与目标同层渲染、但几何上骑出目标边界的元素） */
const RING_PUNCHOUT_SELECTOR = '[data-ring-punchout]';
/** 显式声明的遮挡物属性：内容层里「视觉上盖住内容」的覆盖元素（如自绘滚动条的拇指与滚动气泡）。
 *  它们与目标同处内容层、z-index 越不过 body 顶层的环，只能由环侧擦除（与 sticky 共用同一套动作）。
 *  与 data-ring-punchout 的分工：挖孔只扫**目标子树内**的外凸装饰，而这类覆盖元素在目标之外
 *  （滚动条挂在滚动容器的兄弟位置），只有沿祖先链的遮挡物收集才够得着。
 *  标了属性 ≠ 永远要擦：元素**当前不可见**时不擦（见 isElementVisible）——这条属性声明的是
 *  「我在内容层且会盖住东西」，而不是「我此刻在屏幕上」。 */
const RING_OCCLUDER_ATTR = 'data-ring-occluder';
/** 环边框粗细（px） */
const RING_WIDTH = 2;
/** 环相对目标矩形向外扩出的距离（px）：略大于描边宽，形成清晰的悬浮外圈 */
const RING_OUTSET = 4;
/** 挖孔矩形相对装饰矩形的四周外扩（px）：getBoundingClientRect 不含 box-shadow，
 *  取 4 略大于 shadow-sm 的外扩量（blur 2 + offset-y 1），把装饰的阴影一并让到孔外。 */
const PUNCH_INFLATE = 4;
/** 可见透明度低于该值即视为不可见：整棵祖先链相乘后剩这么点，画出来只是一层看不出的薄雾，
 *  继续重绘纯属白烧帧——与「滚出视窗」一样直接清画布。
 *  同一阈值也用于判定**遮挡物 / 骑缝装饰**是否还看得见（见 isElementVisible）：两处的语义都是
 *  「淡到这个程度就等于没有」，没有必要各定一档。 */
const ALPHA_EPSILON = 0.005;

/** 视口绝对坐标下的矩形（left/top/right/bottom）；只用几何数值，不依赖 DOMRect 实例 */
interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 目标是否处于 disabled 态：原生 `:disabled`，或自身/祖先带 `aria-disabled="true"`。
 *
 * 判据与 vGridNav 的 isNavigable 同口径。为什么不能只看原生 `:disabled`：
 * 本项目的控件普遍以 `aria-disabled` 表达禁用（见 ActionButton / BaseSwitch / MenuItems / BaseSelector），
 * 而自定义控件（`role="menuitem"`、`role="switch"`）保留可聚焦性——vGridNav 正是靠 `el.focus()`
 * 移动焦点的，原生 disabled 的元素 focus() 是空操作、这些却能聚焦。于是 focusin 正常派发，
 * 环就画在了不可用控件上。
 */
const isDisabledTarget = (el: HTMLElement): boolean =>
  el.matches(':disabled') || el.closest('[aria-disabled="true"]') !== null;

/** 圆角半径取实际像素值；百分比写法（如 border-radius:50%）解析出的是裸数字，交给绘制侧按短边夹紧兜底 */
const cornerRadius = (el: Element): number => {
  const px = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return Number.isFinite(px) ? px : 0;
};

/**
 * 把矩形四条边吸附到设备像素线（左/上 floor、右/下 ceil，一律向外取）。
 *
 * 吸附后每个像素要么整块在矩形内、要么整块在外，canvas 的 fill / clip 都不会产生「只覆盖一半」
 * 的像素——这是「切口不留半透明残线」的前提。吸附必须做在**视口绝对坐标**上：环的原点、容器的
 * 边界都普遍带小数（卡片 2.2rem 高 + 行距，行位置常落在半像素上），在局部坐标里取整并不能让
 * 边界落回设备像素。
 */
const snapOut = (rect: Rect, dpr: number): Rect => ({
  left: Math.floor(rect.left * dpr) / dpr,
  top: Math.floor(rect.top * dpr) / dpr,
  right: Math.ceil(rect.right * dpr) / dpr,
  bottom: Math.ceil(rect.bottom * dpr) / dpr,
});

/** 两矩形是否有交集（贴边不算，面积必须为正） */
const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * 挂接全局外扩聚焦环；返回清理函数（应用销毁时调用）。
 */
export function setupFocusOutlineRing(): () => void {
  if (typeof document === 'undefined') return () => {};

  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${FLOATING_Z_BASE - 1};`;

  // 淡入淡出交给外层 ring 的 opacity 过渡（canvas 元素自身没有 opacity 动画语义）；canvas 只负责画。
  const ring = document.createElement('div');
  ring.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 140ms ease-out;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  ring.appendChild(canvas);

  // 颜色探针：先把 var(--color-primary) 交给 CSS 引擎解析、再读计算值。canvas 的 fillStyle 对
  // oklch()/color-mix() 之类表达式的支持面不如 CSS，直接塞变量字符串会在部分引擎里静默失败（画不出色）。
  const colorProbe = document.createElement('span');
  colorProbe.style.cssText = 'position:absolute;left:-9999px;top:0;color:var(--color-primary);';
  ring.appendChild(colorProbe);

  overlay.appendChild(ring);
  document.body.appendChild(overlay);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    overlay.remove();
    return () => {};
  }

  // 聚焦样式由 JS 注入（替代原 main.scss 的 [data-focusable-*] 规则）：统一清除各聚焦目标的默认 outline
  const styleEl = document.createElement('style');
  styleEl.textContent = '[data-focusable-outline]{outline:none !important;}';
  document.head.appendChild(styleEl);

  let target: HTMLElement | null = null;
  /** 当前目标的挖孔装饰元素集合（show 时快照 DOM 成员，几何每帧实测） */
  let punchTargets: HTMLElement[] = [];
  /** 当前目标的裁剪祖先（overflow 非 visible 的祖先；show 时快照 DOM 成员，几何每帧实测） */
  let clipAncestors: HTMLElement[] = [];
  /** 目标自身到 body 的样式对象快照（**活对象**，逐帧读 .opacity 得当前插值；见模块头「透明度跟随策略」） */
  let alphaSources: CSSStyleDeclaration[] = [];
  /** 上一次写进 canvas 的可见透明度：同值不重写，免得白刷新样式 */
  let lastAlpha = -1;
  /** 本帧擦除的 sticky 条：逐帧重收集，这里只留最后一帧供控制台查看（擦除本身不依赖历史） */
  let lastOccluders: HTMLElement[] = [];
  let raf = 0;
  /** 目标所处**静态高层**的层号（toast 等只写工具类的高层；每次 show() 解析一次，见 resolveStaticLayerZ） */
  let staticLayerZ = 0;
  /** overlay 当前生效层号（避免每帧重复写同值触发无谓的样式失效） */
  let appliedZ = FLOATING_Z_BASE - 1;
  /** 排查开关：置真后停画（不会在下一帧被写回），用于二分判定某条线是不是本环画的 */
  let killed = false;

  /** 整块画布清空（按设备像素尺寸清，不受当前变换影响） */
  const clearCanvas = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  /**
   * 追加一段圆角矩形子路径。半径按短边一半夹紧——rounded-full 的 9999px 由此退化成正圆，
   * 百分比圆角解析出的裸数字也一并兜住。moveTo 起新子路径，因此多次调用会累积成复合路径。
   */
  const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
    if (w <= 0 || h <= 0) return;
    const rr = clamp(r, 0, Math.min(w / 2, h / 2));
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  /**
   * 目标所处层的层号（0 = 页面内容），两个来源刻意分成两个函数——代价与刷新频率完全不同：
   *
   * `resolveInlineZ` 只读内联 style（`el.style.zIndex` 不触发样式计算，很便宜），可以进逐帧路径：
   * 浮层容器的层号由 floatingZ 池写在 style 上，且会在聚焦期间因上层浮层开合而重排，必须逐帧跟。
   *
   * `resolveStaticLayerZ` 读 computed z-index（`auto` 解析成 NaN、被跳过），成本是逐祖先一次样式读取，
   * 只在 show() 跑一次。它负责认下**只写工具类、没有内联值**的静态高层：toast（--z-toast 13000）、
   * 拖拽影像 / 导出抽屉（--z-top 12000）。判据必须是「≥ 浮层基准层」而不只是「有层号」——
   * 页面内容层的 z-card / z-panel / z-float 都在基准层之下，一并认下来会把页面里的环压到侧栏 / 顶栏底下。
   */
  const resolveInlineZ = (el: HTMLElement): number => {
    let cur: HTMLElement | null = el;
    while (cur && cur !== document.body) {
      const inline = Number.parseInt(cur.style.zIndex, 10);
      if (Number.isFinite(inline)) return inline;
      cur = cur.parentElement;
    }
    return 0;
  };

  const resolveStaticLayerZ = (el: HTMLElement): number => {
    let cur: HTMLElement | null = el;
    while (cur && cur !== document.body) {
      const z = Number.parseInt(getComputedStyle(cur).zIndex, 10);
      if (Number.isFinite(z) && z >= FLOATING_Z_BASE) return z;
      cur = cur.parentElement;
    }
    return 0;
  };

  /**
   * 快照目标的裁剪祖先：向上收集所有 overflow 非 visible 的祖先（滚动 / 隐藏容器）。
   *
   * 与 punchTargets 同策略——DOM 成员在 show 时取一次，因为这一步要读 computed style（逐帧读会
   * 白白触发样式计算），而几何每帧实测（getBoundingClientRect 很便宜）。
   * 从父元素起算：目标自身的 overflow 不裁剪自己。
   */
  const collectClipAncestors = (el: HTMLElement): HTMLElement[] => {
    const list: HTMLElement[] = [];
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      // 只写一个轴的 overflow 时，另一轴的 visible 会被规范提升成 auto，所以按 computed 值判断即可
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') list.push(cur);
      cur = cur.parentElement;
    }
    return list;
  };

  /**
   * 快照「可见透明度」的读数来源：目标自身 + 一路到 body 的每个祖先，各取其**活**样式对象。
   *
   * 为什么不留筛选、把整条链全收下：唯一便宜的筛法是「computed 上带 opacity 过渡的才留」，但离场
   * 过渡的 transition 只存在于过渡期间（v-transition-scale-leave-active 是过渡期才挂上的类名），
   * 面板静止时 computed transition-property 并不含 opacity —— 聚焦那一刻按它筛，面板必然被漏掉，
   * 之后无论怎么淡都读不到。收全链最坏是每帧十几次属性读取（活对象已缓存，不必重取），量级远小于
   * 同帧的画布重绘，不值得为省这点去冒漏判的风险。
   *
   * 从目标自身起算：目标自己的 opacity（如禁用外的淡显）同样是它的可见透明度的一部分。
   */
  const collectAlphaSources = (el: HTMLElement): CSSStyleDeclaration[] => {
    const list: CSSStyleDeclaration[] = [];
    let cur: HTMLElement | null = el;
    while (cur && cur !== document.body) {
      list.push(getComputedStyle(cur));
      cur = cur.parentElement;
    }
    return list;
  };

  /**
   * 目标当前的**可见透明度** = 自身到 body 每个祖先前 opacity 的乘积。
   * 浏览器只对**后代**做这层分组相乘（环挂在 body 顶层，不在目标的子树里），所以要自己再乘一遍。
   *
   * 返回 0 表示目标已不可见：整棵链乘到 ALPHA_EPSILON 以下，或目标的有效 visibility 非 visible
   * （visibility 是继承属性，目标自己的 computed 值就是最终生效的那个，不必逐祖先查）。
   * 读不到数值时按 1 兜底（宁可不透明，也不要因一次异常读数把环整帧擦掉）。
   */
  const readEffectiveAlpha = (): number => {
    if (alphaSources[0] && alphaSources[0].visibility !== 'visible') return 0;
    let alpha = 1;
    for (const cs of alphaSources) {
      const v = Number.parseFloat(cs.opacity);
      alpha *= Number.isFinite(v) ? v : 1;
      if (alpha <= ALPHA_EPSILON) return 0;
    }
    return alpha;
  };

  /**
   * 元素当前是否可见：不可见的元素不该再从环上擦掉一块（挖孔与遮挡物擦除**共用**这一判定）。
   *
   * 两条路径都需要它，原因是同一个：`erase` 只按**盒子几何**动手，而本仓的「不可见」普遍不是用
   * display:none 表达的 —— 盒子仍在文档流里，`getBoundingClientRect` 照旧返回非零矩形。
   *
   * - 遮挡物侧，典型是自绘滚动条：它用 `opacity:0; visibility:hidden` 隐藏（overlay 挂在宿主
   *   **兄弟**位置，不能用 display:none —— 那样连 hover 都收不到），几何还停在最后一次 refreshAll
   *   写入的位置。于是容器根本没有可滚内容、或滚动条已自动淡出之后，环仍会在滚动条的位置被挖掉
   *   一块，观感是「环缺了一角」。
   * - 挖孔侧，骑缝装饰被 CSS 隐藏却仍留在 DOM 里时，环上会多出一个对不上任何东西的缺口。
   *
   * 两个属性都要判：本仓存在「只把 opacity 归零、visibility 保持 visible 好继续收 hover」的隐藏
   * 方式（滚动条轨道即如此，注释见 scrollbarCore 的 ensureGlobalStyle），只判 visibility 会漏。
   *
   * 阈值取 ALPHA_EPSILON 而不是「任何小于 1 就算不可见」：滚动条淡出过渡有 250ms，这期间它是半透明
   * **可见**的，环压在正在淡出的滚动条上同样是穿帮，照擦才对；等它淡到看不出时才停手。
   *
   * 只判元素**自身**的 computed：visibility 是继承属性，自身值即最终生效值；opacity 不继承但会沿
   * 祖先相乘，而本仓的隐藏动作都落在元素自己身上（滚动条显隐类、装饰的 v-show），故不必逐祖先查——
   * 真按祖先链相乘就得每帧多读一串样式，代价远大于它挡下的那点误判。
   */
  const isElementVisible = (el: HTMLElement): boolean => {
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible') return false;
    const alpha = Number.parseFloat(cs.opacity);
    // 读不到数值时按可见兜底：宁多擦一块，也不要因一次异常读数让遮挡物重新被环压住
    return !Number.isFinite(alpha) || alpha > ALPHA_EPSILON;
  };

  /**
   * 收集与 box 相交、且**当前可见**的遮挡物：sticky 元素，以及显式声明 data-ring-occluder 的覆盖元素
   * （自绘滚动条的拇指 / 滚动气泡 —— 见 RING_OCCLUDER_ATTR）。
   *
   * 剪枝：子树根的盒子与 box 不相交就整棵跳过——sticky 元素受包含块约束（只能在父盒子范围内偏移），
   * 父盒子都够不着 box，它更够不着。剪枝让遍历只碰极少数元素：同级几百张卡片里，只有与环重叠的
   * 那一两张会被真正深入。显式声明的遮挡物同样满足这条剪枝：与环不相交时它本就不需要被擦除。
   *
   * 可见性过滤放在这里而不是擦除循环里：收集本就**逐帧重来**（见 collectOccluders 注释），
   * 两处判据同帧生效、不会出现「收的时候可见、擦的时候不可见」的窗口；放在收集侧还能顺带
   * 把它挡在 lastOccluders 之外，省下每帧一次多余的矩形读取与相交判定。
   */
  const collectOccludersWithin = (el: HTMLElement, box: Rect, out: Set<HTMLElement>) => {
    const b = el.getBoundingClientRect();
    if (b.right <= box.left || b.left >= box.right || b.bottom <= box.top || b.top >= box.bottom) return;
    // 先查属性再算 computed：属性读取不触发样式计算，绝大多数元素在这一步就短路掉。
    // 命中候选后还得**当前真的看得见**（见 isElementVisible）——与 box 相交只是「需要擦」的必要条件
    if ((el.hasAttribute(RING_OCCLUDER_ATTR) || getComputedStyle(el).position === 'sticky') && isElementVisible(el))
      out.add(el);
    for (const child of el.children) collectOccludersWithin(child as HTMLElement, box, out);
  };

  /**
   * 收集会遮挡环的元素（sticky 与 data-ring-occluder）：沿目标的祖先链逐层看**同层兄弟**，
   * 对每个兄弟做「相交才深入」的子树扫描。**每帧调用**（box 传环的外轮廓）——见模块头的
   * 「遮挡物策略」：判据与滚动位置有关，聚焦时快照会漏掉之后才滑到环下面的头。
   *
   * 上到 body 为止，因此既能覆盖滚动容器内的吸顶分组标题 / 吸底操作条，
   * 也能覆盖「sticky 在滚动容器之外、吸在视口上」的页头。
   *
   * 只走兄弟、不判祖先链上的元素本身：目标自己是 sticky 时（或它的祖先 sticky 时）它们随目标一起移动，
   * 属于目标的一部分，不构成遮挡。也正因为只看兄弟，目标自身子树天然被排除在扫描之外。
   *
   * 成本：每层把该层兄弟的盒子读一遍，相交才深入。层数 = 目标祖先链长；兄弟数在卡片网格那层最大
   * （一组上百张卡片，逐个取矩形做剪枝，全是只读矩形）；`getComputedStyle` 只落在与环相交的那一两个
   * 元素上。只在环可见期间每帧跑，量级远小于同帧的画布重绘。
   */
  const collectOccluders = (el: HTMLElement, box: Rect): HTMLElement[] => {
    const found = new Set<HTMLElement>();
    let cur: HTMLElement | null = el;
    while (cur && cur !== document.body) {
      const parent: HTMLElement | null = cur.parentElement;
      if (parent)
        for (const sibling of parent.children) {
          if (sibling === cur) continue;
          collectOccludersWithin(sibling as HTMLElement, box, found);
        }

      cur = parent;
    }
    return [...found];
  };

  /**
   * 目标当前所处的可见区域 = 所有裁剪祖先的矩形 ∩ 视口。
   * 视口用 clientWidth/Height（已扣掉滚动条，比 innerWidth/Height 更贴近真正看得见的范围）。
   * 无交集返回 null——容器被折叠成 0 尺寸时就是这种情况。
   */
  const clipRectOf = (): Rect | null => {
    let left = 0;
    let top = 0;
    let right = document.documentElement.clientWidth;
    let bottom = document.documentElement.clientHeight;
    for (const el of clipAncestors) {
      if (!el.isConnected) continue;
      const b = el.getBoundingClientRect();
      left = Math.max(left, b.left);
      top = Math.max(top, b.top);
      right = Math.min(right, b.right);
      bottom = Math.min(bottom, b.bottom);
    }
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  };

  const hide = () => {
    target = null;
    punchTargets = [];
    clipAncestors = [];
    lastOccluders = [];
    staticLayerZ = 0;
    alphaSources = [];
    lastAlpha = -1;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    ring.style.opacity = '0';
  };

  /**
   * 一次几何重绘（rAF 循环内每帧调用）。
   * `r` 与 `clip` 由 apply() 传进来，避免同一帧把几何读两遍。
   */
  const draw = (el: HTMLElement, r: Rect, clip: Rect) => {
    // 画布按设备像素开辟，坐标系仍换算回 CSS 像素：后面的几何全部用视口 CSS 坐标书写。
    const dpr = window.devicePixelRatio || 1;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
      canvas.width = Math.max(1, Math.round(vw * dpr));
      canvas.height = Math.max(1, Math.round(vh * dpr));
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // 绘制区 = 可见区域各自外扩 RING_OUTSET。外扩的理由：目标贴着容器边但完整可见时，它的环本来
    // 就要长出容器 4px，裁掉就不成其为「外扩环」了；而目标滚出容器后，环超出可见区域以外的那部分
    // 被裁掉，收边方向与滚动方向一致，看着像环跟着卡片滑出去，不需要额外的淡出过渡。
    const area = snapOut(
      {
        left: clip.left - RING_OUTSET,
        top: clip.top - RING_OUTSET,
        right: clip.right + RING_OUTSET,
        bottom: clip.bottom + RING_OUTSET,
      },
      dpr
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();

    // 环的外轮廓（视口坐标）：画环带用它，判断「这块有没有被别的东西盖住」也用它
    const region: Rect = {
      left: r.left - RING_OUTSET,
      top: r.top - RING_OUTSET,
      right: r.right + RING_OUTSET,
      bottom: r.bottom + RING_OUTSET,
    };
    const w = region.right - region.left;
    const h = region.bottom - region.top;
    const radius = cornerRadius(el) + RING_OUTSET;

    /** 擦掉一块矩形（吸附到设备像素线后整块清零）。挖孔与 sticky 遮挡共用这同一个动作 */
    const erase = (rect: Rect, cornerR: number) => {
      const cut = snapOut(rect, dpr);
      if (cut.right <= cut.left || cut.bottom <= cut.top) return;
      ctx.beginPath();
      roundRectPath(cut.left, cut.top, cut.right - cut.left, cut.bottom - cut.top, cornerR);
      ctx.fill();
    };

    // 环带 = 外圈圆角矩形 + 内圈圆角矩形（内圈半径减去描边宽），同一条路径 evenodd 一次填充。
    // 描边按 border-box 语义画在外扩盒子的**内侧**，与原先 `border` + box-sizing:border-box 一致。
    ctx.beginPath();
    roundRectPath(region.left, region.top, w, h, radius);
    roundRectPath(
      region.left + RING_WIDTH,
      region.top + RING_WIDTH,
      w - RING_WIDTH * 2,
      h - RING_WIDTH * 2,
      radius - RING_WIDTH
    );
    ctx.fillStyle = getComputedStyle(colorProbe).color;
    ctx.fill('evenodd');

    // 以下是「擦」：destination-out 逐像素把 alpha 乘成 0，不会留下任何半透明残余；擦除边界吸附到
    // 设备像素线后每个像素要么整块在内、要么整块在外，连「被切开一半」的像素都没有，残线无处落脚。
    ctx.globalCompositeOperation = 'destination-out';

    // 挖孔：让目标内骑出边界的外凸装饰（data-ring-punchout）从环上方透出。
    // 与遮挡物擦除共用一道可见性判定，理由也同一个：装饰被 CSS 隐藏（opacity / visibility）却仍
    // 留在 DOM 里时，照挖会在环上留一个对不上任何东西的缺口。判在尺寸之后 —— display:none 的装饰
    // 盒子为零、在这一行就被挡掉，不必为它多读一次样式（见 isElementVisible）。
    for (const punch of punchTargets) {
      if (!punch.isConnected) continue;
      const b = punch.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) continue;
      if (!isElementVisible(punch)) continue;
      erase(
        {
          left: b.left - PUNCH_INFLATE,
          top: b.top - PUNCH_INFLATE,
          right: b.right + PUNCH_INFLATE,
          bottom: b.bottom + PUNCH_INFLATE,
        },
        cornerRadius(punch) + PUNCH_INFLATE
      );
    }

    // sticky 遮挡：吸顶标题这类定位层元素按绘制顺序盖住同容器内的静态内容，而环的层号远高于它们，
    // 不擦就会画在它们之上（视觉上「环穿过了吸顶条」）。逐块清零，多块重叠也不会像 clip 的
    // even-odd / nonzero 那样在重叠区「减两次又填回来」。
    // 收集放在这里、每帧重来一遍：判据是「与环的外轮廓相交」，而相交与否只取决于滚动位置——
    // 聚焦时快照的话，头还停在静态位置时就会被剪枝掉，之后滚到环下面也没人再检查它。
    // 可见性（opacity / visibility）也已在收集侧过滤掉，此处不必重判：收集与擦除同帧，不存在
    // 「收的时候可见、擦的时候已淡出」的窗口。
    lastOccluders = collectOccluders(el, region);
    for (const occluder of lastOccluders) {
      if (!occluder.isConnected) continue;
      const b = occluder.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) continue;
      const cut: Rect = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      if (!overlaps(cut, region)) continue;
      erase(cut, cornerRadius(occluder));
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  /** 一次样式+几何刷新 */
  const apply = () => {
    if (killed) return;
    const el = target;
    if (!el || !el.isConnected) {
      hide();
      return;
    }
    // 层级跟随：环压住目标所在的那一层（内联池号与静态高层取高者），页面内容则退到浮层基准层之下。
    // 取 max 而非「内联优先」：静态高层的 13000 才是决定环能否露出来的值，若它在祖先链更外层、
    // 而里层又恰好有内联层号（如 toast 里嵌了浮层），按内联那个小层号算环照样会被 toast 盖住。
    const ownerZ = Math.max(resolveInlineZ(el), staticLayerZ);
    const nextZ = ownerZ ? ownerZ + 1 : FLOATING_Z_BASE - 1;
    if (nextZ !== appliedZ) {
      overlay.style.zIndex = `${nextZ}`;
      appliedZ = nextZ;
    }
    // 聚焦期间目标被置为 disabled：收起环但**保持跟随循环**——同一焦点上解除 disabled 后
    // 无需再次 focusin 即可自动恢复。这里若走 hide() 会置空 target 并停掉 rAF，恢复就得等下一次焦点事件。
    if (isDisabledTarget(el)) {
      // 与「滚出视窗」同一规则：直接不画、不置 opacity——禁用是在同一聚焦态内发生的变化，
      // 不是焦点进出，走 opacity 过渡只会闪一次渐隐渐显。
      clearCanvas();
      return;
    }
    // 透明度跟随：目标所在子树淡出（浮层离场过渡）时环跟着淡——祖先的 opacity 传不到 body 顶层的环上，
    // 只能自己乘一遍。乘积写在 **canvas** 上（它没有声明过渡），ring 那条 140ms 焦点过渡原样保留，
    // 两者由合成器自动相乘；若写进 ring 就会让过渡每帧被重置起点、永远追不上终点（焦点切换变拖尾）。
    const alpha = readEffectiveAlpha();
    if (alpha === 0) {
      // 与「滚出视窗」「禁用」同一规则：这是同一聚焦态内目标自己变了样子，不是焦点进出，
      // 不走 opacity 过渡（否则会闪一次多余的渐隐）。canvas 置 0 是必须的——下次淡回来时它还在那儿。
      canvas.style.opacity = '0';
      lastAlpha = 0;
      clearCanvas();
      return;
    }
    if (alpha !== lastAlpha) {
      canvas.style.opacity = `${alpha}`;
      lastAlpha = alpha;
    }
    // 可见区域判定：环是 body 顶层浮层、没有任何容器裁它，目标滚出滚动容器后必须自己收起。
    // 判据用**环的外轮廓**（目标矩形外扩 RING_OUTSET）与可见区域是否相交，而不是目标本身——
    // 目标贴着容器边、完整可见时它的环本来就要长出容器 4px，用目标本身判会把这种情况误杀。
    const clip = clipRectOf();
    const r = el.getBoundingClientRect();
    const ringBox: Rect = {
      left: r.left - RING_OUTSET,
      top: r.top - RING_OUTSET,
      right: r.right + RING_OUTSET,
      bottom: r.bottom + RING_OUTSET,
    };
    if (!clip || !overlaps(ringBox, clip)) {
      // 不置 opacity：那会触发 140ms 淡出过渡，滚出视窗时能看到一次多余的渐变闪烁。
      // 直接不画——画布清空即「看不见」，opacity 保持 1，回滚进视窗时立刻出现，全程无过渡。
      clearCanvas();
      return;
    }
    draw(el, r, clip);
    ring.style.opacity = '1';
  };

  const tick = () => {
    if (!target) {
      raf = 0;
      return;
    }
    apply();
    raf = requestAnimationFrame(tick);
  };

  const show = (el: HTMLElement) => {
    target = el;
    punchTargets = Array.from(el.querySelectorAll<HTMLElement>(RING_PUNCHOUT_SELECTOR));
    clipAncestors = collectClipAncestors(el);
    alphaSources = collectAlphaSources(el);
    // 目标换了：下一帧必须把新的可见透明度写下去（canvas 上可能还留着上一个目标的读数）
    lastAlpha = -1;
    // 静态高层（toast / z-top）要读 computed style，代价落在祖先链上，故只在这里解析一次
    staticLayerZ = resolveStaticLayerZ(el);
    // 遮挡物不在这里收集：它的判据是「与环相交」，随滚动位置每帧都在变（见 draw()）
    // 不显式复位 opacity：hide() 已置 0，淡入自然发生；而「环已可见时在相邻目标间移动焦点」
    // （focusout 因 relatedTarget 同族而不收起）保持不闪。
    if (!raf) raf = requestAnimationFrame(tick);
  };

  // 淡出结束后再擦画布：先擦会让 transition 期间露出的是一片空白，淡出就看不见了
  ring.addEventListener('transitionend', (e: TransitionEvent) => {
    if (e.propertyName === 'opacity' && !target) clearCanvas();
  });

  const onFocusIn = (e: FocusEvent) => {
    const hit = (e.target as Element | null)?.closest<HTMLElement>(FOCUSABLE_OUTLINE_SELECTOR);
    // disabled 目标直接不展示：非原生控件只标 aria-disabled、依然可聚焦，不能指望浏览器不派发 focusin
    if (hit && !isDisabledTarget(hit)) show(hit);
  };

  const onFocusOut = (e: FocusEvent) => {
    const next = e.relatedTarget as Element | null;
    // 焦点在同一声明的 element 子树内移动（子元素聚焦）时不收起
    if (next && next.closest(FOCUSABLE_OUTLINE_SELECTOR)) return;
    hide();
  };

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  // 联调开关：控制台 __focusRing.kill() 停画 / revive() 恢复。要判定某条线是不是本环画的，
  // 停画后线仍在 ⇒ 不是它画的；线消失 ⇒ 是它画的。注意必须走这两个命令，直接改 canvas 样式无效。
  const kill = () => {
    killed = true;
    clearCanvas();
    ring.style.opacity = '0';
  };
  const revive = () => {
    killed = false;
    if (target && !raf) raf = requestAnimationFrame(tick);
  };
  Object.assign(window, {
    __focusRing: {
      canvas,
      ring,
      target: () => target,
      punchTargets: () => punchTargets,
      clipAncestors: () => clipAncestors,
      occluders: () => lastOccluders,
      /** 可见透明度的读数来源与当前值（排查「淡出时环没跟」用：看链上哪个祖先拖了后腿） */
      alphaSources: () => alphaSources,
      effectiveAlpha: readEffectiveAlpha,
      clipRectOf,
      kill,
      revive,
    },
  });

  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    hide();
    overlay.remove();
    styleEl.remove();
  };
}
