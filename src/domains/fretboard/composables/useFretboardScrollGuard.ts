/**
 * 指板的触摸滚动守卫：判断本次触摸手势要不要拦下外层容器的滚动。
 *
 * 从 `useFretboardInteraction` 里切出来 —— 它是整条交互链路里唯一只关心「触摸起手落在哪一区」的
 * 一段，与编辑、高亮、滑动绘制都无关，放在一起只会让那几段互相遮挡。
 */
import type { FretboardCanvasPoint } from '@/domains/fretboard/composables/useFretboardLayout';

export interface FretboardScrollGuardOptions {
  /** 指针事件坐标 → 指板逻辑坐标；未命中有效区域时返回 null */
  getCanvasPoint: (clientX: number, clientY: number) => FretboardCanvasPoint | null;
}

export interface FretboardScrollGuardApi {
  handlePointerDownCapture: (e: PointerEvent) => void;
  handleTouchMoveGuard: (e: TouchEvent) => void;
}

export const useFretboardScrollGuard = ({ getCanvasPoint }: FretboardScrollGuardOptions): FretboardScrollGuardApi => {
  /**
   * 本次触摸手势是否要拦下外层容器的滚动 —— **只有起手落在品格区的手势拦**。
   *
   * 为什么不由 CSS 分区：`touch-action` 只认命中元素及其祖先链的**交集**，而品格区的命中目标一半是
   * SVG 内的音符 / 横按梁（`pointer-events: auto`）。实测（Chromium，触摸模拟）SVG 子元素上的
   * `touch-action: none` **被浏览器忽略** —— 根上给 none 会连名字区、空弦区、板身留白一起拦下，
   * 而想只拦品格区、又不夺走那些元素的命中，CSS 层无解。
   *
   * 改走「第一帧自行 preventDefault」：触摸事件一路冒泡到根，与命中的是 SVG 还是根无关，
   * 于是能按**起手位置**逐次判定，命中目标是谁都不影响。
   */
  let touchBlocksScroll = false;

  /**
   * 起手登记：必须在**捕获阶段**做。名字区在自己的 `pointerdown` 上 `stop` 了冒泡（见 Fretboard.vue），
   * 从那里起手的手势到不了根上的 bubble 处理器 —— 标志会滞留在上一次手势的判定上，
   * 于是「上一次在品格区拖动、这一次在名字区上滑」会被错误地拦下。
   *
   * 判定只认品格区（1..fretCount）：空弦区（0）、名字区、以及品格区之外（板身左右留白与底部留白）
   * 一律放行 —— 后三者由 `calculateFretboardPoint` 的 null 兜住（越界品位、越界弦序、名字区高度内）。
   */
  const handlePointerDownCapture = (e: PointerEvent) => {
    touchBlocksScroll = false;
    if (e.pointerType !== 'touch') return;
    const pt = getCanvasPoint(e.clientX, e.clientY);
    touchBlocksScroll = pt !== null && pt.fretIndex >= 1;
  };

  /**
   * 滚动守卫：**非被动**监听 —— 浏览器会等这次回调返回再决定起不起滚，故第一帧的 preventDefault
   * 就能拦住整段手势。实测（Chromium，触摸模拟）：起手在品格区拖动不滚、也不派发 `pointercancel`
   * （滑动绘制会话照常走到 pointerup）；起手在品格区之外照常滚动；轻点（无移动）与「微动几像素再松手」
   * 的合成 click 均不受影响 —— 只在 touchmove 上拦，不会误伤点击。
   *
   * 代价：本区域因此成为「非快速可滚区」，手指落在指板上滚动时由主线程裁决（多几毫秒延迟）。
   * 这是按区域拦截绕不开的 —— 换来的是名字区 / 空弦区 / 留白处能正常滚页面。
   */
  const handleTouchMoveGuard = (e: TouchEvent) => {
    if (touchBlocksScroll) e.preventDefault();
  };

  return { handlePointerDownCapture, handleTouchMoveGuard };
};
