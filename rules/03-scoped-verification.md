---
alwaysApply: true
---

> 本文件是《AGENTS.md》准则正文的一部分｜第一部分 架构稳定契约｜收录 一、交付与验收底线（1.1 验证范围分级、1.2 提交前必须绿灯的完整命令）。总纲、优先级与强制预读要求见项目根
> `AGENTS.md`。

## 🚦 一、交付与验收底线（Acceptance Gate）

### 1.1 验证范围分级（Scoped Verification）

验证成本必须与任务规模匹配，禁止小改动触发全量检查：

- **单文件/小功能改动**（改动 ≤3 个文件，且不涉及类型定义、共享 store、跨模块接口）：
  - **lint 有文件级形态**：`pnpm eslint <改动文件路径>`（可加 `--max-warnings 0` 与缓存）；
  - **typecheck 在本项目没有文件级形态，不要硬造**：给 `vue-tsc` / `tsc` 传单个文件路径会**绕过 `tsconfig.json`**
    —— 路径别名（`@/...`）与全部严格开关一起失效，报出来的错与真实构建无关（别名会被当成找不到的模块、`strict`
    系列全部关闭），属于假绿或假红。**正确的降级是"跳过该项"**，并在回复中说明"类型检查未验证"；需要类型结论时按下方「触发全量检查的场景」处理。
  - 只跑与改动模块直接相关的测试文件（如 `pnpm vitest run <对应 test 文件>`），禁止为一个小改动触发 `pnpm test`
    全量套件。
- **触发全量检查的场景**（必须跑下方第 1~3 条完整命令）：
  - 改动涉及 `types.ts`、跨层接口（InjectionKey、事件契约）、Pinia store 的 state/action 签名；
  - 改动触及 `02-protected-zones.md` 的「一、稳定保护区」所列**保护区**；
  - 改动文件数超过 5 个，或改动波及多个 domain；
  - 用户明确要求"跑一下完整检查"，或该次改动即将提交/合并。
- **提交前的最终关卡**：无论开发过程中用的是文件级检查还是全量检查，**正式提交前**
  必须完整跑通下方第 1~3 条命令一次（不可用文件级检查代替），以防局部通过掩盖了跨文件的类型/依赖破坏。

> ⚠️ **唯一的例外，且只针对 WorkBuddy 类 Agent**：本环境的执行通道会在全量验证过程中**永久卡死进程**
> （无法自行恢复），因此 WorkBuddy Agent 在上述所有"必须跑全量"的场景下**一律不代跑，只提示用户自行执行**；见
> `08-workbuddy-verification-ban.md`。其他 Agent 环境不存在该问题，本节原文照常适用。

> 本节是全项目统一的验证分级标准，`05-small-task-and-temp-files.md`
> 的「二、小任务纪律」中的验证要求与本节保持一致，不重复定义。

### 1.2 提交前必须绿灯的完整命令

> ⚠️ **WorkBuddy 类 Agent 不得代跑本节命令**（本环境的执行通道会在全量验证中永久卡死进程）——见
> `08-workbuddy-verification-ban.md`。其他 Agent 环境不受限。WorkBuddy
> Agent 的职责是在改动完成后提示用户自行跑本节关卡。

**完整关卡是 `pnpm verify`**（`scripts/verify.mjs`，串行 8 步，挂在 pre-push 上）：
`format:check → changelog:check → lint → typecheck → typecheck:tests → test → build → build:budget`。CI（`.github/workflows/ci.yml`）跑同一组关卡，只是少了
`changelog:check`、多了信息性的 `pnpm bench`。

下面列出其中三条最关键命令的通过标准 ——
**不要**把它们当成完整关卡：只跑这三条会漏掉 tests 侧类型、产物构建与体积预算，属于「本地绿、CI 红」。

1. `pnpm typecheck`：0 错误（`vue-tsc` 严格校验）
2. `pnpm lint`：0 错误 0 警告（ESLint 依赖架构隔离规则：`import/no-restricted-paths` 六条严格 zone 已实装，target 全部
   `**`
   覆盖子目录——platform↛domains/app、domains↛app、fretboard/model↛chord/score、fretboard↛score、chord↛score、platform/utils↛platform 上层）
3. `pnpm test`：100% 通过（全量 Vitest 测试套件）。**不统计覆盖率**：覆盖率门槛会反向催生「为凑数而写」的用例，2026-09-25 已把整条覆盖率关卡拿掉（`test:coverage`
   脚本与分层阈值一并删除）。
4. 格式化统一由 `node scripts/prettier-format.mjs` 处理，严禁破坏已固化的属性无值优先格式。 `.github/CHANGELOG.md`
   是**派生文件**，已列入 `.prettierignore`（prettier 完全不碰它）；`changelog/*.md` 是手写源码、仍归 prettier 管，靠
   `.prettierrc` 里那条 `proseWrap: "preserve"` 覆盖免于重排 ——该覆盖**不要删**：折行一旦交给 prettier（全局是
   `always`、120 列）重排，就会出现「内容没变、diff 上千行」的老问题。
5. 提交前必须过一遍 `changelog/`：本次变更若包含**用户可感知的改动**，须写进 `changelog/` 下的 **当前工作区片段**
   —— 即上次提交之后创建、尚未提交的那个片段（工作区里没有才新建），文件名
   `<YYYY-MM-DD-HHMM>-<ascii-kebab-slug>.md`（用当前时间取名；slug 只是短标识符，不写整句，口径见
   `scripts/build-changelog.mjs` 文件头），正文即 Keep a Changelog 风格的 `### <类型> · <主题>（<日期>）`
   小节。片段**以工作区为界分「已提交区」（冻结、只读）与「未提交区」（可塑、工作区内的改动一律并进同一个片段）两区**，**细则见
   `04-changelog-fragment-zones.md`**。重新生成汇总这一步**不必单独记**：`.husky/pre-commit` 会在提交前自动跑
   `node scripts/build-changelog.mjs` 并把 `.github/CHANGELOG.md`
   纳入本次提交，片段命名不合规会被生成器拦下。该文件是派生文件，**禁止手改**，`pnpm changelog:check`
   会门禁这一点（已纳入 `pnpm verify` 第 2 步）。判定标准：
   - **需要记录**：diff 涉及 `src/domains/`、`src/app/` 或 `src/platform/ui|store|services`
     下的行为变化（新功能、交互变化、Bug 修复、破坏性迁移）。
   - **可跳过**：纯配置/文档/格式化改动，以及 `platform/utils`
     内部实现细节调整、类型标注、注释补充等不影响用户可感知行为的改动。
6. 提交信息风格：`<type>: <主题>，<主题>…` + 空行 +
   **每条一个改动的扁平要点列表**（`- <主题>：<是什么>`，全角冒号）。硬约束：**只写「改了什么」，不写「怎么实现的」**—— 不解释根因、机制、取舍、踩过的坑，那些属于
   `changelog/`
   与代码注释。主题行约 3 个主题、单行不折行；要点数随改动规模、单条一句话不展开；不写 markdown 标题、不写 scope、不写
   `Signed-off-by`。参考既有提交：短版 `34305bc` / `a48db37`，中版 `e3d79dc`。
