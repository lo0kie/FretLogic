import { getChordName, nameToSegments, parseChordName, ROOT_PITCH_MAP, segmentsToString } from './chordName';
import { chordQualityAstToIntervals, findRomanSuffixBySpelling, QUALITY_TOKENS } from './chordQualityAst';
import { findTokenByAst, parseQualityText } from './chordQualityAstParse';
import {
  DIATONIC_DEGREE_MAP,
  DIATONIC_INTERVALS_MASK,
  isDimFlavoredQuality,
  isMinorFlavoredQuality,
  MINOR_DIATONIC_DEGREE_MAP,
  MINOR_DIATONIC_INTERVALS_MASK,
} from './theory.shared';

import type { ChordOrName } from './chordName';
import type { ChordNameSegments, ExtensionSegment } from '@/domains/chord/types';

/**
 * 和弦在调性下的罗马数字级数、等音异名等价判定。
 *
 * 从 theory.ts 抽出（原 1369~1376、1388~1523、1525~1621、1626~1691 行）。
 * 性质口味判定（isMinorFlavoredQuality / isDimFlavoredQuality）与调内音级映射
 * （DIATONIC_*）来自 theory.shared / chordSort。
 */

export interface ChordDegreeResult {
  /** 罗马数字级数标注，如 'I', 'ii', 'V7', 'bVII', 'viiø7', 'I/3' */
  roman: string;
  /** 音阶音级编号 1~7，离调/无法识别为 0 */
  degree: number;
  /** 是否为调内自然和弦 */
  isDiatonic: boolean;
}

/**
 * 取性质串对应的罗马数字级数后缀（含同义写法）。
 *
 * 后缀数据已随 token 一起放进 `data/chord-qualities.json`（原先本文件里那张 111 行的
 * 按写法的 `ROMAN_SUFFIX_BY_QUALITY`）。此处保留两层查找：
 *
 * 1. **先按输入原样查**——输入的写法未必就是 token 的首选写法，可能是 `M7` / `min7` /
 *    `ø7` 任何一个已登记的拼写。
 * 2. **查不到则经 token 归一**——这一步对旧持久化数据里的任意残余写法（`min7b5`、`-7b5`）
 *    仍然必要。但归一后**不再需要二次查表**：后缀直接挂在 token 上，而原实现在这里还得拿
 *    `spellings[0]` 回原表再查一次——那一步正是「表按写法建、写法又远多于表里列出的」逼出来的绕行。
 */
const romanSuffixOf = (quality?: string): string => {
  if (!quality) return '';

  const direct = findRomanSuffixBySpelling(quality);
  if (direct !== undefined) return direct;

  const parsed = parseQualityText(quality);
  if (!parsed.recognized) return '';
  // 经 token 归一：`min7b5` → halfDim7 → 该 token 的 `ø7`
  const token = parsed.tokenId ? QUALITY_TOKENS.find(t => t.id === parsed.tokenId) : findTokenByAst(parsed.ast);
  return token?.romanSuffix ?? '';
};

export const getChordDegree = (chordOrName: ChordOrName | string, key: string = 'C'): ChordDegreeResult => {
  const empty: ChordDegreeResult = { roman: '', degree: 0, isDiatonic: false };
  if (!chordOrName || !key) return empty;

  const rawChordName = typeof chordOrName === 'string' ? chordOrName : getChordName(chordOrName);
  if (!rawChordName) return empty;

  const parsed = parseChordName(rawChordName);
  if (parsed.rootPitch === 99) return empty;

  const trimmedKey = key.trim();
  const isMinorKey = /m(in)?$/i.test(trimmedKey);
  const keyRootLabel = trimmedKey.replace(/m(in)?$/i, '');
  const keyRootPitch = ROOT_PITCH_MAP[keyRootLabel] ?? 0;

  // 相对调根音的半音差 [0, 11]
  const interval = (parsed.rootPitch - keyRootPitch + 12) % 12;

  interface DegreeDef {
    degree: number;
    base: string;
    isDiatonic: boolean;
  }

  // 大调音级：0: I, 2: II (ii), 4: III (iii), 5: IV, 7: V, 9: VI (vi), 11: VII (vii°)
  const MAJOR_INTERVAL_MAP: Record<number, DegreeDef> = {
    0: { degree: 1, base: 'I', isDiatonic: true },
    1: { degree: 2, base: 'bII', isDiatonic: false },
    2: { degree: 2, base: 'II', isDiatonic: true },
    3: { degree: 3, base: 'bIII', isDiatonic: false },
    4: { degree: 3, base: 'III', isDiatonic: true },
    5: { degree: 4, base: 'IV', isDiatonic: true },
    6: { degree: 5, base: 'bV', isDiatonic: false },
    7: { degree: 5, base: 'V', isDiatonic: true },
    8: { degree: 6, base: 'bVI', isDiatonic: false },
    9: { degree: 6, base: 'VI', isDiatonic: true },
    10: { degree: 7, base: 'bVII', isDiatonic: false },
    11: { degree: 7, base: 'VII', isDiatonic: true },
  };

  // 小调音级（自然小调为调内基准）：0: I (i), 2: II (ii°), 3: III, 5: IV (iv), 7: V (v/V), 8: VI, 10: VII,
  // 11: #VII（和声/旋律小调的升七级导音，非自然小调调内音）
  const MINOR_INTERVAL_MAP: Record<number, DegreeDef> = {
    0: { degree: 1, base: 'I', isDiatonic: true },
    1: { degree: 2, base: 'bII', isDiatonic: false },
    2: { degree: 2, base: 'II', isDiatonic: true },
    3: { degree: 3, base: 'III', isDiatonic: true },
    4: { degree: 3, base: '#III', isDiatonic: false },
    5: { degree: 4, base: 'IV', isDiatonic: true },
    6: { degree: 5, base: 'bV', isDiatonic: false },
    7: { degree: 5, base: 'V', isDiatonic: true },
    8: { degree: 6, base: 'VI', isDiatonic: true },
    9: { degree: 6, base: '#VI', isDiatonic: false },
    10: { degree: 7, base: 'VII', isDiatonic: true },
    11: { degree: 7, base: '#VII', isDiatonic: false },
  };

  const def = (isMinorKey ? MINOR_INTERVAL_MAP[interval] : MAJOR_INTERVAL_MAP[interval]) ?? {
    degree: 1,
    base: 'I',
    isDiatonic: false,
  };

  // 调内音的半音位掩码（相对调根音）。小调额外并入**升七级导音**（和声小调），
  // 否则 `E7` 在 Am 下会因 G# 被判离调 —— 而它恰是 A 小调最标准的属七（V7）。
  // 升六级（旋律小调）不并入：根音判据那边（MINOR_INTERVAL_MAP 的 #VI）也把它算离调，
  // 两处口径保持一致，免得出现「根音离调、构成音却算调内」这种自相矛盾的结论。
  const diatonicMask = isMinorKey ? MINOR_DIATONIC_INTERVALS_MASK | (1 << 11) : DIATONIC_INTERVALS_MASK;

  /**
   * 和弦的**全部构成音**是否都落在调内。
   *
   * 原先 isDiatonic 只看根音（def.isDiatonic），于是「根音在调内、和弦内部却含离调音」的和弦
   * 一律被算作调内：C 大调里 E7（含 G#）、A7（C#）、D7（F#）、Fm（Ab）全部报 true。
   * 这类和弦在和声学上正是副属与调式借用，是要被区分出来的一类，不该与 I / IV / V 同判。
   *
   * 音集展开复用 chordQualityAstToIntervals：识别层与这里共用同一份「性质 → 音程」推导。
   * 不在此另写一套 —— 另写必然与扩展堆叠（13 蕴含 9）、omit 标记、6 与 13 的同音折叠等口径漂移。
   *
   * 斜杠低音**不参与**判定：它标记的是转位，不改变和弦本身的调内性。
   */
  const chordTonesAllInKey = (quality?: string): boolean => {
    if (!quality) return true;
    const parsedQuality = parseQualityText(quality);
    // 性质无法识别：不拿兜底的「大三和弦」去定它的罪，交由 def.isDiatonic 单独决定
    if (!parsedQuality.recognized) return true;
    return chordQualityAstToIntervals(parsedQuality.ast).all.every(
      semitone => (diatonicMask & (1 << ((interval + semitone) % 12))) !== 0
    );
  };

  const isDiatonic = def.isDiatonic && chordTonesAllInKey(parsed.quality);

  const isMinorChord = isMinorFlavoredQuality(parsed.quality);
  // 「是不是减」只读性质 AST 一处：与 qualityKindOf / 识别层共用同一个 isDimFlavoredQuality，
  // 不再对拼接 suffix 跑 `/^(dim|°|ø|m7b5)/` —— 那条正则必然漏写法
  // （`min7b5` / `-7b5` / `ø7` 都不在它的候选里），而读 AST 字段天然覆盖全部拼写。
  const isDim = isDimFlavoredQuality(parsed.quality);

  const prefixMatch = def.base.match(/^([b#])?(.*)$/);
  const prefix = prefixMatch?.[1] ?? '';
  let romanBody = prefixMatch?.[2] ?? def.base;

  // 小调与减和弦用小写罗马数字
  if (isMinorChord || isDim) romanBody = romanBody.toLowerCase();

  // 级数后缀统一走 token 表（后缀随配方存在数据文件里）：
  // 原 if-else 链仅命中 11 类，9~13 / add 家族（除 add9）/ 6 / aug7 等此前静默丢失，现已补齐且不会漂移。
  // 'm7b5' 与 'ø7' 都是 halfDim7 的写法、后缀同为 'ø7'；裸 'ø' 由 token 内的按写法覆盖记作 'ø'，无需分支特判
  const romanSuffix = romanSuffixOf(parsed.quality);

  let finalRoman = `${prefix}${romanBody}${romanSuffix}`;

  // 斜杠转位低音：若存在，计算低音相对调根音的音级，格式化为 /3, /5, /7 等
  if (parsed.hasBass && parsed.bassPitch !== 99) {
    const bassInterval = (parsed.bassPitch - keyRootPitch + 12) % 12;
    const bassDegree = (isMinorKey ? MINOR_DIATONIC_DEGREE_MAP : DIATONIC_DEGREE_MAP)[bassInterval] ?? 1;
    finalRoman = `${finalRoman}/${bassDegree}`;
  }

  return {
    roman: finalRoman,
    degree: def.degree,
    isDiatonic,
  };
};

/**
 * 判定两个和弦名称或分片在乐理上是否等价（支持等音异名根音/低音兼容，如 Bbadd9/F# ≡ A#add9/F#，C#m7 ≡ Dbm7）
 */
export const areChordsEnharmonicallyEquivalent = (
  chordA: string | ChordNameSegments | null | undefined,
  chordB: string | ChordNameSegments | null | undefined
): boolean => {
  if (!chordA || !chordB) return false;

  // 1. 快速文本全等命中（纯文本比对）
  if (typeof chordA === 'string' && typeof chordB === 'string') if (chordA.trim() === chordB.trim()) return true;

  // 2. 解析两者的结构化分片
  const segsA = typeof chordA === 'string' ? nameToSegments(chordA) : chordA;
  const segsB = typeof chordB === 'string' ? nameToSegments(chordB) : chordB;

  if (!segsA || !segsB) {
    // 若有非结构化字符串，退化为 trim 后比对
    const strA = typeof chordA === 'string' ? chordA.trim() : segmentsToString(chordA).trim();
    const strB = typeof chordB === 'string' ? chordB.trim() : segmentsToString(chordB).trim();
    return strA === strB;
  }

  // 3. 比较根音音高（Pitch mod 12）
  const letterPitchA = ROOT_PITCH_MAP[segsA.root[0]] ?? 0;
  const pitchA = (letterPitchA + segsA.root[1] + 12) % 12;

  const letterPitchB = ROOT_PITCH_MAP[segsB.root[0]] ?? 0;
  const pitchB = (letterPitchB + segsB.root[1] + 12) % 12;

  if (pitchA !== pitchB) return false;

  // 4. 比较和弦性质（quality 与 unknownQuality 统合）
  // 大小写在此**承载语义**（m=小三 / M=大三），而 nameToSegments 仅在整词命中时把性质归一到
  // 标准拼写、组合写法（m7#9 / M7#9）原样保留 spelling（见 chordName.ts:178-183、以及
  // chordQualityAstParse 中「tokenId 只在整词命中给出」的契约）。此前统一 toLowerCase 会把
  // Dm7#9 与 DM7#9 判成同一和弦 → 移调/候选选中据此写回错误指法（P1 审计 #11）。
  // 故：两侧都是已知性质（quality）时精确比对；仅「未知性质」（自由拼写兜底）才折叠大小写。
  const qualityA = (segsA.quality ?? segsA.unknownQuality ?? '').trim();
  const qualityB = (segsB.quality ?? segsB.unknownQuality ?? '').trim();
  if (segsA.quality !== undefined && segsB.quality !== undefined) {
    if (qualityA !== qualityB) return false;
  } else if (qualityA.toLowerCase() !== qualityB.toLowerCase()) return false;

  // 5. 比较斜杠低音（若存在，比较音高 mod 12）
  const hasBassA = Boolean(segsA.bass);
  const hasBassB = Boolean(segsB.bass);
  if (hasBassA !== hasBassB) return false;

  if (segsA.bass && segsB.bass) {
    const bassLetterA = ROOT_PITCH_MAP[segsA.bass[0]] ?? 0;
    const bassPitchA = (bassLetterA + segsA.bass[1] + 12) % 12;

    const bassLetterB = ROOT_PITCH_MAP[segsB.bass[0]] ?? 0;
    const bassPitchB = (bassLetterB + segsB.bass[1] + 12) % 12;

    if (bassPitchA !== bassPitchB) return false;
  }

  // 6. 比较扩展音（extensions）
  const extA = segsA.extensions ?? [];
  const extB = segsB.extensions ?? [];
  if (extA.length !== extB.length) return false;

  // 元组第二位可省：`[9]` 与 `[9, 0]` 是同一个「九音、无升降」，拼签名时必须先折算成同一形态
  // （与 normalizeChord.areSegmentsEqual 的 `${deg}:${acc ?? 0}` 同口径）。
  // 此前直接用裸 `a`，`[9, undefined]` 拼成 `9:undefined`、`[9, 0]` 拼成 `9:0`，两者判为不等价 ——
  // 同一和弦的两份等义分片会被判成不同和弦，移调/候选写回据此选中错误指法。
  const extSig = (list: ExtensionSegment[]): string =>
    list
      .map(([d, a]) => `${d}:${a ?? 0}`)
      .sort()
      .join(',');
  return extSig(extA) === extSig(extB);
};
