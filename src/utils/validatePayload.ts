import { FRET_COUNTS } from '@/constants';
import type { Chord, Group, ImportExportPayload, Song } from '@/types';
import { GroupSortRule } from '@/types';
import { normalizeChord, pruneOrphanChordRefs } from '@/utils/chordMap';
import { cloneDeep } from '@/utils/cloneDeep';
import { computeChordFingerprint, Tuning } from '@/utils/musicTheory';

/** 备份包结构版本：每次结构变更（字段迁移/删除/语义调整）递增 */
export const CURRENT_PAYLOAD_VERSION = 4;

/**
 * 版本迁移：把任意旧版本 payload 逐级升级到当前版本。
 * 每档迁移负责一个具体结构变更，结构稳定后保留空实现作为版本标记。
 */
const PAYLOAD_MIGRATIONS: Record<number, (payload: ImportExportPayload) => void> = {
  1: () => {
    // v1 -> v2：isRoot/label/isAccidental/isInverted/fingerprint 等派生字段已移除，
    // 由 normalizeChord 在 sanitize 阶段统一清理，此处无需额外处理。
  },
  2: (payload: ImportExportPayload) => {
    // v2 -> v3：strings 由对象数组 [{fret, preferFlat}] 改为二维数组 [[fret, preferFlat]]；
    // 同时把历史遗留的数字 id 规范化为字符串（songs.chordMap 引用均为字符串，需保持匹配）
    payload.chords?.forEach(chord => {
      if (!chord || typeof chord !== 'object') return;
      if (typeof (chord as any).id === 'number') {
        (chord as any).id = String((chord as any).id);
      }
      if (
        Array.isArray(chord.strings) &&
        chord.strings.length === 6 &&
        chord.strings.some((s: any) => !Array.isArray(s))
      ) {
        chord.strings = chord.strings.map((s: any) => [
          typeof s?.fret === 'number' ? s.fret : -1,
          !!s?.preferFlat,
        ]) as Chord['strings'];
      }
    });
  },
  3: (payload: ImportExportPayload) => {
    // v3 -> v4：song.key 移除，改由 playKey + capo 实时派生。
    // sanitizeSongs 会兜底 playKey 并丢弃 key，此处防御性清理旧数据。
    payload.songs?.forEach((song: any) => {
      if (song && typeof song === 'object' && 'key' in song) {
        if (typeof song.playKey !== 'string' || !song.playKey) {
          song.playKey = typeof song.key === 'string' && song.key ? song.key : 'C';
        }
        delete song.key;
      }
    });
  },
};

/** 把输入 payload 版本抬升到当前版本（原地修改 + 返回新 version） */
const migratePayloadVersion = (payload: ImportExportPayload): ImportExportPayload => {
  let version = payload.version ?? 1;
  while (version < CURRENT_PAYLOAD_VERSION) {
    PAYLOAD_MIGRATIONS[version]?.(payload);
    version += 1;
  }
  return { ...payload, version: CURRENT_PAYLOAD_VERSION };
};

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
    .map((g: any) => {
      // 折叠状态为会话级，不再持久化；丢弃旧数据遗留的 collapsed 字段
      delete g.collapsed;
      return {
        ...g,
        sortRule: Object.values(GroupSortRule).includes(g.sortRule) ? g.sortRule : GroupSortRule.ROOT_PITCH,
        sortKey: g.sortRule === GroupSortRule.KEY_DEGREE && !g.sortKey ? 'C' : g.sortKey,
      };
    });
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
        issues.push(`chords[${index}] (${c.id}) 琴弦数组损坏 (必须为 6 弦)`);
        return false;
      }
      // 二维数组校验：每项必须是 [fret, preferFlat] 元组
      const isStringsValid = c.strings.every(
        (s: any) => Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] === 'boolean'
      );
      if (!isStringsValid) {
        issues.push(`chords[${index}] (${c.id}) 内部存在损坏的琴弦节点`);
        return false;
      }
      return true;
    })
    .map((c: any) => {
      const fretCount = FRET_COUNTS.includes(c.fretCount) ? c.fretCount : 3;
      const capo = typeof c.capo === 'number' && c.capo >= 0 && c.capo <= 12 ? c.capo : 0;
      const tuning = c.tuning && Object.values(Tuning).includes(c.tuning) ? c.tuning : Tuning.STANDARD;
      const chordName = String(c.chordName).trim();

      // 结构字段先收口；isInverted / fingerprint 已不再存储，normalizeChord 会清理旧数据遗留字段
      const draft: Chord = {
        ...c,
        chordName,
        fretCount,
        capo,
        tuning,
      };

      const { chord } = normalizeChord(draft);
      return chord;
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
    .map((s: any) => {
      // key 已改为由 playKey + capo 实时派生：旧数据若带 key 且 playKey 缺失则用 key 兜底，随后丢弃
      const legacyKey = typeof s.key === 'string' && s.key ? s.key : 'C';
      const cleaned = {
        ...s,
        lyrics: typeof s.lyrics === 'string' ? s.lyrics : '',
        capo: typeof s.capo === 'number' ? s.capo : 0,
        chordMap: s.chordMap && typeof s.chordMap === 'object' ? s.chordMap : {},
        lineIds: Array.isArray(s.lineIds) ? s.lineIds : [],
        playKey: typeof s.playKey === 'string' && s.playKey ? s.playKey : legacyKey,
      };
      delete cleaned.key;
      return cleaned;
    });
};
export const validateImportExportPayload = (data: unknown): ValidationResult => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, issues: ['检测到数据资产并非有效对象'] };
  }
  const issues: string[] = [];
  const raw = cloneDeep(data as Record<string, any>);
  // 先迁移旧版本到当前格式，再做结构校验（校验只认当前格式）
  const migrated = migratePayloadVersion(raw as unknown as ImportExportPayload);
  const groups = sanitizeGroups(migrated.groups, issues);
  const chords = sanitizeChords(migrated.chords, issues);
  const songs = migrated.songs !== undefined ? sanitizeSongs(migrated.songs, issues) : [];
  if (issues.length > 0) {
    return { isValid: false, issues };
  }
  const validGroupIds = new Set(groups.map(g => g.id));
  const filteredChords = chords.filter(c => validGroupIds.has(c.groupId));

  // 同组 + 同指纹只保留第一条（与保存时去重语义一致）
  const seenFpInGroup = new Set<string>();
  const dedupedChords: Chord[] = [];
  for (const c of filteredChords) {
    const key = `${c.groupId}::${computeChordFingerprint(c)}`;
    if (seenFpInGroup.has(key)) {
      // 不写入 issues，避免「仅重复」就整包拒绝；需要可观测可 console.warn
      console.warn(`[validatePayload] 丢弃同组重复指纹: ${c.chordName} (${c.id})`);
      continue;
    }
    seenFpInGroup.add(key);
    dedupedChords.push(c);
  }

  const validChordIds = new Set(dedupedChords.map(c => c.id));
  const cleanedSongs = songs.map(song => {
    const { map, changed } = pruneOrphanChordRefs(song.chordMap as Record<string, string>, validChordIds);
    return changed ? { ...song, chordMap: map } : song;
  });

  return {
    isValid: true,
    payload: {
      version: CURRENT_PAYLOAD_VERSION,
      groups,
      chords: dedupedChords,
      songs: cleanedSongs,
    },
    issues: [],
  };
};
