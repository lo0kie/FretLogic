/**
 * 和弦 store：和弦与分组数据的加载、增删改、排序及持久化。
 * 维护分组-和弦卡片视图模型（GroupedChordCard）与和弦指法历史（撤销-重做）。
 *
 * 本文件是 chordStore/ 目录的门面，对外路径仍是 `@/domains/chord/store/chordStore`（消费者零改动）。
 * 拆分情况：
 * - 同目录 persistence —— 整库快照的防抖刷写与启动加载（纯逻辑，与 Pinia 无关）；
 * - 同层 store/ 目录 —— chordGrouping（分组卡片构建）、chordEventBus（跨领域事件）、
 *   chordDraftValidation（草稿校验）、chordMergeOps（重复合并检测）。
 */
import { computed, nextTick, onScopeDispose, ref, toRaw, watch } from 'vue';

import { useRefHistory } from '@vueuse/core';
import { defineStore } from 'pinia';

import { chordRepository } from '@/domains/chord/model/chordRepository';
import { validateChordDraft } from '@/domains/chord/store/chordDraftValidation';
import { createChordEventBus } from '@/domains/chord/store/chordEventBus';
import { buildGroupedChordCards, buildMultiFingeringData } from '@/domains/chord/store/chordGrouping';
import { detectMergedDuplicates } from '@/domains/chord/store/chordMergeOps';
import { buildGroupVariant, createGroup, getGroupSortKey, toGroupId } from '@/domains/chord/theory/entityFactories';
import { computeChordFingerprint, matchChordSearch, nameKeyOf, sortChordsByRule } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { registerExitFlusher } from '@/platform/services/lifecycle/exitFlush';
import { flushIdbKv, kvRemove, kvSet, markDataDeleted } from '@/platform/services/storage';
import { cloneDeep, generateUUID } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';

import { createChordPersistence } from './persistence';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';

const DEFAULT_SORT_RULE: GroupSortRule = GroupSortRule.ROOT_PITCH;

/** 和弦撤销历史深度（整列表深拷贝，8 份即已控制住千级列表的内存驻留，详见 useRefHistory 处说明）。
 *  导出供应用装配层复用：chordScoreBridge 按同一深度保留解绑记录，两处数字不再各自漂移。 */
export const CHORD_HISTORY_CAPACITY = 8;

export type { ChordValidationResult } from '@/domains/chord/store/chordDraftValidation';

/**
 * 一次和弦删除的精确快照：记录每个被删实体及其在删除前列表中的下标。
 * 「撤销」按原下标插回（见 restoreChords），不走撤销历史弹栈、不做整表快照覆盖——
 * 删除与撤销之间夹着的其它改动不会被连带回滚，也不会撤掉不相关的操作。
 */
export interface ChordDeletionSnapshot {
  /** 被删和弦与其删除前下标（按原列表顺序升序） */
  entries: { chord: Chord; index: number }[];
}

/** 一次分组删除的精确快照：分组对象 + 原下标 + 名下和弦的删除快照 */
export interface GroupDeletionSnapshot extends ChordDeletionSnapshot {
  group: Group;
  /** 被删分组在删除前分组列表中的下标，撤销时按原位插回 */
  groupIndex: number;
}

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
  /** 判断分组是否处于展开态（与当前展开分组 id 比对）。 */
  const isGroupExpanded = (groupId: string): boolean => expandedGroupId.value === groupId;

  // 「最近编辑分组」冷启动指针：选中非空时写入；取消选中时清除，
  // 避免「关闭分组后刷新」被冷启动回灌重新打开（URL 方已移除 group 参数，指针须同步失效）
  watch(selectedGroupId, id => {
    if (id) kvSet(STORAGE_KEYS.LAST_GROUP_ID, id);
    else kvRemove(STORAGE_KEYS.LAST_GROUP_ID);
  });

  // 水合门禁：hydrate() 完成前为 false，期间 ref 变更（含水合赋值本身）不触发写回
  let hydrated = false;

  // 持久化分层：两个列表变更经浅 watch 感知（整列表替换必改引用），防抖合并写 IDB。
  // 调度与写盘协议整体在 ./persistence（纯逻辑，与 Pinia 无关），本处只回答「何时算一次变更」，
  // 并把水合门禁以谓词注入（门禁的开关点仍在 hydrate / replaceAllData 一处）。
  // 快照必须 toRaw：仓储 save 按**引用相等**判定「内容未变」，传 proxy 会让每次刷写都判成「全变了」。
  const { persistence, loadSnapshot } = createChordPersistence(
    chordRepository,
    () => ({ groups: toRaw(groups.value), chords: toRaw(savedChordsList.value) }),
    () => hydrated
  );
  /** 即时刷盘（绕过防抖窗口把分组与和弦列表单事务写入 IDB），供保存/导入等关键入口
   *  成功后 `void persistAll()` 调用，消除防抖窗口与响应式 watch 微任务延迟（操作后光速刷新不丢数据）。
   *  实现即 persistence.flushNow：门禁关着时为空操作，返回 Promise 供调用方按需 await。 */
  const persistAll = persistence.flushNow;

  /**
   * 删除类改动的统一收口：抬删除水位线，并把**两条落盘链路各推到底**。
   *
   * 为什么必须在这里推：水位线走 kv 微批（50ms），实体删除走 400ms 防抖——默认节奏不同轴，
   * 删除后约 350ms 内 IDB 会停在「水位线已抬、实体还在」的半截状态。此刻进程被杀（强退 / OOM），
   * 下次启动就会带着一个偏新的 meta.updatedAt（方向判定偏向本地，云端的新数据拉不下来）
   * 与一份没生效的删除。删除是低频动作，不值得为它保留这个窗口。
   * （真正的原子性需要把 kv 并入仓储的跨库事务——跨子系统，不在本次范围内，故这里只把窗口压到一个 tick。）
   */
  const commitDeletion = (): void => {
    markDataDeleted();
    void persistAll();
    void flushIdbKv();
  };

  // 水合赋值本身会触发 watch：抑制期（hydrate 结束前）不调度写回，避免启动时把刚读入的数据原样全量写回一次
  let suppressPersistWatch = true;
  watch([savedChordsList, groups], () => {
    if (suppressPersistWatch) return;
    persistence.schedulePersist();
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
   * 读取失败时**保持写回门禁关闭**（见 catch 内说明）：此时两个列表是空初值，库状态未知，不做任何写回。
   * 代价是本会话改动不落库——但失败已上报（由 persistence.loadSnapshot 上报）、且 hydrate() 可被重试，
   * 优于静默毁库。唯一的开门出口是 replaceAllData（导入/恢复/云端覆盖）：那条路径的内存数据是用户
   * 显式给出的完整内容，落盘安全，且它正是读失败后用户自救的必经之路。
   */
  const hydrate = async (): Promise<void> => {
    if (hydrated) return;
    let snapshot: { groups: Group[]; chords: Chord[]; mergedIds?: Map<string, string> };
    try {
      snapshot = await loadSnapshot();
    } catch {
      // 读取失败时**绝不开启写回门禁**：此刻 groups / savedChordsList 仍是空初值，内存视图与 IDB 已不一致，
      // 在「看不全库」的状态下做任何写回都是把残缺视图当成权威事实继续增量落库。宁可本会话改动不落库
      // （失败已由 persistence.loadSnapshot 上报，装配层会提示用户），也不在库状态未知时盲写。
      // 注：chordRepository.save 现为「同事务 + 按引用 diff（无 clear()）」，空快照本身不会清空整库；
      // 关闭门禁是保守不变量，与 save 采用哪种写入协议无关。
      // hydrated 保持 false 的额外好处：hydrate() 的重入判定仍为假，IDB 瞬时故障可重试；
      // 且 suppressPersistWatch 仍为 true，浅 watch 也不会调度写回——两道门同时关着。
      return;
    }
    // await 期间可能已有别的路径接管写回：replaceAllData（导入 / 恢复 / 云端覆盖）会顺势把
    // hydrated 置位并立即落盘，此刻内存里的两个列表就是用户**显式交出**的目标真值，晚到的磁盘快照
    // 不得覆盖。判据必须取 hydrated 而不是下面的「列表是否非空」——用户交出的备份可以合法地是空库
    // （「清空后再恢复」正是这种形态），按长度判会放过这次覆盖，把用户刚清空的库又灌回磁盘旧内容。
    // 顺带覆盖「hydrate 被并发调用两次」：后到的那次不再重放一遍赋值与撤销历史重置。
    if (hydrated) {
      logger.warn('chordStore', '水合数据晚到但写回已被其它路径接管，跳过覆盖赋值');
      return;
    }
    hydrated = true;
    // 窗口期保护：装配层给 hydrate 设了兜底超时（main.ts），超时即挂载，用户可能已在窗口内
    // 做过改动（未经 replaceAllData 的零散改动，如手改分组）。水合数据晚到时不代表更新——不能用
    // 磁盘快照无条件覆盖用户已见的内存状态。内存里已有实体时跳过赋值，仅开启写回门禁让窗口期
    // 改动照常落库；若磁盘快照更完整，用户可经云端拉取 / 备份导入自行恢复。
    // 此分支**不认领** snapshot.mergedIds：那批重复项是在磁盘快照内部被清洗丢弃的，与内存里
    // 用户这份数据无关，套用会把乐谱槽位重定向到内存中并不存在的 id。
    if (groups.value.length > 0 || savedChordsList.value.length > 0) {
      suppressPersistWatch = false;
      // 窗口期改动此前被写回抑制挡住，开门后立即刷盘一次，保证已见改动尽快落库
      void persistAll();
      logger.warn('chordStore', '水合数据晚到但窗口期内已有本地改动，跳过覆盖赋值');
      return;
    }
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
    if (q) list = list.filter(c => matchChordSearch(c, q));

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

  /** 折叠全部分组并清空选中态：两者是「全部收起」的一体两面——留着选中会让侧栏仍高亮一个已折叠的分组。
   *  此前注释这么写、函数只清 expandedGroupId，两个调用方各自补一次 setSelectedGroupId(null)。 */
  const collapseAllGroups = () => {
    expandedGroupId.value = null;
    selectedGroupId.value = null;
  };

  /** 选中并展开指定分组；传 null 时取消选中并折叠全部分组。 */
  const selectAndExpandGroup = (id: string | null) => {
    if (!id) {
      collapseAllGroups();
      return;
    }
    expandedGroupId.value = id;
    selectedGroupId.value = id;
  };

  /** 切换分组折叠/展开态；单展开模式下展开其一即折叠其余，折叠会联动清除选中。 */
  const toggleGroupExpansion = (groupId: string) => {
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

  /**
   * 删除分组及其名下全部和弦，并联动清除展开/选中状态与「最近编辑分组」指针。
   * 返回删除快照（分组对象 + 原下标 + 名下和弦各自的原下标），供「撤销」精确恢复；
   * 分组不存在时返回 null。
   */
  const deleteGroup = (groupId: string): GroupDeletionSnapshot | null => {
    const groupIndex = groups.value.findIndex(g => g.id === groupId);
    if (groupIndex < 0) return null;
    const group = groups.value[groupIndex]!;

    // 先摘分组、再删名下和弦：removeChordsSnapshot 末尾会把整库快照立刻落盘（见 commitDeletion），
    // 分组若还留在列表里，这一次落盘写下的就是「和弦已删、分组还在」的中间态。
    groups.value = groups.value.filter(g => g.id !== groupId);

    // 名下和弦走 removeChordsSnapshot：单趟完成「挑出待删」与「保留其余」，并广播解绑事件。
    // 空分组必须在这里自行补一次 commitDeletion：removeChordsSnapshot 在空集时提前返回
    // （不抬水位线、也不落盘），而分组本身照样被删掉了——若被删的空分组恰是全库 updatedAt 最大者
    // （刚新建/刚改名），meta.updatedAt 会因此回退，一次「拉取云端」就把已删分组复活
    // （见 deletionWatermark）。
    const { entries } = removeChordsSnapshot(savedChordsList.value.filter(c => c.groupId === groupId));
    if (entries.length === 0) commitDeletion();

    if (expandedGroupId.value === groupId) expandedGroupId.value = null;
    if (selectedGroupId.value === groupId) selectedGroupId.value = null;

    return { group, groupIndex, entries };
  };

  /**
   * 撤销一次分组删除：分组按**原下标**插回（不整表覆盖分组列表——删除后新建的分组不受影响），
   * 名下和弦同样按原下标精确插回；随后广播恢复事件，经应用层桥接回填乐谱槽位。
   */
  const restoreGroupDeletion = (snapshot: GroupDeletionSnapshot): void => {
    // 分组已在库中就不重复插回：连删连撤销时（两份通知都还活着）会拿到同一份快照两次，
    // 无守卫地插回会让列表里出现同 id 的两个分组——下游按 id 查找与 Vue 的 keyed diff 都会错乱。
    // 名下和弦照旧走 restoreChords（它自身也有同款 id 守卫，重复调用安全）。
    if (!groups.value.some(g => g.id === snapshot.group.id)) {
      const nextGroups = [...groups.value];
      nextGroups.splice(Math.min(snapshot.groupIndex, nextGroups.length), 0, snapshot.group);
      groups.value = nextGroups;
    }
    restoreChords(snapshot);
    selectedGroupId.value = snapshot.group.id;
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

  /**
   * 将一批和弦**按给定顺序追加到列表尾部**（组导入等批量落地用）。
   *
   * 与 addChord 的头插语义正好相反，且这不是风格差异：批量导入的顺序是**载荷声明的一部分**
   * （chordTextCodec 的 CHORDS 段明写「保序」），逐条 addChord 会把整组倒过来 ——
   * 同指纹并列的变体在分组卡片里的 1/N 编号随之翻转。
   */
  const appendChords = (chords: Chord[]) => {
    if (chords.length === 0) return;
    savedChordsList.value = [...savedChordsList.value, ...chords];
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

  // 防抖落盘的兜底：页面隐藏 / 关闭（含刷新）前把仍在防抖窗口内的变更强制落盘。
  // 关闭前这一次 IDB 写入在 pagehide 时同步入队，通常能完成；没有它，防抖窗口内的刷新会丢掉最后一次变更。
  // 监听本身收敛在 platform 的退出落盘注册表里（此前 idbKv / chordStore / songStore 各挂了一份）。
  // 注销函数必须收着并在 store 作用域销毁时调用：注册表是模块级 Set，每次实例化（开发期热更、
  // 单测每个用例一份 pinia）都会新增一条且永不回收，退出时会去刷一个早已废弃的 store。
  const unregisterExitFlusher = registerExitFlusher(() => void persistAll());
  onScopeDispose(unregisterExitFlusher);

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
      if (movedIds.has(c.id)) return { ...c, groupId: resolvedTargetGroupId, updatedAt: now };

      return c;
    });

    const sameNameVariants = savedChordsList.value.filter(
      c => c.groupId === resolvedTargetGroupId && nameKeyOf(c) === targetName
    );
    const { droppedIds, mergeMapping } = detectMergedDuplicates(sameNameVariants, movedIds);
    if (droppedIds.size === 0) return;

    savedChordsList.value = savedChordsList.value.filter(c => !droppedIds.has(c.id));
    // 合并丢弃也是删除：同样抬高删除水位线（并与实体落盘同轴，见 commitDeletion）
    commitDeletion();
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
        id: toGroupId(`g_recovery_${generateUUID().slice(0, 8)}`),
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
   * 按 id 精确删除指定和弦列表，并返回删除快照（供「撤销」按原下标精确插回）。
   *
   * 必须严格按 id 匹配，不使用指纹兜底——避免两个指法相同但 id 不同的和弦
   * 在用户只删其一时被连带误删。
   */
  const removeChordsSnapshot = (chords: Chord[]): ChordDeletionSnapshot => {
    const targetIds = new Set<string>();
    chords.forEach(c => void targetIds.add(c.id));
    if (targetIds.size === 0) return { entries: [] };
    const entries: ChordDeletionSnapshot['entries'] = [];
    savedChordsList.value.forEach((chord, index) => {
      if (targetIds.has(chord.id)) entries.push({ chord, index });
    });
    savedChordsList.value = savedChordsList.value.filter(c => !targetIds.has(c.id));
    // 抬高删除水位线并立即落盘：meta.updatedAt 只看存活实体，删除会让它回退、方向判定误判
    // （见 deletionWatermark）；两条落盘链路必须同轴（见 commitDeletion）
    commitDeletion();
    // 广播删除事件：由应用层桥接解绑歌曲中的引用
    eventBus.emitChordsRemoved([...targetIds]);
    return { entries };
  };

  /**
   * 按 id 精确删除指定和弦列表。
   *
   * 必须严格按 id 匹配，不使用指纹兜底——避免两个指法相同但 id 不同的和弦
   * 在用户只删其一时被连带误删。
   *
   * 返回被删除的 id 集合。⚠️ 歌曲中的引用解绑**不依赖**这个返回值——解绑由
   * removeChordsSnapshot 广播的删除事件经应用层 chordScoreBridge 完成。全仓调用方
   * （src 与 tests）均未消费它，保留仅为不破坏既有签名；不要据它写出"调用方必须消费"的用法。
   */
  const removeChords = (chords: Chord[]): Set<string> => {
    const targetIds = new Set<string>();
    chords.forEach(c => void targetIds.add(c.id));
    if (targetIds.size === 0) return targetIds;
    removeChordsSnapshot(chords);
    return targetIds;
  };

  /**
   * 撤销一次删除：按快照记录的**原下标**从高到低插回（splice 位置精确还原，不整表覆盖——
   * 删除与撤销之间若夹着其它改动，不受影响）。并广播恢复事件，经应用层桥接回填乐谱槽位。
   */
  const restoreChords = (snapshot: ChordDeletionSnapshot): void => {
    if (snapshot.entries.length === 0) return;
    // 已在库中的 id 不再插回：连删连撤销时（两份通知都还活着）会拿到指向同一批 id 的两份快照，
    // 无守卫地插回会在同一列表里出现重复 id —— 下游按 id 查找、去重与 Vue 的 keyed diff 都会错乱。
    const existingIds = new Set(savedChordsList.value.map(c => c.id));
    const entries = snapshot.entries.filter(entry => !existingIds.has(entry.chord.id));
    if (entries.length === 0) return;
    const next = [...savedChordsList.value];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const { chord, index } = entries[i]!;
      next.splice(Math.min(index, next.length), 0, chord);
    }
    savedChordsList.value = next;
    eventBus.emitChordsRestored(entries.map(e => e.chord.id));
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
    isGroupExpanded,
    setSelectedGroupId,
    selectAndExpandGroup,
    toggleGroupExpansion,
    collapseAllGroups,
    addGroup,
    renameGroup,
    updateGroupSort,
    deleteGroup,
    addChord,
    appendChords,
    updateChord,
    /** 即时刷盘（绕开防抖窗口）；调用方按需 `void persistAll()` */
    persistAll,
    moveVariantsByName,
    /** 通用撤销（弹撤销历史栈顶 + 孤儿收容）。UI 撤销按钮已改为快照精确恢复（removeChordsSnapshot
     *  + restoreChords / deleteGroup + restoreGroupDeletion），不再走此处；保留为通用撤销入口 */
    executeUndoRestore,
    removeChords,
    removeChordsSnapshot,
    restoreChords,
    restoreGroupDeletion,
    onChordsRemoved: eventBus.onChordsRemoved,
    onChordsRestored: eventBus.onChordsRestored,
    onChordsMerged: eventBus.onChordsMerged,
    buildChordForSave,
    consumeHydrateMergeMapping,
    replaceAllData,
  };
});
