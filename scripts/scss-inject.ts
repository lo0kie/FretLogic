/**
 * SCSS 全局设计令牌注入工具：
 * 在 Vite 构建与 Vitest 测试环境中共享，统一为所有 SCSS 样式注入 tokens.scss 变量与 mixin。
 * 自动跳过 tokens.scss 自身以及已显式引入之处，避免循环引用或重复定义。
 */
export function injectScssTokens(source: string, filePath: string): string {
  if (filePath.includes('tokens.scss')) return source;
  if (source.includes('assets/tokens')) return source;
  return `@use "@/assets/tokens" as *;\n${source.replace(/^\uFEFF/, '')}`;
}
