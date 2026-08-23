// Fret-Logic ESLint 扁平配置（ESLint 10）
// 架构约束：feature 之间只允许通过彼此的 index.ts 公共出口互访。
import eslint from '@eslint/js';
import vue from 'eslint-plugin-vue';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const featureRoots = ['chords', 'songs', 'score', 'fretboard', 'audio', 'export', 'sync'];

/** 生成 feature 目录与其 index.ts 白名单，用于 no-restricted-paths */
function buildFeatureRestrictions() {
  const rules = [];
  for (const src of featureRoots) {
    for (const dst of featureRoots) {
      if (src === dst) continue;
      rules.push({
        from: `src/features/${src}/`,
        target: `src/features/${dst}/`,
        message: `feature "${src}" 不得直接导入 feature "${dst}" 的内部文件；请通过 ${dst}/index.ts 公共出口导入。`,
        except: [`src/features/${dst}/index.ts`],
      });
    }
  }
  return rules;
}

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
      // ---- 架构约束：feature 隔离 ----
      'import/no-restricted-paths': ['error', { zones: buildFeatureRestrictions() }],
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
