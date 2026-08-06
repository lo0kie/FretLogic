import { generateUUID } from './id';
import { getEditDistance } from './stringDistance';

const SIMILARITY_THRESHOLD = 0.45;
const createLineId = (): string => 'l_' + generateUUID('', 8);

const matchExactLines = (
  oldLines: string[],
  newLines: string[],
  oldIds: string[]
): { newIds: (string | null)[]; usedOldIndices: Set<number> } => {
  const newIds: Array<string | null> = new Array(newLines.length).fill(null);
  const usedOldIndices = new Set<number>();

  for (let i = 0; i < newLines.length; i++) {
    for (let j = 0; j < oldLines.length; j++) {
      if (!usedOldIndices.has(j) && newIds[i] === null && oldLines[j] === newLines[i]) {
        newIds[i] = oldIds[j];
        usedOldIndices.add(j);
        break;
      }
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

    let bestMatchIdx = -1;
    let minDistance = Infinity;

    for (let j = 0; j < oldLines.length; j++) {
      if (usedOldIndices.has(j)) continue;

      const dist = getEditDistance(oldLines[j], newLines[i]);
      const maxLength = Math.max(oldLines[j].length, newLines[i].length);
      const similarity = 1 - dist / (maxLength || 1);

      if (similarity >= SIMILARITY_THRESHOLD && dist < minDistance) {
        minDistance = dist;
        bestMatchIdx = j;
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
  matchSimilarLines(oldLines, newLines, oldLineIds, newIds, usedOldIndices);
  return assignNewIds(newIds);
};
