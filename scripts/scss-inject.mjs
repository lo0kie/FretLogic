/**
 * SCSS 全局设计令牌注入工具：
 * 在 Vite 构建与 Vitest 测试环境中共享，统一为所有 SCSS 样式注入 token-vars.scss 变量与 mixin。
 * 只注入「变量层」而非 tokens.scss 全文：tokens.scss 含 :root/.dark 等 CSS 规则，
 * 拼进 <style scoped> 后会被改写为 :root[data-v-x] 死规则并在每个组件复制一份（产物膨胀）；
 * CSS 规则由 main.scss 引入恰好一次。变量层按约定不得含 CSS 规则（见 token-vars.scss 头注释）。
 * 自动跳过 token-vars.scss 自身以及已显式引入之处，避免循环引用或重复定义。
 */
export function injectScssTokens(source, filePath) {
  if (filePath.includes('token-vars.scss') || filePath.includes('tokens.scss')) return source;
  if (source.includes('assets/token-vars') || source.includes('assets/tokens')) return source;
  return `@use "@/assets/token-vars" as *;\n${source.replace(/^\uFEFF/, '')}`;
}
