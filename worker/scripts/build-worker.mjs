/**
 * Worker 打包脚本：把 worker/index.mjs（含 hono 依赖）打成单文件 ESM 产物。
 *
 * 产出 worker/dist/index.mjs；wrangler 侧配置 no_bundle + main 指向该产物后，
 * 部署时不再二次打包（见同目录的 wrangler.prod.jsonc / wrangler.dev.jsonc）。
 *
 * 与 deploy-worker.mjs 同处 worker/scripts/：它们只服务 Worker，跟 wrangler 配置放在一起，
 * 避免"配置在 worker/、脚本在根 scripts/"这种分裂导致的路径误解。
 *
 * 调用方式与 deploy-worker.mjs 保持一致：esbuild 经 npx 拉起，不额外占用依赖声明。
 * deploy-worker.mjs 会在部署前同步调用本脚本，保证产物与源码不会脱节。
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESBUILD_VERSION } from './toolchain.mjs';

// 本文件在 worker/scripts/ 下，上溯两级才是仓库根（worker/ → 根）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = path.join(ROOT, 'worker/index.mjs');
const outfile = path.join(ROOT, 'worker/dist/index.mjs');

mkdirSync(path.dirname(outfile), { recursive: true });

// platform=neutral：产物跑在 Workers（既非 Node 也非浏览器），不引入任何运行时内置模块假设；
// format=esm：Workers 模块格式的要求；bundle 把 hono 一并打进来，故部署侧可以 no_bundle。
// 版本钉死在 toolchain.mjs（不用 @latest），理由见该文件头。
const args = [
  '--yes',
  `esbuild@${ESBUILD_VERSION}`,
  entry,
  '--bundle',
  '--format=esm',
  '--platform=neutral',
  '--target=es2022',
  '--minify',
  `--outfile=${outfile}`,
];

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// Windows 上不能直接 spawn .cmd 文件（CreateProcess 会抛 EINVAL），必须经由 cmd.exe /c，故 shell: true
const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });

/**
 * 任何「其实失败了却按成功收场」的路径都必须堵死：deploy-worker.mjs 正是靠本脚本的退出码决定
 * 继续部署还是中止，而它部署的 `worker/dist/index.mjs` 是**上一次**打包留下的产物（wrangler 侧
 * no_bundle）——报成功就等于把旧产物推上生产。两条已知的假成功路径：
 *  - spawn 自身失败（如 npx 不可用）：只触发 'error'，此时 code 为 null，`code ?? 0` 会当成成功；
 *  - 子进程被信号杀死（OOM SIGKILL、Ctrl-C）：code 同样为 null，真因在 signal 参数上。
 * 故 code 必须严格等于 0 才算成功，signal 与 'error' 一律按失败处理。
 */
let settled = false;
const fail = reason => {
  if (settled) return;
  settled = true;
  console.error(`[build-worker] 打包失败：${reason}`);
  process.exit(1);
};

child.on('error', err => fail(err.message));
child.on('close', (code, signal) => {
  if (signal) fail(`esbuild 进程被信号终止（${signal}），产物未更新`);
  if (code !== 0) fail(`esbuild 退出码 ${code ?? '(未知)'}`);
  settled = true;
  console.log(`[build-worker] 打包完成：${path.relative(ROOT, outfile)}`);
  process.exit(0);
});
