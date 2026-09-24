/**
 * worker/lib/md5.mjs 的手写类型声明。
 *
 * 主 tsconfig 的 allowJs 是关闭的，故 tests/worker/md5.test.ts 直接 import 那个 .mjs 会报
 * 「找不到声明文件」。按 TS 的 `.mjs` → `.d.mts` 同名同目录解析约定补上这一份，只为让测试能
 * 类型安全地 import；不改动 .mjs 本身（它由 esbuild 直接打包）。
 *
 * 2026-09-24 起 worker/ 已由 tsconfig.worker.json（`pnpm typecheck:worker`）单独把守，
 * 本条因此**优先于** md5.mjs 本体被解析 —— 即那边拿到的是这里的手写签名，而不是从 .mjs 推断的。
 * 改 md5.mjs 的签名时记得同步这一份，否则 worker 链与测试链都会拿着过期的类型继续绿。
 */
export declare const md5: (input: string | ArrayLike<number>) => string;
