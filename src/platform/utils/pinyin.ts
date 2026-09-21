/**
 * 拼音分组工具（零依赖）：乐谱「拼音分组」排序与分组标题使用。
 *
 * 复用浏览器内置 Intl.Collator('zh-Hans-CN') 的拼音排序能力，
 * 通过 23 个拼音首字母的 CJK 边界锚点反查分组键，彻底移除 pinyin-pro 等大体积依赖。
 * 边界锚点本身已按拼音序（即 collator 顺序）排列，故分组键与排序由同一 collator 驱动、二者天然一致。
 *
 * 说明：分组键仅用于 A-Z 导航与同组聚合；个别字受 ICU 拼音表差异影响可能落在相邻字母，
 * 已知偏差字通过 PINYIN_OVERRIDES（见 data/pinyin-overrides.json，由 scripts/generate-pinyin-overrides.mjs 全量比对生成）修正。
 */
import rawPinyinBoundaries from '@data/pinyin-boundaries.json';
import rawPinyinOverrides from '@data/pinyin-overrides.json';

import { registerCache } from './cache';
import { estimateValueBytes } from './common';

/** 拼音分组例外表（生成物，见 data/pinyin-overrides.json）：
 *  JSON 导入的推导类型是「无索引签名的字面量对象」，用 string 逐字索引会触发 TS7053，
 *  故在此收敛为 Record 形状后再消费。表由 scripts/generate-pinyin-overrides.mjs 生成，勿手改。 */
const PINYIN_OVERRIDES = rawPinyinOverrides as Readonly<Record<string, string>>;

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'variant' });

/** data/pinyin-boundaries.json 的形状：JSON 导入推导出的是 `string[][]`，此处收敛为只读元组对 */
interface PinyinBoundariesJson {
  boundaries: readonly (readonly [string, string])[];
}

/**
 * 拼音首字母边界锚点（无 I/U/V：普通话无对应音节声母）：每个锚点取该字母拼音序最靠前的常用字，
 * collator 顺序即拼音序，故锚点已按 A→Z 升序。
 *
 * 与生成脚本 `scripts/generate-pinyin-overrides.mjs` **共用** `data/pinyin-boundaries.json`：
 * 生成覆盖表靠的就是「用同一套锚点算 ICU 分组键」，此前两处各硬编码一份、靠注释要求人工同步。
 */
const PINYIN_BOUNDARIES = (rawPinyinBoundaries as unknown as PinyinBoundariesJson).boundaries;

const ASCII_LETTER_RE = /^[a-zA-Z]$/;
const CJK_RE = /^[一-龥]$/;
const DIGIT_RE = /^[0-9]$/;

// 拼音分组例外表见 data/pinyin-overrides.json：U+4E00–U+9FFF 全量比对 pinyin-pro 首字母生成（803 条）。

/** 记忆表容量上限：超出整体清空。值为标题 + 几十字节的元信息（纯文本小数据），
 *  上限与其余文本级缓存统一取 4096——按整个乐库的标题量级绰绰有余，正常不触发；
 *  真正触发时说明标题量异常大，整体清空重来即可 */
const MEMO_LIMIT = 4096;

/** 标题派生元信息：分组键与文种类别都只由首字符决定，合并为一次计算、一张记忆表
 *  （比较器里同一标题原先要各查 groupKey / scriptClass 两张表，现收敛为单次查找） */
interface TitleMeta {
  groupKey: string;
  scriptClass: number;
}

const titleMetaMemo = new Map<string, TitleMeta>();

// 开发面板展示：与 MEMO_LIMIT 同源于同一常量，淘汰策略是「满则整体清空」而非 LRU 逐出
registerCache({
  name: '拼音排序记忆表',
  limit: MEMO_LIMIT,
  size: () => titleMetaMemo.size,
  bytes: () => {
    let total = 0;
    for (const [title, meta] of titleMetaMemo) total += estimateValueBytes(title) + estimateValueBytes(meta);
    return total;
  },
  clear: () => titleMetaMemo.clear(),
});

/** 计算并缓存标题元信息：同一标题每轮排序 O(n log n) 次比较只会真正算一次 */
const getTitleMeta = (title: string): TitleMeta => {
  const memo = titleMetaMemo.get(title);
  if (memo) return memo;

  const ch = title.trim().charAt(0);
  let groupKey: string;
  if (!ch) groupKey = '#';
  else if (PINYIN_OVERRIDES[ch]) groupKey = PINYIN_OVERRIDES[ch]!;
  else if (ASCII_LETTER_RE.test(ch)) groupKey = ch.toUpperCase();
  else if (DIGIT_RE.test(ch) || !CJK_RE.test(ch)) groupKey = '#';
  else {
    let [prev] = PINYIN_BOUNDARIES[0]!;
    for (const [letter, anchor] of PINYIN_BOUNDARIES) {
      if (collator.compare(ch, anchor) < 0) break;
      prev = letter;
    }
    groupKey = prev;
  }
  const meta: TitleMeta = {
    groupKey,
    scriptClass: ASCII_LETTER_RE.test(ch) ? 0 : CJK_RE.test(ch) ? 1 : 2,
  };

  if (titleMetaMemo.size >= MEMO_LIMIT) titleMetaMemo.clear();
  titleMetaMemo.set(title, meta);
  return meta;
};

/** 标题首字母分组键：A-Z；数字 / 符号 / 非汉字可见字统一归 '#'。 */
export const pinyinGroupKey = (title: string): string => getTitleMeta(title).groupKey;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 分组键的展示顺序：A-Z → 0..25；#（数字 / 符号）及非法键 → 置末。 */
const groupOrder = (key: string): number => {
  const idx = ALPHABET.indexOf(key);
  return idx === -1 ? ALPHABET.length : idx;
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
  const metaA = getTitleMeta(a);
  const metaB = getTitleMeta(b);
  const orderA = groupOrder(metaA.groupKey);
  const orderB = groupOrder(metaB.groupKey);
  if (orderA !== orderB) return orderA - orderB;
  if (metaA.scriptClass !== metaB.scriptClass) return metaA.scriptClass - metaB.scriptClass;
  return collator.compare(a, b);
};
