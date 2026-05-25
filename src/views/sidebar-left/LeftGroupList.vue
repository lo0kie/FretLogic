<template>
  <div class="chord-scroll-area flex-1 overflow-y-auto no-scrollbar p-5 flex flex-col gap-4 min-w-[335px]">
    <div
      v-if="chordLabStore.groups.length === 0"
      class="h-full flex flex-col items-center justify-center opacity-30 py-20"
    >
      <span class="text-2xl mb-2">📁</span>
      <p class="text-[9px] font-black uppercase tracking-widest text-center leading-relaxed text-body">
        暂无分组<br />点击右上角新建
      </p>
    </div>

    <div v-else v-for="(group, idx) in chordLabStore.groups" :key="group.id" class="flex flex-col">
      <div
        draggable="true"
        @dragstart="handleDragStart(idx, $event)"
        @dragover.prevent
        @drop="handleDrop(idx)"
        @click="chordLabStore.handleGroupHeaderClick(group.id)"
        class="group-title-row flex items-center justify-between py-2 px-2 rounded-xl cursor-grab active:cursor-grabbing hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800"
      >
        <div class="flex items-center gap-2">
          <span
            class="text-[9px] opacity-30 transition-transform duration-200 text-body"
            :class="{ '-rotate-90': group.collapsed }"
          >
            ▼
          </span>
          <span
            class="text-xs font-black tracking-wide uppercase group-name-text"
            :class="{ 'is-active': chordLabStore.selectedGroupId === group.id && !group.collapsed }"
          >
            {{ group.name }}
          </span>
          <span
            class="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 opacity-60 border border-slate-200 dark:border-slate-700 text-body"
          >
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
          v-if="chordLabStore.getGroupChords(group.id).length === 0"
          class="py-4 border border-dashed border-slate-300 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl flex items-center justify-center"
        >
          <p class="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">没有和弦</p>
        </div>

        <div class="grid grid-cols-2 gap-2 items-center">
          <div
            v-for="chord in chordLabStore.getGroupChords(group.id)"
            :key="chord.id"
            @click="chordLabStore.handleChordClick(chord)"
            class="chord-thumb-card h-11 rounded-xl relative flex items-center px-3 justify-between overflow-hidden border transition-all duration-200"
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
              @click.stop="uiStore.triggerDeleteChord(chord)"
              class="text-[9px] opacity-40 hover:opacity-100 text-danger font-bold transition-opacity"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore'; // 🌟 纠正：对齐标准引入路径
import { useUiStore } from '@/stores/uiStore';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();

// 🌟 拖拽的上下文临时状态属于典型的 UI 表现，从 uiStore 取用，彻底干净
const handleDragStart = (idx: number, e: DragEvent) => {
  uiStore.draggedGroupIdx = idx;
  chordLabStore.groups.forEach(g => (g.collapsed = true));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
};

const handleDrop = (targetIdx: number) => {
  if (uiStore.draggedGroupIdx !== null && uiStore.draggedGroupIdx !== targetIdx) {
    const removed = chordLabStore.groups.splice(uiStore.draggedGroupIdx, 1)[0];
    chordLabStore.groups.splice(targetIdx, 0, removed);
    uiStore.showToast('↕️ 分组顺序已更新');
  }
  uiStore.draggedGroupIdx = null;
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.group-title-row {
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

.chord-thumb-card {
  border-color: var(--border-color);
  .chord-name-text {
    color: @text-body;
  }

  &.is-editing {
    border-color: @brand-primary !important;
    .chord-name-text {
      color: @brand-primary !important;
    }
  }
}

.dark {
  .chord-thumb-card {
    background-color: rgba(30, 41, 59, 0.3);
    border-color: rgba(255, 255, 255, 0.08);
    &:hover {
      border-color: rgba(59, 130, 246, 0.5);
    }

    &.is-editing {
      background-color: rgba(37, 99, 235, 0.15) !important;
      border-color: @brand-primary !important;
      .chord-name-text {
        color: #60a5fa !important; // 针对深色高光模式下的蓝字增强，保障对比度
      }
    }
  }
}
</style>
