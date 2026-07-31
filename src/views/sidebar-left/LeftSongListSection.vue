<template>
  <div v-if="songStore.songs.length === 0" class="empty-view">
    <Music :size="22" class="empty-icon" />
    <p class="empty-text">暂无乐谱，点击右上角新建</p>
  </div>

  <VueDraggable
    v-else
    :model-value="songStore.songs"
    @update:modelValue="(val: Song[]) => (songStore.songs = val)"
    :animation="200"
    class="draggable-list"
  >
    <GlobalContextMenu v-for="song in songStore.songs" :key="song.id" :items="getSongMenuItems(song)">
      <div
        class="song-card-item"
        :class="{ 'is-active': songStore.activeSongId === song.id }"
        @click="handleSelectSong(song.id)"
      >
        <div class="song-card-content">
          <BaseMarquee class="song-marquee">
            <span class="song-title-text">{{ song.title }}</span>
          </BaseMarquee>

          <div class="song-meta-badges">
            <span class="meta-tag">{{ song.key || 'C' }}调</span>
            <span class="meta-tag">Capo {{ song.capo || 0 }}</span>
          </div>
        </div>
      </div>
    </GlobalContextMenu>
  </VueDraggable>

  <!-- 乐谱重命名 Modal -->
  <BaseModal v-model:visible="isSongRenameOpen" title="重命名乐谱" @confirm="handleRenameSong">
    <BaseInput
      ref="songRenameInputRef"
      v-model="songRenameTitle"
      placeholder="请输入新的乐谱名称..."
      clearable
      @enter="handleRenameSong"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { Music, SquarePen, Trash2 } from '@lucide/vue';
import { nextTick, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const songStore = useSongStore();
const uiStore = useUiStore();

const isSongRenameOpen = ref(false);
const songRenameTitle = ref('');
const targetSong = ref<Song | null>(null);
const songRenameInputRef = ref<InstanceType<typeof BaseInput> | null>(null);

const handleRenameSong = () => {
  if (targetSong.value && songRenameTitle.value.trim()) {
    targetSong.value.title = songRenameTitle.value.trim();
  }
  isSongRenameOpen.value = false;
  targetSong.value = null;
};

const getSongMenuItems = (song: Song): ContextMenuItem[] => [
  {
    label: '重命名',
    icon: SquarePen,
    action: async () => {
      targetSong.value = song;
      songRenameTitle.value = song.title;
      isSongRenameOpen.value = true;
      await nextTick();
      setTimeout(() => songRenameInputRef.value?.focus(), 50);
    },
  },
  {
    label: '删除乐谱',
    icon: Trash2,
    danger: true,
    action: () => songStore.deleteSong(song.id),
  },
];

const handleSelectSong = (songId: string) => {
  if (songStore.activeSongId === songId) {
    songStore.activeSongId = null;
  } else {
    songStore.activeSongId = songId;
    if (uiStore.isMobile) {
      uiStore.isLeftOpen = false;
    }
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.empty-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0.35;
  padding: 4rem 0;
  box-sizing: border-box;
}

.empty-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-disabled);
  margin-bottom: 0.5rem;
}

.empty-text {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-disabled);
  margin: 0;
}

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

  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
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

.meta-tag {
  font-size: 0.58rem;
  font-weight: 700;
  padding: 0.08rem 0.3rem;
  border-radius: @radius-sm;
  background-color: var(--bg-panel);
  color: var(--text-disabled);
  border: 1px solid var(--border-light);
}
</style>
