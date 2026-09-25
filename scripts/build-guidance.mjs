/**
 * 由根级 `rules/` 下的准则正文生成**两层派生出口**，本文件是这两层出口的唯一来源：
 *
 * 1. `AGENTS.md`（**入库**）—— 宿主 guidance 链（`CODEBUDDY.md` → `.codebuddy/CODEBUDDY.md` →
 *    `AGENTS.md`）会把它整份注入上下文。它 = **总纲段**（模板提供）+ **正文段**（`rules/` 下全部
 *    准则按两位序号拼接，去 frontmatter、其余逐字）。该通道有 8000 字符硬上限，正文远超这个量级，
 *    所以它注定被截断 —— 这也是为什么还必须有第二层；
 * 2. `.codebuddy/rules/`（**不入库**，见 `.gitignore`）—— 宿主 rules 通道**整目录注入、无字符上限**：
 *    该批正文的**逐字节副本**（同名；`NN-` 前缀即注入顺序、也是跨文件引用的文件名）+ 一份
 *    `00-index.md`（说明本目录是什么、三条红线摘要、源头在哪）。
 *
 * 为什么改成派生：这两层此前各自手抄了一份「正文一共几份、目录里都是哪些文件、表格里每份收录什么、
 * 三条红线各指向哪个文件」。而准则增删只改 `rules/` —— 手抄的那几处必然滞后，且要改两遍。现在
 * 文件清单与份数取自目录，表格里每条的「收录」与所属部分取自各文件序言里本来就有的
 * 「｜第X部分…｜收录 …」那一句，三条红线按**两位序号**（`01`/`08`/`09`）引用文件（改 slug 不会
 * 产生死引用，序号缺失或重复直接报错）。
 *
 * 口径：
 * - 总纲文案在 `scripts/guidance/AGENTS.template.md`（纯 markdown，可正常 diff / 格式化），
 *   只有五类占位符：`{{RULES_COUNT}}`、`{{RULES_TABLE}}`、`{{RULES_CHARS}}`、`{{RULES_BODY}}`、
 *   `{{REF:NN}}`。模板里出现生成器不认识的占位符会**直接报错**，不静默放过；
 * - **副本是逐字节复制**（连 `alwaysApply` frontmatter 一起），只有 AGENTS.md 的正文段去 frontmatter
 *   —— 那一项是宿主 rules 通道的配置，拼进总纲只是噪声；
 * - `{{RULES_CHARS}}` 按文件**全文**字符数累加（含 frontmatter）—— 它存在的意义是说明「正文总量远超
 *   guidance 链的 8000 上限」，量级对就够，不必抠口径；
 * - 两层产物都已列入 `.prettierignore`：派生文件不归 prettier 管（与 `.github/CHANGELOG.md` 同一
 *   口径），否则每次生成都要在「内容没变」的提交里制造折行 diff；
 * - `.codebuddy/` 不入库，新鲜克隆里它不存在 —— 故 `--check` 对它只在「本地已生成」时比对，缺席只
 *   提示、不报错（`pnpm prepare` 会在安装后补上）。本生成器**只写自己那两个出口、从不删任何文件**：
 *   该目录是宿主的扫描目录，按 `05-small-task-and-temp-files.md` 的例外允许放注入探针，删目录内容
 *   会把探针一起清掉。
 *
 * 谁在调用：
 *   - `.husky/pre-commit`：提交前重生成 AGENTS.md 并纳入本次提交（与 changelog 汇总同一手法）；
 *   - `package.json` 的 `prepare`：安装后补出 `.codebuddy/`（它不入库，克隆下来本来没有）；
 *   - `pnpm guidance:check`：只比对不写盘。
 *
 * 用法：
 *   node scripts/build-guidance.mjs          # 写出两层派生出口
 *   node scripts/build-guidance.mjs --check  # 只比对，不一致即 exit 1
 */
import path from 'node:path';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES_DIR = path.join(ROOT, 'rules');
const TEMPLATE_DIR = path.join(ROOT, 'scripts', 'guidance');
const AGENTS = path.join(ROOT, 'AGENTS.md');
/** 副本目录（整目录注入的那条通道）；产物不入库 */
const COPY_DIR = path.join(ROOT, '.codebuddy', 'rules');

/** 正文文件名：`<两位序号>-<ascii-kebab>.md`。序号是**身份**，slug 只是标识 */
const RULE_RE = /^(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
/** 序言里那句「本文件是《AGENTS.md》准则正文的一部分｜第X部分…｜收录 …。总纲…」——表格的
 *  「收录」列与所属部分都出自这里。**必须先按行拼回一段**：序言是 markdown 引用块，会被按
 *  散文宽度折行，而断点未必落在「。总纲」之后（`04-…` 就断在「1.1 /」与「1.2 见…」之间），
 *  只看单行会取不到这一句。拼接用单个空格还原折行处被吃掉的词间距。 */
const PREFACE_RE = /^本文件是《AGENTS\.md》准则正文的一部分｜(.+?)｜收录 (.+?)。总纲/;
const PLACEHOLDER_RE = /\{\{[A-Z_0-9:]+\}\}/g;

const prefaceOf = text => {
  const lines = text.split('\n');
  const start = lines.findIndex(line => line.startsWith('> 本文件是《AGENTS.md》准则正文的一部分'));
  if (start < 0) return null;
  const block = [];
  for (let index = start; index < lines.length && lines[index].startsWith('>'); index += 1) {
    block.push(lines[index].replace(/^>\s?/, ''));
  }
  return block.join(' ');
};

const check = process.argv.includes('--check');

const files = (await readdir(RULES_DIR)).filter(name => name.endsWith('.md'));
const strays = files.filter(name => !RULE_RE.test(name));
if (strays.length > 0) {
  process.stderr.write(
    `rules/ 下有不符合命名约定（<两位序号>-<ascii-kebab>.md）的文件：\n${strays.map(n => `  ${n}\n`).join('')}`
  );
  process.exit(1);
}
if (files.length === 0) {
  process.stderr.write('rules/ 下没有任何准则正文\n');
  process.exit(1);
}
files.sort();

/** 逐份正文解析出：序号、文件名、所属部分、收录、去 frontmatter 的正文；顺带累计全文字符数 */
const rules = [];
let chars = 0;
for (const name of files) {
  const text = await readFile(path.join(RULES_DIR, name), 'utf8');
  const preface = prefaceOf(text);
  const matched = preface ? PREFACE_RE.exec(preface) : null;
  if (!matched) {
    process.stderr.write(`${name} 的序言里取不到「｜<部分>｜收录 <收录>。总纲」这一段，无法派生表格\n`);
    process.exit(1);
  }
  // 正文段拼接时去掉 frontmatter：`alwaysApply` 是宿主 rules 通道的配置，拼进总纲只是噪声。
  // 副本不经过这里 —— 它是逐字节复制，那份 frontmatter 必须原样留着
  const body = text.replace(/^---\n[\s\S]*?\n---\n+/, '');
  if (body.startsWith('---')) {
    process.stderr.write(`${name} 的 frontmatter 结构与预期不符（应为文件开头的一对 --- 块），不敢照此裁剪\n`);
    process.exit(1);
  }
  chars += text.length;
  rules.push({
    number: RULE_RE.exec(name)[1],
    name,
    section: matched[1],
    digest: matched[2].replaceAll('|', '\\|'),
    body,
  });
}

const byNumber = new Map(rules.map(rule => [rule.number, rule]));
if (byNumber.size !== rules.length) {
  process.stderr.write('rules/ 下有重复的两位序号，`{{REF:NN}}` 会取到哪一份无法确定\n');
  process.exit(1);
}
/** 模板里 `{{REF:NN}}` 引用的文件；序号不存在即报错，避免留下引用不到的死链 */
const refOf = number => {
  const rule = byNumber.get(number);
  if (!rule) {
    process.stderr.write(`模板引用了 rules/ 下不存在的序号 ${number}\n`);
    process.exit(1);
  }
  return `rules/${rule.name}`;
};

const table = [
  '| # | 文件 | 收录 |',
  '| --- | --- | --- |',
  ...rules.map((rule, index) => `| ${index + 1} | \`rules/${rule.name}\` | ${rule.section}｜${rule.digest} |`),
].join('\n');

/** 正文段：按序号拼接，每份前面标一条出处注释（`rules/` 下没有注释能标的地方），份间用分隔线断开 */
const ruleBody = rules.map(rule => `<!-- rules/${rule.name} -->\n\n${rule.body.trimEnd()}`).join('\n\n---\n\n');

/** 渲染模板；模板里留下生成器不认识的占位符即报错（拼错一个名字不该静默产出半成品） */
const render = async templateName => {
  const template = await readFile(path.join(TEMPLATE_DIR, templateName), 'utf8');
  const known = new Set(['RULES_COUNT', 'RULES_TABLE', 'RULES_CHARS', 'RULES_BODY']);
  const unknown = [...new Set(template.match(PLACEHOLDER_RE) ?? [])].filter(
    token => !token.startsWith('{{REF:') && !known.has(token.slice(2, -2))
  );
  if (unknown.length > 0) {
    process.stderr.write(`${templateName} 里有生成器不认识的占位符：${unknown.join(' ')}\n`);
    process.exit(1);
  }
  return template
    .replaceAll('{{RULES_COUNT}}', String(rules.length))
    .replaceAll('{{RULES_TABLE}}', table)
    .replaceAll('{{RULES_CHARS}}', String(chars))
    .replaceAll('{{RULES_BODY}}', ruleBody)
    .replace(/\{\{REF:(\d+)\}\}/g, (_, number) => refOf(number));
};

/**
 * 两层出口。两类产物：`produced`（模板 + 占位符渲染出来的文本）与 `source`（`rules/` 下的
 * 同名文件，逐字节复制、不经过任何转换）。
 */
const outputs = [
  { label: 'AGENTS.md', target: AGENTS, produced: await render('AGENTS.template.md'), required: true },
  {
    label: '.codebuddy/rules/00-index.md',
    target: path.join(COPY_DIR, '00-index.md'),
    produced: await render('index.template.md'),
    required: false,
  },
  ...rules.map(rule => ({
    label: `.codebuddy/rules/${rule.name}`,
    target: path.join(COPY_DIR, rule.name),
    source: path.join(RULES_DIR, rule.name),
    required: false,
  })),
];

/**
 * 取「应有内容」与「现有内容」。一律按**字节**比：渲染类的产物也走 `Buffer`，这样副本那条
 * （必须逐字节一致、不做任何归一化）与模板那条用的是同一个判据，不必各写一遍。
 */
const compare = async entry => {
  const wanted = entry.source ? await readFile(entry.source) : Buffer.from(entry.produced, 'utf8');
  const current = await readFile(entry.target).catch(() => null);
  return { wanted, current, same: current !== null && current.equals(wanted) };
};

if (check) {
  let failed = false;
  for (const entry of outputs) {
    const { wanted, current, same } = await compare(entry);
    if (same) {
      console.log(`guidance:check 通过：${entry.label}`);
      continue;
    }
    if (current === null && !entry.required) {
      console.log(`guidance:check 跳过：${entry.label} 未生成（不入库的构建产物，pnpm guidance:build 可补）`);
      continue;
    }
    failed = true;
    const a = (current ?? Buffer.alloc(0)).toString('utf8').split('\n');
    const b = wanted.toString('utf8').split('\n');
    const at = a.findIndex((line, index) => line !== b[index]);
    process.stderr.write(
      `[error] ${entry.label} 与 rules/ 下的正文不一致（首个差异在第 ${at + 1} 行）：\n` +
        `[error]   产物里: ${JSON.stringify((a[at] ?? '').slice(0, 80))}\n` +
        `[error]   源头里: ${JSON.stringify((b[at] ?? '').slice(0, 80))}\n` +
        '[error] 两层出口都是派生文件，请勿手改；跑 `pnpm guidance:build` 重新生成。\n'
    );
  }
  process.exit(failed ? 1 : 0);
}

for (const entry of outputs) {
  const { wanted, same } = await compare(entry);
  await mkdir(path.dirname(entry.target), { recursive: true });
  if (!same) await writeFile(entry.target, wanted);
  console.log(`${same ? '未变化' : '已写出'} ${entry.label}`);
}
console.log(`（${rules.length} 份正文，合计 ${chars} 字符）`);
