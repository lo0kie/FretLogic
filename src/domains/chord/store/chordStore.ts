/**
 * 和弦 store：和弦与分组数据的加载、增删改、排序及持久化。
 * 维护分组-和弦卡片视图模型（GroupedChordCard）与和弦指法历史（撤销-重做）。
 * 纯逻辑拆分见同目录：chordGrouping（分组卡片构建）、chordEventBus（跨领域事件）、
 * chordDraftValidation（草稿校验）、chordMergeOps（重复合并检测）。
 */
import { computed, ref, toRaw, watch } from 'vue';

import { useDebounceFn, useRefHistory, useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import { createChordRepository } from '@/domains/chord/model/chordRepository';
import { buildGroupVariant, createGroup, getGroupSortKey, toGroupId } from '@/domains/chord/theory/entityFactories';
import { matchChordSearch, sortChordsByRule } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { cloneDeep, generateUUID } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import { validateChordDraft } from './chordDraftValidation';
import { createChordEventBus } from './chordEventBus';
import { buildGroupedChordCards, buildMultiFingeringData, nameKeyOf } from './chordGrouping';
import { detectMergedDuplicates } from './chordMergeOps';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';

const DEFAULT_SORT_RULE: GroupSortRule = GroupSortRule.ROOT_PITCH;

export type { ChordValidationResult } from './chordDraftValidation';

export const useChordStore = defineStore('chord', () => {
  const chordRepository = createChordRepository(localStorage);
  // 和弦列表体积大（大库下全量 JSON 序列化达 MB 级），持久化不走 useStorage：
  // ① useStorage 的深度 watch 每次变更都在触发帧内深遍历整个列表（千级和弦 = 数万次 proxy 读）；
  // ② 其 listenToStorageChanges 默认开着，防抖写入会触发 storage 事件被自己读回——
  //    JSON.parse 全量 4MB → 重新赋值 → 再触发一轮快照克隆 + 视图模型重建（实测单次 260ms 长任务）。
  // 改为普通 ref + 浅 watch（全部变更都是整列表替换，见下）+ 400ms 防抖写，与乐谱域 songPersistence 对齐；
  // 「防抖窗口内刷新丢数据」由下方 pagehide / visibilitychange 强制刷盘兜底。多标签页实时同步随之关闭
  // （此前 storage 回环在千级数据下得不偿失）。
  const savedChordsList = ref<Chord[]>([]);
  // 分组列表体积小，useStorage 立即同步写没有感知成本
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

  // 持久化分层：和弦列表变更经浅 watch 感知（整列表替换必改引用），400ms 防抖全量写；
  // 保存等关键入口提供 flushChordsToStorage 作为同步刷盘保障
  const persistChordsDebounced = useDebounceFn(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(toRaw(savedChordsList.value)));
    } catch {
      // 存储失败静默忽略
    }
  }, 400);
  watch(savedChordsList, () => persistChordsDebounced());

  // 启动时以 chordRepository 清洗与迁移后的数据为准，避免全量 JSON.stringify 比对
  {
    const sanitized = chordRepository.load();
    groups.value = sanitized.groups;
    savedChordsList.value = sanitized.chords;
  }

  // 每次提交都会克隆整个和弦列表，容量控制在 8 份以限制内存驻留。
  // deep: false —— 所有变更路径都是整列表替换（唯一例外「撤销恢复孤儿收容」也已改为不可变更新），
  // 浅比较即可感知；省掉每次变更对千级列表的深度遍历。
  const { undo: rawUndo } = useRefHistory(savedChordsList, {
    capacity: 8,
    deep: false,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  // ---- 派生视图模型（纯逻辑见 chordGrouping） ----
  const groupChordMap = computed(() => {
    const map = new Map<string, Chord[]>();
    savedChordsList.value.forEach(chord => {
      const list = map.get(chord.groupId);
      if (list) list.push(chord);
      else map.set(chord.groupId, [chord]);
    });
    return map;
  });

  const multiFingeringData = computed(() => buildMultiFingeringData(savedChordsList.value));

  const groupedChordMap = computed(() =>
    buildGroupedChordCards(groups.value, groupChordMap.value, multiFingeringData.value, DEFAULT_SORT_RULE)
  );

  /** 查询指定分组下某和弦名的多指法卡片；不存在或仅单指法时返回 null。 */
  const getMultiFingering = (groupId: string, chordName: string): GroupedChordCard | null => {
    if (!groupId || !chordName) return null;
    return multiFingeringData.value.get(groupId)?.get(nameKeyOf(chordName)) ?? null;
  };

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

  // ---- 分组选中 / 展开 / CRUD ----

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

  // ---- 跨领域副作用事件（机制见 chordEventBus） ----
  const eventBus = createChordEventBus();

  /** 删除分组及其名下全部和弦，并联动清除展开/选中状态（两者均写入 localStorage）。 */
  const deleteGroup = (groupId: string) => {
    // 单趟同时完成「挑出待删 id」与「保留其余和弦」：拆成 filter + map + filter 是三次全量遍历
    // （千级列表下纯属重复扫描），与 removeChords 的单趟写法对齐
    const removedChordIds: string[] = [];
    const keptChords: Chord[] = [];
    for (const chord of savedChordsList.value) {
      if (chord.groupId === groupId) removedChordIds.push(chord.id);
      else keptChords.push(chord);
    }
    savedChordsList.value = keptChords;
    groups.value = groups.value.filter(g => g.id !== groupId);
    if (expandedGroupId.value === groupId) expandedGroupId.value = null;
    if (selectedGroupId.value === groupId) {
      selectedGroupId.value = null;
    }
    eventBus.emitChordsRemoved(removedChordIds);
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
   * 供保存/更新等关键动作成功后调用，消除防抖窗口与 Vue 响应式 watch 微任务延迟，
   * 避免用户操作后光速刷新导致数据未落盘。
   */
  const flushChordsToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHORD_LIST, JSON.stringify(toRaw(savedChordsList.value)));
    } catch {
      // 存储失败静默忽略（与 useStorage 行为一致）
    }
  };

  // 防抖落盘的兜底：页面隐藏 / 关闭（含刷新）前把仍在防抖窗口内的变更强制落盘。
  // 关闭前这一次全量写不影响交互感知；没有它，防抖窗口内的刷新会丢掉最后一次变更。
  if (typeof window !== 'undefined') {
    const flushOnHide = () => flushChordsToStorage();
    window.addEventListener('pagehide', flushOnHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    });
  }

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

    const sameNameVariants = savedChordsList.value.filter(
      c => c.groupId === resolvedTargetGroupId && nameKeyOf(c) === targetName
    );
    const { droppedIds, mergeMapping } = detectMergedDuplicates(sameNameVariants, movedIds);
    if (droppedIds.size === 0) return;

    savedChordsList.value = savedChordsList.value.filter(c => !droppedIds.has(c.id));
    eventBus.emitChordsMerged(mergeMapping);
  };

  /**
   * 执行撤销并做孤儿数据修复：撤销后若存在指向已删分组的和弦，
   * 自动创建（或复用）"已恢复的和弦"分组将其收容，避免数据丢失。
   */
  const executeUndoRestore = () => {
    const beforeIds = new Set(savedChordsList.value.map(c => c.id));
    rawUndo();
    // 撤销后重新出现的和弦即"被恢复的和弦"，广播给乐谱侧回填此前的槽位解绑
    eventBus.emitChordsRestored(savedChordsList.value.filter(c => !beforeIds.has(c.id)).map(c => c.id));
    const validGroupIds = new Set(groups.value.map(g => g.id));
    // 存在性检测用 some：命中即提前退出，且比 forEach + 外部 flag 更直白
    const hasOrphans = savedChordsList.value.some(chord => !validGroupIds.has(chord.groupId));
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
    // 孤儿收容必须走不可变更新（替换整列表）：和弦历史与持久化 watch 均为浅比较，
    // 原地改 chord.groupId 不会触发快照提交与落盘
    savedChordsList.value = savedChordsList.value.map(chord =>
      validGroupIds.has(chord.groupId) ? chord : { ...chord, groupId: recoveryGroup!.id }
    );
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
    eventBus.emitChordsRemoved([...targetIds]);
    return targetIds;
  };

  /**
   * 将编辑草稿校验并构建为可保存的和弦实体（校验逻辑见 chordDraftValidation）。
   */
  const buildChordForSave = (draft: Chord, isEditing: boolean) =>
    validateChordDraft(draft, isEditing, {
      groups: groups.value,
      selectedGroupId: selectedGroupId.value,
      savedChords: savedChordsList.value,
    });

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
    onChordsRemoved: eventBus.onChordsRemoved,
    onChordsRestored: eventBus.onChordsRestored,
    onChordsMerged: eventBus.onChordsMerged,
    buildChordForSave,
    replaceAllData,
  };
});
