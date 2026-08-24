# Contributing to Fret-Logic

感谢你愿意为 Fret-Logic 贡献代码！以下是参与项目的指南。

## 开发环境

- **Node.js** ≥ 20
- **pnpm** ≥ 9

```bash
pnpm install
pnpm dev          # 本地开发（http://localhost:5173）
```

## 常用命令

| 命令             | 说明                      |
| ---------------- | ------------------------- |
| `pnpm dev`       | 启动开发服务器            |
| `pnpm build`     | 生产构建                  |
| `pnpm typecheck` | 类型检查（vue-tsc）       |
| `pnpm lint`      | ESLint 检查（含架构约束） |
| `pnpm test`      | 单元测试（Vitest）        |
| `pnpm test:e2e`  | E2E 测试（Playwright）    |
| `pnpm coverage`  | 测试覆盖率                |
| `pnpm format`    | Prettier 格式化           |

## 提交前检查

提交代码前请确保本地通过全部质量门禁：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

CI（GitHub Actions）也会执行同样的检查，失败将阻止合并。

## 架构约定

### 目录结构

```
src/
  components/   # 可复用 Vue 组件（.vue）
  views/        # 页面级视图与弹窗
  composables/  # Vue 组合式函数（use*）
  services/     # 服务层：sync providers、repositories、领域逻辑、errors、storage、data bootstrap
  stores/       # Pinia stores
  router/       # 路由
  directives/   # 指令（vTooltip）
  assets/       # 静态资源与样式
  types/        # 全局类型
  utils/        # 通用工具与全局常量（constants.ts）
```

### 目录约定

代码按「它是什么」归类，而非按业务特性归类：

- 新增**组合式函数** → `src/composables/`（命名 `useXxx.ts`）。
- 新增**服务 / provider / 仓储 / 领域逻辑** → `src/services/` 下对应子目录（如 `services/sync`、`services/music`）。
- 新增**复用组件** → `src/components/`；新增**页面视图** → `src/views/`。
- 新增 **store** → `src/stores/`；新增**常量** → `src/utils/constants.ts`；新增**类型 / 工具** →
  `src/types`、`src/utils`。

跨层依赖方向为单向：`views/components → composables → stores/services → utils`。底层不反向依赖视图或组合式函数。

```

### 代码风格

- TypeScript 严格模式（`strict` + `noUncheckedIndexedAccess`），禁止 `any`
- 组件使用 `<script setup lang="ts">` 组合式 API
- 样式优先使用设计系统 token（`tokens.module.less` 中的 CSS 变量）
- 提交信息遵循 Conventional Commits 风格（`feat:` / `fix:` / `refactor:` / `chore:` 等）

## 测试

- 领域层（乐理/和弦引擎）与数据层必须有单元测试
- 新增基础组件应附组件测试
- 修改主流程后建议补充 Playwright E2E 冒烟用例

## 提交 Pull Request

1. Fork 本仓库并创建特性分支
2. 提交小而有意义的改动（尽量一个 PR 一件事）
3. 在 PR 描述中说明改动动机与影响范围
4. 确保 CI 全部通过
```
