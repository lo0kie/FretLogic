/**
 * 运行 prettier --write 并过滤控制台输出：
 * 隐藏 "(unchanged)" / "(cached)" 的文件行，只保留实际被修改的文件与错误信息。
 * 通过 spawn 直接调用本地 prettier CLI，保留其退出码（prettier 解析失败时仍能使命令失败）。
 *
 * 关于 --experimental-cli：它不是另一个格式化器，而是一套 Node worker_threads 池
 * （internal/experimental-cli.mjs：`size: parallelWorkers || os.cpus().length - 1`，且
 * autoInstantiate 会把池一次性建满 —— 本机 32 核即默认 31 个 worker，每个常驻 ≈120MB）。
 * worker 与主进程同进程，任一线程发生原生层致命错误就结束整个进程，Windows 上报为
 * 0xC0000005 / 0xC00000FD（退出码 3221225477 / 3221225725）。因此这里把池规模显式钳到 4，
 * 崩溃则降并发重跑。降到 1 个 worker 仍崩，说明与并发规模无关，问题在机器侧注入或原生
 * 模块；此时可临时去掉这两个 flag（legacy CLI 不认识 --parallel-workers，会打 warn）
 * 换单进程 legacy CLI —— 实测两者在本项目的 import 排序（parser.preprocess）、
 * .prettierrc 解析、.vue 处理上输出逐字节一致。
 *
 * 校验 prettier 行为时的两个坑：① 实验性 CLI 的 stdin 模式不加载项目配置（管道 +
 * --stdin-filepath 会拿到 prettier 默认选项：不排序、不读 .prettierrc），请用文件路径验证；
 * ② 被 .prettierignore 覆盖的路径即使显式传入也会被静默跳过（exit 0、不写回）。
 *
 * 正常的格式化错误（退出码 2）不重试，避免掩盖真实问题。
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const CRASH_EXIT_CODES = new Set([3221225477, 3221225725]);
/** worker 池并发阶梯：崩溃即降一档重跑（按原并发重跑多半撞同一堵墙）。 */
const WORKER_LADDER = [4, 2, 1];

function runPrettier(parallelWorkers) {
  return new Promise(code => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/prettier/bin/prettier.cjs',
        // 保留实验性 CLI 只为 worker 池带来的并行速度；它与单进程 legacy CLI 在本项目的
        // import 排序（parser.preprocess）、.prettierrc、.vue 处理上行为等价（实测一致）。
        '--experimental-cli',
        // 池默认 cpus-1（本机 31 个 worker × ≈120MB 常驻），显式钳到阶梯当前档位。
        '--parallel-workers',
        String(parallelWorkers),
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
for (let attempt = 0; attempt < WORKER_LADDER.length; attempt++) {
  const workers = WORKER_LADDER[attempt];
  exitCode = await runPrettier(workers);
  if (exitCode === 0 || !CRASH_EXIT_CODES.has(exitCode)) break;

  const nextWorkers = WORKER_LADDER[attempt + 1];
  if (nextWorkers === undefined) {
    console.error(`prettier 进程异常崩溃（exit ${exitCode}，workers=${workers}），已降至最低并发仍失败，不再重试。`);
    break;
  }
  console.error(
    `prettier 进程异常崩溃（exit ${exitCode}，workers=${workers}），降并发重试（workers=${nextWorkers}）...`
  );
}

process.exit(exitCode);
