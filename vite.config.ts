import { execSync } from 'node:child_process';
import { resolve } from 'path';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import VueDevTools from 'vite-plugin-vue-devtools';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

import { injectScssTokens } from './scripts/scss-inject.mjs';
import { colorTokensPlugin } from './scripts/vite-plugin-color-tokens';
import { generateColorTokensCss, resolveColorToken } from './tokens/index';

import type { ViteUserConfig } from 'vitest/config';

// 读取当前 git 提交短 SHA，作为随代码自动变化、真实有意义的构建标识。
// 非 git 环境（或取不到时）回退为 unknown。
let gitCommit: string;
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {
  gitCommit = 'unknown';
}

// Vitest 测试配置内嵌于 Vite 配置（单文件维护，Vitest 自动复用 plugins/resolve/css）：
// - logic 项目（environment: node）：领域/服务/工具等纯逻辑测试。
//   jsdom 环境构建是全量测试最大的 CPU 开销（跨 worker 汇总约 50s+），
//   纯逻辑测试切到 node 环境可显著提速且行为不变。
// - ui 项目（environment: jsdom）：组件挂载测试（@vue/test-utils 依赖 DOM）。
// - 共享 setup：注入 fake-indexeddb 与 IntersectionObserver polyfill（node 环境下同样无害）。
// - isolate 默认 true：每个测试文件独立模块注册表，模块级缓存不跨文件泄漏。
// - pool 默认 'forks'：Windows 下进程模型最稳，避免 worker 挂起。
const testConfig: ViteUserConfig = {
  test: {
    // 未配置根 exclude：Vitest 默认排除项已足够，测试文件归属完全由下方 logic / ui project 的
    // include 决定。历史死 glob `**/performance.test.ts` 指向不存在的文件，已删；
    // 性能基准在 tests/benchmarks/**（跑在 logic project 内），bundle 体积检查走 build:budget 不进单测链路。
    // 全局 setup：fake-indexeddb / IntersectionObserver polyfill / wave+tooltip 指令桩
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    // 每个测试后自动还原 vi.spyOn 打桩，避免跨测试污染
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node' as const,
          include: ['tests/**/*.test.ts'],
          // 依赖 DOM/浏览器 API 的测试归入 ui 项目
          //（repositories/sanitizePersistedData 走 store 链路需要完整组件环境，其余依赖 jsdom 组件挂载）
          exclude: [
            ...configDefaults.exclude,
            'tests/ui/**',
            'tests/utils/barre.test.ts',
            'tests/data/repositories.test.ts',
            'tests/sanitizePersistedData.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom' as const,
          include: [
            'tests/ui/**/*.test.ts',
            'tests/utils/barre.test.ts',
            'tests/data/repositories.test.ts',
            'tests/sanitizePersistedData.test.ts',
          ],
        },
      },
    ],
  },
};

// 颜色令牌源目录（仓库根 tokens/）：dev 下作为文件监视目标交给注入插件，
// 改色值即触发 CSS 热更新；见 scripts/vite-plugin-color-tokens.ts
const colorTokensDir = resolve(__dirname, 'tokens');

export default defineConfig(({ command, mode }) => {
  // 相对 base：产物可在任意根路径部署（GitHub Pages 子路径 /FretLogic/、EdgeOne 根路径等），
  // 配合 hash 路由无需平台级路径重写，`pnpm build` 单命令通吃所有托管平台。
  const base = './';

  // Vue DevTools 只在开发服务器注册。插件自身已声明 apply: 'serve'，构建（含 build:analyze）
  // 本来就拿不到它，这里再显式排掉测试模式 —— Vitest 同样以 serve 命令启动，不排的话每个 .vue
  // 转换都要多走一遍组件 inspector 注入，白白拖慢测试链路。
  const enableVueDevTools = command === 'serve' && mode !== 'test';

  return {
    // 统一缓存收纳：Vite 依赖预构建/构建缓存与 Vitest 测试结果缓存都落在 node_modules/.cache/vite，
    // 与 eslint（node_modules/.cache/eslint）等工具缓存目录约定对齐
    cacheDir: 'node_modules/.cache/vite',
    // 单测配置（仅 Vitest 消费，Vite 构建忽略该字段）
    ...testConfig,
    plugins: [
      // 官方要求排在 vue() 之前；插件自带 enforce: 'pre' 已保证执行序，这里靠前只是与文档一致
      ...(enableVueDevTools ? [VueDevTools()] : []),
      tailwindcss(),
      // 颜色令牌注入：产出 virtual:color-tokens.css（颜色单一来源在仓库根 tokens/，派生值由 culori 构建期算出）
      colorTokensPlugin({ tokensDir: colorTokensDir, css: generateColorTokensCss() }),
      vue({
        template: {
          compilerOptions: {
            whitespace: 'condense',
            // 彻底剔除标签之间的纯空格与换行文本节点，由 CSS gap / margin 精确接管布局
            nodeTransforms: [
              node => {
                if (node.type === 2 /* NodeTypes.TEXT */ && !node.content.trim()) {
                  node.content = '';
                }
              },
            ],
          },
        },
      }),
      Icons({
        compiler: 'vue3',
        autoInstall: false,
      }),
      // 产物体积分析按需生成：仅 `pnpm build:analyze`（--mode analyze）时注册插件，
      // 日常构建跳过 gzip/brotli 统计与 stats.html 写盘（产物变了分析必须重算，无缓存可言）
      ...(mode === 'analyze'
        ? [
            visualizer({
              open: true,
              // 落 .temp/（AGENTS §5：临时产物不落根目录；.temp 已 gitignore）
              filename: '.temp/stats.html',
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
      VitePWA({
        registerType: 'autoUpdate', // 自动更新 Service Worker
        manifest: {
          name: 'Fret Logic', // 应用完整名称
          short_name: 'FretLogic', // 应用简短名称（显示在桌面上）
          description: '你的吉他与乐谱助手',
          // 直接取浅色主题的令牌值，与页面同源（此前手抄 hex，改令牌时 manifest 不会跟着变）
          theme_color: resolveColorToken('light', '--color-primary'), // 主题颜色
          background_color: resolveColorToken('light', '--bg-main'), // 背景色
          display: 'standalone', // 独立应用模式（隐藏浏览器地址栏）
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          start_url: './', // 启动路径
          scope: './',
          icons: [
            {
              src: `${base}pwa-192x192.png`, // 需在 public 目录下准备对应图标
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `${base}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          // 只预缓存「应用外壳」：HTML、样式、图标与 manifest，刻意不预缓存 JS chunk。
          // 默认的 globPatterns（**/*.{js,css,html,ico,png,svg}）会把 dist 下所有 js 全量拉进
          // precache —— 懒加载路由 chunk、导出 worker 及其依赖都在内，SW 首次安装就要把整套
          // 产物下载一遍，流量与安装耗时翻倍，且每次发版（hash 全变）再重来一次。
          //
          // 更关键的是它会让首屏那条 <link rel="modulepreload"> 白费：预载请求被 SW 从 Cache
          // Storage 应答，Chromium 判定其 world 与页面不匹配（cross-world service worker
          // resource mismatch），转而去重新请求一次，控制台于是报「preloaded but not used」。
          // JS 交给 HTTP 缓存即可：产物文件名带 hash、静态资源本就是长效缓存，离线打开时
          // 浏览器缓存同样能被命中。
          globPatterns: ['index.html', 'manifest.webmanifest', 'assets/*.css', '**/*.{png,svg,ico,webp}'],
          navigateFallback: 'index.html',
          // 不再注册任何匹配脚本的 runtimeCaching：只要 SW 应答脚本请求，上面的 mismatch 就会
          // 原样复现（缓存命中与否都一样，因为响应同样经由 SW 返回）。
          // 若日后确实需要「断网也能打开」，在此给 destination === 'script' 加一条
          // StaleWhileRevalidate 即可，代价是那条预载警告会回来。
        },
      }),
    ],
    base,
    define: {
      // 构建信息：注入打包时的 UTC 时间与 git 提交短 SHA，供 header 的 info tooltip 展示。
      // 不依赖 package.json 的 version（项目未维护版本号，该值恒定无实际意义）。
      __BUILD_INFO__: JSON.stringify({
        time: new Date().toISOString(),
        commit: gitCommit,
      }),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
        // 生成物目录：拼音例外表等由 scripts/*.mjs 生成后放在仓库根的 data/ 下，
        // 不混进 src（生成物不是源码），src 侧以 @data/xxx.json 引用。
        // 这里用别名而非 virtual module：eslint-plugin-import-x 对 virtual:* 需额外白名单，
        // 而别名走 tsconfig paths + 既有 TS 解析器即可，零额外配置。
        '@data': resolve(__dirname, './data'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
          // 全局注入设计令牌，使任意 .vue <style lang="scss"> 与 .scss 文件都能直接使用 $space-* / $radius-* / $fs-* 等变量与 mixin
          additionalData: injectScssTokens,
        },
      },
    },
    build: {
      target: 'es2020',
      // 彻底关掉模块预载：既不注入 polyfill，也不产出任何 <link rel="modulepreload">（index.html 与
      // __vitePreload 运行时都不再生成）。
      //
      // 起因：只有部署到 EdgeOne 的线上站会在控制台报「… was preloaded using link preload but not used
      // within a few seconds」，指向 assets/*.js。本地 dev / 本地预览没有平台在中间，所以复现不了。
      // 平台在 HTML 输出链路上会处理这条 modulepreload（据其推导并下发 Early Hints / Link 头），
      // 预载请求与真正那次模块请求的匹配条件因此对不上，Chromium 判定预载白费、重新请求一次并告警。
      // HTML 里干脆不存在预载链接，平台就无从推导，这类警告从源头消失。
      //
      // CSS 不受影响，这点是查过 Vite 源码确认的：importAnalysisBuild 会把 .css 依赖从
      // resolveDependencies 的入参里剥离出来，modulePreload 为 false 时依然把这些 CSS deps 原样传给
      // __vitePreload，由它用 <link rel="stylesheet"> 注入（源码原注释：CSS deps use the same mechanism
      // as module preloads, so even if disabled, we still need to pass these deps to the preload helper）。
      // 所以懒加载路由的样式照旧，不需要写 resolveDependencies: () => [] 这种自制过滤。
      //
      // 代价：入口的静态依赖（manualChunks 拆出的 vendor）不再与入口并行预载，首屏多一跳 RTT；
      // 懒加载 chunk 的兄弟 chunk 预载同样取消。若某天想回退成「只关 polyfill、保留预载」，
      // 改回 modulePreload: { polyfill: false } 即可。
      modulePreload: false,
      rollupOptions: {
        // 过滤第三方发行包内部的 @__PURE__ 注释位置告警（zod v4 dist 自带）：
        // Rollup 只是丢弃无法解读的注释，对产物零影响，无需在每次构建时刷屏
        onwarn: (warning, warn) => {
          if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('node_modules')) return;
          warn(warning);
        },
        output: {
          // 文件名纯哈希化：去除源文件名前缀（BaseFab / ScoreView / Fretboard 等），避免从产物名反推模块结构
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
          // 拆出稳定的 vendor 分组：业务代码迭代不再导致框架层缓存全量失效。
          // 分组依据是入口静态闭包的实际体积构成（对 597KB 单 chunk 的拆分）：
          // - vendor：vue 生态（占大头），版本同进退，拆出后业务发版不影响其缓存；
          // - zod：v4 全量约 120KB raw，由 payload 校验层动态引入（导入/同步/转录时才加载），
          //   单独成块避免与业务代码搅在一起（zod 升级只失效这一块）；
          // - sortable：useSortableList 内部对 sortablejs 动态 import（懒加载），独立成块；
          //   不能与 floating 合块，否则会经 SidebarLeft → SongSection/GroupSection 的静态链
          //   被拖进首屏闭包、吃掉首屏预算（check-bundle 220KB）；
          // - zod：由 payload 校验层经动态 import 引入（导入/同步/转录时才加载），保持懒加载。
          manualChunks: {
            vendor: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
            zod: ['zod'],
            floating: ['@floating-ui/dom'],
            sortable: ['sortablejs'],
          },
        },
      },
    },
    server: {
      // 注意：Windows 的 Hyper-V/Winnat 保留端口段包含 2977-3076，3000 在其中会导致监听 EACCES；
      // 故使用保留段之外的端口（5173）。如需本机固定为 3000 需先释放系统保留段（如 netsh 删除后重启 winnat）。
      port: 5173,
      open: true,
      host: '0.0.0.0',
    },
  };
});
