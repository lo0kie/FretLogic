/**
 * 和弦 store：和弦与分组数据的加载、增删改、排序及持久化。
 * 维护分组-和弦卡片视图模型（GroupedChordCard）与和弦指法历史（撤销-重做）。
 */
import { computed, ref, toRaw, watch } from 'vue';

import { useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import { createChordRepository } from '@/domains/chord/model/chordRepository';
import {
  buildGroupVariant,
  createChord,
  createGroup,
  getGroupSortKey,
  toGroupId,
} from '@/domains/chord/theory/entityFactories';
import {
  computeChordFingerprint,
  computeIsInverted,
  getChordName,
  isValidChordName,
  matchChordSearch,
  segmentsToString,
  sortChordsByRule,
  validateBassConsistency,
} from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { areBarresEqual } from '@/domains/fretboard/model/coordinates';
import { cloneDeep, cloneGuitarStrings, generateUUID } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { ChordOrName } from '@/domains/chord/theory/theory';
import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';

const DEFAULT_SORT_RULE: GroupSortRule = GroupSortRule.ROOT_PITCH;

type ChordValidationResult =
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

/** 计算和弦的归一化名称键（去空格、转小写），用于同名变体的分组匹配。 */
function nameKeyOf(chordOrName: string | ChordOrName): string {
  if (typeof chordOrName === 'string') return chordOrName.trim().toLowerCase();
  return getChordName(chordOrName).trim().toLowerCase();
}

/** 对同一和弦名的多个指法变体排序：转位在后，其余按品位偏移升序。 */
function sortVariants(variants: Chord[]): Chord[] {
  return [...variants].sort((a, b) => {
    const aInv = computeIsInverted(a.strings, a.fretOffset, a.tuning, a, a.rootStringIndex);
    const bInv = computeIsInverted(b.strings, b.fretOffset, b.tuning, b, b.rootStringIndex);
    if (aInv !== bInv) return aInv ? 1 : -1;
    return (a.fretOffset ?? 0) - (b.fretOffset ?? 0);
  });
}

/** 将一组同名和弦变体包装成卡片视图模型，取排序后的首个作为主指法。 */
function toGroupedCard(variants: Chord[]): GroupedChordCard {
  const sorted = variants.length > 1 ? sortVariants(variants) : variants;
  return {
    mainChord: sorted[0]!,
    variants: sorted,
    hasVariants: sorted.length > 1,
    variantCount: sorted.length,
  };
}

export const useChordStore = defineStore('chord', () => {
  const chordRepository = createChordRepository(localStorage);
  // 不启用防抖：任何变更（保存/删除/排序/换组）立即写入 localStorage，
  // 避免刷新时落入防抖窗口导致数据回退
  const savedChordsList = useStorage<Chord[]>(STORAGE_KEYS.CHORD_LIST, [], localStorage);
  const groups = useStorage<Group[]>(STORAGE_KEYS.GROUPS, [], localStorage);
  // 选中/展开分组仅内存态：URL `?group=` 是唯一数据源，localStorage 只维护一个「最近编辑分组」指针
  // 供裸访问入口冷启动回灌；不再双写完整选中态。
  const selectedGroupId = ref<string | null>(null);
  // 单一展开状态同属内存态（与 selectedGroupId 联动，URL group 回灌时经 selectAndExpandGroup 一并恢复）
  const expandedGroupId = ref<string | null>(null);
  /** 判断分组是否处于折叠态（与当前展开分组 id 比对）。 */
  const isGroupCollapsed = (groupId: string): boolean => expandedGroupId.value !== groupId;

  // 「最近编辑分组」冷启动指针：选中非空时写入；取消选中时清除，
  // 避免「关闭分组后刷新」被冷启动回灌重新打开（URL 方已移除 group 参数，指针须同步失效）
  watch(selectedGroupId, id => {
    if (typeof localStorage === 'undefined') return;
    if (id) localStorage.setItem(STORAGE_KEYS.LAST_GROUP_ID, id);
    else localStorage.removeItem(STORAGE_KEYS.LAST_GROUP_ID);
  });

  // 持久化分层：常规变更由 useStorage 响应式自动同步；保存等关键入口提供 flushChordsToStorage 作为同步刷盘保障

  // 启动时以 chordRepository 清洗与迁移后的数据为准，避免全量 JSON.stringify 比对
  {
    const sanitized = chordRepository.load();
    groups.value = sanitized.groups;
    savedChordsList.value = sanitized.chords;
  }

  // 每次提交都会克隆整个和弦列表，容量控制在 8 份以限制内存驻留
  const { undo: rawUndo } = useRefHistory(savedChordsList, {
    capacity: 8,
    deep: true,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    savedChordsList.value.forEach(chord => {
      const list = map.get(chord.groupId);
      if (list) list.push(chord);
      else map.set(chord.groupId, [chord]);
    });
    return map;
  });

  const multiFingeringData = computed(() => {
    const byGroup = new Map<string, Map<string, Chord[]>>();
    savedChordsList.value.forEach(chord => {
      const key = nameKeyOf(chord);
      let nameMap = byGroup.get(chord.groupId);
      if (!nameMap) {
        nameMap = new Map();
        byGroup.set(chord.groupId, nameMap);
      }
      const list = nameMap.get(key);
      if (list) list.push(chord);
      else nameMap.set(key, [chord]);
    });

    const result = new Map<string, Map<string, GroupedChordCard>>();
    byGroup.forEach((nameMap, groupId) => {
      const multiMap = new Map<string, GroupedChordCard>();
      nameMap.forEach((variants, key) => {
        if (variants.length <= 1) return;
        multiMap.set(key, toGroupedCard(variants));
      });
      if (multiMap.size > 0) result.set(groupId, multiMap);
    });
    return result;
  });

  /** 查询指定分组下某和弦名的多指法卡片；不存在或仅单指法时返回 null。 */
  const getMultiFingering = (groupId: string, chordName: string): GroupedChordCard | null => {
    if (!groupId || !chordName) return null;
    return multiFingeringData.value.get(groupId)?.get(nameKeyOf(chordName)) ?? null;
  };

  const groupedChordMap = computed(() => {
    const result = new Map<string, GroupedChordCard[]>();
    groups.value.forEach(group => {
      const chords = groupChordMap.value.get(group.id) ?? [];
      const multi = multiFingeringData.value.get(group.id);
      const visited = new Set<string>();
      const cards: GroupedChordCard[] = [];

      chords.forEach(chord => {
        const key = nameKeyOf(chord);
        if (visited.has(key)) return;
        visited.add(key);
        cards.push(multi?.get(key) ?? toGroupedCard([chord]));
      });

      const sortedMains = sortChordsByRule(
        cards.map(c => c.mainChord),
        group.sortRule ?? DEFAULT_SORT_RULE,
        getGroupSortKey(group) ?? 'C'
      );
      const byMainId = new Map(cards.map(c => [c.mainChord.id, c]));
      result.set(group.id, sortedMains.map(m => byMainId.get(m.id)!).filter(Boolean));
    });
    return result;
  });

  /** 获取分组内按规则排序后的和弦卡片列表；传入搜索词时仅保留匹配项。 */
  const getGroupedCards = (groupId: string, searchQuery = ''): GroupedChordCard[] => {
    const cards = groupedChordMap.value.get(groupId) ?? [];
    const q = searchQuery.trim();
    if (!q) return cards;
    return cards.filter(card => matchChordSearch(card.mainChord, q));
  };

  /**
   * 获取和弦列表，支持按分组或全部分组（groupId 传 'ALL'）查询。
   * 可选覆盖搜索词与排序规则；未显式指定时沿用分组自身配置。
   */
  const getFilteredChords = (
    groupId: string,
    options: {
      searchQuery?: string;
      sortRule?: GroupSortRule;
      sortKey?: string;
    } = {}
  ): Chord[] => {
    const { searchQuery = '', sortRule, sortKey } = options;
    const q = searchQuery.trim();

    if (groupId !== 'ALL') {
      const group = groups.value.find(g => g.id === groupId);
      const effectiveRule = sortRule ?? group?.sortRule ?? DEFAULT_SORT_RULE;
      const effectiveKey = sortKey ?? (group ? getGroupSortKey(group) : undefined) ?? 'C';
      const cards = getGroupedCards(groupId, q);
      const chords = cards.flatMap(card => card.variants);
      return sortChordsByRule(chords, effectiveRule, effectiveKey);
    }

    let list = savedChordsList.value;
    if (q) {
      list = list.filter(c => matchChordSearch(c, q));
    }
    const effectiveRule = sortRule ?? DEFAULT_SORT_RULE;
    const effectiveKey = sortKey ?? 'C';
    return sortChordsByRule(list, effectiveRule, effectiveKey);
  };

  /** 用新列表整体覆盖分组列表（写入 localStorage）。 */
  const overwriteGroups = (newGroups: Group[]) => {
    groups.value = [...newGroups];
  };

  /** 设置当前选中分组 id；传 null 表示取消选中（仅内存，URL `?group=` 承担寻址）。 */
  const setSelectedGroupId = (id: string | null) => {
    selectedGroupId.value = id;
  };

  /** 折叠全部分组（选中/展开态都置空）。 */
  const collapseAllGroups = () => {
    expandedGroupId.value = null;
  };

  /** 选中并展开指定分组；传 null 时取消选中并折叠全部分组。 */
  const selectAndExpandGroup = (id: string | null) => {
    if (!id) {
      collapseAllGroups();
      selectedGroupId.value = null;
      return;
    }
    expandedGroupId.value = id;
    selectedGroupId.value = id;
  };

  /** 切换分组折叠/展开态；单展开模式下展开其一即折叠其余，折叠会联动清除选中。 */
  const toggleGroupCollapsed = (groupId: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g) return;
    if (expandedGroupId.value === groupId) {
      // 折叠当前展开的分组
      expandedGroupId.value = null;
      if (selectedGroupId.value === groupId) selectedGroupId.value = null;
    } else {
      // 展开该分组（同时只展开这一个，其余自动折叠）
      expandedGroupId.value = groupId;
      selectedGroupId.value = groupId;
    }
  };

  /** 新建分组并选中展开；返回创建的分组对象。 */
  const addGroup = (name: string, sortRule: GroupSortRule = DEFAULT_SORT_RULE): Group => {
    const group = createGroup(name, sortRule);
    expandedGroupId.value = group.id;
    groups.value = [...groups.value, group];
    selectedGroupId.value = group.id;
    return group;
  };

  /** 重命名分组；名称去空格后为空或未变化时忽略，并刷新 updatedAt。 */
  const renameGroup = (groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const g = groups.value.find(x => x.id === groupId);
    if (!g || g.name === trimmed) return;
    groups.value = groups.value.map(item =>
      item.id === groupId ? { ...item, name: trimmed, updatedAt: Date.now() } : item
    );
  };

  /** 更新分组排序规则；按调内度数排序时可附带调式主音（sortKey），无变化时跳过。 */
  const updateGroupSort = (groupId: string, sortRule: GroupSortRule, sortKey?: string) => {
    const g = groups.value.find(x => x.id === groupId);
    if (!g) return;
    if (sortRule === GroupSortRule.KEY_DEGREE) {
      const targetKey = sortKey || getGroupSortKey(g) || 'C';
      if (g.sortRule === sortRule && getGroupSortKey(g) === targetKey) return;
      groups.value = groups.value.map(item =>
        item.id === groupId
          ? buildGroupVariant(
              { id: item.id, name: item.name, createdAt: item.createdAt, updatedAt: Date.now() },
              sortRule,
              targetKey
            )
          : item
      );
    } else {
      if (g.sortRule === sortRule && getGroupSortKey(g) === undefined) return;
      groups.value = groups.value.map(item =>
        item.id === groupId
          ? buildGroupVariant(
              { id: item.id, name: item.name, createdAt: item.createdAt, updatedAt: Date.now() },
              sortRule
            )
          : item
      );
    }
  };

  // ---- 跨领域副作用事件：和弦被删除 / 撤销恢复时向外广播（由应用层桥接乐谱槽位解绑，避免 chord→score 反向依赖） ----
  type ChordIdsListener = (chordIds: string[]) => void;
  /** 和弦合并事件参数：key 为被丢弃的重复和弦 id，value 为合并后保留的和弦 id */
  type ChordsMergedListener = (mapping: Map<string, string>) => void;
  const chordsRemovedListeners: ChordIdsListener[] = [];
  const chordsRestoredListeners: ChordIdsListener[] = [];
  const chordsMergedListeners: ChordsMergedListener[] = [];

  /** 订阅「和弦被删除」事件；返回取消订阅函数 */
  const onChordsRemoved = (cb: ChordIdsListener): (() => void) => {
    chordsRemovedListeners.push(cb);
    return () => {
      const idx = chordsRemovedListeners.indexOf(cb);
      if (idx >= 0) chordsRemovedListeners.splice(idx, 1);
    };
  };

  /** 订阅「和弦被撤销恢复」事件；返回取消订阅函数 */
  const onChordsRestored = (cb: ChordIdsListener): (() => void) => {
    chordsRestoredListeners.push(cb);
    return () => {
      const idx = chordsRestoredListeners.indexOf(cb);
      if (idx >= 0) chordsRestoredListeners.splice(idx, 1);
    };
  };

  const emitChordsRemoved = (chordIds: string[]) => {
    if (chordIds.length === 0) return;
    chordsRemovedListeners.forEach(cb => cb(chordIds));
  };

  const emitChordsRestored = (chordIds: string[]) => {
    if (chordIds.length === 0) return;
    chordsRestoredListeners.forEach(cb => cb(chordIds));
  };

  /** 订阅「和弦被合并（重复项丢弃）」事件；返回取消订阅函数 */
  const onChordsMerged = (cb: ChordsMergedListener): (() => void) => {
    chordsMergedListeners.push(cb);
    return () => {
      const idx = chordsMergedListeners.indexOf(cb);
      if (idx >= 0) chordsMergedListeners.splice(idx, 1);
    };
  };

  const emitChordsMerged = (mapping: Map<string, string>) => {
    if (mapping.size === 0) return;
    chordsMergedListeners.forEach(cb => cb(mapping));
  };

  /** 删除分组及其名下全部和弦，并联动清除展开/选中状态（两者均写入 localStorage）。 */
  const deleteGroup = (groupId: string) => {
    const removedChordIds = savedChordsList.value.filter(c => c.groupId === groupId).map(c => c.id);
    savedChordsList.value = savedChordsList.value.filter(c => c.groupId !== groupId);
    groups.value = groups.value.filter(g => g.id !== groupId);
    if (expandedGroupId.value === groupId) expandedGroupId.value = null;
    if (selectedGroupId.value === groupId) {
      selectedGroupId.value = null;
    }
    emitChordsRemoved(removedChordIds);
  };

  /**
   * 用导入的数据整体替换分组与和弦列表（常用于导入/恢复）。
   * 默认折叠全部分组并清空选中；可通过 options 调整。
   */
  const replaceAllData = (data: { groups: Group[]; chords: Chord[] }): void => {
    groups.value = [...data.groups];
    expandedGroupId.value = null;
    savedChordsList.value = [...data.chords];
    selectedGroupId.value = null;
  };

  /** 将和弦插入列表头部（新和弦优先展示）。 */
  const addChord = (chord: Chord) => {
    savedChordsList.value = [chord, ...savedChordsList.value];
  };

  /** 按 id 替换更新指定和弦；id 不存在时静默忽略。 */
  const updateChord = (chord: Chord) => {
    const idx = savedChordsList.value.findIndex(c => c.id === chord.id);
    if (idx < 0) return;
    const next = [...savedChordsList.value];
    next[idx] = chord;
    savedChordsList.value = next;
  };

  /**
   * 同步紧急落盘：立即将和弦列表同步写入 localStorage。
   * 供保存/更新等关键动作成功后调用，消除 Vue 响应式 watch 微任务延迟，避免用户操作后光速刷新导致数据未落盘。
   */
  const flushChordsToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(toRaw(savedChordsList.value)));
    } catch {
      // 存储失败静默忽略（与 useStorage 行为一致）
    }
  };

  /**
   * 将源分组内某和弦名（含全部指法变体）整体移动到目标分组。
   * 移入后若目标分组已存在完全相同的和弦（指纹一致且横按一致），自动合并：
   * 丢弃移入的重复项并广播合并映射，供乐谱侧把槽位引用重定向到保留项，避免产生死引用。
   */
  const moveVariantsByName = (sourceGroupId: string, chordName: string, targetGroupId: string) => {
    if (!groups.value.some(g => g.id === targetGroupId)) return;
    const targetName = nameKeyOf(chordName);
    const now = Date.now();
    const resolvedTargetGroupId = toGroupId(targetGroupId);
    const movedIds = new Set(
      savedChordsList.value.filter(c => c.groupId === sourceGroupId && nameKeyOf(c) === targetName).map(c => c.id)
    );
    if (movedIds.size === 0) return;

    savedChordsList.value = savedChordsList.value.map(c => {
      if (movedIds.has(c.id)) {
        return { ...c, groupId: resolvedTargetGroupId, updatedAt: now };
      }
      return c;
    });

    // 同名变体内两两比对：指纹一致且横按一致才视为"完全相同"（指纹不含 barres，需补充比对）
    const sameNameVariants = savedChordsList.value.filter(
      c => c.groupId === resolvedTargetGroupId && nameKeyOf(c) === targetName
    );
    const droppedIds = new Set<string>();
    const mergeMapping = new Map<string, string>();
    for (let i = 0; i < sameNameVariants.length; i++) {
      const a = sameNameVariants[i]!;
      if (droppedIds.has(a.id)) continue;
      for (let j = i + 1; j < sameNameVariants.length; j++) {
        const b = sameNameVariants[j]!;
        if (droppedIds.has(b.id)) continue;
        if (computeChordFingerprint(a) !== computeChordFingerprint(b)) continue;
        if (!areBarresEqual(a.barres, b.barres)) continue;
        // 优先保留目标分组原有项；两者同为移入项（源分组历史重复数据）时保留靠前者
        const [drop, keep] = movedIds.has(a.id) && !movedIds.has(b.id) ? [a, b] : [b, a];
        droppedIds.add(drop.id);
        mergeMapping.set(drop.id, keep.id);
      }
    }
    if (droppedIds.size === 0) return;

    savedChordsList.value = savedChordsList.value.filter(c => !droppedIds.has(c.id));
    emitChordsMerged(mergeMapping);
  };

  /**
   * 执行撤销并做孤儿数据修复：撤销后若存在指向已删分组的和弦，
   * 自动创建（或复用）"已恢复的和弦"分组将其收容，避免数据丢失。
   */
  const executeUndoRestore = () => {
    const beforeIds = new Set(savedChordsList.value.map(c => c.id));
    rawUndo();
    // 撤销后重新出现的和弦即"被恢复的和弦"，广播给乐谱侧回填此前的槽位解绑
    emitChordsRestored(savedChordsList.value.filter(c => !beforeIds.has(c.id)).map(c => c.id));
    const validGroupIds = new Set(groups.value.map(g => g.id));
    let hasOrphans = false;
    savedChordsList.value.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) hasOrphans = true;
    });
    if (!hasOrphans) return;

    let recoveryGroup = groups.value.find(g => g.id.startsWith('g_recovery_'));
    if (!recoveryGroup) {
      recoveryGroup = {
        id: toGroupId('g_recovery_' + generateUUID().slice(0, 8)),
        name: '已恢复的和弦',
        sortRule: DEFAULT_SORT_RULE,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      groups.value = [recoveryGroup, ...groups.value];
    }
    savedChordsList.value.forEach(chord => {
      if (!validGroupIds.has(chord.groupId)) chord.groupId = recoveryGroup!.id;
    });
  };

  /**
   * 按 id 精确删除指定和弦列表。
   *
   * 必须严格按 id 匹配，不使用指纹兜底——避免两个指法相同但 id 不同的和弦
   * 在用户只删其一时被连带误删。
   * 返回被删除的 id 集合，供调用方同步解绑歌曲中的引用。
   */
  const removeChords = (chords: Chord[]): Set<string> => {
    const targetIds = new Set<string>();
    chords.forEach(c => {
      targetIds.add(c.id);
    });
    if (targetIds.size === 0) return targetIds;
    savedChordsList.value = savedChordsList.value.filter(c => !targetIds.has(c.id));
    // 广播删除事件：由应用层桥接解绑乐谱槽位（返回值保留给需要显式感知的调用方）
    emitChordsRemoved([...targetIds]);
    return targetIds;
  };

  /**
   * 将编辑草稿校验并构建为可保存的和弦实体。
   * 依次校验名称非空、语法合法、分组存在且已选中；编辑模式下识别无修改并保留 createdAt。
   * 同分组内指纹重复视为重复和弦；返回值带低音弦一致性警告（warn）。
   */
  const buildChordForSave = (draft: Chord, isEditing: boolean): ChordValidationResult => {
    const nameSegments = draft.nameSegments;
    const cleanName = nameSegments ? segmentsToString(nameSegments) : '';
    const isFretBoardEmpty = draft.strings.every(s => s[0] < 0);
    if (!cleanName || isFretBoardEmpty) {
      return { ok: false, reason: 'EMPTY_NAME' };
    }
    if (!nameSegments || !isValidChordName(cleanName)) {
      return { ok: false, reason: 'INVALID_CHORD_SYNTAX', cleanName };
    }
    if (groups.value.length === 0) {
      return { ok: false, reason: 'NO_GROUPS' };
    }
    if (!selectedGroupId.value) {
      return { ok: false, reason: 'NO_SELECTED_GROUP' };
    }

    const id = isEditing ? draft.id : null;
    const targetGroupId = isEditing
      ? savedChordsList.value.find(c => c.id === id)?.groupId || selectedGroupId.value
      : selectedGroupId.value;

    const currentStrings = cloneGuitarStrings(draft.strings);
    // 根音标记须指向有效且已按音的弦，否则按未指定处理
    const rootStringIndex =
      draft.rootStringIndex !== null &&
      draft.rootStringIndex !== undefined &&
      draft.rootStringIndex >= 0 &&
      draft.rootStringIndex < currentStrings.length &&
      (currentStrings[draft.rootStringIndex]?.[0] ?? -1) >= 0
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
      const original = savedChordsList.value.find(c => c.id === id);
      // 指纹不含 barres，因此"仅修改横按"时指纹不变；需同时比较 barres 才能识别真正的无修改
      const sameBarres = areBarresEqual(original?.barres, payload.barres);
      if (original && computeChordFingerprint(original) === fingerprint && sameBarres) {
        return { ok: false, reason: 'UNCHANGED' };
      }
      // 编辑保存：保留最初创建时间，刷新更新时间
      if (original?.createdAt !== undefined) payload.createdAt = original.createdAt;
      payload.updatedAt = Date.now();
    }

    const isDuplicate = savedChordsList.value.some(
      existing =>
        existing.id !== id && existing.groupId === payload.groupId && computeChordFingerprint(existing) === fingerprint
    );
    if (isDuplicate) {
      return { ok: false, reason: 'DUPLICATE_FINGERPRINT', cleanName };
    }

    const bassWarn = validateBassConsistency(payload.strings, payload.fretOffset, payload.tuning, payload);
    return { ok: true, payload, cleanName, warn: bassWarn };
  };

  return {
    savedChordsList,
    groups,
    selectedGroupId,
    expandedGroupId,
    groupChordMap,
    groupedChordMap,
    getMultiFingering,
    getGroupedCards,
    getFilteredChords,
    overwriteGroups,
    isGroupCollapsed,
    setSelectedGroupId,
    selectAndExpandGroup,
    toggleGroupCollapsed,
    collapseAllGroups,
    addGroup,
    renameGroup,
    updateGroupSort,
    deleteGroup,
    addChord,
    updateChord,
    flushChordsToStorage,
    moveVariantsByName,
    executeUndoRestore,
    removeChords,
    onChordsRemoved,
    onChordsRestored,
    onChordsMerged,
    buildChordForSave,
    replaceAllData,
  };
});
