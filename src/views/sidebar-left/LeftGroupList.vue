<template>
  <div class="flex flex-col flex-1 overflow-hidden min-w-[335px]">
    <LeftSearch v-model="searchQuery" :disabled="chordLabStore.savedChordsList.length === 0" />

    <div class="flex-1 overflow-y-auto no-scrollbar p-4">
      <div
        v-if="chordLabStore.groups.length === 0"
        class="h-full flex flex-col items-center justify-center opacity-30 py-20"
      >
        <span class="text-2xl mb-2">📁</span>
        <p
          class="text-xs font-black uppercase tracking-widest text-center leading-relaxed"
          style="color: var(--text-body)"
        >
          还没有添加分组
        </p>
      </div>

      <TransitionGroup v-else name="group-list" tag="div" class="flex flex-col gap-4 relative">
        <div
          v-for="(group, gIdx) in chordLabStore.groups"
          :key="group.id"
          class="flex flex-col group-drop-zone w-full"
          @dragover.prevent
          @drop.stop="searchQuery ? null : handleChordDropToGroup(group.id)"
        >
          <div
            title="点击展开/折叠，按住可拖拽排序"
            :draggable="!searchQuery"
            @dragstart="handleLocalGroupDragStart(gIdx, $event)"
            @dragover.prevent
            @drop.stop="handleLocalGroupDrop(gIdx)"
            @click="chordLabStore.handleGroupHeaderClick(group.id)"
            class="group-title-row flex items-center justify-between py-2 px-2"
            :class="searchQuery ? 'cursor-pointer' : 'active:cursor-grabbing'"
          >
            <div class="flex items-center gap-2">
              <span
                class="text-[9px] opacity-40 transition-transform duration-200"
                style="color: var(--text-body)"
                :class="{ '-rotate-90': group.collapsed }"
                >▼</span
              >
              <span
                class="text-sm tracking-widest font-black uppercase group-name-text"
                :class="{ 'is-active': chordLabStore.selectedGroupId === group.id && !group.collapsed }"
                >{{ group.name }}</span
              >

              <span
                class="text-[12px] font-black px-1.5 py-0.5 count-badge transition-all duration-300"
                :class="{ 'is-searching': searchQuery }"
              >
                <template v-if="searchQuery">
                  <span class="text-[var(--color-primary)]">{{ filteredChordsMap[group.id].length }}</span>
                  <span class="opacity-30 mx-0.5">/</span>
                  <span class="opacity-60">{{ chordLabStore.getGroupChords(group.id).length }}</span>
                </template>
                <template v-else>
                  {{ chordLabStore.getGroupChords(group.id).length }}
                </template>
              </span>
            </div>

            <div class="action-buttons opacity-0 flex items-center gap-2 transition-opacity">
              <button
                @click.stop="uiStore.openModal('renameGroup', '修改组名', group.name, group)"
                class="text-[14px] font-semibold hover:underline"
                style="color: var(--color-primary)"
              >
                改名
              </button>
              <button
                @click.stop="uiStore.openModal('deleteGroup', '删除分组', '', group)"
                class="text-[14px] font-semibold hover:underline"
                style="color: var(--color-danger)"
              >
                删除
              </button>
            </div>
          </div>

          <div v-if="!group.collapsed" class="mt-2">
            <div
              v-if="chordLabStore.getGroupChords(group.id).length === 0"
              class="py-4 flex flex-col items-center justify-center empty-card-box opacity-60"
            >
              <p class="text-xs font-bold uppercase tracking-widest" style="color: var(--text-disabled)">
                暂无和弦，请从指板保存
              </p>
            </div>

            <div
              v-else-if="filteredChordsMap[group.id].length === 0"
              class="py-4 flex flex-col items-center justify-center empty-card-box border-amber-500/20 dark:border-amber-500/10 bg-amber-500/[0.02]"
            >
              <p class="text-xs font-bold uppercase tracking-widest text-amber-600/80 dark:text-amber-500/60">
                没有匹配的和弦
              </p>
            </div>

            <TransitionGroup v-else name="chord-list" tag="div" class="grid grid-cols-2 gap-2 items-center relative">
              <LeftChordCard
                v-for="chord in filteredChordsMap[group.id]"
                :key="chord.id"
                :chord="chord"
                :is-editing="chordLabStore.editingId === chord.id"
                @delete="handleLocalDeleteChord"
                @click="chordLabStore.handleChordClick(chord)"
                :draggable="!searchQuery"
                @pointerdown="handleLocalChordPointerDown(chord.id, group.id, $event)"
                @dragstart.stop="handleLocalChordDragStart(chord.id, group.id, $event)"
                @dragend="handleChordDragEnd"
                @dragover.prevent
                @drop.stop="searchQuery ? null : handleChordDropToSort(chord.id, group.id)"
                :class="searchQuery ? 'cursor-pointer' : 'active:cursor-grabbing'"
              />
            </TransitionGroup>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordDragDrop } from '@/composables/useChordDragDrop';
import { useChordLabStore, type Chord } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import LeftChordCard from '@/views/sidebar-left/LeftChordCard.vue';
import LeftSearch from '@/views/sidebar-left/LeftSearch.vue';
import { computed, ref } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const searchQuery = ref('');

const {
  handleGroupDragStart,
  handleGroupDrop,
  handleChordPointerDown,
  handleChordDragStart,
  handleChordDragEnd,
  handleChordDropToSort,
  handleChordDropToGroup,
} = useChordDragDrop();

const filteredChordsMap = computed(() => {
  const map: Record<string, Chord[]> = {};
  const q = searchQuery.value.toLowerCase();
  chordLabStore.groups.forEach(g => {
    const allChords = chordLabStore.getGroupChords(g.id);
    map[g.id] = q ? allChords.filter(c => c.chordName.toLowerCase().includes(q)) : allChords;
  });
  return map;
});

const handleLocalGroupDragStart = (idx: number, e: DragEvent) => {
  if (searchQuery.value) return;
  handleGroupDragStart(idx, e);
};

const handleLocalGroupDrop = (targetIdx: number) => {
  if (searchQuery.value) return;
  handleGroupDrop(targetIdx);
};

const handleLocalChordPointerDown = (chordId: number, fromGroupId: string, e: PointerEvent) => {
  if (searchQuery.value) return;
  handleChordPointerDown(chordId, fromGroupId, e);
};

const handleLocalChordDragStart = (chordId: number, fromGroupId: string, e: DragEvent) => {
  if (searchQuery.value) return;
  handleChordDragStart(chordId, fromGroupId, e);
};

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = chordLabStore.editingId == chord.id;
  uiStore.triggerDeleteChord(chord);
  if (isEditingCurrent) chordLabStore.resetEditor();
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.group-list-move,
.chord-list-move {
  transition: transform 0.25s ease-out;
}

.group-list-enter-active,
.group-list-leave-active,
.chord-list-enter-active,
.chord-list-leave-active {
  transition: all 0.2s ease-out;
}

.group-list-enter-from,
.group-list-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.chord-list-enter-from,
.chord-list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.group-list-leave-active,
.chord-list-leave-active {
  position: absolute;
  z-index: 0;
}

.group-list-leave-active {
  width: 100%;
}

.count-badge {
  background-color: var(--bg-body);
  color: var(--text-muted);
  border: @border-solid-base;
  border-radius: @radius-sm;
  font-variant-numeric: tabular-nums;
  &.is-searching {
    border-color: color-mix(in srgb, @primary, transparent 70%);
    background-color: color-mix(in srgb, @primary, transparent 96%);
  }
}

.empty-card-box {
  border: @border-dashed-base;
  background-color: var(--bg-body);
  border-radius: @radius-md;
}

.group-title-row {
  .mixin-interactive-card();
  border-radius: @radius-md;
  &:hover .action-buttons {
    opacity: 1;
  }
  .group-name-text {
    color: var(--text-body);
    &.is-active {
      color: @primary !important;
    }
  }
}

.group-drop-zone {
  transition: @transition-base;
  &[dragover] {
    background-color: color-mix(in srgb, @primary, transparent 95%);
    border-radius: @radius-xl;
  }
}
</style>
