export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 🌟 优化：使用真实的 MIDI 物理音高编号 (6弦 40 到 1弦 64)
export const BASE_STRINGS = [40, 45, 50, 55, 59, 64];

export const calcNoteLabel = (sIdx: number, fretVal: number, capoVal: number): string => {
  if (fretVal === -1) return '✕';
  const base = BASE_STRINGS[sIdx];
  const offset = capoVal > 0 ? capoVal : 0;

  // 因为 40 % 12 === 4 (E), 45 % 12 === 9 (A)... 所以取余逻辑完美兼容物理音高！
  return NOTES[(base + fretVal + offset) % 12];
};

export const extractRootNote = (chordName: string): string | null => {
  const trimmed = chordName.trim();
  if (trimmed.length === 0) return null;

  const slashParts = trimmed.split('/');
  const targetPart = slashParts.length > 1 ? slashParts[1] : slashParts[0];

  const firstChar = targetPart.charAt(0).toUpperCase();
  if (firstChar < 'A' || firstChar > 'G') return null;

  if (targetPart.length > 1) {
    const secondChar = targetPart.charAt(1);
    if (secondChar === '#' || secondChar === 'b') {
      return firstChar + secondChar;
    }
  }

  return firstChar;
};

export const isRootNote = (sIdx: number, rootMark: number | null | undefined): boolean => {
  if (rootMark == null) return false;
  return sIdx === rootMark;
};
