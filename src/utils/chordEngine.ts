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

const chordAnalysisCache = new Map<string, { candidates: CandidateResult[]; bestRootPitch: number }>();

function rawAnalyzeChordGraph(
  notes: NoteInput[],
  explicitRootPitch: number | null
): { candidates: CandidateResult[]; bestRootPitch: number } {
  if (notes.length === 0) {
    return { candidates: [], bestRootPitch: 0 };
  }

  const lowestNote = notes[0];
  const uniquePitches = Array.from(new Set(notes.map(n => n.pitchIndex)));

  const pitchToLabelMap = new Map<number, string>();
  notes.forEach(n => {
    if (!pitchToLabelMap.has(n.pitchIndex)) {
      pitchToLabelMap.set(n.pitchIndex, n.label);
    }
  });

  const candidateRootPitches = explicitRootPitch !== null ? [explicitRootPitch] : uniquePitches;
  const results: CandidateResult[] = [];

  candidateRootPitches.forEach(rootPitch => {
    const rootLabel = pitchToLabelMap.get(rootPitch) || '';
    const intervalSet = new Set(uniquePitches.map(p => (p - rootPitch + 12) % 12));
    const lowestInterval = (lowestNote.pitchIndex - rootPitch + 12) % 12;
    const isSlash = lowestNote.pitchIndex !== rootPitch;
    const slashBassLabel = isSlash ? `/${lowestNote.label}` : '';

    ALL_ADVANCED_FORMULAS.forEach(formula => {
      const coreHitCount = formula.core.filter(i => intervalSet.has(i)).length;
      if (coreHitCount < formula.core.length) return;

      const hasConflict = formula.conflicts.some(i => intervalSet.has(i));
      if (hasConflict) return;

      const coverScore = 1.0;

      const knownSet = new Set([
        ...formula.core,
        ...(formula.anchor || []),
        ...(formula.extensions || []),
        ...(formula.tolerated || []),
      ]);

      let validToneCount = 0;
      intervalSet.forEach(i => {
        if (knownSet.has(i) || (isSlash && i === lowestInterval)) {
          validToneCount++;
        }
      });
      const purityScore = validToneCount / intervalSet.size;

      let bassScore = 1.0;
      if (isSlash) {
        if (explicitRootPitch !== null) {
          bassScore = 1.0;
        } else if (formula.core.includes(lowestInterval) || formula.anchor?.includes(lowestInterval)) {
          bassScore = 0.92;
        } else if (formula.category === 'triad') {
          bassScore = 0.85;
        } else {
          bassScore = 0.45;
        }
      }

      const simplicityScore = formula.baseWeight / 200.0;

      const totalScore =
        (coverScore * WEIGHTS.COVER +
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
    });
  });

  results.sort((a, b) => b.score - a.score);

  const uniqueCandidates: CandidateResult[] = [];
  const seenNames = new Set<string>();

  results.forEach(res => {
    if (!seenNames.has(res.chordName)) {
      seenNames.add(res.chordName);
      uniqueCandidates.push(res);
    }
  });

  const bestRootPitch = uniqueCandidates.length > 0 ? uniqueCandidates[0].rootPitch : lowestNote.pitchIndex;

  return { candidates: uniqueCandidates, bestRootPitch };
}

export function analyzeChordGraph(
  notes: NoteInput[],
  explicitRootPitch: number | null
): { candidates: CandidateResult[]; bestRootPitch: number } {
  if (notes.length === 0) {
    return { candidates: [], bestRootPitch: 0 };
  }

  const cacheKey = `${explicitRootPitch ?? 'auto'}:${notes.map(n => `${n.stringIndex}_${n.pitchIndex}`).join('|')}`;

  if (chordAnalysisCache.has(cacheKey)) {
    return chordAnalysisCache.get(cacheKey)!;
  }

  const result = rawAnalyzeChordGraph(notes, explicitRootPitch);

  if (chordAnalysisCache.size >= 60) {
    const oldestKey = chordAnalysisCache.keys().next().value;
    if (oldestKey) chordAnalysisCache.delete(oldestKey);
  }

  chordAnalysisCache.set(cacheKey, result);
  return result;
}
