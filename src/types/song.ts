export interface LyricsLineItem {
  id: string;
  text: string;
}

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  lineIds: string[];
  key: string;
  playKey: string;
  capo: number;
  chordMap: Record<string | number, string>;
}
