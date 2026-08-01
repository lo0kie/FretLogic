import { FRETBOARD_COLORS } from '@/constants';
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
