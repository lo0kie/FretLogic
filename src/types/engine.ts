export interface NoteInput {
  stringIndex: number;
  pitchIndex: number;
  label: string;
}

export interface AdvancedChordFormula {
  suffix: string;
  category: 'triad' | 'seventh' | 'extended' | 'altered' | 'sus';
  core: number[];
  anchor?: number[];
  extensions?: number[];
  tolerated?: number[];
  conflicts: number[];
  baseWeight: number;
}

export interface CandidateResult {
  chordName: string;
  rootLabel: string;
  score: number;
  rootPitch: number;
}
