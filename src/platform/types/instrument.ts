/**
 * 乐器模型合同（三域共用的底层原语）。
 *
 * 琴弦实体/模型、品位偏移、横按、变调夹等「乐器物理模型」的类型与核心常量原先寄居在
 * fretboard 域，实际被 chord / score / fretboard 三域（及 app 校验层）共同消费；
 * 收拢到 platform/types 以解除 chord ↔ fretboard 的双向咬合。本文件自包含：
 * 仅依赖同层的 platform/types/brand，不依赖任何领域或应用代码。
 */
import type { Brand } from '@/platform/types/brand';

/** 琴弦实体：品位是物理事实，升降号偏好是纯显示偏好，二者拆分存放（避免同指纹只因显示偏好不同被判重） */
export interface GuitarStringEntity {
  /** 按哪品（-1 表示静音弦；合法域 -1/0/1..fretCount） */
  fret: number;
  /** 该音写成升号还是降号（纯显示偏好） */
  preferFlat: boolean;
}

/** 琴弦模型：动态长度的琴弦数组（支持 3~10 弦，常用 4/6/7/8 弦） */
export type GuitarStringsModel = GuitarStringEntity[];

/** 琴弦索引：从 0 开始的非负整数（0 代表最低音粗弦，如 6 弦吉他的低 E） */
export type StringIndex = number;

/** 变调夹品位（0 表示不使用变调夹，上限 12） */
export type Capo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 和弦指板品位/把位偏移量（0 表示指板视窗从 1 品起步，上限 12） */
export type FretOffset = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 品牌数值：横按所在品位（正整数 >= 1；0 品为变调夹/空弦不属于横按），运行时仍是 number */
export type BarreFret = Brand<number, 'BarreFret'>;

/** 横按描述实体 */
export interface BarreEntity {
  /** 横按所在品位（>= 1；0 品为变调夹/空弦不属于横按） */
  fret: BarreFret;
  /** 横按起始弦索引（0~5，0 代表 6 弦，5 代表 1 弦） */
  fromString: StringIndex;
  /** 横按终止弦索引（0~5，必须 >= fromString） */
  toString: StringIndex;
  /** 可选：指法指序（通常为 1 指 / 食指） */
  finger?: 1 | 2 | 3 | 4;
}

/** 可选品数（指板支持的品位窗口档位；扩展品数只需改这里与各 *MAP 映射表） */
export const FRET_COUNTS = [3, 4, 5] as const;
/** 默认品数：清洗兜底、解码兜底、初始草稿共用此值（取 4 品档） */
export const DEFAULT_FRET_COUNT = 4;

/**
 * 静音弦的品位标记。
 *
 * 与 0 的区别是语义性的：0 表示「弹空弦」这个物理事实，本值表示「这根弦不发声」。
 * 它是**跨域共用**的约定值 —— 指板绘制（`fretboardDrawCore`）、音高与和弦推导（`theory/pitch`
 * 的 `isMuted` / `createString` / `normalizeChord` / `transpose`）、和弦编辑（`chordBarreLogic`
 * 掐弦、`useFretboardEdits` 点按取消）、乐谱文本编解码（`textCodec` 的默认弦）都判它，
 * 而 `GuitarStringEntity.fret` 是裸 `number`（上界随 fretCount 变化，收不成固定联合）。
 * 此前这些地方各写一遍 `-1`，任一处写错只会表现为「某根弦的音画错了」，没有任何报错。
 */
export const MUTED_FRET = -1;

/**
 * 单弦品位的上界：把位偏移上限（`FretOffset` 的 12）+ 最大品窗（`FRET_COUNTS` 最大值）。
 *
 * `strings[].fret` 是**窗口内相对品号**，绝对品位由 `fretOffset + fret` 给出
 * （见 transpose 里 `shift_frets` 分支与清洗层 `boundFret` 的口径），故上界是两者之和。
 * 校验层用它拦掉 `1e9` 这类越界值 —— 越界品位在渲染与音高计算里都是无意义输入。
 */
export const MAX_STRING_FRET: number = 12 + Math.max(...FRET_COUNTS);
