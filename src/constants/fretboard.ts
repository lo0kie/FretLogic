export const INTERACTION_CONFIG = {
  MUTING_COOL_DOWN: 200,
  WHEEL_THRESHOLD: 40,
  MAX_CAPO_LIMIT: 12,
  MIN_CAPO_LIMIT: 0,
} as const;

export const FRETBOARD_SCALE_MAP: Record<number, number> = {
  3: 1.0,
  4: 0.92,
  5: 0.85,
} as const;

export const FRETBOARD_LINE_WIDTH = 5;

const STRING_SPACING = 64;
const OFFSET_X = 45;
const OFFSET_X_RIGHT = 31;
const FRET_HEIGHT = 120;
const OFFSET_Y_TOP = 80;
const OFFSET_Y_BOTTOM = 20;

export const CANVAS_CONFIG = {
  STRING_SPACING,
  FRET_HEIGHT,
  OFFSET_X,
  OFFSET_Y_TOP,
  OFFSET_Y_BOTTOM,
  BOARD_WIDTH: OFFSET_X + 5 * STRING_SPACING + OFFSET_X_RIGHT,
} as const;

export const FRET_COUNTS = [3, 4, 5] as const;
