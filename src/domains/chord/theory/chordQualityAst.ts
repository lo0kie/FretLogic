/**
 * 和弦性质 AST —— 把「和弦性质」从一张枚举查表，改造成「可组合字段」。
 *
 * ===== 为什么换 =====
 * 旧结构是「名称 → 查 CHORD_QUALITIES（124 条枚举）→ 得到一个性质串」。这套结构有三处硬伤：
 *
 * 1. **枚举是笛卡尔积的手抄本，必然抄漏。** 每个性质都在枚举里按大小写 × 记法 × 扩展度的组合
 *    手工列一行，`maj7`/`Maj7`/`M7`/`Δ7` 是四个独立条目。新增一个「小调 + 大七 + 降五」要同时
 *    记得加 `mM7b5`、`mMaj7b5`、`-M7(b5)`… 漏一个就是「能输入 A 拼写、识别不出 B 拼写」。
 *    实测：语法表（识别用）只覆盖语料 42/74，缺的正是这些同义拼写整族。
 * 2. **`b5` 与张力音 `#9/b13` 语法同形，靠正则事后补救。** 张力正则先把 `b5` 剥进 extensions，
 *    quality 退化成 `m7`，于是 `CHORD_QUALITIES` 里的 `m7b5`/`m7(b5)` 成了自动解析**永远产不出**
 *    的死枚举；下游只能各自对拼接后的 suffix 补正则（补了三处，第四处 qualityKindOf 忘了补，
 *    半减七一度被误判成普通小调）。
 * 3. **语义无处安放。** `dim7` 的「减七度」、`13` 的「按 7+9+11+13 堆叠」、`no3` 的「无三音」
 *    在旧结构里都只是一个字符串，下游要判「为什么」只能再对字符串写正则。
 *
 * 新结构下：`dim7` 是 `{ third: 'm3', fifth: 'd5', seventh: 'd7' }`，`C13` 是
 * `{ seventh: 'm7', extensions: ['9', '11', '13'] }`，「是大是小」「有没有七音」「九音在不在」
 * 都是**读字段**，不再有任何正则。
 *
 * ===== 三层结构 =====
 * - `ChordQualityAst`：性质 AST，只描述「性质本身」，不含根音 / 低音 / 转位。
 * - `ChordNameAst`：和弦名 AST = 根音 + 性质 AST + 可选低音。
 * - `QualityToken[]`：token 表 —— 唯一的「写法真相源」。所有拼写变体（大小写、记号、简写）
 *   在这里用**候选写法数组**表达，而不是在枚举里铺开。新增一个同义写法 = 往数组里加一个串，
 *   解析与渲染同时生效，不会出现「能渲染不能解析」。
 *
 * ===== 与旧结构的边界 =====
 * 本模块是纯函数 + 纯类型，不 import 旧模块、不接线。第 2 步起由 consumers 逐步切换。
 */

import type { AccidentalType, RootSegment } from '@/domains/chord/types';

// ============================================================
// 一、音程度数记法
// ============================================================

/** 三音性质。`'none'` 用于 5 和弦（强力和弦）与 no3（省略三音）。 */
export type ThirdDegree = 'maj3' | 'min3' | 'none';

/** 五音性质。`'none'` 表示未指定——渲染时省略（如 `m7` 的 `Cm7`，五音在场但不写出）。 */
export type FifthDegree = 'perf5' | 'dim5' | 'aug5' | 'none';

/** 七音性质。`'none'` 表示无七音（三和弦 / 六和弦 / add 系列）。 */
export type SeventhDegree = 'maj7' | 'min7' | 'dim7' | 'none';

/** 四音（sus）性质。`'none'` 表示非挂留。 */
export type SusDegree = 'sus4' | 'sus2' | 'none';

/** 扩展音 / 张力音：不带升降号的基础度数（渲染为 `9` / `♯9` / `♭13`…）。 */
export type ExtensionDegree = '6' | '9' | '11' | '13';

/** 一个扩展音条目：度数 + 升降（0 还原 / 1 升 / -1 降）。 */
export interface ExtensionNode {
  degree: ExtensionDegree;
  accidental: AccidentalType;
}

/**
 * 和弦性质 AST。
 *
 * 全字段可选，缺失即 `'none'` / 无。字段是**正交维度**而非互斥选项——
 * 这正是旧枚举做不到的：`{ third:'min3', fifth:'dim5', seventh:'min7' }`（半减七）与
 * `{ third:'min3', fifth:'dim5', seventh:'dim7' }`（全减七）只差一个字段，
 * 旧枚举里却是两条毫无关联的字符串 `m7b5` / `dim7`。
 */
export interface ChordQualityAst {
  third?: ThirdDegree;
  fifth?: FifthDegree;
  seventh?: SeventhDegree;
  /** 挂留四音。与 third 互斥（sus 的语义就是「三音被四音替代」）。 */
  sus?: SusDegree;
  /** 扩展音 / 张力音，按**音高顺序**排列（6 < 9 < 11 < 13，同度则按升降）。 */
  extensions?: ExtensionNode[];
  /**
   * 是否省略三音（`no3` / `(no3)`）。
   * 与 `third: 'none'` 的区别是显式性：`no3` 是**主动声明**省略，`5` 和弦是**结构性**无三音。
   * 保留这个区别是为了让 `Cno3` 渲染回 `Cno3` 而不是退化成 `C5`。
   */
  omitThird?: boolean;
  /** 是否省略五音（`no5` / `(no5)`）。 */
  omitFifth?: boolean;
  /** alt（变化属和弦的省略写法，等价于「全部张力音自由变化」）。 */
  alt?: boolean;
}

/**
 * 带「来源 token」标记的解析结果。
 *
 * 为什么需要它：`add2` 与 `add9`（或 `add4` / `add11`）的 AST **完全相同**，
 * 靠 AST 反查 token 表必然取到表中靠前的那一条，`Cadd2` 会被渲染成 `Cadd9`。
 * 保留来源 token 就等于保留「用户当初写的是哪个同义写法」，渲染即可原样还原。
 * 这是旧枚举方案里 `add2` / `add9` 必须各占一行才能做到的同一件事，
 * 只是这里用「同 AST + 不同表现形式」表达，而非两条并列的字符串。
 */
export interface ParsedQualityAst {
  ast: ChordQualityAst;
  /** 命中的 token id（同义写法之间的区分依据）；组合式兜底时为 undefined */
  tokenId?: string;
}

/**
 * 和弦名 AST：根音 + 性质 + 可选斜杠低音。
 * 对应旧的 `ChordNameSegments`，但 `quality` 从字符串换成了结构化 AST。
 */
export interface ChordNameAst {
  root: RootSegment;
  quality: ChordQualityAst;
  /** 斜杠低音 */
  bass?: RootSegment;
}

// ============================================================
// 二、AST 归一化与判定
// ============================================================

/** 把缺省字段补成显式 `'none'`，得到可直接比较的规范形态。 */
export const normalizeAst = (
  ast: ChordQualityAst
): Required<Pick<ChordQualityAst, 'third' | 'fifth' | 'seventh' | 'sus'>> &
  Omit<ChordQualityAst, 'third' | 'fifth' | 'seventh' | 'sus'> => ({
  third: ast.third ?? 'none',
  fifth: ast.fifth ?? 'none',
  seventh: ast.seventh ?? 'none',
  sus: ast.sus ?? 'none',
  ...(ast.extensions && ast.extensions.length > 0 ? { extensions: ast.extensions } : {}),
  ...(ast.omitThird ? { omitThird: true } : {}),
  ...(ast.omitFifth ? { omitFifth: true } : {}),
  ...(ast.alt ? { alt: true } : {}),
});

/** 性质 AST 的规范化比较键（字段固定顺序拼接，保证同义 AST 同键）。 */
export const astToKey = (ast: ChordQualityAst): string => {
  const n = normalizeAst(ast);
  const exts = (n.extensions ?? [])
    .map(e => `${e.accidental === 1 ? '#' : e.accidental === -1 ? 'b' : ''}${e.degree}`)
    .join(',');
  return [
    n.third,
    n.fifth,
    n.seventh,
    n.sus,
    exts,
    n.omitThird ? 'o3' : '',
    n.omitFifth ? 'o5' : '',
    n.alt ? 'alt' : '',
  ].join('|');
};

export const astEquals = (a: ChordQualityAst, b: ChordQualityAst): boolean => astToKey(a) === astToKey(b);

/** 是否为大调系（三音为大三度）。无三音时（5 / no3 / sus）返回 false，由调用方按场景判定。 */
export const isMajorFlavored = (ast: ChordQualityAst): boolean => ast.third === 'maj3';

/** 是否为小调系（三音为小三度）。 */
export const isMinorFlavored = (ast: ChordQualityAst): boolean => ast.third === 'min3';

/**
 * 是否为减系（小三 + 减五，含半减七 / 减七）。
 *
 * **三音必须是小三度**，这一条不能省。只看五音会把属七降五（`C7b5` = 大三 + 减五 + 小七）
 * 也算成减系 —— 而它是个**以大调三音为主体的变化属和弦**，与减三和弦毫无亲缘。
 * 旧实现用 `/^(dim|°|ø|m7b5)/` 判前缀，天然把 `7b5` 排除在外（`7b5` 不以这些前缀开头）；
 * 若改成只看 `fifth === 'dim5'`，就会把这个正确的行为丢掉。
 *
 * 该函数服务于 `qualityKindOfAst`（调内级数归类），错判会让 `C7b5` 在 C 大调里
 * 被当成减系和弦去匹配级数，语义直接错位。
 */
export const isDimFlavored = (ast: ChordQualityAst): boolean =>
  ast.third === 'min3' && (ast.fifth === 'dim5' || ast.seventh === 'dim7');

/** 是否为半减（小七 + 减五）——`ø` 的判据，不再靠字符串特判。 */
export const isHalfDiminished = (ast: ChordQualityAst): boolean =>
  ast.third === 'min3' && ast.fifth === 'dim5' && ast.seventh === 'min7';

/** 是否为增系（五音增五）。 */
export const isAugFlavored = (ast: ChordQualityAst): boolean => ast.fifth === 'aug5';

/**
 * 调内性质归类：减/半减 → dim，小调类 → min，其余 → maj。
 * 这是旧 `qualityKindOf` 的 AST 版本——旧实现那条 `m7b5` 分支因为自动解析产不出该枚举
 * 而永远是死代码；现在 `isDimFlavored` 直接读字段，半减七必然归 dim。
 */
export const qualityKindOfAst = (ast: ChordQualityAst): 'maj' | 'min' | 'dim' => {
  if (isDimFlavored(ast)) return 'dim';
  return isMinorFlavored(ast) ? 'min' : 'maj';
};

// ============================================================
// 三、AST → 音程集合
// ============================================================

/** 音程容器：相对根音的半音数集合（去重、升序由调用方按需排序）。 */
export interface ChordIntervals {
  /** 核心音（决定和弦身份的骨架音）：根音 / 三音 / 五音 / 七音 / 挂留音 / 六音 */
  core: number[];
  /** 扩展音 / 张力音（去掉八度后的模 12 值） */
  extensions: number[];
  /** 核心 + 扩展去重合并 */
  all: number[];
}

/** 度数 → 模 12 半音数。 */
const DEGREE_SEMITONES: Record<ExtensionDegree, number> = { '6': 9, '9': 2, '11': 5, '13': 9 };

/** 度数 + 升降 → 模 12 半音数（供识别层计算「声明音」与「冗余音」）。 */
export const degreeToSemitone = (degree: ExtensionDegree, accidental: AccidentalType = 0): number =>
  (DEGREE_SEMITONES[degree] + accidental + 12) % 12;
/** 11 与 13 的「自然」度数在模 12 下与 5 / 9 撞车，只在变化时才成为独立音级 */
const SEVENTH_SEMITONES: Record<Exclude<SeventhDegree, 'none'>, number> = { maj7: 11, min7: 10, dim7: 9 };

/**
 * 把性质 AST 展开为音程集合。
 *
 * 与旧实现的差别在扩展和弦的**堆叠语义**：旧实现里 `13` 只是个字符串，下游判「包含哪些音」
 * 只能各自猜；这里明确按「扩展度数是累积的」展开——`13` = 7 + 9 + 11 + 13。
 * 这正是旧文档缺陷 #7 指出的「13 非堆叠」问题的落点。
 *
 * `omitThird` / `omitFifth` 必须在这里生效：AST 说「撤掉三音」，展开出的音集就不该含三音。
 * 早先只处理了 `omitFifth` 的一个分支，`omitThird` 完全没生效 —— 于是
 * `Cno3` 展开成 `{0,4,7}`，与 `C` 一模一样。这不只是「多一个音」的问题：
 * `no3` 是**声明了三音槽却主动不用**，`5` 是**定义上无三音槽**，两者音集相同但含义不同，
 * 只有让省略标记真的影响音集、再配合 `SlotProfile` 的槽位判据，识别端才能把它们分开。
 */
export const chordQualityAstToIntervals = (ast: ChordQualityAst): ChordIntervals => {
  const core: number[] = [0];

  if (!ast.omitThird) {
    if (ast.third === 'maj3') core.push(4);
    else if (ast.third === 'min3') core.push(3);
  }

  if (!ast.omitFifth) {
    if (ast.fifth === 'perf5') core.push(7);
    else if (ast.fifth === 'dim5') core.push(6);
    else if (ast.fifth === 'aug5') core.push(8);
    else if (ast.fifth === 'none' && ast.seventh !== 'none' && ast.seventh !== undefined) {
      // 五音未指定但和弦有七音：按乐理惯例补纯五（`Cm7` 的 G 在场，只是不写出）
      core.push(7);
    }
  }

  if (ast.seventh && ast.seventh !== 'none') core.push(SEVENTH_SEMITONES[ast.seventh]);

  if (ast.sus === 'sus4') core.push(5);
  else if (ast.sus === 'sus2') core.push(2);

  const coreSet = new Set(core);
  const extensions: number[] = [];
  for (const ext of ast.extensions ?? []) {
    const semitone = degreeToSemitone(ext.degree, ext.accidental);
    // 还原音的六度（9 半音）若与已声明的核心音同音，则不算扩展——`C6` 与 `C` 的区别只在写法。
    // 变化形态（#11 / b13 等）一律是扩展音，不可并入核心。
    if (ext.accidental === 0 && coreSet.has(semitone)) continue;
    extensions.push(semitone);
  }

  // 扩展和弦的累积语义：13 蕴含 9（`C13` = 7 + 9 + 11 + 13）。
  // 仅在核心已有七音时补 —— 否则 `Cadd13` / `C6` 会被误补成 C9。
  if (ast.seventh === 'min7' || ast.seventh === 'maj7') {
    const degrees = new Set((ast.extensions ?? []).map(e => e.degree));
    if (degrees.has('13') && !degrees.has('9')) extensions.push(DEGREE_SEMITONES['9']);
  }

  const all = Array.from(new Set([...core, ...extensions])).sort((a, b) => a - b);
  return {
    core: Array.from(new Set(core)).sort((a, b) => a - b),
    extensions: Array.from(new Set(extensions)).sort((a, b) => a - b),
    all,
  };
};

// ============================================================
// 四、Token 表 —— 唯一写法真相源
// ============================================================

/** 一个性质 token：AST 「配方」+ 该配方的全部可接受写法（按优先级降序）。 */
export interface QualityToken {
  /** token 稳定标识（供调试与 diff，不参与业务判定） */
  id: string;
  /** 该 token 代表的性质 AST */
  ast: ChordQualityAst;
  /**
   * 可接受的**原始写法**（解析用）。数组首项同时作为渲染时的**首选全称**。
   * 匹配时对「候选写法」与「输入」同时做大小写折叠比较——但只有在
   * 表里显式列出过的大写变体才折叠，绝不会把 `M7`（大七）与 `m7`（小七）混为一谈：
   * 两者是两个不同 token，各自列出自己的写法。
   */
  spellings: string[];
  /** 是否参与「渲染时省略」推断：无五音写法的和弦（`Cm7` 而非 `Cm7♮5`） */
  implicitFifth?: boolean;
  /**
   * 是否为**纯记谱写法**：表达的是「本该有的音被撤掉」，而非一个独立的配方。
   *
   * 解析/渲染必须认识它们（`Cno3` 是合法输入，且往返要原样还原），
   * 但**识别端要排除**：音集里少一个音，既可能是「撤掉」也可能是「本来就没弹」，
   * 从音集无法区分。把 `no3`/`no5` 放进候选只会制造无法证伪的歧义
   * （实测：`{C, E}` 被读成 `Cno5` 而不是更常规的 `C`）。
   */
  notationOnly?: boolean;
}

/**
 * 性质 token 表。
 *
 * 组织原则：**一个 token = 一个 AST 配方**，写法只是它的多个入口。
 * 例如 `maj7` 一条 token 覆盖 `maj7 / Maj7 / M7 / Δ7 / ma7` 五种写法，
 * 而旧枚举为这五个写法开了五条互不相干的条目（其中三条语法表还漏了）。
 *
 * 顺序即优先级：解析时先匹配到的 token 胜出；渲染时用 `spellings[0]`。
 * 长写法排在前面，避免 `m` 抢走 `maj7` 的前缀。
 */
export const QUALITY_TOKENS: QualityToken[] = [
  // ---------- 三和弦 ----------
  {
    id: 'major',
    ast: { third: 'maj3', fifth: 'perf5' },
    // `Maj` 沿用旧 CHORD_QUALITIES 的写法集合。现在它已能靠大小写折叠认出来
    // （`maj` 的折叠键已登记，见 canFoldToLower），显式列出是为了让
    // `KNOWN_QUALITIES` 这类「列举全部写法」的用途不漏条目，而非解析所必需。
    spellings: ['', 'maj', 'Maj', 'M', 'Δ', 'major'],
  },
  {
    id: 'minor',
    ast: { third: 'min3', fifth: 'perf5' },
    spellings: ['m', 'min', '-', 'minor'],
  },
  {
    id: 'dim',
    ast: { third: 'min3', fifth: 'dim5' },
    // `mb5` 系列是小三和弦降五的写法，与 `dim` 是**同一个配方**，故并入本 token。
    // 旧实现把 `mb5` 拆成「性质 m + 张力音 b5」两个字段（张力正则的必然结果），
    // 于是同一件事在数据里有两种形态：`Cdim` 与 `Cmb5`。归并后两者 AST 一致。
    spellings: ['dim', '°', 'o', 'mb5', 'm(b5)', 'minb5', '-b5'],
  },
  {
    id: 'aug',
    ast: { third: 'maj3', fifth: 'aug5' },
    // 同上：`#5` 是大三和弦升五，与 `aug` 同一配方（旧实现拆成 `+ 张力音 #5`）。
    spellings: ['aug', '+', '#5', '+5'],
  },
  {
    id: 'power',
    ast: { third: 'none', fifth: 'perf5' },
    spellings: ['5'],
  },
  // ---------- 挂留 ----------
  {
    id: 'sus4',
    ast: { third: 'none', sus: 'sus4', fifth: 'perf5' },
    spellings: ['sus4', 'sus'],
  },
  {
    id: 'sus2',
    ast: { third: 'none', sus: 'sus2', fifth: 'perf5' },
    spellings: ['sus2'],
  },
  // ---------- 省略音 ----------
  {
    id: 'no3',
    ast: { third: 'maj3', fifth: 'perf5', omitThird: true },
    spellings: ['no3', '(no3)'],
    notationOnly: true,
  },
  {
    id: 'no5',
    ast: { third: 'maj3', fifth: 'perf5', omitFifth: true },
    spellings: ['no5', '(no5)'],
    notationOnly: true,
  },
  // ---------- 六和弦 / 69 ----------
  {
    id: 'six',
    ast: { third: 'maj3', fifth: 'perf5', extensions: [{ degree: '6', accidental: 0 }] },
    spellings: ['6'],
  },
  {
    id: 'm6',
    ast: { third: 'min3', fifth: 'perf5', extensions: [{ degree: '6', accidental: 0 }] },
    spellings: ['m6', 'min6', '-6'],
  },
  {
    id: 'sixNine',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      extensions: [
        { degree: '6', accidental: 0 },
        { degree: '9', accidental: 0 },
      ],
    },
    spellings: ['6/9', '69'],
  },
  {
    id: 'm6Nine',
    ast: {
      third: 'min3',
      fifth: 'perf5',
      extensions: [
        { degree: '6', accidental: 0 },
        { degree: '9', accidental: 0 },
      ],
    },
    spellings: ['m6/9', 'm69', 'min6/9'],
  },
  // ---------- 七和弦 ----------
  {
    id: 'dom7',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7' },
    spellings: ['7'],
  },
  {
    id: 'maj7',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'maj7' },
    spellings: ['maj7', 'Maj7', 'M7', 'Δ7', 'ma7'],
  },
  {
    id: 'min7',
    ast: { third: 'min3', fifth: 'perf5', seventh: 'min7' },
    spellings: ['m7', 'min7', '-7'],
  },
  {
    id: 'minMaj7',
    ast: { third: 'min3', fifth: 'perf5', seventh: 'maj7' },
    spellings: ['mMaj7', 'mmaj7', 'mM7', 'mΔ7', '-M7', '-Δ7'],
  },
  {
    id: 'halfDim7',
    ast: { third: 'min3', fifth: 'dim5', seventh: 'min7' },
    spellings: ['m7b5', 'm7(b5)', 'ø7', 'ø', 'min7b5', '-7b5'],
  },
  {
    id: 'dim7',
    ast: { third: 'min3', fifth: 'dim5', seventh: 'dim7' },
    spellings: ['dim7', '°7', 'o7'],
  },
  {
    id: 'dimMaj7',
    ast: { third: 'min3', fifth: 'dim5', seventh: 'maj7' },
    spellings: ['dimMaj7', 'dimmaj7', '°M7', '°Δ7'],
  },
  {
    id: 'aug7',
    ast: { third: 'maj3', fifth: 'aug5', seventh: 'min7' },
    spellings: ['aug7', '+7', '7#5', '7(#5)'],
  },
  {
    id: 'augMaj7',
    ast: { third: 'maj3', fifth: 'aug5', seventh: 'maj7' },
    spellings: ['augMaj7', 'augmaj7', '+M7', '+Δ7', 'M7#5', 'Maj7(#5)'],
  },
  {
    id: 'dom7flat5',
    ast: { third: 'maj3', fifth: 'dim5', seventh: 'min7' },
    spellings: ['7b5', '7(b5)'],
  },
  {
    id: 'maj7flat5',
    ast: { third: 'maj3', fifth: 'dim5', seventh: 'maj7' },
    spellings: ['Maj7(b5)', 'M7b5', 'Maj7b5'],
  },
  // ---------- sus 七和弦 ----------
  {
    id: 'sus4dom7',
    ast: { third: 'none', sus: 'sus4', fifth: 'perf5', seventh: 'min7' },
    spellings: ['7sus4', '7sus'],
  },
  {
    id: 'sus2dom7',
    ast: { third: 'none', sus: 'sus2', fifth: 'perf5', seventh: 'min7' },
    spellings: ['7sus2'],
  },
  // ---------- add 家族 ----------
  // `add2` / `add9` 与 `add4` / `add11` 各自同音，但**写法不同、渲染须还原**，故拆成独立 token。
  // 解析时靠合并层做同义收敛（`add2` 的 AST 度数记为 9，与 add9 同音），
  // 渲染时各自由 token 的首选写法输出，不会把 `Cadd2` 显示成 `Cadd9`。
  {
    id: 'add9',
    ast: { third: 'maj3', fifth: 'perf5', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['add9'],
  },
  {
    id: 'add2',
    ast: { third: 'maj3', fifth: 'perf5', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['add2'],
  },
  {
    id: 'add11',
    ast: { third: 'maj3', fifth: 'perf5', extensions: [{ degree: '11', accidental: 0 }] },
    spellings: ['add11'],
  },
  {
    id: 'add4',
    ast: { third: 'maj3', fifth: 'perf5', extensions: [{ degree: '11', accidental: 0 }] },
    spellings: ['add4'],
  },
  {
    id: 'add13',
    ast: { third: 'maj3', fifth: 'perf5', extensions: [{ degree: '13', accidental: 0 }] },
    spellings: ['add13'],
  },
  {
    id: 'madd9',
    ast: { third: 'min3', fifth: 'perf5', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['madd9'],
  },
  {
    id: 'madd2',
    ast: { third: 'min3', fifth: 'perf5', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['madd2'],
  },
  {
    id: 'madd11',
    ast: { third: 'min3', fifth: 'perf5', extensions: [{ degree: '11', accidental: 0 }] },
    spellings: ['madd11'],
  },
  {
    id: 'madd4',
    ast: { third: 'min3', fifth: 'perf5', extensions: [{ degree: '11', accidental: 0 }] },
    spellings: ['madd4'],
  },
  {
    id: 'madd13',
    ast: { third: 'min3', fifth: 'perf5', extensions: [{ degree: '13', accidental: 0 }] },
    spellings: ['madd13'],
  },
  // ---------- 属扩展 ----------
  {
    id: 'dom9',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['9'],
  },
  {
    id: 'dom11',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
      ],
    },
    spellings: ['11'],
  },
  {
    id: 'dom13',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['13'],
  },
  {
    id: 'aug9',
    ast: { third: 'maj3', fifth: 'aug5', seventh: 'min7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['9#5', '9(#5)'],
  },
  {
    id: 'aug13',
    ast: {
      third: 'maj3',
      fifth: 'aug5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['13#5', '13(#5)'],
  },
  {
    id: 'dom7flat13',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '13', accidental: -1 }] },
    spellings: ['7b13', '7(b13)'],
  },
  {
    id: 'sus4dom9',
    ast: { third: 'none', sus: 'sus4', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '9', accidental: 0 }] },
    // `11sus4` 与 `9sus4` 是**同一配方**：sus4 的四音（5 半音）本身就是十一音，
    // 所以 `11sus4` 只是「把 11 这个音说清楚」的写法，并不需要额外的扩展音。
    // 旧枚举把两者当两条独立性质；归并到同一 token 后写法仍全部可解析（同义收敛）。
    spellings: ['9sus4', '9sus', '11sus4', '11sus'],
  },
  {
    id: 'sus2dom9',
    ast: { third: 'none', sus: 'sus2', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['9sus2'],
  },
  {
    id: 'sus2dom11',
    // sus2 的挂留音是二音（2 半音），**不是**十一音，故 `11sus2` 需要独立声明九音与十一音。
    // 这与 `11sus4` 的情形正好相反，是 sus2 / sus4 不能共用一条配方的原因。
    ast: {
      third: 'none',
      sus: 'sus2',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
      ],
    },
    spellings: ['11sus2'],
  },
  {
    id: 'sus4dom13',
    ast: {
      third: 'none',
      sus: 'sus4',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['13sus4', '13sus'],
  },
  // ---------- 小扩展 ----------
  {
    id: 'min9',
    ast: { third: 'min3', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['m9', 'min9', '-9'],
  },
  {
    id: 'min11',
    ast: {
      third: 'min3',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
      ],
    },
    spellings: ['m11', 'min11', '-11'],
  },
  {
    id: 'min13',
    ast: {
      third: 'min3',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['m13', 'min13', '-13'],
  },
  {
    id: 'minMaj9',
    ast: { third: 'min3', fifth: 'perf5', seventh: 'maj7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['mMaj9', 'mmaj9', 'mM9', 'mΔ9', '-M9', '-Δ9'],
  },
  {
    id: 'minMaj11',
    ast: {
      third: 'min3',
      fifth: 'perf5',
      seventh: 'maj7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
      ],
    },
    spellings: ['mMaj11', 'mmaj11', 'mM11', 'mΔ11', '-M11', '-Δ11'],
  },
  {
    id: 'minMaj13',
    ast: {
      third: 'min3',
      fifth: 'perf5',
      seventh: 'maj7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['mMaj13', 'mmaj13', 'mM13', 'mΔ13', '-M13', '-Δ13'],
  },
  {
    id: 'min9flat5',
    ast: { third: 'min3', fifth: 'dim5', seventh: 'min7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['m9b5', 'm9(b5)', 'ø9'],
  },
  // ---------- 大扩展 ----------
  {
    id: 'maj9',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'maj7', extensions: [{ degree: '9', accidental: 0 }] },
    spellings: ['maj9', 'Maj9', 'M9', 'Δ9'],
  },
  {
    id: 'maj11',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'maj7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
      ],
    },
    spellings: ['maj11', 'Maj11', 'M11', 'Δ11'],
  },
  {
    id: 'maj13',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'maj7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 0 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['maj13', 'Maj13', 'M13', 'Δ13'],
  },
  {
    id: 'maj9sharp11',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'maj7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 1 },
      ],
    },
    spellings: ['Maj9(#11)', 'M9#11'],
  },
  {
    id: 'maj7sharp11',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'maj7', extensions: [{ degree: '11', accidental: 1 }] },
    spellings: ['Maj7(#11)', 'M7#11'],
  },
  // ---------- 变化属和弦 ----------
  {
    id: 'dom7sharp9',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '9', accidental: 1 }] },
    spellings: ['7#9', '7(#9)'],
  },
  {
    id: 'dom7flat9',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '9', accidental: -1 }] },
    spellings: ['7b9', '7(b9)'],
  },
  {
    id: 'dom7sharp11',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7', extensions: [{ degree: '11', accidental: 1 }] },
    spellings: ['7#11', '7(#11)'],
  },
  {
    id: 'dom9sharp11',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 1 },
      ],
    },
    spellings: ['9(#11)', '9#11'],
  },
  {
    id: 'dom13sharp11',
    ast: {
      third: 'maj3',
      fifth: 'perf5',
      seventh: 'min7',
      extensions: [
        { degree: '9', accidental: 0 },
        { degree: '11', accidental: 1 },
        { degree: '13', accidental: 0 },
      ],
    },
    spellings: ['13(#11)', '13#11'],
  },
  {
    id: 'dom7alt',
    ast: { third: 'maj3', fifth: 'perf5', seventh: 'min7', alt: true },
    spellings: ['7alt', 'alt'],
  },
];

/** 写法 → token 的查找表（精确匹配优先，回落大小写折叠）。 */
const TOKEN_BY_SPELLING = new Map<string, QualityToken>();
const TOKEN_BY_SPELLING_CI = new Map<string, QualityToken>();

/**
 * 大小写折叠**只对无歧义写法**开放。
 *
 * 折叠的用途是「用户随手打全大写也能认」（`MAJ7` → `maj7`、`DIM7` → `dim7`），
 * 但绝不能把大小写本身带语义的记号抹掉：`M7`（大七）与 `m7`（小七）折叠后同名，
 * `M` 与 `m` 同理 —— 这类写法必须保持精确匹配。
 *
 * 判据不是「写法里有没有 m/M」（`MAJ7` 里也有 M），也不是「首位是不是 M」，
 * 而是**折叠键是否已属于另一个 token**。做法：先把折叠键算出来，
 * 若该键被另一个 token 占用，则放弃折叠（该写法只走精确匹配）。
 *
 * 逐例：
 *   `MAJ7` → 折叠键 `maj7`，主人是 maj7 本身 ⇒ 可折叠
 *   `M7`   → 折叠键 `m7`，主人是 min7，**另一个** token ⇒ 拒绝折叠（保住大七语义）
 *   `DIM7` → 折叠键 `dim7`，主人是 dim7 本身 ⇒ 可折叠
 */
const foldKey = (spelling: string): string => spelling.toLowerCase();

/**
 * 判断写法是否可安全折叠到小写形态。
 *
 * 规则：折叠键要么没有主人，要么主人就是它自己。否则一律不折叠 ——
 * 这正是 `M7` / `m7` 不被合并、而 `MAJ7` 被正常接受的分界。
 *
 * **本身已是全小写的写法也必须登记折叠键**。早先这里有一句
 * `if (lower === spelling) return false;`（「都小写了还折叠什么」），
 * 那是个想当然的短路：折叠轮匹配时是用 `findTokenBySpelling(候选切片)` 反查 token 的，
 * 若某写法的折叠键没登记，它的大小写变体就**查不到主人** ——
 * 于是「只以小写形态存在」的写法（`dim7` 没有 `Dim7` 变体）在别的大小写下认不出来：
 * `CDIM7` 被判未知性质。实测由「取回删除前的 CHORD_QUALITIES 逐条校验」发现。
 *
 * 短路去掉后不会误合 `M`/`m`：`M` 的折叠键 `m` 主人是 minor（另一个 token）⇒ 仍拒绝折叠；
 * 且 `matchQualityToken` 的两轮结果**同长时精确轮胜出**，`CM` 走精确表的 `M` ⇒ major。
 *
 * 已知取舍：全大写且本身有歧义的写法会按**声明序**取第一个可折叠的主人。
 * 例如 `CM7B5` 折叠后既可能被读成 `m7b5`（半减七）也可能被读成 `M7b5`（大七降五），
 * 实际归前者（halfDim7 在表中声明更早）。放宽前该写法直接判非法，故这是纯扩面；
 * 需要区分时写正确的大小写即可 —— `CM7b5` 走精确表 ⇒ maj7flat5，`Cm7b5` ⇒ halfDim7。
 */
const canFoldToLower = (spelling: string, owner: QualityToken): boolean => {
  const lower = spelling.toLowerCase();
  const other = TOKEN_BY_SPELLING.get(lower) ?? TOKEN_BY_SPELLING_CI.get(lower);
  return !other || other === owner;
};

const SPELLINGS_BY_LENGTH: string[] = [];

{
  // 第一遍：登记精确写法
  for (const token of QUALITY_TOKENS) {
    for (const sp of token.spellings) {
      // 只登记首次出现：`''` 只属于 major，`sus` 只属于 sus4
      if (!TOKEN_BY_SPELLING.has(sp)) TOKEN_BY_SPELLING.set(sp, token);
    }
  }
  // 第二遍：登记折叠键（需精确表已建好才能判「小写形态是否另有主人」）
  for (const token of QUALITY_TOKENS) {
    for (const sp of token.spellings) {
      if (!canFoldToLower(sp, token)) continue;
      const key = foldKey(sp);
      if (!TOKEN_BY_SPELLING_CI.has(key)) TOKEN_BY_SPELLING_CI.set(key, token);
    }
  }
  const seen = new Set<string>();
  for (const token of QUALITY_TOKENS) {
    for (const sp of token.spellings) {
      // 空串不参与长度排序匹配：它由 matchQualityToken 的显式兜底处理
      if (!sp || seen.has(sp)) continue;
      seen.add(sp);
      SPELLINGS_BY_LENGTH.push(sp);
    }
  }
  SPELLINGS_BY_LENGTH.sort((a, b) => b.length - a.length);
}

/**
 * 按**精确写法 → 受限折叠**的顺序查 token。
 *
 * `M7` / `m7` / `maj7` 三者各自独立、永不串味；`MAJ7` 则能认到 `maj7`
 * —— 前者是语义红线，后者是「用户随手大写」的容错。
 */
export const findTokenBySpelling = (text: string): QualityToken | undefined => {
  const exact = TOKEN_BY_SPELLING.get(text);
  if (exact) return exact;
  return TOKEN_BY_SPELLING_CI.get(text.toLowerCase());
};

/** 全部已登记写法（按长度降序），供解析器做前缀匹配。不含空串——空串由「无更长匹配」兜底。 */
export const qualitySpellingsByLength = (): readonly string[] => SPELLINGS_BY_LENGTH;
