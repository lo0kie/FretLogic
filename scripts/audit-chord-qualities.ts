/**
 * 和弦性质语料 × tonal 口径差分（审计工具，**不是门禁**）。
 *
 * 用法：`pnpm audit:qualities`
 *
 * 为什么是「差分」而不是「生成」：曾评估过用 tonal 直接生成 `data/chord-qualities.json`
 * 的候选写法与音集，实测不成立 —— 两者的音集空间不同（本项目是 mod 12 的音集，tonal 是
 * 保留八度的音程空间），本项目还有一批配方 tonal 根本没有（`no3` / `add4` / `madd*` /
 * `7sus2` / `maj11` / `augMaj7`…）。拿它当生成器会把本项目的语义削到 tonal 的子集上。
 *
 * 但作为**第二意见**它很有用：本项目 64 个 token 的配方是手写的，没有外部基准可对照；
 * tonal 是同一领域的成熟实现，两者的分歧点天然是「值得人工看一眼」的位置。
 * 这个脚本把分歧摊开，不判对错 —— 判定要人来做，所以它只输出、不设退出码。
 *
 * 怎么读输出（四类，处理方式不同）：
 * - **真分歧**：两边都认这个写法，但音集不同。要人工判断谁对。已知的成规模一类是扩展和弦的
 *   十一音：爵士惯例里 `C11` / `C13` 常省三音（十一音与三音是小九度），tonal 照此省，本项目不省。
 * - **tonal 认配方但不认这个写法**：tonal 把同一配方记成另一种拼写（`m6/9` 对 `m69`、
 *   括号写法对紧邻写法）。属写法差异，不是缺口。
 * - **tonal 未收录**：全部别名都问不到。属预期缺口，本项目的配方集比 tonal 大。
 * - **仅八度口径差**：音集一致，只是 tonal 把同一音级的不同八度都列了出来（`C11` 给 14 而非 2）。
 *   纯表示法差异，可忽略。
 *
 * 为什么用 vite-node 跑：与 `scripts/bench.mjs` 同源 —— 直接跑 TS 源码，
 * 与产物读的是同一份 `QUALITY_TOKENS`（从 `data/chord-qualities.json` 派生），
 * 不需要把表复制一份到脚本里。脚本自身的 import 一律用相对路径，
 * 绕开 vite-node 场景下 tsconfig paths 别名的解析限制。
 */
import { Chord, Note } from 'tonal';

import { chordQualityAstToIntervals } from '../src/domains/chord/theory/chordQualityAst';
import { QUALITY_TOKENS } from '../src/domains/chord/theory/chordQualityTokens';

/** 一个音名 → 半音值；tonal 认不出的音名（罕见写法）返回 null 由调用方丢弃 */
const chromaOf = (note: string): number | null => {
  const chroma = Note.chroma(note);
  return typeof chroma === 'number' ? chroma : null;
};

const sorted = (values: Iterable<number>): number[] => [...values].sort((a, b) => a - b);

const sameSet = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean =>
  a.size === b.size && [...a].every(value => b.has(value));

type Row =
  | { kind: 'missing'; id: string; name: string; project: number[] }
  | { kind: 'spellingGap'; id: string; name: string; project: number[]; knownAs: string[] }
  | { kind: 'identical'; id: string; name: string; project: number[] }
  | { kind: 'octave'; id: string; name: string; project: number[]; tonal: number[] }
  | { kind: 'divergent'; id: string; name: string; project: number[]; tonal: number[] };

/** tonal 是否认得这个和弦名（认得出且真的给出音） */
const tonalKnows = (name: string): boolean => {
  const chord = Chord.get(name);
  return !chord.empty && chord.notes.length > 0;
};

/**
 * 逐 token 对照。
 *
 * 查询写法取 `spellings[0]`（token 的首选全称）：它是渲染时用的那一支，也是「本 token 叫什么」
 * 的官方答案。拿别的别名去问 tonal，得到的是「tonal 认不认这个别名」，与配方对照无关 ——
 * 只在首选写法完全问不到时才拿其余别名去区分「写法差异」与「真缺口」。
 */
const rows: Row[] = QUALITY_TOKENS.map(token => {
  const id = token.id;
  const name = `C${token.spellings[0] ?? ''}`;
  const project = chordQualityAstToIntervals(token.ast).all;

  if (!tonalKnows(name)) {
    const knownAs = token.spellings.slice(1).filter(spelling => tonalKnows(`C${spelling}`));
    return knownAs.length > 0
      ? { kind: 'spellingGap', id, name, project, knownAs }
      : { kind: 'missing', id, name, project };
  }

  const chord = Chord.get(name);
  const chromas = chord.notes.map(chromaOf).filter((value): value is number => value !== null);
  const raw = new Set(chromas);
  const mod = new Set(chromas.map(value => ((value % 12) + 12) % 12));

  // 音集空间对齐后再比：本项目的音集是 mod 12 的，tonal 的 `notes` 保留八度
  //（`C11` 会给出 14 而不是 2）。不先对齐，满屏都是假分歧。
  if (!sameSet(new Set(project), mod)) return { kind: 'divergent', id, name, project, tonal: sorted(raw) };

  // 音集一致，但 tonal 给出的音高里有 ≥ 12 的（即把同一音级的不同八度都列了出来）：
  // 口径差，不是分歧 —— 单独列出来是为了让人看清「哪些差异只是表示法差异」。
  if ([...raw].some(value => value >= 12)) return { kind: 'octave', id, name, project, tonal: sorted(raw) };

  return { kind: 'identical', id, name, project };
});

const pad = (text: string, width: number): string => text.padEnd(width, ' ');
const fmt = (values: readonly number[]): string => `[${values.join(', ')}]`;

const groups = {
  identical: rows.filter(row => row.kind === 'identical'),
  octave: rows.filter(row => row.kind === 'octave'),
  divergent: rows.filter(row => row.kind === 'divergent'),
  spellingGap: rows.filter(row => row.kind === 'spellingGap'),
  missing: rows.filter(row => row.kind === 'missing'),
};

console.log('和弦性质语料 × tonal 口径差分（审计，不判对错）\n');
console.log(
  `token 总数 ${rows.length} / 音集一致 ${groups.identical.length} / ` +
    `仅八度口径差 ${groups.octave.length} / 真分歧 ${groups.divergent.length} / ` +
    `tonal 认配方但不认写法 ${groups.spellingGap.length} / tonal 未收录 ${groups.missing.length}`
);

if (groups.divergent.length > 0) {
  console.log('\n── 真分歧（音集 mod 12 对齐后仍不同，需人工判断谁对）──');
  console.log(`${pad('token', 18)}${pad('写法', 12)}${pad('本项目', 24)}tonal`);
  for (const row of groups.divergent)
    console.log(`${pad(row.id, 18)}${pad(row.name, 12)}${pad(fmt(row.project), 24)}${fmt(row.tonal)}`);
}

if (groups.spellingGap.length > 0) {
  console.log('\n── tonal 认配方但不认这个写法（换别名即可命中，属写法差异）──');
  console.log(`${pad('token', 18)}${pad('本项目写法', 12)}tonal 认得的别名`);
  for (const row of groups.spellingGap)
    console.log(`${pad(row.id, 18)}${pad(row.name, 12)}${row.knownAs.map(s => `C${s}`).join(' / ')}`);
}

if (groups.missing.length > 0) {
  console.log('\n── tonal 未收录（全部别名都问不到，本项目独有配方）──');
  console.log(`${pad('token', 18)}${pad('写法', 12)}本项目`);
  for (const row of groups.missing) console.log(`${pad(row.id, 18)}${pad(row.name, 12)}${fmt(row.project)}`);
}

if (groups.octave.length > 0) {
  console.log('\n── 仅八度口径差（同一音级的不同八度被 tonal 一并列出）──');
  console.log(`${pad('token', 18)}${pad('写法', 12)}${pad('本项目', 24)}tonal`);
  for (const row of groups.octave)
    console.log(`${pad(row.id, 18)}${pad(row.name, 12)}${pad(fmt(row.project), 24)}${fmt(row.tonal)}`);
}

console.log(`\n── 音集一致（${groups.identical.length}）──`);
console.log(groups.identical.map(row => row.id).join(' / '));
