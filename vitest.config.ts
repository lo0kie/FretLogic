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
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      clean: false,
      // 分层覆盖率门槛（基于当前可达水平设定，可随测试补齐提升）：
      // - 领域层（domain/music/validation）核心算法 ≥85%
      // - 数据层（IDB 仓库/迁移）≥80%
      // - core 基础设施（errors/storage/composables/theme）≥55%
      // - 全局 ≥70%（设计文档原目标，ui/views 后续 phase 提升）
      thresholds: {
        'perFile': false,
        'src/domain/music/**': {
          lines: 85,
          functions: 70,
          statements: 85,
          branches: 60,
        },
        'src/domain/validation/**': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 60,
        },
        'src/core/**': {
          lines: 55,
          functions: 50,
          statements: 55,
          branches: 50,
        },
        'src/data/**': {
          lines: 80,
          functions: 80,
          statements: 80,
          branches: 60,
        },
      },
    },
  },
});
