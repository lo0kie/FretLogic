<template>
  <BaseDrawer v-model:visible="visibleModel" :title="drawerTitle" placement="right" size="lg">
    <!-- 高度必须用 min-h-full 而非 size-full/h-full：h-* 把插槽根钉死在滚动容器的 content-box 高度上，
         内容溢出时溢出量来自后代，容器底部的 padding 不进入滚动范围，表现为「下 padding 不生效」；
         min-h-full 让根随内容增长，滚动容器的 py 两端都正常留白。
         同时内容块必须直接挂在根下（不要再套 flex-1/min-h-0 定高链）：一旦中间层靠 flex-basis:0 撑满高度，
         溢出又会变回「后代溢出」，底部 padding 再次失效。m-auto 负责有富余时居中、溢出时归零。 -->
    <div class="flex min-h-full w-full flex-col">
      <div class="m-auto flex min-h-0 w-fit flex-col items-center gap-lg px-xl">
        <!-- 交互指板：点击/编辑即写和弦草稿（写入逻辑与工作台共用 useChordDraftEditing），
             品数/偏移/调音等设置内建于 Fretboard 组件自身 -->
        <div
          class="pointer-events-auto relative flex w-fit shrink-0 flex-col items-center justify-evenly rounded-md border border-glass-border bg-surface-panel/90 px-2xl py-xl backdrop-blur-lg transition-[border-color] duration-slow ease-sidebar hover:border-border-base"
        >
          <Fretboard
            :chord="editorStore.draftChord"
            @update:barres="handleBarresChange($event)"
            @update:chord-name="handleChordNameChange($event)"
            @update:fret-offset="handleFretOffsetUpdate($event)"
            @update:name-segments="handleNameSegmentsChange($event)"
            @update:root-string-index="handleRootStringChange($event)"
            @update:strings="handleStringsChange($event)"
          />
        </div>

        <div
          class="flex h-[20vh] w-full min-w-0 shrink-0 flex-col gap-sm rounded-md border border-glass-border bg-surface-panel/70 px-lg py-sm backdrop-blur-lg contain-inline-size"
        >
          <span class="shrink-0 text-xs font-bold tracking-tight text-fg-title">和弦候选</span>
          <ChordAnalysisPanel candidates-only class="min-h-0 min-w-0 flex-1" />
        </div>
      </div>
    </div>

    <template #footer>
      <ActionButton
        v-if="!editorStore.isEditing"
        :disabled="isPristine"
        @click="handleReset()"
        label="重置指板"
        variant="ghost"
      />
      <ActionButton
        :disabled="isSaveDisabled"
        :label="editorStore.isEditing ? '更新保存' : '确认保存'"
        @click="handleSave()"
        color="primary"
        variant="subtle"
      />
    </template>
  </BaseDrawer>

  <!-- 新建和弦时的目标分组选择：复用「移动至新分组」的交互与外观
       （层号由 BaseModal 自行从浮层池取号，天然高于抽屉，无需外部注入） -->
  <BaseModal v-model:visible="groupModalOpen" @confirm="handleConfirmGroupSelect()" title="选择保存分组">
    <div v-grid-nav="3" class="no-scrollbar grid max-h-[50vh] grid-cols-3 gap-md">
      <button
        v-wave
        v-for="group in chordStore.groups"
        v-tooltip="group.id === editorStore.draftChord.groupId ? '和弦当前将保存到此分组' : ''"
        :class="[
          selectedTargetGroupId === group.id
            ? 'scale-[1.02] border-primary bg-primary text-fg-on-accent'
            : 'bg-surface-body text-fg-body hover:border-primary hover:bg-surface-panel-hover active:scale-95',
        ]"
        :key="group.id"
        :title="group.name"
        @click="selectedTargetGroupId = group.id"
        data-focusable-outline
        class="flex w-full min-w-0 cursor-pointer items-center rounded-md border border-border-base p-md text-xs font-bold transition-all duration-fast hover:border-primary"
      >
        <div v-marquee.fade>
          <span> {{ group.name }} </span>
          <span :class="selectedTargetGroupId === group.id ? 'text-fg-on-accent/70' : 'text-fg-disabled'" class="pl-1"
            >({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})</span
          >
        </div>
      </button>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';

import ChordAnalysisPanel from '@/domains/chord/workbench/components/ChordAnalysisPanel.vue';
import Fretboard from '@/domains/fretboard/components/Fretboard.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseDrawer from '@/platform/ui/drawer/BaseDrawer.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import { useChordActions } from '@/domains/chord/library/composables/useChordActions';
import { CHORD_EDITOR_STORE_KEY, useDrawerChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { toGroupId } from '@/domains/chord/theory/entityFactories';
import {
  useChordDraftEditing,
  useChordDraftSaveState,
} from '@/domains/chord/workbench/composables/useChordDraftEditing';
import { useUiStore } from '@/platform/store/uiStore';

import type { Chord } from '@/domains/chord/types';

const props = defineProps<{
  visible: boolean;
  /** 编辑模式：null=新建空白草稿；传和弦对象则加载该和弦进入编辑 */
  editingChord: Chord | null;
  /** 新建时的预归入分组（选择和弦面板当前选中的分组 id；'ALL' 或 null 视为未选） */
  presetGroupId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  /** 保存成功（更新保存 / 新建确认）后派发，供父级刷新列表定位等 */
  (e: 'saved'): void;
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

// 抽屉专用草稿（纯内存）：与工作台草稿完全隔离，抽屉内编辑/新建不再改动工作台指板，反之亦然
const editorStore = useDrawerChordEditorStore();
// 子树（和弦候选面板等）经注入解析到本抽屉草稿；provide 对自身不可见，故下方 composable 显式传参
provide(CHORD_EDITOR_STORE_KEY, editorStore);
const chordStore = useChordStore();
const chordActions = useChordActions(editorStore);
const {
  handleBarresChange,
  handleChordNameChange,
  handleFretOffsetUpdate,
  handleNameSegmentsChange,
  handleRootStringChange,
  handleStringsChange,
} = useChordDraftEditing(editorStore);
const { isPristine, isSaveDisabled } = useChordDraftSaveState(editorStore);

const drawerTitle = computed(() => (editorStore.isEditing ? '编辑和弦' : '新建和弦'));

/** 打开时初始化编辑上下文：编辑态加载目标和弦，新建态重置草稿并预归组 */
watch(
  () => props.visible,
  open => {
    if (!open) return;
    if (props.editingChord) {
      editorStore.setEditor(props.editingChord);
      chordStore.selectAndExpandGroup(props.editingChord.groupId);
    } else {
      editorStore.resetEditor();
      if (props.presetGroupId && props.presetGroupId !== 'ALL') {
        chordStore.selectAndExpandGroup(props.presetGroupId);
        editorStore.draftChord.groupId = toGroupId(props.presetGroupId);
      } else {
        chordStore.collapseAllGroups();
        chordStore.setSelectedGroupId(null);
      }
    }
  },
  { immediate: true }
);

/** 重置：回到全新空白草稿（编辑态下等同放弃修改） */
const handleReset = () => {
  editorStore.resetEditor();
};

const uiStore = useUiStore();

/**
 * 新建和弦目标分组弹窗状态：弹层开关与当前预选分组。
 * 层级无需手动管理——BaseModal 打开时自行从浮层池取号，天然高于抽屉层号。
 */
const groupModalOpen = ref(false);
const selectedTargetGroupId = ref('');

/**
 * 抽屉被外部收起（宿主随 KeepAlive 停用而一并关闭等）时同步收起分组选择弹窗：
 * 该弹窗同样 Teleport 到 body，不会随抽屉 DOM 一起摘除，会独立残留在页面上。
 */
watch(
  () => props.visible,
  open => {
    if (!open) groupModalOpen.value = false;
  }
);

/** 打开新建分组选择弹窗：预选当前已生效分组 */
const openGroupSelect = () => {
  selectedTargetGroupId.value = String(editorStore.draftChord.groupId || chordStore.selectedGroupId || '');
  groupModalOpen.value = true;
};

/**
 * 确认保存：编辑态直接更新落盘；新建态先弹出目标分组选择，确认后以所选分组保存。
 * 尚无任何分组时无需弹窗，直接交给校验流程提示「请先新建分组」。
 */
const handleSave = () => {
  if (editorStore.isEditing) {
    // 保存失败时保留抽屉内草稿供继续修改，仅保存成功才关闭
    if (!chordActions.persistCurrentChord()) return;
    visibleModel.value = false;
    emit('saved');
    return;
  }
  if (chordStore.groups.length === 0) {
    chordActions.persistCurrentChord();
    return;
  }
  openGroupSelect();
};

/** 确认分组选择：把所选分组写入草稿后保存新建和弦，并展开切到该分组（选中 + 展开，与打开抽屉时的入口一致）。关闭弹窗，但保存失败时保留抽屉供继续修改 */
const handleConfirmGroupSelect = () => {
  if (!selectedTargetGroupId.value) {
    uiStore.message.warning('请先选择要保存到的分组');
    return;
  }
  editorStore.draftChord.groupId = toGroupId(selectedTargetGroupId.value);
  chordStore.selectAndExpandGroup(selectedTargetGroupId.value);
  const saved = chordActions.persistCurrentChord();
  groupModalOpen.value = false;
  if (!saved) return;
  visibleModel.value = false;
  emit('saved');
};
</script>
