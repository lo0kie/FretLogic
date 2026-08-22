import vue from '@vitejs/plugin-vue';
import { execSync } from 'node:child_process';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// 读取当前 git 提交短 SHA，作为随代码自动变化、真实有意义的构建标识。
// 非 git 环境（或取不到时）回退为 unknown。
let gitCommit: string;
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {
  gitCommit = 'unknown';
}

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
      less: {
        // 全局注入设计令牌，使任意 .vue <style lang="less"> 与 .less 文件都能直接使用 @space-* / @radius-* / @fs-* 等变量，
        // 无需每个文件手动 @import。
        // - 跳过 tokens 文件自身，避免循环注入；
        // - 已手动引入 tokens 的文件（如 main.less）直接返回，避免重复注入；
        // - 剥离文件开头的 UTF-8 BOM，否则注入后 BOM 被挤到第二行导致 LESS 解析失败。
        additionalData: (source: string, filePath: string) => {
          if (filePath.includes('tokens.module')) return source;
          if (source.includes('assets/tokens.module')) return source;
          return `@import '@/assets/tokens.module';\n${source.replace(/^\uFEFF/, '')}`;
        },
        javascriptEnabled: true,
      },
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
