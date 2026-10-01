/**
 * 歌词拖拽落点解析：维护「当前落点槽位 / 当前悬停行 / 拖拽源槽位」三个状态，供宿主按它们重绘行 canvas。
 *
 * ⚠️ 排列区 canvas 化后本模块**不再碰任何 DOM**：既没有逐槽元素可挂 `data-slot-key`，
 * 也就没有 `is-dragging-source` 这类类名可加 —— 拖拽源改由 `onDragSourceChange` 回调把键交给宿主，
 * 由宿主作为绘制状态使用。落点解析同理：`elementFromPoint` 换成宿主注入的几何解析（见 dropGeometry）。
 *
 * 落地动作由槽位是否已占用和弦决定，与指针在槽内的位置无关。
 */
import { ref } from 'vue';

/** 宿主注入的两件事：落点怎么解析、拖拽源怎么表达 */
export interface DragHighlightHost {
  /**
   * 按指针位置解析落点（几何命中）。
   *
   * `slotKey` 为 null 而 `lineId` 非 null 是正常组合 —— 指针在行内但没有对准任何槽位
   * （行首 / 行尾的拉伸空白），此时只算作落点行、不给落点边框。
   */
  resolveDropTarget: (clientX: number, clientY: number) => { slotKey: string | null; lineId: string | null };
  /** 拖拽源槽位变化（置 null 表示本次会话结束 / 复位） */
  onDragSourceChange: (slotKey: string | null) => void;
}

/** 拖拽落点解析：落点 / 悬停行状态，以及拖拽源槽位的状态标记 */
export function useDragHighlight(host: DragHighlightHost) {
  const dragOverSlotKey = ref<string | null>(null);
  /** 当前悬停的歌词行 ID（只要指针在行内，跨越字符间隙时保持恒定，避免行状态高频抖动闪烁） */
  const activeDropLineId = ref<string | null>(null);
  let sourceKey: string | null = null;

  /** 标记拖拽源槽位：语义唯一为「移动」，视觉上把源槽整体淡化（由宿主绘制时读这个键） */
  const markDragSource = (key: string) => {
    sourceKey = key;
    host.onDragSourceChange(key);
  };

  /** 清除全部拖拽相关高亮与状态 */
  const clearDragClasses = () => {
    if (sourceKey !== null) {
      host.onDragSourceChange(null);
      sourceKey = null;
    }
    dragOverSlotKey.value = null;
    activeDropLineId.value = null;
  };

  /** 落点清空（指针离开谱面区 / 浮层之上 / 落在取消区上）：槽位与行的高亮一起清空 */
  const clearDropTarget = (): null => {
    dragOverSlotKey.value = null;
    activeDropLineId.value = null;
    return null;
  };

  /** 按指针坐标更新落点（几何命中交给宿主），返回命中的 slot key 或 null */
  const updateDropTarget = (clientX: number, clientY: number): string | null => {
    const target = host.resolveDropTarget(clientX, clientY);
    dragOverSlotKey.value = target.slotKey;
    activeDropLineId.value = target.lineId;
    return target.slotKey;
  };

  return {
    dragOverSlotKey,
    activeDropLineId,
    markDragSource,
    clearDragClasses,
    clearDropTarget,
    updateDropTarget,
  };
}
