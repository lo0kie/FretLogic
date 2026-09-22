<template>
  <Feedback v-if="chordStore.groups.length === 0" description="还没有添加分组" icon="folder-open" />
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }">
    <div class="draggable-list flex flex-col gap-sm" ref="groupListRef">
      <div v-for="(group, index) in chordStore.groups" :key="group.id" class="group/group-row">
        <BaseMenu #="{ isOpen }" :items="getGroupMenuItems(group)" trigger="contextmenu">
          <!-- 头部复用 BaseCollapse：点击/键盘切换、aria-expanded、chevron 旋转全部内聚在组件内；
               class/data-*/aria-* 经 $attrs 落到头部按钮本体（拖拽把手、键盘导航标记、状态 tint）。
               px-3 覆盖内置 px-2：Tailwind 同工具类按数值升序产出，px-3 必然在样式表中靠后 -->
          <BaseCollapse
            v-bind="headBind(group.id)"
            v-scroll-into-view.y.settle.gap-sm="group.id === editorStore.draftChord.groupId"
            :aria-label="groupTitleAriaLabel(group)"
            :class="[
              // 吸附是宿主列表的布局决策，全部由业务下发：定位（sticky/top/z）由 useStickyHeads.headBind
              // 统一给（吸附头必须压住容器内一切滚动内容，含滚动条 overlay）。
              // 头部**齐平贴住容器可视上沿**（top 抵消容器 padding），头顶不留间隙 → 没有露出带，
              // 也就不需要任何遮挡片/伪元素：此前所有「边框/焦点环被挡」的坑都源自那条遮挡带。
              // 不再自带 border：焦点环已画在头部盒内（ring-inset），再叠一圈边框就是双边框。
              // 也不挂 data-focusable-inline：全局那条规则给的是**外扩** box-shadow 焦点环
              // （--focus-ring 4px 外扩），头部齐平贴住容器上沿时它的上半圈必被 overflow 裁掉；
              // 焦点态统一交给折叠组件画在盒内的环（键盘聚焦时出现，不会被裁）。
              // 底色与展开态 tint 已由 BaseCollapse 自带；此处只剩「本组右键菜单开着」这一项
              // —— 它属消费方状态，折叠组件无从得知
              'group-title-row h-[2.4rem] px-3 transition-all duration-fast',
              isOpen ? 'bg-tint-panelhover-30!' : '',
            ]"
            :expanded="isGroupContentOpen(group)"
            :title="groupHeadTooltip"
            @update:expanded="chordActions.executeGroupToggle(group)"
            initial-auto
            unpadded
          >
            <template #title>
              <!-- 跑马灯的触发宿主委托给整个分组头（.group-title-row 是 BaseCollapse 的头部按钮类）：
                   分组名只占头部左侧一条，鼠标停在头部空白处（或计数徽标那一侧）时同样该开始滚动 -->
              <div v-marquee.fade="{ trigger: '.group-title-row' }">
                <span class="text-xs font-bold text-fg-title">
                  {{ group.name }}
                </span>
              </div>
            </template>

            <template #trailing>
              <div class="flex shrink-0 items-center gap-sm">
                <!-- 拖拽把手的可发现性线索：分组头就是排序的 handle（见下方 useSortableList 的
                     handle: '.group-title-row'），但它的外观与普通折叠头毫无差别，用户无从得知
                     标题栏可以拖。悬停整行时在计数徽标右侧淡入抓手图标 —— 与工作台面板列表同一套
                     写法：只悬停头部触发的话，可发现性仍受限于「用户先注意到头部」，整行悬停的命中
                     面大得多。常驻会污染每一行，故默认 opacity-0，悬停整行时淡入（图标占位始终保留，
                     不产生布局跳动）。过渡只留 opacity、位移已去掉，原因见 WorkbenchView 的抓手注释。
                     显隐跟随**可拖条件**（全部分组收起）而非仅悬停：展开态下行高会错位、拖拽是静默
                     失效的，此时挂一个拖不动的把手比不挂更糟；不能拖时由头部 tooltip 说破解除条件
                     （见 groupHeadTooltip）。
                     可拖条件**走 class 而非 v-if**：v-if 是瞬间增删节点，展开分组时抓手会当场消失、
                     没有任何淡出（而 hover 淡入是平滑的，两者观感对不上）。改由 opacity 驱动后，消失
                     与出现走同一条过渡；代价是图标恒占位 —— 正好让计数徽标在开合分组之间不再左右挪。
                     不可拖时补 pointer-events-none：图标虽不可见，仍会吃掉命中测试、把光标变成 grab，
                     等于承诺一个不存在的拖拽。
                     注：触屏没有 hover，此线索对触屏无效，触屏仍靠长按拖拽。 -->
                <BaseIcon
                  :class="isAllCollapsed ? 'group-hover/group-row:opacity-100' : 'pointer-events-none'"
                  class="shrink-0 cursor-grab text-fg-muted opacity-0 transition-opacity duration-base ease-out"
                  icon-size="sm"
                  name="grip-vertical"
                />

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
                  :card-data
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
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getGroupSortKey } from '@/domains/chord/theory/entityFactories';
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
// 并按吸附头的实测高度让开容器顶部羽化带；吸附头的接线（id 钩子 / 滚动容器 / 定位 sticky、top、z）
// 由它回传的 headBind 统一下发 —— 折叠组件本身不假设宿主布局。
// 收起时「把头按回吸附线」的补偿与滚动钳位补偿由 BaseCollapse 自带的平台 composable 负责
// （只读折叠头与折叠段的相对位置，未吸附的折叠自然零副作用），此处不必再接线。
const { headBind } = useStickyHeads({
  listRef: groupListRef,
  // id 取分组头上的 data-group-id；头/段容器用 BaseCollapse 暴露的稳定钩子，不依赖内部类名
  idAttribute: 'data-group-id',
  // 吸附线 = 容器可视上沿：头顶不留间隙，滚过的内容直接被头部自身遮住
  offset: '0px',
  // 有头吸附时：容器顶部羽化带内缩一个头高，让开吸附中的头
  fadeOffset: true,
});

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
 * 拖拽排版的启用条件是「全部分组收起」（见下方 useSortableList 的 enabled）：展开态下行高会错位，
 * 所以那时拖拽是**静默失效**的——用户拖动没反应，只能以为功能坏了或压根不存在。
 * 这里把状态说破：能拖时点出能力（顺带做发现性），不能拖时点出解除条件。
 */
const groupHeadTooltip = computed(() =>
  isAllCollapsed.value ? '点击折叠/展开分组 · 拖动可调整分组顺序' : '点击折叠/展开分组 · 收起全部分组后可拖动排序'
);

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
/**
 * 每帧补挂/卸载的卡片数（3 列 × 4 行）。
 *
 * 原值 36（3 列 × 12 行）与真实单卡成本不匹配：单张 ChordCard 热态约 1.25ms、冷态约 3.3ms
 * （每卡常驻 ChordCard + BaseMenu + BasePopover 三个组件），一帧 16.7ms 的预算只容得下约 5~13 张，
 * 而首批 36 张实测构成单个 111~120ms 主线程长任务 + 116~124ms 掉帧，即分块机制没起到摊平作用。
 * 收敛到 12 后单帧批次落在预算内，代价是填充由 2 帧变 4 帧（补挂发生在高度过渡未揭示到的行，视觉无感）。
 */
const MOUNT_BATCH = 12;

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
