/**
 * 歌词拖拽高亮：管理拖拽源/落点槽位的 DOM class 高亮（is-drop-target / is-drag-source）
 * 与当前落点槽位判定（落地动作由槽位是否已占用和弦决定，与指针在槽内的位置无关）。
 */
import { ref } from 'vue';

import { resolveHoverLine, snapToSlotInLine } from './dropGeometry';

/** 拖拽高亮管理：源槽位与落点槽位的 DOM class 标记 */
export function useDragHighlight() {
  const dragOverSlotKey = ref<string | null>(null);
  /** 当前悬停的歌词行 ID（只要指针在行内，跨越字符间隙时保持恒定，避免行状态高频抖动闪烁） */
  const activeDropLineId = ref<string | null>(null);
  let currentDropKey: string | null = null;
  let sourceKey: string | null = null;
  let sourceClass: string | null = null;

  /** 按 slot key 查找所有匹配的槽位元素 */
  const findSlotEls = (key: string) => document.querySelectorAll<HTMLElement>(`[data-slot-key="${CSS.escape(key)}"]`);

  /** 切换落点高亮：仅在目标变化时增删 class，避免重复 DOM 操作 */
  const applyDropHighlight = (key: string | null) => {
    if (key === currentDropKey) return;
    if (currentDropKey !== null) findSlotEls(currentDropKey).forEach(el => el.classList.remove('is-drop-target'));

    currentDropKey = key;
    if (key !== null) findSlotEls(key).forEach(el => el.classList.add('is-drop-target'));
  };

  /** 标记拖拽源槽位：className 由调用方给出（当前拖拽语义唯一为「移动」，源槽虚化 is-dragging-source） */
  const markDragSource = (key: string, className: string) => {
    sourceKey = key;
    sourceClass = className;
    findSlotEls(key).forEach(el => el.classList.add(className));
  };

  /** 清除全部拖拽相关高亮与状态 */
  const clearDragClasses = () => {
    applyDropHighlight(null);
    if (sourceKey !== null && sourceClass !== null) {
      findSlotEls(sourceKey).forEach(el => el.classList.remove(sourceClass!));
      sourceKey = null;
      sourceClass = null;
    }
    dragOverSlotKey.value = null;
    activeDropLineId.value = null;
  };

  /** 指针离开谱面区/浮层之上：槽位与行的高亮一起清空 */
  const clearDropTarget = (): null => {
    dragOverSlotKey.value = null;
    activeDropLineId.value = null;
    applyDropHighlight(null);
    return null;
  };

  /** 按指针坐标更新落点槽位（elementFromPoint 命中检测），返回命中的 slot key 或 null */
  const updateDropTarget = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return clearDropTarget();

    // 精确命中：指针真的落在某个字符槽上，直接取该槽
    const slotEl = el.closest<HTMLElement>('[data-slot-key]');
    if (slotEl) {
      const key = slotEl.dataset['slotKey'] ?? null;
      dragOverSlotKey.value = key;
      activeDropLineId.value = slotEl.closest<HTMLElement>('[data-line-index]')?.dataset['lineIndex'] ?? null;
      applyDropHighlight(key);
      return key;
    }

    const zoneEl = el.closest<HTMLElement>('.interactive-score-zone');
    if (!zoneEl) return clearDropTarget();

    const lines = Array.from(zoneEl.querySelectorAll<HTMLElement>('[data-line-index]'));

    // 撑开行：宽容判断——只要指针处在某行的垂直范围内就撑开该行，行内水平位置（字符间隙、
    // 行首行号区、行被 min-w-full 拉伸出的行尾空白）不影响，避免指针一移出字符行状态就闪断
    const hoveredLine = resolveHoverLine(lines, clientY);

    // 落点槽位：精确判断（见 dropGeometry）——还必须落在该行槽位并集的水平容差内，
    // 所以行首/行尾的拉伸空白只撑开行、不给落点边框，落点始终与视觉所见一致。
    // 复用上面已解析出的行，避免重复一遍行矩形读取（指针移动事件上每次都要强制布局）
    const snapped = hoveredLine ? snapToSlotInLine(hoveredLine, clientX) : null;

    dragOverSlotKey.value = snapped?.key ?? null;
    activeDropLineId.value = hoveredLine?.lineId ?? null;
    applyDropHighlight(snapped?.key ?? null);
    return snapped?.key ?? null;
  };

  /** 外部拖拽源专用：按几何就近计算的结果直接设置高亮（绕过 elementFromPoint——
   *  浮动面板 / 抽屉等浮层会干扰命中测试）。
   *  两个参数独立：key 决定落点边框与落地写入，lineId 决定哪一行撑开。
   *  key 为 null 而 lineId 非 null 是正常组合——指针在行内但没有对准任何槽位（行首/行尾空白），
   *  此时只撑开行、不落点，松手不写入 */
  const setExternalDropTarget = (key: string | null, lineId: string | null) => {
    dragOverSlotKey.value = key;
    activeDropLineId.value = lineId;
    applyDropHighlight(key);
  };

  return {
    dragOverSlotKey,
    activeDropLineId,
    markDragSource,
    clearDragClasses,
    updateDropTarget,
    setExternalDropTarget,
  };
}
