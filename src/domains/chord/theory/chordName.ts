/**
 * 和弦名解析 / 命名 / 性质格式化 / 根音音高。
 *
 * 从 theory.ts 抽出（原 26、156~530、652~665、772~775、781~841、1021~1030 行）。
 * 本文件内私有缓存与 helper（toChordNameKey / nameSegmentsCache / parsedChordNameCache /
 * astByNameCache / KNOWN_QUALITIES_SET）自持；chordQualityAstOfName 对外导出供 theory.shared 复用。
 */

import { createLruCache } from '@/platform/utils/cache';
import { estimateValueBytes } from '@/platform/utils/common';

import { isHalfDiminished, QUALITY_TOKENS } from './chordQualityAst';
import { parseQualityText, renderQualityAst } from './chordQualityAstParse';
import { isSelfConsistentQualityAst } from './chordQualityAstSemantics';

import type { ChordQualityAst } from './chordQualityAst';
import type {
  AccidentalType,
  ChordNameSegments,
  ExtensionSegment,
  NaturalPitchLetter,
  RootSegment,
} from '@/domains/chord/types';

/** 接受"和弦实体或名称字符串"的通用入参形态，统一多处多态签名 */
export interface ChordOrName {
  nameSegments?: ChordNameSegments | null;
  chordName?: string;
}

// 补齐等音异名（E#/Fb/B#/Cb），让根音解析对少见但合法的记谱更健壮
export const ROOT_PITCH_MAP: Record<string, number> = {
  'C': 0,
  'C#': 1,
  'Db': 1,
  'D': 2,
  'D#': 3,
  'Eb': 3,
  'E': 4,
  'E#': 5,
  'Fb': 4,
  'F': 5,
  'F#': 6,
  'Gb': 6,
  'G': 7,
  'G#': 8,
  'Ab': 8,
  'A': 9,
  'A#': 10,
  'Bb': 10,
  'B': 11,
  'B#': 0,
  'Cb': 11,
};

/** 解析结果：根音音高（可能为 99 = 无法解析），斜杠低音音高（可能为 99 = 无斜杠） */
export interface ParsedChordName {
  rootLabel: string;
  rootPitch: number;
  /** 斜杠低音（如 C/E 的 E），无斜杠时为 99 */
  bassLabel: string;
  bassPitch: number;
  /** 是否存在斜杠低音 */
  hasBass: boolean;
  /** 斜杠后的后缀（和弦性质，如 m7/6/sus4） */
  suffix: string;
  /**
   * 已识别的标准性质（来自 nameToSegments 的 token 表写法）；无性质/未知性质时为 undefined。
   *
   * 类型是 `string` 而非旧枚举联合 —— 值域真相源已从手抄的 `CHORD_QUALITIES`
   * 迁到 `QUALITY_TOKENS`，后者刻意收录了枚举里没有的同义写法（`min7b5` / `7#5` /
   * `Maj7(b5)` …），把它们排除在外正是「能输入却判非法」的来源。
   */
  quality?: string;
}

/**
 * 格式化升降号：统一支持数字（1/-1）、字符（# / b / ♯ / ♭）输入
 */
export const formatAccidental = (acc: AccidentalType | string | number | undefined, useUnicode = true): string => {
  if (acc === 1 || acc === '1' || acc === '#' || acc === '♯') return useUnicode ? '♯' : '#';
  if (acc === -1 || acc === '-1' || acc === 'b' || acc === '♭') return useUnicode ? '♭' : 'b';
  return '';
};

/** 将音名字符串（如 "C#", "Db", "F♯", "G"）解析为 RootSegment 元组 [natural, accidental] */
export const parsePitchSegment = (pitchStr: string): RootSegment | null => {
  if (!pitchStr) return null;
  const match = pitchStr.match(/^([A-G])([#b♯♭])?$/i);
  if (!match) return null;
  const [, naturalRaw, accChar] = match;
  const natural = naturalRaw!.toUpperCase() as NaturalPitchLetter;
  const accidental: AccidentalType =
    accChar === '#' || accChar === '♯' ? 1 : accChar === 'b' || accChar === '♭' ? -1 : 0;
  return [natural, accidental];
};

/** 序列化 PitchSegment 为字符串 */
export const pitchSegmentToString = (seg: RootSegment, useUnicode = false): string => {
  const [natural, acc] = seg;
  return `${natural}${formatAccidental(acc, useUnicode)}`;
};

/** 和弦名归一键：去首尾空白 + 全角括号转半角。
 *  分片 / 解析 / 根音三层缓存共用同一键空间——否则同一串名字（如「C（m7）」与「C(m7)」）
 *  会在各层分别占位，层级之间还可能互相击穿，白占条数。
 *  刻意不做大小写折叠：解析结果的 rootLabel 保留原文大小写（'cm7' 与 'Cm7' 的显示本就不同），
 *  折叠会让先写入者的形态改写另一方的显示。 */
const toChordNameKey = (chordName: string): string => chordName.trim().replace(/（/g, '(').replace(/）/g, ')');

// 以下是纯文本级小数据缓存（键为和弦名、值为几十~几百字节的结构/字符串）：
// 条数上限按「一个乐库里不同和弦名的量级」放宽到 4096，避免整库渲染时反复击穿导致解析重算
const nameSegmentsCache = createLruCache<ChordNameSegments | null>(4096, {
  name: '和弦名分词',
  weigh: (_, value) => estimateValueBytes(value),
});

/** 将任意和弦名文本解析为结构化分片 ChordNameSegments */
export const nameToSegments = (chordName: string): ChordNameSegments | null => {
  if (!chordName || typeof chordName !== 'string') return null;
  const normalized = toChordNameKey(chordName);
  const cached = nameSegmentsCache.get(normalized);
  if (cached !== undefined) return cached;

  // 1. 根音：从开头提取 [A-G][#b♯♭]?
  const rootMatch = normalized.match(/^([A-G][#b♯♭]?)/i);
  if (!rootMatch) {
    nameSegmentsCache.set(normalized, null);
    return null;
  }
  const root = parsePitchSegment(rootMatch[1]!);
  if (!root) {
    nameSegmentsCache.set(normalized, null);
    return null;
  }

  let remaining = normalized.slice(rootMatch[0].length);

  // 2. 斜杠低音：从末尾提取 /[A-G][#b♯♭]?（注意避免将 6/9 中的 /9 误判为斜杠低音）
  let bass: RootSegment | undefined = undefined;
  const bassMatch = remaining.match(/\/([A-G][#b♯♭]?)$/i);
  if (bassMatch && bassMatch.index !== undefined) {
    const parsedBass = parsePitchSegment(bassMatch[1]!);
    if (parsedBass) {
      bass = parsedBass;
      remaining = remaining.slice(0, bassMatch.index);
    }
  }

  const rest = remaining.trim();

  // 性质与张力音的切分（D10-A：以 AST token 表为 SSOT，不再用正则剥离张力音）。
  //
  // 半减七（m7b5 / m7(b5) / m7♭5 / ø7 …）是**一个完整的整质量**，整体保留为 'm7b5'——
  // 它的 b5 与真实张力音语法同形，若走「剥离张力」逻辑会被剥成 'm7' + b5 扩展音，
  // 使 CHORD_QUALITIES 里的 'm7b5' 成为自动解析永远产不出的死枚举。故先判 AST 是否为半减七。
  //
  // 其余写法一律取 AST 结果：整词命中（7b5 / 7#9 / 7(b9) / mb5 / no3 …）→ quality 即该 token 的
  // 标准写法（括号收敛、同义词取首选），不产生 extensions；组合写作（maj7#9 / sus4add9#11 …）→
  // 基础写法作 quality，张力音落 extensions。旧持久化形态（quality:'7' + extensions:[[9,1]]）
  // 由 normalizeChord 一次性迁移。
  const nameAst = parseQualityText(rest);
  // 下面三个分支（半减七 / 已识别 / 未识别）互斥且穷尽，quality 必被赋值——
  // 故不写初始值（写了也是死赋值，触发 eslint no-useless-assignment）
  let quality: string;
  const extensions: ExtensionSegment[] = [];

  if (isHalfDiminished(nameAst.ast)) {
    // 半减七：整体输出 'm7b5'，尾随扩展音（如 m7b5(b9)）照常单列
    quality = 'm7b5';
    for (const ext of nameAst.trailing) extensions.push([Number(ext.degree), ext.accidental]);
  } else if (nameAst.recognized) {
    // 取 AST 整词 quality（与半减七分支同源），不再手写正则剥离张力音（D10-A）：
    // - 整词命中（7#9 / 7b5 / 7b9 / 7#11 / no3 …）→ 经 renderQualityAst 归一到标准写法
    //   （括号收敛为无括号、同义写法取首选拼写），trailing 为空、不产生 extensions；
    // - 组合写作（maj7#9 / sus4add9#11 …）→ spelling 即基础写法，张力音在 trailing 单独列出。
    // 空性质串（裸三和弦 C）保持 quality=''。
    quality =
      nameAst.spelling === ''
        ? ''
        : nameAst.tokenId !== undefined
          ? renderQualityAst(nameAst.ast, { tokenId: nameAst.tokenId, spelling: nameAst.spelling })
          : nameAst.spelling;
    for (const ext of nameAst.trailing) extensions.push([Number(ext.degree), ext.accidental]);
  } else
    // 性质无法识别：保留原始文本，落 unknownQuality 兜底（与旧行为一致，isValidChordName 据此判非法）
    quality = rest;

  const result: ChordNameSegments = {
    root,
    // 已知性质收窄为 ChordQuality；未知残余降级落 unknownQuality（仅展示兜底）。
    // 张力整词（7#9 / 7b5 / no3 …）不在 KNOWN_QUALITIES 白名单里，但已被 AST 识别（recognized），
    // 属合法性质，一并收作 quality —— 否则会落入 unknownQuality，isValidChordName 据此误判为非法（D10-A）。
    ...(quality
      ? KNOWN_QUALITIES_SET.has(quality.toLowerCase()) || nameAst.recognized
        ? { quality: quality as ChordNameSegments['quality'] }
        : { unknownQuality: quality }
      : {}),
    extensions: extensions.length > 0 ? extensions : undefined,
    bass: bass ?? undefined,
  };
  nameSegmentsCache.set(normalized, result);
  return result;
};

/**
 * 已知的标准乐理和弦性质写法集合（供 UI / 文档列举用）。
 *
 * **校验路径不使用它**（合法性判据是「解析器能否识别」，见 isValidChordName），
 * 它只服务「有哪些标准写法」这类列举场景。
 *
 * 自本次改动起由 `QUALITY_TOKENS` 的 `spellings` 展平派生 —— 此前这里是 125 条的手抄镜像，
 * 实测已是 `spellings` 的真子集（少 54 项，多一个**不可达**的 `13sus2`：它不在任何 token 的
 * 写法里，解析器也永远产不出它），与注释自称的「值域真相源是 QUALITY_TOKENS」相互矛盾。
 * 派生之后，新增同义写法不会再出现「本清单漏了它」这类漂移。
 */
export const KNOWN_QUALITIES: string[] = QUALITY_TOKENS.flatMap(t => t.spellings);

const KNOWN_QUALITIES_SET = new Set(KNOWN_QUALITIES.map(q => q.toLowerCase()));

/**
 * 校验和弦名称是否在乐理与语法上合法。
 *
 * **判据已定为「解析器能否识别」，而非「写法是否在清单内」**（此为本轮明确裁决的语义）：
 * 1. 必须能解析出有效的根音（A~G，可选升降号）
 * 2. 性质必须被性质解析器识别；识别失败落 `unknownQuality`，即判非法
 * 3. 变化/扩展音度数必须在合理范围（2~13）
 * 4. 斜杠低音必须有效（解析器已校验，解析不出即不会写入 bass）
 * 5. **字段组合必须在乐理上自洽**（见 `chordQualityAstSemantics`）：
 *    新增于「字段化 AST」之后——旧的字符串枚举表达不了这类约束，
 *    于是 `third/fifth 同时 omit`、`dim7 配非减五` 这类**能解析成功但自相矛盾**的名字
 *    此前一律被判合法（重构文档里那条未拍板的待拍板事项）。现在补上这一层。
 *
 * 为什么不再用写法白名单：合法写法是**可组合**的（`sus4` + `add9` = `sus4add9`、
 * `7` + `b13` = `7b13`），有限清单无法覆盖可生成的语言。白名单方案的实测后果是
 * `Esus4add9` / `Cmin7b5` / `C7#5` 这类**解析器明明能完整解析**的名字被判成非法 ——
 * 「能输入、却存不下」。放宽后这类名字可正常保存；代价是保存门槛略降，
 * 即接受所有解析器认识的性质写法。
 */
export const isValidChordName = (chordName: string): boolean => {
  if (!chordName || typeof chordName !== 'string') return false;
  const trimmed = chordName.trim();
  if (!trimmed) return false;

  const segments = nameToSegments(trimmed);
  if (!segments || !segments.root) return false;

  // 出现 unknownQuality 即性质未被解析器识别（合法性质一律落 quality 字段）
  if (segments.unknownQuality) return false;

  if (segments.extensions && segments.extensions.length > 0) {
    const validDegrees = new Set([2, 4, 5, 6, 7, 9, 11, 13]);
    const allExtsValid = segments.extensions.every(([deg]) => validDegrees.has(Number(deg)));
    if (!allExtsValid) return false;
  }

  // 语义层：解析成功不等于讲得通。空性质串（裸三和弦 `C` / `C/E`）时该函数返回 null，
  // 跳过本层——大三和弦配方恒自洽，无需判定
  const qualityAst = chordQualityAstOfName(segments.quality ?? '');
  if (qualityAst && !isSelfConsistentQualityAst(qualityAst)) return false;

  return true;
};

/**
 * 和弦性质简写/符号映射（如 maj7 -> M7, dim -> °, aug -> +, dimMaj7 -> °M7）。
 *
 * ⚠️ 这是**遗留的按字符串**映射表。展示层的简写渲染已统一到 `toShorthandQuality`
 * （按 token 表的配方收敛，`min`/`-`/`Δ7` 等未被本表列出的写法也能正确简写）。
 * 本表保留有两个用途：① `toShorthandQuality` 对**未识别**性质的回退；
 * ② 既有单测（`tests/domain/chordSegments.test.ts`）锁定了它的输出。
 * 注意本表 `maj` → `M` 与 AST 路径的 `major` → `''`（大三和弦简写即裸音名）并不一致，
 * 但差异只在**已识别**性质上、而该分支已由 AST 路径接管，故不影响实际显示。
 */
export const SHORTHAND_QUALITY_MAP: Record<string, string> = {
  'maj7': 'M7',
  'maj9': 'M9',
  'maj11': 'M11',
  'maj13': 'M13',
  'maj': 'M',
  'dim': '°',
  'dim7': '°7',
  'dimMaj7': '°M7',
  'dimmaj7': '°M7',
  'dim(maj7)': '°M7',
  'dim(M7)': '°M7',
  'mMaj7': 'mM7',
  'mmaj7': 'mM7',
  'm(maj7)': 'mM7',
  'm(M7)': 'mM7',
  'mMaj9': 'mM9',
  'mmaj9': 'mM9',
  'm(maj9)': 'mM9',
  'm(M9)': 'mM9',
  'mMaj11': 'mM11',
  'mmaj11': 'mM11',
  'mMaj13': 'mM13',
  'mmaj13': 'mM13',
  'augMaj7': '+M7',
  'augmaj7': '+M7',
  'aug(maj7)': '+M7',
  'm7b5': 'ø7',
  'm7(b5)': 'ø7',
  'aug': '+',
  'aug7': '+7',
  'sus4': 'sus',
  '7sus4': '7sus',
  '9sus4': '9sus',
  '11sus4': '11sus',
  '13sus4': '13sus',
};

/** 格式化和弦性质（根据是否开启简写） */
export const formatChordQuality = (quality?: string, shorthand = false): string => {
  if (!quality) return '';
  if (!shorthand) return quality;
  return SHORTHAND_QUALITY_MAP[quality] ?? SHORTHAND_QUALITY_MAP[quality.toLowerCase()] ?? quality;
};

/**
 * 性质串 → 简写写法。**简写渲染的唯一实现**。
 *
 * `segmentsToString` 与 `vChordName` 都调它，避免出现「两套独立事实源」——
 * 那正是本次重构要消灭的问题：旧实现在两处各自维护一份简写逻辑，
 * 一处查 `SHORTHAND_QUALITY_MAP`，另一处还要额外特判 `m7` + `b5` → `ø7`。
 *
 * 主路径走 AST 渲染（与解析共用同一张 token 表）：
 * `min` / `min7` / `-7` 命中的都是同一个 token，自然收敛到同一简写；
 * 未识别的性质才回落旧映射表，保证未知输入原样透传。
 */
export const toShorthandQuality = (quality: string): string => {
  if (!quality) return '';
  const ast = parseQualityText(quality);
  if (!ast.recognized) return formatChordQuality(quality, true);
  return renderQualityAst(ast.ast, {
    shorthand: true,
    ...(ast.tokenId ? { tokenId: ast.tokenId } : {}),
    ...(ast.spelling !== undefined ? { spelling: ast.spelling } : {}),
  });
};

/** 将分片结构还原为标准和弦字符串 */
export const segmentsToString = (
  segments: ChordNameSegments,
  options: { useUnicode?: boolean; shorthand?: boolean } | boolean = false
): string => {
  const useUnicode = typeof options === 'boolean' ? options : (options.useUnicode ?? false);
  const shorthand = typeof options === 'boolean' ? false : (options.shorthand ?? false);

  const rootStr = pitchSegmentToString(segments.root, useUnicode);
  let quality = segments.quality ?? segments.unknownQuality ?? '';
  let extensions = segments.extensions ?? [];

  // 简写渲染：走写法映射表 `SHORTHAND_QUALITY_MAP`（与 `formatChordQuality` 同源），
  // 覆盖 maj→M、m7b5→ø7 等显式简写约定。
  if (shorthand) {
    // 半减七特判：quality 为 'm' / 'm7' 且带 b5 扩展音时（如结构化的 F#m7b5/A），
    // 应整体渲染为 'ø7' 并消费掉该 b5 扩展音，否则会拼成 'm7b5'（F♯m7b5/A）。
    const b5Idx = extensions.findIndex(([deg, acc]) => (deg === 5 || deg === '5') && acc === -1);
    if ((quality === 'm7' || quality === 'm') && b5Idx >= 0) {
      quality = 'ø7';
      extensions = extensions.filter((_, idx) => idx !== b5Idx);
    } else quality = formatChordQuality(quality, true);
  }

  // 整词 quality 自带变音（7#9 / 7b5 / m7b5 …）：偏好 unicode 时与扩展音同口径渲染为 ♯/♭，
  // 否则张力整词会在 unicode 显示下漏出 ASCII #/b（D10-A 整词化后的必要对齐）。
  if (useUnicode) quality = quality.replace(/#/g, '♯').replace(/b/g, '♭');

  const extsStr = extensions
    .map(([deg, acc]) => {
      const accStr = acc === 1 ? (useUnicode ? '♯' : '#') : acc === -1 ? (useUnicode ? '♭' : 'b') : '';
      return `${accStr}${deg}`;
    })
    .join('');
  const bassStr = segments.bass ? `/${pitchSegmentToString(segments.bass, useUnicode)}` : '';
  return `${rootStr}${quality}${extsStr}${bassStr}`;
};

/**
 * 获取和弦的标准名称字符串（以 AST nameSegments 为唯一真实源，支持 options）
 */
export const getChordName = (
  chord: (ChordOrName & { name?: string; customName?: string }) | null | undefined,
  options?: { shorthand?: boolean; useUnicode?: boolean }
): string => {
  if (!chord) return '';
  if (chord.nameSegments) return segmentsToString(chord.nameSegments, options);
  const rawName = chord.chordName || chord.name || chord.customName || '';
  if (rawName) {
    const segs = nameToSegments(rawName);
    if (segs) return segmentsToString(segs, options);
    return rawName;
  }
  return '';
};

/** 和弦名性质 AST 查询（带缓存）。本文件里「性质判定」的唯一入口，供 theory.shared 复用。 */
const astByNameCache = createLruCache<ChordQualityAst | null>(4096, {
  name: '和弦性质AST',
  weigh: (_, value) => estimateValueBytes(value),
});

/**
 * 由**性质串**取出性质 AST；解析不出时返回 null。
 *
 * 入参是性质文本（`m7b5` / `7alt` / `min`），不是完整和弦名 —— 调用点传的都是
 * `segments.quality`，本就没有根音。故用 `parseQualityText` 而非 `parseChordNameAst`
 * （后者要求开头是音名，喂性质串会一律判成「无根音」而返回 null）。
 */
export const chordQualityAstOfName = (quality: string): ChordQualityAst | null => {
  if (!quality) return null;
  const key = toChordNameKey(quality);
  const cached = astByNameCache.get(key);
  if (cached !== undefined) return cached;
  const parsed = parseQualityText(key);
  const ast = parsed.recognized ? parsed.ast : null;
  astByNameCache.set(key, ast);
  return ast;
};

/** 解析和弦名为结构化元数据（根音/低音音高、后缀），解析失败时返回空结果（pitch=99）。
 * @returns rootPitch 为 99 表示根音无法解析
 */
export const parseChordName = (chordName: string): ParsedChordName => {
  const empty: ParsedChordName = {
    rootLabel: '',
    rootPitch: 99,
    bassLabel: '',
    bassPitch: 99,
    hasBass: false,
    suffix: '',
  };
  if (!chordName || typeof chordName !== 'string') return empty;
  const key = toChordNameKey(chordName);
  if (!key) return empty;

  const cached = parsedChordNameCache.get(key);
  if (cached !== undefined) return cached;

  const segs = nameToSegments(key);
  if (!segs || !segs.root) {
    parsedChordNameCache.set(key, empty);
    return empty;
  }

  const rootLabel = pitchSegmentToString(segs.root, false);
  const rootPitch = ROOT_PITCH_MAP[rootLabel] ?? 99;

  let bassLabel = '';
  let bassPitch = 99;
  let hasBass = false;
  if (segs.bass) {
    hasBass = true;
    bassLabel = pitchSegmentToString(segs.bass, false);
    bassPitch = ROOT_PITCH_MAP[bassLabel] ?? 99;
  }

  const extsStr = segs.extensions
    ? segs.extensions.map(([deg, acc]) => `${acc === 1 ? '#' : acc === -1 ? 'b' : ''}${deg}`).join('')
    : '';
  const suffix = `${segs.quality ?? segs.unknownQuality ?? ''}${extsStr}`;

  const result: ParsedChordName = {
    rootLabel,
    rootPitch,
    bassLabel,
    bassPitch,
    hasBass,
    suffix,
    quality: segs.quality,
  };

  parsedChordNameCache.set(key, result);
  return result;
};

/** 取和弦名的根音音高（含斜杠低音时仍取斜杠前的根音）。
 *  直接复用 parseChordName 的解析缓存：rootPitch 本就是 ParsedChordName 的一个字段，
 *  原先另开一层 4096 条的「根音音高」缓存，等于把同一份数据按另一套键（且未做归一）再存一遍，
 *  既多一个键空间也多一次查找；合并后命中路径等价（同一名字第二次起仍是缓存直取）。 */
export const getChordRootPitch = (chordName: string): number => {
  if (!chordName) return 99;
  return parseChordName(chordName).rootPitch;
};

const parsedChordNameCache = createLruCache<ParsedChordName>(4096, {
  name: '和弦名解析',
  weigh: (_, value) => estimateValueBytes(value),
});
