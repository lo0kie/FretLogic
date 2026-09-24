/**
 * 云同步后端 Worker 部署脚本。
 *
 * 经 dotenv 按目标环境读取凭据文件（dev 读 `.env.development`、prod 读 `.env.production`，均 git 忽略），
 * 调用 `wrangler deploy` 部署到 Cloudflare：
 *   - CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID：wrangler 鉴权（由子进程继承）；
 *   - SERVER_TOKEN：经 `wrangler secret put` 加密注入，供 worker 运行时校验写鉴权（不用 `--var`，避免明文进部署历史）。
 * 优先级：进程环境变量 > 凭据文件（dotenv 默认不覆盖已存在的键），故 CI secrets 无需该文件。
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
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { WRANGLER_VERSION } from './toolchain.mjs';

// 本文件在 worker/scripts/ 下，上溯两级才是仓库根（worker/ → 根）
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// 目标环境先定：凭据文件按环境取，避免 --prod 部署出去的却是开发凭据（审计 #7）。
// 这里只做「取值」不报错，重复参数的校验仍在下方正式解析处。
const argv = process.argv.slice(2);
const isProd = argv.includes('--prod');
const isDev = argv.includes('--dev');

// 用 dotenv 读凭据文件，不再手写解析：引号包裹、转义、`export ` 前缀等边角由库统一处理。
// dotenv 默认「不覆盖已存在的 process.env」，即进程环境变量 > 文件，与原先语义一致——
// CI secrets / 已 export 的变量不会被文件里的值盖掉，故 CI 无需该文件。
// 生产环境只认 .env.production（CI 直接注入环境变量，该文件可不存在）。
const envFile = path.join(ROOT, isProd ? '.env.production' : '.env.development');
const loaded = dotenv.config({ path: envFile });
if (loaded.error) {
  console.warn(`[deploy-worker] 未读到 ${envFile}（${loaded.error.code}），仅使用进程环境变量`);
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.warn(
    `[deploy-worker] 未检测到 CLOUDFLARE_API_TOKEN，将依赖本地 wrangler 登录态（推荐在 ${path.basename(envFile)} 配置）`
  );
}

// 目标环境显式二选一；缺省为 dev——本地手动部署默认落在开发环境，避免误发生产。
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
// 避免把一次无意义的部署推上线（P0 审计 #4）。CI / 凭据文件必须提供 SERVER_TOKEN。
if (!process.env.SERVER_TOKEN) {
  console.error(
    `[deploy-worker] 未检测到 SERVER_TOKEN，已中止部署。请先配置 SERVER_TOKEN（${path.basename(envFile)} 或 CI secret）后再部署。`
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

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// wrangler 的 deploy 参数（迁移场景会复用：先不带 --var 部署一次，释放被旧变量占用的绑定名）
// 版本钉死在 toolchain.mjs（不用 @latest），理由见该文件头。
const deployArgs = ['--yes', `wrangler@${WRANGLER_VERSION}`, 'deploy', '--config', configPath, '--no-bundle'];

/** 跑一次 wrangler（stdio 透传），返回退出码 */
const runWrangler = args => {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], shell: true });
  return new Promise(resolve => {
    child.on('error', () => resolve(1));
    child.on('close', code => resolve(code ?? 1));
  });
};

/**
 * SERVER_TOKEN 走 wrangler secret，不再用 `--var` 注入：
 * `--var` 是明文变量，值会留在 Cloudflare 的部署历史里、并在 dashboard 的 Variables 里直接可见，
 * 等于把写鉴权口令公开；同名时 `--var` 还会覆盖 secret，故不能两个并存，必须彻底去掉。
 * secret 加密存储，put 之后任何人都读不回原值（dashboard 只显示 Secret）。
 * 经 stdin 管道写入值：wrangler 在非 TTY 下直接从 stdin 读取，本地与 CI 走同一条路径。
 * 输出需要回收（不 inherit）以便识别「绑定名被占用」这类可自愈错误；wrangler 不会回显 secret 内容。
 */
const putSecret = () =>
  new Promise(resolve => {
    const child = spawn(
      cmd,
      ['--yes', `wrangler@${WRANGLER_VERSION}`, 'secret', 'put', 'SERVER_TOKEN', '--config', configPath],
      {
        cwd: ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      }
    );
    let output = '';
    const collect = chunk => {
      output += chunk.toString();
      process.stdout.write(chunk);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.stdin.write(`${process.env.SERVER_TOKEN}\n`);
    child.stdin.end();
    // spawn 自身失败（如 npx 不可用）时不会触发 close，必须兜住否则会永远挂在这里
    child.on('error', () => resolve({ code: 1, output }));
    child.on('close', code => resolve({ code: code ?? 1, output }));
  });

// 部署前刷新 secret：保证线上跑的 token 与本次部署携带的值一致。
let secret = await putSecret();

// 一次性迁移：历史上用 `--var SERVER_TOKEN:...` 部署过的 Worker，该名字被**明文变量**占着。
// var 与 secret 共用绑定命名空间，此时 secret put 会报 "Binding name 'SERVER_TOKEN' already in use"。
// 自愈办法是先部署一次且不带 --var——新部署的配置里没有这个变量，绑定名即被释放，随后再 put。
// 代价是这中间有几秒 Worker 处于无 token 状态（fail-closed，写请求 401），仅此一次。
if (secret.code !== 0 && /already in use/i.test(secret.output)) {
  console.warn('[deploy-worker] SERVER_TOKEN 仍被旧的明文变量占用，先部署一次释放该绑定名…');
  const released = await runWrangler(deployArgs);
  if (released !== 0) {
    console.error('[deploy-worker] 释放旧变量绑定失败，已中止部署');
    process.exit(released);
  }
  secret = await putSecret();
}

// 失败即中止——token 没换成功却把新代码推上去，worker 会因 fail-closed 对一切写请求返回 401。
if (secret.code !== 0) {
  console.error(
    '[deploy-worker] SERVER_TOKEN 写入 secret 失败，已中止部署。可手动执行 ' +
      `npx wrangler secret put SERVER_TOKEN --config ${configPath} 后再重试。`
  );
  process.exit(secret.code);
}

// Windows 上不能直接 spawn .cmd 文件（CreateProcess 会抛 EINVAL），必须经由 cmd.exe /c，故 shell: true
// 退出码：code 严格等于 0 才算部署成功——被信号杀死时 code 为 null（真因在 signal 上），
// `code ?? 0` 会把一次没跑完的部署报成成功，CI 于是一路绿灯而生产其实没更新。
const child = spawn(cmd, deployArgs, { cwd: ROOT, stdio: 'inherit', shell: true });
child.on('error', err => {
  console.error(`[deploy-worker] 启动 wrangler 失败：${err.message}`);
  process.exit(1);
});
child.on('close', (code, signal) => {
  if (signal) {
    console.error(`[deploy-worker] wrangler 被信号终止（${signal}），部署未完成`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
