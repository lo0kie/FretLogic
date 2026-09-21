<template>
  <BaseScrollArea
    :style="{
      '--score-font-scale': scoreEditor.effectiveFontScale / 100,
    }"
    @scroll.passive="handleScroll()"
    close-popovers
    axis="both"
    class="interactive-score-zone relative min-w-0 flex-1 py-6 pr-0 pl-xl max-md:pt-sm max-md:pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] max-md:pl-sm"
    ref="scoreZoneAreaRef"
  >
    <div class="contents">
      <Feedback
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
            // 行级和弦绑定签名（见 lineChordSignatures）：本行任一槽位绑定变化 ⇒ 签名变 ⇒ 该行
            // memo 失效并重渲染（getCharChord 实时读新 chordMap，不残留旧和弦）；
            // 别的行变更时本行签名不变，memo 命中——不再因整表引用变化而全表失效
            lineChordSignatures.get(lineData.lineId),
            hoveredLineKey === lineData.lineId,
            // 全局拖拽态：抑制各行和弦上的悬停删除钮（拖拽经过和弦时不得弹出按钮），
            // 仅在拖拽起止各失效一次，不参与逐帧更新
            isDragging,
            // 拖拽落点严格按行归约：仅当前悬停行触发撑开与落点边框，
            // 其余行全程命中 memo 缓存，绝不触发全量重排掉帧
            isLineActiveDrop(lineData.lineId),
            isLineActiveDrop(lineData.lineId) ? lineDropTargetKey(lineData.lineId) : null,
          ]"
          :key="lineData.lineId"
          class="line-row flex w-max min-w-full items-stretch"
        >
          <div
            :class="{ 'is-empty-line': lineData.chars.length === 0 }"
            :data-line-index="lineData.lineId"
            @mouseenter="hoveredLineKey = lineData.lineId"
            @mouseleave="hoveredLineKey = null"
            class="lyrics-line relative flex w-max min-w-0 flex-[1_1_auto] flex-nowrap items-stretch gap-0 rounded-md border border-transparent px-sm py-xs transition-all duration-base select-none focus-within:border-border-base focus-within:bg-surface-panel-hover hover:border-border-base hover:bg-surface-panel-hover"
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
                :is-active-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drag-active="isDragging"
                :is-drop-target="isSlotDropTarget(lineData.nextStartKey)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="lineData.nextStartKey"
                @click="handleTogglePicker()"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                add-placeholder-title="点击添加行首和弦"
                variant="add"
              />
              <ChordSlotCell
                v-for="item in lineData.startChords"
                :chord="item.chord"
                :is-active-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drag-active="isDragging"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :key="item.slotKey"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleTogglePicker()"
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
                :is-active-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drag-active="isDragging"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :key="item.slotKey"
                :left-chord-gap="isLeftAdjacentChord(lineData, index)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleTogglePicker()"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                variant="char"
              />

              <!-- 瘦槽位：未分配和弦的普通字符槽位，直接以高性能原生 DOM 渲染（带完整交互能力与统一视觉样式） -->
              <div
                v-action-card
                v-else
                v-wave="{}"
                :aria-label="`字符 ${item.char === ' ' ? '空格' : item.char}，未分配和弦，按 Enter 开关和弦面板`"
                :class="[
                  'char-box group relative flex cursor-pointer [touch-action:pan-x_pan-y] flex-col items-center justify-start self-stretch rounded-sm p-0.5 px-0.5 transition-all duration-fast outline-none hover:bg-tint-primary-88',
                  { 'is-drop-widened': isLineActiveDrop(lineData.lineId) },
                ]"
                :data-slot-key="item.slotKey"
                @click="handleTogglePicker()"
                data-focusable-outline
                title="点击开关和弦面板"
              >
                <!-- 瘦槽位作为落点时的轻量绝对定位提示层：只给一圈主题色边框、不铺底色、不遮挡字符。
                     过渡改由本元素自身的类切换承担（原外层 <Transition> 每槽位会多实例化 Transition +
                     BaseTransition 两个组件，纯装饰性提示不值得付组件开销；原 enter/leave 的 scale
                     两端都是 100，实际只有 opacity 在变，故 transition-property 收敛为 opacity,visibility） -->
                <div
                  :class="isSlotDropTarget(item.slotKey) ? 'visible opacity-100' : 'invisible opacity-0'"
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-[2px] z-3 rounded-[5px] border-2 border-primary transition-[opacity,visibility] duration-fast"
                />

                <div class="chord-display-slot flex w-full flex-1 items-start justify-center" />
                <span
                  :class="[
                    item.char === '|' || item.char === '｜'
                      ? 'font-normal text-fg-muted'
                      : 'font-semibold text-fg-title',
                  ]"
                  class="char-text mt-auto inline-flex min-h-[calc(1.15rem*var(--score-font-scale,1))] items-center justify-center px-0.5 text-[calc(var(--score-font-scale,1)*0.875rem)]/[1.15rem] whitespace-pre transition-all duration-fast group-hover:text-primary"
                >
                  {{ item.char === ' ' ? '\u00A0' : item.char }}
                </span>
              </div>
            </template>

            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlotCell
                v-for="(item, index) in lineData.endChords"
                :chord="item.chord"
                :is-active-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drag-active="isDragging"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :key="item.slotKey"
                :left-chord-gap="isEndEdgeGap(lineData, index)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="item.slotKey"
                @click="handleTogglePicker()"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                variant="edge"
              />
              <ChordSlotCell
                :is-active-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drag-active="isDragging"
                :is-drop-target="isSlotDropTarget(lineData.nextEndKey)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :scroll-root="scoreZoneRef"
                :slot-key="lineData.nextEndKey"
                @click="handleTogglePicker()"
                @pointerdown="handlePointerDown($event)"
                @remove="scoreEditor.removeSlotChord($event)"
                add-placeholder-title="点击添加行尾和弦"
                variant="add"
              />
            </div>

            <ActionButton
              :aria-label="deleteLineButtonTitle"
              :class="hoveredLineKey === lineData.lineId ? 'opacity-100' : 'opacity-0 focus:opacity-100'"
              :tabindex="0"
              :title="deleteLineButtonTitle"
              @pointerdown.stop
              @click.stop="deleteLine(lineData)"
              data-focusable-outline
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

    <!-- 和弦选择面板（chord 域装配，外壳为 platform/ui 的 BaseFloatingPanel）：贴右侧、非模态，
         面板只作拖动来源，把卡片拖到字符槽即完成绑定；开关由点击字符槽切换；
         面板与视口上/右/下三条留白由外壳的 intercept 能力接管指针事件。
         context-key 传当前乐谱 id：换歌时清空面板的选择记忆（面板不读本域 store，保持与宿主解耦） -->
    <ChordPickerPanel
      v-model:visible="isPickerPanelOpen"
      :is-dragging
      :context-key="scoreEditor.activeSongId"
      :drag-chord-starter="startExternalChordDrag"
    />
  </BaseScrollArea>
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

import ChordPickerPanel from '@/domains/chord/components/ChordPickerPanel.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseFab from '@/platform/ui/floating-bar/BaseFab.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { charKey, chordSlotKey, lineCharChord, parseSlotKey } from '@/domains/score/model/scoreModel';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useUiStore } from '@/platform/store/uiStore';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';

import ChordSlotCell from './ChordSlotCell.vue';

import type { Chord } from '@/domains/chord/types';
import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { LineId, SlotKey } from '@/domains/score/types';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';

defineOptions({ name: 'ScoreInteractiveArea' });

const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

const scoreZoneAreaRef = useTemplateRef<ScrollAreaHandle>('scoreZoneAreaRef');
/** 谱面滚动容器元素（虚拟化预加载 / 拖拽自动滚动 / 边缘滚动入口 / 滚动位置存档都需要元素本身） */
const scoreZoneRef = useScrollAreaElement(scoreZoneAreaRef);

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
/** 选器和弦浮动面板开关（非模态：不占布局、不作遮罩，支持拖拽和弦到字符槽） */
const isPickerPanelOpen = ref(false);
/** 删除行按钮的无障碍文本与悬停提示 */
const deleteLineButtonTitle = '删除此行';

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

/**
 * 行级和弦绑定签名（v-memo 行级派生量）：lineId → 该行全部槽位绑定 `key=id;` 的排序串。
 *
 * v-memo 此前直接依赖 `activeSong.chordMap` 引用——任何一处绑定变更（哪怕别的行）都会换新
 * Map，让**所有**已渲染行的 memo 全部失效、逐行重跑 getCharChord。改为行级签名后：
 * - 绑定变更时本 computed O(绑定数) 重建一次；
 * - 每行 memo 只比较自己的签名字符串（引用相等即命中），未受影响行全部缓存命中。
 * 行内 getCharChord 仍实时读取 chordMap（渲染期取值），满足「删依赖会显示陈旧和弦」的约束——
 * 签名保证「本行任一绑定变化 ⇒ 该行 memo 失效 ⇒ 重渲染时读到新值」。
 */
const lineChordSignatures = computed(() => {
  const map = scoreEditor.activeSong?.chordMap;
  const sigs = new Map<string, string>();
  if (!map) return sigs;
  const perLine = new Map<string, string[]>();
  const pushToken = (lineId: string, token: string) => {
    const list = perLine.get(lineId);
    if (list) list.push(token);
    else perLine.set(lineId, [token]);
  };
  for (const [lineId, slots] of map) {
    // v7 嵌套结构：chordMap 为 Map<LineId, ChordLineSlots>，char 是 Map<index, chordId>，
    // start/end 是 chordId[]。原实现误把 lineId 当 slotKey 解构，parseSlotKey 恒 null，
    // 导致签名永远为空、v-memo 永不失效、绑定改动不刷新（P0 审计 #3）。
    for (const [index, chordId] of slots.char) {
      if (!chordId) continue;
      pushToken(lineId, `${charKey(lineId, index)}=${chordId};`);
    }
    slots.start.forEach((chordId, index) => {
      if (chordId) pushToken(lineId, `${chordSlotKey(lineId, 'start', index)}=${chordId};`);
    });
    slots.end.forEach((chordId, index) => {
      if (chordId) pushToken(lineId, `${chordSlotKey(lineId, 'end', index)}=${chordId};`);
    });
  }
  for (const [lineId, entries] of perLine) sigs.set(lineId, entries.sort().join(''));

  return sigs;
});

// —— 渐进式视口渲染参数 ——
// 实测：超大乐谱首屏一次性同步挂载固定 30 行时，单个长任务内要创建数百个字符槽 + 数十个指板画布，
// 主线程被占满约 350ms。故改为「同步挂载最小行数 → 按实测行高补齐到填满视口 → 其余交给滚动哨兵按需扩容」
// 三段式：首帧只承担最小行数的挂载成本，后续行全部落在后续帧/后续交互里。
/** 首屏同步挂载的最小行数：只保证首帧一定有内容，不追求填满视口（补齐由 ensureSufficientRenderedLines 完成） */
const MIN_INITIAL_RENDER_LINE_COUNT = 8;
/** 单次扩容行数：取小批量以摊平滚动中的单帧挂载成本（大批量会在滚动时制造长任务） */
const RENDER_BATCH_SIZE = 10;
/** 视口之外额外预渲染的像素高度：首屏补齐目标，也是滚动预加载的基准窗口 */
const VIEWPORT_PRELOAD_PX = 400;
/** 滚动哨兵提前触发距离：必须小于 VIEWPORT_PRELOAD_PX，否则首屏挂载后哨兵立刻命中、白白多扩容一批 */
const SENTINEL_ROOT_MARGIN_PX = 200;
/** 滚动兜底扩容阈值：剩余可滚动距离小于该值时立即扩容。故意大于预加载窗口，用于快速拖拽滚动条时不露白 */
const SCROLL_PRELOAD_THRESHOLD_PX = 800;

const renderedLineCount = ref(MIN_INITIAL_RENDER_LINE_COUNT);

/** 实测单行高度（含行间距）：取首个已渲染行的布局高度。
 *  行高随字号/和弦行/视口宽度变化，用固定像素估算会在高分屏或大视口下算少行数而露出空白，故实测。 */
const measureLineRowHeight = (el: HTMLElement): number => {
  const firstRow = el.querySelector<HTMLElement>('.line-row');
  const height = firstRow?.getBoundingClientRect().height ?? 0;
  return height > 0 ? height : 0;
};

/** 当前视口渲染窗口内的歌词行：只渲染前 renderedLineCount 行，滚动接近当前底部时静默追加渲染 */
const visibleLines = computed(() => lyricsLinesWithEdges.value.slice(0, renderedLineCount.value));

const sentinelRef = useTemplateRef<HTMLElement>('sentinelRef');
let sentinelObserver: IntersectionObserver | null = null;

/** 视口渲染扩容：扩容哨兵可见时追加渲染行数 */
const expandNextBatch = () => {
  if (renderedLineCount.value < lyricsLinesWithEdges.value.length)
    renderedLineCount.value = Math.min(lyricsLinesWithEdges.value.length, renderedLineCount.value + RENDER_BATCH_SIZE);
};

/** 建立/重建 IntersectionObserver：观察扩容哨兵，接近底部时静默扩容 */
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
      if (entries.some(e => e.isIntersecting)) expandNextBatch();
    },
    {
      root,
      rootMargin: `${SENTINEL_ROOT_MARGIN_PX}px 0px`,
    }
  );
  sentinelObserver.observe(sentinel);
};

watch(sentinelRef, () => {
  setupSentinelObserver();
});

/** 同一首歌内编辑歌词导致行数缩减时钳制渲染窗口：
 *  renderedLineCount 只在切歌时重置（onActivated / activeSongId watch），歌内删行后窗口
 *  会大于实际行数（slice 天然安全，但「扩容进度」被白保留）。主动收缩窗口（滚完即减）
 *  需要配合滚动锚定，否则内容高度变化会让滚动条跳动——那属体验决策，未实施。 */
watch(
  () => lyricsLinesWithEdges.value.length,
  total => {
    if (renderedLineCount.value > total) renderedLineCount.value = total;
  }
);

/** 确保首屏已渲染的行数足以填满视口（高分屏或大视口下自动补齐），并在不足时按批兜底扩容 */
const ensureSufficientRenderedLines = async () => {
  await nextTick();
  const el = scoreZoneRef.value;
  if (!el || el.clientHeight === 0) return;
  // 按实测行高把渲染窗口补齐到「视口 + 预加载」，避免为填满视口而多挂载一整批行
  const rowHeight = measureLineRowHeight(el);
  if (rowHeight > 0) {
    const needed = Math.ceil((el.clientHeight + VIEWPORT_PRELOAD_PX) / rowHeight);
    if (needed > renderedLineCount.value) renderedLineCount.value = Math.min(lyricsLinesWithEdges.value.length, needed);
    await nextTick();
  }
  // 兜底：行高估算偏低（超矮行 / 极端窄视口）时继续按批扩容，直到内容真的能滚动
  while (renderedLineCount.value < lyricsLinesWithEdges.value.length && el.scrollHeight <= el.clientHeight) {
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
  if (remainingScroll < SCROLL_PRELOAD_THRESHOLD_PX) expandNextBatch();
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
const handleScrollToBottom = (): Promise<void> =>
  new Promise(resolve => {
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
        expandToBottomRafId = requestAnimationFrame(step);
      } else {
        isExpandingToBottom = false;
        expandToBottomResolve = null;
        scrollToBottom('smooth');
        resolve();
      }
    };

    expandToBottomRafId = requestAnimationFrame(step);
  });

/** 行号展示为两位数字（01、02…） */
const formatLineIndex = (index: number) => String(index + 1).padStart(2, '0');

/** 按槽位键实时查找当前绑定的和弦 */
const getCharChord = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const parsed = parseSlotKey(slotKey);
  if (!parsed || parsed.type !== 'char') return null;
  const chordId = lineCharChord(song.chordMap, parsed.lineId, parsed.index);
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
  } else if (lineData.startChords.length > 0) return true;

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
  // 通知而非常驻 Message：撤销入口随 toast 飘走就没了，用户必须能回看并补做
  uiStore.notice.info({
    title: `已删除第 ${lineIdx + 1} 行`,
    actionText: '撤销',
    onAction: async () => {
      const restored = await scoreEditor.undo();
      // 撤销栈空（historyIndex 已到初始快照）时 undo 是空操作，不能再谎报「已恢复数据」
      if (restored) uiStore.message.success('已恢复数据');
      else uiStore.message.info('没有可撤销的操作');
    },
  });
};

const {
  isDragging,
  isSuppressingClick,
  draggingSlotKey,
  dragOverSlotKey,
  activeDropLineId,
  ghostChordName,
  setGhostEl,
  handlePointerDown,
  startExternalChordDrag,
} = useLyricsDragDrop(scoreZoneRef);

/** 本槽位是否为当前拖拽落点（决定是否渲染落点边框提示）；
 *  拖拽经过任意槽位（含外部拖拽源、无源槽位）都给提示，唯独拖拽源自身除外 */
const isSlotDropTarget = (slotKey: string): boolean =>
  isDragging.value && dragOverSlotKey.value === slotKey && draggingSlotKey.value !== slotKey;

/** 落点按行归约：slotKey 前缀 line_${lineId}_ 判定本行是否含当前落点（供 v-memo 按行粒度失效） */
const lineDropTargetKey = (lineId: string): string | null =>
  isDragging.value && dragOverSlotKey.value?.startsWith(`line_${lineId}_`) ? dragOverSlotKey.value : null;

// 拖拽中的落地规则提示：neutral message 常驻不自动消失、无转圈（非后台任务），拖拽结束手动移除
let dragHintMessageId: number | null = null;
watch(isDragging, dragging => {
  if (dragging)
    dragHintMessageId = uiStore.message.neutral('拖到空槽：移动  拖到和弦：替换', {
      closable: false,
      customClass: 'drag-hint-toast',
    });
  else if (dragHintMessageId !== null) {
    uiStore.removeMessage(dragHintMessageId);
    dragHintMessageId = null;
  }
});

const clearDragHintMessage = () => {
  if (dragHintMessageId !== null) {
    uiStore.removeMessage(dragHintMessageId);
    dragHintMessageId = null;
  }
};

let lastRenderedSongId = scoreEditor.activeSongId;
let isAreaActive = true;

onDeactivated(() => {
  isAreaActive = false;
  // 离开本区（切路由 / 切页签被 KeepAlive 缓存）时收起选器和弦面板：
  // 面板与其中的编辑抽屉都 Teleport 到 body，而渲染器对 Teleport 一律按 REORDER 搬移
  // （只挪锚点、不动已被传送的内容），宿主停用时它们不会随组件树一起摘除，
  // 结果就是切到别的页面后浮层仍挂在 body 上继续显示。故此处主动闭合成关闭态。
  isPickerPanelOpen.value = false;
  cancelExpandToBottom();
  clearDragHintMessage();
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
  clearDragHintMessage();
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
    renderedLineCount.value = MIN_INITIAL_RENDER_LINE_COUNT;
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
    renderedLineCount.value = MIN_INITIAL_RENDER_LINE_COUNT;
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

/** 用户点击字符槽：切换选器和弦浮动面板的开关（面板只作拖动来源，不再关心是哪个槽）；
 *  拖拽中或点击抑制期忽略，避免拖拽松手误触发 */
const handleTogglePicker = () => {
  if (isDragging.value || isSuppressingClick.value) return;
  isPickerPanelOpen.value = !isPickerPanelOpen.value;
};

/** 本行是否为当前拖拽落点所在的行（由稳定的 activeDropLineId 驱动，跨越字符间隙时恒定为 true，绝无间距闪烁） */
const isLineActiveDrop = (lineId: string): boolean =>
  isDragging.value &&
  (activeDropLineId.value === lineId ||
    (dragOverSlotKey.value !== null && parseSlotKey(dragOverSlotKey.value)?.lineId === lineId));

defineExpose({ scoreZoneRef, expandNextBatch, handleScrollToBottom });
</script>

<style scoped lang="scss">
/* 视口外歌词行跳过样式计算 / 文字排版 / Canvas 绘制，零 JS 介入实现准虚拟化，
   消除长乐谱切歌时主线程同步挂载数万节点的卡顿。contain-intrinsic-size 给出离屏占位高度。 */
.line-row {
  content-visibility: auto;
  /* auto 前缀：记住该行上次渲染的实际尺寸，离屏占位不再退回 0×120 兜底值，
     避免 KeepAlive 重挂载/滚动到行时的二次布局跳动（宽度按真实内容算，滚动条不闪跳） */
  contain-intrinsic-size: auto 120px;
}

/* 歌词行显式声明过渡（覆盖 transition-all 对 min-height/min-width 的不确定性），
   空行随 body.is-global-dragging 撑到 116px、以及松手后回落的高度，都必须平滑过渡。
   关键：基类 min-height 显式归零为 0（数字），让 116px↔0 是「长度↔长度」可插值；
   若落到默认 auto，auto 无法插值，空行撑开/收起会瞬间跳变。 */
.lyrics-line {
  min-height: 0;
  transition: all 0.18s cubic-bezier(0.25, 0.1, 0.25, 1);
}

/* 字符盒 min-* 基线显式归零：min-width/min-height 初始值为 auto，
   auto 与长度之间无法插值（过渡按离散翻转，表现为瞬间跳变）；
   归零后 .is-drop-widened 的 0.12s 撑开过渡才能真实生效（收拢回落到本基线同样平滑） */
.char-box {
  min-width: 0;
  min-height: 0;
  /* 关键：min-width/min-height 过渡必须落在基类上——松开拖拽时 .is-drop-widened 被摘除，
     过渡若只写在状态类里会在同一帧随类一起消失，导致收拢瞬间跳回原宽而无过渡。
     box-sizing 恒定 content-box，避免收拢时宽度口径翻转造成离散跳变（撑开/收拢始终平滑）。 */
  box-sizing: content-box;
  transition: all 0.12s cubic-bezier(0.25, 0.1, 0.25, 1);
}

/* 拖拽期间仅当前活动落点行空字符槽/添加槽统一撑开：尺寸走基类的 all 过渡，撑开与收拢双向往返均平滑 */
.is-drop-widened {
  min-width: 58px;
  min-height: 108px;
}

/* 拖拽期间全局 body.is-global-dragging 驱动纯空行自动撑高，
   保证纯空行行首/行尾和弦有足够落点高度，无需 Vue 响应式参与，0 重排掉帧 */
:global(body.is-global-dragging) .lyrics-line.is-empty-line {
  min-height: 116px;
}
</style>
