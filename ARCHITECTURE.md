# Architecture

FretLogic uses a flat, responsibility-oriented source layout under `src/`. Each top-level folder groups code by what it
is, not by which business feature it belongs to.

```
src/
  components/   # 可复用 Vue 组件（Fretboard、BaseModal、按钮等 .vue）
  views/        # 页面级视图（TopHeader、ScoreView、SidebarLeft、WorkbenchView、各 Modal）
  composables/  # Vue 组合式函数（use*），串联 store / 视图状态 / 服务
  services/     # 非 UI 逻辑层：领域逻辑、仓储、存储、错误、云同步 provider
  stores/       # Pinia stores（编排用户意图与派生视图状态）
  router/       # 路由定义与滚动记忆
  directives/   # 指令（vTooltip）
  assets/       # 静态资源与全局样式
  types/        # 全局类型
  utils/        # 通用工具函数与全局常量（constants.ts）
  App.vue       # 应用根组件
  main.ts       # 应用入口（引导数据层、挂载、路由/指令注册）
```

## Components & Views

- `components/` 存放可复用组件；`views/` 存放由 `router/` 直接挂载的页面级组件与弹窗。
- 组件/视图不得包含业务逻辑；它们通过 `composables/` 与 `stores/` 获取能力与状态。

## Composables (`src/composables`)

所有 `use*` 组合式函数。它们把 stores、UI 状态与服务粘合在一起，但自身不含业务规则（乐理、持久化、校验）。

## Services (`src/services`)

非 UI 的逻辑层，包含：

- 领域逻辑：`services/music`（乐理、和弦引擎）、`services/validation`（payload 校验与清洗）。
- 数据访问：`services/repositories`（localStorage 仓储）、`services/data`（IndexedDB 数据层引导与迁移）、
  `services/storage`（IndexedDB 封装）。
- 结构化错误：`services/errors`（`SyncError` 等）。
- 云同步 provider：`services/sync`。

该层不导入 Vue SFC 或视图组件。

### Sync providers (`src/services/sync`)

云同步被抽象为 `SyncProvider` 接口（`pull` / `push` /
`exists`），UI 与 stores 永远不直接接触传输细节。每个后端实现同一契约：

- **GitHub**（`githubSyncProvider`）— 调用 Contents API；并额外暴露可选的 `listBranches`
  能力（`SyncBranchesProvider`），调用处用 `'listBranches' in provider` 守卫。
- **WebDAV**（`webdavSyncProvider`）— GET/PUT 原始 JSON；在 `PUT` 前用 `MKCOL`
  自动创建父集合（避免父目录不存在时的 409）；支持可选的
  **CORS 代理**（`${proxyUrl}?url=<target>`）以绕过服务器未发送 CORS 头时的浏览器跨域限制。

所有 provider 都会抛出结构化的 `SyncError`，其 `code` 取值为 `CORS` / `TIMEOUT` / `NETWORK` / `REQUEST_FAILED` /
`FILE_NOT_FOUND` / `INVALID_CLOUD_DATA`，以便 `useSyncService` 将失败映射为用户可读的提示，而非泄露原始 `fetch` 错误。

## Stores (`src/stores`)

Pinia stores 编排用户意图与派生视图状态，不实现乐理或持久化规则。

## Data flow

1. 启动期仓储读取原始存储。
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
