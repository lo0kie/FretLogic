import { generateUUID } from './id';
import { getEditDistance } from './stringDistance';

const SIMILARITY_THRESHOLD = 0.45;
// 未匹配行数超过该值时（整段替换/大粘贴），逐对编辑距离的成本失控，直接分配新 id
const MAX_SIMILAR_MATCH_LINES = 60;
const createLineId = (): string => 'l_' + generateUUID('', 8);

const matchExactLines = (
  oldLines: string[],
  newLines: string[],
  oldIds: string[]
): { newIds: (string | null)[]; usedOldIndices: Set<number> } => {
  const newIds: Array<string | null> = new Array(newLines.length).fill(null);
  const usedOldIndices = new Set<number>();

  // 1. 按内容分组，记录每种内容对应的旧行下标（保持原有升序）
  const contentToIndices = new Map<string, number[]>();
  for (let j = 0; j < oldLines.length; j++) {
    const list = contentToIndices.get(oldLines[j]);
    if (list) list.push(j);
    else contentToIndices.set(oldLines[j], [j]);
  }

  // 2. 每种内容各自维护一个"消费到第几个了"的游标
  const cursors = new Map<string, number>();

  for (let i = 0; i < newLines.length; i++) {
    const content = newLines[i];
    const indices = contentToIndices.get(content);
    if (!indices) continue; // 旧行里压根没有这个内容，跳过

    const cursor = cursors.get(content) ?? 0;
    if (cursor < indices.length) {
      const j = indices[cursor];
      newIds[i] = oldIds[j];
      usedOldIndices.add(j);
      cursors.set(content, cursor + 1);
    }
  }

  return { newIds, usedOldIndices };
};

const matchSimilarLines = (
  oldLines: string[],
  newLines: string[],
  oldIds: string[],
  newIds: (string | null)[],
  usedOldIndices: Set<number>
): void => {
  for (let i = 0; i < newLines.length; i++) {
    if (newIds[i] !== null) continue;

    const newLen = newLines[i].length;
    let bestMatchIdx = -1;
    let minDistance = Infinity;

    for (let j = 0; j < oldLines.length; j++) {
      if (usedOldIndices.has(j)) continue;

      const oldLen = oldLines[j].length;
      const maxLength = Math.max(oldLen, newLen) || 1;

      // 不用真的去算这一对昂贵的编辑距离
      const lengthDiff = Math.abs(oldLen - newLen);
      const maxPossibleSimilarity = 1 - lengthDiff / maxLength;
      if (maxPossibleSimilarity < SIMILARITY_THRESHOLD) continue;

      const dist = getEditDistance(oldLines[j], newLines[i]);
      const similarity = 1 - dist / maxLength;

      if (similarity >= SIMILARITY_THRESHOLD && dist < minDistance) {
        minDistance = dist;
        bestMatchIdx = j;
        if (dist === 0) break; // 已经是最好情况，不会有更小的距离了，提前退出内层循环
      }
    }

    if (bestMatchIdx !== -1) {
      newIds[i] = oldIds[bestMatchIdx];
      usedOldIndices.add(bestMatchIdx);
    }
  }
};

const assignNewIds = (newIds: (string | null)[]): string[] => {
  return newIds.map(id => id || createLineId());
};

export const matchLineIds = (oldLines: string[], newLines: string[], oldLineIds: string[]): string[] => {
  const { newIds, usedOldIndices } = matchExactLines(oldLines, newLines, oldLineIds);
  const unmatchedCount = newIds.reduce((count, id) => (id === null ? count + 1 : count), 0);
  if (unmatchedCount <= MAX_SIMILAR_MATCH_LINES) {
    matchSimilarLines(oldLines, newLines, oldLineIds, newIds, usedOldIndices);
  }
  return assignNewIds(newIds);
};
