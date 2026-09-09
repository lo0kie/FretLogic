/**
 * 拼音分组工具（零依赖）：乐谱「拼音分组」排序与分组标题使用。
 *
 * 复用浏览器内置 Intl.Collator('zh-Hans-CN') 的拼音排序能力，
 * 通过 23 个拼音首字母的 CJK 边界锚点反查分组键，彻底移除 pinyin-pro 等大体积依赖。
 * 边界锚点本身已按拼音序（即 collator 顺序）排列，故分组键与排序由同一 collator 驱动、二者天然一致。
 *
 * 说明：分组键仅用于 A-Z 导航与同组聚合；个别字受 ICU 拼音表差异影响可能落在相邻字母，
 * 已知偏差字通过 PINYIN_OVERRIDES（见 pinyinOverrides.ts，全量比对自动生成）修正。
 */
import { PINYIN_OVERRIDES } from './pinyinOverrides';

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'variant' });

// 拼音首字母边界锚点（无 I/U/V：普通话无对应音节声母）。
// 每个锚点取该字母拼音序最靠前的常用字；collator 顺序即拼音序，故锚点已按 A→Z 升序。
const PINYIN_BOUNDARIES: readonly (readonly [string, string])[] = [
  ['A', '阿'],
  ['B', '八'],
  ['C', '擦'],
  ['D', '搭'],
  ['E', '额'],
  ['F', '发'],
  ['G', '噶'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '趴'],
  ['Q', '七'],
  ['R', '然'],
  ['S', '撒'],
  ['T', '塌'],
  ['W', '挖'],
  ['X', '昔'],
  ['Y', '呀'],
  ['Z', '匝'],
];

const ASCII_LETTER_RE = /^[a-zA-Z]$/;
const CJK_RE = /^[一-龥]$/;
const DIGIT_RE = /^[0-9]$/;

// 拼音分组例外表见 pinyinOverrides.ts：U+4E00–U+9FFF 全量比对 pinyin-pro 首字母生成（803 条）。

/** 标题首字母分组键：A-Z；数字 / 符号 / 非汉字可见字统一归 '#'。 */
export const pinyinGroupKey = (title: string): string => {
  const ch = title.trim().charAt(0);
  if (!ch) return '#';
  if (PINYIN_OVERRIDES[ch]) return PINYIN_OVERRIDES[ch]!;
  if (ASCII_LETTER_RE.test(ch)) return ch.toUpperCase();
  if (DIGIT_RE.test(ch)) return '#';
  if (!CJK_RE.test(ch)) return '#';
  let prev = PINYIN_BOUNDARIES[0]![0];
  for (const [letter, anchor] of PINYIN_BOUNDARIES) {
    if (collator.compare(ch, anchor) < 0) return prev;
    prev = letter;
  }
  return 'Z';
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 分组键的展示顺序：A-Z → 0..25；#（数字 / 符号）及非法键 → 置末。 */
const groupOrder = (key: string): number => {
  const idx = ALPHABET.indexOf(key);
  return idx === -1 ? ALPHABET.length : idx;
};

/** 标题首字符的文种类别：拉丁字母 0 / 汉字 1 / 其他（数字·符号·空）2。 */
const scriptClass = (title: string): number => {
  const ch = title.trim().charAt(0);
  if (ASCII_LETTER_RE.test(ch)) return 0;
  if (CJK_RE.test(ch)) return 1;
  return 2;
};

/**
 * 拼音分组排序比较器（三级）：
 * 1) 先按 A-Z→# 的分组序，保证 A-Z 整体在前、# 置末；
 * 2) 同分组内字母开头领先汉字——zh-CN 排序把所有拉丁字母排在汉字之后，
 *    若直接用 collator 作主键会让字母开头的歌整体沉到列表底部，故此处显式让字母领先；
 * 3) 最后由 collator 在同类内按拼音 / 字母序升序。
 * 因此字母开头的歌归入各自 A-Z 分组、不再沉底。
 */
export const compareByPinyin = (a: string, b: string): number => {
  const orderA = groupOrder(pinyinGroupKey(a));
  const orderB = groupOrder(pinyinGroupKey(b));
  if (orderA !== orderB) return orderA - orderB;
  const ca = scriptClass(a);
  const cb = scriptClass(b);
  if (ca !== cb) return ca - cb;
  return collator.compare(a, b);
};
