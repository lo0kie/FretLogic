/**
 * verify 的静默驱动：串行执行 format → lint → typecheck → test → build，
 * 正常情况只回显每步的命令行（`$ eslint .` 这种），各工具的详细输出一律不打印；
 * 某步失败时才把它攒下的输出整段回放 —— 否则一次 verify 会滚屏几千行，
 * 真正要看的那几行错误早被刷没了。
 *
 * 命令字符串从 package.json 的 scripts 里读，不在这里重复一份，避免改了一处漏了另一处。
 * 传 --verbose 可退回实时输出（排查工具本身的问题时用）。
 *
 * 顺带说明：这里用 shell 执行并手动把 node_modules/.bin 塞进 PATH，
 * 是因为 pnpm 只在 `pnpm run` 时注入该目录；直接 spawn 时 eslint / vitest 这些命令找不到。
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** 步骤顺序：与原先 run-s 的入参一致 */
const STEP_NAMES = ['format', 'lint', 'typecheck', 'test', 'build'];
/** 失败时回放的行数上限：eslint / vitest 的报错动辄上千行，全量打印反而不利于定位 */
const MAX_REPLAY_LINES = 400;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));

/**
 * 子进程环境：把 node_modules/.bin 前置到 PATH。
 * Windows 的环境变量名大小写不敏感，spread 出来的键可能是 Path / PATH 任一形态，
 * 先清掉所有变体再统一写 PATH，避免子进程同时收到两份而取到未增强的那个。
 */
const childEnv = { ...process.env };
const existingPathKey = Object.keys(childEnv).find(key => key.toUpperCase() === 'PATH');
const basePath = existingPathKey ? (childEnv[existingPathKey] ?? '') : '';
for (const key of Object.keys(childEnv)) {
  if (key.toUpperCase() === 'PATH') delete childEnv[key];
}
childEnv.PATH = [path.join(ROOT, 'node_modules', '.bin'), basePath].filter(Boolean).join(path.delimiter);

/** 执行单步：返回退出码与攒下的输出（verbose 模式下边跑边打印，不再攒） */
const runStep = command =>
  new Promise(resolve => {
    const child = spawn(command, { cwd: ROOT, env: childEnv, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    const collect = chunk => {
      const text = chunk.toString();
      if (verbose) process.stdout.write(text);
      output += text;
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    child.on('error', err => {
      output += `${err.stack ?? err.message}\n`;
      resolve({ code: 1, output });
    });
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });

/** 回放尾部若干行，超长部分提示已截断（错误通常集中在末尾，头部多半是无关的过程输出） */
const replay = text => {
  const lines = text.split('\n');
  const shown = lines.length > MAX_REPLAY_LINES ? lines.slice(-MAX_REPLAY_LINES) : lines;
  const omitted = lines.length - shown.length;
  if (omitted > 0) process.stderr.write(`…（略去前 ${omitted} 行）\n`);
  process.stderr.write(`${shown.join('\n')}\n`);
};

for (const name of STEP_NAMES) {
  const command = pkg.scripts?.[name];
  if (!command) {
    process.stderr.write(`package.json 里没有 scripts.${name}\n`);
    process.exit(1);
  }
  console.log(`$ ${command}`);
  const { code, output } = await runStep(command);
  if (code === 0) continue;
  replay(output);
  process.stderr.write(`\n✗ ${name} 失败（exit ${code}），后续步骤已中止\n`);
  process.exit(code);
}
