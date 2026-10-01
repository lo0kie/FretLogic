# Contributing to Fret-Logic

感谢你愿意为 Fret-Logic 贡献代码！以下是参与项目的指南。

## 开发环境

- **Node.js** ≥ 22.13（CI 与 `package.json` 的 `packageManager` 都按 22 钉；低于 22.13 时 `pnpm@11.20.0` 依赖的内建
  `node:sqlite` 不存在，`pnpm install` 会抛 `ERR_UNKNOWN_BUILTIN_MODULE`）
- **pnpm** 11.20.0（`package.json` 的 `packageManager` 钉死这一版：`corepack enable` 会自动按它取，手装则
  `npm i -g pnpm@11.20.0`。此前写「≥ 9」与钉版不符，且 `pnpm-workspace.yaml` 的 `allowBuilds`
  白名单是新键，旧版 pnpm 会直接忽略它）

```bash
pnpm install
pnpm dev          # 本地开发（http://localhost:5173）
```

## 常用命令

| 命令                   | 说明                                                  |
| ---------------------- | ----------------------------------------------------- |
| `pnpm dev`             | 启动开发服务器                                        |
| `pnpm build`           | 生产构建                                              |
| `pnpm typecheck`       | 类型检查（vue-tsc）                                   |
| `pnpm lint`            | ESLint 检查（含架构约束）                             |
| `pnpm test`            | 单元测试（Vitest）                                    |
| `pnpm build:budget`    | 产物体积预算检查                                      |
| `pnpm bench`           | 领域纯函数性能基准（与入库基线比倍率，超 3 倍即失败） |
| `pnpm format`          | Prettier 格式化                                       |
| `pnpm changelog:build` | 由 `changelog/` 下的片段生成汇总日志                  |
| `pnpm verify`          | 串行跑完下列全部门禁（挂在 pre-push）                 |

## 提交前检查

```bash
pnpm verify
```

等价于
`format:check → changelog:check → guidance:check → lint → typecheck → typecheck:tests → typecheck:worker → test → build → build:budget`
（共 10 步；真源是 `scripts/verify.mjs` 的 `STEP_NAMES`，此处只是抄一份便于阅读）。CI（GitHub
Actions）跑同一组 10 步（顺序不同），并额外多两步：`pnpm bench` —— **硬门禁**（与入库的 `scripts/bench-baseline.json`
比倍率、超 3 倍即失败），不是信息性输出，`pnpm verify` 刻意不含它（基准是机器相关的）；`Guidance drift check` ——
CI 独有，用 `git diff --exit-code -- AGENTS.md` 兜住「install 的 `prepare` 已就地重写 AGENTS.md，于是 `guidance:check`
变成拿它跟它自己比」这个盲区。任一步失败都将阻止合并。

### 更新日志片段

`.github/CHANGELOG.md` 是**派生文件**（由 `changelog/` 下的片段拼出），**不要手改**。用户可感知的改动请写进 `changelog/`
下的**当前工作区片段**（上次提交之后创建、尚未提交的那个；工作区里没有才新建），文件名
`<YYYY-MM-DD-HHMM>-<ascii-kebab-slug>.md`（用当前时间取名；slug 只是短标识符，不写整句），正文即一段 Keep a
Changelog 风格的 `### <类型> · <主题>（<日期>）`
小节。**片段以工作区为界分区**：已提交的片段即冻结（只读）；工作区里的未提交改动同属一区、可自由合并改写 ——一次工作区（一次提交）的改动一律并进同一个片段，不要每改一轮或每换一个主题就新开一个（细则见
`rules/04-changelog-fragment-zones.md` 的「一、变更日志片段的分区规则」）。提交时 `.husky/pre-commit`
会自动重新生成汇总并把 `.github/CHANGELOG.md` 纳入本次提交，片段命名不合规会在提交前被拦下。

## 架构约定

### 目录结构（垂直领域）

```
src/
  app/          # 应用装配外壳：App.vue / router / 顶层布局 / 全局模态 / backup、sync、data、audio 编排服务
  assets/       # 样式与设计令牌（tokens.scss / transitions.scss）
  domains/      # 纵向业务领域（跨领域消费走深路径导入；领域根 index.ts 仅为模块清单，不作导入入口）
    fretboard/  # 指板引擎：model（纯几何物理模型）/ components（乐器呈现）/ composables
    chord/      # 和弦乐理与和弦库：theory（乐理内核）/ store / library / workbench / transfer
    score/      # 乐谱排版：editor / library / preview / model / transfer
  platform/     # 平台底座：ui 原语 / store 基座 / directives / utils / services（clipboard、storage、errors）
```

### 依赖方向（单向）

`app → domains → platform`。领域间的细粒度约束与平台单向保护由 `eslint.config.mjs` 的 `import/no-restricted-paths`
强制，**六条 zone 逐条为**：

1. `platform` 不得依赖 `domains` / `app`；
2. `domains` 不得依赖 `app`；
3. `domains/fretboard/model` 不得依赖 `chord` / `score`（纯几何物理模型零业务依赖）；
4. `domains/fretboard` 不得依赖 `score`；
5. `domains/chord` 不得依赖 `score`；
6. `platform/utils` 不得依赖 `platform` 的 `ui` / `store` / `services`。

⚠️ **不要把上面概括成「领域之间互不横向依赖」**：③④⑤ 只给「纯几何模型」与「乐谱领域」设限。 `chord ↔ fretboard`
**双向都在约束之外、均为合法边**——chord 走 fretboard 的几何底座（`model/coordinates`、`model/fretboardGeometry`、`components/FretboardCanvas.vue`
等），fretboard 呈现层用 chord 的乐理与类型（`theory/theory`、`types`）。照「互不横向依赖」去推断，会把这两条合法边当成违规来"修"。

跨领域副作用（联动、回填引用等）不走直接反向导入，而是**领域事件 + 应用层桥接** （`app/services/chordScoreBridge`）或
**provide/inject 能力注入**实现。详见 `ARCHITECTURE.md`。

### 代码风格与模板规范

- TypeScript 严格模式（`strict` + `noUncheckedIndexedAccess`），禁止 `any`
- 组件统一使用 `<script setup lang="ts">` 组合式 API
- **模板空白节点**：构建配置中通过 `nodeTransforms` 彻底剔除了标签间的纯空白与换行文本节点。请勿依赖
  `<span>A</span> <span>B</span>` 之间的源码空格来产生视觉间距，所有行内/块级元素间距一律由 CSS `gap-*` 或 `margin`
  精确控制
- 样式优先使用设计系统 token（`tokens.scss` 中的 SCSS 变量与 Tailwind 语义类）
- 提交信息：`<type>: <主题>，<主题>…`（多主题用全角逗号分隔，单行不折行）+ 空行 + 每条一个改动的扁平要点列表（`- <主题>：<是什么>`）。**只写「改了什么」，不写「怎么实现的」**—— 根因、机制与取舍记在
  `changelog/` 下的片段与代码注释里，不搬进提交信息。不写 markdown 标题、不写 scope。

## 测试

- 领域层（乐理/和弦引擎）与数据层必须有单元测试
- 新增**带内部状态或交互逻辑**的组件应附组件测试；纯透传 Props 的基础 UI 组件（Icon / Badge / FormRow / Input /
  SegmentedControl 等）与无状态展示包装层属**免测区**，不写单测（口径见 `rules/06-test-quality-and-self-check.md`
  的「一」第 3 条「测试价值准入原则」）
- 真实浏览器（Chromium）用例已有基建：devDependencies 里有 `playwright` 与 `@vitest/browser`，用例在
  `tests/browser/**`，由 `pnpm test:browser` 驱动；CI 以「Install Playwright browser → Browser
  tests」两步单独跑（不并进单元测试那步，免得「克隆下来直接 verify」先下载 300MB
  Chromium）。依赖真实布局尺寸或 IntersectionObserver 的判定（滚动条显隐、边缘渐隐、虚拟滚动定位）应补在这里 ——
  jsdom 下拿不到真值

## 提交 Pull Request

1. Fork 本仓库并创建特性分支
2. 提交小而有意义的改动（尽量一个 PR 一件事）
3. 在 PR 描述中说明改动动机与影响范围
4. 确保 CI 全部通过
