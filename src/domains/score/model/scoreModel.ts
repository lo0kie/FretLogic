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

/** 边和弦索引：一次性把「行 + 侧 → 有序和弦 id」聚好，避免逐行逐侧回头看整张表 */
export interface EdgeChordIndex {
  /** 取某行某侧的有序和弦 id（无绑定返回空数组） */
  get(lineId: string, type: EdgeSlotType): string[];
}

const EMPTY_CHORD_IDS: string[] = [];

/** 边槽位 key 的形态：line_<lineId>_<start|end>_<index>。
 *  lineId 自身可能含下划线（如 l_3f2a1b8c），故按尾部锚定解析、不做 split */
const EDGE_SLOT_KEY_RE = /^line_(.+)_(start|end)_(\d+)$/;

/**
 * 构建边和弦索引：谱面行数据重建时每行每侧都要取一次边缘和弦 id，
 * 直接按前缀在整张表里扫是 O(行数 × 绑定数)（长歌 + 多绑定下每次改和弦都要重扫一遍）；
 * 预热成索引后建表 O(绑定数)，之后每次取用 O(1)。
 */
export const buildEdgeChordIndex = (chordMap: ReadonlyMap<string, string>): EdgeChordIndex => {
  const buckets = new Map<string, { index: number; id: string }[]>();
  for (const [key, id] of chordMap) {
    if (!id) continue;
    const matched = EDGE_SLOT_KEY_RE.exec(key);
    if (!matched) continue;
    const index = parseInt(matched[3]!, 10);
    if (Number.isNaN(index)) continue;
    const bucketKey = `${matched[1]}_${matched[2]}`;
    const list = buckets.get(bucketKey);
    if (list) list.push({ index, id });
    else buckets.set(bucketKey, [{ index, id }]);
  }

  const ids = new Map<string, string[]>();
  for (const [bucketKey, list] of buckets) {
    list.sort((a, b) => a.index - b.index);
    ids.set(
      bucketKey,
      list.map(entry => entry.id)
    );
  }

  return { get: (lineId, type) => ids.get(`${lineId}_${type}`) ?? EMPTY_CHORD_IDS };
};

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

      // 包含快路径：行尾/行首追加式编辑时，编辑距离随新增字符线性增长，
      // 相似度按「旧长 / 新长」比值衰减——短歌词行尾部输入长文本会被误判为新行，
      // 导致该行 lineId 重建、chordMap 槽位被回收（和弦丢失根因）。
      // 一方是另一方的前缀/后缀（且较短方非空）是同一条目被局部编辑的强信号，按长度差认领。
      const shorterLen = Math.min(oldLen, newLen);
      if (shorterLen > 0) {
        const prefixOrSuffix =
          newLine.startsWith(oldLine) ||
          oldLine.startsWith(newLine) ||
          newLine.endsWith(oldLine) ||
          oldLine.endsWith(newLine);
        if (prefixOrSuffix) {
          const lenDiff = maxLength - shorterLen;
          if (lenDiff < minDistance) {
            minDistance = lenDiff;
            bestMatchIdx = j;
          }
          continue;
        }
      }

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
  singer: '',
  originalKey: '',
  timeSignature: '',
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
