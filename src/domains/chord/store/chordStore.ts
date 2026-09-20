/**
 * 和弦 store：和弦与分组数据的加载、增删改、排序及持久化。
 * 维护分组-和弦卡片视图模型（GroupedChordCard）与和弦指法历史（撤销-重做）。
 * 纯逻辑拆分见同目录：chordGrouping（分组卡片构建）、chordEventBus（跨领域事件）、
 * chordDraftValidation（草稿校验）、chordMergeOps（重复合并检测）。
 */
import { computed, nextTick, ref, toRaw, watch } from 'vue';

import { useDebounceFn, useRefHistory } from '@vueuse/core';
import { defineStore } from 'pinia';

import { chordRepository } from '@/domains/chord/model/chordRepository';
import { buildGroupVariant, createGroup, getGroupSortKey, toGroupId } from '@/domains/chord/theory/entityFactories';
import { computeChordFingerprint, matchChordSearch, sortChordsByRule } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { clearPersistFailure, kvRemove, kvSet, reportPersistFailure } from '@/platform/services/storage';
import { cloneDeep, generateUUID } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import { validateChordDraft } from './chordDraftValidation';
import { createChordEventBus } from './chordEventBus';
import { buildGroupedChordCards, buildMultiFingeringData, nameKeyOf } from './chordGrouping';
import { detectMergedDuplicates } from './chordMergeOps';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';

const DEFAULT_SORT_RULE: GroupSortRule = GroupSortRule.ROOT_PITCH;

/** 和弦撤销历史深度（整列表深拷贝，8 份即已控制住千级列表的内存驻留，详见 useRefHistory 处说明）。
 *  导出供应用装配层复用：chordScoreBridge 按同一深度保留解绑记录，两处数字不再各自漂移。 */
export const CHORD_HISTORY_CAPACITY = 8;

export type { ChordValidationResult } from './chordDraftValidation';

export const useChordStore = defineStore('chord', () => {
  // 和弦列表体积大（大库下全量序列化达 MB 级），持久化不走 useStorage 的深度 watch：
  // ① 深度 watch 每次变更都在触发帧内深遍历整个列表（千级和弦 = 数万次 proxy 读）；
  // ② JSON 解析回环会触发「全量重建 → 再触发一轮快照克隆 + 视图模型重建」（实测单次 260ms 长任务）。
  // 改为普通 ref + 浅 watch（全部变更都是整列表替换，见下）+ 400ms 防抖写 IDB（groups/chords 单事务）；
  // 「防抖窗口内刷新丢数据」由下方 pagehide / visibilitychange 强制刷盘兜底。多标签页不做实时同步
  // （此前 storage 回环在千级数据下得不偿失，迁移后同样关闭）。
  const savedChordsList = ref<Chord[]>([]);
  // 分组列表与和弦列表共用一次防抖事务刷写（分组与和弦同生共死），不再单独 useStorage
  const groups = ref<Group[]>([]);
  // 选中/展开分组仅内存态：URL `?group=` 是唯一数据源，持久化只维护一个「最近编辑分组」指针
  // 供裸访问入口冷启动回灌；不再双写完整选中态。
  const selectedGroupId = ref<string | null>(null);
  // 单一展开状态同属内存态（与 selectedGroupId 联动，URL group 回灌时经 selectAndExpandGroup 一并恢复）
  const expandedGroupId = ref<string | null>(null);
  /** 判断分组是否处于折叠态（与当前展开分组 id 比对）。 */
  const isGroupCollapsed = (groupId: string): boolean => expandedGroupId.value !== groupId;

  // 「最近编辑分组」冷启动指针：选中非空时写入；取消选中时清除，
  // 避免「关闭分组后刷新」被冷启动回灌重新打开（URL 方已移除 group 参数，指针须同步失效）
  watch(selectedGroupId, id => {
    if (id) kvSet(STORAGE_KEYS.LAST_GROUP_ID, id);
    else kvRemove(STORAGE_KEYS.LAST_GROUP_ID);
  });

  // 水合门禁：hydrate() 完成前为 false，期间 ref 变更（含水合赋值本身）不触发写回
  let hydrated = false;

  // 持久化分层：两个列表变更经浅 watch 感知（整列表替换必改引用），400ms 防抖合并写 IDB；
  // 保存等关键入口提供 flushChordsToStorage 作为即时刷盘保障
  const persistAll = async (): Promise<void> => {
    if (!hydrated) return;
    try {
      await chordRepository.save({ groups: toRaw(groups.value), chords: toRaw(savedChordsList.value) });
      clearPersistFailure('chords');
    } catch (error) {
      // 不再静默吞掉：配额超限等写入失败上报到平台层，由装配层统一提示用户
      reportPersistFailure('chords', error);
    }
  };
  const persistAllDebounced = useDebounceFn(() => void persistAll(), 400);
  // 水合赋值本身会触发 watch：抑制期（hydrate 结束前）不调度写回，避免启动时把刚读入的数据原样全量写回一次
  let suppressPersistWatch = true;
  watch([savedChordsList, groups], () => {
    if (suppressPersistWatch) return;
    persistAllDebounced();
  });

  // 每次提交都会克隆整个和弦列表，容量控制在 8 份以限制内存驻留。
  // 与乐谱历史（useScoreHistory 的 20 步）不对称是刻意的：和弦单次快照是整列表深拷贝、
  // 量级可达千条，深栈会显著抬高常驻内存；乐谱快照是按条拆分的轻量对象。
  // deep: false —— 所有变更路径都是整列表替换（唯一例外「撤销恢复孤儿收容」也已改为不可变更新），
  // 浅比较即可感知；省掉每次变更对千级列表的深度遍历。
  const {
    undo: rawUndo,
    pause: pauseHistory,
    resume: resumeHistory,
    commit: commitHistory,
    clear: clearHistory,
  } = useRefHistory(savedChordsList, {
    capacity: CHORD_HISTORY_CAPACITY,
    deep: false,
    flush: 'post',
    clone: v => cloneDeep(toRaw(v)),
  });

  /**
   * 异步水合：从 IDB 加载并清洗和弦库（chordRepository.load）。
   * 由应用装配层在挂载前 await；水合赋值期间暂停撤销历史（首装载数据不算一次「撤销点」），
   * 且 hydrated 置位先于赋值，防抖写回不会把刚读入的数据原样写回。
   *
   * 读取失败时**保持写回门禁关闭**（见 catch 内说明）：此时两个列表是空初值，落库会清空整库。
   * 代价是本会话改动不落库——但失败已上报、且 hydrate() 可被重试，优于静默毁库。
   * 唯一的开门出口是 replaceAllData（导入/恢复/云端覆盖）：那条路径的内存数据是用户显式给出的
   * 完整内容，落盘安全，且它正是读失败后用户自救的必经之路。
   */
  const hydrate = async (): Promise<void> => {
    if (hydrated) return;
    let snapshot: { groups: Group[]; chords: Chord[]; mergedIds?: Map<string, string> };
    try {
      snapshot = await chordRepository.load();
    } catch (error) {
      reportPersistFailure('chords', error);
      // 读取失败时**绝不开启写回门禁**：此刻 groups / savedChordsList 仍是空初值，而 chordRepository.save
      // 是「同一事务内 clear() + 全量 put」——任何一次落库（含 pagehide 兜底刷盘）都会把 IDB 里的真实库
      // 覆盖成空或残缺。宁可本会话改动不落库（失败已由 reportPersistFailure 上报、装配层会提示用户），
      // 也绝不盲写覆盖真实数据。
      // hydrated 保持 false 的额外好处：hydrate() 的重入判定仍为假，IDB 瞬时故障可重试；
      // 且 suppressPersistWatch 仍为 true，浅 watch 也不会调度写回——两道门同时关着。
      // 附注：歌曲域无此风险——songRepository.flushChanges 走按条 diff（removedIds / dirtySongs），
      // 从不 clear()，空列表不会波及库内其他记录；两域协议不同，勿照搬此处结论。
      return;
    }
    hydrated = true;
    pauseHistory();
    groups.value = snapshot.groups;
    savedChordsList.value = snapshot.chords;
    // 读侧清洗去重丢弃的重复项：水合早于桥接层订阅，事件通道收不到，暂存供装配时消费
    hydrateMergeMapping = snapshot.mergedIds && snapshot.mergedIds.size > 0 ? snapshot.mergedIds : null;
    await nextTick();
    resumeHistory();
    // 关键修复：pause 期间 useRefHistory 的 last 快照不会同步（仍停留在初始空列表 []），
    // 若不处理，水合后第一次变更会把 [] 压入撤销栈——用户对首次删除点撤销即整库清空。
    // 先 commit 让 last 追上水合数据，再 clear 清掉 commit 顺带压入的伪撤销点（含初始空态）。
    commitHistory();
    clearHistory();
    suppressPersistWatch = false;
  };

  /** 水合去重产生的重定向映射（被丢弃 id → 保留 id）。桥接层装配时消费，取走即清空。 */
  let hydrateMergeMapping: Map<string, string> | null = null;
  const consumeHydrateMergeMapping = (): Map<string, string> | null => {
    const mapping = hydrateMergeMapping;
    hydrateMergeMapping = null;
    return mapping;
  };

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

  /**
   * 全库和弦查找表：id → 实体 与 指纹 → 实体 双键合一（computed 常驻，全库变更才重建）。
   * 消费方：谱面行数据（useScoreLinesData 的歌词行解析按槽位绑定 id / 指纹两种形态查实体）、
   * 预览内容键、和弦选器。此前该表在 useScoreLinesData 内自建，歌谱域之外无法共享，
   * 每个消费者各付一次 O(库) 重建；下沉后全仓一份。
   */
  const chordsLookupMap = computed(() => {
    const map = new Map<string, Chord>();
    savedChordsList.value.forEach(c => {
      map.set(c.id, c);
      map.set(computeChordFingerprint(c), c);
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

  /** 用新列表整体覆盖分组列表（随下次防抖刷写落库）。 */
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

  /** 删除分组及其名下全部和弦，并联动清除展开/选中状态与「最近编辑分组」指针。 */
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
   * 用导入的数据整体替换分组与和弦列表（导入 / 恢复 / 云端覆盖 / 造数共用）。
   * 替换后折叠全部分组并清空选中。
   */
  const replaceAllData = (data: { groups: Group[]; chords: Chord[] }): void => {
    groups.value = [...data.groups];
    expandedGroupId.value = null;
    savedChordsList.value = [...data.chords];
    selectedGroupId.value = null;
    // 写回门禁只在 hydrate() 成功后打开（见其 catch 内说明）。但本方法是**唯一**「外部显式交出
    // 完整库内容」的入口：此刻内存里的两个列表就是目标真值，不再是读失败留下的空初值，
    // 门禁赖以成立的前提（内存可能残缺）不成立，必须顺势打开并立即落盘。
    // 否则 hydrate 读失败后用户拿备份恢复，会得到最坏的一种假象：界面显示已恢复、IDB 里却
    // 始终是旧数据（甚至已被清空），下次启动又回到损坏现场——而用户以为已经救回来了。
    // 已水合的正常路径不动（门禁本就开着，仍由 400ms 防抖负责），避免改变既有写盘时机。
    if (!hydrated) {
      hydrated = true;
      suppressPersistWatch = false;
      void persistAll();
    }
  };

  /** 将和弦插入列表头部（新和弦优先展示）。 */
  const addChord = (chord: Chord) => {
    savedChordsList.value = [chord, ...savedChordsList.value];
  };

  /** 按 id 替换更新指定和弦；id 不存在时返回 false（调用方据以提示而非假成功）。 */
  const updateChord = (chord: Chord): boolean => {
    const idx = savedChordsList.value.findIndex(c => c.id === chord.id);
    if (idx < 0) return false;
    const next = [...savedChordsList.value];
    next[idx] = chord;
    savedChordsList.value = next;
    return true;
  };

  /**
   * 即时刷盘：绕过防抖窗口，立即将分组与和弦列表写入 IDB（单事务）。
   * 供保存/更新等关键动作成功后调用，消除防抖窗口与 Vue 响应式 watch 微任务延迟，
   * 避免用户操作后光速刷新导致数据未落盘。
   */
  const flushChordsToStorage = () => void persistAll();

  // 防抖落盘的兜底：页面隐藏 / 关闭（含刷新）前把仍在防抖窗口内的变更强制落盘。
  // 关闭前这一次 IDB 写入在 pagehide 时同步入队，通常能完成；没有它，防抖窗口内的刷新会丢掉最后一次变更。
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
    /** 异步水合（应用装配层挂载前 await） */
    hydrate,
    groupChordMap,
    chordsLookupMap,
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
    consumeHydrateMergeMapping,
    replaceAllData,
  };
});
