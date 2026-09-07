<template>
  <div
    v-scrollbar="{ onScroll: closeAllPopovers }"
    :style="{ '--score-font-scale': scoreEditor.effectiveFontScale }"
    @scroll.passive="handleScroll()"
    class="no-scrollbar interactive-score-zone relative box-border min-w-0 flex-1 overflow-auto py-6 pr-0 pl-xl max-md:pt-sm max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] max-md:pl-sm"
    ref="scoreZoneRef"
  >
    <div class="contents">
      <EmptyState
        v-if="!scoreEditor.activeSong?.lyrics.trim()"
        description="请先在“编辑歌词”模式下输入文本内容"
        icon="file-text"
        size="lg"
      />
      <div v-else class="mx-auto flex w-max max-w-[900px] min-w-full flex-col gap-xs">
        <div
          v-for="lineData in visibleLines"
          v-memo="[
            lineData.lineId,
            lineData.lineIdx,
            lineData.startChords,
            lineData.chars,
            lineData.endChords,
            // 行内槽位和弦在子树中经 getCharChord 实时读取，必须依赖 chordMap 引用（每次变更为新 Map），
            // 否则删除/更换行中段和弦时 chars 等依赖不变，memo 命中导致旧和弦残留显示
            scoreEditor.activeSong?.chordMap,
            hoveredLineKey === lineData.lineId,
            // 拖拽落点严格按行归约：仅当前悬停行触发撑开与落点高亮，
            // 其余行全程命中 memo 缓存，绝不触发全量重排掉帧
            isLineActiveDrop(lineData.lineId),
            isLineActiveDrop(lineData.lineId) ? lineDropTargetKey(lineData.lineId) : null,
            isLineActiveDrop(lineData.lineId) ? lineDropZone(lineData.lineId) : null,
          ]"
          :key="lineData.lineId"
          class="line-row flex w-max min-w-full items-stretch"
        >
          <div
            :class="{
              'is-empty-line': lineData.chars.length === 0,
            }"
            :data-line-idx="lineData.lineId"
            @mouseenter="hoveredLineKey = lineData.lineId"
            @mouseleave="hoveredLineKey = null"
            class="lyrics-line relative box-border flex w-max min-w-0 flex-[1_1_auto] flex-nowrap items-stretch gap-0 rounded-md border border-transparent px-sm py-xs transition-all duration-base select-none focus-within:border-border-base focus-within:bg-surface-panel-hover hover:border-border-base hover:bg-surface-panel-hover"
          >
            <div class="mr-2 flex shrink-0 items-end pb-0.5 select-none">
              <span
                class="rounded-lg px-xs py-2xs font-mono text-2xs font-bold text-fg-disabled transition-colors duration-fast"
              >
                {{ formatLineIndex(lineData.lineIdx) }}
              </span>
            </div>
            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlotCell
                :drop-zone="dropZoneFor(lineData.nextStartKey)"
                :is-drag-active="isLineActiveDrop(lineData.lineId)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="lineData.nextStartKey"
                @click="handleOpenPicker(lineData.nextStartKey)"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                add-placeholder-title="点击添加行首和弦"
                variant="add"
              />
              <ChordSlotCell
                v-for="item in lineData.startChords"
                :chord="item.chord"
                :drop-zone="dropZoneFor(item.slotKey)"
                :is-drag-active="isLineActiveDrop(lineData.lineId)"
                :key="item.slotKey"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleOpenPicker(item.slotKey)"
                @copy-pointerdown="handleCopyPointerDown($event)"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                variant="edge"
              />
            </div>

            <template v-for="(item, index) in lineData.chars" :key="item.slotKey">
              <!-- 胖槽位：已分配和弦的槽位，实例化全功能 ChordSlotCell 组件 -->
              <ChordSlotCell
                v-if="getCharChord(item.slotKey)"
                :char="item.char"
                :chord="getCharChord(item.slotKey) ?? undefined"
                :drop-zone="dropZoneFor(item.slotKey)"
                :is-drag-active="isLineActiveDrop(lineData.lineId)"
                :key="item.slotKey"
                :left-chord-gap="isLeftAdjacentChord(lineData, index)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleOpenPicker(item.slotKey)"
                @copy-pointerdown="handleCopyPointerDown($event)"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                variant="char"
              />

              <!-- 瘦槽位：未分配和弦的普通字符槽位，直接以高性能原生 DOM 渲染（带完整交互能力与统一视觉样式） -->
              <div
                v-action-card
                v-else
                v-wave="{}"
                :aria-label="`字符 ${item.char === ' ' ? '空格' : item.char}，未分配和弦，按 Enter 添加`"
                :class="[
                  'char-box group relative box-border flex cursor-pointer [touch-action:pan-x_pan-y] flex-col items-center justify-start self-stretch rounded-sm p-0.5 px-0.5 transition-all duration-fast outline-none hover:bg-tint-primary-88 focus-visible:shadow-(--focus-ring) [&.is-drop-target]:bg-tint-primary-85!',
                  { 'is-drop-widened': isLineActiveDrop(lineData.lineId) },
                ]"
                :data-slot-key="item.slotKey"
                @click="handleOpenPicker(item.slotKey)"
                data-focusable-inline
                title="点击添加和弦"
              >
                <!-- 瘦槽位作为落点时的轻量绝对定位分区层（仅当光标悬停在本槽位且处于拖拽中时按需出现） -->
                <Transition
                  enter-active-class="transition-[opacity,scale] duration-fast"
                  enter-from-class="opacity-0 scale-100"
                  leave-active-class="transition-[opacity,scale] duration-fast"
                  leave-to-class="opacity-0 scale-100"
                >
                  <div
                    v-if="dropZoneFor(item.slotKey)"
                    class="pointer-events-none absolute inset-0 z-3 flex flex-col gap-[4px] overflow-hidden rounded-[6px] p-[2px]"
                  >
                    <div
                      :class="
                        dropZoneFor(item.slotKey) === 'top'
                          ? 'min-h-[38px] flex-[1.86] rounded-[5px] border-2 border-primary bg-tint-primary-88'
                          : 'min-h-[26px] flex-1 rounded-[5px] border border-primary/40 bg-tint-primary-88'
                      "
                      class="flex items-center justify-center transition-all duration-fast"
                    >
                      <span
                        :class="dropZoneFor(item.slotKey) === 'top' ? 'text-xs text-primary' : 'text-2xs text-primary'"
                        class="leading-none font-bold break-keep transition-all duration-fast"
                      >
                        复制
                      </span>
                    </div>
                    <div
                      :class="
                        dropZoneFor(item.slotKey) === 'bottom'
                          ? 'min-h-[38px] flex-[1.86] rounded-[5px] border-2 border-success bg-tint-success-88'
                          : 'min-h-[26px] flex-1 rounded-[5px] border border-success/40 bg-tint-success-88'
                      "
                      class="flex items-center justify-center transition-all duration-fast"
                    >
                      <span
                        :class="
                          dropZoneFor(item.slotKey) === 'bottom' ? 'text-xs text-success' : 'text-2xs text-success'
                        "
                        class="leading-none font-bold break-keep transition-all duration-fast"
                      >
                        移动
                      </span>
                    </div>
                  </div>
                </Transition>

                <div class="chord-display-slot flex w-full flex-1 items-start justify-center" />
                <span
                  :class="[
                    item.char === '|' || item.char === '｜'
                      ? 'font-normal text-fg-muted'
                      : 'font-semibold text-fg-title',
                  ]"
                  class="char-text mt-auto box-border inline-flex min-h-[calc(1.15rem*var(--score-font-scale,1))] items-center justify-center px-0.5 text-[calc(var(--score-font-scale,1)*0.875rem)]/[1.15rem] whitespace-pre transition-all duration-fast group-hover:text-primary"
                >
                  {{ item.char === ' ' ? '\u00A0' : item.char }}
                </span>
              </div>
            </template>

            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlotCell
                v-for="(item, index) in lineData.endChords"
                :chord="item.chord"
                :drop-zone="dropZoneFor(item.slotKey)"
                :is-drag-active="isLineActiveDrop(lineData.lineId)"
                :key="item.slotKey"
                :left-chord-gap="isEndEdgeGap(lineData, index)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleOpenPicker(item.slotKey)"
                @copy-pointerdown="handleCopyPointerDown($event)"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                variant="edge"
              />
              <ChordSlotCell
                :drop-zone="dropZoneFor(lineData.nextEndKey)"
                :is-drag-active="isLineActiveDrop(lineData.lineId)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="lineData.nextEndKey"
                @click="handleOpenPicker(lineData.nextEndKey)"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                add-placeholder-title="点击添加行尾和弦"
                variant="add"
              />
            </div>

            <ActionButton
              :aria-hidden="hoveredLineKey !== lineData.lineId"
              :aria-label="deleteLineButtonTitle"
              :class="hoveredLineKey === lineData.lineId ? 'opacity-100' : 'opacity-0'"
              :tabindex="hoveredLineKey === lineData.lineId ? 0 : -1"
              :title="deleteLineButtonTitle"
              @pointerdown.stop
              @click.stop="deleteLine(lineData)"
              icon-only
              class="ml-auto shrink-0 self-center pl-sm text-danger transition-opacity duration-fast"
              icon="trash-2"
              icon-size="lg"
              icon-stroke="thin"
              size="lg"
              variant="subtle"
            />
          </div>

          <div aria-hidden="true" class="line-row-gutter w-6 shrink-0 max-md:w-2" />
        </div>

        <!-- 滚动扩容哨兵：紧随当前已渲染行末尾，用户滚动接近当前底部时静默追加渲染 -->
        <div
          v-if="renderedLineCount < lyricsLinesWithEdges.length"
          aria-hidden="true"
          class="pointer-events-none h-8 w-full shrink-0"
          ref="sentinelRef"
        />
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="isDragging"
        :ref="setGhostEl"
        class="pointer-events-none fixed top-0 left-0 z-top will-change-transform"
      >
        <div
          class="flex -translate-1/2 scale-105 items-center justify-center rounded-md border-[1.5px] border-primary bg-surface-panel/95 px-md py-sm shadow-floating backdrop-blur-md"
        >
          <span class="text-sm leading-none font-extrabold text-primary">
            {{ ghostChordName }}
          </span>
        </div>
      </div>
    </Teleport>

    <BaseFab
      :visible="scrollTopVisible"
      @click="scrollToTop()"
      align="end"
      aria-label="滚动到顶部"
      bottom="7rem"
      icon="chevron-up"
      right="2rem"
      tooltip="滚动到顶部"
    />
    <BaseFab
      :visible="scrollBottomVisible"
      @click="handleScrollToBottom()"
      align="end"
      aria-label="滚动到底部"
      bottom="4rem"
      icon="chevron-down"
      right="2rem"
      tooltip="滚动到底部"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseFab from '@/platform/ui/floating-bar/BaseFab.vue';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useUiStore } from '@/platform/store/uiStore';
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry.ts';
import { TOAST_WARNING_DURATION_MS } from '@/platform/utils/constants';

import ChordSlotCell from './ChordSlotCell.vue';

import type { Chord } from '@/domains/chord/types';
import type { DropZone } from '@/domains/score/editor/composables/lyrics-drag/dropZone';
import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { LineId, SlotKey } from '@/domains/score/types';

defineOptions({ name: 'ScoreInteractiveArea' });

const emit = defineEmits<{
  (e: 'open-picker', slotKey: SlotKey): void;
}>();

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const scoreZoneRef = useTemplateRef<HTMLElement>('scoreZoneRef');

/** 边缘滚动入口：顶部/底部浮动按钮。内容可滚且未贴该边时可见，点击平滑滚至对应边 */
const {
  visible: edgeVisible,
  refresh: refreshEdgeVisibility,
  scrollToTop,
  scrollToBottom,
} = useEdgeScroll(scoreZoneRef, {
  edges: ['top', 'bottom'],
});
const scrollTopVisible = computed(() => edgeVisible.top);
const scrollBottomVisible = computed(() => edgeVisible.bottom);

const hoveredLineKey = ref<string | null>(null);
/** 删除行按钮的无障碍文本与悬停提示 */
const deleteLineButtonTitle = '删除此行';

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

/** 渐进式视口渲染：初始渲染行数与单次扩容行数。超大乐谱首屏挂载仅渲染前 30 行，实现瞬间秒开 */
const INITIAL_RENDER_LINE_COUNT = 30;
const RENDER_BATCH_SIZE = 30;
const renderedLineCount = ref(INITIAL_RENDER_LINE_COUNT);

/** 当前视口渲染窗口内的歌词行：只渲染前 renderedLineCount 行，滚动到底部时静默追加渲染 */
const visibleLines = computed(() => lyricsLinesWithEdges.value.slice(0, renderedLineCount.value));

const sentinelRef = useTemplateRef<HTMLElement>('sentinelRef');
let sentinelObserver: IntersectionObserver | null = null;

const expandNextBatch = () => {
  if (renderedLineCount.value < lyricsLinesWithEdges.value.length) {
    renderedLineCount.value = Math.min(lyricsLinesWithEdges.value.length, renderedLineCount.value + RENDER_BATCH_SIZE);
  }
};

const setupSentinelObserver = () => {
  if (sentinelObserver) {
    sentinelObserver.disconnect();
    sentinelObserver = null;
  }
  if (typeof IntersectionObserver === 'undefined') return;
  const root = scoreZoneRef.value;
  const sentinel = sentinelRef.value;
  if (!root || !sentinel) return;

  sentinelObserver = new IntersectionObserver(
    entries => {
      if (entries.some(e => e.isIntersecting)) {
        expandNextBatch();
      }
    },
    {
      root,
      rootMargin: '1000px 0px',
    }
  );
  sentinelObserver.observe(sentinel);
};

watch(sentinelRef, () => {
  setupSentinelObserver();
});

/** 确保首屏已渲染的行数足以产生滚动或填满视口（高分屏或大视口下自动扩容至产生滚动条） */
const ensureSufficientRenderedLines = async () => {
  await nextTick();
  const el = scoreZoneRef.value;
  if (!el || el.clientHeight === 0) return;
  while (renderedLineCount.value < lyricsLinesWithEdges.value.length && el.scrollHeight <= el.clientHeight + 1000) {
    renderedLineCount.value = Math.min(lyricsLinesWithEdges.value.length, renderedLineCount.value + RENDER_BATCH_SIZE);
    await nextTick();
  }
  // 内容高度（scrollHeight）变化不会触发 ResizeObserver/scroll，须在此处显式重算边缘
  //（覆盖长→短乐谱切歌后 FAB 不消失、短→长后顶/底部按钮不出现等场景）
  await nextTick();
  refreshEdgeVisibility();
};

onMounted(() => {
  void ensureSufficientRenderedLines();
});

/** 快速拖拽滚动条或大幅度滚动时的兜底预加载扩容 */
const handleScroll = () => {
  const el = scoreZoneRef.value;
  if (!el || renderedLineCount.value >= lyricsLinesWithEdges.value.length) return;
  const remainingScroll = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (remainingScroll < 1500) {
    expandNextBatch();
  }
};

let isExpandingToBottom = false;
/** 「滚动到底部」扩容循环句柄：切歌/失活/卸载时取消，防止悬挂 rAF 继续扩容并干扰视口 */
let expandToBottomRafId: number | null = null;
/** 扩容 Promise 的 resolve 句柄：取消路径（切歌/失活/卸载）下也必须落定 Promise，避免 await 方永久挂起 */
let expandToBottomResolve: (() => void) | null = null;
/** 停止「滚动到底部」扩容循环（幂等），并落定未决的 Promise */
const cancelExpandToBottom = () => {
  if (expandToBottomRafId !== null) {
    cancelAnimationFrame(expandToBottomRafId);
    expandToBottomRafId = null;
  }
  isExpandingToBottom = false;
  const pendingResolve = expandToBottomResolve;
  expandToBottomResolve = null;
  pendingResolve?.();
};

/** 点击「滚动到底部」悬浮按钮：分帧流式挂载（每帧 60 行），避免一次性同步创建数万节点卡死主线程 */
const handleScrollToBottom = (): Promise<void> => {
  return new Promise(resolve => {
    const total = lyricsLinesWithEdges.value.length;
    if (renderedLineCount.value >= total) {
      scrollToBottom();
      resolve();
      return;
    }

    if (isExpandingToBottom) {
      resolve();
      return;
    }
    isExpandingToBottom = true;
    // 登记落定句柄：切歌/失活/卸载触发的 cancelExpandToBottom 会调用它，保证 Promise 必然落定
    expandToBottomResolve = resolve;

    const BATCH_PER_FRAME = 60;
    const step = () => {
      expandToBottomRafId = null;
      // 中途切歌：立即终止扩容，交由切歌 watch 重置渲染行数与视口
      if (lastRenderedSongId !== scoreEditor.activeSongId) {
        cancelExpandToBottom();
        return;
      }
      if (renderedLineCount.value < total) {
        renderedLineCount.value = Math.min(total, renderedLineCount.value + BATCH_PER_FRAME);
        scrollToBottom('auto');
        if (typeof requestAnimationFrame !== 'undefined') {
          expandToBottomRafId = requestAnimationFrame(step);
        } else {
          step();
        }
      } else {
        isExpandingToBottom = false;
        expandToBottomResolve = null;
        scrollToBottom('smooth');
        resolve();
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      expandToBottomRafId = requestAnimationFrame(step);
    } else {
      step();
    }
  });
};

/** 行号展示为两位数字（01、02…） */
const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

/** 按槽位键实时查找当前绑定的和弦 */
const getCharChord = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const chordId = song.chordMap.get(slotKey);
  if (!chordId) return null;
  return chordsLookupMap.value.get(chordId) ?? null;
};

/** 字符槽左侧（前一个字符或行首边）是否紧邻和弦，用于渲染与和弦的间距 */
const isLeftAdjacentChord = (lineData: LineData, currentIndex: number): boolean => {
  const currentSlotKey = lineData.chars[currentIndex]?.slotKey;
  if (!currentSlotKey || !getCharChord(currentSlotKey)) return false;

  if (currentIndex > 0) {
    const prevCharSlotKey = lineData.chars[currentIndex - 1]?.slotKey;
    if (prevCharSlotKey && getCharChord(prevCharSlotKey)) return true;
  } else if (lineData.startChords.length > 0) {
    return true;
  }

  return false;
};

/** 行尾边槽左侧（末字符或前一边槽）是否为和弦，用于渲染间距 */
const isEndEdgeGap = (lineData: LineData, index: number): boolean => {
  const edge = lineData.endChords[index];
  if (!edge || !edge.chord) return false;
  if (index === 0) {
    const lastChar = lineData.chars[lineData.chars.length - 1];
    return Boolean(lastChar && getCharChord(lastChar.slotKey));
  }
  return Boolean(lineData.endChords[index - 1]?.chord);
};

/** 删除歌词行：按 lineId 实时反查索引，避免 v-memo 缓存 vnode 中陈旧 lineIdx 闭包删错行 */
const deleteLine = (lineData: LineData) => {
  const song = scoreEditor.activeSong;
  if (!song) return;
  const lines = song.lyrics.split('\n');
  const lineIdx = song.lineIds.indexOf(lineData.lineId as LineId);
  if (lineIdx < 0 || lineIdx >= lines.length) return;
  lines.splice(lineIdx, 1);
  scoreEditor.updateLyrics(lines.join('\n'));
  uiStore.toast.info(`已删除第 ${lineIdx + 1} 行`, {
    actionText: '撤销',
    duration: TOAST_WARNING_DURATION_MS,
    onAction: async () => {
      await scoreEditor.undo();
      uiStore.toast.success('已恢复数据');
    },
  });
};

const {
  isDragging,
  isSuppressingClick,
  draggingSlotKey,
  dragOverSlotKey,
  activeDropLineId,
  dropZone,
  ghostChordName,
  setGhostEl,
  handlePointerDown,
} = useLyricsDragDrop(scoreZoneRef);

/** 「移动」按钮拖拽入口：源槽虚化（swap 样式）；落地动作由落点分区决定，与按钮模式无关 */
const handleCopyPointerDown = (payload: { event: PointerEvent; slotKey: string; chord: Chord }) => {
  handlePointerDown(payload);
};

/** 本槽位的落点分区；非当前落点、或该槽位是拖拽源自身时返回 null（源不可作为落点） */
const dropZoneFor = (slotKey: string) =>
  isDragging.value && dragOverSlotKey.value === slotKey && draggingSlotKey.value !== slotKey ? dropZone.value : null;

/** 落点按行归约：slotKey 前缀 line_${lineId}_ 判定本行是否含当前落点（供 v-memo 按行粒度失效） */
const lineDropTargetKey = (lineId: string): string | null =>
  isDragging.value && dragOverSlotKey.value?.startsWith(`line_${lineId}_`) ? dragOverSlotKey.value : null;
/** 本行落点分区值：仅落点行携带，其余行恒为 null 以保持 v-memo 命中 */
const lineDropZone = (lineId: string): DropZone | null =>
  isDragging.value && dragOverSlotKey.value?.startsWith(`line_${lineId}_`) ? dropZone.value : null;

// 拖拽中的分区规则提示：neutral toast 常驻不自动消失、无转圈（非后台任务），拖拽结束手动移除
let dragHintToastId: number | null = null;
watch(isDragging, dragging => {
  if (dragging) {
    dragHintToastId = uiStore.toast.neutral('拖到上半：交换 / 复制 · 下半：替换  移动', {
      closable: false,
      customClass: 'drag-hint-toast',
    });
  } else if (dragHintToastId !== null) {
    uiStore.removeToast(dragHintToastId);
    dragHintToastId = null;
  }
});

const clearDragHintToast = () => {
  if (dragHintToastId !== null) {
    uiStore.removeToast(dragHintToastId);
    dragHintToastId = null;
  }
};

let lastRenderedSongId = scoreEditor.activeSongId;
let isAreaActive = true;

onDeactivated(() => {
  isAreaActive = false;
  cancelExpandToBottom();
  clearDragHintToast();
  if (sentinelObserver) {
    sentinelObserver.disconnect();
    sentinelObserver = null;
  }
  const el = scoreZoneRef.value;
  if (el) {
    savedScroll.top = el.scrollTop;
    savedScroll.left = el.scrollLeft;
  }
});

onBeforeUnmount(() => {
  cancelExpandToBottom();
  clearDragHintToast();
  if (sentinelObserver) {
    sentinelObserver.disconnect();
    sentinelObserver = null;
  }
});

// —— 排列区滚动位置保持 ——
// 打点实证：KeepAlive 缓存本已命中（切回仅触发 onActivated、不重建），但浏览器会在元素 detach 后再
// attach 时把其 scrollTop/scrollLeft 清零。故在 deactivate 时保存偏移，activate 时显式恢复；
// 采用固定 key="interactive-area" 实例复用后，切歌（activeSongId 变化）需主动重置滚动偏移。
const savedScroll = { top: 0, left: 0 };

onActivated(async () => {
  isAreaActive = true;
  setupSentinelObserver();
  if (lastRenderedSongId !== scoreEditor.activeSongId) {
    lastRenderedSongId = scoreEditor.activeSongId;
    renderedLineCount.value = INITIAL_RENDER_LINE_COUNT;
    savedScroll.top = 0;
    savedScroll.left = 0;
    const el = scoreZoneRef.value;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }
  void ensureSufficientRenderedLines();
  const el = scoreZoneRef.value;
  if (!el || (savedScroll.top === 0 && savedScroll.left === 0)) return;
  await nextTick();
  el.scrollTo({ top: savedScroll.top, left: savedScroll.left, behavior: 'auto' });
});

// 切歌时清空保存的滚动位置，重置渐进渲染行数，并将视口滚回顶部（由于复用了固定 key 的组件实例）
watch(
  () => scoreEditor.activeSongId,
  newId => {
    if (!isAreaActive) return;
    cancelExpandToBottom();
    lastRenderedSongId = newId;
    hoveredLineKey.value = null;
    renderedLineCount.value = INITIAL_RENDER_LINE_COUNT;
    savedScroll.top = 0;
    savedScroll.left = 0;
    const el = scoreZoneRef.value;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
    void ensureSufficientRenderedLines();
  }
);

/** 用户点击槽位打开 picker：拖拽中或点击抑制期忽略，避免拖拽松手误触发 */
const handleOpenPicker = (slotKey: SlotKey) => {
  if (isDragging.value || isSuppressingClick.value) return;
  emit('open-picker', slotKey);
};

/** 本行是否为当前拖拽落点所在的行（由稳定的 activeDropLineId 驱动，跨越字符间隙时恒定为 true，绝无间距闪烁） */
const isLineActiveDrop = (lineId: string): boolean =>
  isDragging.value &&
  (activeDropLineId.value === lineId || Boolean(dragOverSlotKey.value?.startsWith(`line_${lineId}_`)));

defineExpose({ scoreZoneRef, expandNextBatch, handleScrollToBottom });
</script>

<style scoped lang="scss">
/* 视口外歌词行跳过样式计算 / 文字排版 / Canvas 绘制，零 JS 介入实现准虚拟化，
   消除长乐谱切歌时主线程同步挂载数万节点的卡顿。contain-intrinsic-size 给出离屏占位高度。 */
.line-row {
  content-visibility: auto;
  contain-intrinsic-size: 0 120px;
}

/* 拖拽期间仅当前活动落点行空字符槽/添加槽统一撑开：
   与 ChordSlotCell.vue 保持完全一致的尺寸过渡，保证落点分区有充裕高度且无外边距抖动闪烁 */
.is-drop-widened {
  box-sizing: content-box;
  min-width: 58px;
  min-height: 108px;
  transition:
    min-width 0.12s cubic-bezier(0.25, 0.1, 0.25, 1),
    min-height 0.12s cubic-bezier(0.25, 0.1, 0.25, 1);
}

/* 拖拽期间全局 body.is-global-dragging 驱动纯空行自动撑高，
   保证纯空行行首/行尾和弦有足够落点高度，无需 Vue 响应式参与，0 重排掉帧 */
:global(body.is-global-dragging) .lyrics-line.is-empty-line {
  min-height: 116px;
}
</style>
