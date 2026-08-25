import vue from '@vitejs/plugin-vue';
import { execSync } from 'node:child_process';
import { resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
            src: '/FretLogic/pwa-192x192.png', // 需在 public 目录下准备对应图标
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/FretLogic/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
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
      scss: {
        api: 'modern-compiler',
        // 全局注入设计令牌，使任意 .vue <style lang="scss"> 与 .scss 文件都能直接使用 $space-* / $radius-* / $fs-* 等变量与 mixin，
        // 无需每个文件手动 @use。
        additionalData: (source: string, filePath: string) => {
          if (filePath.includes('tokens.scss')) return source;
          if (source.includes('assets/tokens')) return source;
          return `@use "@/assets/tokens" as *;\n${source.replace(/^\uFEFF/, '')}`;
        },
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
