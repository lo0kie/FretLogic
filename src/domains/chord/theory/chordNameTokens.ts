/**
 * 和弦名分片 Token 解析（纯函数，无缓存）。
 *
 * fretboard-canvas-renderer 与 scoreExportWorker 此前各写了一份逐字相同的实现（连
 * ChordNameToken 接口都声明了两遍）。这里收敛为单一模块；需要缓存的调用方
 * （如导出 worker 的整曲场景）自行包一层 Map 缓存即可。
 */

export interface ChordNameToken {
  text: string;
  isAccidental: boolean;
}

/** 将和弦名称解析为带有升降号标记的 Token 序列，统一将 # / b 规整为标准 ♯ / ♭ 符号并上标 */
export function parseChordNameTokens(chordName: string): ChordNameToken[] {
  if (!chordName) return [];
  const tokens: ChordNameToken[] = [];
  const parts = chordName.split(/([#b♯♭])/g);
  for (const part of parts) {
    if (!part) continue;
    if (part === '#' || part === '♯') {
      tokens.push({ text: '♯', isAccidental: true });
    } else if (part === 'b' || part === '♭') {
      tokens.push({ text: '♭', isAccidental: true });
    } else {
      tokens.push({ text: part, isAccidental: false });
    }
  }
  return tokens;
}
