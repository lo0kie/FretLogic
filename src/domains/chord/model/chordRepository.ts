import { buildGroupVariant } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import { computeChordFingerprint, Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { FRET_COUNTS } from '@/domains/fretboard/constants';
import { isCapoValue, isFretOffsetValue, toFretOffset } from '@/domains/fretboard/model/coordinates';
import { serializeForStorage } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { readJson } from '@/platform/utils/storage';

import type { Chord, Group, StringIndex } from '@/domains/chord/types';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

// strict 与 repair 共用的结构校验：品位只需为有限数且 >= -1（-1 静音 / 0 空弦 / 正整数）
// 越界品位（> fretCount）不在结构层拒绝整条记录，统一交给 normalizeChord 的 boundFret 置 -1 静音，
// 避免「加载时静默丢弃历史和弦」与导入链路的清洗策略不一致
const isValidStringEntity = (value: unknown): value is [number, boolean] => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -1 &&
    typeof value[1] === 'boolean'
  );
};

export type GroupDraft = Omit<Group, 'createdAt' | 'updatedAt'> & Partial<Pick<Group, 'createdAt' | 'updatedAt'>>;

export const sanitizeGroupEntity = (raw: unknown): GroupDraft | null => {
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || typeof raw['name'] !== 'string') return null;

  const sortRule = Object.values(GroupSortRule).includes(raw['sortRule'] as GroupSortRule)
    ? (raw['sortRule'] as GroupSortRule)
    : GroupSortRule.ROOT_PITCH;
  const draft = buildGroupVariant({ id: raw['id'], name: raw['name'] }, sortRule, raw['sortKey']);
  if (isValidTimestamp(raw['createdAt'])) draft.createdAt = raw['createdAt'];
  if (isValidTimestamp(raw['updatedAt'])) draft.updatedAt = raw['updatedAt'];
  return draft;
};

const resolveRootStringIndex = (chord: RawRecord): StringIndex | null => {
  const index = chord['rootStringIndex'];
  if (!Array.isArray(chord['strings']) || !isBoundedNumber(index, 0, chord['strings'].length - 1)) return null;

  const stringEntity = chord['strings'][index];
  return Array.isArray(stringEntity) && typeof stringEntity[0] === 'number' && stringEntity[0] >= 0
    ? (index as StringIndex)
    : null;
};

export const sanitizeChordEntity = (raw: unknown, options?: { mode?: 'strict' | 'repair' }): Chord | null => {
  const mode = options?.mode ?? 'strict';
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  if (typeof raw['groupId'] !== 'string' || !raw['groupId']) return null;
  if (!raw['chordName'] && !raw['nameSegments']) return null;
  if (!Array.isArray(raw['strings']) || raw['strings'].length < 3 || raw['strings'].length > 10) return null;

  // 品位上界取决于 fretCount（窗口相对语义），越界值由末端 normalizeChord 统一钳制
  const fretCount: Chord['fretCount'] = FRET_COUNTS.includes(raw['fretCount'] as Chord['fretCount'])
    ? (raw['fretCount'] as Chord['fretCount'])
    : 3;

  if (mode === 'strict') {
    if (!raw['strings'].every(s => isValidStringEntity(s))) return null;
  } else {
    const isStringsValid = raw['strings'].every(
      (s): s is [number, boolean] =>
        Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'boolean'
    );
    if (!isStringsValid) return null;
  }

  const rawOffset = raw['fretOffset'];
  const rawCapo = raw['capo'];
  const fretOffset = isFretOffsetValue(rawOffset) ? rawOffset : isCapoValue(rawCapo) ? toFretOffset(rawCapo) : 0;

  const draft: Chord = {
    ...(raw as unknown as Chord),
    nameSegments: (raw['nameSegments'] as Chord['nameSegments']) ?? null,
    fretCount,
    fretOffset,
    tuning: Object.values(Tuning).includes(raw['tuning'] as Tuning) ? (raw['tuning'] as Tuning) : Tuning.STANDARD,
    rootStringIndex: resolveRootStringIndex(raw),
  };
  const { chord } = normalizeChord(draft);
  return chord;
};

export const dedupeChordsByFingerprint = (chords: Chord[]): { kept: Chord[]; dupes: Chord[] } => {
  const seen = new Set<string>();
  const kept: Chord[] = [];
  const dupes: Chord[] = [];

  for (const chord of chords) {
    const fingerprint = `${chord.groupId}::${computeChordFingerprint(chord)}`;
    if (seen.has(fingerprint)) {
      dupes.push(chord);
      continue;
    }
    seen.add(fingerprint);
    kept.push(chord);
  }

  return { kept, dupes };
};

export interface Timestamped {
  createdAt?: number;
  updatedAt?: number;
}

export const fillMissingTimestamps = <T extends Timestamped>(
  items: T[],
  now: number
): (T & Required<Timestamped>)[] => {
  let cursor = now;

  return items.map(item => {
    cursor = isValidTimestamp(item.createdAt) ? Math.max(cursor, item.createdAt) : cursor + 1;

    const createdAt = isValidTimestamp(item.createdAt) ? item.createdAt : cursor;
    const updatedAt = isValidTimestamp(item.updatedAt) ? item.updatedAt : createdAt;

    return { ...item, createdAt, updatedAt } as T & Required<Timestamped>;
  });
};

export const sanitizeGroups = (groups: unknown): GroupDraft[] => {
  if (!Array.isArray(groups)) return [];
  return groups.map(sanitizeGroupEntity).filter((group): group is GroupDraft => group !== null);
};

export const sanitizeChords = (chords: unknown, validGroupIds: Set<string>): Chord[] => {
  if (!Array.isArray(chords)) return [];
  const byGroup = chords
    .map(raw => sanitizeChordEntity(raw))
    .filter((chord): chord is Chord => chord !== null && validGroupIds.has(chord.groupId));
  return dedupeChordsByFingerprint(byGroup).kept;
};

export const sanitizeChordLibrary = (data: {
  groups?: unknown;
  chords?: unknown | null;
}): { groups: Group[]; chords: Chord[] } => {
  const now = Date.now();
  const groups = fillMissingTimestamps(sanitizeGroups(data.groups), now) as Group[];
  const chords = fillMissingTimestamps(sanitizeChords(data.chords, new Set(groups.map(g => g.id))), now);
  return { groups, chords };
};

export interface ChordLibrarySnapshot {
  groups: Group[];
  chords: Chord[];
}

export interface ChordRepository {
  load(): ChordLibrarySnapshot;
  save(snapshot: ChordLibrarySnapshot): void;
}

const writeJson = (storage: Storage, key: string, value: unknown): void => {
  try {
    storage.setItem(key, serializeForStorage(value));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      const quotaError: Error & { cause?: unknown } = new Error('PERSISTENCE_QUOTA_EXCEEDED');
      quotaError.cause = error;
      throw quotaError;
    }
    throw error;
  }
};

export function createChordRepository(storage: Storage): ChordRepository {
  return {
    load() {
      return sanitizeChordLibrary({
        groups: readJson(storage, STORAGE_KEYS.GROUPS),
        chords: readJson(storage, STORAGE_KEYS.CHORD_LIST),
      });
    },
    save(snapshot) {
      writeJson(storage, STORAGE_KEYS.GROUPS, snapshot.groups);
      writeJson(storage, STORAGE_KEYS.CHORD_LIST, snapshot.chords);
    },
  };
}
