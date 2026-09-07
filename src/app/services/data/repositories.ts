/**
 * v2 数据仓库层：基于 IndexedDB 的异步 repository。
 *
 * 职责：提供对 IDB 对象库的类型化读写，封装存储细节。
 * 与 UI 解耦；store 层负责把仓库数据映射为响应式状态。
 */
import { idb } from '@/platform/services/storage';

import type { Chord, Group } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

export interface ChordRepository {
  loadGroups(): Promise<Group[]>;
  loadChords(): Promise<Chord[]>;
  /** 全量保存（replace 语义） */
  saveGroups(groups: Group[]): Promise<void>;
  saveChords(chords: Chord[]): Promise<void>;
}

export interface SongRepository {
  loadSongs(): Promise<Song[]>;
  saveSong(song: Song): Promise<void>;
  saveSongs(songs: Song[]): Promise<void>;
  removeSong(id: string): Promise<void>;
}

export const chordRepository: ChordRepository = {
  async loadGroups() {
    return idb.getAll<Group>('groups');
  },
  async loadChords() {
    return idb.getAll<Chord>('chords');
  },
  async saveGroups(groups) {
    await idb.replaceAll('groups', groups);
  },
  async saveChords(chords) {
    await idb.replaceAll('chords', chords);
  },
};

export const songRepository: SongRepository = {
  async loadSongs() {
    return idb.getAll<Song>('songs');
  },
  async saveSong(song) {
    await idb.put('songs', song);
  },
  async saveSongs(songs) {
    await idb.replaceAll('songs', songs);
  },
  async removeSong(id) {
    await idb.delete('songs', id);
  },
};
