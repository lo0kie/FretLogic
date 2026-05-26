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
 * 🌟 终极优化：抛弃低效正则，采用原生纯字符扫描指针打捞根音
 * 杜绝了高频打字时在内存中成千上万产生的 Match 临时数组
 */
export const extractRootNote = (chordName: string): string | null => {
  const trimmed = chordName.trim();
  if (trimmed.length === 0) return null;

  // 1. 抓取首字母指针
  const firstChar = trimmed.charAt(0).toUpperCase();
  // 吉他根音法定界限只能在 A 到 G 之间
  if (firstChar < 'A' || firstChar > 'G') return null;

  // 2. 顺位前向扫描第二位：探查变音标记 (# 或 b)
  if (trimmed.length > 1) {
    const secondChar = trimmed.charAt(1);
    if (secondChar === '#' || secondChar === 'b') {
      return firstChar + secondChar; // 返回完整升降根音资产
    }
  }

  return firstChar;
};

/**
 * 校验特定指位是否为当前和弦的手动主音
 */
export const isRootNote = (sIdx: number, rootMark: number | null | undefined): boolean => {
  if (rootMark == null) return false;
  return sIdx === rootMark;
};
