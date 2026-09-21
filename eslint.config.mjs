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
      'worker/dist/**',
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
      // 注意 key 必须是 import-x/resolver：本仓用的是 eslint-plugin-import-x（见 plugins 区），
      // 运行时只读 'import-x/resolver-next' | 'import-x/resolver-legacy' | 'import-x/resolver' | 'import-x/resolve'，
      // 没有裸 'import/' 前缀的回退。此前写成 'import/resolver'，解析器从未生效，
      // no-restricted-paths 解析不了别名路径直接放行——六条架构 zone 全部空转。
      'import-x/resolver': {
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
      // 关闭核心 no-undef：未定义标识符由 vue-tsc 以 ts(2304)/ts(2552) 精确检查，而该规则不做类型
      // 分析，把「未解析的引用」一律判为未定义 —— 落在类型位置上就会误报纯类型全局。
      // 这类名字「只有类型、没有运行时值」，因此不在 globals.browser 里（它收的是运行时值：
      // ImageBitmap / Blob / MouseEvent / HTMLCanvasElement 在，`CanvasImageSource` 这类 lib 类型别名
      // 不在），往 globals 里补类型名属语义污染且会不断复发，不能这么修。
      // 这活本该由 typescript-eslint 的 eslint-recommended 兜底，但它的 files 只匹配
      // `**/*.ts|tsx|mts|cts`（@typescript-eslint/eslint-plugin/dist/configs/eslint-recommended-raw.js），
      // 不含 `**/*.vue` —— 于是 .vue 里的 no-undef 一直是开的（.ts 里 RequestInit / IDBValidKey
      // 这类纯 DOM 类型一直没报，正是因为那边关了）。
      // 注意别把范围想大了：scope-manager 的默认 lib 是 `['es2018']`（未配 parserOptions.project 时
      // 不会从 tsconfig 推导 lib），es5→es2018 的隐式 lib 变量（Record / ReturnType / PropertyKey …）
      // 都是有声明的、不报；真正会踩的只有 lib.dom.d.ts 那一类（当前 dom 未启用）。
      // 替代修法是给 parser 配 project/projectService 让 lib 从 tsconfig 推导，但那等于引入
      // 类型感知 lint，与「全量类型检查交给 vue-tsc」的分工相悖，代价不成比例。
      'no-undef': 'off',
      // `_` 前缀 = 「有意声明但不使用」的显式丢弃约定（如解构剔除 class/style 后的 rest 场景）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // 对象类型定义统一用 interface（type X = { ... } → interface X { ... }）。
      // 只约束「对象类型字面量」这一形态：联合 / 交叉 / 映射 / 条件类型本来就必须写 type，不受影响。
      // ⚠️ 它的 --fix 是盲目文本改写、不判语义：TS 的隐式索引签名只赋予「对象字面量类型」，
      //    interface 因可被声明合并扩展而不参与。故凡「type 别名需满足 Record<...> 约束」的写法
      //    （如 mitt 的 `mitt<Events extends Record<EventType, unknown>>`），改成 interface 即编译不过。
      //    这类点就地豁免，勿依赖 --fix；现例见 src/domains/chord/store/chordEventBus.ts 的 ChordEvents。
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      // 统一数组类型写法为 T[]（Array<T> 由 --fix 机械转换）
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      // 箭头函数体只含一条 return 时强制简写为表达式体（() => { return x; } → () => x）。
      // 判据是「块体恰好只有一条 return」——`() => { foo(); }` 这类无 return 的块不受影响：
      // 简写会把它变成「返回 foo() 的返回值」，语义改变，故规则刻意放过。
      // ⚠️ 首选项的默认值是 always（反向要求补花括号），与意图相反，必须显式写出 as-needed。
      // 该规则可自动修复，且修复会保留块内注释（只删花括号与 return 关键字）。
      'arrow-body-style': ['error', 'as-needed'],
      // ---- 冗余写法收敛：同一意图的多种写法归一（以下全部可 --fix）----
      // 属性与方法简写：{ foo: foo } → { foo }，foo: function () {} → foo() {}
      'object-shorthand': ['error', 'always'],
      // 删除函数末尾多余的裸 return;
      'no-useless-return': 'error',
      // 去掉已 return 的 if 之后多余的 else；else if 默认放行（allowElseIf 默认 true）
      'no-else-return': 'error',
      // else 块内只有一个 if 时提升为 else if
      'no-lonely-if': 'error',
      // x ? true : false → x；x ? x : y → x || y。
      // ⚠️ 第二项的默认值是 defaultAssignment: true，会放过 x ? x : y，故须显式关掉才生效。
      //    该改写语义等价（x 为 0 / '' / null 时两侧结果一致），纯属风格取向，改回 true 即恢复默认。
      'no-unneeded-ternary': ['error', { defaultAssignment: false }],
      // 算术与位运算自赋值：x = x + 1 → x += 1
      'operator-assignment': ['error', 'always'],
      // 逻辑自赋值：x = x || y → x ||= y（覆盖 ||= / &&= / ??=）
      'logical-assignment-operators': ['error', 'always'],
      // 去掉同名的重命名：import { foo as foo } / export { a as a } / const { b: b } = o
      'no-useless-rename': 'error',
      // 去掉无意义的计算属性键：{ ['a']: 1 } → { a: 1 }（class 成员一并覆盖）
      'no-useless-computed-key': 'error',
      // 声明后不再重新赋值的 let → const。
      // 无初值的声明（let x; x = 1;）仍会报告，但规则刻意不提供 --fix
      //（源码 prefer-const.js 第 460 行：Don't do a fix unless all variables in the declarations
      // are initialized），故 --fix 不会产出非法的 `const x;`。
      'prefer-const': 'error',
      // 隐式类型转换改为显式调用：!!x → Boolean(x)、+x → Number(x)、'' + x → String(x)。
      // 三项默认全开（boolean / number / string），故字符串拼接也一并纳入；
      // !!x 不区分上下文，if (!!x) 同样会报（只想治理布尔上下文的话是另一条 no-extra-boolean-cast）；
      // --fix 仅在 Boolean 未被局部遮蔽时才提供（规则源码据此判定），是安全的。
      // ⚠️ 但 !!x → Boolean(x) 会破坏 TS 真值收窄：!!x 是收窄守卫，Boolean(x) 只是普通调用。
      // 需要收窄的场合请写 x !== null / x !== undefined（曾把 BasePopover 的
      // `!!leave && isPointerInRect(leave)` --fix 成 Boolean(leave) 后报「参数不能赋给类型」）。
      'no-implicit-coercion': 'error',
      // ---- 旧 API / 旧写法 → 等价的新语法（以下全部可 --fix）----
      // 字符串拼接改用模板串：'a' + b → `a${b}`。
      // 与上面 no-implicit-coercion 在 `'' + x` 上重叠（它改成 String(x)、本条改成模板串），
      // 两者会命中同一节点，但 --fix 一轮即收敛：改完后另一种写法不再匹配，不会来回互改。
      'prefer-template': 'error',
      // Object.assign({}, o) → { ...o }。仅当首参是对象字面量时报，无附着属性/访问器语义差异。
      'prefer-object-spread': 'error',
      // Math.pow(a, b) → a ** b（ES2016 幂运算符，target ES2020 无碍）
      'prefer-exponentiation-operator': 'error',
      // 回调里的 function 表达式 → 箭头函数。
      // 默认 { allowNamedFunctions: false, allowUnboundThis: true }：具名函数、以及函数体内
      // 用到 this 的函数表达式都不报（保住依赖动态 this 绑定的回调）。
      // 本仓不装 eslint-plugin-prettier，且 lint:fix 是「lint --fix」+「format」两步分开执行，
      // 正是 eslint-config-prettier 认定可安全启用的前提——它只在 prettier.js 入口（配合
      // prettier/prettier 规则时）才把这条与 arrow-body-style 置为 0，本仓用的是 /flat（= index.js），
      // 不含这两条，故与上面已启用的 arrow-body-style 可安全共存。
      'prefer-arrow-callback': 'error',
      // 用解构取值：const x = o.x → const { x } = o；数组形态 const first = arr[0] → const [first] = arr。
      // ⚠️ 此处刻意沿用默认值：array / object 均开，VariableDeclarator 与 AssignmentExpression 均开。
      //    要收窄成「只治对象形态」，写成：
      //    ['error', { VariableDeclarator: { array: false, object: true },
      //                AssignmentExpression: { array: false, object: true } }]。
      // ⚠️ --fix 覆盖面很窄：源码 shouldFix 只认「VariableDeclarator + 非计算属性 + 同名」这一种形态
      //   （即 const x = o.x）。数组形态、赋值形态（x = o.x）、重命名形态（const y = o.x）都只报告、
      //   不给 --fix，必须手改——所以 lint:fix 跑完仍会剩下一批，不是没生效。
      'prefer-destructuring': ['error'],
      // ⚠️ dot-notation（obj['a'] → obj.a）**不可开**，此处显式声明拒绝，防止后人顺手补上。
      // 本仓 tsconfig.json:25 开了 noPropertyAccessFromIndexSignature：索引签名属性
      //（Record<string, T>、ImportMetaEnv、迁移时的 RawRecord 等）**必须**写 obj['a']，
      // 写成 obj.a 是 ts(4111) 编译错误。而核心 dot-notation 是纯语法规则、不看类型，
      // 会把这类被编译器强制的写法一律判为违规，其 --fix 再把它们改回编译不过的点号形式
      //（静态扫描约 260 处 / 59 个文件，抽样确认以索引签名访问与类型位置为主）。
      // 能做这件事的只有 @typescript-eslint/dot-notation——它会直接读 tsconfig 的
      // noPropertyAccessFromIndexSignature 并据此放行——但它 requiresTypeChecking，
      // 需引入 projectService，与「全量类型检查交给 vue-tsc」的分工相悖。
      'dot-notation': 'off',
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
      //
      // ⚠️ 不能用 import/no-relative-parent-imports：它按「解析后的路径」判定——
      // resolve 成功后 path.relative 出 ../ 就报，导致 @/platform 这类**合法的**跨目录
      // 别名导入被全量误杀（994 处）。而 resolver 失效的年代 resolve() 返回 null，
      // 这条规则从未运行过——等于从没用对过。这里用字面 patterns 精确表达原意图。
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['..', '../**', '../**/*'],
              message: '禁止相对路径上溯导入：跨目录引用一律使用 src 根别名 @/（同目录 ./ 保留）。',
            },
          ],
        },
      ],
      // 属性顺序交由 prettier-plugin-organize-attributes 统一处理，避免与 ESLint 互改。
      'vue/attributes-order': 'off',
      // 强制 v-bind 简写且开启 Vue 3.4+ 同名属性简写（:foo="foo" 必须写为 :foo，:attr-name="attrName" 必须写为 :attr-name）
      'vue/v-bind-style': ['error', 'shorthand', { sameNameShorthand: 'always' }],
      // 强制布尔型 prop 使用无值简写：禁止写 :prop="true"，必须简写为 prop
      'vue/prefer-true-attribute-shorthand': ['error', 'always'],
      // 强制事件处理器使用 inline 风格（函数调用必须显式带括号，且禁止内联箭头函数）
      'vue/v-on-handler-style': ['error', 'inline'],
      // 事件绑定统一用 @ 简写（v-on:click → @click）
      'vue/v-on-style': ['error', 'shorthand'],
      // 插槽统一用 # 简写（v-slot:default → #default）
      'vue/v-slot-style': ['error', 'shorthand'],
      // 去掉无意义的 v-bind 包装（:foo="'bar'" → foo="bar"）。
      // 布尔 prop 的 :foo="true" 已由上方 prefer-true-attribute-shorthand 单独管辖，两者互补不重叠。
      'vue/no-useless-v-bind': 'error',
      // 统一从 'vue' 导入（@vue/runtime-core 等内部包路径 → 'vue'）
      'vue/prefer-import-from-vue': 'error',
      // defineEmits 必须用类型字面量声明（与项目类型优先风格一致）
      'vue/define-emits-declaration': ['error', 'type-based'],
      // defineProps 同样必须用类型字面量声明
      'vue/define-props-declaration': ['error', 'type-based'],
      // defineModel 迁移守卫：eslint-plugin-vue 并未提供 prefer-define-model（v10.10.0 的 252 条规则与
      // 官方文档的 Removed 表里都没有该 id —— 此前的「v10 已移除」注释有误），故用 no-restricted-syntax
      // 按 AST 自建等价约束，避免「双向绑定退回 modelValue prop + update:modelValue 事件」只靠 review 兜底。
      // 只锁「默认模型」的精确命名（存量经核对为 0 命中）：具名模型形态（update:visible / update:strings
      // 等）在 BaseFloatingPanel、Fretboard、BaseEditableText 中仍在使用，选择器一旦放宽成 /^update:/
      // 会在这些文件当场告警；要收紧得先把它们迁到 defineModel，属另一件事。
      // 选择器 C 用于兜住「emit 签名来自外部类型别名、B 无法在声明处命中」的情形。
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='defineProps'] TSPropertySignature[key.name='modelValue']",
          message: '双向绑定请用 defineModel()，不要在 defineProps 中声明 modelValue。',
        },
        {
          selector: "CallExpression[callee.name='defineEmits'] TSLiteralType > Literal[value='update:modelValue']",
          message: '双向绑定请用 defineModel()，不要在 defineEmits 中声明 update:modelValue。',
        },
        {
          selector: "CallExpression > Literal[value='update:modelValue']",
          message: "双向绑定请用 defineModel()，不要手写 emit('update:modelValue')。",
        },
      ],
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
      // 类名（token 列表）整体排序交由 prettier-plugin-tailwindcss 独占；
      // 故关闭此规则——否则它要求的顺序与 prettier 输出的 Tailwind v4 规范顺序冲突，
      // 会导致 lint 永远无法与 format 同时通过（整个项目皆然，非个别文件）。
      // important 修饰符位置、变体堆叠顺序、var() 语法属 within-token 规范化，
      // prettier-plugin-tailwindcss 不处理，故保留其余规则（与 prettier 各管一维，互不冲突）。
      'better-tailwindcss/enforce-consistent-class-order': 'off',
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
      // 同上：import-x 只认 import-x/resolver，裸 import/ 前缀静默失效
      'import-x/resolver': {
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
  {
    // 文件编码规范：禁止 UTF-8 BOM（U+FEFF）。
    // BOM 会被部分工具反复叠加写入（同一文件可堆出多层），且会让首行内容解析异常，
    // 故在提交前的 lint 关卡统一拦截；配合 .editorconfig 的 charset = utf-8 从写入侧根治。
    files: ['**/*.{ts,tsx,vue,js,mjs,cjs}'],
    rules: {
      'unicode-bom': ['error', 'never'],
    },
  },
  // 必须最后：关闭所有与 Prettier 排版冲突的 ESLint 规则（html-indent / html-self-closing 等），
  // 让 Prettier 独占格式化主导权，消除 eslint --fix 与 prettier --write 的反复互改。
  // 注：vue/attributes-order 需另行显式关闭（见上方 src 规则块），因属性顺序现由
  // prettier-plugin-organize-attributes 统一处理，而本配置默认不覆盖该规则。
  // 注 2：curly 是本配置里唯一必须写在本对象**之后**的规则——官方把它列为 special rule
  //（index.js:12 的值为 0，等价 off），写在上面任何块里都会被本对象静默覆盖成关闭。见文件末尾。
  prettier,
  {
    // ⚠️ 本块的位置是功能性的，不要上移：eslint-config-prettier 把 curly 置为 0（= off），
    // 而 flat config 的规则合并是「后面的对象覆盖前面的」，放进上面的 src 块会被覆盖成 off，
    // 且不报任何错——规则会静默失效。eslint-config-prettier 官方 README 明确：
    // curly 用 "all" 或 "multi" 与 Prettier 不冲突；只有 "multi-line" / "multi-or-nest" 才冲突
    //（那两个允许单行体不写花括号，Prettier 又会把它排成多行，形成互改）。
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // 单语句块强制去掉花括号：if (x) { return; } → if (x) return;
      // 判据是「语句条数」而非行数——单条语句的跨行块同样会被折叠，随后由 prettier 合回一行。
      // 多条语句、空块，以及删括号会破坏语义或语法的情形（块内是词法声明 let/const/class/function，
      // 或块后紧跟 else 而块内是悬垂 if）由规则内部的 areBracesNecessary 护栏保留花括号，
      // 故 --fix 不会产出坏代码（ast-utils.js:2935-2940）。
      curly: ['error', 'multi'],
    },
  }
);
