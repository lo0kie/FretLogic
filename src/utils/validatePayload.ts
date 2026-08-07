import { FRET_COUNTS } from '@/constants';
import type { Chord, Group, ImportExportPayload, Song } from '@/types';
import { pruneOrphanChordRefs } from '@/utils/chordMap';
import { cloneDeep } from '@/utils/cloneDeep';
import { computeChordFingerprint, computeIsInverted, TuningEnum } from '@/utils/musicTheory';
export interface ValidationResult {
  isValid: boolean;
  payload?: ImportExportPayload;
  issues: string[];
}
const sanitizeGroups = (groups: unknown, issues: string[]): Group[] => {
  if (!Array.isArray(groups)) {
    issues.push('groups 字段必须为数组');
    return [];
  }
  return groups
    .filter((g: any, index: number) => {
      if (!g || typeof g !== 'object' || typeof g.id !== 'string' || typeof g.name !== 'string') {
        issues.push(`groups[${index}] 结构损坏，缺失必要属性`);
        return false;
      }
      return true;
    })
    .map((g: any) => ({
      ...g,
      collapsed: typeof g.collapsed === 'boolean' ? g.collapsed : true,
      sortRule: ['ROOT_PITCH', 'KEY_DEGREE', 'NAME_ASC'].includes(g.sortRule) ? g.sortRule : 'ROOT_PITCH',
      sortKey: g.sortRule === 'KEY_DEGREE' && !g.sortKey ? 'C' : g.sortKey,
    }));
};
const sanitizeChords = (chords: unknown, issues: string[]): Chord[] => {
  if (!Array.isArray(chords)) {
    issues.push('chords 字段必须为数组');
    return [];
  }
  return chords
    .filter((c: any, index: number) => {
      if (!c || typeof c !== 'object') {
        issues.push(`chords[${index}] 不是有效的对象`);
        return false;
      }
      if (typeof c.id !== 'string' || typeof c.chordName !== 'string' || typeof c.groupId !== 'string') {
        issues.push(`chords[${index}] (${c.id || index}) 缺失基础识别属性`);
        return false;
      }
      if (!Array.isArray(c.strings) || c.strings.length !== 6) {
        issues.push(`chords[${index}] (${c.id}) 琴弦物理资产数组损坏 (必须为 6 弦)`);
        return false;
      }
      const isStringsValid = c.strings.every(
        (s: any) =>
          s &&
          typeof s === 'object' &&
          typeof s.fret === 'number' &&
          typeof s.preferFlat === 'boolean' &&
          typeof s.isRoot === 'boolean'
      );
      if (!isStringsValid) {
        issues.push(`chords[${index}] (${c.id}) 内部存在损坏的琴弦音符节点`);
        return false;
      }
      return true;
    })
    .map((c: any) => {
      const fretCount = FRET_COUNTS.includes(c.fretCount) ? c.fretCount : 3;
      const capo = typeof c.capo === 'number' && c.capo >= 0 && c.capo <= 12 ? c.capo : 0;
      const tuning = c.tuning || TuningEnum.STANDARD;
      const isInverted =
        typeof c.isInverted === 'boolean' ? c.isInverted : computeIsInverted(c.strings, capo, tuning, c.chordName);
      const fingerprint =
        c.fingerprint ||
        computeChordFingerprint({ chordName: c.chordName, capo, fretCount, tuning, strings: c.strings, isInverted });
      return { ...c, fretCount, capo, tuning, isInverted, fingerprint };
    });
};
const sanitizeSongs = (songs: unknown, issues: string[]): Song[] => {
  if (songs === undefined) return [];
  if (!Array.isArray(songs)) {
    issues.push('songs 字段必须为数组');
    return [];
  }
  return songs
    .filter((s: any, index: number) => {
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.title !== 'string') {
        issues.push(`songs[${index}] 结构损坏，缺失必要识别属性`);
        return false;
      }
      return true;
    })
    .map((s: any) => ({
      ...s,
      lyrics: typeof s.lyrics === 'string' ? s.lyrics : '',
      capo: typeof s.capo === 'number' ? s.capo : 0,
      chordMap: s.chordMap && typeof s.chordMap === 'object' ? s.chordMap : {},
      lineIds: Array.isArray(s.lineIds) ? s.lineIds : [],
      key: typeof s.key === 'string' && s.key ? s.key : 'C',
      playKey:
        typeof s.playKey === 'string' && s.playKey ? s.playKey : typeof s.key === 'string' && s.key ? s.key : 'C',
    }));
};
export const validateImportExportPayload = (data: unknown): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, issues: ['检测到数据资产并非有效对象'] };
  }
  const issues: string[] = [];
  const raw = cloneDeep(data as Record<string, any>);
  const groups = sanitizeGroups(raw.groups, issues);
  const chords = sanitizeChords(raw.chords, issues);
  const songs = raw.songs !== undefined ? sanitizeSongs(raw.songs, issues) : [];
  if (issues.length > 0) {
    return { isValid: false, issues };
  }
  const validGroupIds = new Set<string>(groups.map(g => g.id));
  const filteredChords = chords.filter(chord => validGroupIds.has(chord.groupId));

  // 清理 songs.chordMap 中指向已被过滤（结构损坏或所属分组不存在）的和弦 id，避免孤儿引用
  const validChordIds = new Set<string>(filteredChords.map(c => c.id));
  const cleanedSongs = songs.map(song => {
    const { map, changed } = pruneOrphanChordRefs(song.chordMap as Record<string, string>, validChordIds);
    return changed ? { ...song, chordMap: map } : song;
  });

  return {
    isValid: true,
    payload: {
      version: raw.version || 1,
      groups,
      chords: filteredChords,
      songs: cleanedSongs,
    },
    issues: [],
  };
};
