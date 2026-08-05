import { FRET_COUNTS } from '@/constants';
import type { Chord, Group, ImportExportPayload, Song } from '@/types';
import { computeChordFingerprint, computeIsInverted, TuningEnum } from '@/utils/musicTheory';

const validateGroups = (groups: unknown, issues: string[]): Group[] => {
  if (!Array.isArray(groups)) {
    issues.push('groups 字段必须为数组');
    return [];
  }

  return groups.filter((g: any, index: number) => {
    if (!g || typeof g !== 'object' || typeof g.id !== 'string' || typeof g.name !== 'string') {
      issues.push(`groups[${index}] 结构损坏，缺失必要属性`);
      return false;
    }
    if (typeof g.collapsed !== 'boolean') g.collapsed = true;

    // 🌟 核心拦截 1：非法/缺失的 sortRule 统一重置为 ROOT_PITCH
    if (!['ROOT_PITCH', 'KEY_DEGREE', 'NAME_ASC'].includes(g.sortRule)) {
      g.sortRule = 'ROOT_PITCH';
    }
    if (g.sortRule === 'KEY_DEGREE' && !g.sortKey) {
      g.sortKey = 'C';
    }

    return true;
  });
};

const validateChords = (chords: unknown, issues: string[]): Chord[] => {
  if (!Array.isArray(chords)) {
    issues.push('chords 字段必须为数组');
    return [];
  }

  return chords.filter((c: any, index: number) => {
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

    const isStringsValid = c.strings.every((s: any) => {
      return (
        s &&
        typeof s === 'object' &&
        typeof s.fret === 'number' &&
        typeof s.preferFlat === 'boolean' &&
        typeof s.isRoot === 'boolean'
      );
    });
    if (!isStringsValid) {
      issues.push(`chords[${index}] (${c.id}) 内部存在损坏的琴弦音符节点`);
      return false;
    }

    if (!FRET_COUNTS.includes(c.fretCount)) c.fretCount = 3;
    if (typeof c.capo !== 'number' || c.capo < 0 || c.capo > 12) c.capo = 0;
    if (!c.tuning) c.tuning = TuningEnum.STANDARD;

    // 🌟 核心拦截 2：折中方案 - 仅当旧备份缺失 isInverted 或指纹时，执行一次洗白计算
    if (typeof c.isInverted !== 'boolean' || !c.fingerprint) {
      c.isInverted = computeIsInverted(c.strings, c.capo, c.tuning, c.chordName);
      c.fingerprint = computeChordFingerprint(c as Chord);
    }

    return true;
  });
};

const validateSongs = (songs: unknown, issues: string[]): Song[] | undefined => {
  if (songs === undefined) return undefined;

  if (!Array.isArray(songs)) {
    issues.push('songs 字段必须为数组');
    return [];
  }

  return songs.filter((s: any, index: number) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.title !== 'string') {
      issues.push(`songs[${index}] 结构损坏，缺失必要识别属性`);
      return false;
    }
    if (typeof s.lyrics !== 'string') s.lyrics = '';
    if (typeof s.capo !== 'number') s.capo = 0;
    if (!s.chordMap || typeof s.chordMap !== 'object') s.chordMap = {};
    if (!Array.isArray(s.lineIds)) s.lineIds = [];

    // 🌟 核心拦截 3：补齐老乐谱缺失的关键字段，避免引发白屏或空指针
    if (typeof s.key !== 'string' || !s.key) s.key = 'C';
    if (typeof s.playKey !== 'string' || !s.playKey) s.playKey = s.key;

    return true;
  });
};

export const cleanAndValidateData = (
  data: unknown,
  mode: 'import' | 'export' = 'import'
): data is ImportExportPayload => {
  const logPrefix = mode === 'import' ? '📥 原生导入校验' : '📤 原生导出清洗';

  if (!data || typeof data !== 'object') {
    console.error(`❌ ${logPrefix}失败！检测到资产并非有效对象。`);
    return false;
  }

  const payload = data as Record<string, any>;
  const issues: string[] = [];

  payload.groups = validateGroups(payload.groups, issues);
  payload.chords = validateChords(payload.chords, issues);

  if (payload.songs !== undefined) {
    payload.songs = validateSongs(payload.songs, issues);
  }

  if (issues.length > 0) {
    console.error(`❌ ${logPrefix}失败！检测到核心物理资产结构严重破损。`);
    console.group(`详细错误报告 (共 ${issues.length} 项违规):`);
    issues.forEach(msg => console.warn(msg));
    console.groupEnd();
    return false;
  }

  const validGroupIds = new Set<string>(payload.groups.map((g: Group) => g.id));
  payload.chords = payload.chords.filter((chord: Chord) => {
    if (!validGroupIds.has(chord.groupId)) {
      console.warn(`⚠️ ${logPrefix} -> 和弦 "${chord.chordName}" (${chord.id}) 外键关联失效，执行物理拦截脱离`);
      return false;
    }
    return true;
  });

  return true;
};

import { isProxy, toRaw } from 'vue';

/** 剥掉可能存在的多层 Vue Proxy，拿到真正的原始值 */
function unwrapRaw<T>(value: T): T {
  let cur: any = value;

  // 最多剥几层，防止异常对象死循环
  for (let i = 0; i < 8; i++) {
    if (cur === null || typeof cur !== 'object') break;

    if (isProxy(cur)) {
      cur = toRaw(cur);
      continue;
    }

    // 兜底：未走 isProxy 的边界情况
    const inner = cur.__v_raw ?? cur.__raw__;
    if (inner && inner !== cur) {
      cur = inner;
      continue;
    }

    break;
  }

  return cur as T;
}

export function cloneDeep<T>(value: T, cache = new WeakMap<object, any>()): T {
  // 原始类型 / function / symbol 直接返回
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const raw = unwrapRaw(value as any);

  // unwrap 后可能变成原始类型
  if (raw === null || typeof raw !== 'object') {
    return raw;
  }

  // 循环引用
  if (cache.has(raw)) {
    return cache.get(raw);
  }

  // —— 内置对象 ——
  if (raw instanceof Date) {
    return new Date(raw.getTime()) as any;
  }
  if (raw instanceof RegExp) {
    return new RegExp(raw.source, raw.flags) as any;
  }

  // —— Array：下标快路径（业务里最常见）——
  if (Array.isArray(raw)) {
    const len = raw.length;
    const out = new Array(len);
    cache.set(raw, out);
    for (let i = 0; i < len; i++) {
      out[i] = cloneDeep(raw[i], cache);
    }
    return out as any;
  }

  // —— Set / Map（历史、导入里偶尔会碰到）——
  if (raw instanceof Set) {
    const out = new Set<any>();
    cache.set(raw, out);
    raw.forEach(item => out.add(cloneDeep(item, cache)));
    return out as any;
  }
  if (raw instanceof Map) {
    const out = new Map<any, any>();
    cache.set(raw, out);
    raw.forEach((v, k) => {
      out.set(cloneDeep(k, cache), cloneDeep(v, cache));
    });
    return out as any;
  }

  // —— 普通对象：只拷可枚举 string key（和弦 / 乐谱 / HistoryState 足够）——
  // 不用 Reflect.ownKeys + defineProperty，避免拷 getter / 不可枚举噪声
  const out: Record<string, any> = {};
  cache.set(raw, out);

  const keys = Object.keys(raw);
  for (let i = 0, n = keys.length; i < n; i++) {
    const key = keys[i];
    out[key] = cloneDeep((raw as any)[key], cache);
  }

  return out as any;
}

export const getEditDistance = (a: string, b: string): number => {
  // ...保持原有...
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
};
