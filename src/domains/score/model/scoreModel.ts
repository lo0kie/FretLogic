// ===== 槽位 key 编码：单一真相源，替换散落的 `line_${...}` / `char_${...}` 模板 =====

import { generateUUID, getEditDistance } from '@/platform/utils/common';

import type { LineId, SlotKey, Song, SongId } from '@/domains/score/types';

export type EdgeSlotType = 'start' | 'end';

/** 边和弦（行首/行尾）槽位的存储 key */
export const chordSlotKey = (lineId: string, type: EdgeSlotType, index: number): SlotKey =>
  `line_${lineId}_${type}_${index}` as SlotKey;

/** 字符槽位的存储 key */
export const charKey = (lineId: string, index: number): SlotKey => `line_${lineId}_char_${index}` as SlotKey;

/** 边和弦槽位的前缀，用于整体清除某行某侧的槽位 */
export const edgeSlotPrefix = (lineId: string, type: EdgeSlotType): string => `line_${lineId}_${type}_`;

/** 按序收集某行某侧边和弦槽位中存储的和弦 id（只读，兼容裸 Map） */
export const collectEdgeChordIds = (
  chordMap: ReadonlyMap<string, string>,
  lineId: string,
  type: EdgeSlotType
): string[] => {
  const prefix = `line_${lineId}_${type}_`;
  const entries: { index: number; id: string }[] = [];
  for (const [k, id] of chordMap) {
    if (k.startsWith(prefix)) {
      const idxStr = k.slice(prefix.length);
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && id) {
        entries.push({ index: idx, id });
      }
    }
  }
  entries.sort((a, b) => a.index - b.index);
  return entries.map(e => e.id);
};

// ===== 歌词行 id 匹配与清洗 =====

const SIMILARITY_THRESHOLD = 0.45;
const MAX_SIMILAR_MATCH_LINES = 60;
const createLineId = (): string => 'l_' + generateUUID('', 8);

const matchExactLines = (
  oldLines: string[],
  newLines: string[],
  oldIds: string[]
): { newIds: (string | null)[]; usedOldIndices: Set<number> } => {
  const newIds: (string | null)[] = new Array(newLines.length).fill(null);
  const usedOldIndices = new Set<number>();

  const contentToIndices = new Map<string, number[]>();
  for (let j = 0; j < oldLines.length; j++) {
    const line = oldLines[j] ?? '';
    const list = contentToIndices.get(line);
    if (list) list.push(j);
    else contentToIndices.set(line, [j]);
  }

  const cursors = new Map<string, number>();

  for (let i = 0; i < newLines.length; i++) {
    const content = newLines[i] ?? '';
    const indices = contentToIndices.get(content);
    if (!indices) continue;

    const cursor = cursors.get(content) ?? 0;
    if (cursor < indices.length) {
      const j = indices[cursor]!;
      const oldId = oldIds[j];
      if (oldId !== undefined) {
        newIds[i] = oldId;
        usedOldIndices.add(j);
        cursors.set(content, cursor + 1);
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

    const newLen = newLines[i]?.length ?? 0;
    let bestMatchIdx = -1;
    let minDistance = Infinity;

    for (let j = 0; j < oldLines.length; j++) {
      if (usedOldIndices.has(j)) continue;

      const oldLine = oldLines[j] ?? '';
      const newLine = newLines[i] ?? '';
      const oldLen = oldLine.length;
      const maxLength = Math.max(oldLen, newLen) || 1;

      const lengthDiff = Math.abs(oldLen - newLen);
      const maxPossibleSimilarity = 1 - lengthDiff / maxLength;
      if (maxPossibleSimilarity < SIMILARITY_THRESHOLD) continue;

      const dist = getEditDistance(oldLine, newLine);
      const similarity = 1 - dist / maxLength;

      if (similarity >= SIMILARITY_THRESHOLD && dist < minDistance) {
        minDistance = dist;
        bestMatchIdx = j;
        if (dist === 0) break;
      }
    }

    if (bestMatchIdx !== -1) {
      const oldId = oldIds[bestMatchIdx];
      if (oldId !== undefined) {
        newIds[i] = oldId;
        usedOldIndices.add(bestMatchIdx);
      }
    }
  }
};

const assignNewIds = (newIds: (string | null)[]): string[] => {
  return newIds.map(id => id || createLineId());
};

/** 行 id 匹配（旧歌词行 → 新歌词行），生成的 id 是 LineId 的唯一合法来源 */
export const matchLineIds = (oldLines: string[], newLines: string[], oldLineIds: string[]): LineId[] => {
  const { newIds, usedOldIndices } = matchExactLines(oldLines, newLines, oldLineIds);
  const unmatchedCount = newIds.reduce((count, id) => (id === null ? count + 1 : count), 0);
  if (unmatchedCount <= MAX_SIMILAR_MATCH_LINES) {
    matchSimilarLines(oldLines, newLines, oldLineIds, newIds, usedOldIndices);
  }
  return assignNewIds(newIds) as LineId[];
};

/** 歌词文本清洗：去制表符/回车、全角空格转半角、行首尾去空白（按行处理）。 */
export const sanitizeLyricsText = (lyrics: string): string => {
  return lyrics
    .split('\n')
    .map(line =>
      line
        .replace(/[\r\t]/g, '')
        .replace(/\u3000/g, ' ')
        .trim()
    )
    .join('\n');
};

/** 品牌 id 转换：SongId 品牌化（仅用于持久化边界与工厂函数） */
export const toSongId = (value: string): SongId => value as SongId;

/** 新建乐谱：统一 id 前缀与默认字段 */
export const createSong = (title: string): Song => ({
  id: toSongId('s_' + generateUUID().slice(0, 8)),
  title: title.trim() || '未命名乐谱',
  lyrics: '',
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  lineIds: [],
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/** 乐谱模型不变量只读工具 */
export const SongRecord = {
  id: (song: Song): string => song.id,
  hasLyrics: (song: Song): boolean => song.lyrics.trim().length > 0,
};
