import type { AdvancedChordFormula, CandidateResult, NoteInput } from '@/types';

export const ALL_ADVANCED_FORMULAS: AdvancedChordFormula[] = [
  { suffix: '', category: 'triad', core: [0, 4], anchor: [7], conflicts: [1, 3, 5, 8, 10, 11], baseWeight: 100 },
  { suffix: 'm', category: 'triad', core: [0, 3], anchor: [7], conflicts: [1, 4, 8, 10, 11], baseWeight: 100 },
  { suffix: 'dim', category: 'triad', core: [0, 3, 6], conflicts: [4, 7], baseWeight: 70 },
  { suffix: 'aug', category: 'triad', core: [0, 4, 8], conflicts: [3, 7], baseWeight: 70 },
  { suffix: 'sus4', category: 'sus', core: [0, 5], anchor: [7], conflicts: [3, 4], baseWeight: 80 },
  { suffix: 'sus2', category: 'sus', core: [0, 2], anchor: [7], conflicts: [3, 4], baseWeight: 80 },
  { suffix: '5', category: 'triad', core: [0, 7], conflicts: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11], baseWeight: 50 },

  { suffix: '7', category: 'seventh', core: [0, 4, 10], anchor: [7], conflicts: [3, 11], baseWeight: 130 },
  { suffix: 'Maj7', category: 'seventh', core: [0, 4, 11], anchor: [7], conflicts: [3, 10], baseWeight: 130 },
  { suffix: 'm7', category: 'seventh', core: [0, 3, 10], anchor: [7], conflicts: [4, 11], baseWeight: 130 },
  { suffix: 'mMaj7', category: 'seventh', core: [0, 3, 11], anchor: [7], conflicts: [4, 10], baseWeight: 120 },
  { suffix: 'm7b5', category: 'seventh', core: [0, 3, 6, 10], conflicts: [4, 7, 11], baseWeight: 120 },
  { suffix: 'dim7', category: 'seventh', core: [0, 3, 6, 9], conflicts: [4, 7, 10, 11], baseWeight: 120 },
  { suffix: '7sus4', category: 'sus', core: [0, 5, 10], anchor: [7], conflicts: [3, 4], baseWeight: 110 },
  { suffix: '7sus2', category: 'sus', core: [0, 2, 10], anchor: [7], conflicts: [3, 4], baseWeight: 110 },

  { suffix: '6', category: 'triad', core: [0, 4, 9], anchor: [7], conflicts: [3, 10, 11], baseWeight: 110 },
  { suffix: 'm6', category: 'triad', core: [0, 3, 9], anchor: [7], conflicts: [4, 10, 11], baseWeight: 110 },
  { suffix: 'add9', category: 'triad', core: [0, 4, 2], anchor: [7], conflicts: [3, 10, 11], baseWeight: 100 },
  { suffix: 'madd9', category: 'triad', core: [0, 3, 2], anchor: [7], conflicts: [4, 10, 11], baseWeight: 100 },
  { suffix: '6/9', category: 'triad', core: [0, 4, 9, 2], anchor: [7], conflicts: [3, 10, 11], baseWeight: 120 },
  { suffix: 'm6/9', category: 'triad', core: [0, 3, 9, 2], anchor: [7], conflicts: [4, 10, 11], baseWeight: 120 },

  { suffix: '9', category: 'extended', core: [0, 4, 10, 2], anchor: [7], conflicts: [3, 11], baseWeight: 160 },
  { suffix: 'Maj9', category: 'extended', core: [0, 11, 2], anchor: [4, 7], conflicts: [3, 10], baseWeight: 160 },
  { suffix: 'm9', category: 'extended', core: [0, 3, 10, 2], anchor: [7], conflicts: [4, 11], baseWeight: 160 },
  { suffix: '9sus4', category: 'sus', core: [0, 5, 10, 2], anchor: [7], conflicts: [3, 4], baseWeight: 150 },
  { suffix: '7(#9)', category: 'altered', core: [0, 4, 10, 3], anchor: [7], conflicts: [11], baseWeight: 150 },
  { suffix: '7(b9)', category: 'altered', core: [0, 4, 10, 1], anchor: [7], conflicts: [11], baseWeight: 150 },
  { suffix: '11', category: 'extended', core: [0, 10, 5], anchor: [2, 7], conflicts: [3], baseWeight: 170 },
  { suffix: 'm11', category: 'extended', core: [0, 3, 10, 5], anchor: [2, 7], conflicts: [4], baseWeight: 170 },
  { suffix: '13', category: 'extended', core: [0, 10, 9], anchor: [2, 4, 7], conflicts: [3], baseWeight: 180 },
  { suffix: 'Maj13', category: 'extended', core: [0, 11, 9], anchor: [2, 4, 7], conflicts: [3], baseWeight: 180 },
];

const WEIGHTS = {
  COVER: 0.4,
  PURITY: 0.3,
  BASS: 0.15,
  SIMPLICITY: 0.15,
};

interface CompiledFormula {
  suffix: string;
  category: AdvancedChordFormula['category'];
  baseWeight: number;
  coreMask: number;
  conflictMask: number;
  knownMask: number;
  anchorMask: number;
}

const toMask = (intervals: number[] | undefined): number => {
  if (!intervals || intervals.length === 0) return 0;
  let m = 0;
  for (let i = 0; i < intervals.length; i++) {
    m |= 1 << (((intervals[i] % 12) + 12) % 12);
  }
  return m;
};

// 🌟 1. 模块加载阶段预编译公式掩码，零运行时转换消耗
const COMPILED_FORMULAS: CompiledFormula[] = ALL_ADVANCED_FORMULAS.map(f => {
  const coreMask = toMask(f.core);
  const anchorMask = toMask(f.anchor);
  const knownMask = coreMask | anchorMask | toMask(f.extensions) | toMask(f.tolerated);
  return {
    suffix: f.suffix,
    category: f.category,
    baseWeight: f.baseWeight,
    coreMask,
    conflictMask: toMask(f.conflicts),
    knownMask,
    anchorMask,
  };
});

// 🌟 2. 快速计算 12 位二进制中 1 的个数（取代数组 .length 或 Set.size）
const bitCount12 = (mask: number): number => {
  let n = 0;
  let m = mask & 0xfff;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
};

const chordAnalysisCache = new Map<string, { candidates: CandidateResult[]; bestRootPitch: number }>();

function rawAnalyzeChordGraph(
  notes: NoteInput[],
  explicitRootPitch: number | null
): { candidates: CandidateResult[]; bestRootPitch: number } {
  if (notes.length === 0) {
    return { candidates: [], bestRootPitch: 0 };
  }

  const lowestNote = notes[0];

  let pitchMask = 0;
  const labelByPitch = new Array<string | undefined>(12);
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const p = ((n.pitchIndex % 12) + 12) % 12;
    pitchMask |= 1 << p;
    if (labelByPitch[p] === undefined) labelByPitch[p] = n.label;
  }

  const rootPitches: number[] = [];
  if (explicitRootPitch !== null) {
    rootPitches.push(((explicitRootPitch % 12) + 12) % 12);
  } else {
    for (let p = 0; p < 12; p++) {
      if (pitchMask & (1 << p)) rootPitches.push(p);
    }
  }

  const results: CandidateResult[] = [];
  const formulas = COMPILED_FORMULAS;
  const formulaLen = formulas.length;

  for (let r = 0; r < rootPitches.length; r++) {
    const rootPitch = rootPitches[r];
    const rootLabel = labelByPitch[rootPitch] || '';

    let intervalMask = 0;
    for (let p = 0; p < 12; p++) {
      if (pitchMask & (1 << p)) {
        intervalMask |= 1 << ((p - rootPitch + 12) % 12);
      }
    }

    const lowestInterval = (lowestNote.pitchIndex - rootPitch + 12) % 12;
    const isSlash = lowestNote.pitchIndex !== rootPitch;
    const slashBassLabel = isSlash ? `/${lowestNote.label}` : '';
    const intervalCount = bitCount12(intervalMask);

    for (let f = 0; f < formulaLen; f++) {
      const formula = formulas[f];

      // 核心音必须全中
      if ((intervalMask & formula.coreMask) !== formula.coreMask) continue;
      // 不能包含冲突音
      if (intervalMask & formula.conflictMask) continue;

      let validMask = intervalMask & formula.knownMask;
      if (isSlash) {
        validMask |= intervalMask & (1 << lowestInterval);
      }
      const purityScore = bitCount12(validMask) / intervalCount;

      let bassScore = 1.0;
      if (isSlash) {
        if (explicitRootPitch !== null) {
          bassScore = 1.0;
        } else if (
          (formula.coreMask & (1 << lowestInterval)) !== 0 ||
          (formula.anchorMask & (1 << lowestInterval)) !== 0
        ) {
          bassScore = 0.92;
        } else if (formula.category === 'triad') {
          bassScore = 0.85;
        } else {
          bassScore = 0.45;
        }
      }

      const simplicityScore = formula.baseWeight / 200;
      const totalScore =
        (1.0 * WEIGHTS.COVER +
          purityScore * WEIGHTS.PURITY +
          bassScore * WEIGHTS.BASS +
          simplicityScore * WEIGHTS.SIMPLICITY) *
        100;

      results.push({
        chordName: `${rootLabel}${formula.suffix}${slashBassLabel}`,
        rootLabel,
        score: Math.round(totalScore * 10) / 10,
        rootPitch,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  const uniqueCandidates: CandidateResult[] = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (!seenNames.has(res.chordName)) {
      seenNames.add(res.chordName);
      uniqueCandidates.push(res);
    }
  }

  const bestRootPitch = uniqueCandidates.length > 0 ? uniqueCandidates[0].rootPitch : lowestNote.pitchIndex;

  return { candidates: uniqueCandidates, bestRootPitch };
}

// 🌟 3. 补充音符 Label 进入缓存 Key，防止升降号切换误中脏缓存
export function analyzeChordGraph(
  notes: NoteInput[],
  explicitRootPitch: number | null
): { candidates: CandidateResult[]; bestRootPitch: number } {
  if (notes.length === 0) {
    return { candidates: [], bestRootPitch: 0 };
  }

  let cacheKey = `${explicitRootPitch ?? 'auto'}:`;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    cacheKey += `${n.stringIndex}_${n.pitchIndex}_${n.label}|`;
  }

  if (chordAnalysisCache.has(cacheKey)) {
    return chordAnalysisCache.get(cacheKey)!;
  }

  const result = rawAnalyzeChordGraph(notes, explicitRootPitch);

  if (chordAnalysisCache.size >= 60) {
    const oldestKey = chordAnalysisCache.keys().next().value;
    if (oldestKey !== undefined) chordAnalysisCache.delete(oldestKey);
  }

  chordAnalysisCache.set(cacheKey, result);
  return result;
}
