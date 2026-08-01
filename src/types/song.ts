import type { Chord } from './chord';

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  key: string;
  playKey: string;
  capo?: number;
  chordMap: Record<string | number, Chord>;
}
