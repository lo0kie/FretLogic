<template>
  <BaseDrawer v-model:visible="visibleModel" :title="drawerTitle" placement="right" size="lg">
    <!-- 高度必须用 min-h-full 而非 size-full/h-full：h-* 把插槽根钉死在滚动容器的 content-box 高度上，
         内容溢出时溢出量来自后代，容器底部的 padding 不进入滚动范围，表现为「下 padding 不生效」；
         min-h-full 让根随内容增长，滚动容器的 py 两端都正常留白。
         同时内容块必须直接挂在根下（不要再套 flex-1/min-h-0 定高链）：一旦中间层靠 flex-basis:0 撑满高度，
         溢出又会变回「后代溢出」，底部 padding 再次失效。m-auto 负责有富余时居中、溢出时归零。

         横向则**反过来必须定宽**（下面两层都是 w-full，不再是 w-fit）：指板按宿主量到的可用宽度贴合缩小
         （见 Fretboard 的 maxWidth），量取点就是下面那张卡片。卡片若按内容收缩（w-fit），
         「量到的宽度 → 指板缩小 → 卡片变窄 → 再量到更窄」会自己咬自己，一路缩到底。

         这一层**不再加横向内边距**（原本是 px-xl）：卡片既然铺满，这层内边距就等于直接从指板的可用
         宽度里扣，而滚动容器自己已有 px-xl，卡片离抽屉边缘并不需要它再兜一次。去掉后卡片外沿与
         header/footer 的 px-xl 对齐，指板拿回约 67px（桌面 416 → 483）。 -->
    <div class="flex min-h-full w-full flex-col">
      <div class="m-auto flex min-h-0 w-full flex-col items-center gap-lg">
        <!-- 交互指板：点击/编辑即写和弦草稿（写入逻辑与工作台共用 useChordDraftEditing），
             品数/偏移/调音等设置内建于 Fretboard 组件自身。

             卡片兼作**可用宽度的量取点**（见 boardAreaWidth）：量内容盒，即「指板能用多宽」。
             横向内边距窄屏收一档（2rem → 0.75rem）：抽屉在手机上被视口压到 92% 宽（390px 视口下 359px），
             卡片若照桌面档吃 2rem，指板就只剩 200px 上下；≥768px 仍是 2rem，桌面档一行未动。 -->
        <div
          class="pointer-events-auto relative flex w-full shrink-0 flex-col items-center justify-evenly rounded-md border border-glass-border bg-surface-panel px-md py-xl transition-[border-color] duration-slow ease-sidebar hover:border-border-base md:px-2xl"
          ref="boardCardRef"
        >
          <Fretboard
            :chord="editorStore.draftChord"
            :max-width="boardAreaWidth"
            @update:barres="handleBarresChange($event)"
            @update:chord-name="handleChordNameChange($event)"
            @update:fret-offset="handleFretOffsetUpdate($event)"
            @update:name-segments="handleNameSegmentsChange($event)"
            @update:root-string-index="handleRootStringChange($event)"
            @update:strings="handleStringsChange($event)"
          />
        </div>

        <div
          class="flex h-[20vh] w-full min-w-0 shrink-0 flex-col gap-sm rounded-md border border-glass-border bg-surface-panel px-lg py-sm contain-inline-size"
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
        appearance="ghost"
        label="重置指板"
      />
      <ActionButton
        :disabled="isSaveDisabled"
        :label="editorStore.isEditing ? '更新保存' : '确认保存'"
        @click="handleSave()"
        appearance="subtle"
        color="primary"
      />
    </template>
  </BaseDrawer>

  <!-- 新建和弦时的目标分组选择：与「移动至新分组」共用同一组件（GroupPickerGrid），
       交互、外观与列数档位因此天然一致（层号由 BaseModal 自行从浮层池取号，天然高于抽屉，无需外部注入）。
       与移动流程的唯一差异是这里不禁用「当前所属分组」—— 那是草稿的默认值，本就是合法选择，故不传
       disable-active。 -->
  <BaseModal v-model:visible="groupModalOpen" @confirm="handleConfirmGroupSelect()" title="选择保存分组">
    <GroupPickerGrid
      v-model="selectedTargetGroupId"
      :active-group-id="editorStore.draftChord.groupId"
      :chords-by-group="chordStore.groupChordMap"
      :groups="chordStore.groups"
      active-tooltip="和弦当前将保存到此分组"
    />
  </BaseModal>
</template>

<script setup lang="ts">
import { computed, provide, ref, useTemplateRef, watch } from 'vue';

import GroupPickerGrid from '@/domains/chord/library/components/GroupPickerGrid.vue';
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
import { observeResize } from '@/platform/utils/dom';

import type { Chord } from '@/domains/chord/types';

/** 抽屉可见性（v-model:visible）：模型声明即 props 声明，勿再在 defineProps 里重复写一份 */
const visibleModel = defineModel<boolean>('visible', { required: true });

const props = defineProps<{
  /** 编辑模式：null=新建空白草稿；传和弦对象则加载该和弦进入编辑 */
  editingChord: Chord | null;
  /** 新建时的预归入分组（选择和弦面板当前选中的分组 id；'ALL' 或 null 视为未选） */
  presetGroupId?: string | null;
}>();

const emit = defineEmits<{
  /** 保存成功（更新保存 / 新建确认）后派发，供父级刷新列表定位等 */
  (e: 'saved'): void;
}>();

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

/**
 * 打开时初始化编辑上下文：编辑态加载目标和弦，新建态重置草稿并预归组。
 *
 * 【本组件刻意会写宿主的侧栏状态 —— 这是「面板不读写宿主」那条口径的已知例外】三条分支都把宿主
 * 和弦库侧栏同步到「本次编辑相关的那个分组」：编辑既有和弦 / 带预设分组时展开该分组（关闭抽屉后
 * 用户一眼能看到它落在哪一组），没有归属分组时按同一口径传 `null`（取消选中并折叠全部 —— 留着某个
 * 无关分组展开只会误导）。它只动「展开 / 选中哪个分组」这一个内存态，不碰任何数据。
 */
watch(
  () => visibleModel.value,
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
      } else chordStore.selectAndExpandGroup(null);
    }
  },
  { immediate: true }
);

/** 重置：回到全新空白草稿（编辑态下等同放弃修改） */
const handleReset = () => void editorStore.resetEditor();

/**
 * 指板卡的**可用宽度**（px）：指板按它贴合缩小（见 Fretboard 的 maxWidth）。
 *
 * 这就是本抽屉此前缺的那一环 —— 工作台一直在下发它（见 WorkbenchView 的 boardAreaWidth），
 * 抽屉没下发，`fitScale` 于是恒为 1：指板按自然宽渲染（6 弦 3 品 533px、5 品 453px），
 * 而手机视口（390px）下抽屉只有 359px 宽、扣掉各层内边距后指板位仅 224px ——
 * 整块内容横向溢出两倍多，表现就是「新建和弦抽屉里的指板巨大、要左右拖才看得全」。
 *
 * 量的是卡片的内容盒。卡片是 `w-full`（宽度由抽屉决定，与指板自身尺寸无关），
 * 故不存在「量到的宽度反过来由指板决定」的循环 —— 指板怎么缩都不影响量取值，
 * 响应式的内边距档位（窄屏 px-md / 桌面 md:px-2xl）也一并由这个内容盒自动带上。
 *
 * 初值 0 = 不缩（见 useFretboardLayout 的 fitScale）。不预置视口估算值：ResizeObserver 的
 * 首次回调在**绘制之前**投递，而那一刻抽屉还在入场动画里（整体位移在外、被浮层裁掉），
 * 看不到「先按自然宽铺开、再缩回」的一跳。丢弃非正数：抽屉关闭时节点被摘除，观察者会报一次 0，
 * 照收就会把指板放回自然宽（下次打开首帧闪一下）。
 */
const boardCardRef = useTemplateRef<HTMLElement>('boardCardRef');
const boardAreaWidth = ref(0);
// 必须盯 ref 而不是 onMounted：卡片在抽屉面板的 v-if 之后，本组件挂载时它还不存在
// （抽屉关着时 boardCardRef 是 null），onMounted 那一刻绑观察者等于一次都不绑。
watch(
  boardCardRef,
  (card, _previous, onCleanup) => {
    if (!card) return;
    onCleanup(
      observeResize(card, entry => {
        if (entry.contentRect.width > 0) boardAreaWidth.value = entry.contentRect.width;
      })
    );
  },
  // post：等这一帧的 DOM 补丁落定（卡片已入文档）再观察，量到的就是真实排版值
  { flush: 'post' }
);

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
  () => visibleModel.value,
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
