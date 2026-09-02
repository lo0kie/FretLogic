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
  app/          # 壳层：App.vue / router / 布局骨架 / 全局模态框
  assets/       # 样式与设计令牌（tokens.scss / transitions.scss）
  components/   # 通用 UI 组件（ui/）与指板组件族（fretboard/）
  features/     # 按业务域纵切（chord-library / song-library / score-editor / workbench）
  services/     # 领域服务层：sync providers、repositories、领域算法、数据清洗
  stores/       # Pinia stores
  directives/   # 全局指令（vTooltip、vChordName 等）
  types/        # 全局类型定义
  utils/        # 通用工具、常量（constants.ts）、乐理/乐谱纯函数
  shared/       # 跨业务域共享组合式函数（shared/composables）
```

### 代码风格与模板规范

- TypeScript 严格模式（`strict` + `noUncheckedIndexedAccess`），禁止 `any`
- 组件统一使用 `<script setup lang="ts">` 组合式 API
- **模板空白节点**：构建配置中通过 `nodeTransforms` 彻底剔除了标签间的纯空白与换行文本节点。请勿依赖
  `<span>A</span> <span>B</span>` 之间的源码空格来产生视觉间距，所有行内/块级元素间距一律由 CSS `gap-*` 或 `margin`
  精确控制
- 样式优先使用设计系统 token（`tokens.scss` 中的 SCSS 变量与 Tailwind 语义类）
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

```
