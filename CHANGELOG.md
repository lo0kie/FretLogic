# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 重构（2026-08-27 · 目录结构重组 / 抽象层清理 / 同步基础设施）

合并本轮工作区全部未推送改动：对通用抽象层做大幅重组与瘦身，并按领域拆分目录结构。

**组件目录重组（移动，非删除）**

- `src/components/Base*` 通用组件整体移至 `src/components/base/`；右键菜单 `ContextMenu` / `ContextMenuItems` 移至 `context-menu/`；指板相关 `Fretboard` / `FretboardSvg` / `FretboardNote` / `ChordNameDisplay` 移至 `fretboard/`；新增各层 `index.ts` 桶文件统一导出；
- 删除 `AppShell.vue`，三栏布局收拢至 `App.vue`（详见下方更早条目）。

**组合式函数与路由重组**

- `composables` 按领域拆分到 `composables/{app,fretboard,score}`，`score` 下新增 `lyrics-drag/` 拖拽子模块；真实删除的仅 `useGridNavigation`（由 `vGridNav` 指令取代）、`useFocusReturn`、旧的 `useLyricsDragDrop`（重写为 `composables/score/useLyricsDragDrop.ts`）；
- `router` 由 `src/router/index.ts` 扁平化为 `src/router.ts`，并删除 `src/router/scrollMemory.ts`；导航改为状态/单视图驱动。

**工具函数按领域重组**

- `src/utils/*` 按领域拆分到 `src/utils/core`（通用）、`src/utils/music`（和弦指板/乐理）、`src/utils/score`，并新增 `utils/index.ts` 桶文件；文件实为移动/重命名，未做内容裁撤。

**新增指令与同步基础设施**

- 新增 `vScrollCache` 指令（`src/directives/vScrollCache.ts`）用于滚动位置缓存；
- 新增同步抽象层 `services/sync/registry.ts` 与 `services/sync/syncBase.ts`，统一 `SyncProvider` 注册与基础行为；
- 新增 `.gitattributes` 规范仓库文本/二进制属性；
- vite 开发端口由 3000 调整为 5173，规避 Windows Hyper-V/Winnat 保留端口段（2977–3076）导致的 `EACCES`。

**测试对齐**

- 将因模块移动而失效的 7 个测试（`coreRegression` / `sanitizePersistedData` / `domain/models` / `bootstrapRobustness` / `BaseBadge` / `BaseFormRow` / `BaseSwitch`）的 import 重定向至新路径；
- `ChordSlotCell` 测试断言对齐重构后的 Tailwind 结构；`BaseSwitch` / `BaseBadge` 组件测试改用 `role` / `aria-*` / 根元素标签 / 内联样式等稳定断言（原语义 class 已改为 Tailwind 工具类）；
- 全量 113 项测试通过。

### 组件 API 完善（2026-08-27 · ActionButton 健壮性增强）

针对 `src/components/base/ActionButton.vue` 的 API 完善与健壮性增强：

- **新增 `type` 属性**：`'button' | 'submit' | 'reset'`，默认 `'button'`，避免原生 `<button>` 在表单内意外提交；
- **主题统一为 `color` 枚举**：`color?: 'default' | 'primary' | 'danger' | 'warning' | 'success'`（设计系统暂无 `info` 令牌，故未纳入）；保留 `primary` / `danger` / `warning` 布尔作为语法糖，显式 `color` 优先级更高，消除多布尔同时传入的覆盖隐患；
- **`variant` 合并 `text`**：移除冗余的 `texted` 布尔，将 `'text'` 并入 `variant: 'default' | 'subtle' | 'ghost' | 'text'`；
- **A11y 增强**：`loading` 时输出 `aria-busy="true"`；新增 `ariaLabel` 属性，`iconOnly` 且缺省时开发期告警提示补充无障碍标签；
- **点击拦截**：`handleInternalClick` 增加 `disabled || loading` 守卫（`preventDefault` 并提前返回），防止禁用/加载态下样式覆盖或特殊事件触发导致误冒泡；
- **Icon-Only 加载占位尺寸一致**：`loading` 时 Loader 尺寸随 `size`（`sm/md/lg` → `w-3.5/h-3.5` / `w-4/h-4` / `w-5/h-5`）统一，避免与默认插槽图标尺寸不一致产生跳动。

### 重构与交互优化（2026-08 · 指令化改造 / 交互与体验完善 / 工程化校验）

合并全部未推送提交与工作区改动为单条干净的重构提交，并据此补齐文档。

**网格键盘导航指令化与类型增强**

- 弃用 `useGridNavigation` 组合式函数，重构为全局 `vGridNav` 指令（`v-grid-nav`）：
  - 支持数字列数 `v-grid-nav="3"`、对象配置 `v-grid-nav="{ cols: 5, selector: '.item' }"`、修饰符 `.stop` / `.loop`；
  - 针对非规则/Flex/网格换行布局，基于视觉几何坐标（`getBoundingClientRect`）动态计算上下行最近可聚焦节点；
  - 在 `src/vite-env.d.ts` 扩充 `GlobalDirectives` 与 `ComponentCustomDirectives`，通过 `TypedDirective` 深度解决 VS
    Code / Volar 智能提示与修饰符（Modifiers）自动补全；
  - 迁移 6 个关键视图组件并新增指令单元测试 `tests/ui/vGridNav.test.ts`。

**应用壳与模板编译**

- 移除 `AppShell.vue`，三栏（header / left-sidebar / main）语义布局直接收拢至 `App.vue`；
- Vite 模板编译开启 `whitespace: 'condense'` 并清理标签间纯空格/换行文本节点，排版交由 CSS gap / margin 精确接管。

**组件 Props 默认写法现代化**

- 将 `withDefaults` 全面升级为 Vue 3.5+ 原生 `defineProps` 解构默认值；
- 针对必须透传完整 props 对象的指板核心组件保留特定类型写法。

**交互与细节 Bug 修复**

- **Modal 出场动画与快照导出修复**：补齐 `BaseModal` 离场关键帧过渡动画；工作台快照导出增加响应式 ref 与 DOM
  querySelector 双保险，解决目标节点未渲染完成问题；
- **和弦输入超长溢出与剪切 Placeholder 丢失**：限制最大长度 16，字体自适应缩放；解决 contenteditable 全选剪切后 DOM 残留
  `<br>` 导致 placeholder 消失问题；非编辑态保持标准预设字号；
- **行首拖拽插入点纠正**：修复和弦拖动至行首添加按钮时插入到右侧的问题，准确插入到 `index = 0` 最左侧，并新增对应单测。

**Tailwind CSS v4 全局迁移与设计令牌集成**

- 引入 `@tailwindcss/vite` 与 `tailwindcss`（v4）现代原子化 CSS 架构；
- 新建 `src/assets/tailwind.css`，在 `@theme` 块中完整映射现有 `tokens.scss`
  的 CSS 变量（涵盖颜色、间距阶梯、圆角档位、字号体系、阴影、缓动曲线与层级系统）；
- 采用模块化按需引入（`theme.css` +
  `utilities.css`），剔除侵入式 Preflight 全局重置，完美保障既有组件（按钮、输入框、SVG 渲染、弹窗）的像素级精度；
- **全工程 100% 视图与通用组件 Tailwind 原子化重构与 SCSS 瘦身清理**：
  - 彻底清理全仓所有 Vue 组件中与 Tailwind 双写重复的静态布局 SCSS（flex, grid, padding, width, gap,
    border 等），仅保留复杂过渡 Keyframes、FLIP 动画、深层状态伪类及特殊 Mixin；
  - 覆盖范围涵盖：应用壳（`App`）、顶栏（`TopHeader` / `HeaderConfigPopover` /
    `SyncModalContainer`）、左侧栏（`SidebarLeft` / `ChordCard` / `GroupSection` / `SongSection` /
    `GroupContent`）、工作台（`WorkbenchView` / `WorkbenchCard` / `WorkbenchFloatingBar` / `ChordAnalysisPanel` /
    `ChordAnalysisContent`）、乐谱视图（`ScoreView` / `ScoreInteractiveArea` / `ChordSlotCell` / `ScoreLyricsEditor` /
    `ScoreExportFloatingBar` / `ScoreExportPreviewModal` / `ChordPickerModal`）、弹窗系统（`BaseModal` /
    `GroupModalsContainer` / `ChordModalsContainer` / `SongModalsContainer`）、右键菜单（`ContextMenu` /
    `ContextMenuItems`）、基础表单与交互组件（`ActionButton` / `BaseBadge` / `BaseInput` / `BaseNumberInput` /
    `BaseFloatingBar` / `BaseFormRow` / `BaseMarquee` / `BasePagination` / `BasePopover` / `BaseSegmentedControl` /
    `BaseSelector` / `BaseSlider` / `BaseSwitch` / `ChordNameDisplay` / `EmptyState` / `Fretboard` / `FretboardNote` /
    `FretboardSvg` / `GlobalToast`）；
- 对基础通用组件的尺寸类进行了 BEM 命名空间隔离（`btn-size-*`、`input-size-*`、`badge-size-*`
  等），彻底杜绝与 Tailwind 内置 `size-*` 简写工具类的样式冲突；
- 深度审查并修复了基础组件的属性组合边界（如 `loading` + `iconOnly` 图标冲突、`closable` + `hoverClose`
  互斥保护、`showCount` + `maxlength` 初始空态占位防抖、`step` 浮点数步进精度等）；
- 收尾清理：将残留组件 scoped 样式中对 Tailwind `@apply` 的引用替换为等价的 CSS 变量（`var(--tint-*)` / `var(--text-*)`
  / `var(--color-*)` 等），消除 scoped 样式对工具类的隐式运行时依赖（`BaseSelector` / `ChordCard` /
  `ChordAnalysisContent`）；
- `ChordAnalysisContent` 根音行补充 hover 加深底色，强化当前行视觉反馈。

**工程化与代码质量防护**

- **Husky 推送前全量校验**：配置 `.husky/pre-push` 执行 `pnpm verify`，在 `git push`
  前自动运行 ESLint 规范、vue-tsc 类型检查、Vitest 全量 115 个单元测试与 Vite 生产构建 4 重防护；
- 升级 `@floating-ui/vue` 至 2.0.1，保持现代前端依赖对齐。

### 重构（2026-08 · 组件抽取与交互归一化）

一次性合并自上一批重构以来的全部未推送提交，并补齐工作区收尾改动，形成一条干净的重构提交。

**基础组件与交互**

- 右键菜单组件化：新增 `ContextMenu` / `ContextMenuItems` 替代旧
  `GlobalContextMenu`，卡片与谱面行统一接入；TopHeader 主题菜单复用
- 基础组件重构：`BasePopover` / `BaseSelector` 基于 floating-ui 重写并补齐无障碍角色；新增
  `BaseSwitch`、`ChordNameDisplay`、`BaseMarquee`、`BaseFormRow`
- 指板交互重写：`Fretboard` / `FretboardSvg` / `useFretboardInteraction` 右键直达动作与命中逻辑调整
- ChordPicker 重写：`ChordPickerModal` 重构；修复“已绑定”判定未带分组条件，同指纹跨组和弦被误判为选中

**样式体系：LESS → SCSS**

- 设计令牌迁移至 `src/assets/tokens.scss`，由 vite `additionalData` 全局注入 `@use "@/assets/tokens" as *`
- 组件样式统一迁移 `<style lang="scss">`；移除 `less` 依赖，引入
  `sass-embedded`（modern-compiler）；vitest 同步接入 SCSS 预处理器

**新指令**

- `vFocus`：声明式自动聚焦，支持 `.select` / `.delay` 修饰符与配置对象
- `vWheelScroll`：滚轮横向滚动，支持速度 / 反向 / 平滑

**修复与优化**

- `BaseInput`：输入聚焦时 ESC 不再被 `@keydown.stop` 拦截，可正常关闭弹窗
- `ChordPickerModal`：滚动高亮改为 rAF 节流 + 分区元素缓存，减少强制重排；预计算
  `chordMeta`，避免模板重复计算指纹与和弦名；移除懒加载列表上的 `v-auto-animate` FLIP 测量开销
- 移除 `js-base64`，改用原生 `btoa` / `atob` + `TextEncoder` / `TextDecoder`（`base64EncodeUtf8` /
  `base64DecodeUtf8`），保持 UTF-8 安全

**构建 / PWA**

- vite 产物文件名改为纯哈希
- TopHeader 适配 `window-controls-overlay`，标题栏可拖拽并避让系统控制按钮

**质量保障**

- 新增测试：`tests/domain/chordSearch.test.ts`，`tests/ui/BaseBadge`、`BaseFormRow`、`vFocus`、`vWheelScroll`、`vTooltip`、`BaseSwitch`、`chordSegments`
  等

### 新增（2026-08）

**云同步扩展**

- 同步层抽象为 `SyncProvider` 接口，新增 WebDAV 同步支持（`webdavSyncProvider`）
- 统一错误模型 `SyncError`，按错误码分类（`CORS` / `TIMEOUT` / `NETWORK` / `REQUEST_FAILED` / `FILE_NOT_FOUND` /
  `INVALID_CLOUD_DATA`），为用户提供可操作的错误提示
- WebDAV 支持可选 **CORS 代理**：浏览器直连多数 WebDAV 服务器受跨域限制，配置代理后请求经 `${proxyUrl}?url=<目标>`
  转发绕开限制
- WebDAV 上传前自动用 `MKCOL` 逐级创建父目录，解决父集合不存在的 409 冲突
- 新增开发期 CORS 转发代理脚本
  `scripts/dev-webdav-proxy.mjs`（`npm run dev:proxy`），便于本地直连坚果云等无 CORS 的服务器

**界面**

- 同步设置面板合并为单一 `SyncModalContainer`，支持 GitHub / WebDAV 双后端切换与分支获取

### 重构（2026-08）

一次性合并自 0.x 以来的全部未推送提交，并补齐工作区收尾改动，形成一条干净的重构提交。

**架构与工程化**

- 建立 `domain / data / ui` 三层架构，抽取音乐理论、和弦引擎、数据校验、持久化与 GitHub 同步边界
- 平台化应用架构：统一启动、导入与云端数据清洗迁移，修复和弦识别与构建依赖
- feature-first 模块化目录、严格 TypeScript、ESLint 架构约束与 `scripts` 统一脚本
- 补齐开源工程化：架构文档、贡献指南、安全策略、行为准则、许可证、Issue 模板、CI 与部署流水线

**数据层**

- 持久化迁移到 IndexedDB（v2 契约），歌曲与和弦全部经由 Repository，消除 store 双写与孤儿清理越界
- 支持旧 localStorage 数据一次性迁移导入，显式错误处理替换 `any` 与非空断言

**界面与交互**

- 新增三主题系统（light / dark / high-contrast），支持跟随系统
- 新增统一基础组件库（AppButton / AppSwitch / AppInput / AppSelect / AppModal / AppToast 等）
- 新增应用壳（AppShell 三栏布局）与统一错误体系、日志设施、通用撤销历史 `useHistory`
- 优化界面层次与交互反馈，统一颜色为实色、保留玻璃面板与柔和阴影

**质量保障**

- 建立四层测试（领域 / 数据 / 组件 / E2E），新增 Vitest 回归与 Playwright 冒烟用例
- 通过格式、测试、类型、gzip 体积预算与生产构建验证

## [0.x] - 历史版本

见 Git 提交历史。
