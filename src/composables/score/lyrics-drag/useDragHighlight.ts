/**
 * 歌词拖拽高亮：管理拖拽源/落点槽位的 DOM class 高亮（is-drop-target / is-drag-source），
 * 以及落点分区（上下两块，对应不同落地动作）判定。
 */
import { ref } from 'vue';
import { resolveDropZone, type DropZone } from './dropZone';

export function useDragHighlight() {
  const dragOverSlotKey = ref<string | null>(null);
  /** 当前落点分区（仅当悬停在有效目标槽位上时有值） */
  const dropZone = ref<DropZone | null>(null);
  let currentDropKey: string | null = null;
  let sourceKey: string | null = null;
  let sourceClass: string | null = null;

  const findSlotEls = (key: string) => document.querySelectorAll<HTMLElement>(`[data-slot-key="${CSS.escape(key)}"]`);

  const applyDropHighlight = (key: string | null) => {
    if (key === currentDropKey) return;
    if (currentDropKey !== null) {
      findSlotEls(currentDropKey).forEach(el => el.classList.remove('is-drop-target'));
    }
    currentDropKey = key;
    if (key !== null) {
      findSlotEls(key).forEach(el => el.classList.add('is-drop-target'));
    }
  };

  /** 标记拖拽源槽位：className 由调用方按拖拽模式选择（换位虚化 / 复制仅描边） */
  const markDragSource = (key: string, className: string) => {
    sourceKey = key;
    sourceClass = className;
    findSlotEls(key).forEach(el => el.classList.add(className));
  };

  const clearDragClasses = () => {
    applyDropHighlight(null);
    if (sourceKey !== null && sourceClass !== null) {
      findSlotEls(sourceKey).forEach(el => el.classList.remove(sourceClass!));
      sourceKey = null;
      sourceClass = null;
    }
    dragOverSlotKey.value = null;
    dropZone.value = null;
  };

  const updateDropTarget = (clientX: number, clientY: number): string | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) {
      dragOverSlotKey.value = null;
      dropZone.value = null;
      applyDropHighlight(null);
      return null;
    }

    const slotEl = el.closest('[data-slot-key]');
    if (slotEl instanceof HTMLElement) {
      const key = slotEl.dataset['slotKey'] ?? null;
      dragOverSlotKey.value = key;
      // 槽位切换时清空迟滞记忆（prevZone 传 null），避免相邻槽位间 2px 迟滞带互相污染
      dropZone.value = key
        ? resolveDropZone(slotEl.getBoundingClientRect(), clientY, key === currentDropKey ? dropZone.value : null)
        : null;
      applyDropHighlight(key);
      return key;
    }

    // 落点判定严格限制在指针命中的槽位自身，不做行首/行尾的推测吸附

    dragOverSlotKey.value = null;
    dropZone.value = null;
    applyDropHighlight(null);
    return null;
  };

  return {
    dragOverSlotKey,
    dropZone,
    markDragSource,
    clearDragClasses,
    updateDropTarget,
  };
}
