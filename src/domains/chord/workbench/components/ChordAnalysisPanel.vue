<template>
  <div
    v-if="hasNotes"
    :class="candidatesOnly ? 'grid-cols-1' : 'grid-cols-[56%_auto_1fr]'"
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
        v-grid-nav
        :class="!candidatesOnly && candidates.length > 0 ? 'absolute inset-0' : undefined"
        :fade="{ size: 12 }"
        :scrollbar="{ overlayParent: candidateOverlayParent }"
        axis="y"
      >
        <template v-if="candidates.length > 0">
          <!-- 增删候选时的排版过渡：TransitionGroup 的 FLIP 让留下的候选滑到新位置，进出者各自
               淡入 / 淡出（类定义见 assets/transitions.scss 第 6 节 v-transition-list）。
               ⚠️ 每条候选必须包一层**自身无过渡的普通元素壳**，不能把 BaseBadge 直接当子项。两个原因：
               ① BaseBadge 模板在根元素之前有注释，dev 编译会把注释保留成 vnode ⇒ 组件根退化为**片段**
                  （实测编译产物：`_createElementBlock(_Fragment, null, [_createCommentVNode(...), …]`），
                  而过渡钩子是沿组件根下发的，落到 Fragment 上就没有任何元素可承接 ⇒ enter / leave /
                  move 一律不触发，表现为「完全没有动画」（生产构建注释被剥离、根是元素，所以只在 dev 复现）；
               ② 即便根是元素，BaseBadge 自带的 scoped `.base-badge[data-v-*]` 过渡特异性 (0,2,0)
                  也高于列表三档的单类 (0,1,0)，会把 move 的 $duration-base/$bezier-sidebar 压成
                  $duration-fast，enter / leave 同理。
               壳子两个问题一起解决：它是真元素（钩子落得上），自身不带 transition（列表档抢不走）。
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
            <!-- 激活态常挂 subtle、只切 variant，不再用 filled：filled 的 primary 底会去吃
                 --text-on-accent，而该令牌为过「强调色上的文字」对比度门禁已三主题统一取深墨，
                 纯黑落在饱和蓝上过于刺眼。subtle + primary（bg-tint-primary-88 + text-primary）
                 本就是本项目通用的选中态写法（下拉项 / 菜单行 / 和弦变体面板同一套），此处只是回到它。 -->
            <div v-for="candidate in candidates" :key="candidate.chordName" class="flex shrink-0">
              <BaseBadge
                v-wave
                :title="candidate.chordName"
                :variant="isCandidateActive(candidate) ? 'primary' : 'neutral'"
                @click="handleSelectCandidate(candidate)"
                interactive
                appearance="subtle"
              >
                <span v-chord-name="{ segments: candidate.segments, name: candidate.chordName, shorthand }" />
              </BaseBadge>
            </div>
          </TransitionGroup>
        </template>

        <Feedback v-else bordered description="暂无匹配和弦" icon="search-x" size="sm" />
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
              :class="note.isRoot ? 'font-bold text-warning' : 'text-fg-disabled'"
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
            :title="`${stringCount - note.stringIndex}弦 音级`"
            :variant="note.isRoot ? 'warning' : 'neutral'"
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

  <Feedback v-else description="在指板上按出音符后，这里会显示和弦名称与候选分析'" size="sm" />
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useActiveChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import {
  areChordsEnharmonicallyEquivalent,
  calcPitchIndex,
  canTogglePitchAccidental,
  collectChordNotes,
  computeStringLabelAccidental,
  getChordName,
  isReentrantTuning,
  nameToSegments,
  parsePitchSegment,
  ROOT_PITCH_MAP,
} from '@/domains/chord/theory/theory';
import { toStringIndex } from '@/domains/fretboard/model/coordinates';

import type {
  AccidentalType,
  CandidateResult,
  ExtensionSegment,
  NaturalPitchLetter,
  NoteInput,
} from '@/domains/chord/types';

/** 单个按音的分析展示项：原始输入音 + 与当前根音的音程 / 是否为根音弦 / 是否可切换变音 */
interface RenderNoteItem extends NoteInput {
  isRoot: boolean;
  intervalDegree: string;
  intervalAccidental: '' | 'b' | '#';
  canAccidentalToggle: boolean;
}

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

const INTERVAL_MAP: Record<number, { degree: string; acc: '' | 'b' | '#' }> = {
  0: { degree: '1', acc: '' },
  1: { degree: '2·9', acc: 'b' },
  2: { degree: '2·9', acc: '' },
  3: { degree: '3', acc: 'b' },
  4: { degree: '3', acc: '' },
  5: { degree: '4·11', acc: '' },
  6: { degree: '5', acc: 'b' },
  7: { degree: '5', acc: '' },
  8: { degree: '5', acc: '#' },
  9: { degree: '6·13', acc: '' },
  10: { degree: '7', acc: 'b' },
  11: { degree: '7', acc: '' },
};

const graphAnalysis = computed(() => {
  const { strings } = editorStore.draftChord;
  const { fretOffset } = editorStore.draftChord;
  const baseStrings = editorStore.activeBaseStrings;

  const { notes: rawNotes } = collectChordNotes(strings, fretOffset, baseStrings);
  if (rawNotes.length === 0) return null;

  let explicitRootPitch: number | null = null;
  const rootIdx = editorStore.draftChord.rootStringIndex;
  if (rootIdx !== null && strings[rootIdx]?.fret !== undefined && strings[rootIdx]!.fret >= 0)
    explicitRootPitch = calcPitchIndex(rootIdx, strings[rootIdx]!.fret, fretOffset, baseStrings);

  // 重入调弦（尤克里里 GCEA）按真实音高取低音，与 theory.resolveChordRootPitch 口径一致
  const { candidates, bestRootPitch } = analyzeChordGraph(
    rawNotes,
    explicitRootPitch,
    isReentrantTuning(editorStore.draftChord.tuning)
  );
  return { strings, fretOffset, baseStrings, rawNotes, candidates, bestRootPitch };
});

const analysis = computed(() => {
  const graph = graphAnalysis.value;
  if (!graph)
    return {
      notes: [] as RenderNoteItem[],
      candidates: [] as CandidateResult[],
    };

  const { strings, fretOffset, baseStrings, rawNotes, candidates, bestRootPitch } = graph;
  const currentDraftName = getChordName(editorStore.draftChord);
  const selectedCandidate = candidates.find(c =>
    areChordsEnharmonicallyEquivalent(currentDraftName, c.segments ?? c.chordName)
  );
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  const notes: RenderNoteItem[] = rawNotes
    .map(n => {
      const semitones = (n.pitchIndex - activeRootPitch + 12) % 12;
      const stringObj = strings[n.stringIndex];
      const canToggle =
        stringObj !== undefined && canTogglePitchAccidental(n.stringIndex, stringObj.fret, fretOffset, baseStrings);
      const interval = INTERVAL_MAP[semitones] || { degree: `${semitones}半音`, acc: '' };

      return {
        ...n,
        intervalDegree: interval.degree,
        intervalAccidental: interval.acc,
        isRoot: n.stringIndex === editorStore.draftChord.rootStringIndex,
        canAccidentalToggle: canToggle,
      };
    })
    .reverse();

  return { notes, candidates };
});

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

/** 候选和弦是否为当前激活项（与草稿名相同，或音名段序列/等音异名一致均视为匹配） */
const isCandidateActive = (candidate: CandidateResult): boolean => {
  const active = activeNameText.value.trim();
  if (!active) return false;
  return areChordsEnharmonicallyEquivalent(active, candidate.segments ?? candidate.chordName);
};

/** 把 "2·9" 这类度数串拆分为度数列表 */
const parseIntervalDegrees = (degreeStr: string): string[] => {
  if (!degreeStr) return [];
  return degreeStr
    .split('·')
    .map(s => s.trim())
    .filter(Boolean);
};

/** 度数 + 共享升降号 → 指令的 ExtensionSegment[]（每个度数各带上标升降号，如 b2/b9） */
const noteDegrees = (note: RenderNoteItem): ExtensionSegment[] => {
  const acc = note.intervalAccidental === '#' ? 1 : note.intervalAccidental === 'b' ? -1 : undefined;
  return parseIntervalDegrees(note.intervalDegree).map(deg => [deg, acc] as ExtensionSegment);
};

/** 候选和弦是否已被选中（与当前草稿名一致，支持乐理等音异名等价判定） */
const isCandidateSelected = (candidate: CandidateResult): boolean => {
  const currentDraftName = getChordName(editorStore.draftChord).trim();
  if (!currentDraftName) return false;
  return areChordsEnharmonicallyEquivalent(currentDraftName, candidate.segments ?? candidate.chordName);
};

/** 解析候选和弦名为统一的音名段结构：优先用候选自带 segments，否则按名段拆分，再回退逐字解析根音标签 */
const parseCandidateSegments = (candidate: CandidateResult) => {
  let parsed = candidate.segments ?? nameToSegments(candidate.chordName);
  if (!parsed) {
    const parsedRoot = parsePitchSegment(candidate.rootLabel);
    if (parsedRoot) {
      // 兜底：仅能解析出根音，把剩余文字作为未知性质后缀保留（去斜杠低音分隔）
      const rawSuffix = candidate.chordName.slice(candidate.rootLabel.length);
      const cleanSuffix = rawSuffix.startsWith('/') ? rawSuffix.slice(1) : rawSuffix;
      parsed = {
        root: parsedRoot,
        unknownQuality: cleanSuffix || undefined,
      };
    }
  }
  return parsed;
};

/** 定位候选根音对应的琴弦并把 rootStringIndex 指到该弦；无匹配弦则清空根音标记，返回匹配的物理弦号（无则 null） */
const assignRootString = (candidate: CandidateResult): number | null => {
  const strs = editorStore.draftChord.strings;
  let rootAssigned = false;
  let assignedIdx: number | null = null;
  strs.forEach((str, sIdx) => {
    if (str.fret >= 0 && !rootAssigned) {
      const pitch = calcPitchIndex(sIdx, str.fret, editorStore.draftChord.fretOffset, editorStore.activeBaseStrings);
      if (pitch === candidate.rootPitch) {
        editorStore.draftChord.rootStringIndex = toStringIndex(sIdx);
        assignedIdx = sIdx;
        rootAssigned = true;
      }
    }
  });
  if (!rootAssigned) editorStore.draftChord.rootStringIndex = null;
  return assignedIdx;
};

/** 尊重用户的弦上变音记号偏好：根音弦用户已明确变音时，和弦名自动与琴弦一致（绝不强行改回同名异音）；
 *  斜杠和弦低音同理同步到物理最低音弦 */
const syncUserPitchPreferences = (
  parsedSegs: NonNullable<ReturnType<typeof parseCandidateSegments>>,
  rootStringIdx: number | null
) => {
  // 根音弦当前已被用户指定变音（如手动切成 A#），名称根音随琴弦保持一致
  if (rootStringIdx !== null) {
    const str = editorStore.draftChord.strings[rootStringIdx];
    if (str) {
      const { label: curNatural, isAccidental } = computeStringLabelAccidental(
        rootStringIdx,
        str.fret,
        editorStore.draftChord.fretOffset,
        str.preferFlat,
        editorStore.activeBaseStrings
      );
      if (isAccidental) {
        const curAcc: AccidentalType = str.preferFlat ? -1 : 1;
        parsedSegs.root = [curNatural as NaturalPitchLetter, curAcc];
      }
    }
  }

  // 斜杠和弦低音：同步物理最低音弦的升降号偏好
  if (parsedSegs.bass) {
    const bassIsFlat = parsedSegs.bass[1] === -1;
    const [bassNatural, bassAcc] = parsedSegs.bass;
    const bassPitch = ((ROOT_PITCH_MAP[bassNatural] ?? 0) + bassAcc + 12) % 12;
    for (let s = 0; s < editorStore.draftChord.strings.length; s++) {
      const str = editorStore.draftChord.strings[s];
      if (str && str.fret >= 0) {
        const p = calcPitchIndex(s, str.fret, editorStore.draftChord.fretOffset, editorStore.activeBaseStrings);
        // break 必须在**命中之后**：它原来挂在「这条弦在发声」的分支里，于是循环总在第一条发声弦上
        // 就停住，只有低音恰好落在第一条发声弦时才同步成功 —— 斜杠低音的升降号偏好因此大多不生效。
        if (p % 12 === bassPitch) {
          str.preferFlat = bassIsFlat;
          break;
        }
      }
    }
  }
};

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

  // parseCandidateSegments 经 nameToSegments 返回 theory.ts 的 LRU 缓存实例；下方 syncUserPitchPreferences
  // 会就地改 .root，若直接操作缓存实例会污染它、牵连后续同名和弦解析出错误根音（P1 审计 #6）。
  // 这里克隆一份，仅改克隆体，缓存原实例不受影响（不动 theory.ts 的 LRU 返回）。
  let parsedSegs = parseCandidateSegments(candidate);
  if (parsedSegs) parsedSegs = { ...parsedSegs };
  editorStore.snapshotRootBeforeCandidate();
  const assignedRootStringIdx = assignRootString(candidate);
  if (parsedSegs) syncUserPitchPreferences(parsedSegs, assignedRootStringIdx);

  editorStore.draftChord.nameSegments = parsedSegs;
};
</script>
