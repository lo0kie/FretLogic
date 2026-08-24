// Fret-Logic ESLint 扁平配置（ESLint 10）
// 扁平目录结构下的架构约定见 CONTRIBUTING.md：跨层依赖方向为单向
// views/components → composables → stores/services → utils。
import eslint from '@eslint/js';
import vue from 'eslint-plugin-vue';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'archive/**',
      'stats.html',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    // 浏览器端源码（src）
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, __BUILD_INFO__: 'readonly' },
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      // ---- 架构约束：扁平分层 ----
      // 历史上用 import/no-restricted-paths 强制 feature 隔离；改为扁平结构后，
      // 跨层方向（views/components → composables → stores/services → utils）由约定与代码评审保障。
      // ---- 代码质量 ----
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      // 遗留模式：GroupModalsContainer/SongModalsContainer 以 prop 传递共享响应式对象并改嵌套字段，
      // 已重构为 provide/inject，恢复 error。
      'vue/no-mutating-props': 'error',
      'import/no-duplicates': 'error',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': [
        'error',
        {
          html: { void: 'always', normal: 'always', component: 'always' },
          svg: 'always',
          math: 'always',
        },
      ],
    },
  },
  {
    // Node 侧脚本与配置文件
    files: ['**/*.{cjs,mjs,js,ts}', 'scripts/**', '*.config.{ts,js,mjs}', 'vitest.config.ts', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
  }
);
