import { execSync } from 'node:child_process';
import { resolve } from 'path';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { VitePWA } from 'vite-plugin-pwa';
import { configDefaults, defineConfig } from 'vitest/config';

import { injectScssTokens } from './scripts/scss-inject';

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
    // 性能/产物类检查不在单测链路中（bundle 体积走 build:budget）
    exclude: [...configDefaults.exclude, '**/performance.test.ts'],
    // 全局 setup：fake-indexeddb / IntersectionObserver polyfill / wave+tooltip 指令桩
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    // 每个测试后自动还原 vi.spyOn 打桩，避免跨测试污染
    restoreMocks: true,
    coverage: {
      provider: 'v8' as const,
      reporter: ['text'],
      clean: false,
      // 分层覆盖率门槛（基于当前可达水平设定，可随测试补齐提升）：
      // - 领域层（services/music、services/validation）核心算法 ≥85%/80%
      // - 数据仓储层（services/repositories）≥80%
      // - 服务基础设施（services/*：errors/storage/data/sync）≥55%
      // - 全局 ≥70%（设计文档原目标，ui/views 后续 phase 提升）
      thresholds: {
        'perFile': false,
        'src/services/music/**': {
          lines: 85,
          functions: 70,
          statements: 85,
          branches: 60,
        },
        'src/services/validation/**': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 60,
        },
        'src/services/repositories/**': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 60,
        },
        'src/services/**': {
          lines: 55,
          functions: 50,
          statements: 55,
          branches: 50,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node' as const,
          include: ['tests/**/*.test.ts'],
          // 依赖 DOM/localStorage/浏览器 API 的测试归入 ui 项目
          //（barre/repositories/sanitizePersistedData 经 store 链路触碰 localStorage，其余依赖 jsdom 组件环境）
          exclude: [
            ...configDefaults.exclude,
            '**/performance.test.ts',
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

export default defineConfig(({ mode }) => {
  // 单一部署目标：GitHub Pages 子路径 /FretLogic/
  const base = '/FretLogic/';

  return {
    // 统一缓存收纳：Vite 依赖预构建/构建缓存与 Vitest 测试结果缓存都落在 node_modules/.cache/vite，
    // 与 eslint（node_modules/.cache/eslint）等工具缓存目录约定对齐
    cacheDir: 'node_modules/.cache/vite',
    // 单测配置（仅 Vitest 消费，Vite 构建忽略该字段）
    ...testConfig,
    plugins: [
      tailwindcss(),
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
              filename: 'stats.html',
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
          theme_color: '#007aff', // 主题颜色
          background_color: '#f2f2f7', // 背景色
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
      rollupOptions: {
        output: {
          // 文件名纯哈希化：去除源文件名前缀（BaseFloatingBar / ScoreView / Fretboard 等），避免从产物名反推模块结构
          entryFileNames: 'assets/[hash].js',
          chunkFileNames: 'assets/[hash].js',
          assetFileNames: 'assets/[hash][extname]',
          // 拆出稳定的 vendor 分组：业务代码迭代不再导致框架层缓存全量失效
          manualChunks: {
            vendor: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
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
