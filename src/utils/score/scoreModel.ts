// ===== 槽位 key 编码：单一真相源，替换散落的 `line_${...}` / `char_${...}` 模板 =====

export type EdgeSlotType = 'start' | 'end';

/** 边和弦（行首/行尾）槽位的存储 key */
export const chordSlotKey = (lineId: string, type: EdgeSlotType, index: number): string =>
  `line_${lineId}_${type}_${index}`;

/** 字符槽位的存储 key */
export const charKey = (lineId: string, index: number): string => `line_${lineId}_char_${index}`;

/** 边和弦槽位的前缀，用于整体清除某行某侧的槽位 */
export const edgeSlotPrefix = (lineId: string, type: EdgeSlotType): string => `line_${lineId}_${type}_`;

// ===== 谱面组合模式（Composite）：Song → Line → (CharNode | ChordSlotNode) =====
// 用统一节点结构替代"扁平 chordMap + 字符串 key 解析"，并提供多态遍历。

export type ScoreNode =
  | { kind: 'char'; lineId: string; index: number; char: string; key: string }
  | {
      kind: 'chord';
      lineId: string;
      slot: EdgeSlotType;
      index: number;
      key: string;
      chordId: string | null;
    };

export interface ScoreLine {
  lineId: string;
  lineIdx: number;
  /** 字符节点（kind === 'char'） */
  chars: ScoreNode[];
  /** 行首和弦槽位（kind === 'chord' && slot === 'start'） */
  startChords: ScoreNode[];
  /** 行尾和弦槽位（kind === 'chord' && slot === 'end'） */
  endChords: ScoreNode[];
}

/** 按序收集某行某侧边和弦槽位中存储的和弦 id（组合结构的底层构建块） */
export const collectEdgeChordIds = (chordMap: Record<string, string>, lineId: string, type: EdgeSlotType): string[] => {
  const prefix = `line_${lineId}_${type}_`;
  const entries: { index: number; id: string }[] = [];
  for (const k of Object.keys(chordMap)) {
    if (k.startsWith(prefix)) {
      const idxStr = k.slice(prefix.length);
      const idx = parseInt(idxStr, 10);
      if (!isNaN(idx) && chordMap[k]) {
        entries.push({ index: idx, id: chordMap[k]! });
      }
    }
  }
  entries.sort((a, b) => a.index - b.index);
  return entries.map(e => e.id);
};

/** 由扁平 chordMap 构建谱面组合树（Song → Line → 节点） */
export const buildScoreTree = (
  lyrics: string,
  chordMap: Record<string, string>,
  existingLineIds: string[] = []
): ScoreLine[] =>
  lyrics.split('\n').map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);
    const chars: ScoreNode[] = lineText.split('').map((char, idx) => ({
      kind: 'char',
      lineId,
      index: idx,
      char,
      key: charKey(lineId, idx),
    }));
    const buildEdge = (type: EdgeSlotType): ScoreNode[] =>
      collectEdgeChordIds(chordMap, lineId, type).map((chordId, idx) => ({
        kind: 'chord',
        lineId,
        slot: type,
        index: idx,
        key: chordSlotKey(lineId, type, idx),
        chordId: chordId || null,
      }));
    return { lineId, lineIdx, chars, startChords: buildEdge('start'), endChords: buildEdge('end') };
  });

/** 组合结构多态遍历：对所有和弦槽位节点执行回调 */
export const forEachChordSlot = (
  tree: ScoreLine[],
  cb: (node: Extract<ScoreNode, { kind: 'chord' }>) => void
): void => {
  for (const line of tree) {
    for (const node of [...line.startChords, ...line.endChords]) {
      if (node.kind === 'chord') cb(node);
    }
  }
};

/** 收集谱面出现的所有和弦 id（可按需去重） */
export const collectChordIds = (tree: ScoreLine[], options?: { unique?: boolean }): string[] => {
  const ids: string[] = [];
  forEachChordSlot(tree, node => {
    if (node.chordId) ids.push(node.chordId);
  });
  return options?.unique ? [...new Set(ids)] : ids;
};
