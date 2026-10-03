/**
 * 指板的触摸滚动守卫：判断本次触摸手势要不要拦下外层容器的滚动。
 *
 * 从 `useFretboardInteraction` 里切出来 —— 它是整条交互链路里唯一只关心「触摸起手落在哪一区」的
 * 一段，与编辑、高亮、滑动绘制都无关，放在一起只会让那几段互相遮挡。
 *
 * 分区口径：**空弦区与品格区都归滑动绘制**（两区都是画布上的可编辑格位），触摸起手即拦；
 * 名字区与板身留白（左右 / 底部）放行，页面照常滚。空弦区原本属放行那一侧（它只接受单次点击），
 * 随滑动绘制覆盖到品位 0 而一并改归拦截侧 —— 不拦则触摸端该功能不可用（手指一动页面就滚，
 * 已开的会话还会被 pointercancel 收掉）。
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
   * 本次触摸手势是否要拦下外层容器的滚动 —— **起手落在指板有效格位（空弦区 0 与品格区 1..fretCount）的手势拦**。
   *
   * 为什么不由 CSS 分区：`touch-action` 只认命中元素及其祖先链的**交集**，而品格区的命中目标一半是
   * SVG 内的音符 / 横按梁（`pointer-events: auto`）。实测（Chromium，触摸模拟）SVG 子元素上的
   * `touch-action: none` **被浏览器忽略** —— 根上给 none 会连名字区、板身留白一起拦下，
   * 而想只拦可编辑格位、又不夺走那些元素的命中，CSS 层无解。
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
   * 判定就是「`getCanvasPoint` 命中」本身：名字区（高度内）、板身左右留白、品格区之下（越界品位）
   * 与横向越界弦序一律返回 null，故它们自动落在放行侧 —— 不必再逐区列举。
   */
  const handlePointerDownCapture = (e: PointerEvent) => {
    // 非主指针（多指场景的第二指及以后）完全不动这个标志：第一指正在品格区拖动时，第二指落在
    // 名字区 / 板身留白会把标志清成 false，第一指的手势随即被外层容器抢走滚动、被 pointercancel
    // 收掉整个绘制会话 —— 正是本文件开头那条「起手落在可编辑格位的手势拦」被打破的路径。
    if (!e.isPrimary) return;
    touchBlocksScroll = false;
    if (e.pointerType !== 'touch') return;
    touchBlocksScroll = getCanvasPoint(e.clientX, e.clientY) !== null;
  };

  /**
   * 滚动守卫：**非被动**监听 —— 浏览器会等这次回调返回再决定起不起滚，故第一帧的 preventDefault
   * 就能拦住整段手势。实测（Chromium，触摸模拟）：起手在可编辑格位（空弦区 / 品格区）拖动不滚、
   * 也不派发 `pointercancel`（滑动绘制会话照常走到 pointerup）；起手在名字区 / 板身留白处照常滚动；
   * 轻点（无移动）与「微动几像素再松手」的合成 click 均不受影响 —— 只在 touchmove 上拦，不会误伤点击。
   *
   * 代价：可编辑格位因此成为「非快速可滚区」，手指落在指板上滚动时由主线程裁决（多几毫秒延迟）。
   * 这是按区域拦截绕不开的 —— 换来的是名字区与板身留白处能正常滚页面。
   */
  const handleTouchMoveGuard = (e: TouchEvent) => {
    if (touchBlocksScroll) e.preventDefault();
  };

  return { handlePointerDownCapture, handleTouchMoveGuard };
};
