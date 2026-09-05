/**
 * floating-ui 定位编排的唯一实现处。
 *
 * BasePopover（@floating-ui/vue 的 useFloating）与 vTooltip（@floating-ui/dom 的
 * computePosition）此前各写了一份 offset/flip/shift/arrow/size 中间件组装与虚拟锚点
 * 构造，散落两处且参数漂移。本模块收敛为单一来源：
 * - buildFloatingMiddlewares：中间件列表（两消费方通用，dom/vue 的中间件同源于 core）
 * - createVirtualElementRect：以鼠标坐标 / 任意点构造零尺寸虚拟锚点
 */
import {
  flip,
  arrow as floatingArrow,
  limitShift,
  offset,
  shift,
  size,
  type Middleware,
  type Placement,
} from '@floating-ui/dom';

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
          if (strategy === 'minWidth') {
            Object.assign(elements.floating.style, {
              minWidth: `${rects.reference.width}px`,
            });
          } else {
            Object.assign(elements.floating.style, {
              width: `${rects.reference.width}px`,
            });
          }
        },
      })
    );
  }

  if (opts.showArrow && opts.getArrowEl) {
    // Derivable 惰性求值：每次 computePosition 时经 getArrowEl 取箭头元素（模板 ref 形态）。
    // 元素尚未挂载时置 null——core 的 arrow 对 null 有防御（直接跳过本帧），不会抛错
    m.push(
      floatingArrow(() => {
        const element = opts.getArrowEl?.() ?? null;
        return { element: element as Element, padding: 6 };
      })
    );
  }

  return m;
};

/** 在 showArrow 时抬高间距到安全下限（BasePopover 用），无箭头时按调用方给定值 */
export const resolveArrowAwareOffset = (offsetDistance: number, showArrow: boolean): number =>
  showArrow ? Math.max(offsetDistance, ARROW_MIN_OFFSET) : offsetDistance;

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
