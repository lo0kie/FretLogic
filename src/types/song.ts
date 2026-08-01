import type { Chord } from './chord';

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  key: string; // 🌟 实际演唱/标配调式 (如 "C", "G")
  playKey: string; // 🌟 新增：指法调式 / 演奏调式 (如 "C", "G")
  capo?: number; // 🌟 变调夹位置
  chordMap: Record<string | number, Chord>;
}
