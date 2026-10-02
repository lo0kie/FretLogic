import { computed } from 'vue';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';

import type { Group, GroupedChordCard } from '@/domains/chord/types';

/**
 * 分组列表的只读派生视图：分组 id → 卡片列表、展开判定、排序徽标与无障碍文案。
 *
 * 全是「读 store 算出来」的纯派生，不含任何副作用与生命周期 —— 因此它与
 * useGroupContentMount（挂载门控）、useGroupSectionMenus（右键委托）之间没有顺序依赖，
 * 只被后两者当作入参读取。
 *
 * 三条不变量：
 * ① **卡片列表按分组算一次**：groupViews 是全组一次遍历的派生表，模板按 group.id 做 O(1) 取值。
 *    此前模板里直接调函数（getGroupedCards 被 v-if 与 v-for 各调一次）。
 * ② **空列表引用必须稳定**：cardsOf 未命中时返回同一个 EMPTY_CARDS 常量，否则每次求值都新建数组，
 *    TransitionGroup 会把「空」误判为整表更新。
 * ③ **排序徽标按策略表分发**：sortLabelStrategies 以 sortRule 为键，新增排序规则时这里与
 *    entityFactories 的 getGroupSortKey 要一起看（KEY_DEGREE 那档取的就是它）。
 */
export function useGroupSectionView() {
  const chordStore = useChordStore();

  /** 卡片网格列数：与 v-arrow-nav 的键盘导航配置共用 */
  const GRID_COLS = 3;

  /** 空卡片列表的稳定引用：模板直接消费，避免每次求值都新建数组让 TransitionGroup 误判为整表更新 */
  const EMPTY_CARDS: GroupedChordCard[] = [];

  /**
   * 分组 id → 卡片列表 派生表：每组只算一遍，模板按 group.id 做 O(1) 取值。
   *
   * 此前模板里直接调函数（`getGroupedCards` 被 v-if 与 v-for 各调一次）。本表原先还缓存
   * 「激活主卡 id」，随「当前编辑中」的判定归位到 ChordCard 自己而删除 —— 与乐谱列表的
   * SongCard 同口径：卡片自己读编辑器状态，列表不下发。
   */
  const groupViews = computed(() => {
    const views = new Map<string, GroupedChordCard[]>();
    for (const group of chordStore.groups) views.set(group.id, chordStore.getGroupedCards(group.id));
    return views;
  });

  /** 组内分组卡片数据（取派生结果，O(1)） */
  const cardsOf = (group: Group): GroupedChordCard[] => groupViews.value.get(group.id) ?? EMPTY_CARDS;

  /** 分组内容是否展开（store 正向展开判定） */
  const isGroupContentOpen = (group: Group): boolean => chordStore.isGroupExpanded(group.id);

  const isAllCollapsed = computed(() => chordStore.groups.every(g => !chordStore.isGroupExpanded(g.id)));

  /**
   * 分组头部的悬停提示（BaseCollapse 的 title prop → 头部原生 tooltip）。
   * 拖拽排版的启用条件是「全部分组收起」（见 useSortableList 的 enabled）：展开态下行高会错位，
   * 所以那时拖拽是**静默失效**的——用户拖动没反应，只能以为功能坏了或压根不存在。
   * 这里把状态说破：能拖时点出能力（顺带做发现性），不能拖时点出解除条件。
   */
  const groupHeadTooltip = computed(() =>
    isAllCollapsed.value ? '点击折叠/展开分组 · 拖动可调整分组顺序' : '点击折叠/展开分组 · 收起全部分组后可拖动排序'
  );

  const sortLabelStrategies: Record<Group['sortRule'], (group: Group) => string> = {
    ROOT_PITCH: () => 'C-B',
    KEY_DEGREE: group => `${getGroupSortKey(group) ?? 'C'}调`,
    NAME_ASC: () => 'A-Z',
  };

  /** 分组排序徽标文案（C-B / X调 / A-Z，随 sortRule 切换） */
  const getSortLabel = (group: Group): string => sortLabelStrategies[group.sortRule]?.(group) ?? 'C-B';

  /** 组内和弦总数 */
  const getGroupChordsCount = (groupId: string) => chordStore.groupChordMap.get(groupId)?.length ?? 0;

  /** 分组行无障碍描述：名称、和弦数与展开/折叠状态 */
  const groupTitleAriaLabel = (group: Group): string =>
    `${group.name} 分组，共 ${getGroupChordsCount(group.id)} 个和弦，${chordStore.isGroupExpanded(group.id) ? '已展开' : '已折叠'}`;
  /** 组内和弦计数无障碍描述：仅显示总数 */
  const chordCountAriaLabel = (group: Group): string => `共 ${getGroupChordsCount(group.id)} 个和弦`;

  return {
    GRID_COLS,
    cardsOf,
    isGroupContentOpen,
    isAllCollapsed,
    groupHeadTooltip,
    getSortLabel,
    getGroupChordsCount,
    groupTitleAriaLabel,
    chordCountAriaLabel,
  };
}
