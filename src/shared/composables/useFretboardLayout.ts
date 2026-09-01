import { CANVAS_CONFIG, FRETBOARD_SCALE_MAP } from '@/utils/core/constants';
import { computed, type Ref } from 'vue';

const STRING_X_POSITIONS = Array.from(
  { length: 6 },
  (_, i) => CANVAS_CONFIG.OFFSET_X_LEFT + i * CANVAS_CONFIG.STRING_SPACING
);

/** 指板几何布局：根据品位数/缩放/顶部附加高度推导各尺寸 computed，供 SVG 渲染与坐标换算共用 */
export function useFretboardLayout(
  fretCount: Ref<number>,
  scale: Ref<number>,
  showOpenStrings?: Ref<boolean | undefined>,
  extraTopHeight?: Ref<number>
) {
  const stringXPositions = computed(() => STRING_X_POSITIONS);
  const activeTopOffset = computed(() => (showOpenStrings?.value !== false ? CANVAS_CONFIG.OFFSET_Y_TOP : 16));
  /** 指板 SVG 实际起始位置：和弦名区 + 空弦区 */
  const contentTopOffset = computed(() => (extraTopHeight?.value ?? 0) + activeTopOffset.value);

  const rawHeight = computed(
    () => contentTopOffset.value + fretCount.value * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM
  );
  const fretboardScale = computed(() => (FRETBOARD_SCALE_MAP[fretCount.value] ?? 1.0) * scale.value);
  const realScaledWidth = computed(() => CANVAS_CONFIG.BOARD_WIDTH * fretboardScale.value);
  const realScaledHeight = computed(() => rawHeight.value * fretboardScale.value);

  return {
    stringXPositions,
    activeTopOffset,
    contentTopOffset,
    rawHeight,
    fretboardScale,
    realScaledWidth,
    realScaledHeight,
  };
}
