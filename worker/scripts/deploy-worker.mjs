/**
 * 云同步后端 Worker 部署脚本。
 *
 * 读取开发凭据文件 `.env.development`（git 忽略）中的部署凭据，调用 `wrangler deploy` 部署到 Cloudflare：
 *   - CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID：wrangler 鉴权（由子进程继承）；
 *   - SERVER_TOKEN：以 `--var` 注入，供 worker 运行时校验写鉴权。
 * 优先级：进程环境变量 > .env.development（CI / 已 export 的变量不会被覆盖），故 CI secrets 无需该文件。
 *
 * 目标环境（显式二选一，缺省为开发）：
 *   - 默认 / `--dev`：开发环境独立 Worker（worker/wrangler.dev.jsonc，仅绑开发库 fret-logic-dev）。
 *     默认即开发，是为了让"本地手滑少敲一个参数"的代价落在 dev 而不是 prod。
 *   - `--prod`：生产 Worker（worker/wrangler.prod.jsonc，绑生产库 fret-logic）。
 *     CI 显式传该参数（见 .github/workflows/deploy-worker.yml），本地一般不该用。
 * 两个 Worker 与各自的 D1 库完全隔离，不会互相污染。
 *
 * 与 build-worker.mjs 同处 worker/scripts/：只服务 Worker，跟 wrangler 配置放在一起。
 */
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 本文件在 worker/scripts/ 下，上溯两级才是仓库根（worker/ → 根）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 轻量 .env 解析：KEY=VALUE，跳过空行/注释，保留可选的引号包裹；仅填充未定义的键 */
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT, '.env.development'));

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.warn(
    '[deploy-worker] 未检测到 CLOUDFLARE_API_TOKEN，将依赖本地 wrangler 登录态（推荐在 .env.development 配置）'
  );
}

// 目标环境显式二选一；缺省为 dev——本地手动部署默认落在开发环境，避免误发生产。
const argv = process.argv.slice(2);
const isProd = argv.includes('--prod');
const isDev = argv.includes('--dev');
if (isProd && isDev) {
  console.error('[deploy-worker] --prod 与 --dev 不能同时指定');
  process.exit(1);
}
const unknown = argv.filter(a => a.startsWith('-') && a !== '--prod' && a !== '--dev');
if (unknown.length > 0) {
  console.error(`[deploy-worker] 未知参数：${unknown.join(' ')}（本脚本仅接受 --dev / --prod）`);
  process.exit(1);
}

const configPath = isProd ? 'worker/wrangler.prod.jsonc' : 'worker/wrangler.dev.jsonc';
const targetName = isProd ? '生产环境 Worker (fret-logic-service)' : '开发环境 Worker (fret-logic-service-dev)';
console.log(`[deploy-worker] 目标：${targetName}（配置 ${configPath}）`);
if (isProd) {
  console.warn('[deploy-worker] ⚠️  正在发布到生产环境，生产库会被本次产物覆盖');
}

// fail-closed 部署门禁：worker 运行时已改为「未配置 SERVER_TOKEN 即拒绝写操作」，
// 因此不带 token 部署出来的 Worker 对任何写请求都返回 401、形同废站。直接在此拦截，
// 避免把一次无意义的部署推上线（P0 审计 #4）。CI / .env.development 必须提供 SERVER_TOKEN。
if (!process.env.SERVER_TOKEN) {
  console.error(
    '[deploy-worker] 未检测到 SERVER_TOKEN，已中止部署。请先配置 SERVER_TOKEN（.env.development 或 CI secret）后再部署。'
  );
  process.exit(1);
}

// 部署前先打包：wrangler 已配 no_bundle，部署的必须是同目录 build-worker.mjs 的产物。
// 用 node 直接跑构建脚本（不经 shell），失败立即中止、不进入部署阶段，避免把旧产物推上线。
const build = spawnSync(process.execPath, [path.join(ROOT, 'worker/scripts/build-worker.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('[deploy-worker] 打包失败，已中止部署');
  process.exit(build.status ?? 1);
}

const args = ['--yes', 'wrangler@latest', 'deploy', '--config', configPath, '--no-bundle'];
if (process.env.SERVER_TOKEN) {
  args.push('--var', `SERVER_TOKEN:${process.env.SERVER_TOKEN}`);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// Windows 上不能直接 spawn .cmd 文件（CreateProcess 会抛 EINVAL），必须经由 cmd.exe /c，故 shell: true
const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
child.on('close', code => process.exit(code ?? 0));
