<template>
  <EmptyState v-if="songStore.songs.length === 0" :icon="Music" description="暂无乐谱，点击右上角新建" size="md" />

  <div v-else ref="groupListContainerRef" @keydown="handleKeydown">
    <VueDraggable
      :model-value="songStore.songs"
      :animation="200"
      ghost-class="drag-ghost-style"
      chosen-class="drag-chosen-style"
      drag-class="drag-active-style"
      :swap-threshold="0.5"
      class="draggable-list"
      :disabled="scoreEditor.activeSongId !== null"
      @update:model-value="(val: Song[]) => songStore.overwriteSongs(val)"
    >
      <div v-for="(song, index) in songStore.songs" :key="song.id" class="song-card-wrapper">
        <ContextMenu :items="getSongMenuItems(song)" #="{ isOpen }">
          <div
            :ref="el => setItemRef(el, index)"
            v-wave
            class="song-card-item"
            :class="{
              'is-active': isSongActive(song.id),
              'is-context-open': isOpen,
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
            <div class="song-card-content">
              <BaseMarquee class="song-marquee">
                <span class="song-title-text">{{ song.title }}</span>
              </BaseMarquee>

              <div class="song-meta-badges">
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
import BaseBadge from '@/components/BaseBadge.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/ContextMenuItems.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { computeSongKey } from '@/utils/musicTheory';
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

// 乐谱列表的单列垂直导航（使用 Length 模式传入总长度和 setItemRef）
const { handleKeydown, setItemRef } = useGridNavigation(1, () => songStore.songs.length, {
  stop: true,
});

const isSongActive = (songId: string) => scoreEditor.activeSongId === songId;

// 按 songId 缓存 items；「清除和弦」的 disabled 依赖当前激活乐谱，签名需包含 activeSongId。
// 动作执行时再解析最新的 song 对象，避免闭包持有被 overwriteSongs 替换的旧引用
const songMenuItemsMap = new Map<string, ContextMenuItem[]>();
const songStateSignature = computed(
  () => songStore.songs.map(s => s.id).join('\u0000') + '|' + String(scoreEditor.activeSongId)
);
watch(songStateSignature, () => songMenuItemsMap.clear());

const resolveSong = (songId: string): Song | null => songStore.songs.find(s => s.id === songId) ?? null;

const getSongMenuItems = (song: Song): ContextMenuItem[] => {
  const cached = songMenuItemsMap.get(song.id);
  if (cached) return cached;
  const items: ContextMenuItem[] = [
    {
      label: '乐谱配置',
      icon: SlidersHorizontal,
      action: () => {
        const s = resolveSong(song.id);
        if (s) emit('open-config', s);
      },
    },
    {
      label: '清除和弦',
      icon: Eraser,
      action: () => {
        const s = resolveSong(song.id);
        if (s) emit('open-clear', s);
      },
      disabled: scoreEditor.activeSong?.id !== song.id,
      title: '请先加载乐谱',
    },
    {
      label: '删除乐谱',
      icon: Trash2,
      danger: true,
      action: () => {
        const s = resolveSong(song.id);
        if (!s) return;
        if (scoreEditor.activeSongId === s.id) {
          scoreEditor.setActiveSong(null);
        }
        songStore.deleteSong(s.id);
        uiStore.toast.info(`已删除乐谱 "${s.title}"`, {
          actionText: '撤销',
          duration: 4000,
          onAction: () => {
            songStore.undoDeleteSong();
            uiStore.toast.success('已恢复刚才删除的乐谱');
          },
        });
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

<style scoped lang="scss">
.draggable-list {
  display: flex;
  flex-direction: column;
  gap: $space-sm;
  position: relative;
  box-sizing: border-box;
}

.song-card-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

.song-card-item {
  width: 100%;
  padding: $space-sm $space-md;
  border-radius: $radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  cursor: pointer;
  box-sizing: border-box;
  outline: none;
  transition:
    background-color $duration-fast ease,
    border-color $duration-fast ease,
    box-shadow $duration-fast ease;

  &:hover,
  &.is-context-open {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
  }

  /* 当前选中激活态 */
  &.is-active {
    background-color: var(--tint-primary-92);
    border-color: var(--tint-primary-60);

    .song-title-text {
      color: var(--color-primary) !important;
      font-weight: 700;
    }

    &:hover,
    &.is-context-open {
      background-color: var(--tint-primary-82);
      border-color: var(--color-primary);
      box-shadow: 0 0 0 1px var(--color-primary);
    }
  }
}

.song-card-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-sm;
  width: 100%;
}

.song-marquee {
  flex: 1;
  min-width: 0;
}

.song-title-text {
  font-size: $fs-xs;
  font-weight: 600;
  color: var(--text-title);
  transition: color $duration-fast ease;
}

.song-meta-badges {
  display: flex;
  gap: $space-xs;
  flex-shrink: 0;
}
</style>
