/**
 * 和弦编辑草稿的保存前校验（纯逻辑，与 store 无关）：
 * 依次校验名称非空、语法合法、分组存在且已选中；编辑模式下识别无修改并保留 createdAt；
 * 同分组内「指纹 + 横按（含指序）」均相同才视为重复和弦；返回值带低音弦一致性警告。
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
  const { nameSegments } = draft;
  const cleanName = nameSegments ? segmentsToString(nameSegments) : '';
  const isFretBoardEmpty = draft.strings.every(s => s.fret < 0);
  if (!cleanName || isFretBoardEmpty) return { ok: false, reason: 'EMPTY_NAME' };

  if (!nameSegments || !isValidChordName(cleanName)) return { ok: false, reason: 'INVALID_CHORD_SYNTAX', cleanName };

  if (ctx.groups.length === 0) return { ok: false, reason: 'NO_GROUPS' };

  const id = isEditing ? draft.id : null;
  // 纯更新优先沿用**原实体自己的分组**：此时用户完全可能已经取消选中分组，
  // 若仍按「必须选中分组」拦下，就是「改个名字都存不了」。只有确实没有可继承的分组时才拦。
  const targetGroupId =
    (isEditing ? ctx.savedChords.find(c => c.id === id)?.groupId : undefined) ?? ctx.selectedGroupId;
  if (!targetGroupId) return { ok: false, reason: 'NO_SELECTED_GROUP' };

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
    if (original && computeChordFingerprint(original) === fingerprint && sameBarres)
      return { ok: false, reason: 'UNCHANGED' };

    // 编辑保存：保留最初创建时间，刷新更新时间
    if (original?.createdAt !== undefined) payload.createdAt = original.createdAt;
    payload.updatedAt = Date.now();
  }

  // 去重口径与 D26 全局一致：指纹不含 barres，必须补比横按（含指序），否则
  // 「同指法不同横按」会被这里判成重复而拒存，却又能通过读库去重（chordRepository）与
  // 合并去重（chordMergeOps）——三处口径不一致时，界面拒存而底层允许共存，用户无从理解。
  const isDuplicate = ctx.savedChords.some(
    existing =>
      existing.id !== id &&
      existing.groupId === payload.groupId &&
      computeChordFingerprint(existing) === fingerprint &&
      areBarresEqual(existing.barres, payload.barres)
  );
  if (isDuplicate) return { ok: false, reason: 'DUPLICATE_FINGERPRINT', cleanName };

  const bassWarn = validateBassConsistency(payload.strings, payload.fretOffset, payload.tuning, payload);
  return { ok: true, payload, cleanName, warn: bassWarn };
};
