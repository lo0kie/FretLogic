export interface NoteInput {
  stringIndex: number;
  pitchIndex: number; // 0~11
  label: string;
}

export interface AdvancedChordFormula {
  suffix: string;
  category: 'triad' | 'seventh' | 'extended' | 'altered' | 'sus';
  core: number[]; // 决定和弦基本属性的核心音
  anchor?: number[]; // 纯五度等支撑音
  extensions?: number[]; // 延伸音 (9, 11, 13)
  tolerated?: number[]; // 允许出现的变音
  conflicts: number[]; // 冲突排他音
  baseWeight: number; // 固有权重分 (10~200)
}

export interface CandidateResult {
  chordName: string;
  rootLabel: string;
  score: number;
  rootPitch: number;
}

// 全量拓扑和弦公式定义
export const ALL_ADVANCED_FORMULAS: AdvancedChordFormula[] = [
  // --- 三和弦系列 ---
  { suffix: '', category: 'triad', core: [0, 4], anchor: [7], conflicts: [1, 3, 5, 8, 10, 11], baseWeight: 100 },
  { suffix: 'm', category: 'triad', core: [0, 3], anchor: [7], conflicts: [1, 4, 8, 10, 11], baseWeight: 100 },
  { suffix: 'dim', category: 'triad', core: [0, 3, 6], conflicts: [4, 7], baseWeight: 70 },
  { suffix: 'aug', category: 'triad', core: [0, 4, 8], conflicts: [3, 7], baseWeight: 70 },
  { suffix: 'sus4', category: 'sus', core: [0, 5], anchor: [7], conflicts: [3, 4], baseWeight: 80 },
  { suffix: 'sus2', category: 'sus', core: [0, 2], anchor: [7], conflicts: [3, 4], baseWeight: 80 },
  { suffix: '5', category: 'triad', core: [0, 7], conflicts: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11], baseWeight: 50 },

  // --- 七和弦系列 ---
  { suffix: '7', category: 'seventh', core: [0, 4, 10], anchor: [7], conflicts: [3, 11], baseWeight: 130 },
  { suffix: 'Maj7', category: 'seventh', core: [0, 4, 11], anchor: [7], conflicts: [3, 10], baseWeight: 130 },
  { suffix: 'm7', category: 'seventh', core: [0, 3, 10], anchor: [7], conflicts: [4, 11], baseWeight: 130 },
  { suffix: 'mMaj7', category: 'seventh', core: [0, 3, 11], anchor: [7], conflicts: [4, 10], baseWeight: 120 },
  { suffix: 'm7b5', category: 'seventh', core: [0, 3, 6, 10], conflicts: [4, 7, 11], baseWeight: 120 },
  { suffix: 'dim7', category: 'seventh', core: [0, 3, 6, 9], conflicts: [4, 7, 10, 11], baseWeight: 120 },
  { suffix: '7sus4', category: 'sus', core: [0, 5, 10], anchor: [7], conflicts: [3, 4], baseWeight: 110 },
  { suffix: '7sus2', category: 'sus', core: [0, 2, 10], anchor: [7], conflicts: [3, 4], baseWeight: 110 },

  // --- 六和弦与加音和弦 ---
  { suffix: '6', category: 'triad', core: [0, 4, 9], anchor: [7], conflicts: [3, 10, 11], baseWeight: 110 },
  { suffix: 'm6', category: 'triad', core: [0, 3, 9], anchor: [7], conflicts: [4, 10, 11], baseWeight: 110 },
  { suffix: 'add9', category: 'triad', core: [0, 4, 2], anchor: [7], conflicts: [3, 10, 11], baseWeight: 100 },
  { suffix: 'madd9', category: 'triad', core: [0, 3, 2], anchor: [7], conflicts: [4, 10, 11], baseWeight: 100 },
  { suffix: '6/9', category: 'triad', core: [0, 4, 9, 2], anchor: [7], conflicts: [3, 10, 11], baseWeight: 120 },
  { suffix: 'm6/9', category: 'triad', core: [0, 3, 9, 2], anchor: [7], conflicts: [4, 10, 11], baseWeight: 120 },

  // --- 九和弦与高阶扩展和弦 ---
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
  COVER: 0.4, // 骨架覆盖率权重
  PURITY: 0.3, // 纯净度权重
  BASS: 0.15, // 转位置信度权重
  SIMPLICITY: 0.15, // 认知/表达简洁度权重
};

export function analyzeChordGraph(
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
      // 1. 骨架覆盖率 (Core Cover Check)
      const coreHitCount = formula.core.filter(i => intervalSet.has(i)).length;
      if (coreHitCount < formula.core.length) return; // 缺少核心音直接淘汰

      // 2. 排他碰撞检查 (Hard Conflict Check)
      const hasConflict = formula.conflicts.some(i => intervalSet.has(i));
      if (hasConflict) return; // 存在非法冲突音直接淘汰

      const coverScore = 1.0;

      // 3. 纯净度计算 (Purity Score)
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

      // 4. 低音转位置信度 (Bass Score)
      let bassScore = 1.0;
      if (isSlash) {
        if (explicitRootPitch !== null) {
          bassScore = 1.0;
        } else if (formula.core.includes(lowestInterval) || formula.anchor?.includes(lowestInterval)) {
          bassScore = 0.92; // 经典内音转位 (如 E7/D)
        } else if (formula.category === 'triad') {
          bassScore = 0.85; // 纯三和弦 Over 外音 Bass (如 A/B)
        } else {
          bassScore = 0.45; // 复杂延伸和弦 Over 外音 Bass
        }
      }

      // 5. 表达简洁度 (Simplicity Score)
      const simplicityScore = formula.baseWeight / 200.0;

      // 6. 综合加权得分 (0.0 ~ 100.0)
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
