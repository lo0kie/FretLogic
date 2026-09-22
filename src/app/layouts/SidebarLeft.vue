<template>
  <aside
    v-bind="$attrs"
    :aria-label="route.path === ROUTE_PATHS.SCORE ? '乐谱库' : '指法库'"
    :inert="!uiStore.isLeftOpen ? true : undefined"
    :style="{
      width: LEFT_SIDEBAR_WIDTH_PIXEL,
      transform: uiStore.isLeftOpen ? 'translateX(0)' : 'translateX(-100%)',
      opacity: uiStore.isLeftOpen ? 1 : 0,
      pointerEvents: uiStore.isLeftOpen ? 'auto' : 'none',
      boxShadow: uiStore.isLeftOpen ? 'var(--shadow-panel)' : 'none',
    }"
    class="panel-left absolute inset-y-0 left-0 z-sidebar flex h-full flex-col overflow-hidden border-r border-glass-border bg-surface-panel transition-[transform,opacity] duration-slow ease-sidebar will-change-transform"
  >
    <div class="panel-header flex h-10 shrink-0 items-center justify-between gap-sm border-b border-glass-border px-lg">
      <div
        v-if="route.path === ROUTE_PATHS.WORKBENCH"
        class="v-fade-in-quick flex w-full min-w-0 items-center justify-between gap-sm"
        key="workbench"
      >
        <BaseInput
          v-model="searchQuery"
          :search-item-selected="item => isCardActive(item.card)"
          :search-item-title="getSearchItemTitle"
          :search-items="searchResults"
          :search-no-result-text="noResultText"
          :search-synced="isSearchSynced"
          @select-search-index="handleSelectSearchIndex($event)"
          clearable
          searchable
          class="header-search-input min-w-0 flex-1"
          font-size="xs"
          placeholder="搜索和弦..."
          prefix-icon="search"
          search-guide-text="输入和弦名称搜索..."
          title="搜索和弦（支持名称与和弦级数检索）"
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
              <BaseBadge
                v-if="item.card.variantCount > 1"
                :title="`共 ${item.card.variantCount}个指法`"
                appearance="subtle"
                size="2xs"
                variant="primary"
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
                  selected ? 'text-primary' : 'text-fg-disabled',
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
            aria-label="新建分组"
            icon="plus"
            icon-size="xl"
            icon-stroke="regular"
            variant="ghost"
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
            size="xs"
            variant="neutral"
          >
            <BaseRollingText :text="`${songStore.filteredSongs.length}`" class="tabular-nums" />
          </BaseBadge>
        </div>

        <div class="header-actions flex shrink-0 items-center gap-xs">
          <BaseMenu :items="songFilterMenuItems" placement="bottom">
            <template #trigger="{ isOpen, pinToggle }">
              <ActionButton
                :aria-expanded="isOpen"
                :color="songStore.hasSongFilter ? 'primary' : isOpen ? 'primary' : 'default'"
                :title="songFilterButtonTitle"
                :variant="songStore.hasSongFilter || isOpen ? 'subtle' : 'ghost'"
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

          <BaseMenu :items="songSortMenuItems" placement="bottom">
            <template #trigger="{ isOpen, pinToggle }">
              <ActionButton
                :aria-expanded="isOpen"
                :color="isOpen ? 'primary' : 'default'"
                :variant="isOpen ? 'subtle' : 'ghost'"
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
            aria-label="新建乐谱"
            icon="plus"
            icon-size="xl"
            icon-stroke="regular"
            variant="ghost"
          />
        </div>
      </div>
    </div>

    <!-- 顶部留白放在滚动容器**外面**：padding 若在滚动容器内，它属于可滚动区且在裁剪边界之内，
         sticky 头贴住上沿时那一条 padding 带会一直漏着滚过的内容（此前只能靠遮挡带硬遮）。
         留白外移后，滚动容器的裁剪边界就在留白下沿，吸附头 top:0 既贴住可视上沿（不漏内容），
         视觉上又与上方 header 隔开了这段留白；内容也从留白下沿起被干净裁断。
         上下留白都放外层（py-md），滚动容器自身只留横向 padding -->
    <div
      class="left-group-list-container left-group-list relative flex min-h-0 w-full flex-1 flex-col overflow-hidden py-md"
    >
      <!-- 顶部羽化的起始缘内缩量由 GroupSection 按「此刻是否有头吸附」声明目标值
           （--fade-offset-target），指令走「淡出 → 改位置 → 淡入」的时序应用，位置变化不可见 -->
      <BaseScrollArea close-popovers axis="y" class="scroll-body flex-1 px-md" ref="scrollAreaRef">
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
    </div>

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
import { computed, nextTick, provide, ref, useTemplateRef, watch } from 'vue';

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
import { useBackupModals } from '@/app/modals/useBackupModals';
import { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import { CHORD_REFERENCE_LOOKUP } from '@/domains/chord/library/injectionKeys';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useSongModals } from '@/domains/score/library/composables/useSongModals';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useUiStore } from '@/platform/store/uiStore';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { LEFT_SIDEBAR_WIDTH_PIXEL, ROUTE_PATHS } from '@/platform/utils/constants';
import { pickFile } from '@/platform/utils/transfer';

import type { GroupedChordCard } from '@/domains/chord/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';

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
//（与 BaseCollapse 同一写法，vGridNav 的 isEligible 也已识别 [inert] 子树）。
const chordStore = useChordStore();
const songStore = useSongStore();

// 两个 section（KeepAlive）共用同一个滚动容器，滚动位置无法随组件 DOM 天然保持：
// 按路由 key 手动缓存 scrollTop，切走时保存、切回时在内容重挂载后恢复
const SCROLL_CACHE = new Map<string, number>();

watch(
  () => route.path,
  (next, prev) => {
    if (prev) SCROLL_CACHE.set(prev, scrollRef.value?.scrollTop ?? 0);
    // 恢复 scrollTop 会触发 scroll 事件 → v-edge-fade 自动重测渐隐，无需手动同步
    nextTick(() => {
      const el = scrollRef.value;
      if (!el) return;
      el.scrollTop = SCROLL_CACHE.get(next) ?? 0;
    });
  }
);

watch(
  () => uiStore.isLeftOpen,
  isOpen => {
    // 侧栏重开时容器尺寸 0→实际值，v-edge-fade 的 ResizeObserver 自动触发重测
    if (isOpen)
      nextTick(() => {
        const el = scrollRef.value;
        if (el) el.scrollTop = SCROLL_CACHE.get(route.path) ?? el.scrollTop;
      });
  }
);

const groupModals = useChordGroupModals();
const songModals = useSongModals();
const backupModals = useBackupModals();
const editorStore = useChordEditorStore();

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
  // search-synced（isSearchSynced）驱动其托管的「正在搜索 / 无结果」回退态
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

provide('groupModals', groupModals);
// 跨领域桥接：和弦卡「引用反查」的能力实现由应用层注入（内部走乐谱域 songStore）
provide(CHORD_REFERENCE_LOOKUP, (chordIds: string[]) => songStore.getChordReferences(chordIds).length);
provide('songModals', songModals);
provide('backupModals', backupModals);

/** 用户点击"导入备份"：pickFile 打开系统文件选择框，选出 .json 备份后交给备份流程处理 */
const handleImportTrigger = async () => {
  const file = await pickFile({ accept: '.json' });
  if (!file) return;
  await backupModals.handleFileChange(file, () => {});
};

/** 乐谱排序菜单（交互参考主题切换：Popover + 菜单项，选中项带勾选标记） */
/** 乐谱过滤级联菜单：全部乐谱 / 按歌手 / 按拍号；子项带选中态，选择即生效（会话内状态，不持久化） */
const songFilterMenuItems = computed<MenuItem[]>(() => {
  const clearBoth = () => songStore.setSongFilters('', '');
  const singerChildren: MenuItem[] = [
    {
      label: '全部',
      checked: songStore.singerFilter === '',
      checkPosition: 'right',
      action: () => songStore.setSongFilters('', songStore.timeSignatureFilter),
    },
    ...songStore.availableSingerFilters.map(singer => ({
      label: singer,
      checked: songStore.singerFilter === singer,
      checkPosition: 'right' as const,
      action: () => songStore.setSongFilters(singer, songStore.timeSignatureFilter),
    })),
  ];
  const timeSigChildren: MenuItem[] = [
    {
      label: '全部',
      checked: songStore.timeSignatureFilter === '',
      checkPosition: 'right',
      action: () => songStore.setSongFilters(songStore.singerFilter, ''),
    },
    ...songStore.availableTimeSignatureFilters.map(sig => ({
      label: sig,
      checked: songStore.timeSignatureFilter === sig,
      checkPosition: 'right' as const,
      action: () => songStore.setSongFilters(songStore.singerFilter, sig),
    })),
  ];
  return [
    {
      label: '全部乐谱',
      icon: 'inbox',
      checked: !songStore.hasSongFilter,
      disabled: !songStore.hasSongFilter,
      action: clearBoth,
    },
    { label: '按歌手', icon: 'mic', children: singerChildren },
    { label: '按拍号', icon: 'clock', children: timeSigChildren },
  ];
});

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

const songSortMenuItems = computed<MenuItem[]>(() => [
  {
    label: '手动排序',
    icon: 'list',
    checked: songStore.songSortMethod === 'manual',
    action: () => songStore.setSongSortMethod('manual'),
  },
  {
    label: '拼音分组',
    icon: 'type',
    checked: songStore.songSortMethod === 'title',
    action: () => songStore.setSongSortMethod('title'),
  },
  {
    label: '创建时间',
    icon: 'clock',
    checked: songStore.songSortMethod === 'createdAt',
    action: () => songStore.setSongSortMethod('createdAt'),
  },
  {
    // 经常回头改同一批歌时，「最近编辑」比「创建时间」更贴近找歌需求：
    // createdAt 一旦定了就不再变化，时间一长就失去排序意义
    label: '最近编辑',
    icon: 'pencil',
    checked: songStore.songSortMethod === 'updatedAt',
    action: () => songStore.setSongSortMethod('updatedAt'),
  },
]);

const SORT_ICON_MAP: Record<string, IconName> = {
  title: 'type',
  createdAt: 'clock',
  updatedAt: 'pencil',
};

/** 排序按钮图标随当前排序方式切换（与菜单项图标一致），颜色保持默认不换 */
const currentSortIcon = computed<IconName>(() => SORT_ICON_MAP[songStore.songSortMethod] ?? 'list');
</script>
