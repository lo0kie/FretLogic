---
alwaysApply: true
---

> 本文件是《AGENTS.md》准则正文的一部分｜第二部分 防循环行为规范｜收录 一、WorkBuddy 环境全量验证绝对禁令。总纲、优先级与强制预读要求见项目根
> `AGENTS.md`。

## 🚫 一、WorkBuddy 环境全量验证绝对禁令（Full-Verification Ban — WorkBuddy Only）

> **适用范围：仅 WorkBuddy 类 Agent（本环境）。**
> 原因：**只有本环境的执行通道会在全量验证过程中永久卡死进程**——进程挂死后无法自行恢复，只能人工终止。其他 Agent 环境不存在该问题，因此**不受本条约束**，仍按
> `03-scoped-verification.md` 的「1.1 / 1.2」原文执行全量检查。
>
> 本条由用户直接下达，对 WorkBuddy
> Agent 而言优先级高于本文件其他全部条款，任何情况下不得例外，不接受任务级覆盖，也不因"改动很大""马上要提交""只是想确认没破坏"而放宽。

1. **WorkBuddy Agent 永远不得运行全项目级验证命令**，包括但不限于：`pnpm test`、
   `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm build` / `pnpm build:analyze` /
   `pnpm build:budget`、`pnpm verify`、`pnpm bench`，以及任何以 `.` 或仓库根为作用域的等效写法。
2. **只允许文件级 / 最小作用域校验**：例如 `pnpm eslint <改动文件…>`、
   `pnpm exec prettier --experimental-cli --check <改动文件…>`、
   `pnpm vitest run <与改动直接相关的 test 文件…>`。**若某项没有文件级形态，就跳过该项**，在回复中如实说明"该项未验证"，**不得为了补上这一项而升级成全量命令**。
3. **提交前的全量关卡（`03-scoped-verification.md` 的「1.2」第 1~3 条）对本环境改为纯人工步骤**：WorkBuddy
   Agent 一律不代跑，只能提示用户「本次改动已具备提交条件，请自行跑一次完整关卡」。
4. **判据是命令的作用域，不是它跑得多快。** 典型违反症状：把"文件级检查"做成"带 `--incremental`
   的全量命令"、把"提交前跑一次"做成"现在就跑一次"、把"改动文件多"当成可以升级全量的理由。
5. **需要全量结论时**（例如怀疑存在跨文件类型破坏或历史遗留失败），只向用户说明 "需要你跑一次全量才能确认"，并给出具体要跑的命令与要看的失败项，**不得代为执行**。
