<template>
  <div v-if="songStore.songs.length === 0" class="empty-view">
    <Music :size="22" class="empty-icon" />
    <p class="empty-text">暂无乐谱，点击右上角新建</p>
  </div>

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
      :ref="el => setContextMenuRef(el, song.id)"
      :items="getSongMenuItems(song)"
    >
      <div
        class="song-card-item"
        :class="{
          'is-active': scoreEditor.activeSongId === song.id,
          'is-context-open': isSongMenuOpen(song.id),
        }"
        @click="handleSelectSong(song.id)"
      >
        <div class="song-card-content">
          <BaseMarquee class="song-marquee">
            <span class="song-title-text">{{ song.title }}</span>
          </BaseMarquee>

          <div class="song-meta-badges">
            <span class="meta-tag">{{ song.playKey || 'C' }}调</span>
            <span class="meta-tag">Capo {{ song.capo || 0 }}</span>
          </div>
        </div>
      </div>
    </GlobalContextMenu>
  </VueDraggable>

  <!-- 乐谱重命名 Modal -->
  <BaseModal v-model:visible="isSongRenameOpen" title="重命名乐谱" @confirm="handleRenameSong">
    <BaseInput
      v-model="songRenameTitle"
      placeholder="请输入新的乐谱名称..."
      clearable
      autofocus
      @enter="handleRenameSong"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Song } from '@/types';
import { Music, SquarePen, Trash2 } from '@lucide/vue';
import { onBeforeUpdate, ref } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';

const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const isSongRenameOpen = ref(false);
const songRenameTitle = ref('');
const targetSong = ref<Song | null>(null);

// 🌟 管理右键菜单的实例引用 Map
const contextMenuRefsMap = ref<Record<string, InstanceType<typeof GlobalContextMenu>>>({});

const setContextMenuRef = (el: unknown, songId: string) => {
  if (el) {
    contextMenuRefsMap.value[songId] = el as InstanceType<typeof GlobalContextMenu>;
  }
};

const isSongMenuOpen = (songId: string) => {
  return contextMenuRefsMap.value[songId]?.isOpen ?? false;
};

onBeforeUpdate(() => {
  contextMenuRefsMap.value = {};
});

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
    action: () => {
      targetSong.value = song;
      songRenameTitle.value = song.title;
      isSongRenameOpen.value = true;
    },
  },
  {
    label: '删除乐谱',
    icon: Trash2,
    danger: true,
    action: () => {
      if (scoreEditor.activeSongId === song.id) {
        scoreEditor.setActiveSong(null);
      }

      // 🌟 1. 执行删除
      songStore.deleteSong(song.id);

      // 🌟 2. 弹出带有撤销按钮的 Toast 提示（复用自 triggerDeleteChord 的模式）[cite: 3]
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
    // 再次点击同一首 → 取消选中
    scoreEditor.setActiveSong(null);
  } else {
    // 选中新乐谱
    scoreEditor.setActiveSong(songId);

    // 🌟 根据是否有歌词自动切换模式
    if (scoreEditor.hasLyrics) {
      scoreEditor.activeTab = 'interactive'; // 有歌词 → 排列和弦
    } else {
      scoreEditor.activeTab = 'edit'; // 无歌词 → 编辑歌词
    }

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

  /* 🌟 与分组一致：Hover / Active / ContextMenu 打开时应用高亮反馈 */
  &:hover,
  &:active,
  &.is-context-open {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
    box-shadow: 0 0 0 1px var(--border-base);
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
