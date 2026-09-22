/**
 * 和弦排序：排序元数据预计算、比较器、分组排序规则选项。
 *
 * 从 theory.ts 抽出（原 39、959~989、1070~1110、1120~1127、1136、1144~1211 行）。
 * isMinorFlavoredQuality / isDimFlavoredQuality / qualityKindOf / DIATONIC_* 为跨模块共享，
 * 由 theory.shared 提供。
 */

import { GroupSortRule } from '@/domains/chord/types';

import { getChordName, parseChordName, ROOT_PITCH_MAP } from './chordName';
import { computeIsInverted, resolveChordRootPitch } from './chordSearch';
import { calcPitchIndex } from './pitch';
import {
  DIATONIC_DEGREE_MAP,
  DIATONIC_INTERVALS_MASK,
  isMinorFlavoredQuality,
  MINOR_DIATONIC_DEGREE_MAP,
  MINOR_DIATONIC_INTERVALS_MASK,
  qualityKindOf,
} from './theory.shared';
import { getBaseStringsFor } from './tuning';

import type { Chord } from '@/domains/chord/types';
import type { SegmentOption } from '@/platform/ui/segmented/segmentOption';

/** 判断相对根音的音程是否属于和弦特征音（根音/小三/大三/纯五度）。 */
const isChordToneRelative = (rel: number) => rel === 0 || rel === 3 || rel === 4 || rel === 7;

/** 统计指法中相对根音的"和弦外音"（非特征音）数量，并用 12 位位掩码记录出现的音级。 */
const getColorNoteCountAndPitches = (chord: Chord, rootPitch: number) => {
  if (rootPitch === 99) return { colorNoteCount: 0, pitchMask: 0 };
  const baseStrings = getBaseStringsFor(chord.tuning, chord.strings.length);
  let pitchMask = 0;
  const { strings } = chord;
  for (let sIdx = 0; sIdx < strings.length; sIdx++) {
    const str = strings[sIdx];
    if (str && str.fret >= 0) {
      const p = calcPitchIndex(sIdx, str.fret, chord.fretOffset, baseStrings);
      pitchMask |= 1 << p;
    }
  }
  let count = 0;
  for (let p = 0; p < 12; p++) {
    if ((pitchMask & (1 << p)) === 0) continue;
    const rel = (p - rootPitch + 12) % 12;
    if (!isChordToneRelative(rel)) count++;
  }
  return { colorNoteCount: count, pitchMask };
};

/**
 * 和弦复杂度等级（按名称后缀推断，避免指板八度重复干扰）：
 * 0 = 三和弦/基础（无 7/9/11/13），1 = 七和弦族，2 = 九和弦及以上。
 * 排序时由简到繁，保证 Em 早于 Em7/E7。
 */
const getComplexityRank = (suffix: string): number => {
  if (/(9|11|13)/.test(suffix)) return 2;
  if (/7/.test(suffix)) return 1;
  return 0;
};

interface SortMeta {
  chord: Chord;
  name: string; // 标准全称，供并列兜底比较器复用（比较器内若现场调 getChordName 会变成 O(n log n) 次拼名）
  rootPitch: number;
  isInverted: boolean;
  colorNoteCount: number;
  complexityRank: number; // 和弦复杂度：三和弦 0 / 七和弦 1 / 九和弦+ 2
  qualityRank: number; // 同根音下性质聚类：小调类 0 / 其他 1，使 Em 与扩展 Em7 相邻
  qualityKind: 'maj' | 'min' | 'dim'; // 三和弦性质（大/小/减），用于「调内级数」校验性质是否匹配调的该级
}

/** 排序元数据缓存：元数据只由和弦自身内容决定，按对象引用缓存即可
 *  （和弦库的保存路径总是 new 出新对象、草稿是 cloneDeep 副本，故不会读到被原地改动的旧数据）。
 *  排序每次调用都要为全库每个和弦构建元数据，而列表可能因一次键入、一次切换排序规则重排多次 */
const sortMetaCache = new WeakMap<object, SortMeta>();

/** 预计算单个和弦的排序元数据（根音/转位/复杂度/性质聚类等），供排序比较器复用。 */
const buildSortMeta = (chord: Chord): SortMeta => {
  const cached = sortMetaCache.get(chord);
  if (cached) return cached;

  const name = getChordName(chord);
  const parsed = parseChordName(name);
  const rootPitch =
    parsed.rootPitch !== 99
      ? parsed.rootPitch
      : resolveChordRootPitch(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex);
  const { colorNoteCount } = getColorNoteCountAndPitches(chord, rootPitch);
  const meta: SortMeta = {
    chord,
    name,
    rootPitch,
    isInverted: computeIsInverted(chord.strings, chord.fretOffset, chord.tuning, chord, chord.rootStringIndex),
    colorNoteCount,
    complexityRank: getComplexityRank(parsed.suffix),
    qualityRank: isMinorFlavoredQuality(parsed.quality) ? 0 : 1,
    qualityKind: qualityKindOf(parsed.quality),
  };
  sortMetaCache.set(chord, meta);
  return meta;
};

/**
 * 取和弦是否转位（走 sortMetaCache 的引用级缓存）。
 *
 * 裸调 computeIsInverted 要跑 collectNotes（逐音位算音高）+ 根音推导（名字解析或音集分析），
 * 而排序比较器在一次排序里被调用 n·log n 次、同一个和弦被反复求值 —— 同名变体排序
 * （chordGrouping 的 sortVariants）改用它之后，每个和弦只算一次；转位信息本就在排序元数据里，
 * 复用同一份缓存也避免了「两处各自记忆化、各自一套失效前提」。
 */
export const getChordIsInverted = (chord: Chord): boolean => buildSortMeta(chord).isInverted;

/** 分组排序规则选项（供 BaseSegmentedControl 等 UI 使用） */
export const SORT_RULE_CONFIG = <SegmentOption<GroupSortRule>[]>[
  { label: '级数', value: GroupSortRule.KEY_DEGREE },
  { label: 'C-B', value: GroupSortRule.ROOT_PITCH },
  { label: 'A-Z', value: GroupSortRule.NAME_ASC },
];

/**
 * 和弦名排序比较器（模块级单例）。
 *
 * 不用 `String.prototype.localeCompare`：后者每次调用都要重新解析默认 locale 与选项，
 * 而比较器在一次排序里会被调用 n·log n 次。`new Intl.Collator()` 不传参数即与
 * `localeCompare(b)` 语义完全一致（同为默认 locale、默认选项），只是把解析结果复用。
 */
const NAME_COLLATOR = new Intl.Collator();

/**
 * 按分组排序规则排列和弦：
 * NAME_ASC 按名称字典序；ROOT_PITCH 按根音 C-B 依次比较转位/复杂度/性质；
 * KEY_DEGREE 优先级内调内音级靠前，同度数按五度圈顺序（降 7 级在 6 级之前）。
 * 无法识别的规则返回原序副本。
 */
export const sortChordsByRule = (chords: Chord[], rule?: GroupSortRule, sortKey = 'C'): Chord[] => {
  if (chords.length <= 1) return chords.slice();
  const effectiveRule: GroupSortRule = rule ?? GroupSortRule.ROOT_PITCH;
  if (effectiveRule === GroupSortRule.NAME_ASC)
    // 预映射 [chord, name] 后再排序：避免比较器内 O(n log n) 次重复 getChordName 拼名，
    // 与下方 ROOT_PITCH/KEY_DEGREE 分支先 buildSortMeta 再比较的预构建模式保持一致
    // （两个分支的并列兜底都取已缓存的 meta.name，比较器内不再有任何 getChordName 调用）
    return chords
      .map((chord): [Chord, string] => [chord, getChordName(chord)])
      .sort((a, b) => NAME_COLLATOR.compare(a[1], b[1]))
      .map(pair => pair[0]);

  const n = chords.length;
  const mappedList: SortMeta[] = new Array(n);
  for (let i = 0; i < n; i++) mappedList[i] = buildSortMeta(chords[i]!);

  if (effectiveRule === GroupSortRule.ROOT_PITCH)
    mappedList.sort((a, b) => {
      if (a.rootPitch !== b.rootPitch) return a.rootPitch - b.rootPitch;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank;
      if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return NAME_COLLATOR.compare(a.name, b.name);
    });
  else if (effectiveRule === GroupSortRule.KEY_DEGREE) {
    // 支持大小调调名（'A' 或 'Am'）；关键音高取根音字母，小调用自然小调的三音程性质表
    const isMinorKey = /m(in)?$/i.test(sortKey.trim());
    const keyLetter = sortKey.trim().replace(/m(in)?$/i, '');
    const keyPitch = ROOT_PITCH_MAP[keyLetter] ?? 0;
    // 各级三和弦期望性质（index = degree 1~7）：大调 I/ii/iii/IV/V/vi/vii°；自然小调 i/ii°/III/iv/v/VI/VII
    const DEGREE_QUALITY = isMinorKey
      ? ['', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']
      : ['', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
    // 调内掩码与度数表随调性切换：自然小调的 3/6/7 级比大调低半音，沿大调表会把 III/VI/VII 判成调外
    const DEGREE_MAP = isMinorKey ? MINOR_DIATONIC_DEGREE_MAP : DIATONIC_DEGREE_MAP;
    const SCALE_MASK = isMinorKey ? MINOR_DIATONIC_INTERVALS_MASK : DIATONIC_INTERVALS_MASK;
    mappedList.sort((a, b) => {
      let aDiatonic = false;
      let bDiatonic = false;
      let aDegree = 99;
      let bDegree = 99;
      if (a.rootPitch !== 99) {
        const ia = (a.rootPitch - keyPitch + 12) % 12;
        aDegree = DEGREE_MAP[ia] ?? 99;
        // 真正的调内和弦需「根音在调内」且「三和弦性质匹配该级」：D 是大调 IV（调内），Dm 是借用 iv，不得与 D 同级
        const rootInScale = (SCALE_MASK & (1 << ia)) !== 0;
        aDiatonic = rootInScale && a.qualityKind === DEGREE_QUALITY[aDegree];
      }
      if (b.rootPitch !== 99) {
        const ib = (b.rootPitch - keyPitch + 12) % 12;
        bDegree = DEGREE_MAP[ib] ?? 99;
        const rootInScale = (SCALE_MASK & (1 << ib)) !== 0;
        bDiatonic = rootInScale && b.qualityKind === DEGREE_QUALITY[bDegree];
      }
      if (aDiatonic !== bDiatonic) return aDiatonic ? -1 : 1;
      if (aDegree !== bDegree) return aDegree - bDegree;
      if (a.isInverted !== b.isInverted) return a.isInverted ? 1 : -1;
      if (a.complexityRank !== b.complexityRank) return a.complexityRank - b.complexityRank;
      if (a.qualityRank !== b.qualityRank) return a.qualityRank - b.qualityRank;
      if (a.colorNoteCount !== b.colorNoteCount) return a.colorNoteCount - b.colorNoteCount;
      return NAME_COLLATOR.compare(a.name, b.name);
    });
  } else return chords.slice();

  const out = new Array<Chord>(n);
  for (let i = 0; i < n; i++) out[i] = mappedList[i]!.chord;
  return out;
};
