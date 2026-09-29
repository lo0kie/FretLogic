<template>
  <Feedback v-if="chordStore.groups.length === 0" description="还没有添加分组" icon="folder-open" />

  <!-- v-else 分支用 <template> 而非元素：这一分支的内容是「列表容器 + 两个列表级单例菜单」，两者必须
       平级 —— 菜单不能进容器（拖拽容器的子元素必须与数据项一一对应，见 useSortableList/order.ts 的
       resolveNextOrder），再套一层空 div 只为给分支一个根就纯属白搭。
       容器一件四用（与 SongSection 同构）：v-grid-nav 的导航作用域、拖拽排序与吸附头的列表根、
       右键委托根、两个菜单的 context-trigger-el。
       右键委托走**捕获期**：这样不必依赖「组内没有哪一层截住右键冒泡」这一前提
       （组内容外层历史上就挂过一条 .stop，见 handleListContextMenu）。 -->
  <template v-else>
    <div
      v-grid-nav.stop="{ cols: 1, selector: '.group-title-row' }"
      @contextmenu.capture="handleListContextMenu($event)"
      class="draggable-list flex flex-col gap-sm"
      ref="groupListRef"
    >
      <!-- data-group-id 在分组行与分组头上各挂一份：头那份供吸附头（useStickyHeads）识别，
           行那份供右键委托从卡片反查所属分组 —— 后者只从 [data-collapse-head] 上读，两处不冲突 -->
      <div
        v-for="(group, index) in chordStore.groups"
        :data-group-id="group.id"
        :key="group.id"
        class="group/group-row"
      >
        <!-- 头部复用 BaseCollapse：点击/键盘切换、aria-expanded、chevron 旋转全部内聚在组件内；
             class/data-*/aria-* 经 $attrs 落到头部按钮本体（拖拽把手、键盘导航标记、状态 tint）。
             px-3 覆盖内置 px-2：Tailwind 同工具类按数值升序产出，px-3 必然在样式表中靠后 -->
        <!-- body-hold：折叠体挂起高度测量，改跟随内容自然高度（不播放过渡）。**只对「载入即展开」
             的那一组、且仅在其首批补齐进行中生效**（见 holdGroupId）：那条路径上 initial-auto 让
             折叠体第一帧就是自然高度，没有开合过渡可供逐批补齐藏在后面，不挂起就会被看见成
             「先变高、再定位」的两段变化。
             ⚠️ 不能按「补挂中」无差别开启：挂起期写的是 auto，没有可插值的起点 ⇒ 0→N 的展开过渡
             会一并消失，分组开合整个变成瞬现瞬没。手动展开的补挂本来就有那段过渡可藏。 -->
        <BaseCollapse
          v-bind="headBind(group.id)"
          v-scroll-into-view.y.settle.gap-sm="group.id === editorStore.draftChord.groupId"
          :aria-label="groupTitleAriaLabel(group)"
          :body-hold="holdBodyOf(group.id)"
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
            isHeaderMenuTargetFor(group.id) ? 'bg-tint-panelhover-30!' : '',
          ]"
          :expanded="isGroupContentOpen(group)"
          :heading-level="2"
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
          <div v-if="isGroupContentRenderable(group)" :ref="el => setContentOuterRef(el, index)">
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
              <!-- 只接 select：删除 / 移动 / 变体 / 引用这四项改由本组列表级委托的右键菜单直接抛
                   （见 useGroupSectionMenus），卡片侧已不再抛它们 —— 旧绑定留着是永远不会触发的死接线 -->
              <ChordCard
                v-for="cardData in chunked.slice(cardsOf(group), group.id)"
                :card-data
                :key="cardData.mainChord.id"
                :menu-target="isCardMenuTarget(cardData.mainChord.id)"
                @select="handleSelectChord($event)"
              />
            </TransitionGroup>
            <Feedback v-else description="暂无和弦" size="sm" />
          </div>
        </BaseCollapse>
      </div>
    </div>

    <!-- 组内和弦卡片的右键菜单（**列表级单例**，委托）：取代原先「每张卡 / 每分组各包一个 BaseMenu」——
         整库渲染时那是数百个实例（各带 watcher / 浮层注册表 / 卸载钩子），现在整列共用一个。
         默认插槽为空，完全由 handleListContextMenu 按鼠标坐标驱动打开。
         :context-trigger-el 必须报列表容器而非内部包裹层 —— 后者是 display:contents、
         getBoundingClientRect() 恒为零矩形，落在卡片上的右键会被 BasePopover 的捕获期外点判定
         当成「区域外」先关闭，委托随后才 openMenuAt（表现为重放入场动画）。 -->
    <BaseMenu
      :context-trigger-el="groupListRef"
      :items="cardMenuItems"
      @close="closeCardMenu()"
      ref="cardMenuRef"
      trigger="contextmenu"
    />

    <!-- 分组头的右键菜单（**列表级单例**，委托）：目标由事件目标上的 data-group-id 反查、
         菜单项按目标分组现算。与卡片菜单刻意分开 —— 一个实例只做一件事，两种目标的菜单项
         互不牵连；同时打开时的互斥由 BaseMenu 的模块级登记保证。 -->
    <BaseMenu
      :context-trigger-el="groupListRef"
      :items="headerMenuItems"
      @close="closeHeaderMenu()"
      ref="headerMenuRef"
      trigger="contextmenu"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import ChordCard from '@/domains/chord/library/components/ChordCard.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseCollapse from '@/platform/ui/collapse/BaseCollapse.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { useGroupContentMount } from '@/domains/chord/library/composables/useGroupContentMount';
import { useGroupSectionMenus } from '@/domains/chord/library/composables/useGroupSectionMenus';
import { useGroupSectionView } from '@/domains/chord/library/composables/useGroupSectionView';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSortableList } from '@/platform/composables/useSortableList';
import { useStickyHeads } from '@/platform/composables/useStickyHeads';

import type { GroupSectionEmits } from '@/domains/chord/library/composables/useGroupSectionMenus';
import type { Chord, Group } from '@/domains/chord/types';

const emit = defineEmits<GroupSectionEmits>();

const chordStore = useChordStore();
const editorStore = useChordEditorStore();
const chordActions = useChordActions();

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

// ---------- 只读派生视图（卡片列表 / 展开判定 / 排序徽标 / 无障碍文案） ----------
const {
  GRID_COLS,
  cardsOf,
  isGroupContentOpen,
  isAllCollapsed,
  groupHeadTooltip,
  getSortLabel,
  getGroupChordsCount,
  groupTitleAriaLabel,
  chordCountAriaLabel,
} = useGroupSectionView();

// ---------- 组内容的挂载门控（分块挂载 + 收起保留窗口 + 折叠体高度挂起） ----------
const { chunked, isGroupContentRenderable, holdBodyOf, setContentOuterRef } = useGroupContentMount({
  isGroupContentOpen,
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
  // 触屏：长按 = 右键（分组头与组内卡片两种目标都由容器上的委托分派，见 handleListContextMenu）。
  // 手指开始移动（拖拽接管这次手势）时收起刚弹出的那个菜单 —— 两个菜单至多开一个（互斥由 BaseMenu
  // 的模块级登记保证），故两个都收：closeMenu 幂等，且只收本列表这两个，不碰全局浮层。
  longPressMenu: {
    onDismiss: () => {
      headerMenuRef.value?.closeMenu('long-press-drag');
      cardMenuRef.value?.closeMenu('long-press-drag');
    },
  },
});

/** 用户点击和弦卡片：若正在编辑同一和弦则退出编辑，否则载入编辑器 */
const handleSelectChord = (chord: Chord) => {
  if (editorStore.draftChord.id === chord.id) editorStore.resetEditor();
  else editorStore.setEditor(chord);
};

/** 删除和弦：若被删的正是编辑中的和弦，同步清空编辑器 */
const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.draftChord.id === chord.id;
  chordActions.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

/* ==================== 右键菜单（列表级委托，两个单例） ====================
   分组头与组内卡片各一个 BaseMenu 实例，都由列表容器上的 contextmenu 委托驱动（见
   useGroupSectionMenus 的 handleListContextMenu）—— 取代原先「每张卡 / 每分组各包一个」的写法
   （整库渲染时那是数百个 BaseMenu + BasePopover 实例，各带 watcher / 浮层注册表 / 卸载钩子）。
   两个模板 ref 留在这里而非 composable 内：useSortableList 的 longPressMenu.onDismiss 也要用它们，
   归属组件更直白；菜单项构建、目标反查与委托判定则统一收在 composable 里。 */

const headerMenuRef = useTemplateRef<InstanceType<typeof BaseMenu>>('headerMenuRef');
const cardMenuRef = useTemplateRef<InstanceType<typeof BaseMenu>>('cardMenuRef');

const {
  headerMenuItems,
  cardMenuItems,
  isHeaderMenuTargetFor,
  isCardMenuTarget,
  handleListContextMenu,
  closeHeaderMenu,
  closeCardMenu,
} = useGroupSectionMenus({
  view: { cardsOf, getGroupChordsCount },
  headerMenuRef,
  cardMenuRef,
  handleLocalDeleteChord,
  emit,
});
</script>
