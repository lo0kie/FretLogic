import type { Chord, GuitarStringEntity, GuitarStringsModel } from '@/types';
import { CANVAS_CONFIG, FRETBOARD_COLORS, FRETBOARD_SCALE_MAP } from '@/utils/core/constants';
import { Tuning, isMuted, isOpen, nameToSegments } from '@/utils/music/musicTheory';
import { charKey, chordSlotKey, collectEdgeChordIds, edgeSlotPrefix } from '@/utils/score/scoreModel';

// ===== chordMap: 和弦槽位映射与和弦数据归一化 =====

export interface ParsedSlotKey {
  lineId: string;
  type: 'char' | 'start' | 'end';
  index: number;
}
export function parseSlotKey(slotKey: string): ParsedSlotKey | null {
  const str = String(slotKey);
  const match = str.match(/^line_(.+?)_(char|start|end)_(\d+)$/);
  if (!match) return null;
  return {
    lineId: match[1] ?? '',
    type: (match[2] ?? 'char') as 'char' | 'start' | 'end',
    index: parseInt(match[3] ?? '0', 10),
  };
}
export function getEdgeChords(chordMap: Record<string, string>, lineId: string, type: 'start' | 'end'): string[] {
  return collectEdgeChordIds(chordMap, lineId, type);
}
export function setEdgeChords(
  chordMap: Record<string, string>,
  lineId: string,
  type: 'start' | 'end',
  chordIds: string[]
): void {
  const prefix = edgeSlotPrefix(lineId, type);
  Object.keys(chordMap).forEach(key => {
    if (key.startsWith(prefix)) {
      delete chordMap[key];
    }
  });
  chordIds.forEach((chordId, idx) => {
    chordMap[chordSlotKey(lineId, type, idx)] = chordId;
  });
}
export function removeChordFromSlot(chordMap: Record<string, string>, slotKey: string): string | null {
  const parsed = parseSlotKey(slotKey);
  if (!parsed) {
    const removed = chordMap[slotKey] || null;
    delete chordMap[slotKey];
    return removed;
  }
  const { lineId, type, index } = parsed;
  if (type === 'char') {
    const removed = chordMap[slotKey] || null;
    delete chordMap[slotKey];
    return removed;
  } else {
    const list = getEdgeChords(chordMap, lineId, type);
    if (index < 0 || index >= list.length) return null;
    const [removed] = list.splice(index, 1);
    setEdgeChords(chordMap, lineId, type, list);
    return removed ?? null;
  }
}
export function bindNewChordToSlot(chordMap: Record<string, string>, slotKey: string, chordId: string): void {
  const parsed = parseSlotKey(slotKey);
  if (!parsed || parsed.type === 'char') {
    chordMap[slotKey] = chordId;
    return;
  }
  const { lineId, type, index } = parsed;
  const list = getEdgeChords(chordMap, lineId, type);
  if (index >= list.length) {
    if (type === 'start') list.unshift(chordId);
    else list.push(chordId);
  } else list[index] = chordId;
  setEdgeChords(chordMap, lineId, type, list);
}
export function swapOrMoveSlotChords(chordMap: Record<string, string>, sourceKey: string, targetKey: string): void {
  console.log('[LyricsDrag:Store] 🔀 swapOrMoveSlotChords:', sourceKey, '->', targetKey);
  if (sourceKey === targetKey) return;
  const sourceParsed = parseSlotKey(sourceKey);
  const targetParsed = parseSlotKey(targetKey);
  if (!sourceParsed || !targetParsed) {
    console.warn('[LyricsDrag:Store] ⚠️ Failed to parse slot keys:', {
      sourceKey,
      targetKey,
      sourceParsed,
      targetParsed,
    });
    return;
  }
  if (
    sourceParsed.lineId === targetParsed.lineId &&
    sourceParsed.type === targetParsed.type &&
    sourceParsed.type !== 'char'
  ) {
    const list = getEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type);
    const srcIdx = sourceParsed.index;
    const tgtIdx = targetParsed.index;
    if (srcIdx >= 0 && srcIdx < list.length) {
      const originalLength = list.length;
      const isTargetAddButton = tgtIdx >= originalLength;
      const [movedChordId] = list.splice(srcIdx, 1);
      if (movedChordId === undefined) return;
      let insertIdx: number;
      if (isTargetAddButton) {
        // 当拖拽到行首的“添加”按钮（最左侧占位符）时插入到最左侧（0），行尾插入到末尾
        insertIdx = sourceParsed.type === 'start' ? 0 : list.length;
      } else {
        insertIdx = Math.min(Math.max(0, tgtIdx), list.length);
      }
      list.splice(insertIdx, 0, movedChordId);
      setEdgeChords(chordMap, sourceParsed.lineId, sourceParsed.type, list);
    }
    return;
  }
  const peekChordId = (parsed: ParsedSlotKey): string | null => {
    if (parsed.type === 'char') return chordMap[charKey(parsed.lineId, parsed.index)] || null;
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    return list[parsed.index] || null;
  };
  const sourceChordId = peekChordId(sourceParsed);
  if (!sourceChordId) return;
  const targetChordId = peekChordId(targetParsed);

  // 2. 两处都有和弦：纯 SWAP（原地互换位置内容，绝不缩减或打乱边和弦列表顺序）
  if (targetChordId) {
    const setSlotChordDirect = (parsed: ParsedSlotKey, chordId: string) => {
      if (parsed.type === 'char') {
        chordMap[charKey(parsed.lineId, parsed.index)] = chordId;
      } else {
        const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
        if (parsed.index < list.length) {
          list[parsed.index] = chordId;
        } else {
          list.push(chordId);
        }
        setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
      }
    };

    setSlotChordDirect(sourceParsed, targetChordId);
    setSlotChordDirect(targetParsed, sourceChordId);
    return;
  }

  // 3. 目标槽位为空：MOVE（从源槽位移出，并插入到目标槽位）
  removeChordFromSlot(chordMap, sourceKey);
  insertChordAtParsedLocation(chordMap, targetParsed, sourceChordId);
}
function insertChordAtParsedLocation(chordMap: Record<string, string>, parsed: ParsedSlotKey, chordId: string): void {
  if (parsed.type === 'char') {
    chordMap[charKey(parsed.lineId, parsed.index)] = chordId;
  } else {
    const list = getEdgeChords(chordMap, parsed.lineId, parsed.type);
    let insertIdx: number;
    if (parsed.index >= list.length) {
      // 当目标是行首“添加”按钮（最左侧占位符）时插入到最左侧（0），行尾插入到末尾
      insertIdx = parsed.type === 'start' ? 0 : list.length;
    } else {
      insertIdx = Math.min(Math.max(0, parsed.index), list.length);
    }
    list.splice(insertIdx, 0, chordId);
    setEdgeChords(chordMap, parsed.lineId, parsed.type, list);
  }
}
export const garbageCollectChordMap = (
  chordMap: Record<string, string>,
  finalLineIds: string[]
): { map: Record<string, string>; changed: boolean } => {
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

/** 清理 chordMap 中指向不存在和弦 id 的孤儿引用（导入校验 / 删除和弦后使用） */
export const pruneOrphanChordRefs = (
  chordMap: Record<string, string>,
  validChordIds: Set<string>,
  options?: { preserveUnknown?: boolean }
): { map: Record<string, string>; changed: boolean } => {
  const updatedMap = { ...chordMap };
  let changed = false;
  Object.keys(updatedMap).forEach(key => {
    const id = updatedMap[key];
    if (id !== undefined && !validChordIds.has(id) && !(options?.preserveUnknown && validChordIds.size === 0)) {
      delete updatedMap[key];
      changed = true;
    }
  });
  return { map: updatedMap, changed };
};

export const normalizeChord = (chord: Chord): { chord: Chord; changed: boolean } => {
  const capo = chord.capo ?? 0;
  const tuning = chord.tuning || Tuning.STANDARD;
  const fretCount = chord.fretCount ?? 3;

  // 迁移：strings 由旧对象数组 [{fret, preferFlat}] 升级为二维数组 [[fret, preferFlat]]
  // 注意：fret 合法值是 -1/0/正整数，不能用 `|| -1` 兜底（0 是空弦，会被误判为 -1 静音）
  let stringsMigrated = false;
  const strings = (chord.strings as unknown[]).map(s => {
    if (Array.isArray(s)) {
      return [typeof s[0] === 'number' && Number.isFinite(s[0]) ? s[0] : -1, Boolean(s[1])] as GuitarStringEntity;
    }
    stringsMigrated = true;
    const legacy = s as { fret?: number; preferFlat?: boolean; isRoot?: boolean };
    return [typeof legacy?.fret === 'number' ? legacy.fret : -1, !!legacy?.preferFlat] as GuitarStringEntity;
  }) as GuitarStringsModel;

  // 迁移：旧数据每根弦各自维护 isRoot，统一为单点 rootStringIndex
  let rootStringIndex: number | null = chord.rootStringIndex ?? null;
  const legacyRoots = (chord.strings as unknown[])
    .map((s, idx) => ((s as { isRoot?: boolean }).isRoot ? idx : -1))
    .filter(idx => idx >= 0);
  if (rootStringIndex === null && legacyRoots.length > 0) {
    rootStringIndex = legacyRoots[0] ?? null;
  }
  // 校验：rootStringIndex 必须落在有效且已按音的弦上，否则清空
  if (
    rootStringIndex !== null &&
    (rootStringIndex < 0 ||
      rootStringIndex >= strings.length ||
      strings[rootStringIndex]?.[0] === undefined ||
      strings[rootStringIndex]![0] < 0)
  ) {
    rootStringIndex = null;
  }

  // 清理旧字段：和弦级 isInverted / fingerprint / chordName（现已由 nameSegments 替代）
  const legacyChord = chord as unknown as { isInverted?: boolean; fingerprint?: string; chordName?: string };
  let fieldsCleaned = false;
  if ('isInverted' in legacyChord || 'fingerprint' in legacyChord || 'chordName' in legacyChord) {
    fieldsCleaned = true;
    delete legacyChord.isInverted;
    delete legacyChord.fingerprint;
  }

  let nameSegments = chord.nameSegments;
  let nameMigrated = false;
  if (nameSegments === undefined) {
    nameMigrated = true;
    const rawName = legacyChord.chordName?.trim() || '';
    nameSegments = rawName ? (nameToSegments(rawName) ?? null) : null;
  }
  delete legacyChord.chordName;

  const changed =
    stringsMigrated ||
    nameMigrated ||
    chord.capo !== capo ||
    chord.tuning !== tuning ||
    chord.fretCount !== fretCount ||
    chord.rootStringIndex !== rootStringIndex ||
    fieldsCleaned;
  if (!changed) return { chord, changed: false };
  return {
    chord: {
      ...chord,
      nameSegments,
      capo,
      tuning,
      fretCount,
      rootStringIndex,
      strings,
    },
    changed: true,
  };
};

// ===== fretboardVisuals: 指板视觉样式 =====

export const getOpenStringStatusClass = (str: GuitarStringEntity, isRoot: boolean): string => {
  if (isMuted(str)) return 'is-muted-status';
  if (isOpen(str) && !isRoot) return 'is-open-status';
  return '';
};

export const getOpenStringStyle = (str: GuitarStringEntity, isRoot: boolean, isDarkMode: boolean) => {
  if (isOpen(str) && isRoot) {
    const bg = isDarkMode ? FRETBOARD_COLORS.openRootBgDark : FRETBOARD_COLORS.openRootBgLight;
    return {
      backgroundColor: bg,
      borderColor: bg,
      color: isDarkMode ? FRETBOARD_COLORS.openRootTextDark : FRETBOARD_COLORS.openRootTextLight,
      boxShadow: 'var(--root-glow)',
    };
  }
  return {};
};

export const getFingerColor = (isRoot: boolean, isDarkMode: boolean): string => {
  if (isRoot) return isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  return isDarkMode ? FRETBOARD_COLORS.normalDark : FRETBOARD_COLORS.normalLight;
};

export const getFingerTextColor = (isRoot: boolean, isDarkMode: boolean): string => {
  return isRoot && isDarkMode ? FRETBOARD_COLORS.textRootDark : FRETBOARD_COLORS.textRootLight;
};

const placeholderSizeCache = new Map<string, { width: string; height: string }>();

export const getPlaceholderSize = (
  fretCount: number,
  customScale = 1.0,
  showChordName = true,
  showOpenStrings = true
) => {
  const scaleKey = Math.round(customScale * 1000);
  const cacheKey = `${fretCount}_${scaleKey}_${showChordName ? 1 : 0}_${showOpenStrings ? 1 : 0}`;

  const cached = placeholderSizeCache.get(cacheKey);
  if (cached) return cached;

  const topOffset =
    (showChordName ? CANVAS_CONFIG.CHORD_NAME_ZONE_HEIGHT : 0) + (showOpenStrings ? CANVAS_CONFIG.OFFSET_Y_TOP : 16);
  const rawHeight = topOffset + fretCount * CANVAS_CONFIG.FRET_HEIGHT + CANVAS_CONFIG.OFFSET_Y_BOTTOM;
  const fretboardScale = (FRETBOARD_SCALE_MAP[fretCount] ?? 1.0) * customScale;

  const size = {
    width: `${CANVAS_CONFIG.BOARD_WIDTH * fretboardScale}px`,
    height: `${rawHeight * fretboardScale}px`,
  };

  if (placeholderSizeCache.size >= 32) {
    const oldestKey = placeholderSizeCache.keys().next().value;
    if (oldestKey !== undefined) placeholderSizeCache.delete(oldestKey);
  }

  placeholderSizeCache.set(cacheKey, size);
  return size;
};
