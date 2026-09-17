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

/** 槽位 key 的结构化形态（构造器 chordSlotKey / charKey 的逆向） */
export interface ParsedSlotKey {
  lineId: string;
  type: 'char' | 'start' | 'end';
  index: number;
}

/**
 * 解析槽位 key（line_{lineId}_{char|start|end}_{index}）为结构化对象；格式非法返回 null。
 *
 * 解析器与构造器（chordSlotKey / charKey）同处一个文件，是槽位键形态的唯一真相源：
 * 此前这里（贪婪 `(.+)`）与 chordSlots 侧（非贪婪 `(.+?)`）各持一套正则，虽然当前
 * `l_` + 8 位 hex 的 id 形态下两者等价，但一旦 id 自身带上 `_char_` / `_start_` 形态
 * 就会分叉出不同的解析结果（槽位被归到别的行），故合并为一套。
 *
 * 用贪婪 `.+` 并由尾部 `_(char|start|end)_(\d+)$` 锚定：lineId 自身可含下划线
 * （如 l_3f2a1b8c），不做 split、也不让前缀吃掉类型段。
 */
export function parseSlotKey(slotKey: string): ParsedSlotKey | null {
  const match = String(slotKey).match(/^line_(.+)_(char|start|end)_(\d+)$/);
  if (!match) return null;
  const index = parseInt(match[3] ?? '0', 10);
  if (Number.isNaN(index)) return null;
  return {
    lineId: match[1] ?? '',
    type: (match[2] ?? 'char') as 'char' | 'start' | 'end',
    index,
  };
}

/**
 * 构建边和弦索引：谱面行数据重建时每行每侧都要取一次边缘和弦 id，
 * 直接按前缀在整张表里扫是 O(行数 × 绑定数)（长歌 + 多绑定下每次改和弦都要重扫一遍）；
 * 预热成索引后建表 O(绑定数)，之后每次取用 O(1)。
 */
export const buildEdgeChordIndex = (chordMap: ReadonlyMap<string, string>): EdgeChordIndex => {
  const buckets = new Map<string, { index: number; id: string }[]>();
  for (const [key, id] of chordMap) {
    if (!id) continue;
    const parsed = parseSlotKey(key);
    // 本索引只服务边和弦：字符槽位与格式非法的键都不入桶
    if (!parsed || parsed.type === 'char') continue;
    const bucketKey = `${parsed.lineId}_${parsed.type}`;
    const list = buckets.get(bucketKey);
    if (list) list.push({ index: parsed.index, id });
    else buckets.set(bucketKey, [{ index: parsed.index, id }]);
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
/** 未匹配行数超过此值即整体跳过模糊匹配：模糊匹配是 O(新行数 × 旧行数) 的编辑距离，
 *  大段粘贴时会在主线程上长时间阻塞。代价是这些行会拿到新 id、原有和弦被回收，
 *  故以 skippedSimilarMatch 回传给调用方向用户提示。 */
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

/**
 * 行 id 匹配（旧歌词行 → 新歌词行），生成的 id 是 LineId 的唯一合法来源。
 *
 * @returns lineIds 与 newLines 一一对应；skippedSimilarMatch 为 true 表示未匹配行数超阈值、
 *          模糊匹配被整体跳过（大段粘贴），这些行会拿到新 id 并丢掉原有和弦，调用方应提示用户。
 */
export const matchLineIds = (
  oldLines: string[],
  newLines: string[],
  oldLineIds: string[]
): { lineIds: LineId[]; skippedSimilarMatch: boolean } => {
  const { newIds, usedOldIndices } = matchExactLines(oldLines, newLines, oldLineIds);
  const unmatchedCount = newIds.reduce((count, id) => (id === null ? count + 1 : count), 0);
  const skippedSimilarMatch = unmatchedCount > MAX_SIMILAR_MATCH_LINES;
  if (!skippedSimilarMatch) {
    matchSimilarLines(oldLines, newLines, oldLineIds, newIds, usedOldIndices);
  }
  return { lineIds: assignNewIds(newIds) as LineId[], skippedSimilarMatch };
};

// ===== 行编辑的字符下标重映射 =====

/**
 * 构建「旧行字符下标 → 新行字符下标」的重映射表，用于歌词被编辑后平移和弦字符槽位。
 *
 * 背景：行 id 匹配（matchLineIds）只保证 lineId 与行的对应关系，而字符槽位
 * （line_{lineId}_char_{n}）的 n 是行内位置。行首 / 行中插入或删除字符时 lineId 能保住，
 * 下标却全部错位 —— 此前只有「整行和弦消失」与「和弦静默错位」两种结局，这里补上第三种：
 * 按编辑对齐后让和弦跟着字符走。
 *
 * 对齐规则（最长公共前缀 + 最长公共后缀，二者不重叠）：
 * - 公共前缀段：两侧同文，下标原样；
 * - 公共后缀段：右对齐，旧下标 j 映射到 n - (m - j)，即尾部整体平移「长度差」；
 * - 中间段：两侧都非空时按长度比例均分（近似对齐，覆盖等位替换这类编辑）。
 *
 * 边和弦（start / end）不参与：它们是行级密列表，与行内下标无关。
 *
 * @returns 长度等于旧行长的数组；remap[i] 为旧下标 i 的新下标，-1 表示在新行中已无对应
 *          （越界留白的槽位由 garbageCollectChordMap 按行长丢弃）
 */
export const buildCharIndexRemap = (oldLine: string, newLine: string): number[] => {
  const m = oldLine.length;
  const n = newLine.length;
  const remap = new Array<number>(m).fill(-1);
  if (m === 0 || n === 0) return remap;

  const maxShared = Math.min(m, n);
  let prefix = 0;
  while (prefix < maxShared && oldLine[prefix] === newLine[prefix]) prefix++;

  // 后缀长度受限，不与前缀重叠：旧行恰是新行前缀（行尾追加）时后缀收敛为 0，前缀段已覆盖全部下标
  let suffix = 0;
  const maxSuffix = maxShared - prefix;
  while (suffix < maxSuffix && oldLine[m - 1 - suffix] === newLine[n - 1 - suffix]) suffix++;

  for (let i = 0; i < prefix; i++) remap[i] = i;
  for (let k = 0; k < suffix; k++) remap[m - 1 - k] = n - 1 - k;

  const oldMidLen = m - prefix - suffix;
  const newMidLen = n - prefix - suffix;
  if (oldMidLen > 0 && newMidLen > 0) {
    // 中段是近似对齐（两侧都被改写）。压缩时（oldMidLen > newMidLen）多个旧下标会撞到同一
    // 目标位，此时保留最靠前的那个、其余记 -1 丢弃：否则「哪个和弦活下来」将取决于 Map 的
    // 遍历顺序，结果不可预测。offset 单调不减，先到者必是最靠前的。
    const occupied = new Set<number>();
    for (let i = prefix; i < prefix + oldMidLen; i++) {
      const offset = Math.floor(((i - prefix) * newMidLen) / oldMidLen);
      const target = prefix + Math.min(newMidLen - 1, offset);
      if (occupied.has(target)) continue;
      occupied.add(target);
      remap[i] = target;
    }
  }
  return remap;
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
