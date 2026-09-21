/**
 * 外部拖拽源（选器和弦浮动面板等，无源槽位）的几何就近落点解析。
 * 完全绕过 elementFromPoint 的槽位命中——浮动面板 / 抽屉等全屏浮层
 * （pointer-events 已处理但仍可能与内容层叠）不再影响命中。
 */
import { resolveHoverLine, snapToSlotInLine } from './dropGeometry.ts';

import type { Ref } from 'vue';

/** 落点写入回调：由调用方（useDragHighlight 的 setExternalDropTarget）提供 */
export type SetExternalDropTarget = (key: string | null, lineId: string | null) => void;

export interface ExternalDropResolver {
  /** 起拖时快照当前已渲染的歌词行元素（落地/拖拽中布局不变） */
  snapshotLineEls: () => void;
  /** 按指针位置解析外部拖拽落点：撑开行宽容、落点精确 */
  resolve: (x: number, y: number, setTarget: SetExternalDropTarget) => void;
}

export const createExternalDropResolver = (scrollContainerRef?: Ref<HTMLElement | null>): ExternalDropResolver => {
  /** 外部拖拽会话缓存的歌词行元素（起拖时快照） */
  let externalLineEls: HTMLElement[] = [];

  const snapshotLineEls = () => {
    const zone = scrollContainerRef?.value;
    externalLineEls = zone ? Array.from(zone.querySelectorAll<HTMLElement>('[data-line-index]')) : [];
  };

  const resolve = (x: number, y: number, setTarget: SetExternalDropTarget) => {
    // 指针在浮动面板（BaseFloatingPanel 及自带留白拦截层 / 抽屉）上方：不产生任何落点——不撑开同水平歌词行、不吸附槽位、松手不写入。
    // （谱面区矩形延伸到面板底下，仅靠区域判断会把面板内位置就近吸附到行尾槽位）
    // 判据取 platform/ui 的形状契约（data 属性），不依赖任何具体业务面板
    const hoverEl = document.elementFromPoint(x, y);
    if (hoverEl?.closest('[data-floating-panel], [data-floating-panel-scrim], .drawer-overlay-container')) {
      setTarget(null, null);
      return;
    }
    const zone = scrollContainerRef?.value;
    if (!zone) {
      setTarget(null, null);
      return;
    }
    const zoneRect = zone.getBoundingClientRect();
    // 指针在谱面区外（含 24px 容差）不落地
    if (x < zoneRect.left - 24 || x > zoneRect.right + 24 || y < zoneRect.top - 24 || y > zoneRect.bottom + 24) {
      setTarget(null, null);
      return;
    }
    // 撑开行宽容、落点精确：指针在行内空白处时 key 为 null、lineId 有效——撑开该行但不给落点。
    // 槽位吸附复用已解析出的行，避免在指针移动的热路径上重复扫描行矩形
    const hoveredLine = resolveHoverLine(externalLineEls, y);
    const snapped = hoveredLine ? snapToSlotInLine(hoveredLine, x) : null;
    setTarget(snapped?.key ?? null, hoveredLine?.lineId ?? null);
  };

  return { snapshotLineEls, resolve };
};
