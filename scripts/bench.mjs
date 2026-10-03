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

/**
 * 仓库根：所有路径一律由它派生，**不依赖 cwd**。
 *
 * 其余 14 个脚本都用 `import.meta.dirname` 定位资源，本脚本此前是唯一的例外（裸相对路径）。
 * 而 `--update-baseline` 是**写操作**：在非仓库根执行（`node /path/to/repo/scripts/bench.mjs
 * --update-baseline`）会静默把基线写到 cwd 下的 `scripts/`（多半直接 ENOTDIR/ENOENT，
 * 运气不好则写进另一个目录里的同名文件），而读基线那一侧同样按 cwd 找 —— 两边一起错位，
 * 表现为「刚录完基线，比对却说不存在」。
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'bench-baseline.json');

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
  // 6 位小数：极快项（如 getActiveBaseStrings）按 4 位打印会被记成 0.0000，
  // 基线一旦记成 0，判定分支就只能把它当「基线无效」判失败（见脚本尾部 base <= 0）——
  // 这项哨兵于是要么每笔必红、要么永不拦截。
  // 但打印精度只是**下限**问题：真出现 0 通常意味着返回值没被消费、整段调用被 V8 优化掉了，
  // 那种情况必须去调用点补一个汇点（见第 2 项），调精度救不回来。
  console.log(name.padEnd(28), (elapsed / iterations).toFixed(6), 'ms/op');
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
// 返回值累积到**汇点**：不消费结果时 V8 会把整段调用优化掉，计时恒为 0（旧基线正是记成了 0，
// 于是判定分支按「基线无效」每笔判失败）。汇点挂在 globalThis 上而不是局部变量 ——
// 局部变量「读过但没人用」时仍可能被判成死值，写进全局对象才是不可消除的副作用。
let baseStringsSink = 0;
bench(
  'getActiveBaseStrings',
  () => {
    baseStringsSink += getActiveBaseStrings('STANDARD').length;
  },
  200000
);
globalThis.__benchSink = baseStringsSink;

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

const tmpDir = path.join(ROOT, '.temp');
const tmp = path.join(tmpDir, 'bench-run.ts');
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(tmp, SCRIPT);

console.log('Fret-Logic 领域层性能基准\n');
// cwd 固定为仓库根：vite-node 要按仓库根的 vite/ts 配置解析 .temp 下的脚本，
// 从别处调用时不能让「当前目录」决定用哪份配置。命令里用**相对 ROOT 的路径**而不是绝对路径 ——
// 后者在 Windows 上带反斜杠，经 shell 传递时容易被当成转义符吃掉。
const run = spawnSync(`npx vite-node ${path.relative(ROOT, tmp)}`, {
  shell: true,
  encoding: 'utf8',
  cwd: ROOT,
});
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
  if (typeof base !== 'number') {
    console.log(`${pad(name, 24)}${pad('—', 12)}${pad(value.toFixed(6), 12)}${pad('—', 10)}新增，无基线可比`);
    continue;
  }
  // 基线为 0 / 非正**不能**当成「无基线可比」悄悄跳过 —— 那正是下面 missing 那段批判的静默失效：
  // 该形态意味着这项的跑数低于测量/打印精度，于是它被基线宣称覆盖却永不拦截，等于少守一项。
  // 计失败并指向重录，别让它悄悄消失。
  if (base <= 0) {
    failed += 1;
    console.error(`${pad(name, 24)}${pad(base, 12)}${pad(value.toFixed(6), 12)}${pad('—', 10)}✗ 基线为 0，无法比对`);
    continue;
  }
  // 本次实测为 0：这份基准表里每一项都是「一次调用的耗时（ms）」，真实跑数不可能恰好为 0 ——
  // 出现 0 只意味着测量点失效（该段代码没被走到、计时被绕过）。而 ratio = 0 会一路判 ✓：
  // 哨兵在「整段实现被摘掉」这种最该拦的形态下反而静默放行。
  if (value <= 0) {
    failed += 1;
    console.error(
      `${pad(name, 24)}${pad(base.toFixed(6), 12)}${pad(value.toFixed(6), 12)}${pad('—', 10)}✗ 本次实测为 0，测量点可能失效`
    );
    continue;
  }
  const ratio = value / base;
  const over = ratio >= TOLERANCE;
  if (over) failed += 1;
  console.log(
    `${pad(name, 24)}${pad(base.toFixed(6), 12)}${pad(value.toFixed(6), 12)}${pad(`${ratio.toFixed(2)}x`, 10)}` +
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
    `\n✗ ${failed} 项未通过（超过 ${TOLERANCE}x 容差 / 基线无效 / 基线缺失，见上方逐条判定）。` +
      `若确认是跑机差异而非真实退化，跑一次 pnpm bench:baseline 重录（重录前先连跑两次确认稳定）。`
  );
  process.exit(1);
}

console.log('\n✓ 全部在容差内');
