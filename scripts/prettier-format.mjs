/**
 * 运行 prettier --write 并过滤控制台输出：
 * 隐藏 "(unchanged)" / "(cached)" 的文件行，只保留实际被修改的文件与错误信息。
 * 通过 spawn 直接调用本地 prettier CLI，保留其退出码（prettier 解析失败时仍能使命令失败）。
 *
 * prettier 3.9 实验性 CLI 的 worker 线程在 Windows 上偶发 0xC0000005 非法访问崩溃
 * （与文件内容无关，属调度时机的已知不稳定点），此类崩溃重跑即恢复 —— 对
 * 3221225477（0xC0000005）与栈溢出 3221225725（0xC00000FD）自动重试一次；
 * 正常的格式化错误（退出码 2）不重试，避免掩盖真实问题。
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const CRASH_EXIT_CODES = new Set([3221225477, 3221225725]);
const MAX_ATTEMPTS = 2;

function runPrettier() {
  return new Promise(code => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/prettier/bin/prettier.cjs',
        // prettier 3.9 默认 CLI 不再调用 parser 的 preprocess 钩子，会导致
        // import 排序插件（依赖 preprocess）完全失效，必须显式启用实验性 CLI。
        '--experimental-cli',
        '--write',
        '--cache',
        '--cache-location',
        'node_modules/.cache/prettier/.prettiercache',
        '.',
      ],
      { stdio: ['inherit', 'pipe', 'inherit'] }
    );

    createInterface({ input: child.stdout }).on('line', line => {
      if (/\((?:unchanged|cached)\)$/.test(line)) return; // 跳过未变更 / 缓存命中的文件行
      process.stdout.write(`${line}\n`);
    });

    child.on('error', err => {
      console.error(err);
      code(1);
    });
    child.on('exit', code);
  });
}

let exitCode = 0;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  exitCode = await runPrettier();
  if (exitCode === 0 || !CRASH_EXIT_CODES.has(exitCode)) break;
  console.error(`prettier 进程异常崩溃（exit ${exitCode}），自动重试 ${attempt}/${MAX_ATTEMPTS - 1}...`);
}

process.exit(exitCode);
