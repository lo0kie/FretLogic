/**
 * verify 的静默驱动：串行执行 format:check → changelog:check → lint → typecheck → test
 * → build → build:budget，正常情况只回显每步的命令行（`$ eslint .` 这种），各工具的详细输出一律不打印；
 * 某步失败时才把它攒下的输出整段回放 —— 否则一次 verify 会滚屏几千行，
 * 真正要看的那几行错误早被刷没了。
 *
 * 为什么首步是 format:check 而不是 format：
 * verify 挂在 pre-push 上（.husky/pre-push），而 format 是 `prettier --write`。
 * 写成 write 会在「推送前」把工作树就地格式化，但**被推的那次 commit 内容不变**——
 * 于是本地验证通过、CI 检出同一 commit 跑 format:check 却红。校验型步骤只读，
 * 不制造「本地绿、远端红」的假通过；真需要格式化就自己跑 pnpm format 再提交。
 * changelog:check 同理：它只比对 .github/CHANGELOG.md 与 changelog/ 下的片段是否一致，
 * 不一致时报错并让人跑 pnpm changelog:build，而不是就地改写工作树。
 *
 * 命令字符串从 package.json 的 scripts 里读，不在这里重复一份，避免改了一处漏了另一处。
 * 传 --verbose 可退回实时输出（排查工具本身的问题时用）。
 *
 * 免检凭证：本脚本是全仓最重的一道关卡，而「推送因网络/鉴权失败后原样重推」并不需要重跑一遍。
 * 故**全绿时落一份提交内容指纹（HEAD 的树哈希）、失败时作废**，pre-push（.husky/pre-push）据此
 * 跳过重复关卡。判定与读写都在 scripts/verify-stamp.mjs，这里只负责在正确时机调用它 —— 手动
 * `pnpm verify` 与 pre-push 走的是同一条路径，所以手动跑过的那次同样算数。
 * 注意凭证按「提交内容」算，不按工作区：工作区里的未提交改动不在本次推送范围内，也就不参与判定。
 *
 * 顺带说明：这里用 shell 执行并手动把 node_modules/.bin 塞进 PATH，
 * 是因为 pnpm 只在 `pnpm run` 时注入该目录；直接 spawn 时 eslint / vitest 这些命令找不到。
 */
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** 步骤顺序：校验全部只读；build:budget 必须排在 build 之后（消费 dist 产物做体积预算）。
 *  changelog:check 排在 format:check 之后：两者都是「格式/文档一致性」的只读门禁，且都最便宜。
 *  测试一步只跑用例、不统计覆盖率：覆盖率门槛会反向催生「为凑数而写」的用例，已整条拿掉
 *  （2026-09-25）。
 *  CI 另有 `pnpm bench` 一步：它自 2026-09-24 起是**真的回归哨兵**（与 scripts/bench-baseline.json
 *  比倍率、超 3x 即 exit 1），但仍不纳入 pre-push —— 基准是**机器相关**的，开发机上跑出来的倍率
 *  与 CI 跑机不是一回事，放这里只会制造「本地红、远端绿」的假信号。本地要看退化请显式跑 pnpm bench。 */
const STEP_NAMES = [
  'format:check',
  'changelog:check',
  'lint',
  'typecheck',
  'typecheck:tests',
  'typecheck:worker',
  'test',
  'build',
  'build:budget',
];
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

/**
 * 调用凭证脚本。走子进程而不是 import，是为了让「钩子里的 check」与「这里的 write/clear」
 * 共用同一份指纹实现 —— 两处各写一遍，早晚会出现「写进去的和比对的不是一回事」。
 */
const stamp = action =>
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'verify-stamp.mjs'), action], {
    cwd: ROOT,
    stdio: 'inherit',
  });

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
  // 失败即作废：不能让上一次的绿凭证替这一次背书
  stamp('clear');
  process.exit(code);
}

stamp('write');
console.log('✓ 全量关卡通过，已落免检凭证（提交内容未变时重推不再重跑）。');
