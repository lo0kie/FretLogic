/**
 * 生成「拼音分组例外表」（data/pinyin-overrides.json）。
 *
 * ── 为什么需要这张表 ──
 * src/platform/utils/pinyin.ts 刻意不引入 pinyin-pro，改用 Intl.Collator('zh-Hans-CN') 的拼音序
 * 加 23 个首字母边界锚点反查分组键（零依赖、体积为 0）。但 ICU 的拼音表与 pinyin-pro 的词库有出入，
 * 个别汉字会落到相邻字母。本脚本在 U+4E00–U+9FFF 上逐字比对两者的分组键，把不一致的字固化成覆盖表。
 *
 * ── 为什么单独放脚本 ──
 * 原生成脚本曾放在 .temp/（已 gitignore），随临时目录清理而丢失，只剩产物本身——
 * 表变成「不可复现、不可解释」的黑盒。迁到这里后：产物在仓库里可见，生成能力也可复现。
 *
 * ── 用法 ──
 *   pnpm install                                  # pinyin-pro 已在 devDependencies，装好即可
 *   pnpm gen:pinyin                               # 重新生成 data/pinyin-overrides.json
 *
 * ── 注意 ──
 * 比对结果依赖**运行时的 ICU 数据**（Intl.Collator）与 pinyin-pro 的词库版本。
 * 换 Node 大版本、或升级 pinyin-pro 后重新生成，结果可能变化——这是预期行为，
 * 但生成物的 diff 必须被 review 后再提交：表是「当前环境下的最优修正」，不是绝对真理。
 *
 * ── 与运行时的同源 ──
 * 分组边界锚点（PINYIN_BOUNDARIES）已抽到 data/pinyin-boundaries.json，本脚本与
 * src/platform/utils/pinyin.ts 共用同一份。此前两处各硬编码一份、靠注释要求「改一处必须
 * 同步另一处」（否则生成的覆盖表会与运行时的分组逻辑不同源），这条人工约定现已取消。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pinyin } from 'pinyin-pro';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../data/pinyin-overrides.json');

/** 边界锚点：与运行时（src/platform/utils/pinyin.ts）共用 data/pinyin-boundaries.json */
const PINYIN_BOUNDARIES = JSON.parse(readFileSync(resolve(here, '../data/pinyin-boundaries.json'), 'utf-8')).boundaries;

const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'variant' });

/** 与 pinyin.ts 的 getTitleMeta 同源的 ICU 分组键（边界锚点升序 → 取最后一个不大于该字的锚点） */
const icuGroupKey = ch => {
  let prev = PINYIN_BOUNDARIES[0][0];
  for (const [letter, anchor] of PINYIN_BOUNDARIES) {
    if (collator.compare(ch, anchor) < 0) break;
    prev = letter;
  }
  return prev;
};

const overrides = {};
for (let code = 0x4e00; code <= 0x9fff; code++) {
  const ch = String.fromCodePoint(code);
  const letter = pinyin(ch, { pattern: 'first', toneType: 'none' });
  // 无读音（生僻部件等）或非 A-Z 首字母：交给 pinyin.ts 的 '#' / 锚点分支处理，不入表
  if (!letter || !/^[A-Za-z]$/.test(letter)) continue;
  const proKey = letter.toUpperCase();
  if (icuGroupKey(ch) !== proKey) overrides[ch] = proKey;
}

// 按键的码点升序输出，保证生成结果稳定可比对（对象键顺序否则依赖插入序）
const sorted = {};
for (const key of Object.keys(overrides).sort()) sorted[key] = overrides[key];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
console.log(`[pinyin-overrides] 共 ${Object.keys(sorted).length} 条不一致 → ${OUT}`);
