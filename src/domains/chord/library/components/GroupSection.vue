<template>
  <Feedback v-if="chordStore.groups.length === 0" description="还没有添加分组" icon="folder-open" />
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }">
    <div class="draggable-list flex flex-col gap-sm" ref="groupListRef">
      <div v-for="(group, index) in chordStore.groups" :key="group.id">
        <BaseMenu #="{ isOpen }" :items="getGroupMenuItems(group)" trigger="contextmenu">
          <!-- 头部复用 BaseCollapse：点击/键盘切换、aria-expanded、chevron 旋转全部内聚在组件内；
               class/data-*/aria-* 经 $attrs 落到头部按钮本体（拖拽把手、键盘导航标记、状态 tint）。
               px-3 覆盖内置 px-2：Tailwind 同工具类按数值升序产出，px-3 必然在样式表中靠后 -->
          <BaseCollapse
            v-scroll-into-view.y.settle.gap-sm="group.id === editorStore.draftChord.groupId"
            :aria-label="groupTitleAriaLabel(group)"
            :class="[
              // 吸附是宿主列表的布局决策，全部由业务下发：定位（sticky/top/z）与底色。
              // 头部**齐平贴住容器可视上沿**（top 抵消容器 padding），头顶不留间隙 → 没有露出带，
              // 也就不需要任何遮挡片/伪元素：此前所有「边框/焦点环被挡」的坑都源自那条遮挡带。
              // z-float 高于卡片网格的 z-panel：两者同层时网格在 DOM 里靠后，会把吸附头盖住。
              // 不再自带 border：焦点环已画在头部盒内（ring-inset），再叠一圈边框就是双边框。
              // 也不挂 data-focusable-inline：全局那条规则给的是**外扩** box-shadow 焦点环
              // （--focus-ring 4px 外扩），头部齐平贴住容器上沿时它的上半圈必被 overflow 裁掉；
              // 焦点态统一交给折叠组件画在盒内的环（键盘聚焦时出现，不会被裁）
              'group-title-row sticky z-float h-[2.4rem] px-3 transition-all duration-fast',
              isGroupContentOpen(group)
                ? 'bg-tint-panelhover-50!'
                : stuckGroupIds.has(group.id)
                  ? 'bg-surface-panel'
                  : '',
              isOpen ? 'bg-tint-panelhover-30!' : '',
            ]"
            :data-group-id="group.id"
            :expanded="isGroupContentOpen(group)"
            :scroll-container="stickyContainer"
            :style="{ top: stickyTopCss }"
            @update:expanded="chordActions.executeGroupToggle(group)"
            initial-auto
            unpadded
          >
            <template #title>
              <div v-marquee.fade title="点击折叠/展开分组">
                <span class="text-xs font-bold text-fg-title">
                  {{ group.name }}
                </span>
              </div>
            </template>

            <template #trailing>
              <div class="flex shrink-0 items-center gap-sm">
                <BaseBadge
                  :aria-label="`按${getSortLabel(group)}自动排序`"
                  appearance="outline"
                  class="opacity-80"
                  size="2xs"
                  title="排序方法"
                  variant="neutral"
                  width="2rem"
                >
                  <span v-chord-name="getSortLabel(group)" />
                </BaseBadge>

                <BaseBadge
                  :appearance="isGroupContentOpen(group) ? 'subtle' : 'filled'"
                  :aria-label="chordCountAriaLabel(group)"
                  :title="`${getGroupChordsCount(group.id)} 个和弦`"
                  class="font-mono"
                  size="2xs"
                  variant="neutral"
                  width="1.5rem"
                >
                  <BaseRollingText :text="`${getGroupChordsCount(group.id)}`" class="tabular-nums" />
                </BaseBadge>
              </div>
            </template>

            <!-- 组内容（原 GroupContent 内联合并）：卡片网格 + 空状态；
                 折叠动画由外层 BaseCollapse 的折叠体承担，这里保持纯内容。

                 卡片网格只在「展开中」或「收起动画的保留窗口内」渲染：单展开模式下同时至多一组展开，
                 其余分组的卡片既看不见（height:0 + overflow:hidden）也点不着（折叠体带 inert），
                 全量常驻等于白养一棵巨大的 DOM —— 千级和弦库下侧栏会挂上万个节点，于是每次开合都要
                 为整棵树付布局 / 绘制 / vnode 重建的代价（掉帧来源），首屏也要同步挂载全部和弦。
                 收起方向必须走保留窗口：内容在收起首帧就消失的话，看到的是空箱收起（视觉回归）。 -->
            <div v-if="isGroupContentRenderable(group)" :ref="el => setContentOuterRef(el, index)" @contextmenu.stop>
              <!-- 键盘导航按 ChordCard 上的 .chord-thumb-card 收集条目：该标记类只作导航钩子、不承载样式，
                   故卡片类名大改时极易被一并清掉，导航随即静默失效（历史上已发生一次，见 v-grid-nav 的脱钩告警）。
                   改名时请同步这里与 ChordCard 的 focusable 卡片元素。 -->
              <TransitionGroup
                v-grid-nav.stop="{ cols: GRID_COLS, selector: '.chord-thumb-card' }"
                v-if="cardsOf(group).length > 0"
                :name="chunked.isFilling(group.id) ? 'v-transition-fill' : 'v-transition-list'"
                class="relative z-panel grid min-h-[2.2rem] grid-cols-3 items-center gap-sm px-sm pt-md pb-xs"
                tag="div"
              >
                <ChordCard
                  v-for="cardData in chunked.slice(cardsOf(group), group.id)"
                  v-scroll-into-view.y.once="cardData.mainChord.id === activeMainIdOf(group)"
                  :card-data
                  :is-active="cardData.mainChord.id === activeMainIdOf(group)"
                  :key="cardData.mainChord.id"
                  @delete="handleLocalDeleteChord($event)"
                  @delete-variants="emit('open-delete-variants', $event)"
                  @move="emit('open-move', $event)"
                  @open-references="emit('open-references', $event)"
                  @select="handleSelectChord($event)"
                />
              </TransitionGroup>
              <Feedback v-else description="暂无和弦" size="sm" />
            </div>
          </BaseCollapse>
        </BaseMenu>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, useTemplateRef, watch } from 'vue';

import ChordCard from '@/domains/chord/library/components/ChordCard.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
import { getChordName } from '@/domains/chord/theory/theory';
import { useChordTransfer } from '@/domains/chord/transfer/useChordTransfer';
import { createChunkedMount } from '@/platform/composables/useChunkedMount';
import { useSortableList } from '@/platform/composables/useSortableList';
import { useStickyHeads } from '@/platform/composables/useStickyHeads';
import { COLLAPSE_CONTENT_RETENTION_MS } from '@/platform/utils/constants';

import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { ComponentPublicInstance } from 'vue';

const emit = defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
  (e: 'open-sort', group: Group): void;
  (e: 'open-delete-variants', cardData: GroupedChordCard): void;
  (e: 'open-references', cardData: GroupedChordCard): void;
}>();

const chordStore = useChordStore();
const editorStore = useChordEditorStore();
const chordActions = useChordActions();
const { copyGroupText, shareGroupLink } = useChordTransfer();

const groupListRef = useTemplateRef<HTMLElement>('groupListRef');

// 分组头的吸附是「宿主环境相关」的能力，全部由业务侧承担：
// useStickyHeads 统一发现滚动容器、批量判定哪些头此刻被顶在吸附线上（一次监听，而非每个头一套），
// 并按吸附头的实测高度让开容器顶部羽化带；定位几何（sticky / top）则由本组件经 class 与 style
// 下发给折叠头——折叠组件本身不假设宿主布局。
// 收起时「把头按回吸附线」的补偿与滚动钳位补偿由 BaseCollapse 自带的平台 composable 负责
// （只读折叠头与折叠段的相对位置，未吸附的折叠自然零副作用），此处不必再接线。
const {
  stuckIds: stuckGroupIds,
  insetPx: stickyInsetPx,
  container: stickyContainer,
} = useStickyHeads({
  listRef: groupListRef,
  // id 取分组头上的 data-group-id；头/段容器用 BaseCollapse 暴露的稳定钩子，不依赖内部类名
  idAttribute: 'data-group-id',
  // 吸附线 = 容器可视上沿：头顶不留间隙，滚过的内容直接被头部自身遮住
  offset: '0px',
  // 有头吸附时：容器顶部羽化带内缩一个头高，让开吸附中的头
  fadeOffset: true,
});

/** 吸附线：sticky 以滚动容器的**内容盒**为原点，容器若仍有 padding-top，需从 top 里减掉才能
 *  贴住可视上沿——否则那条 padding 带属于可滚动区、且在裁剪边界之内，会一直漏着滚过的内容。
 *  左栏的留白已移到滚动容器之外（见 SidebarLeft），此处量得 0、表达式退化为 0px；
 *  保留补偿是为了容器回归带 padding 时不用改这里 */
const stickyTopCss = computed(() => `-${stickyInsetPx.value}px`);

const contentOuterComponentEls = new Map<number, ComponentPublicInstance | Element | null>();

/** 按索引登记/注销分组内容组件的实例引用 */
const setContentOuterRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  if (el) contentOuterComponentEls.set(index, el);
  else contentOuterComponentEls.delete(index);
};

// ==================== 组内容（原 GroupContent 内联合并） ====================

/** 卡片网格列数：与 v-grid-nav 的键盘导航配置共用 */
const GRID_COLS = 3;

/** 空卡片列表的稳定引用：模板直接消费，避免每次求值都新建数组让 TransitionGroup 误判为整表更新 */
const EMPTY_CARDS: GroupedChordCard[] = [];

/** 当前激活卡片的主和弦 id：草稿是某变体时映射回主卡；编辑中同名同组草稿也视为激活 */
const resolveActiveMainId = (cards: GroupedChordCard[]): string | null => {
  const draft = editorStore.draftChord;
  if (draft.id) for (const card of cards) if (card.variants.some(v => v.id === draft.id)) return card.mainChord.id;

  if (editorStore.isEditing) {
    const draftName = getChordName(draft).trim().toLowerCase();
    if (draftName)
      for (const card of cards)
        if (card.mainChord.groupId === draft.groupId && getChordName(card.mainChord).trim().toLowerCase() === draftName)
          return card.mainChord.id;
  }
  return null;
};

/**
 * 分组 id → { 卡片列表, 激活主卡 id } 派生表。
 *
 * 此前模板里直接调函数：`getGroupedCards` 被 v-if 与 v-for 各调一次，而每张卡片又要调
 * 两次 `getActiveMainId` —— 后者自己全量扫一遍组内卡片、对每张卡取一次和弦名，于是单次渲染
 * 是 O(卡片数²) 次取名字；而它在依赖链上挂着编辑草稿（拖动/输入时每帧变化），等于每帧重跑。
 * 现在每组只算一遍，模板按 group.id 做 O(1) 取值。
 */
const groupViews = computed(() => {
  const views = new Map<string, { cards: GroupedChordCard[]; activeMainId: string | null }>();
  for (const group of chordStore.groups) {
    const cards = chordStore.getGroupedCards(group.id);
    views.set(group.id, { cards, activeMainId: resolveActiveMainId(cards) });
  }
  return views;
});

/** 组内分组卡片数据（取派生结果，O(1)） */
const cardsOf = (group: Group): GroupedChordCard[] => groupViews.value.get(group.id)?.cards ?? EMPTY_CARDS;

/** 当前激活卡片的主和弦 id（取派生结果，O(1)） */
const activeMainIdOf = (group: Group): string | null => groupViews.value.get(group.id)?.activeMainId ?? null;

/** 分组内容是否展开（store 正向展开判定） */
const isGroupContentOpen = (group: Group): boolean => chordStore.isGroupExpanded(group.id);
const isAllCollapsed = computed(() => chordStore.groups.every(g => !chordStore.isGroupExpanded(g.id)));

// ==================== 组内容的挂载门控 ====================
// 侧栏是全应用唯一「把整库和弦全部挂出来」的地方：单展开模式下只有一组可见可交互，其余分组的卡片
// 网格常驻纯属浪费（千级和弦库 = 上万个节点），且这份浪费要按帧付账——开合分组的高度过渡会让承载
// 它们的滚动容器每帧重排重绘，于是节点越多越掉帧（与和弦引擎、位图缓存无关的独立瓶颈）。
// 做法：只有展开组渲染卡片；收起方向给一个保留窗口，让内容陪高度过渡走完再卸载（保留裁切观感），
// 展开方向不需要窗口（本来就要渲染）。节点量因此从「全库」降到「单组」。
//
// 单组全量仍是百级卡片（huge 档每组 ~190 张，每张含 BaseMenu 等整套 setup），一帧内全量挂载
// 就是展开瞬间的掉帧来源。于是再拆一层**分块**：展开方向每帧补挂一批直到挂满（展开高度过渡
// 期间内容自上而下揭示，补挂发生在视口外或过渡未揭示到的行，视觉无感）；收起方向在保留窗口
// 到期（折叠体已收到 0、内容不可见）后每帧卸一批。补挂/卸载期间关闭 TransitionGroup 动画
// （前缀换成无样式的类名），只保留用户增删和弦时的真实增删动画。

/** 处在「收起动画保留窗口」内的分组 id（这些组的内容继续挂载，供高度过渡逐帧裁切） */
const retainedGroupIds = reactive(new Set<string>());
/** 各保留分组的到期定时器：重复登记按 id 去重，重新展开时即刻取消 */
const retentionTimers = new Map<string, number>();

/** 组内容是否渲染：展开中，或仍在收起动画的保留窗口内 */
const isGroupContentRenderable = (group: Group): boolean => isGroupContentOpen(group) || retainedGroupIds.has(group.id);

// ---------- 分块挂载 / 分块卸载（通用机制见 platform/composables/useChunkedMount） ----------
/** 每帧补挂/卸载的卡片数（3 列 × 12 行） */
const MOUNT_BATCH = 36;

const chunked = createChunkedMount<string>(MOUNT_BATCH);

/** 展开方向的分块补挂：从当前限额起每帧补一批，直到挂满（挂满后移除限额回全量渲染） */
const startFill = (groupId: string) => {
  chunked.startFill(
    groupId,
    () => chordStore.groupChordMap.get(groupId)?.length ?? 0,
    // 补挂途中被收起：循环停摆，保留窗口/卸载循环接管后续
    () => chordStore.isGroupExpanded(groupId)
  );
};

/** 收起方向保留窗口到期后的分块卸载：折叠体已收到 0、内容不可见，每帧卸一批直到清空 */
const startDrain = (groupId: string) => {
  chunked.startDrain(
    groupId,
    () => chordStore.groupChordMap.get(groupId)?.length ?? 0,
    key => {
      retainedGroupIds.delete(key);
      retentionTimers.delete(key);
    }
  );
};

/** 登记保留窗口：到点后不再一次性卸载，转入分块卸载循环 */
const retainGroupContent = (groupId: string) => {
  retainedGroupIds.add(groupId);
  const pending = retentionTimers.get(groupId);
  if (pending !== undefined) clearTimeout(pending);
  retentionTimers.set(
    groupId,
    window.setTimeout(() => {
      retentionTimers.delete(groupId);
      if (chordStore.isGroupExpanded(groupId)) {
        retainedGroupIds.delete(groupId);
        return;
      }
      startDrain(groupId);
    }, COLLAPSE_CONTENT_RETENTION_MS)
  );
};

/** 释放保留窗口：重新展开同一组时取消待释放的定时器，避免窗口在展开态下把内容卸掉 */
const releaseGroupContent = (groupId: string) => {
  const pending = retentionTimers.get(groupId);
  if (pending !== undefined) {
    clearTimeout(pending);
    retentionTimers.delete(groupId);
  }
  retainedGroupIds.delete(groupId);
};

/**
 * 展开组切换 → 给「刚被收起的那一组」登记保留窗口，并让新展开组从首批开始分块补挂。
 *
 * **必须 flush: 'sync'**：保留窗口要赶在「状态变更引发的这次渲染」之前登记好。本组件的更新任务
 * id 小于 setup 期创建的 watcher，默认 pre 冲刷下更新先出队 —— 收起首帧就是「未展开且未保留」，
 * 卡片会被整体卸载，只剩空箱收起。同步触发点落在状态写入处，必然先于渲染。
 *
 * 同步监听而不是改事件回调：状态也可能由路由回灌、搜索结果选中、导入/删除分组等路径写入，
 * 这些路径都不过组件的点击回调。
 *
 * immediate：组件挂载时已处于展开态的分组（载入即展开 / 路由回灌）同样从首批开始补挂——
 * 限额在**首次渲染前**生效，避免「全量渲染后再裁剪回填」的闪烁。
 */
watch(
  () => chordStore.expandedGroupId,
  (expandedId, prevExpandedId) => {
    if (prevExpandedId && prevExpandedId !== expandedId) retainGroupContent(prevExpandedId);
    if (expandedId) {
      releaseGroupContent(expandedId);
      startFill(expandedId);
    }
  },
  { flush: 'sync', immediate: true }
);

onBeforeUnmount(() => {
  for (const timer of retentionTimers.values()) clearTimeout(timer);
  retentionTimers.clear();
  retainedGroupIds.clear();
  // 分块循环的 rAF 由 createChunkedMount 随组件作用域销毁自动清理（onScopeDispose）
});

// 仅在全部折叠时允许拖拽排序：任一组展开时其内容会撑高行高，拖动会错位。
// Sortable 直接操作 DOM，拖拽结束按索引重排后经 overwriteGroups 持久化；
// 空列表守卫（groups 为空走 Feedback 分支）、容器就绪后再初始化、以及 disabled 的响应式跟随都由 useSortableList 承担。
useSortableList<Group>({
  target: groupListRef,
  items: () => chordStore.groups,
  enabled: computed(() => isAllCollapsed.value),
  handle: '.group-title-row',
  onReorder: next => chordStore.overwriteGroups(next),
});

/** 用户点击和弦卡片：若正在编辑同一和弦则退出编辑，否则载入编辑器 */
const handleSelectChord = (chord: Chord) => {
  if (editorStore.draftChord.id === chord.id) editorStore.resetEditor();
  else editorStore.setEditor(chord);
};

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

/** 删除和弦：若被删的正是编辑中的和弦，同步清空编辑器 */
const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.draftChord.id === chord.id;
  chordActions.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

// 分组右键菜单项：每次直接构建（仅 3-4 项），不缓存
const getGroupMenuItems = (group: Group): MenuItem[] => {
  const items: MenuItem[] = [
    {
      label: '修改名称',
      icon: 'square-pen',
      action: () => {
        emit('open-rename', group);
      },
    },
    {
      label: '复制分组',
      icon: 'copy',
      action: () => {
        void copyGroupText(group);
      },
    },
    {
      // 分享：与「复制分组」同一份载体（token：分组名 + 排序规则 + 组内全部和弦），只是外面套了一条地址，对方打开即自动建组导入
      label: '分享分组',
      icon: 'share-2',
      disabled: getGroupChordsCount(group.id) === 0,
      action: () => {
        void shareGroupLink(group);
      },
    },
    {
      label: '和弦排序',
      icon: 'arrow-up-down',
      disabled: getGroupChordsCount(group.id) === 0,
      action: () => {
        emit('open-sort', group);
      },
    },
    {
      label: '删除分组',
      icon: 'trash-2',
      danger: true,
      action: () => {
        emit('open-delete', group);
      },
    },
  ];
  return items;
};
</script>
