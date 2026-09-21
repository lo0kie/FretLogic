/**
 * 调弦预设与查询：空弦音高映射、各弦数默认调弦、按弦数筛选取调弦枚举。
 *
 * 预设数据在 `data/tunings.json` —— 本次改动把原先写死在本文件的 15 条 `TUNING_PRESETS`、
 * 14 个 `TUNING_MAPPING_*` 中间常量与 `DEFAULT_TUNING_BY_STRING_COUNT` 合并了过去
 * （mapping 直接内联进各自的 preset，14 个只被引用一次的常量随之消失）。
 *
 * 为什么调弦适合放数据：它是**乐器内容**，会持续增补（更多 Drop / Open / 多弦调弦），
 * 而读取逻辑完全固定。为什么 `Tuning` 枚举不放：它同时是持久化契约（存进数据里的就是这些
 * 字符串）与编译期键，搬进 JSON 会一并丢掉「新增预设必须补枚举」的提示与 IDE 补全。
 * 数据文件的 id 与枚举成员逐字对应，加载时校验 —— 原先靠人工对照，漏一条只会表现为
 * 存储 / 编解码层面莫名其妙的兜底值。
 *
 * 本模块经 theory.ts 的 `export * from './tuning'` 保留全部原有导出，现有 import 不变。
 */

import rawTunings from '@data/tunings.json';

export enum Tuning {
  // 4 弦
  UKULELE_STANDARD = 'UKULELE_STANDARD',
  BASS_STANDARD = 'BASS_STANDARD',
  BASS_DROP_D = 'BASS_DROP_D',
  // 6 弦
  STANDARD = 'STANDARD',
  DROP_D = 'DROP_D',
  DADGAD = 'DADGAD',
  OPEN_G = 'OPEN_G',
  HALF_STEP = 'HALF_STEP',
  OPEN_D = 'OPEN_D',
  OPEN_C = 'OPEN_C',
  DROP_C = 'DROP_C',
  // 7 弦
  SEVEN_STANDARD = 'SEVEN_STANDARD',
  SEVEN_DROP_A = 'SEVEN_DROP_A',
  // 8 弦
  EIGHT_STANDARD = 'EIGHT_STANDARD',
  EIGHT_DROP_E = 'EIGHT_DROP_E',
}

export interface TuningPreset {
  name: string;
  stringCount: number;
  mapping: readonly number[];
}

/**
 * 数据文件的记录形状：id 为 `Tuning` 枚举的字符串值，加载时校验。
 */
interface RawTuningPreset {
  id: string;
  name: string;
  stringCount: number;
  mapping: number[];
}

const RAW_TUNINGS = rawTunings as unknown as {
  presets: RawTuningPreset[];
  defaultByStringCount: Record<string, string>;
};

/** 把数据文件里的 id 收窄为 `Tuning`；不在枚举中即抛错 */
const toTuning = (id: string, where: string): Tuning => {
  if (!Object.values(Tuning).includes(id as Tuning))
    throw new Error(`[tunings] ${where} 引用了 Tuning 枚举里不存在的预设：${id}`);

  return id as Tuning;
};

/**
 * 调弦预设表。顺序即「按弦数筛选」的返回顺序，与数据文件里的记录顺序一致。
 */
export const TUNING_PRESETS: Record<Tuning, TuningPreset> = Object.fromEntries(
  RAW_TUNINGS.presets.map(preset => [
    preset.id,
    {
      name: preset.name,
      stringCount: preset.stringCount,
      // 冻结：预设是共享只读数据，调用方拿到 mapping 后不应就地改写（原先每个 TUNING_MAPPING_* 都 freeze 过）
      mapping: Object.freeze(preset.mapping),
    },
  ])
) as Record<Tuning, TuningPreset>;

{
  // 枚举成员与数据文件必须一一对应：枚举新增而数据没跟上时，TUNING_PRESETS 会静默缺键，
  // 消费点（store / 编解码 / 指板面板）只会得到 undefined 而不是报错
  const missing = Object.values(Tuning).filter(tuning => !(tuning in TUNING_PRESETS));
  if (missing.length > 0) throw new Error(`[tunings] Tuning 枚举成员缺少对应预设：${missing.join(', ')}`);
}

/** 默认调弦映射（6 弦标准）；未知调弦 / 未覆盖弦数时的兜底基准 */
export const DEFAULT_TUNING_MAPPING = TUNING_PRESETS[Tuning.STANDARD].mapping;

/** 各弦数对应的默认调弦方案（超出该表时由 getDefaultTuningForStringCount 兜底为 6 弦标准） */
export const DEFAULT_TUNING_BY_STRING_COUNT: Record<number, Tuning> = Object.fromEntries(
  Object.entries(RAW_TUNINGS.defaultByStringCount).map(([stringCount, tuning]) => [
    Number(stringCount),
    toTuning(tuning, 'defaultByStringCount'),
  ])
);

/** 根据弦数获取对应的默认调弦方案（超出特定预设时兜底为 6 弦标准） */
export const getDefaultTuningForStringCount = (stringCount: number): Tuning =>
  DEFAULT_TUNING_BY_STRING_COUNT[stringCount] ?? Tuning.STANDARD;

/** 根据弦数筛选匹配的调弦枚举列表 */
export const getTuningsByStringCount = (stringCount: number): Tuning[] =>
  (Object.keys(TUNING_PRESETS) as Tuning[]).filter(t => TUNING_PRESETS[t]?.stringCount === stringCount);

/** 弦数超过预设时的向下延伸音程：吉他族标准调弦的相邻低弦为纯四度（5 半音） */
const LOWER_STRING_INTERVAL = 5;

/**
 * 取指定调弦下覆盖 stringCount 根弦的空弦音高数组（低→高）。
 *
 * 调弦预设只覆盖 4/6/7/8 弦，其余弦数（编辑器允许 3~10）原先一律回落到 6 弦标准映射，
 * 多出来的弦靠 `calcPitchIndex` 里的 `baseStrings[sIdx] ?? 0` 兜底 —— 第 7 根起音高静默塌成 0，
 * 使 9/10 弦和弦的识别、分析面板与转位判定全部失真。
 * 这里按吉他族惯例向下补纯四度（EADGBE → BEADGBE → F#BEADGBE，与 9 弦标准调弦一致）；
 * 弦数少于预设时截取低音侧（EADGBE 取 3 根 → EAD）。
 */
export const getBaseStringsFor = (tuning: Tuning | string, stringCount: number): readonly number[] => {
  const base = TUNING_PRESETS[tuning as Tuning]?.mapping ?? DEFAULT_TUNING_MAPPING;
  if (stringCount === base.length) return base;
  if (stringCount < base.length) return base.slice(0, stringCount);

  const extended: number[] = [];
  let lowest = base[0] ?? 0;
  for (let i = base.length; i < stringCount; i++) {
    lowest -= LOWER_STRING_INTERVAL;
    extended.unshift(lowest);
  }
  return [...extended, ...base];
};

/**
 * 调弦是否「重入」（reentrant）：弦序最小的弦并非物理最低音。
 * 典型是尤克里里 GCEA —— 弦 0 的 G4(67) 高于弦 1 的 C4(60)，
 * 此时「按弦序取第一根非静音弦当低音」得到的不是真正的低音。
 * 用于决定识别器取低音的口径（见 chordEngine 的 bassByPitch）。
 */
export const isReentrantTuning = (tuning: Tuning | string): boolean => {
  const preset = TUNING_PRESETS[tuning as Tuning];
  const mapping = getBaseStringsFor(tuning, preset?.stringCount ?? DEFAULT_TUNING_MAPPING.length);
  return mapping.length > 1 && mapping[0] !== Math.min(...mapping);
};
