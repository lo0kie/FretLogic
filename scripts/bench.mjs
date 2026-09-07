/**
 * 性能基准（领域层纯函数）
 *
 * 用法：
 *   pnpm bench
 *
 * 覆盖：和弦识别引擎、乐理计算、谱面行构建。
 * 目标：作为性能回归哨兵——若重构导致核心算法显著变慢，CI 会暴露。
 * 注意：本脚本用 vite-node 运行 TS 源码（与产物同源）。
 */
import { execSync } from 'node:child_process';

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

const fs = await import('node:fs');
const path = await import('node:path');
const tmp = path.resolve('.temp/bench-run.ts');
fs.mkdirSync(path.resolve('.temp'), { recursive: true });
fs.writeFileSync(tmp, SCRIPT);
console.log('Fret-Logic 领域层性能基准\n');
execSync('npx vite-node .temp/bench-run.ts', { stdio: 'inherit' });
