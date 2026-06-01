import { CANVAS_CONFIG } from '@/constants';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useEventListener } from '@vueuse/core';
import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useFretboardInteraction(fretBoardRef: Ref<HTMLDivElement | null>) {
  const chordLabStore = useChordLabStore();

  let lastCancelTime = 0;
  const MUTING_COOL_DOWN = 200;
  let lastSIdx = -1;
  let lastFIdx = -1;
  let cachedBoardRect: DOMRect | null = null;
  let wheelAccumulator = 0;
  const WHEEL_THRESHOLD = 40;

  /**
   * 🌟 1. 空弦与静音逻辑重构
   */
  const handleLocalToggleOpenString = (sIdx: number) => {
    chordLabStore.toggleOpenString(sIdx);
  };

  /**
   * 🌟 2. 顶壳空弦区右键：设为根音
   */
  const handleOpenStringRightClick = (sIdx: number) => {
    const str = chordLabStore.strings[sIdx];
    if (str.isRoot && str.fret === 0) {
      str.isRoot = false;
    } else {
      // 根音在全指板具有唯一性，先清空其他弦的根音标记
      chordLabStore.strings.forEach(s => {
        s.isRoot = false;
      });
      str.fret = 0;
      str.isRoot = true;
    }
  };

  /**
   * 🌟 3. 指板按音触点右键：设为/取消根音
   */
  const handleFretRightClick = (sIdx: number) => {
    const str = chordLabStore.strings[sIdx];
    if (str.fret < 0) return; // 哑音状态无法设为根音
    const wasRoot = str.isRoot;
    chordLabStore.strings.forEach(s => {
      s.isRoot = false;
    });
    str.isRoot = !wasRoot;
  };

  /**
   * 🌟 4. 鼠标中键：切换当前弦的升降号显示偏好 (# / b)
   */
  const handleFretMiddleClick = (sIdx: number) => {
    const str = chordLabStore.strings[sIdx];
    if (str.fret === -1) return;

    const base = chordLabStore.activeBaseStrings[sIdx];
    const actualOffset = str.fret > 0 && chordLabStore.capo > 0 ? chordLabStore.capo : 0;
    const noteIndex = (base + str.fret + actualOffset) % 12;

    // 只有黑键（变音/临时记号）才允许切换变音偏好
    const isAccidental = [1, 3, 6, 8, 10].includes(noteIndex);
    if (isAccidental) {
      str.preferFlat = !str.preferFlat;
    }
  };

  /**
   * 🌟 5. 独立右键菜单拦截与品位解析
   */
  const handleCanvasRightClick = (e: MouseEvent) => {
    if (!fretBoardRef.value) return;
    const board = fretBoardRef.value.getBoundingClientRect();
    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY =
      board.height /
      (CANVAS_CONFIG.OFFSET_Y_TOP +
        chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
        CANVAS_CONFIG.OFFSET_Y_BOTTOM);
    const canvasX = (e.clientX - board.left) / scaleX;
    const canvasY = (e.clientY - board.top) / scaleY;

    const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
    const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
    const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

    if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
      const str = chordLabStore.strings[sIdx];
      if (str.fret === fIdx) {
        handleFretRightClick(sIdx);
        return;
      }
      chordLabStore.strings.forEach(s => {
        s.isRoot = false;
      });
      str.fret = fIdx;
      str.isRoot = true;
    }
  };

  /**
   * 🌟 6. 核心高性能高内聚物理点击与滑动划线（Strum）逻辑
   */
  const handleFingerClickLogic = (clientX: number, clientY: number, isMoveEvent = false) => {
    const board = cachedBoardRect || (fretBoardRef.value ? fretBoardRef.value.getBoundingClientRect() : null);
    if (!board) return;

    const scaleX = board.width / CANVAS_CONFIG.BOARD_WIDTH;
    const scaleY =
      board.height /
      (CANVAS_CONFIG.OFFSET_Y_TOP +
        chordLabStore.fretCount * CANVAS_CONFIG.FRET_HEIGHT +
        CANVAS_CONFIG.OFFSET_Y_BOTTOM);
    const canvasX = (clientX - board.left) / scaleX;
    const canvasY = (clientY - board.top) / scaleY;

    const sIdx = Math.round((canvasX - CANVAS_CONFIG.OFFSET_X) / CANVAS_CONFIG.STRING_SPACING);
    const fretAreaY = canvasY - CANVAS_CONFIG.OFFSET_Y_TOP;
    const fIdx = fretAreaY > 0 ? Math.floor(fretAreaY / CANVAS_CONFIG.FRET_HEIGHT) + 1 : 0;

    if (sIdx >= 0 && sIdx <= 5 && fIdx >= 1 && fIdx <= chordLabStore.fretCount) {
      if (isMoveEvent && lastSIdx === sIdx && lastFIdx === fIdx) return;

      const str = chordLabStore.strings[sIdx];
      const isSameFret = str.fret === fIdx;

      if (isSameFret) {
        // 如果点在同一个品位上，触发物理消音，设为哑音（-1）
        str.fret = -1;
        str.isRoot = false;
        lastSIdx = -1;
        lastFIdx = -1;
        lastCancelTime = Date.now();
      } else {
        // 滑动切音防抖隔离
        if (isMoveEvent && Date.now() - lastCancelTime < MUTING_COOL_DOWN) {
          lastSIdx = -1;
          lastFIdx = -1;
          return;
        }
        str.fret = fIdx;

        // 极致体验：如果当前整个指板一个根音都没有，自动将新按下的点设为临时根音反馈试听
        if (!chordLabStore.strings.some(s => s.isRoot)) {
          str.isRoot = true;
        }

        lastSIdx = sIdx;
        lastFIdx = fIdx;
      }
    }
  };

  let ticking = false;
  let rAF_ID = 0;

  const handlePointerMove = (e: PointerEvent) => {
    if (!chordLabStore.isDraggingFinger || ticking) return;
    ticking = true;
    rAF_ID = requestAnimationFrame(() => {
      handleFingerClickLogic(e.clientX, e.clientY, true);
      ticking = false;
    });
  };

  const handlePointerUp = () => {
    chordLabStore.isDraggingFinger = false;
    lastSIdx = -1;
    lastFIdx = -1;
    cachedBoardRect = null;
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    ticking = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return; // 只响应鼠标左键或单指物理触控
    if (fretBoardRef.value) cachedBoardRect = fretBoardRef.value.getBoundingClientRect();
    chordLabStore.isDraggingFinger = true;
    lastSIdx = -1;
    lastFIdx = -1;
    handleFingerClickLogic(e.clientX, e.clientY, false);
    useEventListener('pointermove', handlePointerMove);
    useEventListener('pointerup', handlePointerUp);
  };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    wheelAccumulator += e.deltaY;
    if (Math.abs(wheelAccumulator) < WHEEL_THRESHOLD) return;
    if (wheelAccumulator > 0) chordLabStore.capo = chordLabStore.capo >= 12 ? 0 : chordLabStore.capo + 1;
    else chordLabStore.capo = chordLabStore.capo <= 0 ? 12 : chordLabStore.capo - 1;
    wheelAccumulator = 0;
  };

  onMounted(() => {
    if (fretBoardRef.value) {
      useEventListener(fretBoardRef, 'pointerdown', handlePointerDown);
      useEventListener(fretBoardRef, 'wheel', handleWheel, { passive: false });
    }
  });

  onBeforeUnmount(() => {
    if (rAF_ID) cancelAnimationFrame(rAF_ID);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  });

  return {
    handleLocalToggleOpenString,
    handleOpenStringRightClick,
    handleFretRightClick,
    handleCanvasRightClick,
    handleFretMiddleClick,
  };
}
