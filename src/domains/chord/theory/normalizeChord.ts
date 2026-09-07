import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import {
  isCapoValue,
  isFretOffsetValue,
  normalizeAndMergeBarres,
  normalizeBarres,
  toFretOffset,
} from '@/domains/fretboard/model/coordinates';

import type { Chord } from '@/domains/chord/types';
import type { FretOffset, GuitarStringEntity, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';

/**
 * 和弦实体归一化：迁移旧数据结构并修复非法字段。
 * 覆盖：strings 对象数组 → 二维数组、弦级 isRoot → 单点 rootStringIndex（含有效性校验）、
 * 旧字段（isInverted/fingerprint/chordName）清理、横按合法性过滤、chordName → nameSegments 迁移。
 * @returns 规范化实体与是否发生变更（未变更时原样返回引用，避免无谓的深拷贝/写盘）
 */
export const normalizeChord = (chord: Chord): { chord: Chord; changed: boolean } => {
  const rawChord = chord as unknown as Record<string, unknown>;
  const fretOffset = isFretOffsetValue(rawChord['fretOffset'])
    ? (rawChord['fretOffset'] as FretOffset)
    : isCapoValue(rawChord['capo'])
      ? toFretOffset(rawChord['capo'] as number)
      : 0;
  const tuning = chord.tuning || Tuning.STANDARD;
  const fretCount = chord.fretCount ?? 3;

  // 迁移：strings 由旧对象数组 [{fret, preferFlat}] 升级为二维数组 [[fret, preferFlat]]
  // 注意：fret 合法值是 -1/0/正整数，不能用 `|| -1` 兜底（0 是空弦，会被误判为 -1 静音）
  // 品位清洗：fret 为可视窗口内的相对值，合法值域 -1/0/1..fretCount，越界一律置 -1 静音
  let stringsMigrated = false;
  let stringsBounded = false;
  const boundFret = (v: number): number => {
    if (Number.isFinite(v) && v >= -1 && v <= fretCount) return v;
    stringsBounded = true;
    return -1;
  };
  const strings = (chord.strings as unknown[]).map(s => {
    if (Array.isArray(s)) {
      return [
        typeof s[0] === 'number' && Number.isFinite(s[0]) ? boundFret(s[0]) : -1,
        Boolean(s[1]),
      ] as GuitarStringEntity;
    }
    stringsMigrated = true;
    const legacy = s as { fret?: number; preferFlat?: boolean; isRoot?: boolean };
    return [typeof legacy?.fret === 'number' ? boundFret(legacy.fret) : -1, !!legacy?.preferFlat] as GuitarStringEntity;
  }) as GuitarStringsModel;

  // 迁移：旧数据每根弦各自维护 isRoot，统一为单点 rootStringIndex
  let rootStringIndex = (chord.rootStringIndex ?? null) as StringIndex | null;
  const legacyRoots = (chord.strings as unknown[])
    .map((s, idx) => ((s as { isRoot?: boolean }).isRoot ? idx : -1))
    .filter(idx => idx >= 0);
  if (rootStringIndex === null && legacyRoots.length > 0) {
    // legacyRoots 是弦索引数组（0~5），取首个后收窄
    rootStringIndex = (legacyRoots[0] ?? null) as StringIndex | null;
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

  // 清理旧字段：和弦级 isInverted / fingerprint / chordName（现已由 nameSegments 替代）及旧的 capo
  const legacyChord = chord as unknown as {
    isInverted?: boolean;
    fingerprint?: string;
    chordName?: string;
    capo?: unknown;
  };
  let fieldsCleaned = false;
  if (
    'isInverted' in legacyChord ||
    'fingerprint' in legacyChord ||
    'chordName' in legacyChord ||
    'capo' in legacyChord
  ) {
    fieldsCleaned = true;
    delete legacyChord.isInverted;
    delete legacyChord.fingerprint;
    delete legacyChord.capo;
  }

  // 横按规范化：过滤非法条目与物理非法项，合并重叠与包含关系
  const rawBarres = normalizeBarres(chord.barres, strings.length);
  const finalBarres = normalizeAndMergeBarres(rawBarres, strings);

  const barresChanged = JSON.stringify(chord.barres ?? undefined) !== JSON.stringify(finalBarres);

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
    stringsBounded ||
    nameMigrated ||
    chord.fretOffset !== fretOffset ||
    chord.tuning !== tuning ||
    chord.fretCount !== fretCount ||
    chord.rootStringIndex !== rootStringIndex ||
    fieldsCleaned ||
    barresChanged;
  if (!changed) return { chord, changed: false };
  return {
    chord: {
      ...chord,
      nameSegments,
      fretOffset,
      tuning,
      fretCount,
      rootStringIndex,
      strings,
      ...(finalBarres !== undefined ? { barres: finalBarres } : {}),
    },
    changed: true,
  };
};
