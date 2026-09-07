import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import { plainToChordMap } from '@/domains/score/model/chordSlots';
import { charKey, chordSlotKey, collectEdgeChordIds } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type { SlotKey } from '@/domains/score/types';

// ===== scoreLines: 谱面行数据与缓存 =====

export interface EdgeChordItem {
  slotKey: SlotKey;
  chord: Chord;
}

export interface CharItem {
  char: string;
  slotKey: SlotKey;
}

export interface LineData {
  lineIdx: number;
  lineId: string;
  chars: CharItem[];
  startChords: EdgeChordItem[];
  endChords: EdgeChordItem[];
  nextStartKey: SlotKey;
  nextEndKey: SlotKey;
}

const prevCharsByLineId = new Map<string, { text: string; chars: CharItem[] }>();
const prevEdgeChordsCache = new Map<string, { sig: string; chords: EdgeChordItem[] }>();

/** 读取某行某侧的边和弦（含缓存）：签名含和弦内容，和弦编辑后能正确失效缓存；同时给出下一个可用槽位键。 */
function getEdgeChordsWithNextKey(
  chordMap: Map<string, string>,
  lineId: string,
  type: 'start' | 'end',
  chordsLookupMap: Map<string, Chord>
) {
  const ids = collectEdgeChordIds(chordMap, lineId, type);
  // 签名必须包含和弦内容（指纹 + barres），否则编辑同一 id 的和弦后缓存命中旧对象，乐谱行首/行尾不刷新
  const sig = ids
    .map((id, idx) => {
      const chord = chordsLookupMap.get(id);
      const contentSig = chord ? `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres)}` : '-';
      return `${idx}:${id}:${contentSig}|`;
    })
    .join('');
  const cacheKey = `${lineId}_${type}`;
  const cached = prevEdgeChordsCache.get(cacheKey);
  if (cached && cached.sig === sig) {
    return { chords: cached.chords, nextKey: chordSlotKey(lineId, type, ids.length) };
  }

  const chords: EdgeChordItem[] = [];
  ids.forEach((chordId, idx) => {
    const foundChord = chordsLookupMap.get(chordId);
    if (foundChord) {
      chords.push({ slotKey: chordSlotKey(lineId, type, idx), chord: foundChord });
    }
  });
  prevEdgeChordsCache.set(cacheKey, { sig, chords });
  return { chords, nextKey: chordSlotKey(lineId, type, ids.length) };
}

/** 构建一行歌词的字符槽位序列，行文本未变化时复用缓存。 */
function buildChars(lineId: string, lineText: string): CharItem[] {
  const cached = prevCharsByLineId.get(lineId);
  if (cached && cached.text === lineText) {
    return cached.chars;
  }
  const chars = lineText.split('').map((char, charIdx) => ({
    char,
    slotKey: charKey(lineId, charIdx),
  }));
  prevCharsByLineId.set(lineId, { text: lineText, chars });
  return chars;
}

/** 构建乐谱行数据（歌词字符 + 行首/行尾和弦），并清理已消失行的缓存条目。 */
export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Map<string, string>,
  chordsLookupMap: Map<string, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  // 序列化边界守卫：内存契约要求 chordMap 为 Map；若从持久化/同步链路拿到普通对象，
  // 在此归一化为 Map，避免 collectEdgeChordIds 迭代直接抛错。纯等价转换，不改语义。
  const normalizedChordMap = chordMap instanceof Map ? chordMap : plainToChordMap(chordMap);
  const rawLines = lyrics.split('\n');
  const activeIds = new Set<string>();
  const result = rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);
    activeIds.add(lineId);
    const { chords: startChords, nextKey: nextStartKey } = getEdgeChordsWithNextKey(
      normalizedChordMap,
      lineId,
      'start',
      chordsLookupMap
    );
    const { chords: endChords, nextKey: nextEndKey } = getEdgeChordsWithNextKey(
      normalizedChordMap,
      lineId,
      'end',
      chordsLookupMap
    );
    return {
      lineIdx,
      lineId,
      chars: buildChars(lineId, lineText),
      startChords,
      endChords,
      nextStartKey,
      nextEndKey,
    };
  });
  for (const id of prevCharsByLineId.keys()) {
    if (!activeIds.has(id)) {
      prevCharsByLineId.delete(id);
      prevEdgeChordsCache.delete(`${id}_start`);
      prevEdgeChordsCache.delete(`${id}_end`);
    }
  }
  return result;
}

/** 清空歌词行字符与边和弦的全部缓存（和弦库整体替换等场景调用）。 */
export function clearLyricsLineCharsCache() {
  prevCharsByLineId.clear();
  prevEdgeChordsCache.clear();
}

// 通用 Canvas / 下载工具已下沉平台层单一来源；此处保留转发以兼容既有导入路径（score 内部消费方）。
export { buildExportFileName, canvasToBlob, triggerBlobDownload, wait } from '@/platform/utils/canvas';

export { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
