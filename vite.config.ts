import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    vue(),
    visualizer({
      open: process.env.ANALYZE === 'true',
      filename: 'stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  base: '/FretLogic/',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // 拆出稳定的 vendor 分组：业务代码迭代不再导致框架层缓存全量失效
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          vueuse: ['@vueuse/core', '@vueuse/components'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0',
  },
});
