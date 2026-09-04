# Architecture

FretLogic 采用**垂直领域（Domain-First）**源码布局：业务概念所需的 UI、状态、算法与数据模型就近放置，跨领域底层能力收拢于平台层。目录按「业务归属」而非「技术类型」组织。

## 顶层结构

```text
src/
  app/            # 应用装配外壳：路由、顶层布局（TopHeader/SidebarLeft）、全局弹窗、
                  # 跨领域编排服务（backup/sync/data/audio）与领域事件桥接（chordScoreBridge）
  domains/        # 纵向业务领域（各自通过领域根 index.ts 显式导出公共 API）
    fretboard/    # 指板引擎：物理几何模型（model/）、交互（composables/）、乐器呈现（components/）
    chord/        # 和弦乐理与和弦库：theory（乐理内核）、store、library、workbench、transfer、directives
    score/        # 乐谱排版：editor、library、preview、model、transfer
  platform/       # 平台基础设施底座：ui 原语、store 基座、directives、utils、services（clipboard/storage/errors）
  assets/         # 静态资源与全局样式
  App.vue         # 应用根组件
  main.ts         # 应用入口（引导数据层、挂载、路由/指令注册）
```

## 依赖方向（单向，由 ESLint 强制）

```text
app  →  domains  →  platform
```

跨层与跨领域的方向约束由 `eslint.config.mjs` 的 `import/no-restricted-paths` 强制（target 均带
`**`，覆盖全部子目录，含 type-only 导入）：

| Zone                             | 禁止依赖                                 |
| -------------------------------- | ---------------------------------------- |
| `src/platform/**`                | 任何 `domains/**`、`app/**`              |
| `src/domains/**`                 | `app/**`（领域不得反向依赖应用外壳）     |
| `src/domains/fretboard/model/**` | `chord/**`、`score/**`（纯几何物理模型） |
| `src/domains/fretboard/**`       | `score/**`（呈现层允许依赖 chord 领域）  |
| `src/domains/chord/**`           | `score/**`（通用乐理层不依赖乐谱排版）   |
| `src/platform/utils/**`          | platform 内 `ui/store/services`          |

跨领域副作用通过两类机制解耦，领域之间不直接反向导入：

- **领域事件 + 应用层桥接**：chordStore 对外广播 `onChordsRemoved` / `onChordsRestored`，由
  `app/services/chordScoreBridge` 订阅并调用乐谱域 songStore 完成槽位解绑与撤销回填；
- **provide/inject 能力注入**：UI 级跨域能力（如和弦卡「引用反查」）由注入键（`domains/chord/library/injectionKeys`）声明契约，应用层（SidebarLeft）提供实现，跨领域弹窗由应用层承载（`app/modals/ChordReferencesModal`）。

## Application shell (`src/app`)

- `layouts/`：TopHeader、SidebarLeft 等顶层布局；侧边栏在此装配各领域容器并 provide 模态控制器。
- `modals/`：全局弹窗容器，包括跨领域特性弹窗（如和弦引用反查 `ChordReferencesModal`）。
- `services/`：应用级编排——`backup/`（导入导出）、`sync/`（云同步 provider）、`data/`（引导与迁移）、
  `audio/`（播放与合成）、`chordScoreBridge`（跨域事件桥）。

## Domains

每个领域内聚「类型 + 算法/模型 + store + 组件」，公共 API 由领域根 `index.ts` 显式导出。

### fretboard（指板引擎）

- `model/`：纯物理几何（弦品坐标、横按、指法指纹签名），仅依赖平台工具；
- `components/`：乐器呈现层（FretboardSvg / FretboardCanvas / 离屏渲染 `renderFretboardCanvas`），可依赖 chord 领域；
- `constants.ts`：指板几何与离屏渲染主题的单一来源（`FRETBOARD_CANVAS_CONFIG`，score 导出配置引用之）。

### chord（和弦乐理）

- `theory/`：乐理内核（和弦引擎、文法、指纹、实体工厂、和弦名分词），纯函数、高密度单测；
- `transfer/`：和弦文字编解码（`chordTextCodec`）与复制/粘贴能力（`useChordTransfer`）；
- `store/`：chordStore（含删除/恢复领域事件）、chordEditorStore；
- `library/`、`workbench/`、`directives/`：和弦库 UI、工作台面板、和弦名指令。

### score（乐谱排版）

- `model/`：谱面模型、槽位、songRepository；
- `editor/`、`library/`、`preview/`：编辑器、歌曲列表、预览与导出（含 Worker 离屏渲染）；
- `transfer/`：乐谱文字编解码（复用 chord 域字段编解码器，并转发和弦 API 保持兼容）。

## Platform (`src/platform`)

与业务无关的底座：UI 原语（BaseModal / BaseInput / ContextMenu / Toast 等）、Pinia 基座（uiStore / settingsStore /
useModalController）、指令（vTooltip / vFocus / vWheelScroll 等）、纯工具（`utils/`：cloneDeep / uuid / base64
/ 全局常量 / Canvas 与下载工具）与服务（clipboard / storage / errors）。该层严禁导入任何领域或应用代码。

### Sync providers (`src/app/services/sync`)

云同步被抽象为 `SyncProvider` 接口（`pull` / `push` /
`exists`），UI 与 stores 永远不直接接触传输细节。每个后端实现同一契约：

- **GitHub**（`githubSyncProvider`）— 调用 Contents API；并额外暴露可选的 `listBranches`
  能力（`SyncBranchesProvider`），调用处用 `'listBranches' in provider` 守卫。
- **Gitee**（`giteeSyncProvider`）— 与 GitHub 同构。
- **WebDAV**（`webdavSyncProvider`）— GET/PUT 原始 JSON；在 `PUT` 前用 `MKCOL`
  自动创建父集合（避免父目录不存在时的 409）；支持可选的
  **CORS 代理**（`${proxyUrl}?url=<target>`）以绕过服务器未发送 CORS 头时的浏览器跨域限制。
- **Server**（`serverSyncProvider`）— 自建线上接口。

所有 provider 都会抛出结构化的 `SyncError`，其 `code` 取值为 `CORS` / `TIMEOUT` / `NETWORK` / `REQUEST_FAILED` /
`FILE_NOT_FOUND` / `INVALID_CLOUD_DATA`，以便 `useSyncService` 将失败映射为用户可读的提示，而非泄露原始 `fetch` 错误。

## Data flow

1. 启动期由 app 层 bootstrap 读取 IndexedDB / localStorage 原始存储。
2. 领域校验清洗、迁移、去重并修剪引用。
3. Stores 接收规范化状态并派生展示模型。
4. 变更在仓储持久化前必须经过校验。
5. 云端拉取与导入路径走同一套校验边界。

## Quality gates

Every change must pass:

```bash
pnpm verify
```

This runs formatting, unit tests, type checks, bundle budgets, and production dependency audit.

## Performance rules

- Keep export, audio, and PDF dependencies out of the initial execution path.
- Preserve route-level code splitting.
- Do not add synchronous work over large song or chord lists on the main thread.
- Respect `scripts/check-bundle.mjs` budgets: 220 KB approximate initial JavaScript gzip and 160 KB per chunk gzip.
