// Fret-Logic ESLint 扁平配置（ESLint 10）
// 扁平目录结构下的架构约定见 .github/CONTRIBUTING.md：跨层依赖方向为单向
// views/components → composables → stores/services → utils。
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import betterTailwind from 'eslint-plugin-better-tailwindcss';
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
      // 统一数组类型写法为 T[]（Array<T> 由 --fix 机械转换）
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
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
      // import 必须置于文件顶部，且其后空行与执行代码分隔
      'import/first': 'error',
      'import/newline-after-import': 'error',
      // 防御性规则：禁止模块自引用
      'import/no-self-import': 'error',
      // 禁止跨目录上溯的相对导入（../），统一指向 src 根别名 @/；同目录 ./ 保留。
      // 与 importOrder 的 @/platform|domains|app 分层分组配合，保持依赖流向清晰。
      'import/no-relative-parent-imports': 'error',
      // 属性顺序交由 prettier-plugin-organize-attributes 统一处理，避免与 ESLint 互改。
      'vue/attributes-order': 'off',
      // 强制 v-bind 简写且开启 Vue 3.4+ 同名属性简写（:foo="foo" 必须写为 :foo，:attr-name="attrName" 必须写为 :attr-name）
      'vue/v-bind-style': ['error', 'shorthand', { sameNameShorthand: 'always' }],
      // 强制布尔型 prop 使用无值简写：禁止写 :prop="true"，必须简写为 prop
      'vue/prefer-true-attribute-shorthand': ['error', 'always'],
      // 强制事件处理器使用 inline 风格（函数调用必须显式带括号，且禁止内联箭头函数）
      'vue/v-on-handler-style': ['error', 'inline'],
      // defineEmits 必须用类型字面量声明（与项目类型优先风格一致）
      'vue/define-emits-declaration': ['error', 'type-based'],
      // defineProps 同样必须用类型字面量声明
      'vue/define-props-declaration': ['error', 'type-based'],
      // 注：vue/prefer-define-model 在 eslint-plugin-vue v10 已移除，无法作为规则启用；
      // 存量已全部迁移至 defineModel，新代码靠 review 约定。
      // 禁止空的 template/script/style 块
      'vue/no-empty-component-block': 'error',
      // 响应性丢失检测（AST 级，对 ref 工厂解构/vueuse 有误报可能，先以 warn 试跑）
      'vue/no-ref-object-reactivity-loss': 'warn',
      // 编译宏按 defineOptions → defineModel → defineProps → defineEmits → defineSlots 顺序排列
      'vue/define-macros-order': [
        'error',
        { order: ['defineOptions', 'defineModel', 'defineProps', 'defineEmits', 'defineSlots'] },
      ],
      // 模板组件标签必须 PascalCase
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      // SFC 块顺序：template → script → style
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
    },
  },
  {
    // Tailwind 过时语法检测（v4）：仅保留废弃类名检测（如 rounded → rounded-sm）。
    // 类名排序由 prettier-plugin-tailwindcss 独占；未知类检测暂不启用
    //（SCSS @layer components 里定义的项目自定义类无法被插件解析，会大面积误报）。
    files: ['src/**/*.{ts,vue}'],
    plugins: {
      'better-tailwindcss': betterTailwind,
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: './src/assets/tailwind.css',
        // 全量检查 JS/TS 变量（含对象值）中的类名（SIZE_MAP、CONTROL_HEIGHT_CLASSES 等）。
        // 注意：不开 callees（函数实参）——emit()/addEventListener() 的非类名字符串会被
        // 废弃类修复器误改（曾把 emit('blur') 改成 emit('blur-sm') 破坏事件名）
        variables: [['.*', [{ match: 'strings' }, { match: 'objectValues' }]]],
      },
    },
    rules: {
      // 废弃类检测仅看模板属性：变量里的 'blur'、'change' 等事件名字符串会被误报/误修
      'better-tailwindcss/no-deprecated-classes': ['error', { variables: [], callees: [] }],
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-conflicting-classes': 'error',
      // 拼接检测只看模板属性：全局变量全开后，日志前缀/路径拼接等非类名字符串会产生海量误报
      'better-tailwindcss/no-concatenated-classes': ['error', { variables: [], callees: [] }],
      // 类名（token 列表）排序交由 prettier-plugin-tailwindcss 独占；
      // 而 important 修饰符位置、变体堆叠顺序、var() 语法属 within-token 规范化，
      // prettier-plugin-tailwindcss 不处理，故保留于此（与 prettier 各管一维，互不冲突）
      'better-tailwindcss/enforce-consistent-class-order': 'error',
      'better-tailwindcss/enforce-consistent-important-position': 'error',
      'better-tailwindcss/enforce-consistent-variant-order': 'error',
      'better-tailwindcss/enforce-consistent-variable-syntax': 'error',
      // 关闭多类合并（h-full w-full → size-full、px-3 py-3 → p-3 等），
      // 并忽略 width/height 系列的任意值→刻度值转换（w-[14rem] → w-56、min-w-[19rem] → min-w-76 等），
      // 保留其余规范写法检查（z-[3] → z-3、var() 语法等；仅类名 token 列表排序已移交 prettier-plugin-tailwindcss）
      'better-tailwindcss/enforce-canonical-classes': [
        'error',
        {
          collapse: false,
          ignore: ['^w-', '^min-w-', '^max-w-', '^h-', '^min-h-', '^max-h-'],
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
