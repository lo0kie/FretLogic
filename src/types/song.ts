// src/types/song.ts

import type { Chord } from './chord';

export interface LyricsLineItem {
  id: string; // 🌟 唯一行 ID，例如 'l_x8a2k9'
  text: string;
}

export interface Song {
  id: string;
  title: string;
  lyrics: string; // 保持 string 方便编辑与序列化，渲染时实时/动态解析生成 line.id
  lineIds?: string[]; // 🌟 持久化行的 ID 列表，保证换行/编辑时每行的 ID 保持稳定
  key: string;
  playKey: string;
  capo?: number;
  chordMap: Record<string | number, Chord>;
}
