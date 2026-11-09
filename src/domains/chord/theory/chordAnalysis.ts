/**
 * 和弦分析面板（ChordAnalysisPanel.vue）的纯计算层。
 *
 * 从组件 <script setup> 下沉：半音差→音程度数标签表、候选识别的编排（collectChordNotes →
 * analyzeChordGraph）、按音展示项合成、以及「候选 → 草稿」的应用规则（音名段解析 / 根音弦定位 /
 * 各弦音名升降号写法同步）。组件只保留 computed 接线与 store 写入，全部响应式输入经参数传入。
 *
 * 依赖方向：chordEngine / chordSearch / chordName / chordDegree / pitch / tuning 均为本目录既有
 * 模块，无反向依赖，不构成环。
 */

import { areChordsEnharmonicallyEquivalent } from './chordDegree';
import { analyzeChordGraph } from './chordEngine';
import { nameToSegments, parsePitchSegment, pitchClassOf } from './chordName';
import { collectChordNotes } from './chordSearch';
import { calcPitchIndex, canTogglePitchAccidental } from './pitch';
import { isReentrantTuning } from './tuning';

import type { ChordCandidate, ChordSlot, RoleAssignment } from './chordEngine';
import type { Tuning } from './tuning';
import type { CandidateResult, ChordNameSegments, NoteInput } from '@/domains/chord/types';
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
 * 取候选音名段的**草稿副本**。
 *
 * parseCandidateSegments 经 nameToSegments 返回 theory 的 LRU 缓存实例；草稿是会被整体克隆、清洗与
 * 持久化的长生命周期实体，不该与解析缓存共用同一个对象（P1 审计 #6）。这里克隆一份，仅用克隆体，
 * 缓存原实例不受影响（不动 theory 的 LRU 返回）。
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

/** 自然音名循环：音级步数 → 字母的基准表（与 LETTER_PITCHES 同序） */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** 各自然字母的音级（C D E F G A B → 0 2 4 5 7 9 11） */
const LETTER_PITCHES = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * 半音差（相对根音，0~11）→ 默认音级步数（0 = 同字母，1 = 二度，2 = 三度…6 = 七度）。
 *
 * 与 INTERVAL_MAP 的度数标签同源：1 半音记二度（`b2` 而非 `#1`）、8 半音记五度（`#5` 而非 `b6`）、
 * 10 半音记七度（`b7`）。步数只定「用哪个字母」，升降号仍由实际音级与该字母的自然音级之差决定 ——
 * 于是同一个音级在 `Bbmaj7` 与 `A#maj7` 里会分别拼成 `Ab` 与 `G#`。
 */
const DEFAULT_DEGREE_STEPS = [0, 1, 1, 2, 2, 3, 4, 4, 4, 5, 6, 6] as const;

/**
 * 声部角色 → 音级步数。
 *
 * 角色由识别引擎按配方给出，比「按半音差猜度数」准：`7#9` 的增九音是**二度**（写作 `D#`）而不是
 * 小三度（`Eb`）、`maj7#11` 的增十一音是**四度**（`F#`）而不是减五度（`Gb`）——这两处按半音差推
 * 都会推成另一侧的写法，与和弦名本身矛盾。
 *
 * `extra`（配方解释不了的音）与 `slash_bass` 不在表内：前者回落按半音差的默认度数，
 * 后者由和弦名里的低音写法直接决定（见下方斜杠低音分支）。
 */
const ROLE_DEGREE_STEPS: Partial<Record<ChordSlot, number>> = {
  root: 0,
  sus2: 1,
  ninth: 1,
  ninth_flat: 1,
  ninth_sharp: 1,
  third_major: 2,
  third_minor: 2,
  sus4: 3,
  eleventh: 3,
  eleventh_sharp: 3,
  fifth_perfect: 4,
  fifth_dim: 4,
  fifth_aug: 4,
  sixth: 5,
  thirteenth: 5,
  thirteenth_flat: 5,
  seventh_minor: 6,
  seventh_major: 6,
  seventh_dim: 6,
};

/**
 * 让各弦音名的升降号写法与候选和弦名一致（选中候选后修正每个音符的升降号）。
 *
 * 规则：**根音字母 + 该音在和弦里的音级**定字母，实际音级与该字母的自然音级之差定升降号。
 * 于是「根音怎么写，其余各音就跟着怎么拼」：
 *
 * - `E` 和弦的三音按三度取字母 `G`，G 的自然音级比它低 1 半音 ⇒ `G#`（而不是按音级 8 的默认 `Ab`）；
 * - `Ebm` 的五音按五度取字母 `G`，比它高 1 半音 ⇒ `Gb`（而不是按音级 6 的默认 `F#`）；
 * - 同一个音级 10，`Bbmaj7` 的七音取字母 `B` ⇒ `Ab`；换成 `A#maj7` 则取 `G#`。
 *
 * 音级以识别引擎给出的声部角色（`roles`）为准，缺角色的音回落按半音差的默认度数。
 * 自然音级没有升降号可改，故只写 `preferFlat`、不动 `fret`。
 *
 * 斜杠低音是唯一例外：它的写法由和弦名里的低音名直接给出（`C/Eb` 的 `Eb`），
 * 故最后按名字回写一次，不让上面的推导覆盖它。
 */
export const applyCandidatePitchSpelling = (
  parsedSegs: ChordNameSegments,
  roles: readonly RoleAssignment[],
  strings: GuitarStringEntity[],
  fretOffset: number,
  baseStrings: readonly number[]
): void => {
  const [rootNatural, rootAccidental] = parsedSegs.root;
  const rootLetterIndex = LETTERS.indexOf(rootNatural);
  const rootPitch = pitchClassOf(rootNatural, rootAccidental);

  const stepsByInterval = new Map<number, number>();
  for (const role of roles) {
    const steps = ROLE_DEGREE_STEPS[role.role];
    if (steps !== undefined) stepsByInterval.set(((role.interval % 12) + 12) % 12, steps);
  }

  for (let s = 0; s < strings.length; s++) {
    const str = strings[s];
    if (!str || str.fret < 0) continue;
    const pitch = calcPitchIndex(s, str.fret, fretOffset, baseStrings);
    const interval = (((pitch - rootPitch) % 12) + 12) % 12;
    const steps = stepsByInterval.get(interval) ?? DEFAULT_DEGREE_STEPS[interval]!;
    const letterPitch = LETTER_PITCHES[(rootLetterIndex + steps) % 7]!;
    // 差值为 1 ⇒ 该字母需升号、11（即 -1）⇒ 需降号；0 ⇒ 自然音级，无需改偏好。
    // 其余差值不该出现：步数表与音级表本就一一对应，任一半音差都能由某个字母 ±1 表示。
    const diff = (((pitch - letterPitch) % 12) + 12) % 12;
    if (diff === 1) str.preferFlat = false;
    else if (diff === 11) str.preferFlat = true;
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
