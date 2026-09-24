/**
 * Worker 工装链用到的 npm 工具版本（**单一来源**）。
 *
 * 为什么钉死具体版本、不用 `@latest`：
 * deploy-worker.mjs 在 CI 里带着 `CLOUDFLARE_API_TOKEN` 调用这两个包，且 worker/ 一有改动就会
 * 自动发布生产。`@latest` 等于把「每次部署都现场执行一个当天才发布的包」写进生产发布流程——
 * 上游任意一次发包（含被投毒的发包）都会在持有 Cloudflare 凭据、且直连生产库的环境里立即执行，
 * 而 pnpm-lock.yaml 里根本没有这两个包（`npx` 拉取不经 lockfile），没有任何一处能兜住。
 * 钉死后升级变成一个显式动作：改这里的常量、跑一次 dev 部署验证，再发版。
 */
export const WRANGLER_VERSION = '4.137.0';
export const ESBUILD_VERSION = '0.28.2';
