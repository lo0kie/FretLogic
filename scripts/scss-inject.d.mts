/**
 * 类型声明：与 scripts/scss-inject.mjs 同名的实现文件配套。
 * 项目 tsconfig 未开启 allowJs，TS 在解析显式 '.mjs' 导入 './scripts/scss-inject.mjs' 时
 * 会去找对应的 .d.mts 声明文件（.mjs ↔ .d.mts 是 ESM 标准声明映射）以满足类型检查；
 * 运行期由 Vite/esbuild 实际加载 .mjs 实现。
 */
export function injectScssTokens(source: string, filePath: string): string;
