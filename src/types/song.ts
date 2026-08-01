import type { Chord } from './chord';

export interface Song {
  id: string;
  title: string;
  lyrics: string;
  key?: string; // 🌟 调性 (如 "C", "G", "F#m")
  capo?: number; // 🌟 变调夹位置
  chordMap: Record<string | number, Chord>; // 支持字符索引与行首尾 key (如 "line_0_start")
}
