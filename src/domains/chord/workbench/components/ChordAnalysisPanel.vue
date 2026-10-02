<template>
  <div
    v-if="hasNotes"
    :class="candidatesOnly ? 'grid-cols-1' : 'grid-cols-[60%_auto_1fr]'"
    class="grid min-h-0 w-full gap-xs overflow-hidden"
  >
    <!-- 行高取两列内容高度之大者，分两种情形（候选是否为空）：
         · 候选为空：左列空态留在流中，按自身高度参与行高 → 容器由左侧撑开（不被右列压缩）；
         · 候选非空：左列内容脱离流、不参与行高，行高由右侧按音列独占决定，超出则由左列自身滚动 -->
    <!-- 左列占位壳：只作定位上下文与滚动条 overlay 的挂载点，自身不提供内容高度 -->
    <div class="relative min-h-0 min-w-0" ref="candidatePaneRef">
      <!-- 候选非空：内容层绝对定位脱离流 → 不参与 grid 行高计算，行高由右列独占决定；超出则本区滚动。
           候选为空：留在流中，空态框按自身高度撑开左列行高（矮右列压不扁它），此时无须滚动 -->
      <BaseScrollArea
        v-arrow-nav
        :class="!candidatesOnly && candidates.length > 0 ? 'absolute inset-0' : undefined"
        :fade="{ size: 12 }"
        :scrollbar="{ overlayParent: candidateOverlayParent }"
        axis="y"
      >
        <template v-if="candidates.length > 0">
          <!-- 增删候选时的排版过渡：TransitionGroup 负责两件事 —— 进出者的淡入 / 淡出（类定义见
               assets/transitions.scss 第 6 节 v-transition-list）与**位移**（FLIP，由 .v-transition-list-move
               的 transform 过渡承接，本列表不再用 move-class 关掉它）。
               ⚠️ `:key` 取**位次**而非和弦名 —— 这是本列表的核心约定，勿改回按名 key：
               候选上限是 chordEngine 的 TOP_EVALUATE_LIMIT = 10，而「换和弦 / 改音」时名单几乎是**整表
               切换**。按名 key 时旧名全部 leave、新名全部 enter，而 TransitionGroup 对 leave / enter 只
               做 scale + opacity（leave 还会被 .v-transition-list-leave-active 摘出流）—— 于是两批元素
               被销毁重建；改按位次 key 后同一格的元素跨渲染复用（Vue 的 keyed diff 按 key 匹配新旧
               vnode），整表切换退化成**内容就地更新**：元素身份不变，FLIP 才有「同一个元素从旧位滑到
               新位」可谈 —— 否则旧元素离场、新元素入场，位移根本无从补间。
               ⚠️ 位移只能有**一个**驱动源，本列表选 FLIP（另一条路已试过并弃用，勿改回去）：
               · 宽度是布局输入。若给徽标挂宽度补间（BaseBadge 自带的 v-auto-width），flex 会逐帧重排，
                 位移就只是这次补间的**副产品** —— 而 flex-wrap 的换行点是**离散**的：补间跨过某一步时
                 某一格会整体跳到下一行，这一跳不受补间控制，观感是「别的格都平滑、偏偏它闪一下」；
                 且补间期间文字已换成新名、盒子还是旧宽，长名会被 overflow-hidden 裁掉一截。
               · FLIP 量的是 rect 差，跨行也只是一段更大的位移量，一样走 transform 过渡 —— 换行不再有例外。
                 故此处给 BaseBadge 传 `:auto-width="false"`，让宽度变化瞬时生效。
               · 两者不能同时开：WAAPI 宽度动画的当前值在起步瞬间仍等于旧宽（composite: replace 覆盖实时
                 宽度），FLIP 量到的 rect 差因此约等于 0、位移过渡根本不触发；而补间随后又把 FLIP 刚钉住的
                 布局逐帧推开。同时开着等于白开，还多一层每帧强制布局。
               ⚠️ 代价（都是有意接受的，不是遗漏）：
               · 徽标自身宽度是**瞬时**变化、不是补间：那一格会「啪」地变宽 / 变窄，而紧随其后的各格由
                 FLIP 平滑推开 —— 观感上的「挤压」是平滑的，瞬时的只是那一格自己的盒子；
               · 同一格内是**内容就地替换**（不做淡入淡出）。
               ⚠️ 位次即优先级：候选数组已按「纯度 → 分数 → 绝对根音 → 配方序」稳定排序，同一输入必得同一
                 顺序，故按位次 key 不会让内容在格与格之间乱跳。
               ⚠️ 每条候选必须包一层**自身无过渡的普通元素壳**，不能把 BaseBadge 直接当子项。两个原因：
               ① BaseBadge 模板在根元素之前有注释，dev 编译会把注释保留成 vnode ⇒ 组件根退化为**片段**
                  （实测编译产物：`_createElementBlock(_Fragment, null, [_createCommentVNode(...), …]`），
                  而过渡钩子是沿组件根下发的，落到 Fragment 上就没有任何元素可承接 ⇒ enter / leave
                  一律不触发，表现为「完全没有动画」（生产构建注释被剥离、根是元素，所以只在 dev 复现）；
               ② 即便根是元素，BaseBadge 自带的 scoped `.base-badge[data-v-*]` 过渡特异性 (0,2,0)
                  也高于列表档的单类 (0,1,0)，会把 enter / leave 的时长压成 $duration-fast。
               壳子两个问题一起解决：它是真元素（钩子落得上），自身不带 transition（列表档抢不走；FLIP 的
               -move 类也正是加在这个壳上，其 transform 过渡才量得到）。
               与本仓既有写法一致 —— ChordCard 的根也是这样的壳，其注释明确要求「注释必须留在根元素内部」。
               ⚠️ flex 布局必须挂在组容器上、不能留在 BaseScrollArea 上：组容器会成为滚动区里唯一的
               flex 项，而 flex 项的宽度默认取内容宽 —— 候选就再也不会换行（整行溢出）。故这里把
               flex / gap 从滚动区挪到组容器，滚动区退为普通块级容器，布局结果不变。
               壳子取 `flex shrink-0`：`shrink-0` 与原「徽章自己就是 flex 项且自带 shrink-0」等价，
               `flex` 则避免行内子元素产生行盒、在徽章下沿凭空多出一段基线空隙。
               `relative` 供离场元素定位（leave-active 会把它转为 absolute，脱离流后不占位，
               留下的候选才能在过渡期间滑到新位置 —— 否则离场者仍占着原格、动画对不上）。
               空态分支留在组外：候选清零时整组卸载直接切空态框，那一档不做列表动画（面板整体换形态，
               不是列表增减）。 -->
          <TransitionGroup class="relative flex flex-wrap content-start gap-1" name="v-transition-list" tag="div">
            <!-- 激活态取 filled 实心底、未激活取 subtle 浅底：一排十几枚徽章里只有一枚是选中项，
                 浅底（tint-88 + 主色字）在密集同色候选之间几乎分不出层次，实底才压得住。
                 此前这里刻意不用 filled 的理由已失效：那时 filled 的 primary 配的是 --text-on-accent，
                 该令牌为过「强调色上的文字」对比度门禁三主题统一取深墨，纯黑落在饱和蓝上刺眼；
                 现在 filled 一律走 `bg-<色>-solid` + `--text-on-solid`（实心档上的浅色字，过 AA），
                 见 BaseBadge 的 VARIANT_APPEARANCE_MAP 注释。
                 两档都带 1px 边框（filled 是 border-transparent），故切换时高度不跳。 -->
            <div v-for="(candidate, rank) in candidates" :key="rank" class="flex shrink-0">
              <BaseBadge
                v-wave
                :appearance="isCandidateActive(candidate) ? 'filled' : 'subtle'"
                :auto-width="false"
                :color="isCandidateActive(candidate) ? 'primary' : 'neutral'"
                :title="candidate.chordName"
                @click="handleSelectCandidate(candidate)"
                interactive
              >
                <span v-chord-name="{ segments: candidate.segments, name: candidate.chordName, shorthand }" />
              </BaseBadge>
            </div>
          </TransitionGroup>
        </template>

        <Feedback v-else appearance="outline" description="暂无匹配和弦" icon="search-x" size="sm" />
      </BaseScrollArea>
    </div>

    <template v-if="!candidatesOnly">
      <BaseDivider orientation="vertical" />

      <!-- 右列：按音列表在流中，独占决定整行高度（左列已脱离流） -->
      <div class="flex min-h-0 min-w-0 flex-col gap-1">
        <div
          v-wave
          v-for="note in notes"
          :class="[
            note.isRoot
              ? 'border-tint-warning-65 bg-tint-warning-90 hover:border-tint-warning-78 hover:bg-tint-warning-88'
              : 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover',
          ]"
          :key="note.stringIndex"
          class="flex min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-md border px-1.5 py-1 transition-colors select-none"
        >
          <div class="flex min-w-0 shrink-0 items-center gap-1">
            <span
              :class="note.isRoot ? 'font-bold text-warning' : 'text-fg-muted'"
              class="shrink-0 text-2xs font-semibold whitespace-nowrap"
            >
              {{ stringCount - note.stringIndex }}弦
            </span>
            <span
              :class="note.isRoot ? 'font-extrabold text-warning' : 'font-bold text-fg-title'"
              class="shrink-0 text-xs whitespace-nowrap"
            >
              <span v-chord-name="note.label" />
            </span>
          </div>

          <!-- 根音徽章既不用 filled 也不用 subtle：filled 的 warning 实心底会把字送到 --text-on-accent
               （深墨），正是要消掉的「深墨压饱和强调色」；subtle 的浅底又与所在行自身的 bg-tint-warning-90
               同档、会糊在行底里。outline 以边框 + 同色前景立住，落在浅底行上仍可辨识。 -->
          <BaseBadge
            :class="note.isRoot ? 'shadow-[0_1px_4px_rgba(var(--color-warning-rgb),0.5)]' : undefined"
            :color="note.isRoot ? 'warning' : 'neutral'"
            :title="`${stringCount - note.stringIndex}弦 音级`"
            appearance="outline"
            class="font-mono tabular-nums"
            size="xs"
          >
            <span v-chord-name="{ degrees: noteDegrees(note) }" class="font-bold" />
          </BaseBadge>
        </div>
      </div>
    </template>
  </div>

  <Feedback v-else description="在指板上按出音符后，这里会显示和弦名称与候选分析" size="sm" />
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useActiveChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import {
  analyzeDraftChordGraph,
  buildDraftAnalysis,
  cloneCandidateSegments,
  findCandidateRootString,
  syncUserPitchPreferences,
} from '@/domains/chord/theory/chordAnalysis';
import { areChordsEnharmonicallyEquivalent, getChordName } from '@/domains/chord/theory/theory';
import { toStringIndex } from '@/domains/fretboard/model/coordinates';

import type { AnalysisNoteItem } from '@/domains/chord/theory/chordAnalysis';
import type { CandidateResult, ExtensionSegment } from '@/domains/chord/types';

/** 仅显示候选区（用于抽屉等狭窄场景），隐藏右侧按音分析列；
 *  shorthand：候选和弦名是否用简写符号，缺省 false（完整名）——
 *  由调用方按场景显式传入（工作台传工作台偏好、乐谱抽屉传乐谱偏好），组件不自行读取设置 */
defineProps<{
  candidatesOnly?: boolean;
  shorthand?: boolean;
}>();

// 解析当前生效的草稿实例：位于选器和弦抽屉子树内时取抽屉独立草稿，否则取工作台草稿
const editorStore = useActiveChordEditorStore();

/** 草稿弦数：弦号显示基准（6 弦吉他/4 弦尤克里里/自定义调弦通用），与 FretboardSvg 的 strings.length - sIdx 口径一致 */
const stringCount = computed(() => editorStore.draftChord.strings.length);

const graphAnalysis = computed(() =>
  analyzeDraftChordGraph(
    editorStore.draftChord.strings,
    editorStore.draftChord.fretOffset,
    editorStore.activeBaseStrings,
    editorStore.draftChord.tuning,
    editorStore.draftChord.rootStringIndex
  )
);

const analysis = computed(() =>
  buildDraftAnalysis(graphAnalysis.value, getChordName(editorStore.draftChord), editorStore.draftChord.rootStringIndex)
);

/** 当前草稿的和弦名文本（供候选匹配判定） */
const activeNameText = computed(() => getChordName(editorStore.draftChord));

/** 候选标签列表 */
const candidates = computed(() => analysis.value.candidates);
/** 按音分析展示项列表 */
const notes = computed(() => analysis.value.notes);
/** 有按音（分析图存在即代表至少一个按音，决定内容/空态分支） */
const hasNotes = computed(() => analysis.value.notes.length > 0);

/** 左列占位壳元素：滚动条 overlay 的挂载点（见 candidateOverlayParent） */
const candidatePaneRef = useTemplateRef<HTMLElement>('candidatePaneRef');

/**
 * 滚动条 overlay 显式挂到左列占位壳，避开 v-scrollbar 默认的「宿主父元素」回落路径。
 * 默认回落会把 overlay 插进折叠体的子节点列表，成为 Vue 逐子 diff 时的外来兄弟节点；
 * 本面板整体由 hasNotes 的 v-if 控制挂载/卸载，锚点会被外来节点打乱 →
 * insertBefore NotFoundError、DOM 卡在半更新态（反推和弦面板曾踩过同一坑）。
 */
const candidateOverlayParent = () => candidatePaneRef.value ?? null;

/**
 * 候选和弦是否与给定名称指向同一条（音名段 / 等音异名等价均视为匹配）。
 *
 * 「当前激活的候选」与「已被选中的候选」是两个**来源不同**的问题（前者比分析结果里的活动名，
 * 后者比编辑器草稿名），但判定逻辑逐字相同 —— 收在这里一处，免得两边各自演化出不同口径
 *（那会让同一个候选同时显示成「激活」与「未选中」）。
 */
const candidateMatchesName = (candidate: CandidateResult, name: string): boolean => {
  const target = name.trim();
  if (!target) return false;
  return areChordsEnharmonicallyEquivalent(target, candidate.segments ?? candidate.chordName);
};

/** 候选和弦是否为当前激活项（与草稿名相同，或音名段序列/等音异名一致均视为匹配） */
const isCandidateActive = (candidate: CandidateResult): boolean =>
  candidateMatchesName(candidate, activeNameText.value);

/** 把 "2·9" 这类度数串拆分为度数列表 */
const parseIntervalDegrees = (degreeStr: string): string[] => {
  if (!degreeStr) return [];
  return degreeStr
    .split('·')
    .map(s => s.trim())
    .filter(Boolean);
};

/** 度数 + 共享升降号 → 指令的 ExtensionSegment[]（每个度数各带上标升降号，如 b2/b9） */
const noteDegrees = (note: AnalysisNoteItem): ExtensionSegment[] => {
  const acc = note.intervalAccidental === '#' ? 1 : note.intervalAccidental === 'b' ? -1 : undefined;
  return parseIntervalDegrees(note.intervalDegree).map(deg => [deg, acc] as ExtensionSegment);
};

/** 候选和弦是否已被选中（与当前草稿名一致，支持乐理等音异名等价判定） */
const isCandidateSelected = (candidate: CandidateResult): boolean =>
  candidateMatchesName(candidate, getChordName(editorStore.draftChord));

/** 清除当前选中的和弦名，并把根音弦还原到点候选前的状态（应用于再点已选中候选） */
const clearDraftSelection = () => {
  editorStore.draftChord.nameSegments = null;
  editorStore.restoreRootOnCandidateCancel();
};

/** 用户点击候选：已选中则清除和弦名并还原根音，否则应用候选名并把根音指到对应琴弦 */
const handleSelectCandidate = (candidate: CandidateResult) => {
  if (isCandidateSelected(candidate)) {
    clearDraftSelection();
    return;
  }

  editorStore.snapshotRootBeforeCandidate();
  const assignedRootStringIdx = findCandidateRootString(
    candidate,
    editorStore.draftChord.strings,
    editorStore.draftChord.fretOffset,
    editorStore.activeBaseStrings
  );
  // 根音指到匹配弦；无匹配弦则清空根音标记（原 assignRootString 的落空分支）
  editorStore.draftChord.rootStringIndex = assignedRootStringIdx !== null ? toStringIndex(assignedRootStringIdx) : null;
  // 候选音名段取草稿副本（theory 的 LRU 缓存实例不可就地改写，防护见 theory/chordAnalysis.cloneCandidateSegments）
  const parsedSegs = cloneCandidateSegments(candidate);
  if (parsedSegs)
    syncUserPitchPreferences(
      parsedSegs,
      assignedRootStringIdx,
      editorStore.draftChord.strings,
      editorStore.draftChord.fretOffset,
      editorStore.activeBaseStrings
    );

  editorStore.draftChord.nameSegments = parsedSegs;
};
</script>
