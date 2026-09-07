<template>
  <EmptyState v-if="songStore.songs.length === 0" description="暂无乐谱，点击右上角新建" icon="music" />

  <!-- 统一容器：手动排序时经 useDraggable 支持拖拽，非手动时仅展示；
       排序方法切换（含手动↔拼音分组等）都在同一 TransitionGroup 内重排，FLIP 动画全程生效；
       拼音分组模式在列表中插入分组小标题行，分组显隐同样走 enter/leave 过渡 -->
  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.song-card-item' }">
    <TransitionGroup
      @leave="onSongLeave($event)"
      class="draggable-list relative box-border flex flex-col gap-sm"
      name="song-sort"
      ref="songListRef"
      tag="div"
    >
      <div v-for="row in songRows" :key="row.key" class="box-border flex w-full flex-col">
        <div v-if="row.type === 'group'" aria-hidden="true" class="song-group-header px-sm pb-2xs">
          <span class="text-xs leading-none font-bold tracking-widest text-fg-disabled">{{ row.label }}</span>
        </div>
        <template v-else>
          <ContextMenu #="{ isOpen }" :items="getSongMenuItems(row.song!)">
            <div
              v-action-card
              v-wave
              v-scroll-into-view.y="isSongActive(row.song!.id)"
              :aria-label="songCardAriaLabel(row.song!)"
              :aria-pressed="isSongActive(row.song!.id)"
              :class="{
                'border-tint-primary-60! bg-tint-primary-92! hover:border-primary! hover:bg-tint-primary-82! hover:shadow-[0_0_0_1px_var(--color-primary)]':
                  isSongActive(row.song!.id),
                'border-border-base bg-surface-panel-hover': isOpen,
              }"
              :data-song-id="row.song!.id"
              @click="handleSelectSong(row.song!.id)"
              data-focusable-inline
              class="song-card-item box-border w-full cursor-pointer rounded-md border border-border-light bg-surface-body p-sm px-md transition-all duration-fast outline-none hover:border-border-base hover:bg-surface-panel-hover"
            >
              <div class="flex w-full items-center justify-between gap-sm">
                <div v-marquee.fade class="min-w-0 flex-1">
                  <span
                    :class="isSongActive(row.song!.id) ? 'font-bold text-primary!' : 'text-fg-title'"
                    class="text-xs font-semibold"
                  >
                    {{ row.song!.title }}
                  </span>
                </div>

                <div class="flex shrink-0 gap-xs">
                  <BaseBadge
                    :appearance="isSongActive(row.song!.id) ? 'subtle' : 'filled'"
                    :aria-label="songKeyAriaLabel(row.song!)"
                    size="xs"
                    variant="neutral"
                    width="2rem"
                  >
                    <span v-chord-name="`${computeSongKey(row.song!.playKey, row.song!.capo)}调`" />
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

<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';

import { useDraggable } from 'vue-draggable-plus';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import ContextMenu from '@/platform/ui/context-menu/ContextMenu.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import { computeSongKey } from '@/domains/chord/theory/theory';
import { useScoreRouteSync } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useUiStore } from '@/platform/store/uiStore';
import { TOAST_WARNING_DURATION_MS } from '@/platform/utils/constants';
import { pinyinGroupKey } from '@/platform/utils/pinyin';

import type { Song } from '@/domains/score/types';
import type { ContextMenuItem } from '@/platform/ui/context-menu/ContextMenuItems.vue';
import type { DraggableEvent } from 'vue-draggable-plus';

const emit = defineEmits<{
  (e: 'open-config', song: Song): void;
  (e: 'open-clear', song: Song): void;
}>();

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
const { selectSong } = useScoreRouteSync();
const { copySongText } = useTextTransfer();

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

// 乐谱右键菜单项：每次直接构建（仅 3 项），不缓存
const getSongMenuItems = (song: Song): ContextMenuItem[] => {
  const items: ContextMenuItem[] = [
    {
      label: '复制乐谱',
      icon: 'copy',
      action: () => {
        void copySongText(song);
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
      disabled: song.chordMap.size === 0 || song.id !== scoreEditor.activeSongId,
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
        if (isCurrentActive) {
          scoreEditor.setActiveSong(null);
        }
        uiStore.toast.info(`已删除乐谱 "${song.title}"`, {
          actionText: '撤销',
          duration: TOAST_WARNING_DURATION_MS,
          onAction: () => {
            songStore.restoreSong(deletedSong, originalIndex >= 0 ? originalIndex : undefined);
            if (isCurrentActive) {
              scoreEditor.setActiveSong(deletedSong.id);
            }
            uiStore.toast.success(`已恢复乐谱 "${deletedSong.title}"`);
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

/**
 * 删除/移除乐谱时的 leave 钩子：锁死当前纵向偏移，避免 position:absolute 后
 * top 在 flex 容器里被解析为容器顶端，导致卡片“飞”到列表顶部（飞得太远）。
 * 单参数 → Vue 仍走 CSS transitionend 判定，无需手动 done()。
 */
const onSongLeave = (el: Element): void => {
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
