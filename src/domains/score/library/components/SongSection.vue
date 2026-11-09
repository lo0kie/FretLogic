<template>
  <Feedback v-if="songStore.songs.length === 0" description="暂无乐谱，点击右上角新建" icon="music" />
  <Feedback v-else-if="songStore.filteredSongs.length === 0" description="没有符合筛选条件的乐谱" icon="search-x" />

  <!-- 统一容器：手动排序时经 useSortableList 支持拖拽，非手动时仅展示；
       排序方法切换（含手动↔拼音分组等）都在同一 TransitionGroup 内重排，FLIP 动画全程生效；
       拼音分组模式在列表中插入分组小标题行，分组显隐同样走 enter/leave 过渡。

       右键菜单改为**列表级委托**（见 handleListContextMenu）：原先每张卡片各包一个 BaseMenu，
       整库渲染就是数百个 BaseMenu + BasePopover 实例（各带 watcher / 浮层注册表 / 卸载钩子），
       过滤或换排序时它们要逐个卸载与重渲染 —— 这是列表掉帧的主要固定成本，与动画无关。
       改由容器上的 contextmenu 按 data-song-id 反查目标乐谱，再驱动列表外那个单例菜单
       按鼠标坐标打开，实例数从「一卡一个」降为「整列一个」。 -->
  <!-- 长列表走虚拟化：只挂视口附近的行，其余由占位总高顶住。
       容器上的三样接线（键盘导航、右键委托、列表根 ref）与下面那条路径完全同源 ——
       虚拟化换掉的是「渲染哪些行」，不是「列表是什么」。
       行元素必须绝对定位：它们在文档里的顺序不再是视觉顺序，靠 translateY 摆位。 -->
  <div
    v-arrow-nav.stop="{ cols: 1, selector: '.song-card-item' }"
    v-else-if="isVirtualized"
    @contextmenu="handleListContextMenu($event)"
    class="draggable-list relative flex flex-col"
    ref="songListRef"
  >
    <div :style="{ height: `${virtualTotalSize}px` }" class="relative w-full">
      <div
        v-for="entry in virtualRows"
        :data-index="entry.index"
        :key="entry.key"
        :ref="measureRow"
        :style="{ transform: `translateY(${entry.start}px)` }"
        class="absolute top-0 left-0 w-full"
      >
        <!-- 行内容与下面全量渲染路径逐字同源：分组小标题行 / 乐谱卡片二选一。
             两处都得改的时候别只改一处 —— 它们渲染的是同一份 songRows -->
        <div
          v-if="entry.row.type === 'group'"
          :data-pinyin-group="entry.row.label"
          aria-hidden="true"
          class="song-group-header px-sm pb-2xs"
        >
          <span class="text-xs leading-none font-bold tracking-widest text-fg-muted">{{ entry.row.label }}</span>
        </div>

        <SongCard
          v-else
          :drag-disabled-reason
          :draggable="isDragEnabled"
          :menu-target="isMenuTarget(entry.row.song.id)"
          :row="entry.row"
          @select="handleSelectSong(entry.row.song.id)"
        />
      </div>
    </div>
  </div>

  <!-- 短列表保持原来的全量渲染：TransitionGroup 的 FLIP 重排与进出场动画、Sortable 拖拽排序、
       键盘方向键的跨行导航都依赖「所有行都在 DOM 里」，见 useVirtualRows 的 minRows 说明 -->
  <TransitionGroup
    v-else
    v-arrow-nav.stop="{ cols: 1, selector: '.song-card-item' }"
    @contextmenu="handleListContextMenu($event)"
    @leave="onSongLeave($event)"
    class="draggable-list relative flex flex-col gap-sm"
    name="song-sort"
    ref="songListRef"
    tag="div"
  >
    <div v-for="row in songRows" :key="row.key" class="flex w-full flex-col">
      <!-- data-pinyin-group：分组键落在组头 DOM 上，供侧栏滚动条的气泡读数现查
           （视口顶压在哪个组头之下，读数即哪个分组；见 SidebarLeft 的 resolvePinyinGroupLabel） -->
      <div
        v-if="row.type === 'group'"
        :data-pinyin-group="row.label"
        aria-hidden="true"
        class="song-group-header px-sm pb-2xs"
      >
        <span class="text-xs leading-none font-bold tracking-widest text-fg-muted">{{ row.label }}</span>
      </div>

      <SongCard
        v-else
        :drag-disabled-reason
        :row
        :draggable="isDragEnabled"
        :menu-target="isMenuTarget(row.song.id)"
        @select="handleSelectSong(row.song.id)"
      />
    </div>
  </TransitionGroup>

  <!-- 列表级右键菜单（单例）：默认插槽为空，完全由 handleListContextMenu 以鼠标坐标驱动打开 -->
  <BaseMenu
    :context-trigger-el="contextMenuTriggerEl"
    :context-trigger-selector="SONG_CONTEXT_TRIGGER_SELECTOR"
    :items="songMenuItems"
    @close="closeSongContextMenu()"
    ref="songContextMenuRef"
    trigger="contextmenu"
  />
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch, watchEffect } from 'vue';

import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import { computeSongKey } from '@/domains/chord/theory/theory';
import { useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { cloneChordMap } from '@/domains/score/model/chordSlots';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useSortableList } from '@/platform/composables/useSortableList';
import { useVirtualRows } from '@/platform/composables/useVirtualRows';
import { useUndoableDeletionNotice } from '@/platform/ui/feedback/useUndoableDeletionNotice';
import { useTargetMenu } from '@/platform/ui/menu/useTargetMenu';
import { pinyinGroupKey } from '@/platform/utils/pinyin';

import SongCard from './SongCard.vue';

import type { SongItemRow } from './songCardRow';
import type { Song } from '@/domains/score/types';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { ComponentPublicInstance } from 'vue';

const { scrollElement = null } = defineProps<{
  /**
   * 宿主的滚动容器元素 —— 虚拟化按它算可视窗口。
   *
   * 由宿主下发，而不是在这里 `closest()` 反查：滚动容器是宿主（SidebarLeft）的实现细节，
   * 跨层反查它的类名/结构，改动一处就静默失准。为空（宿主尚未就绪）时不渲染任何行。
   */
  scrollElement?: HTMLElement | null;
}>();

const emit = defineEmits<{
  (e: 'open-config', song: Song): void;
  (e: 'open-clear', song: Song): void;
}>();

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const notifyUndoableDeletion = useUndoableDeletionNotice();
const { selectSong } = useScoreRouteSync();
const { copySongText, shareSongLink } = useTextTransfer();

// 两条渲染路径的根元素不同：虚拟化路径是普通 div（ref 直接拿到元素），全量路径挂在
// <TransitionGroup> 上（ref 拿到组件实例，$el 才是容器）。类型按两者的并集声明，取元素统一走
// listEl —— 拖拽排序、右键菜单的触发区域、整批替换的门控都要的是**元素**，各自解一次迟早漏一处。
const songListRef = useTemplateRef<ComponentPublicInstance | HTMLElement>('songListRef');

/** 列表容器元素（两种 ref 形态归一） */
const listEl = computed<HTMLElement | null>(() => {
  const { value } = songListRef;
  if (!value) return null;
  return value instanceof HTMLElement ? value : ((value.$el as HTMLElement | undefined) ?? null);
});

/** 分组小标题行（仅拼音分组模式插入） */
interface SongGroupRow {
  key: string;
  type: 'group';
  label: string;
}

type SongListRow = SongGroupRow | SongItemRow;

/** 组装 song 行（派生量的口径见 SongItemRow） */
const songRowOf = (song: Song): SongItemRow => {
  const songKeyText = computeSongKey(song.playKey, song.capo);
  return {
    key: song.id,
    type: 'song',
    song,
    songKeyText,
    cardAriaLabel: `乐谱 ${song.title}，${songKeyText}调，Capo ${song.capo}`,
    keyAriaLabel: song.originalKey ? `原调 ${song.originalKey}，演唱调 ${songKeyText} 调` : `调性 ${songKeyText} 调`,
    keyTitle: song.originalKey
      ? `原调 ${song.originalKey} · Capo ${song.capo} → ${songKeyText}`
      : `未记录原调 · Capo ${song.capo} → ${songKeyText}`,
  };
};

/** 列表行：拼音分组模式在歌曲间插入分组小标题行（键前缀 group: 避免与歌曲 id 冲突），其余排序模式为纯歌曲行；数据源为过滤后的歌曲 */
const songRows = computed<SongListRow[]>(() => {
  if (songStore.songSortMethod !== 'title') return songStore.filteredSongs.map(songRowOf);

  const rows: SongListRow[] = [];
  let currentGroup = '';
  for (const song of songStore.filteredSongs) {
    const group = pinyinGroupKey(song.title);
    if (group !== currentGroup) {
      currentGroup = group;
      rows.push({ key: `group:${group}`, type: 'group', label: group });
    }
    rows.push(songRowOf(song));
  }
  return rows;
});

/* ---- 虚拟化 ---- */

/**
 * 行数达到这个量级才虚拟化。短列表保留原来的全量渲染路径 —— 三件依赖「所有行都在 DOM 里」的
 * 能力都挂在它上面：TransitionGroup 的 FLIP 重排与进出场动画、Sortable 拖拽排序、键盘方向键导航。
 * 常见规模（几十首）本来就不卡，没必要为它们换掉这套机制。
 */
const VIRTUALIZE_MIN_ROWS = 50;

/** 行间距（px）：与模板里全量渲染路径的 gap-sm 同源（--spacing-sm = 0.5rem）。改其一必改另一 */
const LIST_GAP_PX = 8;

/** 预挂载量（行）：视口上下各多挂这么多行，滚动无感 */
const VIRTUAL_OVERSCAN = 8;

/** 行高估值（px）：只用于尚未实测过的行 —— 分组小标题与卡片高度不同，卡片自身也分两种徽标排布 */
const SONG_ROW_ESTIMATE = 46;
const GROUP_ROW_ESTIMATE = 22;

const {
  enabled: isVirtualized,
  items: virtualRows,
  totalSize: virtualTotalSize,
  measureRow,
  scrollToIndex,
  isIndexRendered,
} = useVirtualRows<SongListRow>({
  scrollElement: () => scrollElement,
  rows: songRows,
  estimateSize: row => (row.type === 'group' ? GROUP_ROW_ESTIMATE : SONG_ROW_ESTIMATE),
  getKey: row => row.key,
  gap: LIST_GAP_PX,
  overscan: VIRTUAL_OVERSCAN,
  minRows: VIRTUALIZE_MIN_ROWS,
  // 强制挂上「当前段落的小标题行」：侧栏滚动条的气泡读数是现查 DOM 的
  // （SidebarLeft 的 resolvePinyinGroupLabel 取「顶沿已越过容器上沿的最后一个 [data-pinyin-group]」），
  // 而拼音分组模式下每个字母下常有几十首歌、远超预挂载量 —— 小标题行一旦被挡在窗口外，
  // 那条查询就找不到当前组、读数跳到下一组。固定挂上窗口之前最近的那一条即可让原查询原样成立。
  pinIndexes: ({ startIndex }, rows) => {
    for (let i = startIndex; i >= 0; i--) if (rows[i]?.type === 'group') return [i];
    return [];
  },
});

/**
 * 选中的乐谱若不在渲染窗口内，卡片上的 v-scroll-into-view 是够不着的（那一行根本没挂载），
 * 这里按下标补一次定位；已在窗口内的情形仍交给指令 —— 两处都做会各滚一次、互相打断。
 *
 * 依赖里带 scrollElement 与 isVirtualized：窗口是「行数够了 + 容器就绪」之后才算得出来的，
 * 只盯 activeSongId 会漏掉「深链进来时它一开始就是对的」这一路。
 */
watch(
  [() => scoreEditor.activeSongId, isVirtualized, () => scrollElement],
  () => {
    const id = scoreEditor.activeSongId;
    if (!id || !isVirtualized.value || !scrollElement) return;
    const index = songRows.value.findIndex(row => row.type === 'song' && row.song.id === id);
    if (index < 0 || isIndexRendered(index)) return;
    scrollToIndex(index);
  },
  { immediate: true, flush: 'post' }
);

/* ---- 拖拽排序 ---- */

// 手动排序时启用拖拽（Sortable 直接操作 DOM，拖拽结束按容器 children 反推新顺序后经 reorderSongs 持久化）；
// 非手动排序或过滤激活时禁用（过滤后 DOM 序与全量数组序不一致，按索引重排会错位）。
// 空列表守卫、容器就绪后再初始化、以及 disabled 的响应式跟随都由 useSortableList 承担。
// 列表自身的 TransitionGroup 只管增删与排序方法切换的 enter/leave/move：拖拽松手时 DOM
// 已被 Sortable 摆成最终顺序，patch 前后位置一致、它的 FLIP 位移为 0，不会与拖拽动画打架。
//
// **虚拟化时必须一并禁用**：Sortable 搬的是容器里真实存在的子元素，而窗口外的行根本没挂载 ——
// resolveNextOrder 会因「元素数 ≠ 数据条数」直接放弃并退回下标运算，算出来的顺序与用户所见不符，
// 是静默改错数据那类问题。宁可在大列表上不给拖拽，也不能给一个会算错的拖拽。
//
// 抽成具名 computed 而不内联：卡片上的拖拽把手线索（SongCard 的 draggable）必须与这里同源，
// 各写一份条件迟早分叉 —— 把手还在、拖动已失效（或反之）是最难归因的那类不一致
const isDragEnabled = computed(
  () => songStore.songSortMethod === 'manual' && !songStore.hasSongFilter && !isVirtualized.value
);

/**
 * 拖拽「本该可用、却被列表长度挡住」时给用户的说明（空串 = 没有这种情况）。
 *
 * 【为什么需要它】另两种「拖不动」都有可见的表达：非手动排序时拖拽本来就没有意义（把手直接藏掉），
 * 筛选态由顶栏那枚筛选徽标显示。只有虚拟化这一条是**用户以为能拖、却拖不动**，而界面上没有任何
 * 线索 —— 把手不出现、拖了也没反应，只能靠猜。
 *
 * 【为什么文案里带首数】阈值（VIRTUALIZE_MIN_ROWS）是实现细节，用户不需要知道「50」这个数；
 * 他需要的是确认「确实是我这份列表太长」。带上当前首数就够了。
 *
 * 判据刻意只到「已虚拟化」为止：筛选态不并进来（那是另一条规则、另有一处可见表达），
 * 两个原因混成一句话会让用户以为去掉筛选就能拖。
 */
const dragDisabledReason = computed(() => {
  if (isDragEnabled.value) return '';
  if (songStore.songSortMethod !== 'manual' || songStore.hasSongFilter) return '';
  return `列表较长已停用排序`;
});

useSortableList<Song>({
  target: songListRef,
  items: () => songStore.songs,
  enabled: isDragEnabled,
  onReorder: next => songStore.reorderSongs(next),
  // 触屏：长按 = 右键（卡片菜单在手机上唯一的入口，见 SongCard 的把手注释）。
  // 长按弹出的菜单在手指开始移动（拖拽接管这次手势）时收起 —— 收的是**本列表这一个**菜单
  // （`songContextMenuRef`），不是全局关闭。
  longPressMenu: { onDismiss: () => songContextMenuRef.value?.closeMenu('long-press-drag') },
});

// 乐谱右键菜单项：按需构建（仅在右键命中某张卡片后构建一次），不缓存
const getSongMenuItems = (song: Song): MenuItem[] => {
  const items: MenuItem[] = [
    {
      label: '复制乐谱',
      icon: 'copy',
      action: () => void copySongText(song),
    },
    {
      // 分享：与「复制乐谱」同一份载体（token），只是外面套了一条可直接打开的地址
      label: '分享乐谱',
      icon: 'share-2',
      action: () => void shareSongLink(song),
    },
    {
      label: '修改属性',
      icon: 'sliders-horizontal',
      action: () => void emit('open-config', song),
    },
    {
      label: '清空和弦',
      icon: 'eraser',
      action: () => void emit('open-clear', song),
    },
    {
      label: '删除乐谱',
      icon: 'trash-2',
      danger: true,
      action: () => {
        const isCurrentActive = scoreEditor.activeSongId === song.id;
        // 必须深拷贝：浅拷贝（new Map）会让撤销快照与实时编辑共享行容器，「之前的状态」跟着当前编辑一起变
        const deletedSong = { ...song, chordMap: cloneChordMap(song.chordMap) };
        const originalIndex = songStore.songs.findIndex(s => s.id === song.id);
        songStore.deleteSong(song.id);
        if (isCurrentActive) scoreEditor.setActiveSong(null);

        notifyUndoableDeletion({
          title: `已删除乐谱「${song.title}」`,
          restoredTip: `已恢复乐谱「${deletedSong.title}」`,
          undo: () => {
            songStore.restoreSong(deletedSong, originalIndex >= 0 ? originalIndex : undefined);
            if (isCurrentActive) scoreEditor.setActiveSong(deletedSong.id);
          },
        });
      },
    },
  ];
  return items;
};

/** 用户点击乐谱卡：再次点击取消选中；URL 以 replace 镜像（选歌不产生历史），滚动对焦由卡片上的 v-scroll-into-view 声明式完成 */
const handleSelectSong = (songId: string) => void selectSong(scoreEditor.activeSongId === songId ? null : songId);

/* ---- 列表级右键菜单（单例）：取代原先「每张卡片一个 BaseMenu」的写法 ---- */
const songContextMenuRef = useTemplateRef<InstanceType<typeof BaseMenu>>('songContextMenuRef');

/**
 * 卡片上标记「这张卡是右键目标」的属性 —— 委托 handler 反查目标用它，菜单的区域判定也用它
 * （见下方 contextTriggerEl / contextTriggerSelector）。**必须同源**：换了一处忘了另一处，
 * 就会出现「右键某类元素能开菜单、却关不掉」这类只在某一半上生效的错。
 */
const SONG_CONTEXT_TRIGGER_SELECTOR = '[data-song-id]';

/**
 * 右键「触发区域」＝列表容器本身（透传给 BaseMenu 的 contextTriggerEl）。
 *
 * 本菜单是挂在列表外的单例、右键由容器委托处理（见下方 handleListContextMenu），因此 BaseMenu
 * 内部那个只包默认插槽的包裹层是空的。而 BasePopover 的全局 contextmenu 外点判定走**捕获阶段**，
 * 早于容器上的委托执行：不把列表容器报给菜单，落在卡片上的右键就会被判成「区域外」先关闭，
 * 委托随后才 openMenuAt —— 那时 wasOpen 已是 false，走的是首次打开。表现即「右键不换位、
 * 而是把菜单整个重开一遍（重放入场动画）」。
 *
 * 容器是 TransitionGroup 的 $el（列表为空时该组件不渲染，此处为 null，退回内部包裹层）。
 */
const contextMenuTriggerEl = ref<HTMLElement | null>(null);
watchEffect(() => {
  contextMenuTriggerEl.value = listEl.value;
});

/** 单例菜单的数据源：目标为**乐谱 id**，菜单项按 id 现查乐谱构建（不缓存乐谱对象）；
 *  未命中任何乐谱时为空数组，BaseMenu 会据此拒绝打开。
 *  「必须等 nextTick」「关闭后保留目标」两个不变量由 useTargetMenu 统一保证。 */
const {
  target: contextMenuSongId,
  isOpen: isContextMenuOpen,
  items: songMenuItems,
  openAt: openSongContextMenuAt,
  close: closeSongContextMenu,
} = useTargetMenu<string>(songId => {
  const song = songStore.songs.find(s => s.id === songId);
  return song ? getSongMenuItems(song) : [];
}, songContextMenuRef);

/** 卡片「菜单正针对我」的样式判据，等价原先 BaseMenu 的 isOpen 作用域槽 */
const isMenuTarget = (songId: string): boolean => isContextMenuOpen.value && contextMenuSongId.value === songId;

/**
 * 右键委托：从事件目标反查 data-song-id，把命中的乐谱交给 useTargetMenu 在光标处打开
 * （「写目标 → 等一拍 → openMenuAt」的时序由 composable 保证，见 useTargetMenu 的 ②）。
 */
const handleListContextMenu = (e: MouseEvent): void => {
  const host = (e.target as HTMLElement | null)?.closest<HTMLElement>(SONG_CONTEXT_TRIGGER_SELECTOR);
  const songId = host?.dataset['songId'];
  if (!songId) return;
  e.preventDefault();
  e.stopPropagation();
  openSongContextMenuAt(e, songId);
};

/* ---- 切换排序方法时让 FLIP 早退 ----
   排序方法变化会重排整列：TransitionGroup 的 FLIP 要为数百行各读两次 getBoundingClientRect、
   写内联 transform、逐个挂 transitionend，再让数百张卡片同时跑 300ms transform 过渡。
   整列重排并不存在「某一行滑到了新位置」这种需要被看清的因果，动画在此只有成本。
   做法是同步 watcher 在渲染前给容器打 data-bulk-reorder（同步 watcher 早于组件更新任务出队），
   下一帧摘掉。刻意不走响应式 class：那会为「摘标记」再触发一次整列重渲染；
   也不用 classList —— Vue 在 class 绑定值变化时会整体重写 className，会把标记冲掉。 */
let bulkReorderRaf = 0;
watch(
  () => songStore.songSortMethod,
  () => {
    const el = listEl.value;
    if (!el) return;
    el.dataset['bulkReorder'] = '1';
    cancelAnimationFrame(bulkReorderRaf);
    bulkReorderRaf = requestAnimationFrame(() => {
      delete el.dataset['bulkReorder'];
    });
  },
  { flush: 'sync' }
);

/* ---- 筛选条件变更：那一次渲染是「整批替换」，不是「重排」 ----
   与 data-bulk-reorder 同源（同样走同步 watcher、同样用 data 属性而非 class 打标记），
   但**只覆盖条件变更引发的那一次渲染**，绝不常驻。

   这一点是刻意的：筛选态是长期状态（选完歌手就一直挂着），门控若绑在 hasSongFilter 上，
   就会在筛选中全程关掉整列的 enter/leave/move —— 「筛选中删除 / 撤销 / 新增乐谱一律没有动画」
   就是这么来的。而真正贵的整批替换只发生在改筛选条件那一帧，门控只该活那几帧。

   摘标记比 data-bulk-reorder 晚两帧：入场/离场的过渡时长由 Vue 在 nextFrame（嵌套两层 rAF）
   里读 getComputedStyle 决定，标记若在第一帧就摘掉，读到的就是真实时长，门控形同没加。 */
let isBulkReplacing = false;
let bulkReplaceToken = 0;

/** 标记「本次渲染是筛选条件变更引发的整批替换」，链式排帧三帧后自动摘除 */
const markBulkReplace = (): void => {
  const el = listEl.value;
  if (!el) return;
  el.dataset['bulkReplace'] = '1';
  isBulkReplacing = true;

  // token 让连改筛选条件时只留最后一条链：旧链自检发现被顶替即停，不会摘掉新链刚打上的标记
  const token = ++bulkReplaceToken;
  const step = (left: number): void => {
    if (token !== bulkReplaceToken) return;
    if (left > 0) {
      requestAnimationFrame(() => step(left - 1));
      return;
    }
    delete el.dataset['bulkReplace'];
    isBulkReplacing = false;
  };
  step(3);
};

// 以 \0 连接成单键：两个筛选值本身可含任意字符，直接拼接会让「歌手 'a' + 拍号 'bc'」与
// 「歌手 'ab' + 拍号 'c'」撞键而漏掉一次门控
watch(() => `${songStore.singerFilter}\u0000${songStore.timeSignatureFilter}`, markBulkReplace, { flush: 'sync' });

/**
 * 删除/移除乐谱时的 leave 钩子：锁死当前纵向偏移，避免 position:absolute 后
 * top 在 flex 容器里被解析为容器顶端，导致卡片“飞”到列表顶部（飞得太远）。
 * 单参数 → Vue 仍走 CSS transitionend 判定，无需手动 done()。
 *
 * 整批替换期间直接返回：那时 leave 已被 data-bulk-replace 压成瞬时（见样式块），元素同一 tick
 * 就被移除，「锁死偏移」没有意义；而这里每张卡片都要读两次 rect 再写 style，一读一写交错会让
 * 数百张被筛掉的卡片各自触发一次全量重排 —— 那是整批替换掉帧的第二个来源。
 * 判据用 isBulkReplacing 而非 hasSongFilter：筛选中单张卡片的进出仍要正常锁偏移（那是普通删除）。
 */
const onSongLeave = (el: Element): void => {
  if (isBulkReplacing) return;
  const node = el as HTMLElement;
  const parent = node.parentElement;
  if (!parent) return;
  const elRect = node.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  // 收窄过渡：离场元素自带 transition-all，若补间 top 会二次滑动；改为仅淡出 + 轻微位移
  node.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
  node.style.top = `${elRect.top - parentRect.top + parent.scrollTop}px`;
  node.style.bottom = 'auto';
};
</script>

<style scoped lang="scss">
/* 切换排序方法时的重排动画：TransitionGroup 的 FLIP move 过渡。
   过渡类加在行元素上，而行元素与承载列表的那个 div 都出自本组件模板（TransitionGroup 的
   tag 元素作为子组件根节点同样会带上本组件的 [data-v-*]），scoped 一并匹配得到，无需非 scoped 规则。
   enter/leave 用于分组小标题的显隐（切换进/出拼音分组模式、歌曲增删时同样生效）：
   leave 置 absolute 使其脱离 flex 流，其余行由 move 过渡平滑上移 */
.song-sort-move {
  /* 缓动取 tokens 令牌（与全局过渡类、ease-standard 工具类同一条曲线），不写裸值 */
  transition: transform 0.3s var(--bezier-standard);
}
.song-sort-enter-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.song-sort-leave-active {
  position: absolute;
  right: 0;
  left: 0;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.song-sort-enter-from,
.song-sort-leave-to {
  transform: translateY(-6px);
  opacity: 0;
}

/* ---- 整批替换内容（改筛选条件）的那一帧：关闭整列过渡 ----
   替换是「整批内容替换」，不是「重排」：留下哪些行、去掉哪些行由筛选条件决定，并不存在
   「某一行滑到了新位置」这种需要被看清的因果关系，所以重排动画在此没有信息量，只有代价 ——
   而代价恰好全是最贵的那几种：
   1. TransitionGroup 走 FLIP 时，会对上一渲染批次的**每个**子元素读两次 getBoundingClientRect
      （渲染期记录 + onUpdated 复测）、给移动项写内联 transform、逐个挂 transitionend 监听，
      最后让数百张卡片同时跑 300ms transform 过渡；
   2. 被筛掉的行走 leave：以 position:absolute 留在文档里做 200ms 淡出，与新列表叠加，且
      onSongLeave 要为每张卡片「读两次 rect → 写 style」，一读一写交错 → 每张卡片各触发一次
      全量重排。

   门控挂在容器上，而不是给 TransitionGroup 传 :css="false" —— 后者管不到 FLIP：Vue 是否走
   FLIP 只取决于 moveClass 在 CSS 里有没有 transform 过渡（hasCSSTransform 检查 prevChildren[0]
   的克隆），把这条过渡压成 none 才能让它整体早退。
   transition 归零同时让 enter/leave 立即 resolve（时长为 0 时 Vue 直接完成），于是新入场行不再
   淡入、离场行不再残留。

   标记由脚本按「条件变更 → 三帧后摘除」打在容器上（见 markBulkReplace），**不是常驻态**：
   常驻（原先绑 hasSongFilter）会把筛选中的删除 / 撤销 / 新增一并压成无动画。 */
.draggable-list[data-bulk-replace] .song-sort-move,
.draggable-list[data-bulk-replace] .song-sort-enter-active,
.draggable-list[data-bulk-replace] .song-sort-leave-active {
  transition: none;
}
/* 被筛掉的行不再脱离 flex 流：否则移除前那一瞬还会再触发一轮重排 */
.draggable-list[data-bulk-replace] .song-sort-leave-active {
  position: static;
}

/* ---- 切换排序方法：整列重排时让 FLIP 早退 ----
   与上面同源同理：Vue 是否走 FLIP 只取决于 moveClass 在 CSS 里有没有 transform 过渡
   （hasCSSTransform 取 prevChildren[0] 的克隆读 computed style），把这条压成 none 即可让
   TransitionGroup 的 onUpdated 整体早退，省下数百行的 rect 读取、内联 transform 写入与
   transitionend 监听，以及随后 300ms 的并发 transform 过渡。
   标记由脚本以 data- 属性写在容器上（见 handleListContextMenu 下方的 watcher）。 */
.draggable-list[data-bulk-reorder] .song-sort-move {
  transition: none;
}
</style>
