// 🌟 分别定义升号和降号的 12 平均律音名字典
export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const BASE_STRINGS = [40, 45, 50, 55, 59, 64];

// 🌟 接收一个额外的 preferFlat 参数，智能输出对应的等音名
export const calcNoteLabel = (sIdx: number, fretVal: number, capoVal: number, preferFlat: boolean = false): string => {
  if (fretVal === -1) return '✕';
  const base = BASE_STRINGS[sIdx];
  const actualOffset = fretVal > 0 && capoVal > 0 ? capoVal : 0;

  const noteIndex = (base + fretVal + actualOffset) % 12;
  return preferFlat ? NOTES_FLAT[noteIndex] : NOTES_SHARP[noteIndex];
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
