/**
 * 性能基准（领域层纯函数）
 *
 * 用法：
 *   pnpm bench              与已提交的基线比对，超容差即 exit 1（CI 的回归哨兵）
 *   pnpm bench:baseline     重录基线到 scripts/bench-baseline.json
 *
 * 覆盖：和弦识别引擎、乐理计算。
 * 注意：本脚本用 vite-node 运行 TS 源码（与产物同源）。
 *
 * 为什么比的是**倍率**而不是绝对毫秒：CI 共享跑机噪声极大，同一份代码在冷热机上能差出数倍，
 * 任何绝对阈值都会随机红，最后只能被 ignore 掉。故这里只拦「量级级别的退化」（默认 3x）。
 *
 * 基线缺失时**退化为信息性输出**并提示去录，不让「还没录基线」把 CI 打红 ——
 * 但也就意味着：没有提交基线文件的仓库里，这个哨兵是不生效的（不是静默通过，是明确未启用）。
 *
 * 基线是**机器相关**的：换机器 / 换 Node 大版本后应重录，否则比的是两台机器而不是两次改动。
 * 重录前先连续跑两次确认当次跑数稳定（首跑常受冷缓存影响）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** 判定失败所需的倍率。低于它一律只报告、不失败 —— 见文件头「为什么是倍率」。 */
const TOLERANCE = 3;
const BASELINE_PATH = 'scripts/bench-baseline.json';

const SCRIPT = `
// 相对导入：vite-node 场景下绕开 tsconfig paths 别名解析限制
import { analyzeChordGraph } from '../src/domains/chord/theory/chordEngine';
import { getActiveBaseStrings } from '../src/domains/chord/theory/theory';

function bench(name, fn, iterations = 2000) {
  // 预热
  for (let i = 0; i < iterations / 10; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  console.log(name.padEnd(28), (elapsed / iterations).toFixed(4), 'ms/op');
}

// 1. 和弦识别：常见音名组合
const noteSets = [
  ['C', 'E', 'G'],
  ['C', 'E', 'G', 'B'],
  ['D', 'F#', 'A'],
  ['A', 'C#', 'E'],
  ['G', 'B', 'D', 'F'],
  ['C', 'Eb', 'G', 'Bb'],
  ['F', 'A', 'C', 'E'],
  ['E', 'G#', 'B'],
  ['Am', 'C', 'E', 'G'],
  ['Dm', 'F', 'A', 'C'],
];
bench('analyzeChordGraph', () => {
  for (const notes of noteSets) analyzeChordGraph(notes);
}, 1000);

// 2. 乐理：调弦预设查询（频繁调用路径）
bench('getActiveBaseStrings', () => {
  getActiveBaseStrings('STANDARD');
}, 50000);

// 3. 大量音符和弦识别（近似大型谱面扫描）
const bigSet = Array.from({ length: 60 }, (_, i) => noteSets[i % noteSets.length]);
bench('analyzeChordGraph x60', () => {
  for (const notes of bigSet) analyzeChordGraph(notes);
}, 200);
`;

/** 从 `name<pad>0.0123 ms/op` 形态的输出里抽出各项跑数；名字里允许含空格（如 `xxx x60`） */
const parseResults = text => {
  const results = new Map();
  for (const rawLine of text.split('\n')) {
    const match = /^(.+?)\s+([\d.]+)\s+ms\/op$/.exec(rawLine.trim());
    if (match) results.set(match[1], Number(match[2]));
  }
  return results;
};

const pad = (value, width) => String(value).padEnd(width);

const tmp = path.resolve('.temp/bench-run.ts');
fs.mkdirSync(path.resolve('.temp'), { recursive: true });
fs.writeFileSync(tmp, SCRIPT);

console.log('Fret-Logic 领域层性能基准\n');
const run = spawnSync('npx vite-node .temp/bench-run.ts', { shell: true, encoding: 'utf8' });
process.stdout.write(run.stdout ?? '');
process.stderr.write(run.stderr ?? '');
if (run.status !== 0) process.exit(run.status ?? 1);

const measured = parseResults(run.stdout ?? '');
if (measured.size === 0) {
  console.error('没能从输出里解析出任何 ms/op —— 基准脚本的输出格式变了？');
  process.exit(1);
}

if (process.argv.includes('--update-baseline')) {
  const baseline = {
    recordedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    tolerance: TOLERANCE,
    results: Object.fromEntries(measured),
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\n基线已写入 ${BASELINE_PATH}（${measured.size} 项，容差 ${TOLERANCE}x）。请连同本次改动一起提交。`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.log(`\n尚无基线（${BASELINE_PATH} 不存在），本次仅作信息性输出，回归哨兵未启用。`);
  console.log('要启用：先跑一次 pnpm bench:baseline，把当前跑数记为基线并提交。');
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const baseResults = baseline.results ?? {};

// 容差只认本地 TOLERANCE：baseline.tolerance 是**录制当时**的值，打印它而按 TOLERANCE 判定，
// 会让人照着错的那个数去调。
console.log(
  `\n与基线比对（${baseline.recordedAt ?? '未知时间'} / ${baseline.node ?? '未知 Node'} / ` + `容差 ${TOLERANCE}x）：\n`
);
console.log(`${pad('项目', 24)}${pad('基线', 12)}${pad('本次', 12)}${pad('倍率', 10)}判定`);

let failed = 0;
for (const [name, value] of measured) {
  const base = baseResults[name];
  if (typeof base !== 'number' || base <= 0) {
    console.log(`${pad(name, 24)}${pad('—', 12)}${pad(value.toFixed(4), 12)}${pad('—', 10)}新增，无基线可比`);
    continue;
  }
  const ratio = value / base;
  const over = ratio >= TOLERANCE;
  if (over) failed += 1;
  console.log(
    `${pad(name, 24)}${pad(base.toFixed(4), 12)}${pad(value.toFixed(4), 12)}${pad(`${ratio.toFixed(2)}x`, 10)}` +
      `${over ? `✗ 超过 ${TOLERANCE}x` : '✓'}`
  );
}

// 「基线里有、本次没跑到」必须**计失败**：项被改名或删掉时只打印不失败，等于这条哨兵静默失效，
// 而基线仍显示覆盖它。确属有意删改就去重录基线（pnpm bench:baseline），别让它悄悄少守一项。
const missing = Object.keys(baseResults).filter(name => !measured.has(name));
if (missing.length > 0) {
  failed += missing.length;
  console.error(`\n✗ 基线里有、本次没跑到的项（改名或已删除？）：${missing.join(' / ')}`);
  console.error('  若确属有意删改，跑一次 pnpm bench:baseline 重录基线。');
}

if (failed > 0) {
  console.error(
    `\n✗ ${failed} 项超过 ${TOLERANCE}x 容差。若确认是跑机差异而非真实退化，` +
      `跑一次 pnpm bench:baseline 重录（重录前先连跑两次确认稳定）。`
  );
  process.exit(1);
}

console.log('\n✓ 全部在容差内');
