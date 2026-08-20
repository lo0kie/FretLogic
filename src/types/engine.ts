export interface NoteInput {
  stringIndex: number;
  pitchIndex: number;
  label: string;
}

export interface CandidateResult {
  chordName: string;
  rootLabel: string;
  score: number;
  rootPitch: number;
}
