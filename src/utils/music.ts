/**
 * 吉他音乐理论核心工具函数
 */

// 标准 12 平均律音名
export const NOTES: string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// 弦基准音映射：6弦(E)-1弦(E)[cite: 1]
export const BASES_MAP: number[] = [4, 9, 2, 7, 11, 4];

/**
 * 计算特定弦出品位的音名
 * @param sIdx 弦索引 (0-5)
 * @param fret 品位 (-1为X，0为空弦)
 * @param capo 变调夹位置
 */
export const getNoteLabel = (sIdx: number, fret: number, capo: number = 0): string => {
  if (fret === -1) return '✕';

  // 逻辑：变调夹会抬高基础音高[cite: 1]
  const offset = capo > 0 ? capo - 1 : 0;
  const noteIndex = (BASES_MAP[sIdx] + fret + offset) % 12;
  return NOTES[noteIndex];
};

/**
 * 判断当前按位是否为根音
 * @param sIdx 弦索引
 * @param fret 品位
 * @param capo 变调夹位置
 * @param chordName 当前和弦名称
 */
export const checkIfRootNote = (sIdx: number, fret: number, capo: number, chordName: string): boolean => {
  if (!chordName) return false;

  // 匹配和弦开头的字母（如从 "F#m7" 中提取 "F#"）[cite: 1]
  const rootMatch = chordName.match(/^[A-G][#b]?/);
  if (!rootMatch) return false;

  const currentNote = getNoteLabel(sIdx, fret, capo);
  return currentNote.toUpperCase() === rootMatch[0].toUpperCase();
};

/**
 * 获取指板 X 轴 SVG 坐标[cite: 1]
 * @param sIdx 弦索引 (0-5)
 */
export const getStrX = (sIdx: number): number => {
  const OFFSET_X = 38;
  const STR_SPACING = 76;
  return OFFSET_X + sIdx * STR_SPACING;
};
