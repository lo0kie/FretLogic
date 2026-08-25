# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 重构（2026-08 · 组件抽取与交互归一化）

一次性合并自上一批重构以来的全部未推送提交，并补齐工作区收尾改动，形成一条干净的重构提交。

**基础组件与交互**

- 右键菜单组件化：新增 `ContextMenu` / `ContextMenuItems` 替代旧 `GlobalContextMenu`，卡片与谱面行统一接入；TopHeader 主题菜单复用
- 基础组件重构：`BasePopover` / `BaseSelector` 基于 floating-ui 重写并补齐无障碍角色；新增 `BaseSwitch`、`ChordNameDisplay`、`BaseMarquee`、`BaseFormRow`
- 指板交互重写：`Fretboard` / `FretboardSvg` / `useFretboardInteraction` 右键直达动作与命中逻辑调整
- ChordPicker 重写：`ChordPickerModal` 重构；修复“已绑定”判定未带分组条件，同指纹跨组和弦被误判为选中

**样式体系：LESS → SCSS**

- 设计令牌迁移至 `src/assets/tokens.scss`，由 vite `additionalData` 全局注入 `@use "@/assets/tokens" as *`
- 组件样式统一迁移 `<style lang="scss">`；移除 `less` 依赖，引入 `sass-embedded`（modern-compiler）；vitest 同步接入 SCSS 预处理器

**新指令**

- `vFocus`：声明式自动聚焦，支持 `.select` / `.delay` 修饰符与配置对象
- `vWheelScroll`：滚轮横向滚动，支持速度 / 反向 / 平滑

**修复与优化**

- `BaseInput`：输入聚焦时 ESC 不再被 `@keydown.stop` 拦截，可正常关闭弹窗
- `ChordPickerModal`：滚动高亮改为 rAF 节流 + 分区元素缓存，减少强制重排；预计算 `chordMeta`，避免模板重复计算指纹与和弦名；移除懒加载列表上的 `v-auto-animate` FLIP 测量开销
- 移除 `js-base64`，改用原生 `btoa` / `atob` + `TextEncoder` / `TextDecoder`（`base64EncodeUtf8` / `base64DecodeUtf8`），保持 UTF-8 安全

**构建 / PWA**

- vite 产物文件名改为纯哈希
- TopHeader 适配 `window-controls-overlay`，标题栏可拖拽并避让系统控制按钮

**质量保障**

- 新增测试：`tests/domain/chordSearch.test.ts`，`tests/ui/BaseBadge`、`BaseFormRow`、`vFocus`、`vWheelScroll`、`vTooltip`、`BaseSwitch`、`chordSegments` 等

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
