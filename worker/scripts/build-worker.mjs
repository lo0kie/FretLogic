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

// 本文件在 worker/scripts/ 下，上溯两级才是仓库根（worker/ → 根）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = path.join(ROOT, 'worker/index.mjs');
const outfile = path.join(ROOT, 'worker/dist/index.mjs');

mkdirSync(path.dirname(outfile), { recursive: true });

// platform=neutral：产物跑在 Workers（既非 Node 也非浏览器），不引入任何运行时内置模块假设；
// format=esm：Workers 模块格式的要求；bundle 把 hono 一并打进来，故部署侧可以 no_bundle。
const args = [
  '--yes',
  'esbuild@latest',
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
child.on('close', code => {
  if (code === 0) {
    console.log(`[build-worker] 打包完成：${path.relative(ROOT, outfile)}`);
  }
  process.exit(code ?? 0);
});
