import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import type { ComponentPublicInstance } from 'vue';

/**
 * ghost 相对指针的纵向偏移（px）：让 ghost 落在指针**下方一点**，不压住指针正下方的槽位。
 *
 * 是纯视觉常量，刻意不按 ghost 自身高度推算 —— 它只负责「别挡指针」，与内容无关。
 * 两处写入（首帧定位与逐帧跟随）共用这一个值，改一处即可。
 */
const GHOST_POINTER_OFFSET_Y = 20;

/**
 * 拖拽影像层：跟随指针的浮层元素 + 按帧合帧的位移写入。
 *
 * **零业务语义**：只认「元素」与「指针坐标」，不关心影像里画什么 —— 内容（原先内联的是和弦名）
 * 由调用方决定。它原先住在乐谱域的拖拽实现里，于是被绑在域内；拖拽影像本身是任何拖拽都要的，
 * 故归平台层。平台另有一处「拖拽影像」：`useSortableList` 的 `.drag-preview`（样式在 main.scss），
 * 那个是排序专用的整块影像，与本文件的分工是「谁管外观」——本文件只提供元素与位移，不介入样式。
 *
 * 位置更新按帧合帧（rAF），避免 pointermove 高频写 transform。
 */
export function useDragGhostLayer() {
  let ghostEl: HTMLElement | null = null;

  /** 写入 ghost transform：按帧合帧，只应用最后一次指针位置 */
  const {
    schedule: scheduleGhostFrame,
    flush: flushGhostPos,
    cancel: cancelGhostPos,
  } = useRafThrottle<{
    x: number;
    y: number;
  }>(pos => {
    if (!ghostEl) return;
    ghostEl.style.transform = `translate3d(${pos.x}px, ${pos.y - GHOST_POINTER_OFFSET_Y}px, 0)`;
  });

  /** 挂载/卸载 ghost 元素，可选地立即定位到初始指针位置 */
  const setGhostEl = (el: Element | ComponentPublicInstance | null, initialPos?: { x: number; y: number }) => {
    ghostEl = el instanceof HTMLElement ? el : null;
    // 判据是「有没有传位置」，不是 `initialPos.x !== 0`：调用方传的 currentPointerPos 在 pointerdown
    // 时就已落值（从不是「无位置」的哨兵），用 x!==0 当代理会在指针恰位于视口左缘时误判成无位置，
    // ghost 首帧停在左上角直到下一次 pointermove 才归位。
    if (ghostEl && initialPos)
      ghostEl.style.transform = `translate3d(${initialPos.x}px, ${initialPos.y - GHOST_POINTER_OFFSET_Y}px, 0)`;
  };

  /** 记录新指针位置并按帧合帧应用 */
  const scheduleGhostPos = (x: number, y: number) => void scheduleGhostFrame({ x, y });

  return { setGhostEl, scheduleGhostPos, flushGhostPos, cancelGhostPos };
}
