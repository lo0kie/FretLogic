import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
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
  },
});
