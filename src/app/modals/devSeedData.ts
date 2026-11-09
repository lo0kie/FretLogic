/**
 * 开发面板用的大规模测试数据工厂。
 *
 * 只在 dev 运行时被引用。它曾经在 dist 里白带一个 chunk：`v-if="IS_DEV"` 只挡「渲染」，挡不住
 * `defineAsyncComponent(() => import('@/app/modals/DevPanel.vue'))` 这个**模块顶层无条件执行**的
 * 调用 —— 它是不透明调用，Rollup 不能假设其无副作用，动态 import 边因而保留（本模块与 DevPanel
 * 都在其中，且永不会被请求）。TopHeader 现按 `const DevPanel = IS_DEV ? defineAsyncComponent(...)
 * : undefined` 收口，判据在模块顶层即被判死，两块代码才真正不进生产包。**改回无条件写法之前请先
 * 看这段注释。**
 *
 * 生成两类数据：
 *  - **和弦库**：由「根音 × 品质 × 把位窗口」驱动。指法从**音集反推**——每根弦只落在该和弦的
 *    音级上，故音高与和弦名天然自洽，不会产生「标注与实际不一致」的校验警告；同一和弦的不同
 *    (把位, 品数, 根音弦) 组合天然构成多指法变体，用于压测变体面板 / 分组卡片 / 指板位图缓存。
 *    指法上另**随机标注成立的横按**（见 pickBarres）：候选取自指板编辑弹窗用的同一份判定，
 *    于是数据里同时存在无横按、单横按与多横按（双横按）三类，覆盖横按绘制与相关交互。
 *  - **乐谱**：按段落组织的谱面（标记行 / 长短歌词句 / 纯和弦行 / 空行）＋ 逐行字符槽位绑定
 *    上一步的和弦 id，用于压测列表滚动、拼音排序、和弦反查歌曲的倒排索引、预览分页渲染与页缓存。
 *    行的长度与行内和弦密度由规模参数给定（见 DevTestDataScale，开发面板的表单逐项可调）：
 *    预设的前三档同一套基线，极端预设独立拉满。
 *
 * 随机数用固定种子的 LCG（不用 Math.random）：同一套规模参数每次生成结果完全一致，便于复现问题。
 */
import { createChord, createGroup } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, NOTES_SHARP, segmentsToString, Tuning, TUNING_PRESETS } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { computeBarreCandidates } from '@/domains/fretboard/model/coordinates';
import { matchLineIds, toSongId } from '@/domains/score/model/scoreModel';
import { MUTED_FRET } from '@/platform/types/instrument';
import { generateUUID } from '@/platform/utils/common';

import type { Chord, ChordId, Group } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';
import type { BarreEntity, GuitarStringEntity } from '@/platform/types/instrument';

/** 六弦标准调弦各弦 MIDI 音高：直接取调弦预设表（data/tunings.json 的 STANDARD 预设），不再手抄 */
const STRING_MIDI = TUNING_PRESETS[Tuning.STANDARD].mapping;

/** 12 半音根音名：复用 theory 的升号音名表（NOTES_SHARP，pitch.ts 单源） */
const ROOT_NAMES = NOTES_SHARP;

/** 品质后缀 → 相对根音的半音音程（覆盖 grammar 里常用的三类音、挂留、六九、变化和弦）。
 *  theory 现有的音程来源是 AST 配方（chordQualityAstToIntervals，core/extensions 两段拼接、非严格升序），
 *  与本表「升序音程 → 贪心排指」的语义不同构，故保留本地手写（引用会导致生成数据与历史不一致）。 */
const QUALITIES: readonly { suffix: string; intervals: readonly number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
  { suffix: 'add9', intervals: [0, 2, 4, 7] },
  { suffix: 'madd9', intervals: [0, 2, 3, 7] },
  { suffix: '9', intervals: [0, 2, 4, 7, 10] },
  { suffix: 'm9', intervals: [0, 2, 3, 7, 10] },
  { suffix: 'maj9', intervals: [0, 2, 4, 7, 11] },
  { suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10] },
];

const GROUP_NAMES = [
  '流行',
  '民谣',
  '摇滚',
  '爵士',
  '布鲁斯',
  '放克',
  '拉丁',
  '乡村',
  '古典',
  '指弹',
  '弹唱',
  '即兴',
  '基础和弦',
  '进阶和弦',
  '高阶和弦',
  '七和弦',
  '挂留和弦',
  '转位',
  '开放把位',
  '高把位',
  '横按',
  '双横按',
  '练习曲',
  '参考库',
] as const;

const SINGERS = ['测试歌手甲', '测试歌手乙', '测试歌手丙', '测试歌手丁', '民谣小组', '器乐演奏', ''] as const;

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '5/4'] as const;

/** 歌词词库：两字词为主，随机拼接成行 */
const WORDS = [
  '夜色',
  '人间',
  '远方',
  '归途',
  '灯塔',
  '潮汐',
  '山谷',
  '长风',
  '回忆',
  '流年',
  '星河',
  '旧梦',
  '街道',
  '窗口',
  '雨声',
  '清晨',
  '黄昏',
  '海岸',
  '列车',
  '旅人',
  '麦田',
  '灯火',
  '信笺',
  '琴弦',
  '旋律',
  '回声',
  '晴空',
  '云影',
  '约定',
  '青春',
  '沉默',
  '告别',
  '重逢',
  '依然',
  '缓缓',
  '轻轻',
  '走过',
  '唱起',
  '想着',
  '看着',
] as const;

/** 固定种子 LCG：结果可复现，便于照着同一份数据排查问题 */
const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

/** 闭区间取整随机：规模里的区间一律按闭区间理解，与原先散在各处的 `a + floor(rng() * (b - a + 1))` 同口径同消耗（1 次 rng） */
const pickRange = (range: readonly [number, number], rng: () => number): number =>
  range[0] + Math.floor(rng() * (range[1] - range[0] + 1));

/**
 * 某根弦在给定把位窗口内能弹出目标音级的全部品位。
 * 与 calcNoteMidi 的语义对齐：品位 0 恒为空弦（不随 fretOffset 移动），1..fretCount 额外加偏移。
 */
const candidateFrets = (stringIndex: number, pitchClass: number, offset: number, fretCount: number): number[] => {
  const base = STRING_MIDI[stringIndex]!;
  const frets: number[] = [];
  if (base % 12 === pitchClass) frets.push(0);
  for (let fret = 1; fret <= fretCount; fret++) if ((base + fret + offset) % 12 === pitchClass) frets.push(fret);

  return frets;
};

/**
 * 按音集反推一个原位指法：最低发声弦必须是根音所在弦（故其下各弦静音），
 * 其余音级尽量各占一根弦以保证和弦完整，剩余弦随机补音（补出来的仍是本和弦音级）。
 * 无解（根音在窗口内放不下）或发声弦不足 3 根时返回 null。
 */
const buildFingering = (
  rootPitch: number,
  intervals: readonly number[],
  offset: number,
  fretCount: number,
  rootString: number,
  preferFlat: boolean,
  rng: () => number
): GuitarStringEntity[] | null => {
  const pitchClasses = intervals.map(interval => (rootPitch + interval) % 12);
  const strings: GuitarStringEntity[] = Array.from({ length: 6 }, () => ({ fret: MUTED_FRET, preferFlat }));

  const rootFrets = candidateFrets(rootString, rootPitch, offset, fretCount);
  if (rootFrets.length === 0) return null;
  strings[rootString] = { fret: pick(rootFrets, rng), preferFlat };

  for (const pitchClass of pitchClasses) {
    if (pitchClass === rootPitch) continue;
    for (let s = rootString + 1; s < 6; s++) {
      if (strings[s]!.fret !== MUTED_FRET) continue;
      const frets = candidateFrets(s, pitchClass, offset, fretCount);
      if (frets.length === 0) continue;
      strings[s] = { fret: pick(frets, rng), preferFlat };
      break;
    }
  }

  for (let s = rootString + 1; s < 6; s++) {
    if (strings[s]!.fret !== MUTED_FRET) continue;
    if (rng() < 0.45) continue; // 静音：让数据里同时存在完整与稀疏的按法
    const pool: number[] = [];
    for (const pitchClass of pitchClasses)
      for (const fret of candidateFrets(s, pitchClass, offset, fretCount)) if (!pool.includes(fret)) pool.push(fret);

    if (pool.length > 0) strings[s] = { fret: pick(pool, rng), preferFlat };
  }

  return strings.filter(s => s.fret >= 0).length >= 3 ? strings : null;
};

const fingeringSignature = (strings: GuitarStringEntity[], offset: number, fretCount: number): string =>
  `${offset}/${fretCount}/${strings.map(s => s.fret).join(',')}`;

/**
 * 从**成立的横按候选**里随机取一组（可能一条都不取）。
 *
 * 候选取自 `computeBarreCandidates` —— 指板横按编辑弹窗用的就是它：两端弦严格落在同一品、
 * 被跨的弦不低于该品、每段连续子段自成一条。**刻意不自写一套判据**：自造的判定迟早与「什么算
 * 合法横按」分叉，生成出画得出来、编辑器却不认（`isBarreStillValid` 判否）的横按。
 *
 * 取几条也随机（0 ~ 全部候选）：数据里要同时存在无横按、单横按与多横按（双横按）三类形态，
 * 后者用于压测多条横按梁的绘制与气泡；候选为空（指法里没有任何同品相邻弦）时不给标记。
 */
const pickBarres = (strings: GuitarStringEntity[], fretCount: number, rng: () => number): BarreEntity[] | undefined => {
  const candidates = computeBarreCandidates(strings, fretCount);
  if (candidates.length === 0) return undefined;

  const pool = [...candidates];
  const count = Math.floor(rng() * (candidates.length + 1));
  const chosen: BarreEntity[] = [];
  for (let i = 0; i < count; i++) {
    const [picked] = pool.splice(Math.floor(rng() * pool.length), 1);
    if (picked) chosen.push(picked);
  }

  return chosen.length > 0 ? chosen : undefined;
};

/**
 * 谱面单行字符上限，与 ScoreLyricsEditor 的 MAX_LINE_LENGTH 同值（那边是组件内的局部常量，取不到）。
 * 生成出来的每一行都必须落在这个上限内：更长的行是编辑器里根本输入不出来的状态，压它没有意义。
 * 歌词行天然满足（词库每词 2 字，规模按词数给区间）；纯和弦行因和弦名长度不一（"C#madd9" 最长 7 字），
 * 需在 buildChordLine 里按预算截断。
 *
 * 声明位置在规模参数之前：DEV_TEST_SCALE_LIMITS 的行词数上界由它推出（50 词 × 2 字）。
 */
const MAX_SEED_LINE_CHARS = 100;

/**
 * 测试数据的规模参数：开发面板的表单逐项可调。
 *
 * 八个维度都是**可手填的数字**，而不是「几个预设档位二选一」——档位只能给出事先想到的几组组合，
 * 而压测要的往往是「行数拉满、和弦密度压低」这类没人预先枚举过的搭配。预设仍在，但已降级为
 * 填表入口（见 DEV_TEST_PRESETS），生成一律以本结构当前值为准。
 *
 * 持久化已迁 IDB，故不再受 5MB 配额约束；各字段的取值范围由 DEV_TEST_SCALE_LIMITS 兜底。
 */
export interface DevTestDataScale {
  /** 每个「根音 × 品质」尝试生成的把位变体数（重复与无解会被丢弃） */
  variantsPerQuality: number;
  songCount: number;
  /** 每首乐谱的总行数区间（含段落标记行与空行，非纯歌词行） */
  linesPerSong: [number, number];
  /**
   * 短句行 / 长句行的词数区间（闭区间）。词库每词 2 字，故字符数 = 词数 × 2。
   * 单行字符数须留在 MAX_SEED_LINE_CHARS（100，与编辑器的单行上限同值）以内 —— 更长的行是编辑器里
   * 根本输入不出来的状态，放进来等于压测一个不存在的形态。
   */
  shortLineWords: [number, number];
  longLineWords: [number, number];
  /** 单个歌词行绑定的和弦数区间：行内槽位密度。同一字符位重复绑定会被覆盖，故实际条数可能略少 */
  chordsPerLyricLine: [number, number];
  /** 纯和弦行（间奏 / 扫弦提示行）的和弦数区间；实际条数还会被行字符预算（MAX_SEED_LINE_CHARS）截断 */
  chordsPerChordLine: [number, number];
  groupCount: number;
}

/**
 * 表单各调参项的取值边界：**防呆护栏，不是业务约束**。
 *
 * 生成是同步 CPU（见 buildDevTestData），手滑填个六位数会当场把标签页卡死、填 0 则生成空库，
 * 故每一项都要有个能兜住手滑的上下界。上界的取值依据逐项写在下面；区间型的两端共用同一组边界。
 */
export const DEV_TEST_SCALE_LIMITS = {
  /** 2000 首 × 数百行已是千万级字符，再往上只会撞浏览器内存 */
  songCount: { min: 1, max: 2000 },
  /** 分组名表只有 GROUP_NAMES.length 项，超了会出现同名分组 */
  groupCount: { min: 1, max: GROUP_NAMES.length },
  /** 每组「根音 × 品质」最多尝试 50 次（去重后远小于此数） */
  variantsPerQuality: { min: 1, max: 50 },
  /** 单首行数上界取「极端预设的 240 行」的两倍余量 */
  linesPerSong: { min: 1, max: 600 },
  /** 行词数：词库每词 2 字，上界即 MAX_SEED_LINE_CHARS / 2（超了就是编辑器输入不出来的行） */
  lineWords: { min: 1, max: MAX_SEED_LINE_CHARS / 2 },
  /** 行内和弦数：纯和弦行另受行字符预算截断，16 个已足够撑满最长行 */
  chordsPerLine: { min: 1, max: 16 },
} as const;

/**
 * 快捷预设：**只是填表入口** —— 点一下把下面这套数字写进表单，之后照常逐项改写。
 * 生成不读预设，故「预设 + 改一个数」得到的就是改完的那套值，不存在「选了档位就只能整档走」。
 *
 * 前三档只放大规模，行形态与密度共用同一套基线，便于横向比较「行数增长」这一项的开销。
 */
export const DEV_TEST_PRESETS: readonly { label: string; scale: DevTestDataScale }[] = [
  {
    label: '中等',
    scale: {
      variantsPerQuality: 3,
      songCount: 120,
      linesPerSong: [30, 56],
      shortLineWords: [2, 4],
      longLineWords: [5, 11],
      chordsPerLyricLine: [1, 3],
      chordsPerChordLine: [3, 6],
      groupCount: 12,
    },
  },
  {
    label: '大',
    scale: {
      variantsPerQuality: 9,
      songCount: 300,
      linesPerSong: [40, 80],
      shortLineWords: [2, 4],
      longLineWords: [5, 11],
      chordsPerLyricLine: [1, 3],
      chordsPerChordLine: [3, 6],
      groupCount: 18,
    },
  },
  {
    label: '巨大',
    scale: {
      variantsPerQuality: 20,
      songCount: 420,
      linesPerSong: [28, 56],
      shortLineWords: [2, 4],
      longLineWords: [5, 11],
      chordsPerLyricLine: [1, 3],
      chordsPerChordLine: [3, 6],
      groupCount: 24,
    },
  },
  {
    label: '极端',
    scale: {
      variantsPerQuality: 20,
      songCount: 90,
      linesPerSong: [160, 240],
      // 行形态独立加压：长句 40~90 字（贴 100 字上限，逼出多次软折行与超宽行）、
      // 短句 8~18 字；行内和弦 6~12 个（短句上会直接撑满字符位），纯和弦行 8~16 个。
      shortLineWords: [4, 9],
      longLineWords: [20, 45],
      chordsPerLyricLine: [6, 12],
      chordsPerChordLine: [8, 16],
      groupCount: 24,
    },
  },
];

/** 表单初始值：取「大」预设 —— 足以压出滚动 / 分组 / 缓存压力，又不至于逼近磁盘配额 */
export const DEFAULT_DEV_TEST_SCALE: DevTestDataScale = DEV_TEST_PRESETS[1]!.scale;

/**
 * 「顶满」：把八项一次性取到 DEV_TEST_SCALE_LIMITS 的上界（2000 首 × 600 行 × 每行 16 个和弦）。
 *
 * 数字**不手抄**，全部由护栏推出 —— 改了 LIMITS 它自动跟着变，不会出现「按了顶满却还差一点」。
 * 代价见 buildDevTestData：这套参数点下去会同步阻塞主线程若干秒，是刻意留给「看看最坏情况」的入口。
 */
export const DEV_TEST_SCALE_MAX: DevTestDataScale = {
  variantsPerQuality: DEV_TEST_SCALE_LIMITS.variantsPerQuality.max,
  songCount: DEV_TEST_SCALE_LIMITS.songCount.max,
  linesPerSong: [DEV_TEST_SCALE_LIMITS.linesPerSong.max, DEV_TEST_SCALE_LIMITS.linesPerSong.max],
  shortLineWords: [DEV_TEST_SCALE_LIMITS.lineWords.max, DEV_TEST_SCALE_LIMITS.lineWords.max],
  longLineWords: [DEV_TEST_SCALE_LIMITS.lineWords.max, DEV_TEST_SCALE_LIMITS.lineWords.max],
  chordsPerLyricLine: [DEV_TEST_SCALE_LIMITS.chordsPerLine.max, DEV_TEST_SCALE_LIMITS.chordsPerLine.max],
  chordsPerChordLine: [DEV_TEST_SCALE_LIMITS.chordsPerLine.max, DEV_TEST_SCALE_LIMITS.chordsPerLine.max],
  groupCount: DEV_TEST_SCALE_LIMITS.groupCount.max,
};

/**
 * 造一份可独立改写的规模副本。
 *
 * 预设与默认值都是模块级共享常量，而表单是**就地改写**的（v-model 直接落在各字段上）——
 * 不复制就地把预设挂上去，点一次「大」再改个数字，改掉的就是常量本身（下一个会话拿到被改过的「大」）。
 */
export const cloneDevTestScale = (scale: DevTestDataScale = DEFAULT_DEV_TEST_SCALE): DevTestDataScale => ({
  variantsPerQuality: scale.variantsPerQuality,
  songCount: scale.songCount,
  linesPerSong: [scale.linesPerSong[0], scale.linesPerSong[1]],
  shortLineWords: [scale.shortLineWords[0], scale.shortLineWords[1]],
  longLineWords: [scale.longLineWords[0], scale.longLineWords[1]],
  chordsPerLyricLine: [scale.chordsPerLyricLine[0], scale.chordsPerLyricLine[1]],
  chordsPerChordLine: [scale.chordsPerChordLine[0], scale.chordsPerChordLine[1]],
  groupCount: scale.groupCount,
});

export interface DevTestDataSet {
  groups: Group[];
  chords: Chord[];
  songs: Song[];
  /**
   * 预估数据体积（字节）：按 JSON 字符数 × 2 的上界估计，仅作为数据规模的粗略参照
   * （持久化已迁 IDB，实际磁盘占用由浏览器引擎编码决定）。
   */
  estimatedBytes: number;
}

/**
 * 数一份 JSON 表示的字符数。**只给 groups 与 chords 用** —— 这两类最多几千条、百 KB 量级，
 * 直接 stringify 数长度无所谓。songs 不走这里：拉满规模时那份字符串有两亿字符（数百 MB），
 * 与被数的数据同时在世，改成生成时顺手累加（见 SONG_JSON_* 与 buildSongs）。
 */
const jsonChars = (value: unknown): number =>
  JSON.stringify(value, (_key, val: unknown) => (val instanceof Map ? Object.fromEntries(val) : val)).length;

const buildGroups = (count: number): Group[] =>
  Array.from({ length: count }, (_, index) =>
    createGroup(GROUP_NAMES[index % GROUP_NAMES.length]!, GroupSortRule.ROOT_PITCH)
  );

const buildChords = (groups: Group[], scale: DevTestDataScale): Chord[] => {
  const rng = createRng(0x5eed0001);
  const chords: Chord[] = [];
  const seen = new Set<string>();

  for (let rootPitch = 0; rootPitch < 12; rootPitch++)
    for (const quality of QUALITIES) {
      const nameSegments = nameToSegments(`${ROOT_NAMES[rootPitch]!}${quality.suffix}`);
      if (!nameSegments) continue;

      for (let attempt = 0; attempt < scale.variantsPerQuality; attempt++) {
        const fretOffset = Math.floor(rng() * 8); // 0..7：覆盖零品与高把位窗口
        const fretCount = (3 + Math.floor(rng() * 3)) as 3 | 4 | 5;
        const rootString = Math.floor(rng() * 4); // 0..3：根音落在低音四弦之一
        const preferFlat = rng() < 0.5;

        const strings = buildFingering(
          rootPitch,
          quality.intervals,
          fretOffset,
          fretCount,
          rootString,
          preferFlat,
          rng
        );
        if (!strings) continue;

        const signature = fingeringSignature(strings, fretOffset, fretCount);
        if (seen.has(signature)) continue;
        seen.add(signature);

        chords.push(
          createChord({
            nameSegments,
            strings,
            fretCount,
            fretOffset: fretOffset as Chord['fretOffset'],
            groupId: groups[Math.floor(rng() * groups.length)]!.id,
            tuning: Tuning.STANDARD,
            rootStringIndex: rootString,
            // 横按在去重之后才抽：只给真正入库的和弦标，不白耗随机数
            barres: pickBarres(strings, fretCount, rng),
          })
        );
      }
    }

  return chords;
};

/** 段落标记行：真实谱面里主歌 / 副歌的起手标注，本身不绑和弦 */
const SECTION_MARKERS = ['[主歌]', '[副歌]', '[预副歌]', '[桥段]', '[前奏]', '[间奏]', '[尾奏]'] as const;

/** 纯和弦行里相邻和弦名之间的空格数（槽位按字符下标绑定，故需固定间距以对齐） */
const CHORD_LINE_GAP = 2;

/** 可绑定到谱面的和弦引用（纯和弦行需要把名字写进文本，故要带名字） */
interface ChordRef {
  id: ChordId;
  name: string;
}

/**
 * 生成期的谱面行描述。
 *
 * 只描述「这一行是什么」以及（纯和弦行）各和弦名落在第几个字符上；真正的槽位绑定在拿到
 * lineId 之后才做，故这里不出现 SlotKey。
 */
interface SeedLine {
  text: string;
  kind: 'marker' | 'blank' | 'lyric' | 'chord';
  /** 纯和弦行专用：与 chords 同序，值为该和弦名在 text 中的起始字符下标 */
  offsets?: number[];
  chords?: ChordRef[];
}

const buildLyricLine = (rng: () => number, minWords: number, maxWords: number): string => {
  const wordCount = minWords + Math.floor(rng() * (maxWords - minWords + 1));
  let line = '';
  for (let i = 0; i < wordCount; i++) line += pick(WORDS, rng);
  return line;
};

/**
 * 纯和弦行进（间奏 / 扫弦提示行）：文本即和弦名，槽位落在每个和弦名的首字符上。
 * 实际条数取规模区间与「行字符预算」的较小者：区间拉到 16 个时，长名和弦会先撞满 100 字上限，
 * 于是纯和弦行稳定落在「尽可能长」附近，而不是列表被撑爆。
 */
const buildChordLine = (
  rng: () => number,
  chordRefs: readonly ChordRef[],
  countRange: readonly [number, number]
): SeedLine => {
  const count = pickRange(countRange, rng);
  const refs: ChordRef[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  while (refs.length < count) {
    const ref = pick(chordRefs, rng);
    if (cursor + ref.name.length > MAX_SEED_LINE_CHARS) break;
    offsets.push(cursor);
    cursor += ref.name.length + CHORD_LINE_GAP;
    refs.push(ref);
  }
  return { text: refs.map(ref => ref.name).join(' '.repeat(CHORD_LINE_GAP)), kind: 'chord', offsets, chords: refs };
};

/**
 * 按段落组织谱面：标记行 → 若干歌词行（其间穿插短句行与纯和弦行）→ 空行，循环至行数达标。
 *
 * 目的是让测试数据覆盖真实谱面的全部行形态：空行（行高坍塌 / 分页）、标记行（无和弦绑定的
 * 长文本行）、短句行（行内槽位密集）、纯和弦行（字符下标与和弦名对齐）。
 * 行的长度与行内和弦密度取自规模（scale）——把长句拉到数十上百字、行内和弦拉到
 * 十余个，专门压「超宽行软折行」与「行内密集槽位」这两条路径。
 */
const buildSongLines = (
  rng: () => number,
  chordRefs: readonly ChordRef[],
  targetLines: number,
  scale: DevTestDataScale
): SeedLine[] => {
  const lines: SeedLine[] = [];
  let markerIndex = Math.floor(rng() * SECTION_MARKERS.length);

  while (lines.length < targetLines) {
    lines.push({ text: SECTION_MARKERS[markerIndex % SECTION_MARKERS.length]!, kind: 'marker' });
    markerIndex++;

    const sectionLines = 3 + Math.floor(rng() * 6);
    for (let i = 0; i < sectionLines && lines.length < targetLines; i++) {
      const roll = rng();
      if (roll < 0.12) lines.push(buildChordLine(rng, chordRefs, scale.chordsPerChordLine));
      else if (roll < 0.34) lines.push({ text: buildLyricLine(rng, ...scale.shortLineWords), kind: 'lyric' });
      else lines.push({ text: buildLyricLine(rng, ...scale.longLineWords), kind: 'lyric' });
    }

    if (lines.length < targetLines) lines.push({ text: '', kind: 'blank' });
  }

  return lines;
};

/**
 * 体积估算用的四个字符开销常量：把一首歌的 JSON 字符数**在生成过程中顺手累加**，而不是最后
 * 对全量 songs 跑一遍 `JSON.stringify` 数长度（原因见 buildDevTestData 的说明）。
 *
 * 取值都是**上界**：三种 id 一律按 14 字符（`s_` / `l_` / `c_` + 12 位，三处生成规则一致），
 * 槽位下标一律按 2 位（行长上限 100，下标 0~99）。estimatedBytes 的语义本就是「粗略参照」，
 * 不追求与 stringify 逐字节相等 —— 实测偏差在 1% 以内。
 */
/** 每首歌的固定骨架：字段名、引号、标点，以及 id / 标题 / 歌手等短字段的值 */
const SONG_JSON_FIXED_CHARS = 240;
/** lineIds 里的一项，形如 `"l_xxxxxxxxxxxx",` */
const SONG_JSON_PER_LINE_CHARS = 17;
/**
 * chordMap 里一个槽位容器（无槽位的行不建，故只有 chordMap.size 份）：
 * `"l_xxxxxxxxxxxx":{"char":{},"start":[],"end":[]},`
 */
const SONG_JSON_PER_MAP_ENTRY_CHARS = 49;
/** 一条字符槽位绑定，形如 `"12":"c_xxxxxxxxxxxx",` */
const SONG_JSON_PER_SLOT_CHARS = 22;

/** 让出一次事件循环。用 setTimeout 而非微任务：微任务在同一个任务里连续排空、不给浏览器绘制的机会 */
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * 分片造歌曲时的批次数：把 `min(songCount, 1000)` 首摊成这么多批。
 * 取 20 是权衡「让出次数」与「每批仍要占多久」——顶满 1000 首时每批 50 首约数百毫秒，
 * 用户能感知到 progress 在动，而 20 次宏任务的开销（每次约 4ms 的最小定时器精度）可忽略。
 */
const SEED_BUILD_BATCHES = 20;

/**
 * 分片版 `buildSongs`：RNG 一次创建、跨批复用，故随机序列与整批生成完全一致
 * （批边界只决定「什么时候让出」，不决定取到哪个随机数）。
 */
const buildSongsChunked = async (
  chords: Chord[],
  scale: DevTestDataScale,
  baseTime: number,
  batchSize: number,
  onProgress?: (done: number, total: number) => void
): Promise<{ songs: Song[]; songJsonChars: number }> => {
  if (chords.length === 0) return { songs: [], songJsonChars: 0 };

  const chordRefs: ChordRef[] = [];
  for (const chord of chords) {
    if (!chord.nameSegments) continue;
    const name = segmentsToString(chord.nameSegments);
    if (name) chordRefs.push({ id: chord.id, name });
  }
  if (chordRefs.length === 0) return { songs: [], songJsonChars: 0 };

  const rng = createRng(0x5eed0002);
  const songs: Song[] = [];
  let songJsonChars = 0;

  for (let start = 0; start < scale.songCount; start += batchSize) {
    const end = Math.min(start + batchSize, scale.songCount);
    for (let index = start; index < end; index++) {
      const built = buildOneSong(index, chordRefs, scale, baseTime, rng);
      songs.push(built.song);
      songJsonChars += built.jsonChars;
    }
    onProgress?.(songs.length, scale.songCount);
    if (end < scale.songCount) await yieldToEventLoop();
  }

  return { songs, songJsonChars };
};

const buildSongs = (
  chords: Chord[],
  scale: DevTestDataScale,
  baseTime: number
): { songs: Song[]; songJsonChars: number } => {
  // 没有和弦可绑时直接返回空集，避免槽位绑定取到 undefined
  if (chords.length === 0) return { songs: [], songJsonChars: 0 };

  const chordRefs: ChordRef[] = [];
  for (const chord of chords) {
    if (!chord.nameSegments) continue;
    const name = segmentsToString(chord.nameSegments);
    if (name) chordRefs.push({ id: chord.id, name });
  }
  if (chordRefs.length === 0) return { songs: [], songJsonChars: 0 };

  const rng = createRng(0x5eed0002);
  const songs: Song[] = [];
  let songJsonChars = 0;

  for (let index = 0; index < scale.songCount; index++) {
    const built = buildOneSong(index, chordRefs, scale, baseTime, rng);
    songs.push(built.song);
    songJsonChars += built.jsonChars;
  }

  return { songs, songJsonChars };
};

/**
 * 造单首歌：同步版的循环体，被同步与分片两条路径共用。
 *
 * 抽出来是为了让「分片」只是把同一段代码按批调用（见 buildSongsChunked），而不是复制一份 ——
 * 复制之后两处一旦漂移，同一套规模参数在两条路径下会产出不同的数据。
 *
 * @param index  歌曲序号（决定标题尾号与 createdAt）
 * @param rng    共享的随机源，**调用顺序即随机序列**，故调用方必须按 index 升序、不跳号调用
 */
const buildOneSong = (
  index: number,
  chordRefs: ChordRef[],
  scale: DevTestDataScale,
  baseTime: number,
  rng: () => number
): { song: Song; jsonChars: number } => {
  const targetLines = pickRange(scale.linesPerSong, rng);
  const seedLines = buildSongLines(rng, chordRefs, targetLines, scale);
  const lines = seedLines.map(line => line.text);
  const lyrics = lines.join('\n');
  const { lineIds } = matchLineIds([], lines, []);

  // 逐行绑定字符槽位：纯和弦行按和弦名首字符对齐，歌词行按规模给定的密度随机落点，
  // 标记行与空行不绑（与真实谱面一致——那两类行上不会有和弦）
  const chordMap = new Map<LineId, ChordLineSlots>();
  const setChar = (lineId: LineId, index: number, chordId: ChordId) => {
    let slots = chordMap.get(lineId);
    if (!slots) {
      slots = { char: new Map(), start: [], end: [] };
      chordMap.set(lineId, slots);
    }
    slots.char.set(index, chordId);
  };
  for (let line = 0; line < seedLines.length; line++) {
    const seedLine = seedLines[line]!;
    const lineId = lineIds[line];
    if (!lineId) continue;

    if (seedLine.kind === 'chord') {
      seedLine.chords?.forEach((ref, i) => {
        const at = seedLine.offsets?.[i];
        if (at !== undefined) setChar(lineId, at, ref.id);
      });
      continue;
    }

    if (seedLine.kind === 'marker' || seedLine.text.length === 0) continue;
    // 行内密度取自规模：1~3 个贴近真实谱面密度、同时压住 chordMap 体积（单条槽位 key 近百字节）；
    // 拉到 6~12 个时，短句行上会直接把字符位撑满。落点仍是随机，同一字符位重复绑定会被覆盖。
    const bindCount = pickRange(scale.chordsPerLyricLine, rng);
    for (let bind = 0; bind < bindCount; bind++)
      setChar(lineId, Math.floor(rng() * seedLine.text.length), pick(chordRefs, rng).id);
  }

  const title = `${pick(WORDS, rng)}${pick(WORDS, rng)}·压测 ${String(index + 1).padStart(4, '0')}`;
  const createdAt = baseTime + index * 1000;

  const song: Song = {
    id: toSongId(`s_${generateUUID().slice(0, 12)}`),
    title,
    singer: pick(SINGERS, rng),
    originalKey: pick(ROOT_NAMES, rng),
    timeSignature: pick(TIME_SIGNATURES, rng),
    lyrics,
    playKey: pick(ROOT_NAMES, rng),
    capo: Math.floor(rng() * 6) as Song['capo'],
    chordMap,
    lineIds,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  };

  // 体积估算顺手累加，不额外遍历：随规模增长的只有歌词字符数与槽位条目数，其余按上界常量计
  let slotCount = 0;
  for (const slots of chordMap.values()) slotCount += slots.char.size;

  return {
    song,
    jsonChars:
      SONG_JSON_FIXED_CHARS +
      lyrics.length +
      lineIds.length * SONG_JSON_PER_LINE_CHARS +
      chordMap.size * SONG_JSON_PER_MAP_ENTRY_CHARS +
      slotCount * SONG_JSON_PER_SLOT_CHARS,
  };
};

/**
 * 按给定规模生成一整套测试数据。
 *
 * **全程同步 CPU、阻塞主线程**：实测 50 首 × 600 行约 0.4 s，线性外推到表单上界
 * （1000 首 × 600 行 × 每行 16 个和弦）是 8 s 量级 —— 这是本操作「点下去卡住一段时间」的主要来源。
 *
 * 体积估算因此改成生成时顺手累加（见 SONG_JSON_* 与 buildSongs），不再对全量 songs 再跑一遍
 * `JSON.stringify` 数长度：那一步在拉满规模时要造一份约两亿字符（数百 MB）的字符串，与被数的
 * 数据同时在世 —— 峰值内存翻倍、V8 开始 GC 抖动，而它唯一的用途是 toast 里那句「约 XX MB」。
 * 实测这一步占生成耗时的三分之一。
 */
export const buildDevTestData = (scale: DevTestDataScale): DevTestDataSet => {
  const baseTime = Date.now() - scale.songCount * 1000;
  const groups = buildGroups(scale.groupCount);
  const chords = buildChords(groups, scale);
  const { songs, songJsonChars } = buildSongs(chords, scale, baseTime);

  return {
    groups,
    chords,
    songs,
    estimatedBytes: (jsonChars(groups) + jsonChars(chords) + songJsonChars) * 2,
  };
};

/**
 * 异步版的生成：分片造歌曲，片间让出事件循环。
 *
 * 【为什么必须让出】`buildDevTestData` 是全程同步 CPU，顶满规模（1000 首 × 600 行）实测数秒 ——
 * 这段时间是一个**不可打断的长任务**，浏览器无法插进来绘制或响应点击，页面整段僵住（开发面板的
 * 确认 loading 也转不动）。拆成「每片若干首 + 片间 yield」，长任务变成一串中任务，界面在这期间
 * 至少能重绘、按钮能响应、标签页能切换。
 *
 * 【为什么不让生成器本身变成 async】`buildSongs` 内部有闭包（`setChar` 捕获 `chordMap`）与紧耦合的
 * 即时累加，改成 async 要穿透到每一层、每首歌都要 await 一次，开销反而不划算。这里按**批次**让出
 * 就够：批次边界天然对应「一批歌」，片内仍是原来那段同步代码，语义零变化。
 *
 * 【种子与结果一致】RNG 仍是同一个 `createRng(0x5eed0002)`、按同一顺序取数，故分片不改变任何
 * 一首歌的内容 —— 同一套规模参数下 `buildDevTestData` 与 `buildDevTestDataAsync` 产出一致。
 */
export const buildDevTestDataAsync = async (
  scale: DevTestDataScale,
  onProgress?: (done: number, total: number) => void
): Promise<DevTestDataSet> => {
  const baseTime = Date.now() - scale.songCount * 1000;
  const groups = buildGroups(scale.groupCount);
  const chords = buildChords(groups, scale);

  const batchSize = Math.max(1, Math.ceil(Math.min(scale.songCount, 1000) / SEED_BUILD_BATCHES));
  const { songs, songJsonChars } = await buildSongsChunked(chords, scale, baseTime, batchSize, onProgress);

  return {
    groups,
    chords,
    songs,
    estimatedBytes: (jsonChars(groups) + jsonChars(chords) + songJsonChars) * 2,
  };
};
