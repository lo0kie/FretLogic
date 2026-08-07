import { CANVAS_CONFIG, FRETBOARD_COLORS, FRETBOARD_SCALE_MAP } from '@/constants';
import type { GuitarStringEntity } from '@/types';
import { isMuted, isOpen } from '@/utils/musicTheory';

export const getOpenStringStatusClass = (str: GuitarStringEntity): string => {
  if (isMuted(str)) return 'is-muted-status';
  if (isOpen(str) && !str.isRoot) return 'is-open-status';
  return '';
};

export const getOpenStringStyle = (str: GuitarStringEntity, isDarkMode: boolean) => {
  if (isOpen(str) && str.isRoot) {
    const bg = isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    return {
      backgroundColor: bg,
      borderColor: bg,
      color: isDarkMode ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight,
      boxShadow: 'var(--root-glow)',
    };
  }
  return {};
};

export const getFingerColor = (str: GuitarStringEntity, isDarkMode: boolean): string => {
  if (str.isRoot) return isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  return isDarkMode ? FRETBOARD_COLORS.normalDark : FRETBOARD_COLORS.normalLight;
};

export const getFingerTextColor = (str: GuitarStringEntity, isDarkMode: boolean): string => {
  return str.isRoot && isDarkMode ? FRETBOARD_COLORS.textRootDark : FRETBOARD_COLORS.textRootLight;
};

const placeholderSizeCache = new Map<string, { width: string; height: string }>();

export const getPlaceholderSize = (fretCount: number, customScale = 1.0) => {
  const scaleKey = Math.round(customScale * 1000);
  const cacheKey = `${fretCount}_${scaleKey}`;

  const cached = placeholderSizeCache.get(cacheKey);
  if (cached) return cached;

  const rawHeight = CANVAS_CONFIG.OFFSET_Y_TOP + fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const fretboardScale = (FRETBOARD_SCALE_MAP[fretCount] ?? 1.0) * customScale; // 🌟 去掉内置的 0.28

  const size = {
    width: `${CANVAS_CONFIG.BOARD_WIDTH * fretboardScale}px`,
    height: `${rawHeight * fretboardScale}px`,
  };

  if (placeholderSizeCache.size >= 32) {
    const oldestKey = placeholderSizeCache.keys().next().value;
    if (oldestKey !== undefined) placeholderSizeCache.delete(oldestKey);
  }

  placeholderSizeCache.set(cacheKey, size);
  return size;
};
