import { buildGroupVariant } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import { computeChordFingerprint, Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { FRET_COUNTS } from '@/domains/fretboard/constants';
import {
  computeBarresSignature,
  isCapoValue,
  isFretOffsetValue,
  toFretOffset,
} from '@/domains/fretboard/model/coordinates';
import { idb } from '@/platform/services/storage';
import { toPlainPersistable } from '@/platform/utils/common';

import type { Chord, Group, StringIndex } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/domains/fretboard/types';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

// strict 与 repair 共用的结构校验：品位只需为有限数且 >= -1（-1 静音 / 0 空弦 / 正整数）
// 越界品位（> fretCount）不在结构层拒绝整条记录，统一交给 normalizeChord 的 boundFret 置 -1 静音，
// 避免「加载时静默丢弃历史和弦」与导入链路的清洗策略不一致。
// 兼容两态：v7 起琴弦为对象 {fret, preferFlat}，旧备份仍可能是二维元组 [fret, preferFlat]。
const isValidStringEntity = (value: unknown): value is GuitarStringEntity => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as GuitarStringEntity;
    return (
      typeof obj.fret === 'number' && Number.isFinite(obj.fret) && obj.fret >= -1 && typeof obj.preferFlat === 'boolean'
    );
  }
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
    // 兼容两态：v7 起为对象 {fret, preferFlat}，旧备份仍可能为二维元组 [fret, preferFlat]
    const isStringsValid = raw['strings'].every(
      (s): s is GuitarStringEntity =>
        (typeof s === 'object' && s !== null && typeof (s as GuitarStringEntity).fret === 'number') ||
        (Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'boolean')
    );
    if (!isStringsValid) return null;
  }

  const rawOffset = raw['fretOffset'];
  const rawCapo = raw['capo'];
  const fretOffset = isFretOffsetValue(rawOffset) ? rawOffset : isCapoValue(rawCapo) ? toFretOffset(rawCapo) : 0;

  const draft: Chord = {
    ...(raw as unknown as Chord),
    fretCount,
    fretOffset,
    tuning: Object.values(Tuning).includes(raw['tuning'] as Tuning) ? (raw['tuning'] as Tuning) : Tuning.STANDARD,
    rootStringIndex: resolveRootStringIndex(raw),
  };
  // 只有 chordName 的老数据：不预置 nameSegments（也不能压成 null），
  // 让 normalizeChord 的迁移分支从 chordName 派生 nameSegments——
  // 预先写 null 会把该分支判成死代码，老和弦名随后被静默丢弃
  if (raw['nameSegments'] !== undefined) {
    draft.nameSegments = raw['nameSegments'] as Chord['nameSegments'];
  }
  const { chord } = normalizeChord(draft);
  return chord;
};

/**
 * 横按序列的「重复判定」签名：统一收口到 coordinates.computeBarresSignature({withFinger:true})
 * （含 finger 指序；渲染缓存键用的是同函数的缺省无 finger 口径——一处实现，两种口径）。
 * 指纹不含 barres，读库去重必须补充比对，否则「同指法不同横按」两条共存入库、下次启动静默丢一条，
 * 并经 hydrateMergeMapping 把乐谱引用重定向到错的那条——N3。
 */
const barresSignature = (chord: Chord): string => computeBarresSignature(chord.barres, { withFinger: true });

export const dedupeChordsByFingerprint = (
  chords: Chord[]
): { kept: Chord[]; dupes: Chord[]; mapping: Map<string, string> } => {
  const seen = new Map<string, string>();
  const kept: Chord[] = [];
  const dupes: Chord[] = [];
  /** 被丢弃 id → 保留 id：调用方据以重定向乐谱槽位引用，避免死引用 */
  const mapping = new Map<string, string>();

  for (const chord of chords) {
    const fingerprint = `${chord.groupId}::${computeChordFingerprint(chord)}::${barresSignature(chord)}`;
    const keptId = seen.get(fingerprint);
    if (keptId !== undefined) {
      dupes.push(chord);
      mapping.set(chord.id, keptId);
      continue;
    }
    seen.set(fingerprint, chord.id);
    kept.push(chord);
  }

  return { kept, dupes, mapping };
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

export const sanitizeChords = (
  chords: unknown,
  validGroupIds: Set<string>
): { chords: Chord[]; mergedIds: Map<string, string> } => {
  if (!Array.isArray(chords)) return { chords: [], mergedIds: new Map() };
  const byGroup = chords
    .map(raw => sanitizeChordEntity(raw))
    .filter((chord): chord is Chord => chord !== null && validGroupIds.has(chord.groupId));
  const { kept, mapping } = dedupeChordsByFingerprint(byGroup);
  return { chords: kept, mergedIds: mapping };
};

export const sanitizeChordLibrary = (data: {
  groups?: unknown;
  chords?: unknown | null;
}): { groups: Group[]; chords: Chord[]; mergedIds: Map<string, string> } => {
  const now = Date.now();
  const groups = fillMissingTimestamps(sanitizeGroups(data.groups), now) as Group[];
  const sanitized = sanitizeChords(data.chords, new Set(groups.map(g => g.id)));
  const chords = fillMissingTimestamps(sanitized.chords, now);
  return { groups, chords, mergedIds: sanitized.mergedIds };
};

export interface ChordLibrarySnapshot {
  groups: Group[];
  chords: Chord[];
  /** load 清洗去重产生的重定向映射（被丢弃 id → 保留 id），供桥接层修复乐谱槽位引用 */
  mergedIds?: Map<string, string>;
}

/**
 * 和弦库仓储：IDB（groups / chords 两库，save 为跨库单事务原子写）。
 * load 走清洗层兜底（容错历史/手工改库的脏数据）；save 的实体均已经过规范化，直接落库。
 */
export interface ChordLibraryRepository {
  load(): Promise<ChordLibrarySnapshot>;
  save(snapshot: ChordLibrarySnapshot): Promise<void>;
}

/**
 * 上一次成功落库的实体引用镜像（id → 实体）。save 据此做按条 diff：
 * - 引用相同 ⇒ 内容未变 ⇒ 跳过 put（免掉每条 toPlainPersistable 深拷贝与无谓写放大）；
 * - 镜像有而快照无 ⇒ 该记录已被删除 ⇒ delete；
 * - 其余（新增/替换）⇒ put。
 * 依赖 chordStore 的既有约定：所有变更路径都是**不可变替换**（含撤销恢复孤儿收容），
 * 引用相等 ⇔ 内容相等；DevPanel 直清 IDB 不经 save，镜像不会被污染。
 * 失败安全：事务失败时镜像不更新，下一次 save 以旧镜像重试完整 diff——不会漏写。
 * 两协议不变：groups/chords 同事务原子写；「读库失败不得开写回门」由 chordStore.persistAll
 * 的 hydrated 门禁保证，save 自身不涉及。
 */
let lastSavedGroups: Map<string, Group> = new Map();
let lastSavedChords: Map<string, Chord> = new Map();

export const chordRepository: ChordLibraryRepository = {
  async load() {
    const [rawGroups, rawChords] = await Promise.all([idb.getAll('groups'), idb.getAll('chords')]);
    const snapshot = sanitizeChordLibrary({ groups: rawGroups, chords: rawChords });
    // 用清洗结果初始化镜像：store 的 hydrate 直接持有本快照引用，首次 save 即可按引用
    // diff 到「零变更」——消除旧实现「水合后任何一次落库都全量重写整库」的启动写放大
    lastSavedGroups = new Map(snapshot.groups.map(g => [g.id, g]));
    lastSavedChords = new Map(snapshot.chords.map(c => [c.id, c]));
    return snapshot;
  },
  async save(snapshot) {
    await idb.runTx(['groups', 'chords'], 'readwrite', get => {
      const groupStore = get('groups');
      const chordStore = get('chords');
      // toRaw：store 传入的可能是响应式代理，Proxy 无法被 IDB structuredClone（DataCloneError）。
      // 引用相同（上轮已落库且此后未被不可变替换）⇒ 内容未变 ⇒ 跳过深拷贝与 put
      for (const group of snapshot.groups) {
        if (lastSavedGroups.get(group.id) !== group) groupStore.put(toPlainPersistable(group));
      }
      for (const chord of snapshot.chords) {
        if (lastSavedChords.get(chord.id) !== chord) chordStore.put(toPlainPersistable(chord));
      }
      // 镜像里有而快照里没有 ⇒ 本轮被删除
      for (const id of lastSavedGroups.keys()) {
        if (!snapshot.groups.some(g => g.id === id)) groupStore.delete(id);
      }
      for (const id of lastSavedChords.keys()) {
        if (!snapshot.chords.some(c => c.id === id)) chordStore.delete(id);
      }
    });
    // 只在事务成功提交后更新镜像：失败时旧镜像保留，下一次 save 以旧镜像重试完整 diff，不漏写
    lastSavedGroups = new Map(snapshot.groups.map(g => [g.id, g]));
    lastSavedChords = new Map(snapshot.chords.map(c => [c.id, c]));
  },
};
