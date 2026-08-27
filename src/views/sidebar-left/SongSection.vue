<template>
  <EmptyState v-if="songStore.songs.length === 0" :icon="Music" description="暂无乐谱，点击右上角新建" size="md" />

  <div v-else v-grid-nav.stop="{ cols: 1, selector: '.song-card-item' }">
    <VueDraggable
      :model-value="songStore.songs"
      :animation="200"
      ghost-class="drag-ghost-style"
      chosen-class="drag-chosen-style"
      drag-class="drag-active-style"
      :swap-threshold="0.5"
      class="draggable-list flex flex-col gap-sm box-border"
      :disabled="scoreEditor.activeSongId !== null"
      @update:model-value="(val: Song[]) => songStore.overwriteSongs(val)"
    >
      <div v-for="song in songStore.songs" :key="song.id" class="flex flex-col w-full box-border">
        <ContextMenu :items="getSongMenuItems(song)" #="{ isOpen }">
          <div
            v-wave
            class="song-card-item w-full p-sm px-md rounded-md bg-bg-body border border-border-light cursor-pointer box-border outline-none transition-all duration-fast hover:bg-bg-panel-hover hover:border-border-base"
            :class="{
              '!bg-tint-primary-92 !border-tint-primary-60 hover:!bg-tint-primary-82 hover:!border-primary hover:shadow-[0_0_0_1px_var(--color-primary)]':
                isSongActive(song.id),
              'bg-bg-panel-hover border-border-base': isOpen,
            }"
            role="button"
            tabindex="0"
            data-focusable-inline
            :aria-pressed="isSongActive(song.id)"
            :aria-label="`乐谱 ${song.title}，${song.playKey}调，Capo ${song.capo}${isSongActive(song.id) ? '，已选中' : ''}`"
            @click="handleSelectSong(song.id)"
            @keydown.enter.prevent.stop="handleSelectSong(song.id)"
            @keydown.space.prevent.stop="handleSelectSong(song.id)"
          >
            <div class="flex items-center justify-between gap-sm w-full">
              <BaseMarquee class="flex-1 min-w-0">
                <span
                  class="text-xs font-semibold"
                  :class="isSongActive(song.id) ? '!text-primary font-bold' : 'text-text-title'"
                >
                  {{ song.title }}
                </span>
              </BaseMarquee>

              <div class="flex gap-xs shrink-0">
                <BaseBadge
                  variant="neutral"
                  :appearance="isSongActive(song.id) ? 'subtle' : 'filled'"
                  size="xs"
                  :aria-label="`调性 ${computeSongKey(song.playKey, song.capo)} 调`"
                  width="2rem"
                >
                  {{ computeSongKey(song.playKey, song.capo) }}调
                </BaseBadge>

                <BaseBadge
                  variant="neutral"
                  :appearance="isSongActive(song.id) ? 'subtle' : 'filled'"
                  size="xs"
                  :aria-label="`变调夹 capo ${song.capo} 品`"
                  width="2.8rem"
                >
                  Capo {{ song.capo }}
                </BaseBadge>
              </div>
            </div>
          </div>
        </ContextMenu>
      </div>
    </VueDraggable>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseMarquee from '@/components/base/BaseMarquee.vue';
import ContextMenu from '@/components/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/context-menu/ContextMenuItems.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { computeSongKey } from '@/utils/music/musicTheory';
import { Eraser, Music, SlidersHorizontal, Trash2 } from '@lucide/vue';
import { computed, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const emit = defineEmits<{
  (e: 'open-config', song: Song): void;
  (e: 'open-clear', song: Song): void;
}>();

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const isSongActive = (songId: string) => scoreEditor.activeSongId === songId;

const songMenuItemsMap = new Map<string, ContextMenuItem[]>();
const songIdsSignature = computed(() => songStore.songs.map(s => s.id).join('\u0000'));
watch(songIdsSignature, () => songMenuItemsMap.clear());

const resolveSong = (songId: string): Song | null => songStore.songs.find(s => s.id === songId) ?? null;

const getSongMenuItems = (song: Song): ContextMenuItem[] => {
  const cached = songMenuItemsMap.get(song.id);
  if (cached) return cached;
  const items: ContextMenuItem[] = [
    {
      label: '修改属性',
      icon: SlidersHorizontal,
      action: () => {
        const s = resolveSong(song.id);
        if (s) emit('open-config', s);
      },
    },
    {
      label: '清空和弦',
      icon: Eraser,
      action: () => {
        const s = resolveSong(song.id);
        if (s) emit('open-clear', s);
      },
    },
    {
      label: '删除乐谱',
      icon: Trash2,
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
