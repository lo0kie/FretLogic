/**
 * @Author likan
 * @Date 2026-05-25 10:52:28
 * @Filepath guitar-chord-lab\src\utils\musicTheory.ts
 */

// --- 乐理静态常量 ---
export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const BASE_STRINGS = [4, 9, 2, 7, 11, 4]; // 1-6弦空弦音程基准 (E, B, G, D, A, E)

/**
 * 根据物理弦号和品位推算绝对音名标签
 */
export const calcNoteLabel = (sIdx: number, fretVal: number, capoVal: number): string => {
  if (fretVal === -1) return '✕';
  const base = BASE_STRINGS[sIdx];
  const offset = capoVal > 0 ? capoVal : 0;
  return NOTES[(base + fretVal + offset) % 12];
};

/**
 * 提取当前和弦的主根音名 (如 Cmaj7 -> C, F#m7 -> F#)
 */
export const extractRootNote = (chordName: string): string | null => {
  const match = chordName.trim().match(/^[A-G][#b]?/);
  return match ? match[0].toUpperCase() : null;
};

/**
 * 校验特定指位是否为当前和弦的根音
 */
export const isRootNote = (sIdx: number, fretVal: number, capoVal: number, chordName: string): boolean => {
  const currentRoot = extractRootNote(chordName);
  if (!currentRoot) return false;
  return calcNoteLabel(sIdx, fretVal, capoVal).toUpperCase() === currentRoot;
};
