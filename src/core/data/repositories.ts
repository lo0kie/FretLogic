/**
 * v2 数据仓库层：基于 IndexedDB 的异步 repository。
 *
 * 职责：提供对 IDB 对象库的类型化读写，封装存储细节。
 * 与 UI 解耦；store 层负责把仓库数据映射为响应式状态。
 */
import { idb } from '@/core/storage';
import type { Chord, Group, Song } from '@/types';
import {
  createDefaultSettings,
  createDefaultSyncMeta,
  SETTINGS_KEY,
  SYNC_META_KEY,
  type AppSettings,
  type SyncMeta,
} from './contracts';

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

export interface SettingsRepository {
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  loadSyncMeta(): Promise<SyncMeta>;
  saveSyncMeta(meta: SyncMeta): Promise<void>;
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

type StoredSettings = { name: string } & AppSettings;
type StoredSyncMeta = { name: string } & SyncMeta;

export const settingsRepository: SettingsRepository = {
  async loadSettings() {
    const stored = await idb.get<StoredSettings>('settings', SETTINGS_KEY);
    if (!stored) return createDefaultSettings();
    const { name: _name, ...settings } = stored;
    void _name;
    return settings;
  },
  async saveSettings(settings) {
    await idb.put('settings', { name: SETTINGS_KEY, ...settings });
  },
  async loadSyncMeta() {
    const stored = await idb.get<StoredSyncMeta>('syncMeta', SYNC_META_KEY);
    if (!stored) return createDefaultSyncMeta();
    const { name: _name, ...meta } = stored;
    void _name;
    return meta;
  },
  async saveSyncMeta(meta) {
    await idb.put('syncMeta', { name: SYNC_META_KEY, ...meta });
  },
};
