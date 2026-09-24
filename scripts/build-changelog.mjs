/**
 * 由 changelog/ 下的片段拼出 .github/CHANGELOG.md —— 该文件自此是**派生文件**，不要手改。
 *
 * 为什么要把日志拆成片段：
 * 单文件写日志时，`proseWrap: always`（120 列）会对整篇重排，一条 30 行的新条目
 * 能产出上千行折行 diff（历史实测某笔 924/658，其中 700 多行是纯折行）；且条目越往上叠，
 * 编辑点越靠前、并发改动越容易撞在同一段。拆成「一笔提交一个片段」后：
 * 新增条目 = 新增一个小文件，既不触碰既有文件、也不产生折行重排，
 * 于是 diff 恒为「N 行新增 / 0 行删除」，也不会有合并冲突。
 *
 * 分区规则：**以提交为界**。已提交的片段即冻结（只读 —— 改它就把「N 行新增 / 0 行删除」破坏了）；
 * 未提交的片段可塑 —— 尚未提交的改动同属一区，片段边界对齐**提交边界**、不对齐「改了几轮」：
 * 同一笔提交要带的改动应并进同一个片段、就地改写，而不是每改一轮新开一个片段。生成器本身不区分这两区
 * （它只是个拼接器），这条约束由作者与 `AGENTS.md` §4.2「变更日志片段的分区规则」保证。
 *
 * 片段命名：`<YYYY-MM-DD-HHMM>-<ascii-kebab-slug>.md`
 * - 短 slug 取主流片段化日志的同一口径（towncrier 的 `+<slug>.<type>.md`、changesets、reno）：
 *   文件名只是一个**短标识符**，不是条目摘要。此前把提交主题整句塞进文件名、再按固定宽度截断，
 *   切出来的词是断的（`滚动渐隐改-mask-方`），又长又读不出意思。
 * - 用 ASCII kebab-case：全仓文件名皆为 ASCII，ASCII 也能在任何终端 / 归档工具里原样显示。
 * - 保留时间戳前缀是本项目对主流的**唯一偏离**：主流靠 issue / PR 编号或 VCS 自己排序，
 *   而本生成器是 changelog/ 目录的纯函数（不读 git，历史片段也是事后补录的），
 *   排序键只能请文件名自带。倒序拼接即「按提交时间倒序」，与原单文件「新条在上」一致。
 * - 不挂 `.<type>` 后缀：towncrier 的类型后缀服务于「按类型分组的发布说明」，
 *   本汇总严格按时间倒序、不分组，挂上去只是把 H1 里已有的类型再写一遍。
 *
 * 片段正文按原样拼接，不做任何重排：`.github/CHANGELOG.md` 已列入 `.prettierignore`
 * （派生文件不归 prettier 管），`changelog/*.md` 则由 `.prettierrc` 的 `proseWrap: "preserve"`
 * 免于重排 —— 两手一起，从源头杜绝折行噪声。
 *
 * 谁在调用：
 *   - `.husky/pre-commit`：提交前重新生成并把结果纳入本次提交，保证汇总与片段锁步；
 *   - `pnpm verify` 第 2 步 `changelog:check`：只比对不写盘，兜住绕开钩子的手改。
 *
 * 用法：
 *   node scripts/build-changelog.mjs          # 写出 .github/CHANGELOG.md
 *   node scripts/build-changelog.mjs --check  # 只比对，不一致即 exit 1（挂在 pnpm verify 上）
 */
import path from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAGMENT_DIR = path.join(ROOT, 'changelog');
const TARGET = path.join(ROOT, '.github', 'CHANGELOG.md');

/** 片段必须是以时间戳开头、跟 ASCII kebab slug 的 md；其余文件（如 README.md）一律不参与拼接 */
const FRAGMENT_RE = /^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const IGNORED = new Set(['README.md']);
const NAME_HINT = '应为 <YYYY-MM-DD-HHMM>-<ascii-kebab-slug>.md（如 2026-09-24-1745-token-contrast.md）';

/** 汇总文件的头部与尾部：正文只是片段的顺序拼接，只有这两段是固定文案 */
const HEAD_LINES = [
  '# Changelog',
  '',
  '本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循',
  '[Semantic Versioning](https://semver.org/lang/zh-CN/)。',
  '',
  '## [Unreleased]',
  '',
];
const TAIL_LINES = ['## [0.x] - 历史版本', '', '见 Git 提交历史。', ''];

const check = process.argv.includes('--check');

const names = (await readdir(FRAGMENT_DIR)).filter(name => !IGNORED.has(name));
const unknown = names.filter(name => !FRAGMENT_RE.test(name));
if (unknown.length > 0) {
  process.stderr.write(
    `changelog/ 下有不符合命名约定的文件（${NAME_HINT}）：\n${unknown.map(n => `  ${n}`).join('\n')}\n`
  );
  process.exit(1);
}
if (names.length === 0) {
  process.stderr.write('changelog/ 下没有任何片段\n');
  process.exit(1);
}

// 文件名倒序 = 提交时间倒序。用显式比较而非 localeCompare：后者对中文与数字的排序规则不稳定，
// 会让「同一天里谁在前」随环境变化。
names.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

const lines = [...HEAD_LINES];
for (const name of names) {
  const text = await readFile(path.join(FRAGMENT_DIR, name), 'utf8');
  const body = text.split('\n');
  if (!body[0].startsWith('### ')) {
    process.stderr.write(`片段 ${name} 的第一行不是 "### " 标题：${body[0].slice(0, 40)}\n`);
    process.exit(1);
  }
  // 片段末尾必须留一个空行，否则相邻两个片段会首尾黏成一行
  if (body[body.length - 1] !== '') {
    process.stderr.write(`片段 ${name} 末尾缺少空行\n`);
    process.exit(1);
  }
  lines.push(...body);
}
lines.push(...TAIL_LINES);
const produced = lines.join('\n');

if (check) {
  const current = await readFile(TARGET, 'utf8');
  if (current === produced) {
    console.log(`changelog:check 通过（${names.length} 个片段，最新 ${names[0]}）`);
    process.exit(0);
  }
  const a = current.split('\n');
  const b = produced.split('\n');
  const at = a.findIndex((line, i) => line !== b[i]);
  process.stderr.write(
    `[error] .github/CHANGELOG.md 与 changelog/ 下的片段不一致（首个差异在第 ${at + 1} 行）：\n` +
      `[error]   文件里: ${JSON.stringify((a[at] ?? '').slice(0, 80))}\n` +
      `[error]   片段里: ${JSON.stringify((b[at] ?? '').slice(0, 80))}\n` +
      '[error] 该文件是派生文件，请勿手改；跑 `pnpm changelog:build` 重新生成后提交。\n'
  );
  process.exit(1);
}

const previous = await readFile(TARGET, 'utf8').catch(() => null);
await writeFile(TARGET, produced);
console.log(
  `${previous === produced ? '未变化' : '已写出'} .github/CHANGELOG.md —— ${names.length} 个片段，` +
    `${lines.length - 1} 行，最新 ${names[0]}，最旧 ${names[names.length - 1]}`
);
