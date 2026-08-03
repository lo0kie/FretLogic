import { parseSlotKey } from '@/stores/songStore';
import { Chord } from '@/types';
import { getEditDistance } from '@/utils/dataParser';
import { generateUUID } from './validators';

const SIMILARITY_THRESHOLD = 0.45;

const createLineId = (): string => 'l_' + generateUUID('', 8);

export const sanitizeLyricsText = (lyrics: string): string => {
  return lyrics
    .split('\n')
    .map(line => line.replace(/[\t\r\u3000]+/g, '').trimEnd())
    .join('\n');
};

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

export const garbageCollectChordMap = (
  chordMap: Record<string, Chord>,
  finalLineIds: string[]
): { map: Record<string, Chord>; changed: boolean } => {
  const finalIdsSet = new Set(finalLineIds);
  const updatedMap = { ...chordMap };
  let changed = false;

  Object.keys(updatedMap).forEach(key => {
    const parsed = parseSlotKey(key);
    if (parsed && !finalIdsSet.has(parsed.lineId)) {
      delete updatedMap[key];
      changed = true;
    }
  });

  return { map: updatedMap, changed };
};
