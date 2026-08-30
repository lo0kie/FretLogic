import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Vitest 测试配置（projects 双项目拆分）：
// - logic 项目（environment: node）：领域/服务/工具等纯逻辑测试。
//   jsdom 环境构建是全量测试最大的 CPU 开销（跨 worker 汇总约 50s+），
//   纯逻辑测试切到 node 环境可显著提速且行为不变。
// - ui 项目（environment: jsdom）：组件挂载测试（@vue/test-utils 依赖 DOM）。
// - 共享 setup：注入 fake-indexeddb 与 IntersectionObserver polyfill（node 环境下同样无害）。
// - isolate 默认 true：每个测试文件独立模块注册表，模块级缓存不跨文件泄漏。
// - pool 默认 'forks'：Windows 下进程模型最稳，避免 worker 挂起。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        additionalData: (source: string, filePath: string) => {
          if (filePath.includes('tokens.scss')) return source;
          if (source.includes('assets/tokens')) return source;
          return `@use "@/assets/tokens" as *;\n${source.replace(/^\uFEFF/, '')}`;
        },
      },
    },
  },
  test: {
    // 性能/产物类检查不在单测链路中（bundle 体积走 build:budget）
    exclude: [...configDefaults.exclude, '**/performance.test.ts'],
    // 全局 setup：fake-indexeddb / IntersectionObserver polyfill / wave+tooltip 指令桩
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    // 每个测试后自动还原 vi.spyOn 打桩，避免跨测试污染
    restoreMocks: true,
    coverage: {
      provider: 'v8',
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
          environment: 'node',
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
          environment: 'jsdom',
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
});
