/**
 * 和弦编辑草稿的保存前校验（纯逻辑，与 store 无关）：
 * 依次校验名称非空、语法合法、分组存在且已选中；编辑模式下识别无修改并保留 createdAt；
 * 同分组内指纹重复视为重复和弦；返回值带低音弦一致性警告。
 */
import { createChord } from '@/domains/chord/theory/entityFactories';
import {
  computeChordFingerprint,
  isValidChordName,
  segmentsToString,
  validateBassConsistency,
} from '@/domains/chord/theory/theory';
import { areBarresEqual } from '@/domains/fretboard/model/coordinates';
import { cloneGuitarStrings } from '@/platform/utils/common';

import type { Chord } from '@/domains/chord/types';

export type ChordValidationResult =
  | { ok: true; payload: Chord; cleanName: string; warn?: string | null }
  | {
      ok: false;
      reason:
        | 'EMPTY_NAME'
        | 'INVALID_CHORD_SYNTAX'
        | 'NO_GROUPS'
        | 'NO_SELECTED_GROUP'
        | 'DUPLICATE_FINGERPRINT'
        | 'UNCHANGED';
      cleanName?: string;
    };

/** 校验上下文：store 侧注入当前分组列表、选中分组与已保存和弦 */
export interface ChordDraftContext {
  groups: { id: string }[];
  selectedGroupId: string | null;
  /** 当前已保存的和弦列表（重复检测与编辑态回查用） */
  savedChords: Chord[];
}

export const validateChordDraft = (draft: Chord, isEditing: boolean, ctx: ChordDraftContext): ChordValidationResult => {
  const nameSegments = draft.nameSegments;
  const cleanName = nameSegments ? segmentsToString(nameSegments) : '';
  const isFretBoardEmpty = draft.strings.every(s => s.fret < 0);
  if (!cleanName || isFretBoardEmpty) {
    return { ok: false, reason: 'EMPTY_NAME' };
  }
  if (!nameSegments || !isValidChordName(cleanName)) {
    return { ok: false, reason: 'INVALID_CHORD_SYNTAX', cleanName };
  }
  if (ctx.groups.length === 0) {
    return { ok: false, reason: 'NO_GROUPS' };
  }
  if (!ctx.selectedGroupId) {
    return { ok: false, reason: 'NO_SELECTED_GROUP' };
  }

  const id = isEditing ? draft.id : null;
  const targetGroupId = isEditing
    ? ctx.savedChords.find(c => c.id === id)?.groupId || ctx.selectedGroupId
    : ctx.selectedGroupId;

  const currentStrings = cloneGuitarStrings(draft.strings);
  // 根音标记须指向有效且已按音的弦，否则按未指定处理
  const rootStringIndex =
    draft.rootStringIndex !== null &&
    draft.rootStringIndex !== undefined &&
    draft.rootStringIndex >= 0 &&
    draft.rootStringIndex < currentStrings.length &&
    (currentStrings[draft.rootStringIndex]?.fret ?? -1) >= 0
      ? draft.rootStringIndex
      : null;

  const payload = createChord({
    id,
    nameSegments,
    strings: currentStrings,
    fretCount: draft.fretCount,
    fretOffset: draft.fretOffset,
    groupId: targetGroupId,
    tuning: draft.tuning,
    rootStringIndex,
    barres: draft.barres,
  });
  const fingerprint = computeChordFingerprint(payload);

  if (isEditing) {
    const original = ctx.savedChords.find(c => c.id === id);
    // 指纹不含 barres，因此"仅修改横按"时指纹不变；需同时比较 barres 才能识别真正的无修改
    const sameBarres = areBarresEqual(original?.barres, payload.barres);
    if (original && computeChordFingerprint(original) === fingerprint && sameBarres) {
      return { ok: false, reason: 'UNCHANGED' };
    }
    // 编辑保存：保留最初创建时间，刷新更新时间
    if (original?.createdAt !== undefined) payload.createdAt = original.createdAt;
    payload.updatedAt = Date.now();
  }

  const isDuplicate = ctx.savedChords.some(
    existing =>
      existing.id !== id && existing.groupId === payload.groupId && computeChordFingerprint(existing) === fingerprint
  );
  if (isDuplicate) {
    return { ok: false, reason: 'DUPLICATE_FINGERPRINT', cleanName };
  }

  const bassWarn = validateBassConsistency(payload.strings, payload.fretOffset, payload.tuning, payload);
  return { ok: true, payload, cleanName, warn: bassWarn };
};
