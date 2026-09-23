/**
 * 颜色令牌注入插件：把根目录 tokens/ 产出的三主题 CSS 以 `virtual:color-tokens.css` 暴露给应用。
 *
 * 用法（vite.config.ts）：
 *   colorTokensPlugin({ tokensDir: resolve(__dirname, 'tokens'), css: generateColorTokensCss() })
 *
 * 虚拟模块以 `.css` 结尾，因此会被 Vite 的 CSS 管线处理：
 * - dev：CSS 模块自带 `import.meta.hot.accept()`，改 tokens/ 下的文件即热替换样式表，不刷页面；
 * - build：与 main.scss / tailwind.css 一起进 rollup 的 CSS 管线，合并 + 压缩，不额外产出文件。
 *
 * dev 与 build 取值的唯一差别是「什么时候算」：
 * - build：vite.config.ts 加载时算一次（配置里传入的 css），整个构建复用；
 * - dev：每次 load 都经 ssrLoadModule 重算，因此改令牌即时生效（handleHotUpdate 负责失效缓存）。
 * 两条路径调用的是同一个 generateColorTokensCss()，不存在「dev 与线上不一致」的空间。
 */
import { normalizePath } from 'vite';

import type { Plugin, ViteDevServer } from 'vite';

/** 虚拟模块 id：必须以 .css 结尾，Vite 才会把它交给 CSS 管线（而非当作普通 JS 模块） */
const VIRTUAL_MODULE_ID = 'virtual:color-tokens.css';

/** 内部 id：`\0` 前缀是 rollup 对虚拟模块的约定，避免被当成真实文件路径再次解析 */
const RESOLVED_ID = `\0${VIRTUAL_MODULE_ID}`;

/** tokens 入口（vite 根相对路径，交给 ssrLoadModule 转译 TS） */
const TOKENS_ENTRY = '/tokens/index.ts';

export interface ColorTokensPluginOptions {
  /** tokens/ 目录绝对路径：dev 下需显式登记为 watcher 目标（它不在 Vite 模块图里） */
  readonly tokensDir: string;
  /** 配置加载期算出的初始 CSS */
  readonly css: string;
}

/** ssrLoadModule 回来的模块形状（只取用得到的那个导出） */
interface TokensModule {
  generateColorTokensCss: () => string;
}

export const colorTokensPlugin = ({ tokensDir, css }: ColorTokensPluginOptions): Plugin => {
  const tokensDirNormalized = normalizePath(tokensDir);
  let cssText = css;
  let devServer: ViteDevServer | null = null;

  return {
    name: 'fret-logic:color-tokens',
    // enforce: 'pre'：保证 resolveId 早于 Vite 内置的 resolve 插件，否则会被当成本地文件找不到
    enforce: 'pre',

    configureServer(server) {
      devServer = server;
      server.watcher.add(tokensDir);
    },

    resolveId(id) {
      // HMR 更新时客户端请求会带 `?t=<ts>`，`?direct` 亦可能出现，故按路径段比对、query 原样透传
      const [path, query] = id.split('?');
      if (path !== VIRTUAL_MODULE_ID) return null;
      return query === undefined ? RESOLVED_ID : `${RESOLVED_ID}?${query}`;
    },

    async load(id) {
      if (id !== RESOLVED_ID && !id.startsWith(`${RESOLVED_ID}?`)) return null;
      if (devServer) {
        const module = (await devServer.ssrLoadModule(TOKENS_ENTRY)) as TokensModule;
        cssText = module.generateColorTokensCss();
      }
      return cssText;
    },

    handleHotUpdate({ file, server }) {
      // 只有 tokens/ 下的改动需要重算；返回该模块即交给 Vite 走标准 CSS 热更新（css-update）
      if (!normalizePath(file).startsWith(tokensDirNormalized)) return;
      const module = server.moduleGraph.getModuleById(RESOLVED_ID);
      if (!module) return;
      server.moduleGraph.invalidateModule(module);
      return [module];
    },
  };
};
