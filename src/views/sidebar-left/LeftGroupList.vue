<template>
  <div class="flex flex-col flex-1 overflow-hidden min-w-[335px]">
    <LeftSearch v-model="searchQuery" :disabled="chordLabStore.savedChordsList.length === 0" />

    <div class="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4">
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

      <div
        v-else
        v-for="(group, gIdx) in chordLabStore.groups"
        :key="group.id"
        class="flex flex-col group-drop-zone"
        @dragover.prevent
        @drop.stop="handleChordDropToGroup(group.id)"
      >
        <div
          draggable="true"
          @dragstart="handleGroupDragStart(gIdx, $event)"
          @dragover.prevent
          @drop.stop="handleGroupDrop(gIdx)"
          @click="chordLabStore.handleGroupHeaderClick(group.id)"
          class="group-title-row flex items-center justify-between py-2 px-2 active:cursor-grabbing"
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
            <span class="text-[12px] font-bold px-1.5 py-0.5 count-badge">
              {{ chordLabStore.getGroupChords(group.id).length }}
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
            class="py-4 flex flex-col items-center justify-center empty-card-box"
          >
            <p class="text-xs font-bold uppercase tracking-widest" style="color: var(--text-disabled)">
              没有保存的和弦
            </p>
          </div>

          <div
            v-else-if="filteredChordsMap[group.id].length === 0"
            class="py-4 flex flex-col items-center justify-center empty-card-box border-amber-500/20 dark:border-amber-500/10 bg-amber-500/[0.02]"
          >
            <p class="text-xs font-bold uppercase tracking-widest" style="color: var(--text-disabled)">
              没有匹配的和弦
            </p>
          </div>

          <div v-else class="grid grid-cols-2 gap-2 items-center">
            <LeftChordCard
              v-for="chord in filteredChordsMap[group.id]"
              :key="chord.id"
              :chord="chord"
              :is-editing="chordLabStore.editingId === chord.id"
              @delete="handleLocalDeleteChord"
              @click="chordLabStore.handleChordClick(chord)"
              draggable="true"
              @dragstart.stop="handleChordDragStart(chord.id, group.id, $event)"
              @dragend="handleChordDragEnd"
              @dragover.prevent
              @drop.stop="handleChordDropToSort(chord.id, group.id)"
            />
          </div>
        </div>
      </div>
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

const handleLocalDeleteChord = (chord: Chord) => {
  const isEditingCurrent = chordLabStore.editingId == chord.id;
  uiStore.triggerDeleteChord(chord);
  if (isEditingCurrent) chordLabStore.resetEditor();
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.count-badge {
  background-color: var(--bg-body);
  color: var(--text-muted);
  border: @border-solid-base;
  border-radius: @radius-sm;
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
