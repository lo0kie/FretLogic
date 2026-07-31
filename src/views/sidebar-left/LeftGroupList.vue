<template>
  <div class="left-group-list-container left-group-list">
    <div class="scroll-body no-scrollbar">
      <!-- 🌟 1. 工作台模式 (/)：渲染和弦分组与拖拽排序 -->
      <template v-if="route.path === '/'">
        <div v-if="chordStore.groups.length === 0" class="empty-view">
          <FolderOpen class="empty-icon" />
          <p class="empty-text">还没有添加分组</p>
        </div>

        <VueDraggable
          v-else
          :model-value="chordStore.groups"
          @update:modelValue="(val: Group[]) => chordStore.overwriteGroups(val)"
          :animation="200"
          handle=".drag-handle"
          :disabled="Boolean(searchQuery) || uiStore.isMobile"
          class="draggable-list"
          ghost-class="drag-ghost-style"
          chosen-class="drag-chosen-style"
          drag-class="drag-active-style"
          :touchStartThreshold="12"
          :swap-threshold="0.5"
        >
          <div
            v-for="group in chordStore.groups"
            :key="group.id"
            :ref="el => setGroupCardRef(el, group.id)"
            class="group-box-card"
          >
            <GlobalContextMenu :ref="el => setContextMenuRef(el, group.id)" :items="getGroupMenuItems(group)">
              <div
                @click="chordService.executeGroupToggle(group.id)"
                class="group-title-row"
                :class="{ 'is-context-open': isGroupMenuOpen(group.id) }"
              >
                <div class="group-info-zone" title="点击折叠/展开分组">
                  <ChevronDown
                    :size="14"
                    stroke-width="2.5"
                    class="arrow-toggle-icon"
                    :class="{ 'is-collapsed': group.collapsed }"
                  />

                  <BaseMarquee>
                    <span class="group-name-text">
                      {{ group.name }}
                    </span>
                  </BaseMarquee>

                  <span class="count-badge">
                    <template v-if="searchQuery">
                      <span class="search-match-count">
                        {{ (filteredChordsGroupMap.get(group.id) || []).length }}
                      </span>
                      <span>&nbsp;/&nbsp;{{ getGroupChordsCount(group.id) }}</span>
                    </template>
                    <template v-else>
                      {{ getGroupChordsCount(group.id) }}
                    </template>
                  </span>
                </div>

                <div v-if="!uiStore.isMobile" @click.stop class="drag-action-zone">
                  <div
                    class="drag-handle"
                    :class="{ 'is-hidden-by-search': Boolean(searchQuery) }"
                    title="按住拖拽排序"
                  >
                    <GripVertical :size="14" stroke-width="2.5" />
                  </div>
                </div>
              </div>
            </GlobalContextMenu>

            <div v-if="!group.collapsed" class="chord-content-wrapper">
              <VueDraggable
                :model-value="filteredChordsGroupMap.get(group.id) || []"
                :animation="200"
                ghost-class="drag-ghost-style"
                chosen-class="drag-chosen-style"
                drag-class="drag-active-style"
                :disabled="Boolean(searchQuery) || uiStore.isMobile"
                class="chords-grid-layout"
                @update="e => chordService.handleChordSort(e, group.id)"
                :swap-threshold="0.5"
                :touchStartThreshold="12"
              >
                <LeftChordCard
                  v-for="chord in filteredChordsGroupMap.get(group.id) || []"
                  :key="chord.id"
                  :chord="chord"
                  :is-editing="editorStore.editingId === chord.id"
                  @delete="handleLocalDeleteChord"
                  @move="$emit('open-move', chord)"
                  @click="chordService.loadChordToEditor(chord)"
                  class="chord-item-grab-handle"
                />
              </VueDraggable>

              <div v-if="getGroupChordsCount(group.id) === 0" class="empty-placeholder-card z-index-bg">
                <p class="placeholder-card-text">暂无和弦</p>
              </div>
              <div
                v-else-if="searchQuery && (filteredChordsGroupMap.get(group.id) || []).length === 0"
                class="empty-placeholder-card z-index-bg"
              >
                <p class="placeholder-card-text">无匹配</p>
              </div>
            </div>
          </div>
        </VueDraggable>
      </template>

      <!-- 🌟 2. 乐谱库模式 (/score)：统一复用同个容器渲染乐谱列表 -->
      <template v-else-if="route.path === '/score'">
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
            <!-- LeftGroupList.vue 中乐谱卡片模板 -->
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
      </template>
    </div>

    <!-- 乐谱重命名 Modal (合拢集成) -->
    <BaseModal v-model:visible="isSongRenameOpen" title="重命名乐谱" @confirm="handleRenameSong">
      <BaseInput
        ref="songRenameInputRef"
        v-model="songRenameTitle"
        placeholder="请输入新的乐谱名称..."
        clearable
        @enter="handleRenameSong"
      />
    </BaseModal>
  </div>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useChordService } from '@/services/useChordService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, Group, Song } from '@/types';
import { ChevronDown, FolderOpen, GripVertical, Music, SquarePen, Trash2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUpdate, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { useRoute } from 'vue-router';
import LeftChordCard from './LeftChordCard.vue';

const props = defineProps<{
  searchQuery: string;
}>();

const emit = defineEmits<{
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
}>();

const route = useRoute();
const editorStore = useEditorStore();
const chordStore = useChordStore();
const songStore = useSongStore();
const chordService = useChordService();
const uiStore = useUiStore();

const groupCardsMap = new Map<string, HTMLElement>();
const contextMenuRefsMap = ref<Record<string, InstanceType<typeof GlobalContextMenu>>>({});

// 乐谱重命名相关状态
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

const chordLowerNameCache = new WeakMap<Chord, string>();

const getChordLowerName = (chord: Chord): string => {
  let cached = chordLowerNameCache.get(chord);
  if (!cached) {
    cached = chord.chordName.toLowerCase();
    chordLowerNameCache.set(chord, cached);
  }
  return cached;
};

const setGroupCardRef = (el: unknown, groupId: string) => {
  if (el) {
    groupCardsMap.set(groupId, el as HTMLElement);
  }
};

const setContextMenuRef = (el: unknown, groupId: string) => {
  if (el) {
    contextMenuRefsMap.value[groupId] = el as InstanceType<typeof GlobalContextMenu>;
  }
};

const isGroupMenuOpen = (groupId: string) => {
  return contextMenuRefsMap.value[groupId]?.isOpen ?? false;
};

onBeforeUpdate(() => {
  groupCardsMap.clear();
  contextMenuRefsMap.value = {};
});

const getGroupChordsCount = (groupId: string) => {
  return chordStore.groupChordMap.get(groupId)?.length || 0;
};

const filteredChordsGroupMap = computed(() => {
  const map = new Map<string, Chord[]>();
  const queryKeyword = props.searchQuery.toLowerCase().trim();

  chordStore.groups.forEach(group => {
    const originalChords = chordStore.groupChordMap.get(group.id) || [];

    if (!queryKeyword) {
      map.set(group.id, originalChords);
    } else {
      map.set(
        group.id,
        originalChords.filter(c => getChordLowerName(c).includes(queryKeyword))
      );
    }
  });

  return map;
});

const handleSelectSong = (songId: string) => {
  if (songStore.activeSongId === songId) {
    // 🌟 再次点击当前已打开的乐谱，取消选中（关闭曲谱页面）
    songStore.activeSongId = null;
  } else {
    songStore.activeSongId = songId;
    if (uiStore.isMobile) {
      uiStore.isLeftOpen = false;
    }
  }
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = editorStore.editingId === chord.id;
  chordService.triggerDeleteChord(chord);
  if (isEditingCurrent) editorStore.resetEditor();
};

const getGroupMenuItems = (group: Group): ContextMenuItem[] => [
  {
    label: '修改名称',
    icon: SquarePen,
    action: () => emit('open-rename', group),
  },
  {
    label: '删除分组',
    icon: Trash2,
    danger: true,
    action: () => emit('open-delete', group),
  },
];

watch(
  () => chordStore.selectedGroupId,
  async newId => {
    if (newId) {
      await nextTick();
      const targetElement = groupCardsMap.get(newId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }
);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.left-group-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  width: 100%;
}

.scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.8rem 0.8rem;
  box-sizing: border-box;
}

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

.group-box-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

.group-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.5rem;
  user-select: none;
  background-color: transparent;
  border-radius: @radius-md;
  box-sizing: border-box;
  cursor: pointer;
  border: 1px solid transparent;
  transition: @transition-fast;

  &:hover {
    background-color: var(--bg-panel-hover);

    .drag-handle:not(.is-hidden-by-search) {
      opacity: 1;
    }
  }

  &:hover,
  &:active,
  &.is-context-open {
    background-color: var(--bg-panel-hover) !important;
    border-color: var(--border-base);
    box-shadow: 0 0 0 1px var(--border-base);
  }
}

.group-info-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
  margin-right: 0.5rem;
  box-sizing: border-box;
}

.arrow-toggle-icon {
  color: var(--text-disabled);
  flex-shrink: 0;
  transition: transform @duration-fast @bezier-standard;

  &.is-collapsed {
    transform: rotate(-90deg);
  }
}

.group-name-text {
  font-weight: 700;
  font-size: 0.82rem;
  user-select: none;
  letter-spacing: 1px;
  color: var(--text-title);
}

.count-badge {
  background-color: var(--bg-body);
  color: var(--text-disabled);
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.chord-content-wrapper {
  margin-top: 0.4rem;
  position: relative;
  box-sizing: border-box;
}

.chords-grid-layout {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  align-items: center;
  position: relative;
  z-index: 10;
  min-height: 2.2rem;
  box-sizing: border-box;
}

/* 🌟 乐谱卡片精细样式 */
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
