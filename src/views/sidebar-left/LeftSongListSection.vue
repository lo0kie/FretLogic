<template>
  <EmptyState v-if="songStore.songs.length === 0" :icon="Music" description="暂无乐谱，点击右上角新建" size="md" />

  <VueDraggable
    v-else
    :model-value="songStore.songs"
    @update:modelValue="(val: Song[]) => songStore.overwriteSongs(val)"
    :animation="200"
    class="draggable-list"
  >
    <GlobalContextMenu
      v-for="song in songStore.songs"
      :key="song.id"
      ref="contextMenuRefs"
      :items="getSongMenuItems(song)"
    >
      <!-- 🌟 1. 补全角色、tabindex、aria-pressed 及键盘触发生命周期 -->
      <div
        class="song-card-item"
        :class="{
          'is-active': scoreEditor.activeSongId === song.id,
          'is-context-open': isSongMenuOpen(song.id),
        }"
        role="button"
        tabindex="0"
        :aria-pressed="scoreEditor.activeSongId === song.id"
        :aria-label="`乐谱 ${song.title}，${song.playKey || 'C'}调，Capo ${song.capo || 0}${scoreEditor.activeSongId === song.id ? '，已选中' : ''}`"
        @click="handleSelectSong(song.id)"
        @keydown.enter.prevent.stop="handleSelectSong(song.id)"
        @keydown.space.prevent.stop="handleSelectSong(song.id)"
      >
        <div class="song-card-content">
          <BaseMarquee class="song-marquee">
            <span class="song-title-text">{{ song.title }}</span>
          </BaseMarquee>

          <div class="song-meta-badges">
            <!-- 🌟 2. Badge 增加无障碍阅读说明 -->
            <BaseBadge variant="neutral" appearance="filled" size="xs" :aria-label="`调性 ${song.playKey || 'C'} 调`">
              {{ song.playKey || 'C' }}调
            </BaseBadge>

            <BaseBadge variant="neutral" appearance="filled" size="xs" :aria-label="`变调夹 Capo ${song.capo || 0} 品`">
              Capo {{ song.capo || 0 }}
            </BaseBadge>
          </div>
        </div>
      </div>
    </GlobalContextMenu>
  </VueDraggable>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import EmptyState from '@/components/EmptyState.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { Eraser, Music, SlidersHorizontal, Trash2 } from '@lucide/vue';
import { useTemplateRef } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const emit = defineEmits<{
  (e: 'open-config', song: Song): void;
  (e: 'open-clear', song: Song): void;
}>();

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const contextMenuRefs = useTemplateRef<InstanceType<typeof GlobalContextMenu>[]>('contextMenuRefs');

const isSongMenuOpen = (songId: string) => {
  const idx = songStore.songs.findIndex(s => s.id === songId);
  if (idx === -1) return false;
  return contextMenuRefs.value?.[idx]?.isOpen ?? false;
};

const getSongMenuItems = (song: Song): ContextMenuItem[] => [
  {
    label: '乐谱配置',
    icon: SlidersHorizontal,
    action: () => emit('open-config', song),
  },
  {
    label: '清除所有和弦',
    icon: Eraser,
    action: () => emit('open-clear', song),
  },
  {
    label: '删除乐谱',
    icon: Trash2,
    danger: true,
    action: () => {
      if (scoreEditor.activeSongId === song.id) {
        scoreEditor.setActiveSong(null);
      }
      songStore.deleteSong(song.id);
      uiStore.toast.info(`已删除乐谱 "${song.title}"`, {
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

    if (uiStore.isMobile) {
      uiStore.isLeftOpen = false;
    }
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.draggable-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
  box-sizing: border-box;
}

.song-card-item {
  padding: 0.55rem 0.75rem;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  cursor: pointer;
  transition: @transition-fast;
  box-sizing: border-box;
  outline: none;

  &:hover,
  &:active,
  &.is-context-open {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
    box-shadow: 0 0 0 1px var(--border-base);
  }

  /* 🌟 3. 键盘聚焦高亮反馈 */
  &:focus-visible {
    border-color: var(--color-primary);
    box-shadow: @focus-ring-primary;
  }

  &.is-active {
    background-color: color-mix(in srgb, var(--color-primary), transparent 90%);
    border-color: var(--color-primary);
    box-shadow: @focus-ring-primary;

    .song-title-text {
      color: var(--color-primary) !important;
      font-weight: 700;
    }
  }
}

.song-card-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.song-marquee {
  flex: 1;
  min-width: 0;
}

.song-title-text {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-title);
}

.song-meta-badges {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
</style>
