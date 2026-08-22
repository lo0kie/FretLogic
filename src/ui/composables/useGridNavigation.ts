import { type ComponentPublicInstance, type Ref } from 'vue';

interface GridNavigationOptions {
  /** 限定收集可聚焦元素的选择器 */
  selector?: string;
  /** 处理完按键后是否阻止事件继续冒泡 */
  stop?: boolean;
}

type LengthGetter = () => number;
type ContainerArg = Ref<HTMLElement | null> | LengthGetter | undefined;

interface Entry {
  el: HTMLElement;
  eligible: boolean;
}

const DEFAULT_SELECTOR = '[data-focusable-inline], [tabindex="0"], button, input, select, textarea, a[href]';

const isEligible = (el: HTMLElement): boolean => {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.offsetParent === null) return false; // 排除隐藏节点
  if (el.closest('[inert]')) return false; // 排除折叠/inert区域
  return true;
};

export function useGridNavigation(
  cols?: number,
  containerOrLength?: ContainerArg,
  options: GridNavigationOptions = {}
) {
  const { selector = DEFAULT_SELECTOR, stop = false } = options;
  const isLengthMode = typeof containerOrLength === 'function';
  const itemRefs = new Map<number, HTMLElement>();

  const setItemRef = (el: Element | ComponentPublicInstance | null, index: number) => {
    if (!el) {
      itemRefs.delete(index);
      return;
    }
    const domEl = ('$el' in (el as ComponentPublicInstance) ? (el as ComponentPublicInstance).$el : el) as unknown;
    if (domEl instanceof HTMLElement) {
      itemRefs.set(index, domEl);
    } else {
      itemRefs.delete(index);
    }
  };

  const getEntries = (): Entry[] => {
    if (isLengthMode) {
      const length = (containerOrLength as LengthGetter)();
      const entries: Entry[] = [];
      for (let i = 0; i < length; i++) {
        const el = itemRefs.get(i);
        if (!el) continue;
        entries.push({ el, eligible: isEligible(el) });
      }
      return entries;
    }
    const containerRef = containerOrLength as Ref<HTMLElement | null> | undefined;
    if (!containerRef?.value) return [];
    return Array.from(containerRef.value.querySelectorAll<HTMLElement>(selector)).map(el => ({
      el,
      eligible: isEligible(el),
    }));
  };

  /** 基于真实视觉几何坐标计算上下行最近的节点（解决不规则/Flex布局跳节点问题） */
  const getSpatialNextIndex = (currentIndex: number, direction: 'up' | 'down', entries: Entry[]): number => {
    const currentEntry = entries[currentIndex];
    if (!currentEntry) return currentIndex;
    const currentRect = currentEntry.el.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;

    let bestIndex = currentIndex;
    let minDistance = Infinity;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry || i === currentIndex || !entry.eligible) continue;
      const rect = entry.el.getBoundingClientRect();

      // 判断是否在目标方向的行上
      const isTargetDirection =
        direction === 'down'
          ? rect.top >= currentRect.bottom - 4 // 下方
          : rect.bottom <= currentRect.top + 4; // 上方

      if (isTargetDirection) {
        const candidateCenterX = rect.left + rect.width / 2;
        const distY = Math.abs(direction === 'down' ? rect.top - currentRect.bottom : currentRect.top - rect.bottom);
        const distX = Math.abs(candidateCenterX - currentCenterX);

        // 加权计算：优先匹配距离最近的行，其次匹配水平中心点最贴近的元素
        const score = distY * 2.5 + distX;

        if (score < minDistance) {
          minDistance = score;
          bestIndex = i;
        }
      }
    }
    return bestIndex;
  };

  const handleKeydown = (e: KeyboardEvent) => {
    const isNavKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key);
    if (!isNavKey) return;

    const entries = getEntries();
    const total = entries.length;
    if (total === 0) return;

    const activeEl = document.activeElement as HTMLElement;
    let currentIndex = entries.findIndex(entry => entry.el === activeEl);

    if (currentIndex === -1 && !isLengthMode) {
      const matchedAncestor = activeEl?.closest(selector) as HTMLElement | null;
      if (matchedAncestor) currentIndex = entries.findIndex(entry => entry.el === matchedAncestor);
    }
    if (currentIndex === -1) return;

    e.preventDefault();
    if (stop) e.stopPropagation();

    let nextIndex = currentIndex;

    switch (e.key) {
      // 1. 左右全列表线性穿梭（不再限制在行内，平滑跨行）
      case 'ArrowLeft': {
        for (let idx = currentIndex - 1; idx >= 0; idx--) {
          if (entries[idx]?.eligible) {
            nextIndex = idx;
            break;
          }
        }
        break;
      }

      case 'ArrowRight': {
        for (let idx = currentIndex + 1; idx < total; idx++) {
          if (entries[idx]?.eligible) {
            nextIndex = idx;
            break;
          }
        }
        break;
      }

      // 2. 上下导航：单列直接线性取相邻项（避免空间扫描的 O(n) 布局读取）；
      //    多列优先固定列距，退化为真实视觉空间寻找最近节点
      case 'ArrowUp': {
        if (cols === 1) {
          for (let idx = currentIndex - 1; idx >= 0; idx--) {
            if (entries[idx]?.eligible) {
              nextIndex = idx;
              break;
            }
          }
          break;
        }
        if (cols && cols > 1) {
          const targetIdx = currentIndex - cols;
          if (targetIdx >= 0 && entries[targetIdx]?.eligible) {
            nextIndex = targetIdx;
            break;
          }
        }
        nextIndex = getSpatialNextIndex(currentIndex, 'up', entries);
        break;
      }

      case 'ArrowDown': {
        if (cols === 1) {
          for (let idx = currentIndex + 1; idx < total; idx++) {
            if (entries[idx]?.eligible) {
              nextIndex = idx;
              break;
            }
          }
          break;
        }
        if (cols && cols > 1) {
          const targetIdx = currentIndex + cols;
          if (targetIdx < total && entries[targetIdx]?.eligible) {
            nextIndex = targetIdx;
            break;
          }
        }
        nextIndex = getSpatialNextIndex(currentIndex, 'down', entries);
        break;
      }

      case 'Home': {
        for (let idx = 0; idx < total; idx++) {
          if (entries[idx]?.eligible) {
            nextIndex = idx;
            break;
          }
        }
        break;
      }

      case 'End': {
        for (let idx = total - 1; idx >= 0; idx--) {
          if (entries[idx]?.eligible) {
            nextIndex = idx;
            break;
          }
        }
        break;
      }
    }

    entries[nextIndex]?.el.focus();
  };

  return {
    setItemRef,
    handleKeydown,
  };
}
