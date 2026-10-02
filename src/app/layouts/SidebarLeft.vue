<template>
  <!-- 抽屉档遮罩：仅「小屏 + 侧栏展开」时存在。小屏上侧栏是覆盖式浮层且压在顶栏之上，
       没有这一层就没有「点外部关闭」这条出路（展开后顶栏开关也点不到了）。
       层级走 tokens 的 --z-scrim（高于顶栏、低于侧栏），与模态遮罩同一套层序，不另起一套。 -->
  <Transition name="v-transition-fade">
    <div
      v-if="isDrawerMode && isLeftOpen"
      @click="closeSidebar()"
      aria-hidden="true"
      class="fixed inset-0 z-scrim bg-overlay"
    />
  </Transition>

  <aside
    v-bind="$attrs"
    :aria-label="route.path === ROUTE_PATHS.SCORE ? '乐谱库' : '指法库'"
    :class="isDrawerMode ? 'fixed z-sidebar-top' : 'absolute z-sidebar'"
    :inert="!isLeftOpen ? true : undefined"
    :style="asideStyle"
    class="panel-left inset-y-0 left-0 flex h-full flex-col overflow-hidden border-r border-glass-border bg-surface-panel transition-[transform,opacity] duration-slow ease-sidebar will-change-transform"
  >
    <div class="panel-header flex h-10 shrink-0 items-center justify-between gap-sm border-b border-glass-border px-lg">
      <div
        v-if="route.path === ROUTE_PATHS.WORKBENCH"
        class="v-fade-in-quick flex w-full min-w-0 items-center justify-between gap-sm"
        key="workbench"
      >
        <BaseInput
          v-model.trim="searchQuery"
          :search-item-selected="item => isCardActive(item.card)"
          :search-item-title="getSearchItemTitle"
          :search-items="searchResults"
          :search-no-result-text="noResultText"
          :search-unsynced="!isSearchSynced"
          @select-search-index="handleSelectSearchIndex($event)"
          clearable
          searchable
          class="header-search-input min-w-0 flex-1"
          font-size="xs"
          placeholder="搜索和弦..."
          prefix-icon="search"
          search-guide-text="输入和弦名称搜索..."
          title="搜索和弦（按名称检索：全称 / 简写 / 变音记号互通）"
          width="full"
        >
          <template #search-item="{ item, selected }">
            <!-- 只负责行内容；行外壳（高度/圆角/悬停/键盘活跃高亮/点击选中）由 BaseInput 统一渲染 -->
            <!-- 左侧：和弦名（首字绝对左对齐） -->
            <span class="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 leading-normal">
              <!-- 跑马灯触发宿主委托给整行（行外壳是 BaseDropdownItem 的 <button>）：和弦名限宽 90px、
                   分组名限宽 48px，鼠标停在同行空白处时同样该开始滚动 -->
              <span v-marquee.fade="{ trigger: 'button' }" class="max-w-[90px] text-xs/normal font-semibold">
                <span v-chord-name="{ chord: item.card.mainChord }" />
              </span>
            </span>

            <!-- 右侧：指法数微徽标与分组名（右边缘绝对对齐） -->
            <span class="flex shrink-0 items-center gap-1.5 text-2xs/normal">
              <!-- 选中态切实心底：行外壳被选中时底色本身就是主题 tint（浅底徽章落在上面只剩一圈淡边），
                   实底才能与选中行区分开。判据与下面分组名 / 对勾同源——直接用插槽下发的 selected -->
              <BaseBadge
                v-if="item.card.variantCount > 1"
                :appearance="selected ? 'filled' : 'subtle'"
                :title="`共 ${item.card.variantCount}个指法`"
                color="primary"
                size="2xs"
              >
                <BaseRollingText :text="`${item.card.variantCount}指法`" class="tabular-nums" />
              </BaseBadge>

              <!-- 所属分组：常态弱化为次要信息；行处于选中态时一并跟随强调 ——
                   判定直接用插槽下发的 selected（与行外壳的常驻高亮同源），不另算一份。
                   实色而非透明度混合：本项目文字色是 title > body > muted > disabled 四档实色
                   （见 tailwind.css 的 fg 档位说明），且选中行底本身就是主题 tint，
                   半透明文字叠上去会得到一块既非灰也非主题色的混色 -->
              <span
                v-marquee.fade="{ trigger: 'button' }"
                :class="[
                  'max-w-[48px] py-0.5 text-2xs/normal font-semibold',
                  selected ? 'text-primary' : 'text-fg-muted',
                ]"
                :title="`所属分组：${item.groupName}`"
              >
                {{ item.groupName }}
              </span>

              <!-- 当前选中（编辑器正在编辑的和弦）：与行外壳的常驻高亮同一判定，右侧补一枚对勾 -->
              <BaseIcon
                v-if="selected"
                aria-hidden="true"
                class="shrink-0 text-primary"
                icon-size="md"
                icon-stroke="bold"
                name="check"
              />
            </span>
          </template>
        </BaseInput>

        <div class="header-actions flex shrink-0 items-center gap-xs">
          <ActionButton
            v-tooltip="'新建分组'"
            @click="groupModals.openCreate"
            icon-only
            appearance="ghost"
            aria-label="新建分组"
            icon="plus"
            icon-size="xl"
            icon-stroke="regular"
          />
        </div>
      </div>

      <div
        v-else-if="route.path === ROUTE_PATHS.SCORE"
        class="v-fade-in-quick flex w-full min-w-0 items-center justify-between gap-sm"
        key="score"
      >
        <div class="header-title-zone flex min-w-0 items-center gap-sm">
          <span class="sidebar-title text-xs font-bold tracking-tight whitespace-nowrap text-fg-title">乐谱列表</span>
          <BaseBadge
            :title="songStore.hasSongFilter ? '当前筛选结果数量' : '乐谱数量'"
            appearance="filled"
            color="neutral"
            size="xs"
          >
            <BaseRollingText :text="`${songStore.filteredSongs.length}`" class="tabular-nums" />
          </BaseBadge>
        </div>

        <div class="header-actions flex shrink-0 items-center gap-xs">
          <BaseMenu :items="songFilterMenuItems" placement="bottom">
            <template #trigger="{ isOpen, pinToggle }">
              <ActionButton
                :appearance="songStore.hasSongFilter || isOpen ? 'subtle' : 'ghost'"
                :aria-expanded="isOpen"
                :color="songStore.hasSongFilter ? 'primary' : isOpen ? 'primary' : 'neutral'"
                :title="songFilterButtonTitle"
                @click="pinToggle()"
                icon-only
                aria-haspopup="menu"
                aria-label="筛选乐谱"
                icon-size="xl"
                icon-stroke="regular"
              >
                <BaseIcon icon-size="xl" icon-stroke="regular" name="filter" />
              </ActionButton>
            </template>
          </BaseMenu>

          <BaseMenu
            :items="SONG_SORT_OPTIONS"
            :model="songStore.songSortMethod"
            @pick="pickSort($event)"
            placement="bottom"
          >
            <template #trigger="{ isOpen, pinToggle }">
              <ActionButton
                :appearance="isOpen ? 'subtle' : 'ghost'"
                :aria-expanded="isOpen"
                :color="isOpen ? 'primary' : 'neutral'"
                @click="pinToggle()"
                icon-only
                aria-haspopup="menu"
                aria-label="切换乐谱排序方式"
                icon-size="xl"
                icon-stroke="regular"
                title="切换乐谱排序方式"
              >
                <BaseIcon :name="currentSortIcon" icon-size="xl" icon-stroke="regular" />
              </ActionButton>
            </template>
          </BaseMenu>

          <ActionButton
            v-tooltip="'新建乐谱'"
            @click="songModals.openCreateSongModal"
            icon-only
            appearance="ghost"
            aria-label="新建乐谱"
            icon="plus"
            icon-size="xl"
            icon-stroke="regular"
          />
        </div>
      </div>
    </div>

    <!-- 顶部留白放在滚动容器**外面**：padding 若在滚动容器内，它属于可滚动区且在裁剪边界之内，
         sticky 头贴住上沿时那一条 padding 带会一直漏着滚过的内容（此前只能靠遮挡带硬遮）。
         留白外移后，滚动容器的裁剪边界就在留白下沿，吸附头 top:0 既贴住可视上沿（不漏内容），
         视觉上又与上方 header 隔开了这段留白；内容也从留白下沿起被干净裁断。
         上下留白都放外层（py-md），滚动容器自身只留横向 padding -->
    <!-- 列表区是侧栏的导航主体（分组开合 + 条目点选即切换编辑对象），以 nav 地标命名之；
         aside 本身已命名「乐谱库 / 指法库」，nav 进一步把「可导航的列表」从搜索区里划出来 -->
    <nav
      aria-label="库导航"
      class="left-group-list-container left-group-list relative flex min-h-0 w-full flex-1 flex-col overflow-hidden py-md"
    >
      <!-- 顶部羽化的起始缘内缩量由 GroupSection 按「此刻是否有头吸附」声明目标值
           （--fade-offset-target），指令走「淡出 → 改位置 → 淡入」的时序应用，位置变化不可见 -->
      <BaseScrollArea
        :scrollbar="listScrollbar"
        close-popovers
        axis="y"
        class="scroll-body flex-1 px-md"
        ref="scrollAreaRef"
      >
        <KeepAlive :max="12">
          <GroupSection
            v-if="route.path === ROUTE_PATHS.WORKBENCH"
            @open-delete="groupModals.openDelete"
            @open-delete-variants="groupModals.openChordVariantsDelete"
            @open-move="groupModals.openMove"
            @open-references="groupModals.openChordReferences"
            @open-rename="groupModals.openRename"
            @open-sort="groupModals.openSort"
            key="workbench"
          />

          <SongSection
            v-else-if="route.path === ROUTE_PATHS.SCORE"
            @open-clear="songModals.openClear"
            @open-config="songModals.openConfig"
            key="score"
          />
        </KeepAlive>
      </BaseScrollArea>
    </nav>

    <div class="left-panel-footer w-full shrink-0 border-t border-glass-border p-md px-lg">
      <div class="footer-actions-row grid grid-cols-2 items-stretch gap-md">
        <ActionButton @click="handleImportTrigger()" icon="download" label="导入备份" width="100%" />
        <ActionButton @click="backupModals.openExport" icon="upload" label="导出备份" width="100%" />
      </div>
    </div>
  </aside>

  <GroupModalsContainer />
  <ChordModalsContainer />
  <ChordReferencesModal />
  <SongModalsContainer />
  <BackupModalsContainer />
</template>

<script setup lang="ts">
import { computed, provide, ref, useTemplateRef, watch } from 'vue';

import { refDebounced } from '@vueuse/core';
import { useRoute } from 'vue-router';

import BackupModalsContainer from '@/app/modals/BackupModalsContainer.vue';
import ChordReferencesModal from '@/app/modals/ChordReferencesModal.vue';
import ChordModalsContainer from '@/domains/chord/library/components/ChordModalsContainer.vue';
import GroupModalsContainer from '@/domains/chord/library/components/GroupModalsContainer.vue';
import GroupSection from '@/domains/chord/library/components/GroupSection.vue';
import SongModalsContainer from '@/domains/score/library/components/SongModalsContainer.vue';
import SongSection from '@/domains/score/library/components/SongSection.vue';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { BACKUP_MODALS } from '@/app/modals/injectionKeys';
import { useBackupModals } from '@/app/modals/useBackupModals';
import { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import { CHORD_GROUP_MODALS, CHORD_REFERENCE_LOOKUP } from '@/domains/chord/library/injectionKeys';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongModals } from '@/domains/score/library/composables/useSongModals';
import { SONG_MODALS } from '@/domains/score/library/injectionKeys';
import { isSongSortMethod, useSongStore } from '@/domains/score/library/store/songStore';
import { useKeybinding } from '@/platform/composables/useKeybinding';
import { useResponsive } from '@/platform/composables/useResponsive';
import { useScrollMemory } from '@/platform/composables/useScrollMemory';
import { useUiStore } from '@/platform/store/uiStore';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { isString } from '@/platform/utils/common';
import { LEFT_SIDEBAR_WIDTH_PIXEL, ROUTE_PATHS } from '@/platform/utils/constants';
import { pickFile } from '@/platform/utils/transfer';

import type { GroupedChordCard } from '@/domains/chord/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { ScrollAreaHandle, ScrollAreaScrollbar } from '@/platform/ui/scroll-area/scrollAreaHandle';
import type { CSSProperties } from 'vue';

defineOptions({ inheritAttrs: false });

const searchQuery = ref('');

/** 搜索无结果文案：含当前查询词，抽出 computed 避免模板内长串 */
const noResultText = computed(() => `未找到与“${searchQuery.value.trim()}”相关的和弦`);

const getSearchItemTitle = (item: { card: GroupedChordCard; groupName: string }) => {
  // 侧栏搜索结果不属于「工作台 / 乐谱」场景：一律完整和弦名
  const chordName = getChordName(item.card.mainChord);
  const parts = [chordName, `分组：${item.groupName}`];
  if (item.card.variantCount > 1) parts.push(`共 ${item.card.variantCount} 个指法`);

  if (isCardActive(item.card)) parts.push('当前编辑中');

  return parts.join(' · ');
};

const handleSelectSearchIndex = (index: number) => {
  const item = searchResults.value[index];
  if (item) selectSearchResult(item.card);
  // 选中后清空搜索词：下拉随 v-model 清空自然收敛，输入框回到待搜索状态
  searchQuery.value = '';
};

const scrollAreaRef = useTemplateRef<ScrollAreaHandle>('scrollAreaRef');
/** 侧栏滚动容器元素：会话级滚动位置存取用 */
const scrollRef = useScrollAreaElement(scrollAreaRef);

const route = useRoute();
const uiStore = useUiStore();
// 收起态除了移出视野（translateX(-100%) + opacity:0 + pointerEvents:none），还必须对键盘与
// 辅助技术一并消失：只做视觉隐藏时，侧栏整棵子树仍在 tab 序里——Tab 会落到看不见的搜索框、
// 分组按钮上，焦点还会把页面滚到那个"已经被推走"的位置。故模板对根节点绑 inert
//（与 BaseCollapse 同一写法，vArrowNav 的 isEligible 也已识别 [inert] 子树）。
//
// 小屏（抽屉档）下这一套原样适用，只是浮层从「挤在内容左侧的常驻栏」变成「压在内容之上的抽屉」：
// 定位与层级随 isDrawerMode 切换（见模板），宽度改为 min(设计宽, 视口 − 3.5rem) —— 右侧必须留出
// 一条可点区域，遮罩才点得到、点外部关闭才成立。
const { isDrawerMode } = useResponsive();

/** 展开态归一：持久化值在无存储环境（测试 / 隐私模式）下可能是 undefined，模板与判据一律读这一份 */
const isLeftOpen = computed(() => Boolean(uiStore.isLeftOpen));

/**
 * 抽屉档下**启动时**收起侧栏：小屏上侧栏是覆盖整屏的浮层，若沿用桌面档留下的展开态
 * （持久化偏好默认就是展开），一开机就会把内容糊满。
 *
 * 刻意**不用 watch** 盯档位翻转：窗口从宽拖到窄时不去动用户的展开态 —— 那是用户正在做的操作，
 * 浮层盖上来是可预期、也点得掉的（遮罩 / Esc）。只在抽屉档下启动这一种情形收一次。
 *
 * 代价：在手机上访问过会把持久化偏好写成收起，桌面下次打开需要点一下开关。
 * 方向刻意这么取 —— 反过来「手机上开局被抽屉糊满屏」是硬伤，而桌面多点一下是零成本。
 */
if (isDrawerMode.value) uiStore.isLeftOpen = false;

const asideStyle = computed<CSSProperties>(() => ({
  // 抽屉档的宽度上限 = 视口 − 一档 spacing：右侧那条留白就是「可点区域」，遮罩要露出来才点得到。
  // 视口够宽时 min() 取设计宽（344px），故这条只在 < ~390px 的窄屏上真正生效
  width: isDrawerMode.value
    ? `min(${LEFT_SIDEBAR_WIDTH_PIXEL}, calc(100vw - var(--spacing-2xl)))`
    : LEFT_SIDEBAR_WIDTH_PIXEL,
  transform: isLeftOpen.value ? 'translateX(0)' : 'translateX(-100%)',
  opacity: isLeftOpen.value ? 1 : 0,
  pointerEvents: isLeftOpen.value ? 'auto' : 'none',
  boxShadow: isLeftOpen.value ? 'var(--shadow-panel)' : 'none',
}));

/** 收起侧栏：抽屉档下遮罩点击与 Esc 共用同一个动作 */
const closeSidebar = () => {
  uiStore.isLeftOpen = false;
};

// Esc 收起抽屉：抽屉展开时顶栏被遮罩压在下面，开关点不到，键盘用户没有别的出路。
// 判据带 isDrawerMode —— 桌面档的侧栏是常驻栏，Esc 不该收它。
useKeybinding('Escape', closeSidebar, { enabled: () => isDrawerMode.value && isLeftOpen.value });

const chordStore = useChordStore();
const songStore = useSongStore();

// 两个 section（KeepAlive）共用同一个滚动容器，滚动位置无法随组件 DOM 天然保持：
// 交给 useScrollMemory 按路由档位记忆（滚动时持续记录，换档 / 重挂后贴回）。
// 档位空间是开放的（任意路由路径都要各记一份），故不声明 keys，activeKey 直接取 route.path。
// 恢复 scrollTop 会触发 scroll 事件 → v-edge-fade 自动重测渐隐，无需手动同步
const scrollMemory = useScrollMemory({ scope: 'sidebar-left', activeKey: () => route.path, target: scrollRef });

watch(isLeftOpen, isOpen => {
  // 侧栏重开时容器尺寸 0→实际值，此前被钳掉的位置补一次贴回
  //（v-edge-fade 的 ResizeObserver 会自动触发渐隐重测）
  if (isOpen) scrollMemory.restore();
});

const groupModals = useChordGroupModals();
const songModals = useSongModals();
const backupModals = useBackupModals();
const editorStore = useChordEditorStore();
const scoreEditor = useScoreEditorStore();

/**
 * 抽屉档下选中和弦 / 乐谱即收起侧栏：这两处点击的目的都是「看主区里的那个东西」，
 * 而窄屏下侧栏是盖在内容上的浮层（主区被遮罩压住且 inert，点不进去）——
 * 不收就等于自己挡在要看的画面前，用户还得再点一次遮罩。
 *
 * 判据取两处**选中态**而不是点击事件：选中态一变就是「用户选了新的东西」，
 * 与点的是卡片本体、卡片里的按钮还是键盘操作无关，也不必让 domain 组件反向通知 app 层。
 * 桌面档侧栏是常驻栏，收起它没有意义（更不该动用户自己设的展开态），故只在抽屉档生效。
 */
watch([() => editorStore.draftChord.id, () => scoreEditor.activeSongId], () => {
  if (isDrawerMode.value) closeSidebar();
});

/** 搜索下拉：按卡片（多指法合并）匹配，附带分组名，截取前 30 张；
 *  收敛为单次 computed 计算，避免同一输入事件触发多次全库扫描。
 *  查询词 200ms 防抖：每次键入对全库跑 matchChordSearch（theory 的别名×变体展开，theory 属
 *  保护区不能在内部加缓存），调用侧防抖把「连打一词」收敛为一次扫描，交互上无感知差异 */
const SEARCH_RESULT_LIMIT = 30;
const debouncedSearchQuery = refDebounced(
  computed(() => searchQuery.value.trim()),
  200
);
/** 防抖值与输入框实时值是否一致：不一致 = 正处在防抖窗口内，旧结果是过期读数 */
const isSearchSynced = computed(() => debouncedSearchQuery.value === searchQuery.value.trim());
const searchResults = computed(() => {
  // 防抖值为空（初始 / 清空瞬间）不出结果：getGroupedCards(id, '') 语义是全库，
  // 不挡这里就会在键入第一个字符时闪一帧全表再变成过滤结果。
  // 防抖窗口内的过期结果保留展示（渐进收窄，不闪「正在搜索」），由传入 BaseInput 的
  // search-unsynced（!isSearchSynced）驱动其托管的「正在搜索 / 无结果」回退态
  const q = debouncedSearchQuery.value;
  if (!q) return [];
  const items: { card: GroupedChordCard; groupName: string }[] = [];
  for (const group of chordStore.groups)
    for (const card of chordStore.getGroupedCards(group.id, q)) {
      items.push({ card, groupName: group.name });
      if (items.length >= SEARCH_RESULT_LIMIT) return items;
    }

  return items;
});

/** 卡片是否为正在编辑的和弦（主和弦或任一变体指法命中编辑器草稿） */
const isCardActive = (card: GroupedChordCard) => {
  const draftId = editorStore.draftChord.id;
  return Boolean(draftId) && (card.mainChord.id === draftId || card.variants.some(v => v.id === draftId));
};

/** 选中搜索结果：载入主和弦 + 切换到所在分组（单展开模式）；
 *  分组行视口对焦由 GroupSection 分组行上的 v-scroll-into-view 声明式响应激活态完成 */
const selectSearchResult = (card: GroupedChordCard) => {
  editorStore.setEditor(card.mainChord);
  chordStore.selectAndExpandGroup(card.mainChord.groupId);
};

/* ---- 拼音分组的滚动条气泡 ----
   拼音分组排序把乐谱列表切成 A-Z（# 置末）的段，长列表里「滚到哪一组了」没有别的读数。
   气泡本体由 vScrollbar 托管（bubble.format 回调，随拇指移动、逐字符翻页、闲置淡出），
   本组件只回答一个问题：视口顶当前落在哪个分组之下。组头由 SongSection 以 data-pinyin-group
   标记；format 只在滚动帧里现查 DOM，不闭包捕获任何响应式列表 —— 指令侧对 format 只做引用
   替换、不重建滚动条（与 ScorePreviewPane 的页码读数同款口径）。 */

/** 视口顶所在的拼音分组：取「最后一个组头顶沿已越过滚动容器上沿」的组（视口系 rect 直接比较，
 *  两侧同帧读取、滚动位移天然同减，无需换算内容系坐标）；组头顶沿尚在容器上沿之下时（容器顶端
 *  留白带）归首组，不露空泡。无组头（非拼音排序 / 列表为空）返回空串，气泡由启用判据挡住 */
const resolvePinyinGroupLabel = (): string => {
  const host = scrollRef.value;
  if (!host) return '';
  const headers = host.querySelectorAll<HTMLElement>('[data-pinyin-group]');
  if (headers.length === 0) return '';
  const hostTop = host.getBoundingClientRect().top;
  let current = '';
  for (const header of headers) {
    if (header.getBoundingClientRect().top >= hostTop) break;
    current = header.dataset['pinyinGroup'] ?? '';
  }
  return current || (headers[0]?.dataset['pinyinGroup'] ?? '');
};

/** 列表滚动条绑定：仅「乐谱页 + 拼音分组排序」启用气泡读数，其余场景维持默认滚动条。
 *  排序方式切换会翻转 bubble.enabled —— 那是指令的结构性选项，updated 路径会整体重建一次，
 *  切换频率极低，重建成本可忽略 */
const listScrollbar = computed<ScrollAreaScrollbar>(() => {
  if (route.path !== ROUTE_PATHS.SCORE || songStore.songSortMethod !== 'title') return true;

  return {
    bubble: {
      format: () => resolvePinyinGroupLabel(),
      roll: false,
      hideDelay: 1500,
    },
  };
});

provide(CHORD_GROUP_MODALS, groupModals);
// 跨领域桥接：和弦卡「引用反查」的能力实现由应用层注入（内部走乐谱域 songStore）
provide(CHORD_REFERENCE_LOOKUP, (chordIds: string[]) => songStore.getChordReferences(chordIds).length);
provide(SONG_MODALS, songModals);
provide(BACKUP_MODALS, backupModals);

/** 用户点击"导入备份"：pickFile 打开系统文件选择框，选出 .json 备份后交给备份流程处理 */
const handleImportTrigger = async () => {
  const file = await pickFile({ accept: '.json' });
  if (!file) return;
  await backupModals.handleFileChange(file, () => {});
};

/** 过滤子菜单项：'全部' + 值列表；'全部' 即空串（与 store 的「无过滤」口径一致）。
 *
 *  ⚠️ `(v): MenuItem =>` 这个显式返回类型**不能省**：`.map()` 的结果被**展开进数组字面量**时，
 *  外层 `MenuItem[]` 的上下文类型传不进 map 的回调（对比直接 `return values.map(...)` 或
 *  `children: values.map(...)` 都能传进去），少了它 `checkPosition: 'right'` 会被拓宽成 `string`
 *  而报「不能将 string 分配给 "left" | "right" | undefined」。 */
const buildFilterChildren = (values: readonly string[]): MenuItem[] => [
  { label: '全部', value: '', checkPosition: 'right' },
  ...values.map((v): MenuItem => ({ label: v, value: v, checkPosition: 'right' })),
];

/** 乐谱过滤级联菜单：全部乐谱 / 按歌手 / 按拍号；子项带选中态，选择即生效（会话内状态，不持久化）。
 *
 *  ⚠️ **「全部乐谱」是动作项，不是选项** —— 它同时清两维，没有单一 `model` 值可绑，故用 `action`；
 *  其状态**只用 `disabled` 表达**（无过滤时点它没有意义），不写 `checked`。
 *  理由：「当前无过滤」这件事已由下面两个子菜单各自的「全部」子项勾选态表达；若这里再挂一个
 *  条件完全相同的 `checked`，等于同一判据驱动两个语义 —— 勾选态与禁用态永远同时出现或同时消失，
 *  其中必有一个是冗余表达。选项态在本项目只有一条路：`model` + `onPick`（见另两项）。 */
const songFilterMenuItems = computed<MenuItem[]>(() => [
  {
    label: '全部乐谱',
    icon: 'inbox',
    disabled: !songStore.hasSongFilter,
    action: () => void songStore.setSongFilters('', ''),
  },
  // 两个子菜单各是单选组、各管一维：勾选与点击由 model / onPick 派生，子项只描述 label/value。
  // 每一维只改自己那一维 —— 另一维过滤器原样带回
  {
    label: '按歌手',
    icon: 'mic',
    model: songStore.singerFilter,
    onPick: value => void songStore.setSongFilters(value, songStore.timeSignatureFilter),
    children: buildFilterChildren(songStore.availableSingerFilters),
  },
  {
    label: '按拍号',
    icon: 'clock',
    model: songStore.timeSignatureFilter,
    onPick: value => void songStore.setSongFilters(songStore.singerFilter, value),
    children: buildFilterChildren(songStore.availableTimeSignatureFilters),
  },
]);

/** 过滤按钮悬停提示：无过滤时说明入口，激活时展示当前条件 */
const songFilterButtonTitle = computed(() =>
  !songStore.hasSongFilter
    ? '筛选乐谱（按歌手 / 拍号）'
    : `筛选中：${[
        songStore.singerFilter && `歌手 ${songStore.singerFilter}`,
        songStore.timeSignatureFilter && `拍号 ${songStore.timeSignatureFilter}`,
      ]
        .filter(Boolean)
        .join(' · ')}`
);

/**
 * 排序菜单：既是菜单项本身、也是排序按钮图标的来源 —— 一份数据两用。
 * 勾选态与点击由菜单层的 `model` / `pick` 派生（见 BaseMenu），这里只描述「有哪些项」。
 * 此前 icon 在菜单项里内联一份、另有一张 SORT_ICON_MAP 供按钮用，同一份映射存两处 ——
 * 新增排序方式时漏改任一处，就会出现「菜单图标与按钮图标不一致」。
 */
const SONG_SORT_OPTIONS: MenuItem[] = [
  { label: '手动排序', icon: 'list', value: 'manual' },
  { label: '拼音分组', icon: 'type', value: 'title' },
  { label: '创建时间', icon: 'clock', value: 'createdAt' },
  // 经常回头改同一批歌时，「最近编辑」比「创建时间」更贴近找歌需求：
  // createdAt 一旦定了就不再变化，时间一长就失去排序意义
  { label: '最近编辑', icon: 'pencil', value: 'updatedAt' },
];

/** 菜单项 value 是 string，用守卫收窄回排序方式联合（新增排序方式时守卫与选项表同处一域，漏改会报错） */
const pickSort = (value: string): void => {
  if (isSongSortMethod(value)) songStore.setSongSortMethod(value);
};

/** 排序按钮图标随当前排序方式切换（与菜单项同源），颜色保持默认不换 */
const currentSortIcon = computed<IconName>(() => {
  const found = SONG_SORT_OPTIONS.find(o => o.value === songStore.songSortMethod);
  // icon 的类型含组件形态，取字符串那一支即可
  return (isString(found?.icon) ? found.icon : undefined) ?? 'list';
});
</script>
