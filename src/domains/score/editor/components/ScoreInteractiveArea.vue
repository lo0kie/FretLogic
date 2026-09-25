<template>
  <BaseScrollArea
    :style="{
      '--score-font-scale': scoreEditor.effectiveFontScale / 100,
      '--score-line-height-chord': lineRowHeights.chord > 0 ? `${lineRowHeights.chord}px` : undefined,
      '--score-line-height-plain': lineRowHeights.plain > 0 ? `${lineRowHeights.plain}px` : undefined,
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
      <!-- 槽位事件委托：一行就有二十多个槽、长谱面可达千级，逐槽挂 click / pointerdown / Delete
           等于上千份监听器与闭包；改在本容器上按 `[data-slot-key]` 寻址分发（该属性挂在每个槽的
           根元素上——和弦槽与添加槽经 SlotShell、瘦槽位由下面模板直接内联，拖拽系统同样按它寻址，
           故它本身就是寻址契约）。
           焦点进出仍留在槽内：它只在焦点真正进出时才触发，没有委托的收益；且它的唯一消费方是
           添加槽「焦点转交给 + 按钮」这条协议，属槽自己的事。
           键盘只挂 delete：Vue 的该修饰符同时匹配 Backspace 与 Delete（原先槽壳上两行绑定会让
           Backspace 触发两次删除，虽幂等但属冗余）。 -->
      <div
        v-else
        @click="handleDelegatedClick($event)"
        @keydown.delete="handleDelegatedDelete($event)"
        @pointerdown="handleDelegatedPointerDown($event)"
        class="mx-auto flex w-max max-w-[900px] min-w-full flex-col gap-xs"
      >
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
            // 行形态（有没有指板图卡）决定离屏占位高度取哪一档（见 .line-row 的 is-chord-row）。
            // 它与上面的行级签名同源 —— 都由本行的和弦绑定决定，故这里不会带来额外的失效，
            // 写出来只是让「占位高度」这个消费方在依赖表里有名有姓。
            lineHasChord(lineData.lineId),
            hoveredLineKey === lineData.lineId,
            // 这里此前还挂过 isDragging（用来抑制各行和弦上的悬停删除钮）。该抑制已改由
            // body.is-global-dragging 的 CSS 承担、字形 hover 染色的拖拽抑制也一并 CSS 化，
            // 这条链路上已没有任何 prop 吃它，依赖随之摘掉——它是全行共享的，留着就等于
            // 「起拖/松手各让所有已渲染行重渲一次」（每行二十多个槽，字形类名全改）。
            // 拖拽落点严格按行归约：仅当前悬停行触发撑开与落点边框，
            // 其余行全程命中 memo 缓存，绝不触发全量重排掉帧
            isLineActiveDrop(lineData.lineId),
            isLineActiveDrop(lineData.lineId) ? lineDropTargetKey(lineData.lineId) : null,
            // 面板目标高亮同样按行归约：只有「目标所在行」的 dep 会从 null 变成具体槽位键，
            // 其余行恒为 null 继续命中缓存。此前这里漏了它——面板关闭时 pickerTargetSlotKey 已归 null，
            // 但本行 memo 因依赖未变而命中，is-picker-target 的虚线框要等鼠标移出本行
            // （hoveredLineKey 在依赖里）触发重渲染才消失。
            linePickerTargetKey(lineData.lineId),
            // 尾部窗口的「空档」由本行承载（见 gapMarginOf）：这一条对绝大多数行恒为 undefined，
            // 故空档缩短时只有承载行与新承载行两行失效，其余行照旧命中缓存。
            gapMarginOf(lineData.lineIdx),
          ]"
          :class="{ 'is-chord-row': lineHasChord(lineData.lineId) }"
          :key="lineData.lineId"
          :style="{ marginTop: gapMarginOf(lineData.lineIdx) }"
          class="line-row flex w-max min-w-full items-stretch"
        >
          <div
            :class="{ 'is-empty-line': lineData.chars.length === 0 }"
            :data-line-index="lineData.lineId"
            @mouseenter="hoveredLineKey = lineData.lineId"
            @mouseleave="hoveredLineKey = null"
            class="lyrics-line relative flex min-h-0 w-max min-w-0 flex-[1_1_auto] flex-nowrap items-stretch gap-0 rounded-md border border-transparent px-sm py-xs transition-all duration-base ease-standard select-none focus-within:border-border-base focus-within:bg-surface-panel-hover hover:border-border-base hover:bg-surface-panel-hover"
          >
            <!-- 行号承担长谱面的扫读定位（「第几行」），不是装饰性文本，故用次级文字色 muted
                 而非禁用色 disabled：后者语义是「不可用/失效」，且暗色下比重明显偏轻，
                 谱面一长，数行号反而更费眼 -->
            <div class="mr-2 flex shrink-0 items-end pb-0.5 select-none">
              <span class="rounded-lg font-mono text-2xs font-bold text-fg-muted transition-colors duration-fast">
                {{ formatLineIndex(lineData.lineIdx) }}
              </span>
            </div>
            <div class="flex shrink-0 items-stretch gap-0">
              <AddSlot
                :is-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drop-target="isSlotDropTarget(lineData.nextStartKey)"
                :is-picker-target="isPickerTarget(lineData.nextStartKey)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :slot-key="lineData.nextStartKey"
                add-placeholder-title="点击添加行首和弦"
              />

              <ChordSlot
                v-for="item in lineData.startChords"
                :chord="item.chord"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :is-picker-target="isPickerTarget(item.slotKey)"
                :key="item.slotKey"
                :slot-key="item.slotKey"
                @remove="scoreEditor.removeSlotChord($event)"
              />
            </div>

            <template v-for="(item, index) in lineData.chars" :key="item.slotKey">
              <!-- 胖槽位：已分配和弦的槽位，实例化全功能 ChordSlot 组件 -->
              <ChordSlot
                v-if="getCharChord(item.slotKey)"
                :char="item.char"
                :chord="getCharChord(item.slotKey) ?? undefined"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :is-picker-target="isPickerTarget(item.slotKey)"
                :key="item.slotKey"
                :left-chord-gap="isLeftAdjacentChord(lineData, index)"
                :slot-key="item.slotKey"
                @remove="scoreEditor.removeSlotChord($event)"
              />

              <!-- 瘦槽位：未分配和弦的普通字符槽位。**内联而不挂组件** —— 它是谱面里数量占绝对
                   多数的一类（一行二十来个字符就是二十来个槽，长谱面可达数千个），此前每个都挂
                   SlotShell + SlotGlyph 两个实例，是单行挂载成本的大头。
                   类串与状态判据全部取自 slotStyles（与 SlotShell / SlotGlyph 同一份），故改槽的
                   留白 / 状态视觉仍只改那一处；骨架与 SlotShell 同形，只少一层内容层 —— 瘦槽位没有
                   内容，那一层在 SlotShell 里是个空 div，字形靠自身的 mt-auto 贴底。
                   这里不需要任何监听器：点击 / 按下 / Delete 已由行列表容器委托，hover 与拖拽抑制
                   已 CSS 化，而 focusin / focusout 只有添加槽用得上（焦点转交给「+」按钮）。 -->
              <div
                v-action-card
                v-else
                v-wave="{}"
                :aria-label="`字符 ${item.char === ' ' ? '空格' : item.char}，未分配和弦，按 Enter 打开和弦面板`"
                :class="[
                  SLOT_SHELL_CLASS,
                  slotShellStateClass({
                    isDropLine: isLineActiveDrop(lineData.lineId),
                    isPickerTarget: isPickerTarget(item.slotKey),
                  }),
                ]"
                :data-slot-key="item.slotKey"
                :title="openPickerSlotTitle"
                data-focusable-outline
              >
                <div
                  :class="[SLOT_DROP_LAYER_CLASS, slotDropLayerStateClass(isSlotDropTarget(item.slotKey))]"
                  aria-hidden="true"
                />
                <span :class="[SLOT_GLYPH_CLASS, slotGlyphColorClass(item.char)]">{{ slotGlyphText(item.char) }}</span>
              </div>
            </template>

            <div class="flex shrink-0 items-stretch gap-0">
              <ChordSlot
                v-for="(item, index) in lineData.endChords"
                :chord="item.chord"
                :is-drop-target="isSlotDropTarget(item.slotKey)"
                :is-picker-target="isPickerTarget(item.slotKey)"
                :key="item.slotKey"
                :left-chord-gap="isEndEdgeGap(lineData, index)"
                :slot-key="item.slotKey"
                @remove="scoreEditor.removeSlotChord($event)"
              />

              <AddSlot
                :is-drop-line="isLineActiveDrop(lineData.lineId)"
                :is-drop-target="isSlotDropTarget(lineData.nextEndKey)"
                :is-picker-target="isPickerTarget(lineData.nextEndKey)"
                :line-hovered="hoveredLineKey === lineData.lineId"
                :slot-key="lineData.nextEndKey"
                add-placeholder-title="点击添加行尾和弦"
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

        <!-- 滚动扩容哨兵：紧随当前已渲染行末尾，用户滚动接近当前底部时静默追加渲染。
             空档存在时不挂（hasGap）：尾部已含真实末尾、视口窗口更是悬在谱面中间，
             哨兵的位置与「前缀的末尾」不再对应，命中它只会把前缀挂到不需要的位置上 -->
        <div
          v-if="!hasGap && renderedLineCount < lyricsLinesWithEdges.length"
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
          class="flex -translate-1/2 scale-105 items-center justify-center rounded-md border-[1.5px] border-primary bg-surface-panel px-md py-sm shadow-floating"
        >
          <span class="text-sm leading-none font-extrabold text-primary">
            {{ ghostChordName }}
          </span>
        </div>
      </div>
    </Teleport>

    <BaseFab
      :hidden="!scrollTopVisible"
      @click="scrollToTop()"
      align="end"
      aria-label="滚动到顶部"
      bottom="7rem"
      icon="chevron-up"
      right="2rem"
      tooltip="滚动到顶部"
    />
    <BaseFab
      :hidden="!scrollBottomVisible"
      @click="handleScrollToBottom()"
      align="end"
      aria-label="滚动到底部"
      bottom="4rem"
      icon="chevron-down"
      right="2rem"
      tooltip="滚动到底部"
    />

    <!-- 和弦选择面板（chord 域装配，外壳为 platform/ui 的 BaseFloatingPanel）：贴右侧、非模态，
         面板只作拖动来源，把卡片拖到字符槽即完成绑定；面板由点击字符槽开启、
         关闭靠外壳本身的关闭按钮 / Escape 手动完成；
         面板与视口上/右/下三条留白由外壳的 intercept 能力接管指针事件。
         context-key 传当前乐谱 id：换歌时清空面板的选择记忆（面板不读本域 store，保持与宿主解耦） -->
    <ChordPickerPanel
      v-model:visible="isPickerPanelOpen"
      :is-dragging
      :context-key="scoreEditor.activeSongId"
      :drag-chord-starter="startExternalChordDrag"
      @select="handlePickerSelect($event)"
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
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import { useLyricsDragDrop } from '@/domains/score/editor/composables/useLyricsDragDrop';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { charKey, chordSlotKey, lineCharChord, lineSlots, parseSlotKey } from '@/domains/score/model/scoreModel';
import { useEdgeScroll } from '@/platform/composables/useEdgeScroll';
import { useUiStore } from '@/platform/store/uiStore';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';

import AddSlot from './slot/AddSlot.vue';
import ChordSlot from './slot/ChordSlot.vue';
import {
  SLOT_DROP_LAYER_CLASS,
  SLOT_GLYPH_CLASS,
  SLOT_SHELL_CLASS,
  slotDropLayerStateClass,
  slotGlyphColorClass,
  slotGlyphText,
  slotShellStateClass,
} from './slot/slotStyles';

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
/**
 * 「滚动到底部」的滚动动画是否进行中。声明在**全部消费方之前**：扩容哨兵与滚动兜底
 * （expandNextBatch / handleScroll）都排在会话逻辑之前，却都要按它让路 —— 动画期间补挂会改内容高度、
 * 把动画目标挪走。用普通变量而非 ref：它只在循环内部被读写，不驱动任何渲染。
 */
let isExpandingToBottom = false;

const scrollTopVisible = computed(() => edgeVisible.top);
const scrollBottomVisible = computed(() => edgeVisible.bottom);

const hoveredLineKey = ref<string | null>(null);
/** 选器和弦浮动面板开关（非模态：不占布局、不作遮罩，支持拖拽和弦到字符槽） */
const isPickerPanelOpen = ref(false);
/** 删除行按钮的无障碍文本与悬停提示 */
const deleteLineButtonTitle = '删除此行';
/** 瘦槽位（未绑和弦的普通字符）的原生悬停提示；有和弦的槽由 ChordSlot 自己按「能不能拖」给两档 */
const openPickerSlotTitle = '点击打开和弦面板';

const { lyricsLinesWithEdges, chordsLookupMap } = useScoreLinesData();

/**
 * 行级和弦绑定签名（v-memo 行级派生量）：lineId → 该行全部槽位绑定 `key=指纹:横按;` 的排序串。
 *
 * v-memo 此前直接依赖 `activeSong.chordMap` 引用——任何一处绑定变更（哪怕别的行）都会换新
 * Map，让**所有**已渲染行的 memo 全部失效、逐行重跑 getCharChord。改为行级签名后：
 * - 绑定变更时本 computed O(绑定数) 重建一次；
 * - 每行 memo 只比较自己的签名字符串（引用相等即命中），未受影响行全部缓存命中。
 * 行内 getCharChord 仍实时读取 chordMap（渲染期取值），满足「删依赖会显示陈旧和弦」的约束——
 * 签名保证「本行任一绑定变化 ⇒ 该行 memo 失效 ⇒ 重渲染时读到新值」。
 *
 * **签名必须含和弦内容（指纹 + 横按），不能只有 id。** chordMap 存的是 id，而「改和弦库里的和弦
 * 内容」（改名 / 改指法 / 改横按）既不会让 chordMap 换引用，也不会让字符槽那侧的 `lineData.chars`
 * 换引用（chars 只按行文本缓存，与和弦无关；行首 / 行尾边和弦走的是另一条**已含内容**的缓存，
 * 见 scoreExportCanvas 的 prevEdgeChordsCache 签名）。只写 id 时，绑在字符槽上的和弦被编辑后
 * 全部 v-memo 依赖都原样命中 ⇒ 该行不重渲染 ⇒ 槽位上的和弦名停在旧内容上。
 * 口径与渲染侧对齐：scoreExportCanvas 的签名、scoreLineFingerprints 都是「指纹 + 横按」。
 */
const lineChordSignatures = computed(() => {
  const map = scoreEditor.activeSong?.chordMap;
  const sigs = new Map<string, string>();
  if (!map) return sigs;
  /** 单个和弦引用的签名；查不到时以 `?<id>` 占位（与渲染侧同一兜底口径，不静默当「没有和弦」） */
  const chordSignature = (chordId: string): string => {
    const chord = chordsLookupMap.value.get(chordId);
    return chord ? `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres)}` : `?${chordId}`;
  };
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
      pushToken(lineId, `${charKey(lineId, index)}=${chordSignature(chordId)};`);
    }
    slots.start.forEach((chordId, index) => {
      if (chordId) pushToken(lineId, `${chordSlotKey(lineId, 'start', index)}=${chordSignature(chordId)};`);
    });
    slots.end.forEach((chordId, index) => {
      if (chordId) pushToken(lineId, `${chordSlotKey(lineId, 'end', index)}=${chordSignature(chordId)};`);
    });
  }
  for (const [lineId, entries] of perLine) sigs.set(lineId, entries.sort().join(''));

  return sigs;
});

/**
 * 本行有没有绑上和弦（决定行内会不会渲染指板图卡）。直接复用上面的行级签名：签名只在有绑定时
 * 才写入 token，故「签名非空」等价于「本行至少有一个绑定」，不必再按 chordMap 走一遍。
 * 消费方是离屏行占位高度的分档（见 .line-row 的 is-chord-row）。
 */
const lineHasChord = (lineId: string): boolean => (lineChordSignatures.value.get(lineId)?.length ?? 0) > 0;

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
/**
 * 「大位移帧」判定阈值(px)：本帧位移吃掉整个预加载窗口时，补挂的提前量当场作废（见 handleScroll）。
 * 取 `VIEWPORT_PRELOAD_PX` 而不是某个经验值 —— 补挂预留的就是这个窗口，一帧走完它，
 * 挂进去的行下一帧就在视口外了。正常滚轮（约 100px/帧）与触摸板惯性都远低于此值，不会误伤。
 */
const SCROLL_BULK_DELTA_PX = VIEWPORT_PRELOAD_PX;
/** 「已贴底」的判定余量(px)：滚动容器底部常有亚像素误差，不给容差会漏判（与 useSectionScrollSpy 同口径） */
const BOTTOM_SNAP_PX = 6;
/** 补底轮次上限：每轮「重量行高 + 落一次底 + 等它停稳」，用完仍未贴底就收手，绝不无限滚 */
const BOTTOM_CHASE_MAX_ROUNDS = 4;
/** 「滚动到底部」建尾部窗口时一次挂载的行数：覆盖视口一屏多，即落地后用户真正会看的那一段 */
const TAIL_RENDER_ROWS = 12;
/** 空档高度里某一档行高还没量到时的兜底值(px)：与 .line-row 的 var(--score-line-height-*, 120px) 同值 */
const GAP_LINE_FALLBACK_PX = 120;

const renderedLineCount = ref(MIN_INITIAL_RENDER_LINE_COUNT);

/**
 * 实测行高（按行形态分档，px）：离屏行的占位高度吃这两个值（见 .line-row 的 contain-intrinsic-size）。
 * 占位高度是「跳过态」下唯一参与布局的数字 —— 偏小则内容总高偏小，滚动到底部永远差一截
 *（scrollTo 的落点算不到真实底部，且滚完还会被「占位 → 实测」的替换继续顶高）；
 * 偏大则行进入视口时会反向缩回。都得贴近实测，而两档高度差着数倍，故分档、不取单一值。
 */
const lineRowHeights = ref({ chord: 0, plain: 0 });

/**
 * 实测行高：返回「首个已渲染行」的布局高度（供首屏补齐估算，见 ensureSufficientRenderedLines），
 * 并按「有 / 无指板图卡」两档各取视口内的最大值（供离屏行占位，见 lineRowHeights）。
 *
 * 行高随字号 / 和弦行 / 视口宽度变化，用固定像素估算会在高分屏或大视口下算少行数而露出空白，故实测。
 * 两档各取最大值：占位偏小会把内容总高压低（滚不到底），偏大只会在行进入视口时缩回来一次。
 * 只采信视口内的行：content-visibility 的行一旦离屏就只报占位高度，拿它当实测值等于把占位锁死在
 * 自身上 —— 行还没被真实渲染过一次时尤其致命（测到的正是兜底值本身）。
 */
const measureLineRowHeights = (el: HTMLElement): { first: number; chord: number; plain: number } => {
  const zoneTop = el.getBoundingClientRect().top;
  const zoneBottom = zoneTop + el.clientHeight;
  let first = 0;
  let chord = 0;
  let plain = 0;
  el.querySelectorAll<HTMLElement>('.line-row').forEach((row, index) => {
    const rect = row.getBoundingClientRect();
    if (index === 0) first = rect.height;
    if (rect.bottom <= zoneTop || rect.top >= zoneBottom) return;
    if (row.classList.contains('is-chord-row')) chord = Math.max(chord, rect.height);
    else plain = Math.max(plain, rect.height);
  });
  // 某一档本次没采到样（视口里全是另一种行）时保留上一次的值，不用 0 抹掉它
  const previous = lineRowHeights.value;
  const next = { chord: chord || previous.chord, plain: plain || previous.plain };
  // 空档存在期间（见 hasGap）**冻结**占位高度，不写回：空档高度是「空档里逐行占位高度之和」，
  // 几百行会把任何一点变化放大成几千像素 —— 而落底目标（scrollHeight）正是由它决定的。
  // 量一次改一次，等于一边滚一边把目标挪走：轻则落不到底、重则触发一次大跨度补底（看起来就是
  // 「一点就瞬间到底部」）。空档消失（整份乐谱都在 DOM 里）后才恢复更新。
  if (!hasGap.value && (next.chord !== previous.chord || next.plain !== previous.plain)) lineRowHeights.value = next;
  return { first, chord: next.chord, plain: next.plain };
};

/**
 * 尾部窗口的行数（从末尾数）。>0 时布局变成「前缀 + 空档 + 尾部」三段：前缀仍是
 * [0, renderedLineCount)，尾部是末尾那几十行，中间那段**不挂进 DOM**、只按占位高度撑高（见 gapMarginOf）。
 * 这是「滚动到底部」不必等整份乐谱挂完的全部原因 —— 它要的只是末尾那一屏真实内容，
 * 中途滚过去的那些行根本不需要存在。
 */
const tailLineCount = ref(0);

/**
 * 视口窗口：用户把视口拖进空档里时，围绕视口挂的那一小段真实行。
 *
 * 三段模型只能表达「从头挂到 R」与「挂末尾 T 行」两个窗口 —— 视口落在空档中间时**两侧都够不着**，
 * 于是拖滚动条到中间永远是一片空白（本窗口解决的正是这个）。加上它之后布局变成
 * 「前缀 + 空档 + 视口窗口 + 空档 + 尾部」，视口落在哪都能有真实内容，与普通虚拟列表同构。
 * 只保留一段：新窗口与旧窗口取并集（见 placeViewportWindow），用户在同一段空档里来回滚时不反复拆挂。
 */
const viewportWindow = ref<{ start: number; count: number } | null>(null);

/** 尾部窗口首行的下标（未启用尾部窗口时等于总行数，此时没有任何行会被判为「空档承载行」） */
const tailStartIndex = computed(() => {
  const total = lyricsLinesWithEdges.value.length;
  return tailLineCount.value > 0 ? Math.max(renderedLineCount.value, total - tailLineCount.value) : total;
});

/** 是否还有没挂进 DOM 的空档。空档存在期间占位高度冻结（见 measureLineRowHeights）、补挂改走 expandGap */
const hasGap = computed(() => tailLineCount.value > 0 || viewportWindow.value !== null);

/** 单行的占位高度（按有无指板图卡分档）；某一档还没量到时退回 120px（与 .line-row 的 CSS 兜底同值） */
const linePlaceholderHeight = (lineId: string): number => {
  const { chord, plain } = lineRowHeights.value;
  return lineHasChord(lineId) ? chord || GAP_LINE_FALLBACK_PX : plain || GAP_LINE_FALLBACK_PX;
};

/**
 * 某一段行（[start, end)）按占位高度估算的高度。
 *
 * 已挂载的行也按占位高度算 —— 空档高度与「视口落在空档里的哪个位置」两套数必须同源，
 * 同一行无论挂没挂、在估算里高度一致，两套数才不会互相漂移。
 */
const placeholderHeightBetween = (start: number, end: number): number => {
  const lines = lyricsLinesWithEdges.value;
  let height = 0;
  for (let i = Math.max(0, start); i < end && i < lines.length; i++) height += linePlaceholderHeight(lines[i]!.lineId);
  return height;
};

/** 已挂进 DOM 的一段行区间（左闭右开） */
interface RenderedRange {
  start: number;
  end: number;
}

/** 已挂进 DOM 的行区间（升序、互不相接）：前缀 + 可选的视口窗口 + 尾部 */
const renderedRanges = (): RenderedRange[] => {
  const ranges = [{ start: 0, end: renderedLineCount.value }];
  const win = viewportWindow.value;
  if (win) ranges.push({ start: win.start, end: win.start + win.count });
  if (tailLineCount.value > 0) ranges.push({ start: tailStartIndex.value, end: lyricsLinesWithEdges.value.length });
  return ranges;
};

/**
 * 前缀窗口能长到哪：有视口窗口时不能长过它的起点 —— 两段重叠会让同一行在 visibleLines 里
 * 出现两次（重复 key），且空档承载行的 margin 会落在被前缀吃掉的那一行上。
 * 现读而不缓存：调用方之间隔着 await，期间可能有停稳补挂把窗口插进来。
 */
const prefixLimit = (): number => viewportWindow.value?.start ?? lyricsLinesWithEdges.value.length;

/**
 * 承载空档那一行的上外边距：把未挂载的那一段按占位高度撑出来。
 *
 * 至多两处承载行：视口窗口的首行承载它上面那段空档，尾部窗口的首行承载它与前一段之间的空档。
 *
 * 之所以挂成「首行的 margin-top」而不是在两段之间插一个空档元素：本行是 `v-memo` 的缓存单元，
 * 要插兄弟节点就得把整个 v-for 包进 `<template>`（整块缩进随之全变），而 margin 只给这一行加一个绑定。
 * 它在 v-memo 依赖表里也占一行，写的是本函数的**返回值** —— 除承载行外恒为 undefined，
 * 故空档缩短时只有承载行与新承载行两行失效，其余行照旧命中缓存。
 */
const gapMarginOf = (lineIdx: number): string | undefined => {
  const win = viewportWindow.value;
  if (win && lineIdx === win.start) {
    const above = placeholderHeightBetween(renderedLineCount.value, win.start);
    return above > 0 ? `${above}px` : undefined;
  }
  if (tailLineCount.value > 0 && lineIdx === tailStartIndex.value) {
    const above = placeholderHeightBetween(win ? win.start + win.count : renderedLineCount.value, tailStartIndex.value);
    return above > 0 ? `${above}px` : undefined;
  }
  return undefined;
};

/** 当前挂进 DOM 的歌词行：前缀 + 视口窗口 + 尾部（其余是空档，不渲染） */
const visibleLines = computed(() => {
  const lines = lyricsLinesWithEdges.value;
  const prefix = lines.slice(0, renderedLineCount.value);
  const tailStart = tailStartIndex.value;
  const tail = tailStart < lines.length ? lines.slice(tailStart) : [];
  const win = viewportWindow.value;
  if (!win) return tail.length > 0 ? [...prefix, ...tail] : prefix;
  return [...prefix, ...lines.slice(win.start, win.start + win.count), ...tail];
});

const sentinelRef = useTemplateRef<HTMLElement>('sentinelRef');
let sentinelObserver: IntersectionObserver | null = null;

/**
 * 视口渲染扩容：扩容哨兵可见 / 滚动接近底部时追加渲染行数。
 *
 * 两种情况下**一律不接**，由别的机制接管：
 * - 「滚动到底部」的滚动动画进行中（isExpandingToBottom）：此时补挂会改内容高度、把动画目标挪走；
 * - 空档存在时（hasGap）：本函数的触发条件是「接近**容器**底部」，而那时容器的底部是尾部（或视口
 *   窗口）的底部、与前缀无关，照旧走会把前缀挂到不需要的位置上 —— 还会长过视口窗口的起点、
 *   让同一行在 visibleLines 里出现两次。那一段由 expandGap 按视口位置驱动。
 */
const expandNextBatch = () => {
  if (isExpandingToBottom || hasGap.value) return;
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

watch(sentinelRef, () => void setupSentinelObserver());

/** 同一首歌内编辑歌词导致行数缩减时钳制渲染窗口：
 *  renderedLineCount 只在切歌时重置（onActivated / activeSongId watch），歌内删行后窗口
 *  会大于实际行数（slice 天然安全，但「扩容进度」被白保留）。主动收缩窗口（滚完即减）
 *  需要配合滚动锚定，否则内容高度变化会让滚动条跳动——那属体验决策，未实施。 */
watch(
  () => lyricsLinesWithEdges.value.length,
  total => {
    if (renderedLineCount.value > total) renderedLineCount.value = total;
    // 尾部窗口同样要收缩：两段加起来不能超过总行数（否则空档高度算成负数）
    if (tailLineCount.value > total - renderedLineCount.value)
      tailLineCount.value = Math.max(0, total - renderedLineCount.value);
    // 视口窗口同理：行数缩到「整份都已挂载」（前缀已含全部行）时整段丢弃，否则会出现重复行；
    // 缩到窗口底下时钳掉（否则 slice 越界、空档高度算成负数）。上限取 0 即「不许有窗口」
    const win = viewportWindow.value;
    const winLimit = renderedLineCount.value >= total ? 0 : tailStartIndex.value;
    if (win && win.start >= winLimit) viewportWindow.value = null;
    else if (win && win.start + win.count > winLimit)
      viewportWindow.value = { start: win.start, count: winLimit - win.start };
  }
);

/** 确保首屏已渲染的行数足以填满视口（高分屏或大视口下自动补齐），并在不足时按批兜底扩容 */
const ensureSufficientRenderedLines = async () => {
  await nextTick();
  const el = scoreZoneRef.value;
  if (!el || el.clientHeight === 0) return;
  // 按实测行高把渲染窗口补齐到「视口 + 预加载」，避免为填满视口而多挂载一整批行
  //（顺带把两档行高量出来下发，供离屏行占位 —— 首帧之后每行都只以占位高度参与布局）
  const { first: rowHeight } = measureLineRowHeights(el);
  if (rowHeight > 0) {
    const needed = Math.ceil((el.clientHeight + VIEWPORT_PRELOAD_PX) / rowHeight);
    if (needed > renderedLineCount.value) renderedLineCount.value = Math.min(prefixLimit(), needed);
    await nextTick();
  }
  // 兜底：行高估算偏低（超矮行 / 极端窄视口）时继续按批扩容，直到内容真的能滚动
  while (renderedLineCount.value < prefixLimit() && el.scrollHeight <= el.clientHeight) {
    renderedLineCount.value = Math.min(prefixLimit(), renderedLineCount.value + RENDER_BATCH_SIZE);
    await nextTick();
  }
  // 内容高度（scrollHeight）变化不会触发 ResizeObserver/scroll，须在此处显式重算边缘
  //（覆盖长→短乐谱切歌后 FAB 不消失、短→长后顶/底部按钮不出现等场景）
  await nextTick();
  refreshEdgeVisibility();
};

onMounted(() => void ensureSufficientRenderedLines());

/**
 * 把 [from, to) 挂成真实行：与前缀 / 尾部相接就并进去（不留空档），否则成为视口窗口。
 * 与已有的视口窗口取并集 —— 挂载是最贵的一步，用户在同一段空档里来回滚时不该反复拆挂。
 */
const placeViewportWindow = (from: number, to: number) => {
  const total = lyricsLinesWithEdges.value.length;
  const win = viewportWindow.value;
  let start = from;
  let end = to;
  // 相接（含恰好相邻）就取并集：相邻却不合并，会让同一段行在两次补挂之间被拆掉再挂一遍
  if (win && win.start <= end && start <= win.start + win.count) {
    start = Math.min(start, win.start);
    end = Math.max(end, win.start + win.count);
  }
  // 与前缀相接 ⇒ 并进前缀
  if (start <= renderedLineCount.value) {
    renderedLineCount.value = Math.max(renderedLineCount.value, end);
    viewportWindow.value = null;
    // 前缀一路吃到尾部 ⇒ 整份乐谱都在 DOM 里了，退回普通的前缀窗口（没有空档可言）
    if (tailLineCount.value > 0 && renderedLineCount.value >= tailStartIndex.value) {
      renderedLineCount.value = total;
      tailLineCount.value = 0;
    }
    return;
  }
  // 与尾部相接 ⇒ 并进尾部
  if (tailLineCount.value > 0 && end >= tailStartIndex.value) {
    tailLineCount.value = total - start;
    viewportWindow.value = null;
    return;
  }
  viewportWindow.value = { start, count: end - start };
};

/**
 * 把视口那一截补成真实行，返回是否补了。
 *
 * 空档里没有任何 DOM，视口落进去就是一片空白 —— 补的量只按「视口 + 上下预加载窗口」算，
 * 与视口在空档里陷得多深无关：拖到空档正中间也只挂一屏多，不会把从空档上沿到视口那几百行
 * 一起挂进来（那正是「拖着滚动条一路卡」的老病根）。
 */
const fillGapAtViewport = (el: HTMLElement): boolean => {
  const lines = lyricsLinesWithEdges.value;
  const total = lines.length;
  const coverTop = Math.max(0, el.scrollTop - VIEWPORT_PRELOAD_PX);
  const coverBottom = el.scrollTop + el.clientHeight + VIEWPORT_PRELOAD_PX;

  const ranges = renderedRanges();
  let offset = 0;
  let index = 0;
  let next = 0;
  while (index < total) {
    const range = ranges[next];
    // 已挂载的一段（或已被越过的段）：跳过，只累加它的高度。
    // 判据用 `>=` 而不是 `===`：万一区间表的升序 / 不重叠前提被破坏，这里也不能原地打转
    if (range && index >= range.start) {
      next += 1;
      for (; index < range.end; index++) offset += linePlaceholderHeight(lines[index]!.lineId);
      continue;
    }
    // 未挂载的一段（空档）：整体累加，顺带记下「视口 + 预加载」落在哪几行
    const gapEnd = range ? range.start : total;
    const gapTop = offset;
    // 本段已在「视口 + 预加载」之下 ⇒ 它和它之后的每一段都在下面，没有需要补的了
    if (gapTop >= coverBottom) return false;
    let from = -1;
    let to = -1;
    for (; index < gapEnd; index++) {
      offset += linePlaceholderHeight(lines[index]!.lineId);
      if (from < 0 && offset > coverTop) from = index;
      if (to < 0 && offset >= coverBottom) to = index + 1;
    }
    if (offset <= coverTop) continue; // 本段整个在「视口 + 预加载」之上（在下面的那些已提前返回）
    placeViewportWindow(from < 0 ? gapEnd - 1 : from, to < 0 ? gapEnd : to);
    return true;
  }
  return false;
};

/**
 * 让视口落在真实行上（空档里没有 DOM，视口落进去就是一片空白）。
 *
 * 视口在空档边缘时，补出来的这一截会与前缀 / 尾部相接、直接并进去；落在空档中间时成为独立的
 * 「视口窗口」，空档随之被切成两段。至多两段空档可能与视口相交（视口横跨视口窗口的上下沿时），
 * 故跑两趟；每趟挂完布局都会变，所以每趟都按当前布局重算。
 *
 * 位置判断用估算而非量 DOM：全部按占位高度累加（已挂载的行也按同一口径），与空档高度的算法同源，
 * 故「空档在哪」与「视口落在空档里的哪个位置」两套数不会互相漂移。
 */
const expandGap = (el: HTMLElement) => {
  for (let pass = 0; pass < 2; pass++) if (!fillGapAtViewport(el)) return;
};

/**
 * 按当前视口位置补挂（两种窗口形态各有一套判据）：
 * - 有空档时由空档位置驱动 —— 前缀那套「剩余可滚距离」在此不成立，容器的底部是尾部 / 视口窗口的底部；
 * - 否则仍是「剩余可滚距离不足即扩容」。
 */
const expandAtViewport = (el: HTMLElement) => {
  if (hasGap.value) {
    expandGap(el);
    return;
  }
  const remainingScroll = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (remainingScroll < SCROLL_PRELOAD_THRESHOLD_PX) expandNextBatch();
};

/** 上一帧的滚动位置：用来识别大位移帧（见 handleScroll） */
let lastScrollTop = 0;
/** 「滚动停下后补一次」的轮询句柄：切歌 / 失活 / 卸载时取消 */
let settleExpandRafId: number | null = null;

/**
 * 滚动停下后补一次挂载。
 *
 * `scroll` 只在滚动期间派发，停下之后不再来一发，而大位移帧被跳过的那些补挂得有人收口。
 * 用 rAF 轮询「连续两帧 `scrollTop` 不变」当作停下（与落底补底同口径，同样不引 `scrollend`：
 * 本处生命周期也完全自持）。停稳后调用方那一帧的位移为 0，不会再被判成大位移帧。
 */
const scheduleExpandOnScrollSettle = () => {
  if (settleExpandRafId !== null) return;
  let lastTop = scoreZoneRef.value?.scrollTop ?? 0;
  const tick = () => {
    settleExpandRafId = null;
    const el = scoreZoneRef.value;
    if (!el || isExpandingToBottom) return;
    // 还在滚：继续等它停稳
    if (el.scrollTop !== lastTop) {
      lastTop = el.scrollTop;
      settleExpandRafId = requestAnimationFrame(tick);
      return;
    }
    lastScrollTop = el.scrollTop;
    expandAtViewport(el);
  };
  settleExpandRafId = requestAnimationFrame(tick);
};

/** 取消「滚动停下后补一次」的轮询（幂等）：切歌 / 失活 / 卸载时调用 */
const cancelSettleExpand = () => {
  if (settleExpandRafId !== null) {
    cancelAnimationFrame(settleExpandRafId);
    settleExpandRafId = null;
  }
};

/**
 * 滚动过程中的补挂：快速拖拽滚动条或大幅度滚动时的兜底预加载扩容。
 *
 * **大位移帧一律不补挂。** 补挂的语义是「提前挂还没进视口的行」——一帧走掉整个预加载窗口时，
 * 本帧挂进去的行下一帧就在视口外了，白付一次挂载长任务（一行含指板图卡约十几毫秒）；
 * 而拖滚动条拇指恰恰是「每帧都超阈值」，于是每帧一批连起来就是一路卡。
 * 用户真正停下来时由 `scheduleExpandOnScrollSettle` 补一次，视口不会停在未挂载的内容上。
 */
const handleScroll = () => {
  const el = scoreZoneRef.value;
  if (!el || renderedLineCount.value >= lyricsLinesWithEdges.value.length) return;
  // 「滚动到底部」的滚动动画进行中：补挂会改内容高度、把动画目标挪走
  if (isExpandingToBottom) return;

  const delta = Math.abs(el.scrollTop - lastScrollTop);
  lastScrollTop = el.scrollTop;
  if (delta >= SCROLL_BULK_DELTA_PX) {
    scheduleExpandOnScrollSettle();
    return;
  }

  expandAtViewport(el);
};

/** 「滚动到底部」补底循环句柄：切歌/失活/卸载时取消，防止悬挂 rAF 继续滚动并干扰视口 */
let expandToBottomRafId: number | null = null;
/** 会话 Promise 的 resolve 句柄：取消路径（切歌/失活/卸载）下也必须落定 Promise，避免 await 方永久挂起 */
let expandToBottomResolve: (() => void) | null = null;
/**
 * 落底阶段状态：null = 还没采到第一次滚动位置。
 * - `lastTop`：上一帧的 `scrollTop`（判定这一帧有没有位移）；
 * - `moved`：本轮 `scrollTo` 之后是否**确实见过位移**。平滑滚动刚发起的那一两帧 `scrollTop`
 *   还没变，把它当成「已停稳」就会立刻补一次跳转 —— 那正是「一点就瞬间到底部」；
 * - `still`：连续没动的帧数，攒够两帧才算停稳；
 * - `rounds`：已补次数。
 */
let bottomChase: { rounds: number; lastTop: number; moved: boolean; still: number } | null = null;

/** 结束「滚动到底部」会话（幂等）：清状态并落定 Promise */
const finishExpandToBottom = () => {
  isExpandingToBottom = false;
  bottomChase = null;
  const pendingResolve = expandToBottomResolve;
  expandToBottomResolve = null;
  pendingResolve?.();
};

/** 停止「滚动到底部」循环（幂等），并落定未决的 Promise */
const cancelExpandToBottom = () => {
  if (expandToBottomRafId !== null) {
    cancelAnimationFrame(expandToBottomRafId);
    expandToBottomRafId = null;
  }
  finishExpandToBottom();
};

/**
 * 点击「滚动到底部」悬浮按钮。
 *
 * **只挂末尾一屏多，中间那段不挂。** 早先的写法是把整份乐谱分帧挂进 DOM、挂完再落底 ——
 * 长乐谱要等好几秒，而用户点的是「滚到底部」，不是「等我把整份乐谱造出来」。现在把渲染窗口切成
 * 「前缀 + 空档 + 尾部」三段（见 tailLineCount），只补挂末尾 TAIL_RENDER_ROWS 行真实内容，
 * 中间未挂载的那段由空档按占位高度撑高，于是**点下去当帧就开始滚**，不必等。
 * 中途滚过去的那一段是空档（背景色），这是本方案明码标价的代价。
 *
 * **落底目标必须稳定，所以全程只量一次行高。** 空档高度是「空档里逐行占位高度之和」，
 * 几百行会把任何一点占位变化放大成几千像素，而 `scrollTo` 的目标正是由它算出的 `scrollHeight` ——
 * 量一次改一次，等于一边滚一边把目标挪走：轻则落不到底、重则触发一次大跨度补底，
 * 用户看到的就是「一点就瞬间到底部」。故本函数只在**建窗口之前**量一次（为此先把已有窗口清空，
 * 空档不存在时占位高度才写得回去），之后 `measureLineRowHeights` 在空档存在期间一律不写回
 *（见该函数的说明）。
 *
 * 落底之后仍要**补底**：落底会把底部那批行「点亮」成实测高度，内容总高随之变化，而 `scrollTo` 的
 * top 在发起那一刻就被钳死，于是可能停在半路。故落底之后等它停稳、还没贴底就再平滑补一次，
 * 有限轮后收手。补底一律用平滑滚动：跨度大也是「补估算差」，用瞬时跳过去正是用户否掉的那种观感。
 */
const handleScrollToBottom = (): Promise<void> =>
  new Promise(resolve => {
    if (isExpandingToBottom) {
      resolve();
      return;
    }
    isExpandingToBottom = true;
    // 登记落定句柄：切歌/失活/卸载触发的 cancelExpandToBottom 会调用它，保证 Promise 必然落定
    expandToBottomResolve = resolve;
    bottomChase = null;

    const total = lyricsLinesWithEdges.value.length;
    // 先退回「只有前缀」的形态，再量一次行高：空档存在期间占位高度是冻结的（见 measureLineRowHeights），
    // 不清掉就量不到新值。量完再切尾部窗口 —— 两次状态变更落在同一帧，不会闪。
    // 视口窗口一并清掉：它与尾部窗口互斥，留着会让空档被切成两段、落底目标算不准。
    const zoneEl = scoreZoneRef.value;
    tailLineCount.value = 0;
    viewportWindow.value = null;
    if (zoneEl) measureLineRowHeights(zoneEl);

    // 只补末尾那一屏多。补完若已经接上前缀（短乐谱），就直接退回普通的前缀窗口 ——
    // 那时 DOM 里本来就是整份乐谱，没有空档可言，滚动也照旧是全程真实内容
    tailLineCount.value = Math.min(TAIL_RENDER_ROWS, Math.max(0, total - renderedLineCount.value));
    if (renderedLineCount.value + tailLineCount.value >= total) {
      renderedLineCount.value = total;
      tailLineCount.value = 0;
    }

    const step = () => {
      expandToBottomRafId = null;
      // 中途切歌：立即终止，交由切歌 watch 重置渲染行数与视口
      if (lastRenderedSongId !== scoreEditor.activeSongId) {
        cancelExpandToBottom();
        return;
      }
      const el = scoreZoneRef.value;
      if (!el) {
        finishExpandToBottom();
        return;
      }

      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      const chase = (bottomChase ??= { rounds: 0, lastTop: el.scrollTop, moved: false, still: 0 });

      // 先更新采样：这一帧有没有位移
      if (el.scrollTop !== chase.lastTop) {
        chase.moved = true;
        chase.still = 0;
      } else chase.still += 1;
      chase.lastTop = el.scrollTop;

      // 贴底即收工。这一条要排在「停稳」判定之前：已经在底部时压根不会有位移，等不到 moved
      if (remaining <= BOTTOM_SNAP_PX) {
        finishExpandToBottom();
        return;
      }

      // 只有「确实滚过、且连续两帧没动」才算停稳 —— 平滑滚动刚发起的那一两帧 scrollTop 也还没变，
      // 把它当成停稳就会立刻补一次跳转，那正是「一点就瞬间到底部」
      if (chase.moved && chase.still >= 2) {
        if (chase.rounds >= BOTTOM_CHASE_MAX_ROUNDS) {
          finishExpandToBottom();
          return;
        }
        chase.rounds += 1;
        chase.moved = false;
        chase.still = 0;
        scrollToBottom('smooth');
      }
      // 也可能是「还在滚」：不重发 scrollTo（重发会不断重置平滑滚动的进度），只更新采样点
      expandToBottomRafId = requestAnimationFrame(step);
    };

    // 窗口切好、DOM 落定后立刻起滚：这一次的滚动本身就是反馈，不再有「先挂完」的那段等待
    void nextTick().then(() => {
      if (!isExpandingToBottom) return;
      scrollToBottom('smooth');
      expandToBottomRafId = requestAnimationFrame(step);
    });
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

/** 按槽位键实时查找当前绑定的和弦（字符槽与行首 / 行尾边槽通用；无绑定返回 null） */
const slotChordOf = (slotKey: SlotKey): Chord | null => {
  const song = scoreEditor.activeSong;
  if (!song) return null;
  const parsed = parseSlotKey(slotKey);
  if (!parsed) return null;
  // 字符槽与 getCharChord 同源（都走 lineCharChord）；边槽是行级密列表，按下标直取
  const chordId =
    parsed.type === 'char'
      ? lineCharChord(song.chordMap, parsed.lineId, parsed.index)
      : (lineSlots(song.chordMap, parsed.lineId)[parsed.type][parsed.index] ?? null);
  return chordId ? (chordsLookupMap.value.get(chordId) ?? null) : null;
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
  cancelSettleExpand();
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
  cancelSettleExpand();
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
    tailLineCount.value = 0;
    // 视口窗口同样归零：它锚在旧歌的行下标上，留着会指向新歌的另一处内容
    viewportWindow.value = null;
    // 滚动采样点随之归零：新歌的 scrollTop 与上一首没有可比性，留着会让第一帧被误判成大位移帧
    cancelSettleExpand();
    lastScrollTop = 0;
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

// 切歌时清空保存的滚动位置，重置渐进渲染行数（含尾部窗口），并将视口滚回顶部（由于复用了固定 key 的组件实例）
watch(
  () => scoreEditor.activeSongId,
  newId => {
    if (!isAreaActive) return;
    cancelExpandToBottom();
    cancelSettleExpand();
    lastRenderedSongId = newId;
    hoveredLineKey.value = null;
    renderedLineCount.value = MIN_INITIAL_RENDER_LINE_COUNT;
    tailLineCount.value = 0;
    // 视口窗口同样归零：它锚在旧歌的行下标上，留着会指向新歌的另一处内容
    viewportWindow.value = null;
    lastScrollTop = 0;
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

/**
 * 打开面板时点中的目标槽位：面板内点击卡片即把和弦落到这里。
 * 面板仍是拖拽落位的主路径（可拖到任意槽），这里补的是「点一下就填」的直给路径——
 * 此前点击卡片在本宿主下完全没有反应（只注入了 drag-chord-starter，从未接 select），
 * 新用户面对「点开一个面板、然后要去拖东西」的两步操作无从下手。
 * 置 null 表示面板不是由槽位点击打开的，此时点卡片不落位。
 */
const pickerTargetSlotKey = ref<SlotKey | null>(null);

/** 面板关闭（关闭按钮 / Escape / 离开本区）即清空目标高亮：避免面板已收、字符仍高亮的残留状态 */
watch(isPickerPanelOpen, open => {
  if (!open) pickerTargetSlotKey.value = null;
});

/** 面板目标按行归约（供 v-memo 按行粒度失效）：目标槽位属于本行时给出该槽位键，否则 null。
 *  与 lineDropTargetKey 同构，但**必须带上槽位键本身、不能只给行号**——面板开着时在同一行内把目标从
 *  一个字符切到另一个字符，只比行号会让本行 memo 继续命中，高亮不跟着挪窝。
 *  前缀判定不精确时最多让本行多失效一次（真正决定高亮落哪一格的是 isPickerTarget 的精确相等），无害。 */
const linePickerTargetKey = (lineId: string): string | null =>
  pickerTargetSlotKey.value?.startsWith(`line_${lineId}_`) ? pickerTargetSlotKey.value : null;

/** 用户点击字符槽：打开选器和弦浮动面板并记住本次点中的槽位。
 *  面板已开时再点槽位只把目标切到新槽、不切换开关；关闭走手动（外壳关闭按钮 / Escape）。
 *  拖拽中或点击抑制期忽略，避免拖拽松手误触发 */
const handleOpenPicker = (slotKey?: SlotKey) => {
  if (isDragging.value || isSuppressingClick.value) return;
  isPickerPanelOpen.value = true;
  pickerTargetSlotKey.value = slotKey ?? null;
};

/**
 * 槽位事件委托：从事件源向上找最近的槽根元素。
 * 槽根是谱面里唯一带 `data-slot-key` 的节点（拖拽系统也按它寻址），故该属性本身就是寻址契约；
 * 落在槽外的目标（行删除钮、FAB、面板等）一律返回 null，天然被排除。
 */
const slotKeyFromEvent = (e: Event): SlotKey | null => {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-slot-key]');
  const key = el?.dataset['slotKey'];
  return key ? (key as SlotKey) : null;
};

/** 槽位点击：拦下冒泡与默认行为后打开选器和弦面板（v-action-card 把 Enter / Space 转成的 click 同走此路） */
const handleDelegatedClick = (e: MouseEvent) => {
  const slotKey = slotKeyFromEvent(e);
  if (!slotKey) return;
  e.stopPropagation();
  e.preventDefault();
  handleOpenPicker(slotKey);
};

/** 槽位按下：仅当该槽确实绑定了和弦时登记「移动」拖拽会话（空槽没有可拖动的内容） */
const handleDelegatedPointerDown = (e: PointerEvent) => {
  const slotKey = slotKeyFromEvent(e);
  if (!slotKey) return;
  // 按下的是真实按钮（悬停删除钮等）：不登记拖拽意图，避免「点删除」被当成拖动起点
  if ((e.target as HTMLElement).closest('button')) return;
  const chord = slotChordOf(slotKey);
  if (!chord) return;
  handlePointerDown({ event: e, slotKey, chord });
};

/** Delete / Backspace：仅当该槽确实绑定了和弦时清除（空槽不拦截该键，交回上层） */
const handleDelegatedDelete = (e: KeyboardEvent) => {
  const slotKey = slotKeyFromEvent(e);
  if (!slotKey || !slotChordOf(slotKey)) return;
  e.stopPropagation();
  e.preventDefault();
  scoreEditor.removeSlotChord(slotKey);
};

/** 本槽位是否为当前选器和弦面板的目标（驱动其高亮提示「卡片会写进哪一格」） */
const isPickerTarget = (slotKey: SlotKey): boolean => pickerTargetSlotKey.value === slotKey;

/**
 * 面板内点击 / 回车选中卡片：把和弦落到当前目标槽位，然后保持面板打开。
 * 目标槽位（高亮的字符）不随填充移动，再点卡片会覆盖它；要换填别的字符需先点对应字符把高亮切过去。
 * 全靠高亮告诉用户「现在会写进哪一格」，配合新的"点击字符不关面板"，覆盖是显式可见、非静默的。
 */
const handlePickerSelect = (chord: Chord) => {
  const slotKey = pickerTargetSlotKey.value;
  if (!slotKey) return;
  scoreEditor.setSlotChord(slotKey, chord);
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
   消除长乐谱切歌时主线程同步挂载数万节点的卡顿。contain-intrinsic-size 给出离屏占位高度。

   占位高度必须贴近真实行高：它是「跳过态」下唯一参与布局的数字，而内容总高（scrollHeight）
   直接决定「滚动到底部」的落点。占位偏小则总高偏小 —— scrollTo 的目标算不到真实底部，
   且滚动本身会把沿途的行「点亮」成实测高度继续把总高顶上去，动画必然停在半路；
   占位偏大则行进入视口时会反向缩回，同样是一次布局跳动。
   行高几乎只由「有没有指板图卡」决定（有卡行 ≈ 一个指板图的高度 + 字符行，无卡行只剩字符行），
   两档差着数倍，故分两档取实测最大值，由宿主在量到之后经 --score-line-height-* 下发（见
   measureLineRowHeights）；量到之前退回 120px 兜底。

   两个长度值分别是「宽 | 高」两个轴的占位：宽轴保持 120px 不动（行有 min-w-full，
   实际由容器宽度决定），只把高轴换成实测值。

   auto 前缀：记住该行上次渲染的实际尺寸，离屏占位不再退回 0×120 兜底值，
   避免 KeepAlive 重挂载/滚动到行时的二次布局跳动（宽度按真实内容算，滚动条不闪跳）。 */
.line-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px auto var(--score-line-height-plain, 120px);
}

/* 行内绑了和弦（会渲染指板图卡）：占位高度改用「有卡行」那一档的实测值 */
.line-row.is-chord-row {
  contain-intrinsic-size: auto 120px auto var(--score-line-height-chord, 120px);
}

/* 拖拽期间这里曾有一条「所有纯空行同时撑高到 116px」的规则，为的是让空行行首 / 行尾也有落点高度。
   现已移除：它要求整篇空行一起撑高，代价是拖拽起手瞬间全篇布局失效（长谱面一次几十毫秒），
   而它要解决的问题已经由槽级的 .is-drop-line 覆盖 —— 落点行（且只有落点行）的槽撑开成
   min-h-[108px] 的落位目标，空行因此同样有落点高度，且撑开范围严格按行归约。
   行的 min-h-0 与过渡保留：前者是行内 flex 子项能收缩的前提，后者承担行自身的 hover 边框 / 底色过渡。
   注：原规则的写法本身也是坏的 —— 「:global(前缀) + 后缀选择器」会让 scoped 插件把后缀整段丢掉，
   min-height 实际落在 body 上，即「全篇空行撑高」从未真正生效过（见 ChordSlot 的样式注释）。 */

/* 槽级样式（.char-box 基线、.is-drop-line*、.is-picker-target、拖拽源 / 按压态）与字形样式
   （.char-text）都不在本文件：类串的单一来源是 `slot/slotStyles.ts`，由 SlotShell / SlotGlyph
   与下面模板里**内联的瘦槽位**共用；字形的 hover 染色是 SlotGlyph 的 `:global()` 规则（整条不带
   scoped 属性，内联字形同样命中）。故这里没有任何槽级定义需要维护。 */
</style>
