// Fret-Logic ESLint 扁平配置（ESLint 10）
// 扁平目录结构下的架构约定见 .github/CONTRIBUTING.md：跨层依赖方向为单向
// views/components → composables → stores/services → utils。
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import-x';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'archive/**',
      '.temp/**',
      'stats.html',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    // 浏览器端源码（src）——轻量语法级 AST 解析与分层架构约束（全量类型检查由 vue-tsc 负责）。
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
      'import-x/resolver': {
        typescript: true,
      },
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      // ---- 架构约束：纵向领域与平台分层依赖方向（单向；target 带 ** 覆盖全部子目录）----
      // 1. platform：底座，严禁反向导入任何领域或应用代码（含 type-only 导入）；
      // 2. domains：禁止向上依赖应用外壳层；
      // 3. fretboard/model：纯几何物理模型，严禁依赖和弦/乐谱业务；
      // 4. fretboard：禁止依赖乐谱领域（呈现层允许依赖 chord 领域）；
      // 5. chord：通用乐理层，禁止依赖乐谱领域；
      // 6. platform/utils：纯工具，禁止依赖 platform 内的 UI、Store 或服务。
      'import/no-restricted-paths': [
        'error',
        {
          basePath: '.',
          zones: [
            {
              target: ['./src/platform/**'],
              from: ['./src/domains/**', './src/app/**'],
              message: '平台基础设施层 (src/platform) 属于底层基座，严禁反向导入领域层或应用层代码。',
            },
            {
              target: ['./src/domains/**'],
              from: ['./src/app/**'],
              message: '业务领域层 (src/domains) 禁止向上依赖应用外壳层。',
            },
            {
              target: ['./src/domains/fretboard/model/**'],
              from: ['./src/domains/chord/**', './src/domains/score/**'],
              message: '指板物理模型 (fretboard/model) 是纯几何底座，严禁依赖和弦/乐谱业务。',
            },
            {
              target: ['./src/domains/fretboard/**'],
              from: ['./src/domains/score/**'],
              message: '指板引擎领域 (fretboard) 禁止依赖乐谱领域（呈现层允许依赖 chord 领域）。',
            },
            {
              target: ['./src/domains/chord/**'],
              from: ['./src/domains/score/**'],
              message: '和弦与乐理领域 (chord) 属于通用乐理层，禁止依赖乐谱排版领域。',
            },
            {
              target: ['./src/platform/utils/**'],
              from: ['./src/platform/ui/**', './src/platform/store/**', './src/platform/services/**'],
              message: '底层工具 (platform/utils) 严禁依赖上层 UI、Store 或服务。',
            },
          ],
        },
      ],
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
      // 类型式 defineProps 配合 Vue 3.5 解构默认值（const { x = d } = defineProps()）时，
      // 该规则无法识别解构里的默认值，会对所有可选 prop 误报；而 TS 类型已表达可选性，故关闭。
      'vue/require-default-prop': 'off',
      'import/no-duplicates': 'error',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      // 属性顺序交由 prettier-plugin-organize-attributes 统一处理，避免与 ESLint 互改。
      'vue/attributes-order': 'off',
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
    // Node 侧脚本与配置文件——files 已收窄，不再匹配 src/**/*.ts，
    // 故不会用 Node globals（process/require/__dirname）污染浏览器代码作用域，
    // 也不会用 no-console:'off' 覆盖浏览器块对 console 的告警。
    // 与上方 src 块互斥：src/**/*.ts 只命中浏览器块。
    files: ['**/*.{cjs,mjs,js}', 'scripts/**/*.ts', '*.config.{ts,js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
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
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
      'import/no-duplicates': 'error',
    },
  },
  {
    // 统一日志设施是唯一被允许直接使用 console 的地方（生产构建剥离 debug/info）。
    // 其通过 console[level] 动态索引输出，无法被 no-console 静态放行，故整文件豁免。
    files: ['src/platform/utils/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // 必须最后：关闭所有与 Prettier 排版冲突的 ESLint 规则（html-indent / html-self-closing 等），
  // 让 Prettier 独占格式化主导权，消除 eslint --fix 与 prettier --write 的反复互改。
  // 注：vue/attributes-order 需另行显式关闭（见上方 src 规则块），因属性顺序现由
  // prettier-plugin-organize-attributes 统一处理，而本配置默认不覆盖该规则。
  prettier
);
