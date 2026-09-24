### 更新 · 空态组件升级为通用反馈组件 `Feedback`（2026-09-09）

- **`EmptyState` → `Feedback`**：原空态组件升级为全项目通用的反馈组件，在保留既有空态能力（`empty` / `404` / `network` /
  `search` 预设、图标 / 图片 / 标题 / 描述 / 操作按钮、sm / md / lg 三档尺寸、虚线 `bordered`
  边框）基础上，新增两类状态预设：
  - **`loading` 加载态**：自动渲染旋转图标（`animate-spin`）+ 默认「加载中...」文案，可覆盖 `description`；
  - **`error` 错误态**：危险色强调图标 + 默认「请求失败，请重试」文案，配合 `action-text` + `@action` 可渲染重试按钮；
- **全项目替换**：12 处 `EmptyState` 引用统一重命名为 `Feedback`（导入路径与标签同步），并删除旧 `EmptyState.vue`；
- **乐谱预览收敛**：乐谱「预览」首帧「正在生成预览...」加载态与「渲染失败 + 重试」错误态由裸 markup 改为 `Feedback` 的
  `loading` / `error` 预设。

### 更新 · 乐谱预览下载下拉新增「分页 PDF」（2026-09-09）

- **新增分页 PDF 导出**：在预览下载下拉（长图 / 分页 Zip）基础上增加「下载为分页 PDF」；经 Worker 离屏渲染为 A4 分页图片后，手写一个零依赖极简 PDF 图像容器（`platform/utils/pdf.ts`），把各页 JPEG 以
  `/DCTDecode` 原样字节嵌入（不二次编码）、铺满对应 MediaBox，尺寸由所选页型（A4/A5/Letter，96dpi px → 72dpi pt）换算；
- **零依赖控体积**：`pdf-lib`
  仅用于「JPEG 装箱」这一窄用途，整体约 700KB 偏重，故改为约百行自研生成器，剔除该依赖；PDF 下载同样懒加载（不进首屏）。另补充字节级单元测试（校验 xref 偏移 / 流长度 /
  `/Kids` 页序），用于防止逐字节结构回归；
- **沿用预览排版**：与长图 / Zip 一致，沿用页脚、页尺寸、页边距等设置，页脚开关同样生效。

### 更新 · 乐谱预览下载改为 Hover 下拉（长图 / 分页 Zip）（2026-09-09）

- **下载按钮收敛为下拉菜单**：乐谱「预览」tab 原「下载整曲长图」按钮改为
  `BaseMenu`（Hover 触发）下拉，提供「下载为长图」「下载为分页 Zip」两个选项；「复制整曲长图」按钮保留；
- **新增分页 Zip 导出**：经 Worker 离屏渲染为 A4 分页图片后打包为 zip（条目命名
  `<曲名>_第N页.jpg`），各页已是 JPEG，Zip 内以 store 归档避免二次压缩；依赖引入
  `fflate`。两种下载均沿用预览的页脚/尺寸/边距等排版设置；
- **行为边界**：无歌词或导出进行中时下拉禁用，zip 仅分页（A4）模式产出，长图仍走 `normal` 模式单图。

### 新增 · 预览页脚页码开关（2026-09-09）

- **可选的页脚页码**：A4 分页预览/导出在每页底部页边距内水平居中绘制「第 X 页」，可通过乐谱设置「版面 → 显示页脚」开关控制显隐；关闭后页脚不渲染；
- **配置链路与缓存**：新增 `scoreShowFooter` 偏好（跟随偏好备份同步），worker 透传 `showFooter`，预览缓存键拼接 `ft`
  标记，切换开关即时重渲染且不复用旧页。

### 修复 · Header 设置弹窗关闭后滚动位置丢失（2026-09-08）

- **会话级滚动记忆**：设置弹窗以 `v-if` 销毁/重建面板容器，重新打开后浏览器默认回到顶部；现按乐谱 / 工作台两路由维度记忆
  `scrollTop`，容器重建后立即恢复，关闭并重开弹窗仍停留上次滚动位置，不再「闪回顶部」。滚动位置与会话级折叠展开组一致，作为会话内记忆（切换路由或刷新后重置）；
- **关闭动画期间的滚动位置保持**：排查确认关闭动画仅为 transform 缩放、不重排布局，但浏览器仍可能在关闭瞬间把滚动容器
  `scrollTop` 静默钳回 0 且未必派发 scroll 事件，导致内容「闪回顶部再消失」。现以 `MutationObserver` 监听面板 `-leave-`
  过渡类（在动画首帧之前触发），进入离场即启动 `requestAnimationFrame` 循环，每一帧把 `scrollTop`
  重贴回记忆值，离场结束即停止；同时离场阶段不再把浏览器的「钳 0 假滚动」写入会话值，避免污染重开位置。

### 重构 · 按钮菜单与右键菜单合并为统一 `BaseMenu`（2026-09-08）

- **三组件收敛为一件**：`PopoverMenu.vue`（按钮下拉）与 `ContextMenu.vue`（右键菜单）共享同一「BasePopover +
  MenuItems 列表 + onSelect」骨架，现合并为 `platform/ui/menu/BaseMenu`，触发器完全由业务层通过 `#trigger` /
  default 插槽自定义，不再内置固定触发按钮；两旧组件删除、全部消费者迁移；
- **三态统一**：`trigger` 支持 `hover` / `click` / `contextmenu`
  三种触发，统一启用「菜单组互斥关闭（开新关旧）」、「↑↓ 循环导航 + Tab 关闭」与「打开自动聚焦首项」；右键仍支持
  `openMenuAt(x, y)` 跨元素定位（乐谱预览单页右键菜单用）；
- **可见行为变化**：右键上下文菜单面板头部标题（乐谱预览单页菜单的 `pageMenuTitle`）首次实际渲染；菜单选中统一尊重
  `keepOpen` 语义。

### 重构 · 菜单组件语义拆分：`MenuItems`（纯列表）与 `MenuSubmenu`（级联子菜单）（2026-09-08）

- **新语义拆出 `platform/ui/menu/`**：原 `ContextMenuItems` 职责混杂（既渲染普通项又内嵌级联子菜单），且被 `ContextMenu`
  与 `PopoverMenu` 共用、语义割裂。现收敛为三件套——`MenuItem`（`menu/types.ts`，纯数据模型）、
  `MenuItems`（纯列表骨架：标题/分割线/普通项渲染，仅负责收集键盘导航焦点）、`MenuSubmenu`（独立的级联子菜单触发项）；
  `MenuItems` 遇到含 `children` 的项按 `expandChildren ?? children?.length` 委托给 `MenuSubmenu`，`ContextMenu` /
  `PopoverMenu` 各自组合这两件基础件，消除「组件名带 Context 却被 PopoverMenu 复用」的语义歧义；
- **行为不变**：普通项/勾选/颜色/危险色/快捷键/分割线、级联展开判定、键盘上下导航与首项聚焦、子菜单浮层样式均沿用原实现，仅常量
  `MENU_SUBMENU_OFFSET_DISTANCE`（4px）与行样式 `menuRowStyle.ts`（`menuRowSizeClass` / `getItemStyle`）抽为共享工具。
