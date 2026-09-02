<template>
  <EmptyState v-if="songStore.songs.length === 0" description="暂无乐谱，点击右上角新建" icon="music" size="md" />

  <!-- 统一容器：手动排序时经 useDraggable 支持拖拽，非手动时仅展示；
       排序方法切换（含手动↔拼音分组等）都在同一 TransitionGroup 内重排，FLIP 动画全程生效；
       拼音分组模式在列表中插入分组小标题行，分组显隐同样走 enter/leave 过渡 -->
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.song-card-item' }">
    <TransitionGroup
      class="draggable-list gap-sm relative box-border flex flex-col"
      name="song-sort"
      ref="songListRef"
      tag="div"
    >
      <div v-for="row in songRows" :key="row.key" class="box-border flex w-full flex-col">
        <div v-if="row.type === 'group'" :aria-hidden="true" class="song-group-header px-sm pb-2xs">
          <span class="text-text-disabled text-xs leading-none font-bold tracking-widest">{{ row.label }}</span>
        </div>
        <template v-else>
          <ContextMenu #="{ isOpen }" :items="getSongMenuItems(row.song!)">
            <div
              v-wave
              :aria-label="songCardAriaLabel(row.song!)"
              :aria-pressed="isSongActive(row.song!.id)"
              :class="{
                'bg-tint-primary-92! border-tint-primary-60! hover:bg-tint-primary-82! hover:border-primary! hover:shadow-[0_0_0_1px_var(--color-primary)]':
                  isSongActive(row.song!.id),
                'bg-bg-panel-hover border-border-base': isOpen,
              }"
              @click="handleSelectSong(row.song!.id)"
              @keydown.enter.prevent.stop="handleSelectSong(row.song!.id)"
              @keydown.space.prevent.stop="handleSelectSong(row.song!.id)"
              class="song-card-item p-sm px-md bg-bg-body border-border-light duration-fast hover:bg-bg-panel-hover hover:border-border-base box-border w-full cursor-pointer rounded-md border transition-all outline-none"
              data-focusable-inline
              role="button"
              tabindex="0"
            >
              <div class="gap-sm flex w-full items-center justify-between">
                <div v-marquee class="min-w-0 flex-1">
                  <span
                    :class="isSongActive(row.song!.id) ? 'text-primary! font-bold' : 'text-text-title'"
                    class="text-xs font-semibold"
                  >
                    {{ row.song!.title }}
                  </span>
                </div>

                <div class="gap-xs flex shrink-0">
                  <BaseBadge
                    :appearance="isSongActive(row.song!.id) ? 'subtle' : 'filled'"
                    :aria-label="songKeyAriaLabel(row.song!)"
                    size="xs"
                    variant="neutral"
                    width="2rem"
                  >
                    <span v-chord-name="{ name: `${computeSongKey(row.song!.playKey, row.song!.capo)}调` }" />
                  </BaseBadge>

                  <BaseBadge
                    :appearance="isSongActive(row.song!.id) ? 'subtle' : 'filled'"
                    :aria-label="`变调夹 capo ${row.song!.capo} 品`"
                    size="xs"
                    variant="neutral"
                    width="2.8rem"
                  >
                    Capo {{ row.song!.capo }}
                  </BaseBadge>
                </div>
              </div>
            </div>
          </ContextMenu>
        </template>
      </div>
    </TransitionGroup>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { useDraggable, type DraggableEvent } from 'vue-draggable-plus';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import ContextMenu from '@/components/ui/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { computeSongKey } from '@/services/music/theory';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { pinyinGroupKey } from '@/utils/core/pinyin';

const emit = defineEmits<{
  (e: 'open-config', song: Song): void;
  (e: 'open-clear', song: Song): void;
}>();

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const songListRef = useTemplateRef<HTMLElement>('songListRef');

// 手动排序时启用拖拽（Sortable 直接操作 DOM，拖拽结束按索引重排后经 reorderSongs 持久化）；
// 非手动排序时禁用，排序方法切换由 TransitionGroup 的 FLIP 动画呈现。
// immediate:false —— 库默认在 mounted 时初始化；空乐谱列表走 EmptyState 分支，容器不存在，
// 直接初始化会抛 "Root element not found / Sortable: el must be an HTMLElement"。
// 改为等列表真正渲染出来（有乐谱且 ref 就绪）再手动 start()，清空/重建时也能重新初始化。
const draggableList = useDraggable(songListRef, {
  immediate: false,
  animation: 200,
  ghostClass: 'drag-ghost-style',
  chosenClass: 'drag-chosen-style',
  dragClass: 'drag-active-style',
  swapThreshold: 0.5,
  disabled: songStore.songSortMethod !== 'manual',
  onEnd: (event: DraggableEvent<Song>) => {
    const { oldIndex, newIndex } = event;
    if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
    const next = [...songStore.songs];
    const [moved] = next.splice(oldIndex, 1);
    if (!moved) return;
    next.splice(newIndex, 0, moved);
    songStore.reorderSongs(next);
  },
});
// Sortable 的 disabled 不是响应式，用 option() 跟随排序方式变化
watch(
  () => songStore.songSortMethod !== 'manual',
  sorted => draggableList.option('disabled', sorted)
);
// 空列表（EmptyState）时容器不存在，此时不初始化；列表渲染/重建后再 start
watch(
  () => songStore.songs.length > 0 && songListRef.value,
  () => {
    if (songStore.songs.length > 0 && songListRef.value) {
      nextTick(() => draggableList.start());
    }
  },
  { immediate: true }
);

type SongListRow = {
  key: string;
  type: 'group' | 'song';
  label?: string;
  song?: Song;
};

/** 列表行：拼音分组模式在歌曲间插入分组小标题行（键前缀 group: 避免与歌曲 id 冲突），其余排序模式为纯歌曲行 */
const songRows = computed<SongListRow[]>(() => {
  if (songStore.songSortMethod !== 'title') {
    return songStore.sortedSongs.map(song => ({ key: song.id, type: 'song' as const, song }));
  }
  const rows: SongListRow[] = [];
  let currentGroup = '';
  for (const song of songStore.sortedSongs) {
    const group = pinyinGroupKey(song.title);
    if (group !== currentGroup) {
      currentGroup = group;
      rows.push({ key: `group:${group}`, type: 'group', label: group });
    }
    rows.push({ key: song.id, type: 'song', song });
  }
  return rows;
});

/** 乐谱是否为当前打开的乐谱 */
const isSongActive = (songId: string) => scoreEditor.activeSongId === songId;

/** 乐谱卡无障碍描述：标题、调性与 Capo，选中时追加状态 */
const songCardAriaLabel = (song: Song): string =>
  `乐谱 ${song.title}，${song.playKey}调，Capo ${song.capo}${isSongActive(song.id) ? '，已选中' : ''}`;
/** 调性徽标无障碍描述：最终计算调 */
const songKeyAriaLabel = (song: Song): string => `调性 ${computeSongKey(song.playKey, song.capo)} 调`;

const songMenuItemsMap = new Map<string, ContextMenuItem[]>();
// 签名需包含和弦数与当前乐谱 id，否则清空/添加和弦、切换当前乐谱后禁用态不会刷新
const songIdsSignature = computed(() =>
  [scoreEditor.activeSongId ?? '', ...songStore.songs.map(s => `${s.id}:${s.chordMap.size}`)].join('\u0000')
);
watch(songIdsSignature, () => songMenuItemsMap.clear());

/** 按 id 实时查找乐谱（菜单项被缓存后仍能取到最新对象，避免闭包陈旧引用） */
const resolveSong = (songId: string): Song | null => songStore.songs.find(s => s.id === songId) ?? null;

/** 生成乐谱右键菜单项（改属性/清空和弦/删除），按乐谱 id 缓存避免重复创建 */
const getSongMenuItems = (song: Song): ContextMenuItem[] => {
  const cached = songMenuItemsMap.get(song.id);
  if (cached) return cached;
  const items: ContextMenuItem[] = [
    {
      label: '修改属性',
      icon: 'sliders-horizontal',
      action: () => {
        const s = resolveSong(song.id);
        if (s) emit('open-config', s);
      },
    },
    {
      label: '清空和弦',
      icon: 'eraser',
      disabled: song.chordMap.size === 0 || song.id !== scoreEditor.activeSongId,
      action: () => {
        const s = resolveSong(song.id);
        if (s) emit('open-clear', s);
      },
    },
    {
      label: '删除乐谱',
      icon: 'trash-2',
      danger: true,
      action: () => {
        const s = resolveSong(song.id);
        if (s) {
          const isCurrentActive = scoreEditor.activeSongId === s.id;
          songStore.deleteSong(s.id);
          if (isCurrentActive) {
            scoreEditor.setActiveSong(null);
          }
          uiStore.toast.success(`已删除乐谱 "${s.title}"`);
        }
      },
    },
  ];
  songMenuItemsMap.set(song.id, items);
  return items;
};

/** 用户点击乐谱卡：再次点击取消选中；选中新乐谱时按有无歌词切到对应标签页 */
const handleSelectSong = (songId: string) => {
  if (scoreEditor.activeSongId === songId) {
    scoreEditor.setActiveSong(null);
  } else {
    scoreEditor.setActiveSong(songId);

    if (scoreEditor.hasLyrics) {
      scoreEditor.activeTab = 'interactive';
    } else {
      scoreEditor.activeTab = 'edit';
    }
  }
};
</script>

<style lang="scss">
/* 切换排序方法时的重排动画：TransitionGroup 的 FLIP move 过渡。
   类加在列表项根元素上，scoped 选择器匹配不到，故用非 scoped 规则。
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
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
  position: absolute;
  left: 0;
  right: 0;
}
.song-sort-enter-from,
.song-sort-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
