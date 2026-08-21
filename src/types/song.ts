export interface Song {
  id: string;
  title: string;
  lyrics: string;
  lineIds: string[];
  playKey: string;
  capo: number;
  chordMap: Record<string, string>;
  version?: number;
}
