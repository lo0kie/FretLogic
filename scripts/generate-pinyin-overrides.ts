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
 * 分组键算法与边界锚点都来自运行时本身：本脚本直接 import src/platform/utils/pinyin.ts 导出的
 * pinyinIcuGroupKey（锚点则经 data/pinyin-boundaries.json 由该模块加载）。此前脚本自带一份逐字
 * 相同的锚点循环、靠注释要求「改一处必须同步另一处」—— 那条人工约定现已由 import 取代：
 * 生成时算的键与运行时算的必然是同一个函数。正因要读 TS 源码，脚本改为 .ts 并由 vite-node 执行
 *（与 scripts/audit-chord-qualities.ts 同一形态）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { pinyin } from 'pinyin-pro';

// 相对路径而非 `@/` 别名：vite-node 场景下 tsconfig paths 别名的解析有限制（同 audit-chord-qualities.ts）
import { pinyinIcuGroupKey } from '../src/platform/utils/pinyin';

const here = import.meta.dirname;
const OUT = resolve(here, '../data/pinyin-overrides.json');

const overrides: Record<string, string> = {};
for (let code = 0x4e00; code <= 0x9fff; code++) {
  const ch = String.fromCodePoint(code);
  // 声明成 unknown 再收窄：pinyin() 的返回类型随 options 变化（string | string[]），
  // 直接按字符串用会在类型层站不住，而这里本来就只需要「是不是单字母」这一件事
  const letter: unknown = pinyin(ch, { pattern: 'first', toneType: 'none' });
  // 无读音（生僻部件等）或非 A-Z 首字母：交给 pinyin.ts 的 '#' / 锚点分支处理，不入表
  if (typeof letter !== 'string' || !/^[A-Za-z]$/.test(letter)) continue;
  const proKey = letter.toUpperCase();
  if (pinyinIcuGroupKey(ch) !== proKey) overrides[ch] = proKey;
}

// 按键的码点升序输出，保证生成结果稳定可比对（对象键顺序否则依赖插入序）
const sorted: Record<string, string> = {};
for (const key of Object.keys(overrides).sort()) sorted[key] = overrides[key]!;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
console.log(`[pinyin-overrides] 共 ${Object.keys(sorted).length} 条不一致 → ${OUT}`);
