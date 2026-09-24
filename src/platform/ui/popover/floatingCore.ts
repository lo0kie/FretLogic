import {
  autoUpdate,
  computePosition,
  flip,
  arrow as floatingArrow,
  limitShift,
  offset,
  shift,
  size,
} from '@floating-ui/dom';

import type { ArrowSide } from '@/platform/ui/popover/arrowPanelPath';
import type {
  ComputePositionReturn,
  Coords,
  Middleware,
  Placement,
  ReferenceElement,
  Strategy,
} from '@floating-ui/dom';

/**
 * floating-ui 定位编排的唯一实现处。
 *
 * BasePopover 与 vTooltip 此前各写了一份 offset/flip/shift/arrow/size 中间件组装与虚拟锚点
 * 构造，散落两处且参数漂移。本模块收敛为单一来源。两消费方现在同走 @floating-ui/dom 的
 * computePosition（BasePopover 经 useFloatingPosition 取响应式定位，vTooltip 直接调用）：
 * - buildFloatingMiddlewares：中间件列表（两消费方通用，中间件实现同源于 @floating-ui/core）
 * - createVirtualElementRect：以鼠标坐标 / 任意点构造零尺寸虚拟锚点
 * - createFloatingController：computePosition + 竞态守卫 + autoUpdate 生命周期的唯一实现处
 */

/** 显示箭头时浮层与锚点的最小间距（px）：箭头外露量约 size·√2/2 - 1（size=14 → ≈9px），
 *  间距须大于外露量，否则箭头会戳进触发元素。BasePopover 箭头 size=14 即用此下限 */
export const ARROW_MIN_OFFSET = 12;

export interface FloatingMiddlewareOptions {
  /** 浮层与锚点的间距（px），默认 8 */
  offsetDistance?: number;
  /** 是否启用指示箭头中间件 */
  showArrow?: boolean;
  /** 箭头元素获取器（showArrow 时必填），middleware 内惰性求值以对齐 BasePopover 的模板 ref 形态 */
  getArrowEl?: () => HTMLElement | null;
  /** 是否让浮层宽度跟随锚点（下拉类场景） */
  matchTriggerWidth?: boolean;
  /** matchTriggerWidth 的生效策略：width 强制等宽 / minWidth 仅不小于锚点 */
  matchTriggerWidthStrategy?: 'width' | 'minWidth';
  /**
   * 交叉轴溢出检查（默认 false）：
   * 设为 false 时 flip 仅在主轴（如上下）空间不足时翻转；交叉轴（左右）轻微溢出交由后面的 shift 限位，
   * 避免靠屏幕右/左边缘的元素因水平微小溢出而被强制上下翻转。
   */
  crossAxis?: boolean;
  /** 自定义备选翻转方位；未传时 floating-ui 默认翻转至对侧 */
  fallbackPlacements?: Placement[];
}

/**
 * 组装统一中间件链：offset → flip（带回退方位）→ shift（限位）→
 * 可选 size（等宽下拉）→ 可选 arrow。
 * 参数一致，替换掉 BasePopover.middlewareList 与 vTooltip.updatePosition 各自的实现。
 */
export const buildFloatingMiddlewares = (opts: FloatingMiddlewareOptions = {}): Middleware[] => {
  const m: Middleware[] = [
    offset(opts.offsetDistance ?? 8),
    flip({
      crossAxis: opts.crossAxis ?? false,
      fallbackPlacements: opts.fallbackPlacements,
      padding: 8,
    }),
    shift({ padding: 12, limiter: limitShift() }),
  ];

  if (opts.matchTriggerWidth) {
    const strategy = opts.matchTriggerWidthStrategy ?? 'width';
    m.push(
      size({
        apply({ rects, elements }) {
          if (strategy === 'minWidth')
            Object.assign(elements.floating.style, {
              minWidth: `${rects.reference.width}px`,
            });
          else
            Object.assign(elements.floating.style, {
              width: `${rects.reference.width}px`,
            });
        },
      })
    );
  }

  if (opts.showArrow && opts.getArrowEl)
    // Derivable 惰性求值：每次 computePosition 时经 getArrowEl 取箭头元素（模板 ref 形态）。
    // 元素尚未挂载时置 null——core 的 arrow 对 null 有防御（直接跳过本帧），不会抛错
    m.push(
      floatingArrow(() => {
        const element = opts.getArrowEl?.() ?? null;
        return { element: element as Element, padding: 6 };
      })
    );

  return m;
};

/** 在 showArrow 时抬高间距到安全下限（BasePopover 用），无箭头时按调用方给定值 */
export const resolveArrowAwareOffset = (offsetDistance: number, showArrow: boolean): number =>
  showArrow ? Math.max(offsetDistance, ARROW_MIN_OFFSET) : offsetDistance;

/** placement 主轴 → 箭头贴的那条边：面板在锚点下方 ⇒ 箭头贴面板上边 */
const ARROW_EDGE_BY_MAIN: Record<string, ArrowSide> = {
  bottom: 'top',
  top: 'bottom',
  left: 'right',
  right: 'left',
};

/** 实际（flip 后）placement → 剪影层要的箭头朝向 */
export const arrowSideOfPlacement = (placement: Placement): ArrowSide => {
  const [main] = placement.split('-');
  return ARROW_EDGE_BY_MAIN[main ?? 'bottom'] ?? 'top';
};

/**
 * `arrow` 中间件给出的落点：**只有交叉轴那一项有值** —— `top` / `bottom` 给 `x`、`left` / `right`
 * 给 `y`，主轴那一项按 `Partial<Coords>` 恒为 `undefined`。这不是缺数据，中间件本来只算交叉轴。
 */
export type ArrowPlacementOffset = Partial<Coords>;

/**
 * arrow 中间件给的落点 → 剪影层要的箭头**中心**（沿箭头所在边的 px 坐标）。
 * 中间件给的是箭头元素左上角，故加半个边长；交叉轴随主轴切换（左右贴边时落点在 y 上）。
 */
export const arrowCenterOfPlacement = (
  placement: Placement,
  offset: ArrowPlacementOffset,
  arrowSize: number
): number => {
  const [main] = placement.split('-');
  // 中间件按 placement 的主轴挑交叉轴，故这里读的那一项必然有值；`?? 0` 只是收窄类型
  const along = main === 'left' || main === 'right' ? offset.y : offset.x;
  return (along ?? 0) + arrowSize / 2;
};

/**
 * 以视口坐标构造零尺寸虚拟锚点（右键菜单、气泡等无 DOM 锚点场景）。
 * floating-ui 通过 getBoundingClientRect 读取矩形字段，返回完整 DOMRect 结构字段即可。
 */
export const createVirtualElementRect = (x: number, y: number, width = 0, height = 0) => {
  const rect: DOMRect = {
    x,
    y,
    top: y,
    bottom: y + height,
    left: x,
    right: x + width,
    width,
    height,
    toJSON: () => ({ x, y, top: y, bottom: y + height, left: x, right: x + width, width, height }),
  } as DOMRect;
  return {
    getBoundingClientRect: () => rect,
  };
};

/**
 * 浮层入场缩放的原点：跟随实际(flip 后)placement，让面板从「贴着触发点的那一侧」长出，
 * 而不是固定 top 中心（视觉像从中心弹开）。
 *
 * floating-ui 的 placement 描述「浮层相对锚点的方位」：
 *  - main 轴为 bottom/top/left/right → 贴锚点的边是该方位的反边（bottom → 从面板 top 生长）；
 *  - cross 轴为 start/end → 另一个维度也贴近锚点（bottom-start → top-left 角贴触发点）。
 * 无 cross 时该维度居中，水平主轴与垂直主轴分别拼装 transform-origin。
 */
export const computePanelTransformOrigin = (placement: Placement): string => {
  const [main = '', cross] = placement.split('-');
  const mainNear: Record<string, string> = { bottom: 'top', top: 'bottom', right: 'left', left: 'right' };
  const mainIsVertical = main === 'bottom' || main === 'top';

  // 主轴贴边（必含）；交叉轴仅在有 start/end 时贴近，否则居中
  const mainPart = mainNear[main] ?? 'center';
  const crossPart =
    cross === 'start'
      ? mainIsVertical
        ? 'left'
        : 'top'
      : cross === 'end'
        ? mainIsVertical
          ? 'right'
          : 'bottom'
        : 'center';

  return mainIsVertical ? `${mainPart} ${crossPart}` : `${crossPart} ${mainPart}`;
};

export interface FloatingControllerOptions {
  /**
   * 取当前锚点（真实元素或虚拟元素，如鼠标坐标构造的定位点）。
   * 每次计算前取一次并留作比对：异步计算期间锚点若已切换，本次结果对应的是旧元素。
   */
  getReference: () => ReferenceElement | null | undefined;
  /** 取当前浮层元素；语义同上 */
  getFloating: () => HTMLElement | null | undefined;
  /** 取期望方位（flip 后的实际方位在结果里） */
  getPlacement: () => Placement;
  /** 取中间件链（如 buildFloatingMiddlewares 的产物） */
  getMiddleware: () => Middleware[];
  /** 定位策略，默认 fixed */
  strategy?: Strategy;
  /** 计算成功且未过期时写回（组件侧写 ref、指令侧写 style） */
  onResult: (result: ComputePositionReturn) => void;
}

export interface FloatingController {
  /** 计算一次并等待完成：需要在显隐前先拿到坐标时用（如首次显示，避免从 (0,0) 闪入） */
  compute: () => Promise<void>;
  /** 计算一次，fire-and-forget（与 compute 同一实现）：滚动 / resize 跟随等高频路径用 */
  update: () => void;
  /** 按当前两端元素重新交接 autoUpdate（先停旧的；任一缺失则停用） */
  attach: () => void;
  /** 停用 autoUpdate（隐藏 / 卸载时调用） */
  detach: () => void;
}

/**
 * 浮层定位控制器：`computePosition` + 竞态守卫 + `autoUpdate` 生命周期的**唯一实现处**。
 *
 * BasePopover（经 useFloatingPosition 转成响应式值）与 vTooltip（命令式单例）此前各写一份
 * 「异步计算 + 竞态守卫 + 启停 autoUpdate」，两处逐段等价、只在「结果写到哪里」上不同：
 * 组件写 ref、指令写 style。本控制器只负责算与跟随，写回交给 onResult。
 *
 * 三处刻意的口径（两处原实现一致，合并时保留）：
 * 1. **吞掉 rejection**：计算期间锚点/浮层被移除等极端场景会 reject。本控制器会被 autoUpdate
 *    回调、打开流程等多处 fire-and-forget 调用，上抛会留下未处理的 rejected Promise；
 * 2. **竞态守卫**：异步计算期间锚点或浮层已换，本次结果对应旧元素，写回会把浮层闪回旧位置。
 *    丢弃是安全的——元素变化会触发 attach()，autoUpdate 随即发起一次新计算；
 * 3. **两个计算入口**：compute 返回 Promise（首次显示要先定位再显隐，不能等一帧）；
 *    update 只是 `void compute()` —— 滚动跟随等调用点既有 ResizeObserver 回调也有裸语句调用，
 *    返回 Promise 会引出未处理 rejection 与误用 async 回调的告警，而内部本就吞掉了 rejection、无需等待。
 */
export const createFloatingController = (options: FloatingControllerOptions): FloatingController => {
  /** autoUpdate 的停用函数；锚点或浮层缺失（未挂载 / 已卸载）时为 undefined */
  let stopAutoUpdate: (() => void) | undefined;

  const run = async (): Promise<void> => {
    const referenceEl = options.getReference();
    const floatingEl = options.getFloating();
    if (!referenceEl || !floatingEl) return;

    let result: ComputePositionReturn;
    try {
      result = await computePosition(referenceEl, floatingEl, {
        placement: options.getPlacement(),
        strategy: options.strategy ?? 'fixed',
        middleware: options.getMiddleware(),
      });
    } catch {
      return;
    }

    if (options.getReference() !== referenceEl || options.getFloating() !== floatingEl) return;

    options.onResult(result);
  };

  return {
    compute: run,
    update: () => void run(),
    attach: () => {
      stopAutoUpdate?.();
      stopAutoUpdate = undefined;
      const referenceEl = options.getReference();
      const floatingEl = options.getFloating();
      if (!referenceEl || !floatingEl) return;
      // 两端元素齐备才交接 autoUpdate（滚动 / resize 跟随）
      stopAutoUpdate = autoUpdate(referenceEl, floatingEl, () => void run());
    },
    detach: () => {
      stopAutoUpdate?.();
      stopAutoUpdate = undefined;
    },
  };
};
