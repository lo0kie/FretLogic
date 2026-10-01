/**
 * 和弦分析面板（ChordAnalysisPanel.vue）的纯计算层。
 *
 * 从组件 <script setup> 下沉：半音差→音程度数标签表、候选识别的编排（collectChordNotes →
 * analyzeChordGraph）、按音展示项合成、以及「候选 → 草稿」的应用规则（音名段解析 / 根音弦定位 /
 * 用户变音偏好同步）。组件只保留 computed 接线与 store 写入，全部响应式输入经参数传入。
 *
 * 依赖方向：chordEngine / chordSearch / chordName / chordDegree / pitch / tuning 均为本目录既有
 * 模块，无反向依赖，不构成环。
 */

import { areChordsEnharmonicallyEquivalent } from './chordDegree';
import { analyzeChordGraph } from './chordEngine';
import { nameToSegments, parsePitchSegment, pitchClassOf } from './chordName';
import { collectChordNotes } from './chordSearch';
import { calcPitchIndex, canTogglePitchAccidental, computeStringLabelAccidental } from './pitch';
import { isReentrantTuning } from './tuning';

import type { ChordCandidate } from './chordEngine';
import type { Tuning } from './tuning';
import type {
  AccidentalType,
  CandidateResult,
  ChordNameSegments,
  NaturalPitchLetter,
  NoteInput,
} from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/platform/types/instrument';

/** 半音差（相对当前根音，0~11）→ 音程度数标签（"2·9" 这类同半音复数度数用 · 并列） */
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

/** 一次候选识别的位置相关上下文与产物（组件的 graphAnalysis computed 的纯计算部分） */
export interface ChordGraphAnalysis {
  strings: GuitarStringEntity[];
  fretOffset: number;
  baseStrings: readonly number[];
  rawNotes: NoteInput[];
  candidates: ChordCandidate[];
  bestRootPitch: number;
}

/** 单个按音的分析展示项：原始输入音 + 与当前根音的音程 / 是否为根音弦 / 是否可切换变音 */
export interface AnalysisNoteItem extends NoteInput {
  isRoot: boolean;
  intervalDegree: string;
  intervalAccidental: '' | 'b' | '#';
  canAccidentalToggle: boolean;
}

/** 按音分析展示结果（组件的 analysis computed 的纯计算部分） */
export interface DraftAnalysis {
  notes: AnalysisNoteItem[];
  candidates: ChordCandidate[];
}

/**
 * 收集按音并跑候选识别（原 graphAnalysis computed 的纯计算部分）。
 * 无按音时返回 null（面板据此切空态）。
 */
export const analyzeDraftChordGraph = (
  strings: GuitarStringEntity[],
  fretOffset: number,
  baseStrings: readonly number[],
  tuning: Tuning,
  rootStringIndex: number | null
): ChordGraphAnalysis | null => {
  const { notes: rawNotes } = collectChordNotes(strings, fretOffset, baseStrings);
  if (rawNotes.length === 0) return null;

  let explicitRootPitch: number | null = null;
  if (rootStringIndex !== null && strings[rootStringIndex]?.fret !== undefined && strings[rootStringIndex]!.fret >= 0)
    explicitRootPitch = calcPitchIndex(rootStringIndex, strings[rootStringIndex]!.fret, fretOffset, baseStrings);

  // 重入调弦（尤克里里 GCEA）按真实音高取低音，与 theory.resolveChordRootPitch 口径一致
  const { candidates, bestRootPitch } = analyzeChordGraph(rawNotes, explicitRootPitch, isReentrantTuning(tuning));
  return { strings, fretOffset, baseStrings, rawNotes, candidates, bestRootPitch };
};

/**
 * 合成按音展示项（原 analysis computed 的纯计算部分）。
 *
 * 激活根音取「与草稿名等音等价的候选」的根音，取不到时回落识别器的 bestRootPitch；
 * graph 为 null（无按音）时返回空集。
 */
export const buildDraftAnalysis = (
  graph: ChordGraphAnalysis | null,
  currentDraftName: string,
  rootStringIndex: number | null
): DraftAnalysis => {
  if (!graph)
    return {
      notes: [],
      candidates: [],
    };

  const { strings, fretOffset, baseStrings, rawNotes, candidates, bestRootPitch } = graph;
  const selectedCandidate = candidates.find(c =>
    areChordsEnharmonicallyEquivalent(currentDraftName, c.segments ?? c.chordName)
  );
  const activeRootPitch = selectedCandidate ? selectedCandidate.rootPitch : bestRootPitch;

  const notes: AnalysisNoteItem[] = rawNotes
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
        isRoot: n.stringIndex === rootStringIndex,
        canAccidentalToggle: canToggle,
      };
    })
    .reverse();

  return { notes, candidates };
};

/**
 * 解析候选和弦名为统一的音名段结构：优先用候选自带 segments，否则按名段拆分，再回退逐字解析根音标签。
 */
export const parseCandidateSegments = (candidate: CandidateResult): ChordNameSegments | null => {
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
  return parsed ?? null;
};

/**
 * 取候选音名段的**草稿副本**（后续 syncUserPitchPreferences 会就地改 .root，不可直接用）。
 *
 * parseCandidateSegments 经 nameToSegments 返回 theory 的 LRU 缓存实例；若直接操作缓存实例会污染它、
 * 牵连后续同名和弦解析出错误根音（P1 审计 #6）。这里克隆一份，仅改克隆体，缓存原实例不受影响
 * （不动 theory 的 LRU 返回）。
 */
export const cloneCandidateSegments = (candidate: CandidateResult): ChordNameSegments | null => {
  const parsed = parseCandidateSegments(candidate);
  return parsed ? { ...parsed } : null;
};

/**
 * 定位候选根音对应的琴弦：返回第一条「在发声且音级等于候选根音」的物理弦号；无匹配弦返回 null。
 *
 * 原 ChordAnalysisPanel.assignRootString 在遍历中直接改写草稿的 rootStringIndex；下沉后改为纯查询，
 * 由调用方把返回值写回草稿（无匹配时写 null，与旧行为一致）。
 */
export const findCandidateRootString = (
  candidate: CandidateResult,
  strings: GuitarStringEntity[],
  fretOffset: number,
  baseStrings: readonly number[]
): number | null => {
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str && str.fret >= 0 && calcPitchIndex(sIdx, str.fret, fretOffset, baseStrings) === candidate.rootPitch)
      return sIdx;
  }
  return null;
};

/**
 * 尊重用户的弦上变音记号偏好：根音弦用户已明确变音时，和弦名自动与琴弦一致（绝不强行改回同名异音）；
 * 斜杠和弦低音同理同步到物理最低音弦。
 *
 * 就地改写入参 parsedSegs（调用方必须传 cloneCandidateSegments 的副本）与 strings 的 preferFlat。
 */
export const syncUserPitchPreferences = (
  parsedSegs: ChordNameSegments,
  rootStringIdx: number | null,
  strings: GuitarStringEntity[],
  fretOffset: number,
  baseStrings: readonly number[]
): void => {
  // 根音弦当前已被用户指定变音（如手动切成 A#），名称根音随琴弦保持一致
  if (rootStringIdx !== null) {
    const str = strings[rootStringIdx];
    if (str) {
      const { label: curNatural, isAccidental } = computeStringLabelAccidental(
        rootStringIdx,
        str.fret,
        fretOffset,
        str.preferFlat,
        baseStrings
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
    const bassPitch = pitchClassOf(bassNatural, bassAcc);
    for (let s = 0; s < strings.length; s++) {
      const str = strings[s];
      if (str && str.fret >= 0) {
        const p = calcPitchIndex(s, str.fret, fretOffset, baseStrings);
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
