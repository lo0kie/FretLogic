---
alwaysApply: true
---

> 本文件是《AGENTS.md》准则正文的一部分｜第一部分 架构稳定契约｜收录 一、稳定保护区。总纲、优先级与强制预读要求见项目根
> `AGENTS.md`。

## 🛡️ 一、稳定保护区（Protected Zones）

以下模块已通过高强度单测与解耦验证，非专门指令一律视为**只读保护区**：

- `src/platform/`：通用基础设施底座已彻底解耦，严禁重新引入上层 Pinia Store 或业务领域依赖。
- `src/domains/chord/theory/`：纯乐理与算法内核已完备，严禁为审美目的微调理论函数。
- `src/domains/fretboard/model/`：纯几何物理模型（弦品坐标/横按/指纹签名），严禁引入任何和弦或乐谱业务依赖。
- `tests/`：核心算法、数据安全与复杂手势指令的测试是系统安全的锚点；但严禁编写“1=1”同义反复测试或写死字面量的易碎测试（详见
  `06-test-quality-and-self-check.md` 的「一、防垃圾测试与测试质量红线」）。

> ⚠️ **保护范围与 zone 规则不是一一对应**，两者是不同口径，不要互相推导：
>
> - `src/platform/` 与 `src/domains/fretboard/model/`
>   有**部分**重叠的 zone（① 与 ③），但 zone 只管「依赖方向」，保护区还管「不得为审美微调实现」——依赖方向合规不等于允许改；
> - `src/domains/chord/theory/` 与 `tests/` **没有任何 zone 规则**，它们的约束只来自本节；
> - 反向也不成立：zone ④（fretboard ↛ score）、⑤（chord ↛ score）、⑥（platform/utils ↛
>   platform 上层）在保护清单里没有对应条目，它们是纯依赖隔离规则，不构成「只读保护区」。
>
> 任何试图放宽保护区的改动，必须同步修改对应的 eslint 规则，并在回复中显式声明"本次改动放宽了 XX 保护区，原因是 XX"——严禁在不触碰 eslint 配置的前提下于代码中悄悄突破保护区边界（例如绕过校验直接跨层 import）。
>
> ⚠️ **作用域限定**：上述 zone 规则的 `files` 只匹配 **`src/**`**，即"单向依赖"是对**运行时源码**的要求。
> `scripts/`、`worker/`、`tests/`、`vite.config.ts`、`eslint.config.mjs` 属**构建与测试工装**，允许自由 import `src/`
> 内层（校验脚本、打包配置、测试夹具本来就必须触达内部实现）——这不是"官方洞"，而是刻意的边界：工装不参与运行时依赖图。**不要**为了"补齐隔离"给这些路径也加上 zone 规则。
