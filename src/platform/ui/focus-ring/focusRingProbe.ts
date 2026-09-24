/**
 * 外扩聚焦环的**无状态探针**：只读 DOM、只做纯几何，不持有任何跨帧状态，也不碰 canvas。
 *
 * 与 `focusRingOverlay` 的分工，判据只有一条 —— **有没有状态**：
 * - 本模块：给定元素 / 矩形即可算出结果。禁用判定、圆角、设备像素吸附、矩形相交、层级解析、
 *   裁剪祖先与透明度读数来源的快照、可见性判定、遮挡物收集。
 * - `focusRingOverlay`：控制器。逐帧状态（目标、punchTargets、clipAncestors、alphaSources、
 *   lastAlpha、lastOccluders、绘制签名、层号、画布盒）与全部绘制动作都留在那边。
 *
 * 两个**看着像纯函数、但刻意没搬**的读数函数：`readEffectiveAlpha`（读控制器的 alphaSources）
 * 与 `clipRectOf`（读控制器的 clipAncestors）。把数组当参数传进来确实能让它们变纯，但那等于把
 * 控制器的状态形状摊到本模块的接口上，而两者又都挂在 `__focusRing` 调试面上——收益不抵一次接口扩张。
 * 同理，`collectRingPaint` 的 lastOccluders 写入与 `hide` 的一串状态复位也都属控制器。
 *
 * 本模块的读法约定：`snapOut` / `overlaps` 收发的矩形一律是**视口绝对坐标**（见 focusRingOverlay
 * 模块头「画布尺寸策略」：吸附必须做在视口坐标上，局部坐标里取整落不回设备像素）。
 */
import { FLOATING_Z_BASE } from '@/platform/ui/popover/floatingZ';

/** 环上需要挖孔让位的外凸装饰标记（与目标同层渲染、但几何上骑出目标边界的元素） */
export const RING_PUNCHOUT_SELECTOR = '[data-ring-punchout]';
/** 显式声明的遮挡物属性：内容层里「视觉上盖住内容」的覆盖元素（如自绘滚动条的拇指与滚动气泡）。
 *  它们与目标同处内容层、z-index 越不过 body 顶层的环，只能由环侧擦除（与 sticky 共用同一套动作）。
 *  与 data-ring-punchout 的分工：挖孔只扫**目标子树内**的外凸装饰，而这类覆盖元素在目标之外
 *  （滚动条挂在滚动容器的兄弟位置），只有沿祖先链的遮挡物收集才够得着。
 *  标了属性 ≠ 永远要擦：元素**当前不可见**时不擦（见 isElementVisible）——这条属性声明的是
 *  「我在内容层且会盖住东西」，而不是「我此刻在屏幕上」。
 *  另有一道**层边界**：目标在浮层内时它们整体处于低层、盖不住环，扫描根本走不到它们
 *  （见 resolveLayerBoundary）。本属性只声明「同层时会盖住东西」。 */
export const RING_OCCLUDER_ATTR = 'data-ring-occluder';
/** 可见透明度低于该值即视为不可见：整棵祖先链相乘后剩这么点，画出来只是一层看不出的薄雾，
 *  继续重绘纯属白烧帧——与「滚出视窗」一样直接清画布。
 *  同一阈值也用于判定**遮挡物 / 骑缝装饰**是否还看得见（见 isElementVisible）：两处的语义都是
 *  「淡到这个程度就等于没有」，没有必要各定一档。
 *  声明在本模块是因为主用方是可见性判定；控制器里的 readEffectiveAlpha 也用它，故一并导出。 */
export const ALPHA_EPSILON = 0.005;

/** 视口绝对坐标下的矩形（left/top/right/bottom）；只用几何数值，不依赖 DOMRect 实例 */
export interface Rect {
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
export const isDisabledTarget = (el: HTMLElement): boolean =>
  el.matches(':disabled') || el.closest('[aria-disabled="true"]') !== null;

/** 圆角半径取实际像素值；百分比写法（如 border-radius:50%）解析出的是裸数字，交给绘制侧按短边夹紧兜底 */
export const cornerRadius = (el: Element): number => {
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
export const snapOut = (rect: Rect, dpr: number): Rect => ({
  left: Math.floor(rect.left * dpr) / dpr,
  top: Math.floor(rect.top * dpr) / dpr,
  right: Math.ceil(rect.right * dpr) / dpr,
  bottom: Math.ceil(rect.bottom * dpr) / dpr,
});

/** 两矩形是否有交集（贴边不算，面积必须为正） */
export const overlaps = (a: Rect, b: Rect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

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
export const resolveInlineZ = (el: HTMLElement): number => {
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    const inline = Number.parseInt(cur.style.zIndex, 10);
    if (Number.isFinite(inline)) return inline;
    cur = cur.parentElement;
  }
  return 0;
};

export const resolveStaticLayerZ = (el: HTMLElement): number => {
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    const z = Number.parseInt(getComputedStyle(cur).zIndex, 10);
    if (Number.isFinite(z) && z >= FLOATING_Z_BASE) return z;
    cur = cur.parentElement;
  }
  return 0;
};

/**
 * 目标所在层的**边界元素**：向上第一个建立浮层 / 静态高层（z ≥ FLOATING_Z_BASE）的祖先，无则 null。
 *
 * 用途只有一个：给遮挡物收集划上限（见 focusRingOverlay 模块头「遮挡物策略」与 collectOccluders）。
 * 取 z ≥ 基准层而不是「有内联层号就停」，因为后者会把内容层的层号一并认下——本仓内容层写的是工具类
 * （z-card / z-panel / z-sticky / z-fab，全在基准层之下），**只有浮层宿主**把池号写在
 * 内联 style 上；静态高层（z-top / z-toast）则只有 computed 值。两处都查一遍，与
 * `resolveInlineZ` + `resolveStaticLayerZ` 认下侧同一口径。
 *
 * 返回元素而非层号：本判据问的是「兄弟在不在同一层」，即 DOM 边界，不是数值大小。
 * 内联值先查（不触发样式计算），未命中再读 computed——与 show() 里那两个 resolve 同序。
 */
export const resolveLayerBoundary = (el: HTMLElement): HTMLElement | null => {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    const inline = Number.parseInt(cur.style.zIndex, 10);
    if (Number.isFinite(inline) && inline >= FLOATING_Z_BASE) return cur;
    const z = Number.parseInt(getComputedStyle(cur).zIndex, 10);
    if (Number.isFinite(z) && z >= FLOATING_Z_BASE) return cur;
    cur = cur.parentElement;
  }
  return null;
};

/**
 * 快照目标的裁剪祖先：向上收集所有 overflow 非 visible 的祖先（滚动 / 隐藏容器）。
 *
 * 与 punchTargets 同策略——DOM 成员在 show 时取一次，因为这一步要读 computed style（逐帧读会
 * 白白触发样式计算），而几何每帧实测（getBoundingClientRect 很便宜）。
 * 从父元素起算：目标自身的 overflow 不裁剪自己。
 */
export const collectClipAncestors = (el: HTMLElement): HTMLElement[] => {
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
export const collectAlphaSources = (el: HTMLElement): CSSStyleDeclaration[] => {
  const list: CSSStyleDeclaration[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    list.push(getComputedStyle(cur));
    cur = cur.parentElement;
  }
  return list;
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
export const isElementVisible = (el: HTMLElement): boolean => {
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
 * 对每个兄弟做「相交才深入」的子树扫描。**每帧调用**（box 传环的外轮廓）——见 focusRingOverlay
 * 模块头的「遮挡物策略」：判据与滚动位置有关，聚焦时快照会漏掉之后才滑到环下面的头。
 *
 * 上到 body 为止，因此既能覆盖滚动容器内的吸顶分组标题 / 吸底操作条，
 * 也能覆盖「sticky 在滚动容器之外、吸在视口上」的页头。但**上到 body 为止 ≠ 同层**：
 * 目标在浮层内时（面板 Teleport 到 body），再往上取兄弟就把 #app 当成了同层兄弟，内容层的
 * 滚动条拇指 / 吸顶头会被误擦。故以 boundary（见 resolveLayerBoundary）为上限：走到它即停，
 * **不看它的兄弟** —— 边界之外的元素整体处于低层，盖不住环。boundary 为 null（目标在内容层）
 * 时行为与原先完全一致。
 *
 * 只走兄弟、不判祖先链上的元素本身：目标自己是 sticky 时（或它的祖先 sticky 时）它们随目标一起移动，
 * 属于目标的一部分，不构成遮挡。也正因为只看兄弟，目标自身子树天然被排除在扫描之外。
 * 层边界同样只对**兄弟**起作用：边界元素自身及其子树仍是扫描对象，浮层自己的滚动条拇指
 * （挂在面板内的 scrollbar-layer 上）照旧被擦。
 *
 * 成本：每层把该层兄弟的盒子读一遍，相交才深入。层数 = 目标祖先链长；兄弟数在卡片网格那层最大
 * （一组上百张卡片，逐个取矩形做剪枝，全是只读矩形）；`getComputedStyle` 只落在与环相交的那一两个
 * 元素上。只在环可见期间每帧跑，量级远小于同帧的画布重绘。
 */
export const collectOccluders = (el: HTMLElement, box: Rect, boundary: HTMLElement | null): HTMLElement[] => {
  const found = new Set<HTMLElement>();
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body && cur !== boundary) {
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
