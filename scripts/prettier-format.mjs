/**
 * 运行 prettier --write 并过滤控制台输出：
 * 隐藏 "(unchanged)" / "(cached)" 的文件行，只保留实际被修改的文件与错误信息。
 * 通过 spawn 直接调用本地 prettier CLI，保留其退出码（prettier 解析失败时仍能使命令失败）。
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const child = spawn(
  process.execPath,
  [
    'node_modules/prettier/bin/prettier.cjs',
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
  process.exit(1);
});
child.on('exit', code => process.exit(code ?? 0));
