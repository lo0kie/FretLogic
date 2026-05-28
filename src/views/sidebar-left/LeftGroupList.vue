<template>
  <div class="chord-scroll-area flex flex-col flex-1 overflow-hidden min-w-[335px]">
    <div class="pt-4 pb-0 px-4 relative flex items-center search-wrapper shrink-0">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索和弦..."
        :disabled="chordLabStore.savedChordsList.length === 0"
        class="search-input w-full h-10 bg-slate-100 dark:bg-slate-800/40 rounded-lg pl-3 pr-8 py-2 text-xs font-bold border outline-none transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
      />
      <Transition name="fade-clear">
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-7 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/80 dark:hover:bg-red-500 transition-all font-black select-none text-[12px]"
        >
          ✕
        </button>
      </Transition>
    </div>

    <div class="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-4">
      <div v-if="filteredGroups.length === 0" class="h-full flex flex-col items-center justify-center opacity-30 py-20">
        <span class="text-2xl mb-2">📁</span>
        <p class="text-xs font-black uppercase tracking-widest text-center leading-relaxed text-body">暂无匹配结果</p>
      </div>

      <div
        v-else
        v-for="(group, gIdx) in filteredGroups"
        :key="group.id"
        class="flex flex-col group-drop-zone transition-all duration-200"
        @dragover.prevent
        @drop.stop="handleChordDropToGroup(group.id)"
      >
        <div
          draggable="true"
          @dragstart="handleGroupDragStart(gIdx, $event)"
          @dragover.prevent
          @drop.stop="handleGroupDrop(gIdx)"
          @click="chordLabStore.handleGroupHeaderClick(group.id)"
          class="group-title-row dark:hover:bg-slate-800/60 flex items-center justify-between py-2 px-2 rounded-lg cursor-pointer active:cursor-grabbing"
        >
          <div class="flex items-center gap-2">
            <span
              class="text-[9px] opacity-30 transition-transform duration-200 text-body"
              :class="{ '-rotate-90': group.collapsed }"
            >
              ▼
            </span>
            <span
              class="text-sm tracking-widest font-black uppercase group-name-text"
              :class="{ 'is-active': chordLabStore.selectedGroupId === group.id && !group.collapsed }"
            >
              {{ group.name }}
            </span>
            <span class="text-[12px] font-bold px-1.5 py-0.5 rounded-md count-badge">
              {{ chordLabStore.getGroupChords(group.id).length }}
            </span>
          </div>

          <div class="action-buttons opacity-0 flex items-center gap-2 transition-opacity">
            <button
              @click.stop="uiStore.openModal('renameGroup', '修改组名', group.name, group)"
              class="text-[14px] text-primary font-semibold hover:underline"
            >
              改名
            </button>
            <button
              @click.stop="uiStore.openModal('deleteGroup', '删除分组', '', group)"
              class="text-[14px] text-danger font-semibold hover:underline"
            >
              删除
            </button>
          </div>
        </div>

        <div v-show="!group.collapsed" class="mt-2">
          <div
            v-if="getFilteredChords(group.id).length === 0"
            class="py-4 border border-dashed rounded-lg flex items-center justify-center empty-card-box"
          >
            <p class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">没有匹配和弦</p>
          </div>

          <div class="grid grid-cols-2 gap-2 items-center">
            <div
              v-for="chord in getFilteredChords(group.id)"
              :key="chord.id"
              draggable="true"
              @pointerdown="handleChordPointerDown(chord.id, group.id, $event)"
              @dragstart.stop="handleChordDragStart(chord.id, group.id, $event)"
              @dragend="handleChordDragEnd"
              @dragover.prevent
              @drop.stop="handleChordDropToSort(chord.id, group.id)"
              @click="chordLabStore.handleChordClick(chord)"
              @contextmenu.prevent
              class="chord-thumb-card active:cursor-grabbing hover:-translate-y-0.5 h-11 rounded-lg relative cursor-pointer flex items-center px-3 justify-between overflow-hidden border transition-all duration-200"
              :class="
                chordLabStore.editingId == chord.id
                  ? 'is-editing bg-blue-50/30 dark:bg-blue-950/40 shadow-sm'
                  : 'bg-slate-50/50 dark:bg-slate-800/20'
              "
            >
              <span class="chord-name-text text-xs font-black tracking-tight truncate pr-4 block leading-tight">
                {{ chord.chordName }}
              </span>
              <button
                @click.stop="handleLocalDeleteChord(chord)"
                class="text-[12px] delete-button transition-all w-5 h-5 rounded-full text-slate-400 hover:bg-red-500/80 dark:hover:bg-red-500 hover:text-white text-danger font-black"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { computed, ref } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();

const searchQuery = ref('');
const draggedChordInfo = ref<{ chordId: number; fromGroupId: string } | null>(null);
const groupsCollapsedSnapshot = ref<Record<string, boolean>>({});

// 计算属性过滤机制（仅检索和弦）
const filteredGroups = computed(() => {
  if (!searchQuery.value) return chordLabStore.groups;
  const q = searchQuery.value.toLowerCase();

  return chordLabStore.groups.filter(group => {
    const groupChords = chordLabStore.getGroupChords(group.id);
    return groupChords.some(c => c.chordName.toLowerCase().includes(q));
  });
});

const getFilteredChords = (groupId: string) => {
  const allChords = chordLabStore.getGroupChords(groupId);
  if (!searchQuery.value) return allChords;
  const q = searchQuery.value.toLowerCase();
  return allChords.filter(c => c.chordName.toLowerCase().includes(q));
};

// 删除拦截器
const handleLocalDeleteChord = (chord: any) => {
  const isEditingCurrent = chordLabStore.editingId == chord.id;
  uiStore.triggerDeleteChord(chord);
  if (isEditingCurrent) {
    chordLabStore.resetEditor();
  }
};

// A. 分组大框排序
const handleGroupDragStart = (idx: number, e: DragEvent) => {
  uiStore.draggedGroupIdx = idx;
  chordLabStore.groups.forEach(g => (g.collapsed = true));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
};

const handleGroupDrop = (targetIdx: number) => {
  if (uiStore.draggedGroupIdx !== null && uiStore.draggedGroupIdx !== targetIdx) {
    const removed = chordLabStore.groups.splice(uiStore.draggedGroupIdx, 1)[0];
    chordLabStore.groups.splice(targetIdx, 0, removed);
    uiStore.showToast('↕️ 分组顺序已更新');
  }
  uiStore.draggedGroupIdx = null;
};

// B. 和弦卡片拖拽与右键折叠排序逻辑
const handleChordPointerDown = (chordId: number, fromGroupId: string, e: PointerEvent) => {
  if (e.button === 2) {
    e.stopPropagation();
    e.preventDefault();

    draggedChordInfo.value = { chordId, fromGroupId };

    const snapshot: Record<string, boolean> = {};
    chordLabStore.groups.forEach(g => {
      snapshot[g.id] = g.collapsed;
    });
    groupsCollapsedSnapshot.value = snapshot;

    chordLabStore.groups.forEach(g => {
      g.collapsed = true;
    });

    uiStore.showToast('📁 已自动为您折叠分组，请直接拖拽投递');
  }
};

const handleChordDragStart = (chordId: number, fromGroupId: string, e: DragEvent) => {
  if (!draggedChordInfo.value) {
    draggedChordInfo.value = { chordId, fromGroupId };
  }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
  }
};

const handleChordDragEnd = () => {
  if (Object.keys(groupsCollapsedSnapshot.value).length > 0) {
    chordLabStore.groups.forEach(g => {
      if (groupsCollapsedSnapshot.value[g.id] !== undefined) {
        g.collapsed = groupsCollapsedSnapshot.value[g.id];
      }
    });
  }
  draggedChordInfo.value = null;
  groupsCollapsedSnapshot.value = {};
};

const handleChordDropToSort = (targetChordId: number, targetGroupId: string) => {
  const info = draggedChordInfo.value;
  if (!info || info.chordId === targetChordId) {
    handleChordDragEnd();
    return;
  }

  const sourceIdx = chordLabStore.savedChordsList.findIndex(c => c.id === info.chordId);
  const targetIdx = chordLabStore.savedChordsList.findIndex(c => c.id === targetChordId);

  if (sourceIdx !== -1 && targetIdx !== -1) {
    const [movedChord] = chordLabStore.savedChordsList.splice(sourceIdx, 1);

    if (info.fromGroupId !== targetGroupId) {
      movedChord.groupId = targetGroupId;
    }

    chordLabStore.savedChordsList.splice(targetIdx, 0, movedChord);
    uiStore.showToast('⚡ 和弦卡片顺序已同步');
  }
  handleChordDragEnd();
};

const handleChordDropToGroup = (targetGroupId: string) => {
  const info = draggedChordInfo.value;
  if (!info || info.fromGroupId === targetGroupId) {
    handleChordDragEnd();
    return;
  }

  const sourceIdx = chordLabStore.savedChordsList.findIndex(c => c.id === info.chordId);
  if (sourceIdx !== -1) {
    const [movedChord] = chordLabStore.savedChordsList.splice(sourceIdx, 1);
    movedChord.groupId = targetGroupId;
    chordLabStore.savedChordsList.push(movedChord);
    uiStore.showToast(`🚚 已成功划归至新分组`);
  }
  handleChordDragEnd();
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

// ==========================================================================
// 🌟 精准对齐设计：默认底色洗成纯净灰色（同步右侧显示范围控件），剥离高饱和杂色
// ==========================================================================
.search-input {
  color: @text-body;
  // 1. 移除不确定深浅的 var(--border-color)，改用原汁原味的系统级浅色卡片描边
  border-color: var(--control-border) !important;

  &:hover:not(:disabled) {
    // 悬浮时，微光的蓝色空气线激活，同时维持底色稳定性
    border-color: color-mix(in srgb, @brand-primary, transparent 70%) !important;
    background-color: var(--bg-panel);
  }

  &:focus {
    border-color: @brand-primary !important;
    background-color: var(--bg-panel);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  &::placeholder {
    color: @text-subtitle;
    opacity: 0.4;
  }
}

.fade-clear-enter-active,
.fade-clear-leave-active {
  transition: opacity 0.15s @bezier-standard;
}
.fade-clear-enter-from,
.fade-clear-leave-to {
  opacity: 0;
}

// 🚀 深色模式守护总线
:global(.dark) {
  .search-input {
    // 保持和右侧深色组件完全映射的暗色透明度底座
    background-color: rgba(30, 41, 59, 0.4);
    border-color: rgba(255, 255, 255, 0.08) !important;
    color: #f1f5f9;

    &:hover {
      border-color: rgba(59, 130, 246, 0.45) !important;
    }
  }
}

// ==========================================================================
// 原生基础类名总线保持不动
// ==========================================================================
.count-badge {
  background-color: var(--border-color);
  color: @text-subtitle;
  opacity: 0.6;
  border: 1px solid var(--control-border);
}

.empty-card-box {
  border-color: var(--control-border);
  background-color: rgba(30, 41, 59, 0.02);
}

.group-title-row {
  .mixin-hover-card();

  &:hover {
    .action-buttons {
      opacity: 1;
    }
  }

  .group-name-text {
    color: @text-body;

    &.is-active {
      color: @brand-primary !important;
    }
  }
}

.group-drop-zone {
  transition: all 0.2s @bezier-standard;
  &[dragover] {
    background-color: rgba(37, 99, 235, 0.03);
    border-radius: 16px;
  }
}

.chord-thumb-card {
  .mixin-hover-card();

  border: 1px solid color-mix(in srgb, var(--control-border), transparent 80%);
  cursor: pointer;

  .chord-name-text {
    color: @text-body;
  }

  &.is-editing {
    border-color: @brand-primary !important;
    background-color: rgba(37, 99, 235, 0.08);
    .chord-name-text {
      color: @brand-primary !important;
    }
  }
}

:global(.dark) {
  .chord-thumb-card {
    background-color: rgba(30, 41, 59, 0.3);

    &.is-editing {
      background-color: rgba(37, 99, 235, 0.15) !important;
      .chord-name-text {
        color: #60a5fa !important;
      }
    }
  }

  .group-drop-zone {
    &[dragover] {
      background-color: rgba(59, 130, 246, 0.06);
    }
  }
}
</style>
