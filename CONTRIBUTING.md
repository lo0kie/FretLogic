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
  app/          # 应用壳（main、AppShell、路由）
  core/         # 跨特性基础设施（tokens、基础组件、composables、errors、storage）
  features/     # 业务特性（chords/songs/score/fretboard/audio/export/sync）
  domain/       # 领域逻辑（乐理、和弦引擎、校验）
  data/         # 数据访问层
  ui/           # 视图组件与 composables
  utils/        # 通用工具
```

### Feature 隔离

**feature 之间不允许直接 import 对方内部文件**，只能通过对方 `index.ts` 的公共出口互访。此约束由 ESLint 规则
`import/no-restricted-paths` 强制执行。

新增 feature 时应遵循：

```text
src/features/<name>/
  components/   # 组件
  stores/       # Pinia store
  services/     # 服务层（数据读写）
  types/        # 类型
  composables/  # 组合式函数
  index.ts      # 公共出口
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
