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
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.song-card-item' }" @contextmenu="handleListContextMenu($event)">
    <TransitionGroup
      @leave="onSongLeave($event)"
      class="draggable-list relative flex flex-col gap-sm"
      name="song-sort"
      ref="songListRef"
      tag="div"
    >
      <div v-for="row in songRows" :key="row.key" class="flex w-full flex-col">
        <div v-if="row.type === 'group'" aria-hidden="true" class="song-group-header px-sm pb-2xs">
          <span class="text-xs leading-none font-bold tracking-widest text-fg-disabled">{{ row.label }}</span>
        </div>
        <div
          v-action-card
          v-else
          v-wave
          v-scroll-into-view.y="isSongActive(row.song.id)"
          :aria-label="isSongActive(row.song.id) ? `${row.cardAriaLabel}，已选中` : row.cardAriaLabel"
          :aria-pressed="isSongActive(row.song.id)"
          :class="{
            'border-tint-primary-60! bg-tint-primary-92! hover:border-primary! hover:bg-tint-primary-82! hover:shadow-[0_0_0_1px_var(--color-primary)]':
              isSongActive(row.song.id),
            'border-border-base bg-surface-panel-hover': isMenuTarget(row.song.id),
          }"
          :data-song-id="row.song.id"
          :title="row.song.title"
          @click="handleSelectSong(row.song.id)"
          data-focusable-outline
          class="song-card-item w-full cursor-pointer rounded-md border border-border-light bg-surface-body p-sm px-md transition-all duration-fast outline-none hover:border-border-base hover:bg-surface-panel-hover"
        >
          <div class="flex w-full flex-col gap-2xs">
            <div class="flex w-full items-center justify-between gap-sm">
              <div v-marquee.fade class="min-w-0 flex-1">
                <span
                  :class="isSongActive(row.song.id) ? 'font-bold text-primary!' : 'text-fg-title'"
                  class="text-xs font-semibold"
                >
                  {{ row.song.title }}
                </span>
              </div>

              <div class="flex shrink-0 gap-xs">
                <template v-if="row.song.singer">
                  <BaseBadge
                    :appearance="isSongActive(row.song.id) ? 'subtle' : 'filled'"
                    :aria-label="`歌手 ${row.song.singer}`"
                    :title="`歌手：${row.song.singer}`"
                    size="2xs"
                    variant="neutral"
                  >
                    <span class="block max-w-[7rem] truncate">{{ row.song.singer }}</span>
                  </BaseBadge>
                </template>

                <template v-else>
                  <BaseBadge
                    :appearance="isSongActive(row.song.id) ? 'subtle' : 'filled'"
                    :aria-label="row.keyAriaLabel"
                    :title="row.keyTitle"
                    size="2xs"
                    variant="neutral"
                    width="2rem"
                  >
                    <!-- 「调」走 suffix 显式声明：拼进 name 会让整串解析失败、升降号退化成普通字符 -->
                    <span v-chord-name="{ name: row.songKeyText, suffix: '调' }" />
                  </BaseBadge>

                  <BaseBadge
                    :appearance="isSongActive(row.song.id) ? 'subtle' : 'filled'"
                    :aria-label="`变调夹 capo ${row.song.capo} 品`"
                    :title="`变调夹 ${row.song.capo} 品`"
                    size="2xs"
                    variant="neutral"
                    width="2.8rem"
                  >
                    Capo {{ row.song.capo }}
                  </BaseBadge>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>

  <!-- 列表级右键菜单（单例）：默认插槽为空，完全由 handleListContextMenu 以鼠标坐标驱动打开 -->
  <BaseMenu :items="songMenuItems" @close="isContextMenuOpen = false" ref="songContextMenuRef" trigger="contextmenu" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import { computeSongKey } from '@/domains/chord/theory/theory';
import { useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useSortableList } from '@/platform/composables/useSortableList';
import { useUiStore } from '@/platform/store/uiStore';
import { pinyinGroupKey } from '@/platform/utils/pinyin';

import type { Song } from '@/domains/score/types';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { ComponentPublicInstance } from 'vue';

const emit = defineEmits<{
  (e: 'open-config', song: Song): void;
  (e: 'open-clear', song: Song): void;
}>();

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { selectSong } = useScoreRouteSync();
const { copySongText, shareSongLink } = useTextTransfer();

// ref 在 <TransitionGroup> 组件上：useTemplateRef 拿到的是组件实例，$el 才是列表容器
// （useSortableList 内部会解析 $el）
const songListRef = useTemplateRef<ComponentPublicInstance>('songListRef');

// 手动排序时启用拖拽（Sortable 直接操作 DOM，拖拽结束按索引重排后经 reorderSongs 持久化）；
// 非手动排序或过滤激活时禁用（过滤后 DOM 序与全量数组序不一致，按索引重排会错位）。
// 空列表守卫、容器就绪后再初始化、以及 disabled 的响应式跟随都由 useSortableList 承担。
// 列表自身的 TransitionGroup 只管增删与排序方法切换的 enter/leave/move：拖拽松手时 DOM
// 已被 Sortable 摆成最终顺序，patch 前后位置一致、它的 FLIP 位移为 0，不会与拖拽动画打架
useSortableList<Song>({
  target: songListRef,
  items: () => songStore.songs,
  enabled: computed(() => songStore.songSortMethod === 'manual' && !songStore.hasSongFilter),
  onReorder: next => songStore.reorderSongs(next),
});

/** 分组小标题行（仅拼音分组模式插入） */
interface SongGroupRow {
  key: string;
  type: 'group';
  label: string;
}

/** 歌曲行。派生量在构建期一次算完（computeSongKey 此前每行被调 3 次）：
 *  调性串与三段 aria/title 都只依赖 song 自身字段，纯派生；isSongActive/isMenuTarget
 *  依赖响应式状态、且只是字符串比较，保留为模板内函数调用 */
interface SongItemRow {
  key: string;
  type: 'song';
  song: Song;
  songKeyText: string;
  cardAriaLabel: string;
  keyAriaLabel: string;
  keyTitle: string;
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

/** 乐谱是否为当前打开的乐谱 */
const isSongActive = (songId: string) => scoreEditor.activeSongId === songId;

// 乐谱右键菜单项：按需构建（仅在右键命中某张卡片后构建一次），不缓存
const getSongMenuItems = (song: Song): MenuItem[] => {
  const items: MenuItem[] = [
    {
      label: '复制乐谱',
      icon: 'copy',
      action: () => {
        void copySongText(song);
      },
    },
    {
      // 分享：与「复制乐谱」同一份载体（token），只是外面套了一条可直接打开的地址
      label: '分享乐谱',
      icon: 'share-2',
      action: () => {
        void shareSongLink(song);
      },
    },
    {
      label: '修改属性',
      icon: 'sliders-horizontal',
      action: () => {
        emit('open-config', song);
      },
    },
    {
      label: '清空和弦',
      icon: 'eraser',
      action: () => {
        emit('open-clear', song);
      },
    },
    {
      label: '删除乐谱',
      icon: 'trash-2',
      danger: true,
      action: () => {
        const isCurrentActive = scoreEditor.activeSongId === song.id;
        const deletedSong = { ...song, chordMap: new Map(song.chordMap) };
        const originalIndex = songStore.songs.findIndex(s => s.id === song.id);
        songStore.deleteSong(song.id);
        if (isCurrentActive) scoreEditor.setActiveSong(null);

        // 通知而非常驻 Message：撤销入口随 toast 飘走就没了，用户必须能回看并补做
        uiStore.notice.info({
          title: `已删除乐谱 "${song.title}"`,
          actionText: '撤销',
          onAction: () => {
            songStore.restoreSong(deletedSong, originalIndex >= 0 ? originalIndex : undefined);
            if (isCurrentActive) scoreEditor.setActiveSong(deletedSong.id);

            uiStore.message.success(`已恢复乐谱 "${deletedSong.title}"`);
          },
        });
      },
    },
  ];
  return items;
};

/** 用户点击乐谱卡：再次点击取消选中；URL 以 replace 镜像（选歌不产生历史），滚动对焦由卡片上的 v-scroll-into-view 声明式完成 */
const handleSelectSong = (songId: string) => {
  selectSong(scoreEditor.activeSongId === songId ? null : songId);
};

/* ---- 列表级右键菜单（单例）：取代原先「每张卡片一个 BaseMenu」的写法 ---- */
const songContextMenuRef = useTemplateRef<InstanceType<typeof BaseMenu>>('songContextMenuRef');
/** 最近一次右键命中的乐谱 id；菜单关闭后仍保留，避免淡出途中菜单项被清空导致内容闪断 */
const contextMenuSongId = ref<string | null>(null);
/** 菜单是否打开：仅用于还原原先 BaseMenu 的 isOpen 作用域槽给的那点样式 */
const isContextMenuOpen = ref(false);

const contextMenuSong = computed(() =>
  contextMenuSongId.value ? (songStore.songs.find(s => s.id === contextMenuSongId.value) ?? null) : null
);
/** 单例菜单的数据源：未命中任何乐谱时为空数组（BaseMenu 会据此拒绝打开） */
const songMenuItems = computed<MenuItem[]>(() => {
  const song = contextMenuSong.value;
  return song ? getSongMenuItems(song) : [];
});
/** 卡片「菜单正针对我」的样式判据，等价原先 BaseMenu 的 isOpen 作用域槽 */
const isMenuTarget = (songId: string): boolean => isContextMenuOpen.value && contextMenuSongId.value === songId;

/**
 * 右键委托：从事件目标反查 data-song-id，记录目标后等一拍再打开单例菜单。
 * 必须等 nextTick —— openMenuAt 内部先判 items 是否为空，而 items 由 computed 提供，
 * 需等本次响应式更新把新目标同步进 props，否则会被上一次（或空）的 items 拦下。
 */
const handleListContextMenu = (e: MouseEvent): void => {
  const host = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-song-id]');
  const songId = host?.dataset['songId'];
  if (!songId) return;
  e.preventDefault();
  e.stopPropagation();
  // 两个 ref 同批写入：分两次写会让列表各重渲染一次
  contextMenuSongId.value = songId;
  isContextMenuOpen.value = true;
  void nextTick().then(() => {
    void songContextMenuRef.value?.openMenuAt(e.clientX, e.clientY);
  });
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
    const el = songListRef.value?.$el as HTMLElement | undefined;
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
  const el = songListRef.value?.$el as HTMLElement | undefined;
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
  transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
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
