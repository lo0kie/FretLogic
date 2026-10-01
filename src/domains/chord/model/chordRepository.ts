import { buildGroupVariant } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import { Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { isCapoValue, isFretOffsetValue, toFretOffset } from '@/domains/fretboard/model/coordinates';
import { idb } from '@/platform/services/storage';
import {
  createOrderIndexTracker,
  defineOrderIndex,
  orderEntitiesByIndex,
} from '@/platform/services/storage/orderIndex';
import { DEFAULT_FRET_COUNT, FRET_COUNTS, MUTED_FRET } from '@/platform/types/instrument';
import {
  fillMissingTimestamps,
  isBoolean,
  isNumber,
  isObject,
  isString,
  isValidTimestamp,
  toPlainPersistable,
} from '@/platform/utils/common';

import { computeChordContentKey } from './chordContentSignature';

import type { Chord, ChordDraft, Group, StringIndex } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/platform/types/instrument';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord => isObject(value) && !Array.isArray(value);
const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  isNumber(value) && Number.isFinite(value) && value >= min && value <= max;

// strict 与 repair 共用的结构校验：品位只需为有限数且 >= -1（-1 静音 / 0 空弦 / 正整数）
// 越界品位（> fretCount）不在结构层拒绝整条记录，统一交给 normalizeChord 的 boundFret 置 MUTED_FRET 静音，
// 避免「加载时静默丢弃历史和弦」与导入链路的清洗策略不一致。
// 兼容两态：v7 起琴弦为对象 {fret, preferFlat}，旧备份仍可能是二维元组 [fret, preferFlat]。
const isValidStringEntity = (value: unknown): value is GuitarStringEntity => {
  if (isObject(value) && !Array.isArray(value)) {
    const obj = value as GuitarStringEntity;
    return isNumber(obj.fret) && Number.isFinite(obj.fret) && obj.fret >= MUTED_FRET && isBoolean(obj.preferFlat);
  }
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isNumber(value[0]) &&
    Number.isFinite(value[0]) &&
    value[0] >= -1 &&
    isBoolean(value[1])
  );
};

export type GroupDraft = Omit<Group, 'createdAt' | 'updatedAt'> & Partial<Pick<Group, 'createdAt' | 'updatedAt'>>;
// ChordDraft 与 Chord 同处声明（chord/types.ts），本行只为「草稿三件套同一入口」而重导出
export type { ChordDraft };

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

  // 兼容两态：v7 对象 {fret, preferFlat} 与旧元组 [fret, preferFlat]。
  // 导入链路会先把元组迁移成对象（migratePayloadVersion v6→v7），而 IDB 存量本身就是对象形态——
  // 若此处只认元组，两条载入路径的 rootStringIndex 都会被清成 null（根音标记整体丢失，实测复现）。
  const stringEntity: unknown = chord['strings'][index];
  const fret = Array.isArray(stringEntity)
    ? stringEntity[0]
    : (stringEntity as { fret?: unknown } | null | undefined)?.fret;
  return isNumber(fret) && Number.isFinite(fret) && fret >= 0 ? (index as StringIndex) : null;
};

export const sanitizeChordEntity = (raw: unknown, options?: { mode?: 'strict' | 'repair' }): ChordDraft | null => {
  const mode = options?.mode ?? 'strict';
  if (!isRecord(raw)) return null;
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  if (typeof raw['groupId'] !== 'string' || !raw['groupId']) return null;
  if (!raw['chordName'] && !raw['nameSegments']) return null;
  if (!Array.isArray(raw['strings']) || raw['strings'].length < 3 || raw['strings'].length > 10) return null;

  // 品位上界取决于 fretCount（窗口相对语义），越界值由末端 normalizeChord 统一钳制
  const fretCount: Chord['fretCount'] = FRET_COUNTS.includes(raw['fretCount'] as Chord['fretCount'])
    ? (raw['fretCount'] as Chord['fretCount'])
    : DEFAULT_FRET_COUNT;

  if (mode === 'strict') {
    if (!raw['strings'].every(s => isValidStringEntity(s))) return null;
  } else {
    // 兼容两态：v7 起为对象 {fret, preferFlat}，旧备份仍可能为二维元组 [fret, preferFlat]
    const isStringsValid = raw['strings'].every(
      (s): s is GuitarStringEntity =>
        (isObject(s) && isNumber((s as GuitarStringEntity).fret)) ||
        (Array.isArray(s) && s.length === 2 && isNumber(s[0]) && isBoolean(s[1]))
    );
    if (!isStringsValid) return null;
  }

  const rawOffset = raw['fretOffset'];
  const rawCapo = raw['capo'];
  const fretOffset = isFretOffsetValue(rawOffset) ? rawOffset : isCapoValue(rawCapo) ? toFretOffset(rawCapo) : 0;

  // 白名单式构造：清洗层的承诺是「只留已知字段」（payload 的 zod 门禁只做结构判断、不做字段收口），
  // 而 `...(raw as unknown as ChordDraft)` 会把外来备份里的任意未知键一路带进实体、落盘并长期驻留
  // —— IDB 载入路径同样经过本函数，脏键因此永不自愈。故逐字段显式搬运。
  //
  // 只有 chordName 的老数据：不预置 nameSegments（也不能压成 null），让 normalizeChord 的迁移分支
  // 从 chordName 派生 nameSegments —— 预先写 null 会把该分支判成死代码，老和弦名随后被静默丢弃。
  // chordName 不是 ChordDraft 的字段，但它正是那条迁移分支的输入（normalizeChord 读后即删），
  // 故只在本就是字符串时搬运；capo 则已在上面的 fretOffset 归一里消费掉，不必再传。
  // 收尾那一次窄化表达的是「此刻正是草稿态」：nameSegments / chordName 至多缺一个，字面量拼不出完整 ChordDraft。
  const draft = {
    id: raw['id'],
    groupId: raw['groupId'],
    strings: raw['strings'],
    fretCount,
    fretOffset,
    tuning: Object.values(Tuning).includes(raw['tuning'] as Tuning) ? (raw['tuning'] as Tuning) : Tuning.STANDARD,
    rootStringIndex: resolveRootStringIndex(raw),
    ...(raw['nameSegments'] !== undefined ? { nameSegments: raw['nameSegments'] } : {}),
    ...(isString(raw['chordName']) ? { chordName: raw['chordName'] } : {}),
    ...(Array.isArray(raw['barres']) ? { barres: raw['barres'] } : {}),
    ...(isValidTimestamp(raw['createdAt']) ? { createdAt: raw['createdAt'] } : {}),
    ...(isValidTimestamp(raw['updatedAt']) ? { updatedAt: raw['updatedAt'] } : {}),
  } as unknown as ChordDraft;

  const { chord } = normalizeChord(draft);
  return chord;
};

/**
 * 读库去重：指纹 + 横按（含指序）＝ 判等口径的内容键（见 chordContentSignature）。
 *
 * 指纹不含 barres，必须由内容键补齐，否则「同指法不同横按」两条共存入库、下次启动静默丢一条，
 * 并经 hydrateMergeMapping 把乐谱引用重定向到错的那条——N3。
 * 分组维度另拼在键前：同一指法落在不同分组是两条记录，不算重复。
 */
export const dedupeChordsByFingerprint = <T extends ChordDraft>(
  chords: T[]
): { kept: T[]; dupes: T[]; mapping: Map<string, string> } => {
  const seen = new Map<string, string>();
  const kept: T[] = [];
  const dupes: T[] = [];
  /** 被丢弃 id → 保留 id：调用方据以重定向乐谱槽位引用，避免死引用 */
  const mapping = new Map<string, string>();

  for (const chord of chords) {
    const fingerprint = `${chord.groupId}::${computeChordContentKey(chord)}`;
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

export const sanitizeGroups = (groups: unknown): GroupDraft[] => {
  if (!Array.isArray(groups)) return [];
  return groups.map(sanitizeGroupEntity).filter((group): group is GroupDraft => group !== null);
};

export const sanitizeChords = (
  chords: unknown,
  validGroupIds: Set<string>
): { chords: ChordDraft[]; mergedIds: Map<string, string> } => {
  if (!Array.isArray(chords)) return { chords: [], mergedIds: new Map() };
  const byGroup = chords
    .map(raw => sanitizeChordEntity(raw))
    .filter((chord): chord is ChordDraft => chord !== null && validGroupIds.has(chord.groupId));
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
  // 时间戳补齐即实体：ChordDraft 与 Chord 只差这两个字段，故无需再窄化
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

/**
 * 分组顺序索引：与歌曲同一个成因（见 songRepository 的 'song-order' 索引）——
 * IDB 的 getAll 按主键序返回，而分组主键是裸随机 UUID，顺序信息不在实体里，
 * 不单独存的话用户拖拽出来的分组顺序每次刷新都会复原。
 * 元记录形状、按索引重排与「顺序变了才写 meta」的落库 diff 均由 platform 的
 * orderIndex 基础设施承载（orderEntitiesByIndex / OrderIndexTracker）。
 */
const groupOrderIndex = defineOrderIndex('group-order');
const groupOrderTracker = createOrderIndexTracker();

export const chordRepository: ChordLibraryRepository = {
  async load() {
    const [rawGroups, rawChords, orderMeta] = await Promise.all([
      idb.getAll('groups'),
      idb.getAll('chords'),
      idb.get('syncMeta', groupOrderIndex.key),
    ]);
    const snapshot = sanitizeChordLibrary({ groups: rawGroups, chords: rawChords });
    // 清洗不动顺序，故按顺序索引重排必须在清洗之后、且在初始化镜像之前
    // （镜像要与 store 拿到的同一个数组顺序一致，否则首次 save 会误判「顺序变了」而多写一次索引）
    snapshot.groups = orderEntitiesByIndex(snapshot.groups, orderMeta?.ids, group => group.id);
    // 用清洗结果初始化镜像：store 的 hydrate 直接持有本快照引用，首次 save 即可按引用
    // diff 到「零变更」——消除旧实现「水合后任何一次落库都全量重写整库」的启动写放大
    lastSavedGroups = new Map(snapshot.groups.map(g => [g.id, g]));
    lastSavedChords = new Map(snapshot.chords.map(c => [c.id, c]));
    groupOrderTracker.markSaved(snapshot.groups.map(g => g.id));
    return snapshot;
  },
  async save(snapshot) {
    // 顺序索引与实体同事务：一个事务里既写实体也写顺序，二者不会各自落一半
    const orderIds = snapshot.groups.map(g => g.id);
    const orderChanged = groupOrderTracker.isChanged(orderIds);

    await idb.runTx(['groups', 'chords', 'syncMeta'], get => {
      const groupStore = get('groups');
      const chordStore = get('chords');
      // toRaw：store 传入的可能是响应式代理，Proxy 无法被 IDB structuredClone（DataCloneError）。
      // 引用相同（上轮已落库且此后未被不可变替换）⇒ 内容未变 ⇒ 跳过深拷贝与 put
      for (const group of snapshot.groups)
        if (lastSavedGroups.get(group.id) !== group) groupStore.put(toPlainPersistable(group));

      for (const chord of snapshot.chords)
        if (lastSavedChords.get(chord.id) !== chord) chordStore.put(toPlainPersistable(chord));

      // 镜像里有而快照里没有 ⇒ 本轮被删除
      for (const id of lastSavedGroups.keys()) if (!snapshot.groups.some(g => g.id === id)) groupStore.delete(id);

      for (const id of lastSavedChords.keys()) if (!snapshot.chords.some(c => c.id === id)) chordStore.delete(id);

      // 实体 put 是按 id 覆盖、不带顺序信息，纯换序（拖拽排序：整表引用替换而元素引用不变）
      // 在实体侧 diff 里是完全静默的 —— 顺序必须靠这条索引记录落地
      if (orderChanged) get('syncMeta').put(groupOrderIndex.createMeta(orderIds));
    });
    // 只在事务成功提交后更新镜像：失败时旧镜像保留，下一次 save 以旧镜像重试完整 diff，不漏写
    lastSavedGroups = new Map(snapshot.groups.map(g => [g.id, g]));
    lastSavedChords = new Map(snapshot.chords.map(c => [c.id, c]));
    // 顺序未变时 markSaved 写入的与现基准是同一个签名，与原「仅变化时更新」等价
    groupOrderTracker.markSaved(orderIds);
  },
};
