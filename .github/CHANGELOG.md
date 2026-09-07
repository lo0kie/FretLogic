# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增 · 乐谱预览「歌词字重」设置（2026-09-07）

- **歌词字重开关**：Header 设置弹窗乐谱栏新增「歌词字重」分段选择（细 / 常规 / 粗，默认常规），仅作用于预览与导出图片的歌词文字；随偏好备份同步并持久化；
- **渲染能力扩展**：预览导出 Worker 新增 `lyricsFontWeight` 选项（light 300 / regular 400 / bold
  700），预览缓存 key 同步纳入字重，切换即时重绘；
- **整曲长图导出一致性**：预览 tab「复制/下载整曲长图」导出路径同步透传字重与「显示横按」设置，与预览渲染一致。

### 新增 · 乐谱「显示横按」开关与持久化下沉（2026-09-07）

- **乐谱「显示横按」开关**：Header 设置弹窗乐谱栏新增「显示横按」切换（默认开启），关闭后排列和弦单元格与预览/导出图上的指板仅保留按弦圆点、隐藏横按梁；该开关为排列和弦与预览共用同一设置并持久化、随偏好备份同步；
- **预览/导出渲染能力扩展**：指板 Canvas 渲染器 `RenderFretboardOptions` 与预览导出 Worker 均新增 `showBarre`
  选项，关闭横按时两处渲染路径一致省略横按梁；
- **持久化归属修正**：预览缩放、工作台导出背景、同步弹窗提供商等几处原散落在业务组件内的 `useStorage` 持久化统一下沉到
  `settingsStore` / `uiStore`，组件只消费 store 状态（用户可感知行为不变，仅存储归属收敛）。

### 通用 UI：滚动渐隐 mask 化、指令完整化与平台组件能力补全及修复（2026-09-07）

#### 新增能力

- **乐谱歌词复制与导入**：编辑 tab 新增「复制歌词」「粘贴到编辑器」——只复制纯歌词、把剪贴板纯文本覆盖进当前歌词编辑器（不解析和弦、不新建乐谱、不动和弦库）；
- **整曲长图导出入口升级**：预览 tab 的复制/下载整曲长图由独立菜单收敛为工具栏主按钮直接分派；
- **符号简写开关迁移**：Header 设置弹窗新增「符号简写 (M/°/+)」切换（由工作台设置面板迁入，仍仅工作台生效）；
- **v-scrollbar 自注入滚动轴**：指令自行注入所需轴向 `overflow:auto` 并隐藏原生滚动条，调用方无需再手写
  `overflow-*`/`no-scrollbar` 类；补齐 `minThumbSize/autoHide/trackClick` 动态更新时的重建；
- **角标叠加模式正则化**：BaseBadge 提供 `#target` 时递归复用徽标本体渲染，`closable/hoverClose/interactive`
  与 Enter/Space 键盘激活在叠加/独立模式下行为一致；
- **Toast 交互增强**：action 按钮 pending 禁用以防空发；容器鼠标悬停/焦点进入时暂停自动销毁计时；
- **滚动渐隐改 mask 方案**：新增共享 `fadeMask.ts` 与
  `floatingPositions.ts`，滚动边缘由背景色 overlay 改为 mask-image 羽化，任意玻璃态下无色带。

#### 交互与外观

- **指板画布配色调整**：品丝/网格线改柔和灰、新增更深琴枕色
  `--fb-nut`；零品加粗带加高（12→14px）并完整覆盖零品线，消除琴枕态/偏移态切换时的双色拼缝；
- **分段控件高分屏校准**：滑块指示器改 `left/top`
  布局 + 分数级测量，修复 Windows 非整数缩放比下半像素错位，缩放动画期间暂停指示器过渡消抖；
- **v-scrollbar 间距加宽**：`endInset` 2→4、`edgeOffset` 3→4；
- **角标红点分级**：dot 直径随 `size` 档位成套分级（不再用 `!important` 覆盖），纯红点补默认无障碍标签「有更新」；
- **预览缩放步长收紧**：`ScorePreviewPane` 缩放滑杆 100→5，可更细粒度。
- **预览缩放滑块化**：预览缩放控制由数字步进器改为可拖拽百分比滑块（保留 % 读数），拖动调整更直观；缩放设置统一为百分制。
- **预览缩放偏好持久化**：预览「自适应满高」开关与自定义缩放百分比跨会话保留，切歌不再强制回归自适应。

#### 修复

- **v-scrollbar 内存泄漏**：移除子元素时补做 `ResizeObserver.unobserve`；
- **下拉复用错位**：BaseSelector 可过滤下拉改用原始 options 下标作稳 key、多选默认值改集合语义比较（`['a','b']` 与
  `['b','a']` 不再误判偏离默认）、面板内 Tab 焦点归还触发器；
- **区间滑块**：BaseSlider 防两拇指交叉互换身份、非正数 `step` 兜底避免按钮/键盘静默失效；
- **歌词截断**：BaseEditableText 超长截断改按 code point（`Array.from`），修复 emoji 代理对被劈开的乱码；
- **开关**：BaseSwitch `beforeChange` 拒绝/抛错后滑块自动回弹而非停在拖拽中间态，键盘与点击统一由原生 button
  click 收敛；
- **弹窗**：BaseModal `beforeClose` 异步拦截期间防重入并改 `nextTick`
  入栈避免错序；BasePopover 嵌套下 Escape 只关最上层、focusout 到浏览器栏/iframe 也正确关闭、右键不再污染左键拖拽守卫；
- **Toast action 失败**：不再默默移除原通知，改为保留可重试 + 弹出错误提示；
- **角标 hoverClose**：一次点击不再同时派发 `close` 与 `click` 两种语义；
- **EmptyState**：`description` 显式空串时不再误挡本应显示的 `#title`/`#default` 插槽；
- **ActionButton**：长按期间被外部置 disabled/loading 即中止（新增
  `abortHold`），text 紧凑内边距由动态拼串改字面量类名修复样式失效；
- **和弦选择器**：从选择器跳转工作台创建/编辑前强制展开左侧栏。

#### 体验 · 和弦选择弹窗响应式网格与布局优化（2026-09-07）

- **和弦选择弹窗响应式网格**：`ChordPickerModal` 由固定 5 列升级为 `grid-cols-2` ~ `grid-cols-5`
  响应式网格与小屏操作栏自适应折行，键盘网格导航列数动态同步；
- **顶层视口宽度修复**：根容器使用 `w-full` 代替 `w-screen`，避免 Windows 环境下纵向滚动条计算引发的横向溢出。

### 增强 · Toast 新增中性常驻类型与转圈开关（2026-09-07）

- `ToastType` 新增 `neutral`（常驻中性提示）：与 `LOADING`
  一样不自动销毁，但无转圈图标，专用于交互引导等「过程进行中但非后台任务」的场景；对应新增
  `uiStore.toast.neutral(msg, options)` 快捷方法；
- `toast.loading` 新增 `spinner: false` 选项：`LOADING` 型可关闭转圈退化为中性静态图标（默认为转圈，现有调用不受影响）；
- 顺带修正两处更贴合的替换：乐谱整曲导出「正在渲染」由 `info`（自动销毁、超时可能消失）改为常驻 `loading`
  并在完成后移除；排列和弦拖拽的「分区规则」提示由 `loading`（转圈误导成加载中）改为 `neutral`（常驻中性）。

### 增强 · 预览更新反馈与滚动触发原因（2026-09-07）

- 乐谱预览「后台重新渲染中」提示由右上角悬浮胶囊改为**常驻 LOADING 型 Toast**（`预览更新中…`）：仅在实际渲染（已有页面）时弹出、渲染结束自动移除，首次构建仍由内容区居中加载框承担；不打断阅读、反馈更醒目；
- `v-scrollbar` 的 `onScroll` 回调新增 `interactive` 字段：通过宿主 `pointerdown` / `wheel`
  用户手势埋点判定「本次滚动是否由用户交互发起」，区分用户滚动手势与布局钳位 / 程序化设位（如调整字号、内容增删、`scrollTo`）触发，消费端可据此过滤非用户滚动信号；判定窗口由新常量
  `SCROLL_INTERACTIVE_WINDOW_MS` 集中管理。

### 架构治理 · Phase 2：平台多行文本域下沉（2026-09-06 · BaseTextarea 补齐）

- 新增 `BaseTextarea` 多行文本域组件：与 `BaseInput` 对齐的 v-model / 占位符 / 聚焦失焦 / 输入法合成文本补提交；内置
  `show-count` 实时字数统计（有 `maxlength` 时显示 `x/max` 并在达上限高亮）、玻璃态 / 常规态两种变体、非法态
  `aria-invalid` 与边框焦点环；`ScoreLyricsEditor` 歌词编辑改用该组件，移除手写 `<textarea>`
  与手拼字数统计绝对定位节点；
- （本期 BaseScrollArea 滚动边缘渐隐统一化经评估 **整体放缓**：`useScrollEdgeFades` 四处用法为非同构样板，尤以
  `BaseSelector` 携带下拉专属 `maxHeight` / `role` / `@keydown`
  语义不拟合共享容器，统一化收益低且回归风险高，留待独立评审后再议）

### 状态持久化收敛：URL 为选中态唯一数据源（2026-09-07）

- `scoreEditorStore.activeSongId` / `activeTab` 与 `chordStore.selectedGroupId` / `expandedGroupId` 由 `useStorage`
  落盘改为普通内存 `ref`：选中态不再双写，统一由 URL query（`?id=` `?tab=`
  `?group=`）作为唯一数据源（可分享 / 可后退 / 刷新可恢复）；
- 为保留「裸访问入口恢复上次」体验，引入两个轻量冷启动指针 `LAST_SONG_ID` /
  `LAST_GROUP_ID`：仅在 URL 完全无地址时，route-sync 首次同步以 `replace`
  把指针写入 URL（仍走 URL 数据源），随后本会话内不再回灌，避免用户主动取消选择后被回灌复活；
- 修复无路由环境（组件单测）下 `useScoreRouteSync` setup 期同步回灌访问 `route.path` 抛错：`syncRouteToStore` 先判
  `hasRouter` 再读 `route`，与其既有的「无路由降级为空操作」设计对齐；
- 强化「URL 是唯一数据源」反向一致性：**手动删除地址栏选中参数（score 的 `?id=` / workbench 的
  `?group=`）后，页面会同步回到未选中空态**，不再停留原地；workbench 在存在未保存指板草稿时仍以草稿分组优先接管；
- 行为变化：直接打开
  `/score`、`/workbench`（无 query）将恢复「最近查看」的乐谱 / 分组；主动取消选中后刷新不再被强制复活到上次项；手动删参或后退到无参地址 → 回到未选中。视图偏好（字号 / 指板比例 / 排序 / 面板折叠）与用户数据本体、未保存指板草稿仍按原样持久化。

### Bug Fix · 切页丢 URL / 刷新丢未保存编辑（2026-09-07）

- 修复「切换乐谱与工作台时 URL 选中参数偶发丢失」：路由切换为无 query 的
  `push`（`/workbench`、`/score`），会清空地址栏。两处 route-sync 增设「重新进入本页」识别：KeepAlive 中段切页回来时，以内存选中为权威把
  `?id=` / `?tab=` / `?group=` / `?chord=`
  回灌回 URL（冷启动绝不覆盖深链参数），令「URL=状态」在页面切换间延续，不再因缺参命中清空分支而误丢选中态；
- 修复「刷新后和弦名 input 显示空白（但导出图片里名字正确）」：`BaseEditableText` 用 `immediate`
  watcher 回填内容，但该阶段在 setup 时执行、`editorRef` 尚未挂载，`setText`
  是空操作；刷新后草稿名在挂载时就已就绪、`modelValue` 此后不再变化，DOM 便一直是空的。改为元素挂载后再按 `modelValue`
  回填一次，保证初始即显示正确文本。草稿本身（nameSegments）始终落盘完好，导出不受影响；
- 修复「裸入口刷新后乐谱主 Tab 丢失（预览→工作台→刷新→回乐谱变成编辑歌词）」：`activeTab`
  改为纯内存态（URL 为唯一数据源）后，刷新回到裸 `/workbench` 再切回乐谱，冷启动只恢复了 `LAST_SONG`
  未恢复 Tab，导致回退到默认 `edit`。新增 `LAST_ACTIVE_TAB` 冷却指针，随 `LAST_SONG`
  一并回灌上次主 Tab（URL 仍是唯一数据源，`tab` 合法性由 Tab 同步分支兜底）；
- 修复「预览意外无法横向滚动（滚轮翻页失效）」：`ScorePreviewPane` 的超高判定 `isTallerThanViewport`
  直接比较「页面渲染高」与「可视内容高」，因 `fitPercent`
  整数化后回放高度存在约 6px 取整溢出，即便视口未超高（fit 态）也被误判为真，导致 `v-wheel-scroll`
  被禁用、横滚翻页失效。超高判定改以「页面渲染高 > 可视内容高 + 8px 容差」为准（新增
  `PREVIEW_TALL_MODE_TOLERANCE_PX`），消除取整误判；超高态行为保持原设计（禁用横滚、恢复纵向单滚轮滚动阅读超高页）。

### 架构治理 · Phase 3：平台能力沉淀（2026-09-06 · 文件选择 / 快捷键守卫 / 卡片 A11y）

- 新增 `pickFile()` 跨浏览器文件选择工具：优先走 File System Access API（`showOpenFilePicker`），不支持时降级动态
  `<input type="file">`；`SidebarLeft` 备份文件导入移除常驻隐藏 file input 与 `change` 监听，改为一次性 Promise 式调用；
- 新增 `useKeybinding` 全局快捷键守卫组合式函数：`Mod` 归一（Cmd / Ctrl）、自动忽略可编辑目标、生命周期感知的 `window`
  监听（activated / deactivated / unmount）；`ScoreView` 撤销 / 重做（`Mod+z` / `Mod+Shift+z` /
  `Mod+y`）改用该组合式函数，移除手写 `handleUndoKeydown` 与 add/removeEventListener 样板；
- 新增 `v-action-card` 指令：为「div 模拟按钮」的卡片收敛 `role="button"`、`tabindex="0"`、Enter /
  Space 转 click 并 preventDefault / stopPropagation 的整套 A11y 协议，支持 `{ disabled }`
  绑定；`ChordCard`、`SongSection`、 `ScoreInteractiveArea` 字符槽位卡片移除手写 `@keydown.enter/space` 与 `role` /
  `tabindex` 样板；
- 修复 `v-action-card`
  早期草稿中将「已消费按键」存在模块级数组中且永不清空，导致首张卡片消费 Space 后所有卡片 Space 失效的缺陷（现以捕获阶段
  `stopPropagation` 收敛传播，无需跨卡片共享状态）；

### 架构治理 · Phase 1：通用 UI 能力下沉（2026-09-06 · 指板行内编辑与试听长按下沉平台层）

- 封装 `BaseEditableText`
  行内可编辑组件：`contenteditable`、占位符（`:empty::before`）、超长截断与光标末尾维持、失焦选区回收、Enter 提交 /
  Esc 取消、失焦自动收起子文字选区等底层协议全部内聚；`Fretboard`
  指板和弦名行内编辑仅保留业务校验（合法名称/删空/非法回滚），彻底移除手写 `getSelection` / `createRange` /
  `removeAllRanges` 等 DOM 操作；
- `ActionButton` 新增 `holdable` / `hold-delay` 长按能力并配套 `hold-start` / `hold-end` 事件：内部闭环
  `holdTimer`、定时器销毁与「长按松手次生 click 吞没」协议；`TopHeader` 试听按钮改用该能力，移除自维护的 4 个指针事件与
  `suppressNextClick` 抑制标志位；

### 修复与增强（2026-09-06 · 顶部回滚按钮与滚动边沿通用化、排列和弦长乐谱秒切）

- 乐谱预览悬浮控制胶囊适屏图标语义重构：将 `ScorePreviewPane` 右下角悬浮栏中的自适应开关图标由
  `maximize-2`（易误解为全屏/窗口最大化）替换为业界标准的 `scan`（四个画幅取景角，对应 Figma/Sketch/Canva 的 Zoom to Fit
  / Fit to Screen 标准图符），消除全屏语义歧义，并补充 `title="自适应窗口高度"` 原生悬停提示；
- 侧栏和弦搜索改为下拉结果面板：`SidebarLeft` 搜索框接入 `BaseInput` 新增的 `searchable`
  能力，输入时在输入框下方弹出全库匹配的和弦卡片列表（复用 store 的多指法合并卡片，显示「N指法」与所属分组名，截取前 30条，`v-scrollbar`
  自定义滚动条），点击结果直接载入编辑器并切换/展开到该和弦所在分组、平滑滚动至分组行；正在编辑的和弦结果行以主题色高亮并带勾选标记；移除原先的分组列表就地过滤行为（匹配计数徽标、「未找到匹配的和弦」空态、搜索时禁用拖拽等），`GroupSection`
  / `GroupContent` 不再接收 `searchQuery`；
- 侧栏和弦搜索框与结果面板样式精致化与键盘导航：
  1. 移除此前搜索框内占位且突兀的字符计数器（`0/15`）与输入长度限制，切换为 `size="sm"`
     紧凑胶囊尺寸，输入框常态底色、悬停边框与焦点光晕与顶栏深度融合；
  2. 修复在输入框内点击会导致搜索浮层误关闭的缺陷（`BasePopover` 补全虚拟锚点 context-trigger 穿透判定）；
  3. 优化搜索项 hover /
     active 平滑渐变过渡，消除字体粗细突变造成的整行文字抖动；指法标注升级为精致的浅色调胶囊微徽标（`BaseBadge`），与所属分组层级分明；
  4. 搜索结果浮层接入 `v-auto-height` 动态高度指令配合 `transition-[height]`，实现输入与检索过程中面板高度顺滑伸缩过渡；
  5. 彻底修复结果项中 `j`、`g` 等带下延部（descender）字符被裁切砍脚的问题（`v-chord-name` 移除写死的
     `leading-none overflow-hidden` 并规范行内布局，和弦名与分组名补齐纵向缓冲区）；
  6. 扩展 `v-scrollbar` 指令支持 `endInset` 首尾留白内缩选项，彻底解决大圆角容器（`rounded-xl`）在 `overflow:hidden`
     下滚动条滑块端部半圆被裁切的物理缺陷；
  7. 将激活对勾图标（check）设为和弦名称的紧随后缀（`[和弦名] [✓]`），既彻底解决和弦名因前置图标导致的左侧基准参差不齐，又避免在行末破坏右侧分组名的统一右对齐，实现左右双侧边缘皆绝对垂直对齐；
  8. 补充完整的 `title`
     提示信息：为输入框补充功能说明，为搜索结果项生成结构化标题（和弦完整名 · 所属分组 · 变体数量 · 当前编辑状态），并为被截断的分组名与指法徽标添加悬停全文 tooltip；
  9. 支持全键盘上下键导航：在输入框中按 `ArrowDown` / `ArrowUp` 即可顺畅高亮浏览候选项，回车键 `Enter`
     直接确认载入，`Esc` 键退出搜索；
- `BaseInput` 新增 `searchable` 搜索下拉能力与全链路交互内聚：
  1. 聚焦或输入时经内部
     `BasePopover`（以输入框根元素为虚拟锚点、宽度对齐、bottom-start、transform-origin 顶部居中展开）弹出结果面板；
  2. 内置封装浮层外壳容器：直接集成 `v-auto-height`（动态高度顺滑过渡）、`v-scrollbar`（覆盖自绘滚动条与 `endInset: 8`
     防圆角裁切）及 `box-border p-1` 布局底座，业务插槽只需渲染具体列表项；
  3. 全链路内聚键盘导航与活跃项状态：内置 `searchActiveIndex` 状态追踪，支持输入时自动重置、鼠标移出自动复位；支持按
     `ArrowDown` / `ArrowUp` 循环导航并在越出视口时自动平滑滚入可见区（`scrollIntoView`），按回车 `Enter` 派发
     `select-search-index` 并自动关闭浮层；
  4. 业务层（如
     `SidebarLeft`）彻底告别键盘监听、高亮索引追踪与外壳容器等重复胶水代码，仅需对接数据源与项渲染；配套 expose
     `openSearch` / `closeSearch` 与 `searchActiveIndex`；
- 右键上下文菜单外区域右键时自动关闭：此前 `BasePopover`
  的外点关闭逻辑对右键（`button === 2`）直接跳过，导致菜单打开后在任意其它区域右键时菜单不关闭；现新增全局 `contextmenu`
  捕获监听，右键落在合法区域（触发元素/面板/嵌套子浮层）之外时立即关闭本浮层，且与另一处右键打开新菜单互斥不冲突；

- 排列和弦 Tab（`ScoreInteractiveArea`）胖瘦槽位样式复用与按行落点零闪烁重构：
  1. 胖瘦槽位样式统一与能力对齐：占 95% 未分配和弦的普通字符槽位使用原生 DOM 渲染（瘦槽位），已分配和弦的槽位实例化
     `<ChordSlotCell>`（胖槽位）；二者完全共享 `.char-box`、`.char-text`、`.is-drop-widened`
     等基础类名规范与设计令牌；瘦槽位补齐 `v-wave` 水波纹反馈与键盘 Enter /
     Space 唤起，彻底解决样式脱节与交互遗漏，同时保持超长乐谱切歌毫秒级响应；
  2. 彻底消除经过字符间距闪烁：在 `useDragHighlight` 中引入行级锁定的
     `activeDropLineId`，光标穿过字符之间的间隙时行状态恒定为 true，绝不出现瞬时丢失抖动；移除 `.is-drop-widened`
     中动态突变外边距的 `margin` 动画，仅保留平滑的宽度展开，字符基准对齐稳定；
  3. 按行活动落点撑开（Per-line Drop
     Widening）：彻底废除起拖时全篇 6,000 字符全量撑开导致的 33,000 次 Reflow 灾难，改为由指针实时命中的活动行（`isLineActiveDrop`）驱动当前单行（20~30 字符）展开落点与分区；非悬停行全程由
     `v-memo` 冻结，起拖/移动/收起全程 60 FPS 丝滑顺畅且行内相对位置绝对不抽动；
  4. 渐进式视口渲染（Progressive Viewport Rendering）：针对 15,000 字（300+ 行）超巨型乐谱，以 `visibleLines`
     驱动真实 DOM 渐进挂载，首屏仅挂载前 30 行（约 500 字，JS 挂载耗时 <5ms 瞬间秒开）；哨兵元素紧随当前渲染窗口末尾，滚动临近时以 30 行为步长静默追加渲染；废除此前无内容的空白占位行，彻底根治向下滚动出现大片空白的截断缺陷；悬浮按钮「滚动到底部」重构为分帧时间分片流式挂载（rAF 每帧挂载 60 行），避免单帧同步创建数万节点卡死主线程，约 100ms 内丝滑平稳滑至底部；
  5. 排列和弦 Tab 切换乐谱零闪烁与休眠隔离（Zero-Flicker & Hibernation）：此前 `ScoreInteractiveArea` 绑定了动态 key
     `:key="'interactive-area-' + scoreEditor.activeSong.id"`，在外层
     `<Transition mode="out-in" name="v-transition-fade">` 作用下，切歌时动态 key 导致 Vue 执行 `out-in`
     离场动画将旧谱面淡出至透明度 0 再淡入新谱面，引发全局白屏闪烁；现将 key 稳定化为
     `key="interactive-area"`，切歌时不触发布局 Transition，实例就地复用；并在组件内引入 `isAreaActive` 休眠激活守卫与
     `watch(activeSongId)`，当前激活时瞬间平滑重置渲染批次与滚动条位置（0ms 秒切且 0 闪烁），在其他 Tab 下切歌则完全静默休眠，杜绝后台开销；
- 乐谱编辑器撤销/重做栈（`scoreEditorStore`）记录时机修复：
  - 根因：此前 `updateLyrics`、`setSlotChord` 等写操作仅在变更前调用
    `recordHistory()`；由于激活歌曲时已将初始状态置于栈顶，首次删除行或修改和弦时比对旧状态完全一致被直接去重过滤，导致实际产生的最新状态未压入历史栈（`historyIndex`
    停留在 0，点击撤销 `historyIndex > 0` 为假），必须再做一次删除将中间态强制推入栈后撤销才见效；
  - 修复：在 `updateLyrics`、`setSlotChord`、`removeSlotChord`、`swapSlotChords` 等所有变更操作后均自动触发
    `recordHistory()` 压入最新变更状态，同时为 `activeSong`
    监听器增加同曲 ID 过滤，防止内部状态变动误清空撤销栈；首次点击行删除气泡中的「撤销」按钮即可 100% 立即恢复被删歌词行；
- 和弦选择器弹窗与乐谱排列区新增「滚动到顶部」悬浮按钮：对称于既有「滚到底部」入口，长列表置顶内容一键可达；按钮仅在容器可滚动且未贴顶边时显示；
- 滚动边沿侦测通用化：原 `useNearBottomScroll` 重构为 `useEdgeScroll`，`edges` 选项支持
  `'top' | 'bottom' | 'left' | 'right'` 任意方向组合，统一暴露各边可见态与 `scrollToX`
  平滑滚动，供任意方向上的浮动按钮/自动加载复用；
- `BaseFab` 补齐 `top` 与 `left` / `right` 定位参数（默认靠右、距边与既有 `align="end"`
  一致），支撑任意方向贴边的悬浮按钮布局；
- 近义 API 收敛（P1）：`platform/utils/validateSettings.ts` 四个 `validateXxxSettings` 收拢为
  `validateByRules(payload, rules)` 通用核心 + 四张声明式规则表，对外签名与返回类型 `ValidationResult<T>`
  保持不变；`app/services/validation/payload.ts` 的载荷校验结果类型由 `ValidationResult` 重命名为
  `PayloadValidationResult` 以消除与前者同名异形的歧义；`BackupSelection` 去重为 `app/types/payload.ts`
  单一声明源、`useImportExportService` 仅作 re-export。

### 修复与增强（2026-09-05 · 边缘渐变导出、预览调式响应与乐谱删除撤回）

- 修复乐谱预览 Tab 下切换乐谱闪现上一张旧谱的渲染竞态与闪烁缺陷：重构 `ScoreView` 与 `ScorePreviewPane`
  的渲染生命周期与响应式时序：
  1. 将 `ScorePreviewPane` 在 `ScoreView` 中的缓存键由动态乐谱 ID 规范为固定组件键（`key="score-preview"`），消除了 Vue
     3 在 `<Transition mode="out-in">` 嵌套 `<KeepAlive>`
     场景下因同一组件分支动态换 key 导致的组件出入场竞态与 DOM 残留异常；
  2. 重构 `ScorePreviewPane` 内部响应式切歌时序，将离散切歌行为（`activeSong.id`
     变化）与普通内容微调防抖彻底解耦：切歌时若命中会话级 LRU 缓存（`previewCache`）则 0ms 瞬间同步完成切图，未命中缓存时首帧立即清空旧乐谱并展示生成中占位，同时自动作废上一首歌曲未完成的导出任务，彻底消除了“过渡完成后屏幕上仍显示上一张乐谱、随后突变闪烁”的深层根因；
  3. 增强 `onActivated`
     唤醒状态守卫，比对内容哈希（`contentKey`）确保在其他 Tab 切歌后再进预览时旧乐谱绝不残留，切歌后横向翻页滚动位置自动归零；
- 乐谱表头元信息竖线居中对齐与淡色弱化：修复乐谱离屏导出引擎（Worker）中表头元信息（调号与 Capo）整行合并度量导致中央分隔竖线
  `'|'`
  偏心、无法与上方乐谱标题水平中轴对齐的问题，重构为以画布中心为基准轴严格居中绘制竖线分隔符，调号与 Capo 分别对称向两侧排布，并将竖线切换为弱化淡色（`colors.FB_LINE`）；
- 乐谱排版对齐方式可配置化（起始位置 / 居中对齐）：在顶栏配置卡片（`HeaderConfigPopover`）新增「乐谱对齐」分段控制项（`scoreLayoutAlign`），支持在经典的「起始位置」（默认贴齐页面左安全边距）与「居中对齐」（单行根据实际内容宽度在页面内严格水平居中）之间自由切换，设置项持久化落盘并同步至备份清洗链路与 A4 预览响应；小节竖线同步支持弱化淡色渲染与编辑器槽位置灰；

- `v-tooltip` 取消自动感知折行并支持字符串数组换行：移除容器 `white-space: pre-line` 自动断行行为，改为
  `white-space: nowrap` 不再自动换行；需要多行换行时支持传入字符串数组（`string[]`，如
  `v-tooltip="['第一行', '第二行']"` 或 `content: string[]`），为每项渲染独立的 `.v-tooltip-line`
  块级行，换行排版精确可控；`TopHeader` 构建信息提示已全面接入该模式；
- `useScrollEdgeFades` 升级为直接导出虚拟组件节点：新增导出 `topFade` / `bottomFade`（及 `leftFade` / `rightFade` /
  `startFade` / `endFade`），调用方在模板中只需 `<component :is="topFade" />`
  即可直接渲染，自带定位、层级、可访问性与渐变样式，消除一切模板样本代码；`SidebarLeft`、`BaseSelector`、`WorkbenchVariantsPanel`、`WorkbenchView`
  已全面切换为 `<component :is="..." />` 渲染；
- 修复乐谱关闭后再打开标签页被重置为编辑歌词的问题：移除取消选中乐谱（`activeSongId = null`）时重置 `activeTabRef`
  的冗余逻辑，`SongSection` 点选乐谱不再暴力覆盖
  `activeTab`，重新打开乐谱时平滑恢复用户关闭前所在的功能标签页（排列和弦 / 乐谱预览 / 编辑歌词）；
- API 契约与冗余入口收敛（P0 与 P1）：彻底删除冗余中转文件
  `src/platform/store/globalState.ts`，全局 8 处调用点统一收拢至 `@/platform/composables/useTheme`（直接导出
  `isDark`、`preference`、`setTheme` 等），确立单一导入入口；废弃 `src/platform/utils/validateSettings.ts` 中单独保留的
  `SettingsValidationResult` 别名，所有同步校验器统一返回规范类型 `ValidationResult<T>`；
- 分段控制组件整体禁用时抑制激活样式：`BaseSegmentedControl` 在 `disabled: true`
  时自动隐藏滑块/下划线指示器，各选项取消主色加粗高亮与选中背景色，避免禁用时依然残留突兀的激活视觉；
- 分段控制组件补齐开箱即用的图标与纯图标能力：`BaseSegmentedControl` 的 `SegmentOption` 新增 `icon?: IconName` 与
  `iconOnly?: boolean` 字段，支持组件级 `iconOnly` 与 `iconSize` 配置；配置图标时自动渲染 `BaseIcon`
  并与文字保持自适应间距；纯图标模式下自动隐藏文字并赋予 `aria-label` 与 `title`，兼顾无障碍与视觉纯净度；
- 修复复合 Lucide 图标 stroke-width 粗细控制失效的深层缺陷：修复 `BaseIcon` 中带 `<g stroke-width="2">`
  分组容器的图标（如 `layout-grid`、`music` 等）因 CSS 选择器遗漏 `g`
  标签导致继承链被截断、粗细始终锁死在 2px 的问题；`BaseSegmentedControl` 同步支持 `iconStrokeWidth`
  配置（默认 2.5 粗细，与全局其他图标对齐）；
- 顶栏左侧视觉与交互体验升级：Logo 区域升级为带有 `guitar`
  品牌微标的可交互主页入口（Hover 微动效 + 点击回工作台）；侧边栏微型分割线规范为
  `h-3.5`（14px）中心对齐，消除悬空毛刺感；`NAV_OPTIONS` 全面接入图标能力，为「和弦」与「乐谱」赋予 `layout-grid` 与
  `music` 语义图标，辨识度显著提升；
- 修复乐谱切换调式/标题/变调夹未触发预览更新：在 `ScorePreviewPane` 的 `buildContentKey` 内容哈希及 `watch`
  监听队列中补齐 `song.title`、`song.playKey`、`song.capo` 与
  `song.version`，彻底杜绝切换调式时因命中旧内容哈希导致预览画面不刷新的问题；
- 删除乐谱操作支持撤销：`songStore` 实装并导出 `restoreSong` 与 `undoDeleteSong`，`SongSection`
  右键删除乐谱由普通成功提示升级为带「撤销」操作的 Toast（4 秒停留），撤回后自动还原原列表位置并保持当前激活选中状态；

### 修复与增强（2026-09-05 · 预览零遮挡与组件解耦）

- 预览界面导出收敛与零遮挡体验：彻底移除覆盖在乐谱预览图表面的底部浮动条与点选操作，使 A4 乐谱横向翻页浏览 100% 零遮挡；导出功能清晰收敛为「顶栏导出整曲长图（复制/下载）+ 右键单页导出本页（复制/下载）」，职责明确且互不干扰；
- 浮动组件语义拆分（`BaseFab` 与 `BaseFloatingBar`）：解耦单按钮与多操作工具栏，抽取专职圆形悬浮按钮
  `BaseFab`（内建黄金比例图标与原生按钮语义），乐谱排列区与和弦选择器弹窗的「滚到底部」入口切换至 `BaseFab`；
- 修复与优化 Tooltip 悬浮定位：修复边缘元素 `v-tooltip.top`
  触发 crossAxis 翻转导致出现在底部的问题，加大默认与触发元素间距（12px）；
- 乐谱排列区拖拽槽位与无歌词行高度优化：修复拖拽和弦时无歌词行（前奏/尾奏/空白行）因无和弦撑开导致高度坍缩的问题；`.is-drop-widened`
  新增 `min-height: 108px` 协同过渡，无歌词行拖拽时保底 `min-h-[116px]`，上下两块动作落点分区保底 `min-h-[38px]` /
  `min-h-[26px]`，彻底解决落点过扁、动作分区被挤压重叠的问题。

### 修复与增强（2026-09-05 · 粘贴确认兜底与体验打磨）

- 修复多指法面板 KeepAlive 定位失效：`v-scroll-into-view` 的 `updated` 钩子不再使用挂载时闭包的旧
  `binding`，改为经可变容器读取最新绑定值，会话内动态点选最后一个后再切换页面也能正确居中定位；
- 和弦分析面板「构成音」由纵向列表改为横向自动换行的紧凑徽章排布（弦号 + 音名 + 度数圆点，根音暖色高亮），添加音符时面板高度变化更平滑；
- 乐谱粘贴导入新增「确认兜底」：含内嵌
  `[和弦]`、ChordPro 指令或标题行的文本（有可确证结构）直接导入；无任何结构信号的纯散文需用户二次确认后才按纯歌词新建乐谱，杜绝框选 UI 装饰文字被静默误导入；
- 顶栏新增 GitHub 按钮并合并构建信息：hover 显示版本与构建时间，点击跳转仓库主页。

### 新增（2026-09-05 · 和弦移动自动合并与预览体验）

- 和弦移动到其他分组时自动合并完全相同的和弦：目标分组已存在指纹与横按完全一致的指法时，移入的重复项被丢弃，乐谱槽位引用自动重定向到保留项（不产生死引用）；横按不同的同名指法不会被误合并；
- 乐谱预览页交互增强：预览图片支持点击多选（涟漪反馈 +
  hover 浮起阴影/描边），选中后浮出操作栏支持复制/下载；多选时可重新组合为单张连续长图（复用整曲长图渲染引擎，仅一个表头、无分页留白，而非暴力像素拼接）；
- 指板渲染细节：交互指板和弦名始终显示全称（不跟随简写设置）、移除自动缩字改为超长截断、修复字母降部（j/g）被裁切；capo 滚轮切换改用
  `v-wheel-scroll` 指令且仅在指板区域生效；
- 测试套件清理：删除 30~50 个固化业务易变细节的脆弱用例（写死面板顺序数组、基础 UI
  CSS 类名断言等），改为常量引用与契约式断言；示例备份数据更新至 v6 格式（`fretOffset` 字段）。

### 新增（2026-09-05 · 工作台多指法面板与指板渲染打磨）

- 工作台侧栏新增「多指法」面板：展示当前和弦的所有指法变体，支持 `v-wheel-scroll`
  横向滚轮滚动浏览与点击即时切换编辑草稿；面板稳定排列在第 2 位（和弦分析下方）；卡片定高定宽及标记恒定占位，彻底消除切换时的内容抖动；暂无变体时以提示文案友好展示；
- 乐谱粘贴导入优化：导入乐谱时若存在未入库的新和弦，自动创建的和弦分组直接使用乐谱标题命名，不再追加时间戳后缀；同名分组已存在时自动复用，保持和弦库分组干净整洁；
- ESLint 规范增强：实装 `vue/v-bind-style` 规则与 `sameNameShorthand: 'always'`，强制 Vue 3.4+ 模板同名属性简写（`:foo`
  代替 `:foo="foo"`，`:attr-name` 代替 `:attr-name="attrName"`），彻底杜绝冗余绑定；
- 平台新增 `v-scroll-into-view` 通用指令：支持 `.x`/`.y` 方向限定与 `.once` 首屏挂载限定；`.x` 仅在横向滚动容器内触发
  `scrollTo` 绝不冒泡影响外层竖向视口；多指法面板使用 `v-scroll-into-view.x.center`、和弦库与乐谱列表采用
  `v-scroll-into-view.y.once`，彻底杜绝切换和弦时列表抢占与竖向滚动跳动；
- 指板 Canvas 渲染优化：未显示和弦名时始终保留顶部 `GRID_PAD`
  呼吸边距，零品到空弦距离恒定（预留粗弦枕间距避免品位切换跳动），修复升降号上标偏移符号（`-5` 向上）；`nutBold`
  统一正名为 `showBoldNut`；
- 响应式状态与手势参数瘦身：`useFretboardLayout` 与 `useFretboardKeyboard` 升级支持 `MaybeRefOrGetter`，彻底移除
  `useFretboardInteraction` 内部 8 个冗余的假 `ref`/`computed` 包装，直接参数化访问 `props.chord`；`BaseSwitch`
  拖拽手势瞬时变量收敛为局部普通变量，消除无意义的全局响应式管道追踪开销；
- 平台响应式合并：`useTheme` 与 `useScrollEdgeFades` 统一为单 `watchEffect` 清洗驱动；
- 单测套件质量重构：删除 14 个同义反复的纯属性透传与硬编码字面量脆弱测试（BaseIcon、BaseBadge、BaseInput 等基础 UI 单测），严格确立「基础原子 UI 免测，仅测试带手势/层叠调度等复杂内部状态组件」的准入红线。

### 重构（2026-09-05 · 全工程垂直领域化拆分与四步领域解耦闭环）

- 源码布局纵切为四层：`app`（应用装配外壳）/ `domains`（chord、score、fretboard 三领域，各自经领域根 `index.ts`
  导出公共 API）/ `platform`（基础设施底座），业务概念所需的 UI、状态、算法就近放置；
- ESLint 实装六条 `import/no-restricted-paths` 严格 zone（target 全带 `**`
  覆盖子目录），依赖方向 machine-checkable：platform↛上层、domains↛app、fretboard/model↛业务、chord↛score 等；
- 切断 chord → score 反向依赖：和弦删除/撤销的乐谱槽位解绑改为 `chordStore` 事件广播 + 应用层 `chordScoreBridge`
  桥接；和弦文字编解码下沉 `chord/transfer`；「和弦引用」弹窗迁至应用层（`ChordReferencesModal` + 注入式引用反查）；
- 指板导出几何常量收敛至 `FRETBOARD_CANVAS_CONFIG` 单一来源，乐谱导出配色与之共享；`renderFretboardCanvas` 移出纯几何
  `model/` 保护区；
- 工程收敛：Playwright E2E 整体下线（单测足够），vitest 配置并入 `vite.config.ts`，社区文档归档
  `.github/`，新增 Agent 临时文件与小任务纪律约束。

### 新增（2026-09-05 · 和弦/乐谱文字复制粘贴跨实例流转）

- 新增跨实例文字传递：和弦（`FLCHORD`）与乐谱（`FLSONG`）序列化为自包含指法数据的纯文本，应用实例间精确往返；解析宽容分类（魔数/版本/类型/字段）并按原因分流 toast；Windows 剪贴板 CRLF 换行归一化；
- 工作台粘贴和弦自动载入编辑器「新建」态；乐谱导入自动建组归集未入库和弦（名字+指纹精确复用）；
- 剪贴板能力扩展：支持文字与图片双通道，复制乐谱为整曲长图与文字互不干扰；
- `ActionButton` 图标/文案属性化收敛（新增 `label`，slot 优先），`compacted` 模式图标文字间距收紧一档；
- 活动项自动定位：乐谱列表与工作台侧栏自动滚动到当前激活项（不在视口才滚，`nearest`
  行为）；指板卡片并入工作台；ContextMenu 级联子菜单支持（`expandChildren`）。

### 更新（2026-09-04 · 指板重构与和弦选择器跟随分组排序）

- 指板重构：交互指板与弦数模型解耦，和弦选择器跟随当前分组排序规则展示；
- 工作台面板排序落盘（重启保持自定义顺序）；
- 下线 Gitee Pages 部署（保留 GitHub Pages 单一部署目标）。

### 更新（2026-09-04 · 和弦把位偏移正名与多弦支持）

- 和弦实体以 `fretOffset`（0~12）取代 `capo` 表达把位偏移，历史数据在导入边界自动迁移；乐谱实体保留物理变调夹 `capo`
  用于调号推导与排版；
- 多弦（变弦数）支持和弦创建与播放，全曲移调与试听联动；
- 同步凭据安全收敛（配置不再混入数据推送）；导出排版精修（图片边距对称、和弦名不被截断）。

### 重构（2026-09-04 · 收敛 UI 原语与数据同步层）

- 统一图标/浮层/弹窗原语：Popover z-index 单例分配器（回收式递增 + 软上限），Tooltip 复用同源分配并保证盖在浮层之上；
- 类型对齐实体（Type、IconButton 等）收敛，清理死代码（无引用过渡类、A4 旧导出常量、死样式类）。

### 更新（2026-09-03 · 指板导出迁移 canvas 渲染）

- 指板图导出从 SVG 迁移 Canvas 离屏渲染，工作台面板组件抽取，多处交互打磨。

### 新增（2026-09-03 · 乐谱预览 A4 自动分页）

- 乐谱预览改为 A4 自动分页，支持页级与整曲复制/下载；接入 Gitee 云同步；导出链路收敛与自动滚屏。

### 新增（2026-09-02 · 乐谱导出 Web Worker 离屏渲染）

- 乐谱导出预览迁移 Web Worker 离屏渲染（不阻塞主线程），新增自适应尺寸指令；清理冗余依赖与样式。

### 重构（2026-09-02 · 交互原语收敛与 Prettier 工具链）

- 接入 Prettier 工具链（含属性排序/模板标签等插件组合）；收敛重复交互逻辑；新增图标与复选框基础组件。

### 新增（2026-09-02 · 领域架构纵切重构）

- 领域架构纵切第一步：模块解耦与目录收敛，组件泛型化与测试增强。

### 更新（2026-09-01 · 编辑状态与同步菜单优化）

- 移除全局禁用编辑状态；顶部同步菜单优化与方案级联切换；模态框过渡与自适应完善。

### 新增（2026-09-01 · 自建服务同步提供者）

- 新增自建服务（server）同步提供者与互斥锁定；Tailwind
  Preflight 样式迁移；模态框自适应高度、多横按共存、输入框叠加元素与空状态过渡优化。

### 更新（2026-09-01 · 乐谱拼音分组排序）

- 乐谱拼音分组排序与拖拽健壮性；歌词落点分区交互与格式输出收敛。

### 修复（2026-08-31 · 歌词跨歌曲串写）

- 修复歌词编辑防抖回调跨歌曲串写（调度时锁定 songId，切歌时同步未提交文本）与陈旧覆盖；启动备份不回填；复制拖拽落点确认。

### 新增（2026-08-31 · 气泡确认组件）

- 兼容代码收敛至导入边界；新增 Popconfirm 气泡确认组件；备份导入弹窗细化。

### 更新（2026-08-31 · 测试双项目拆分提速）

- 测试双项目拆分（logic/node + ui/jsdom）大幅提速，产物分析按需生成，脚本缓存收尾。

### 新增（2026-08-31 · 浮层层级体系与实体校验内核）

- 类型安全整改与实体校验内核统一；浮层层级体系（z-index 分配器）与基础组件交互完善。

### 修复与优化（2026-08-28 · 持久化可靠性 + 交互细节）

- **修复刷新/退出后数据回退**：移除和弦列表、分组、编辑草稿的 `useStorage`
  防抖，保存/删除/排序等任何变更立即写入localStorage；`bootstrapDataLayer`
  的 IDB 回填改为仅当 localStorage 对应键缺失时执行，IDB 为空时不再删除 localStorage 的歌曲，避免异步备份未完成时用旧/空数据覆盖实时数据；
- 保存和弦成功后立即落盘 localStorage（`flushChordsToStorage`），配合无防抖写入保证刷新不丢；
- 全量导出增加空数据校验：分组/和弦/乐谱均为空时提示「没有可导出的数据」并中止，不再下载空备份文件；
- `BaseSelector` 空选项时禁止下拉面板滚动，并隐藏滚动提示箭头（空占位略高于容器导致的伪滚动）；
- `SyncModalContainer` GitHub 分支选择占位文案微调。

### 修复与优化（2026-08-27 · 焦点管理与交互细节）

- `ActionButton` 新增 `tabindex` prop 并显式绑定到原生 `<button>`，外部可精确控制焦点序列；
- 乐谱清除按钮（`ChordSlotCell`）与和弦选择器「去修改」按钮（`ChordPickerModal`）隐藏时自动 `tabindex=-1`
  退出 Tab 序列（父容器 hover 显示时恢复），避免隐藏态按钮抢占键盘导航焦点；
- `BaseSelector` 禁用态光标修正为 `cursor-not-allowed`（原基础 `cursor-pointer` 与禁用类同优先级冲突，手型优先）；
- `ChordPickerModal`「全部」tab 下，和弦卡片左上角显示来源分组徽标，按根音混排时便于识别和弦归属；
- 工作台整体上移（顶部内边距与右侧面板定位同步收紧 16px），右侧「和弦分析 + 横按」面板固定上下边界并在面板内独立滚动，不再撑开整个工作区；
- `FretboardSvg` 指板渲染优化：0 品粗琴枕（仅 Capo 为 0 时显示）、品线改为 `fretCount + 1` 根横向闭合线、琴弦统一
  `crispEdges` 锐利渲染。

### 新增（2026-08-27 · 横按标记功能）

为指板与和弦谱体系加入**手动横按（Barre）标记**，数据层向后兼容，同时修复谱面行首/行尾和弦编辑后不刷新与横按候选计算问题。

**数据层（向后兼容）**

- `Chord` 新增可选 `barres?: BarreEntity[]`（支持多横按，如双横按和弦），完全兼容历史数据与旧 IDB 存储；新增
  `BarreEntity` 描述实体（`fret` 品格 / `fromString`~`toString` 弦范围 / 可选 `finger` 指序）；
- `createChord` 支持透传 `barres`，空数组不落库；`normalizeBarres` 过滤非法条目（品格/弦序越界、`from > to`）；
- `buildChordForSave` 保存时携带 `barres`；「无修改」判定同时比较 `barres`（指纹不含横按，仅改横按也能正确识别保存）；
- `chordEditorStore` 新增
  `setBarres`；缩品位自动清理越界横按；指板音符变化自动清除失效横按（程序性加载/重置跳过，避免误清已保存横按）。

**工作台交互**

- 新增 `BarrePanel` 横按标记面板：指板实时预览 + 候选拾取模式（`barrePickMode` /
  `barreCandidates`），候选横按以半透明虚线梁展示，点击即标记、再次点击清除，支持多条横按；候选由
  `computeBarreCandidates` 随指板实时计算；
- `FretboardSvg` 新增横按渲染：已标记横按以实心梁画在音符下层，拾取模式派发 `barre-click`；
- `ChordPickerModal` 新增「去修改」入口，从谱面直达工作台编辑横按与和弦。

**修复**

- 横按候选按连续可覆盖子段拆分：同品弦被空弦/静音/更低品位隔断时仍能产出可横按的连续段候选（如 `2x222x`
  现可标记 4/3/2 弦的 2 品横按）；
- 新增「隔静音弦」横按候选：两根同品弦之间全部为静音弦（x）时也可横按（食指覆盖、中间闷音），仅限两端均为未被连续段覆盖的孤立弦，不与其他横按共用琴弦（如
  `11x1x1` 可标记 3 弦~~1 弦； `22x222` 仅产出 6/5 弦与 4/3/2 弦两组，5 弦~~3 弦的 `2x2` 因共享琴弦被剔除）；
- 乐谱行首/行尾（edge）和弦缓存签名加入内容指纹与 `barres`，编辑同一 id 的和弦后谱面即时刷新；
- `BaseSwitch` 拖拽 thumb 位置限制在有效区间，右拖不溢出、左拖不越界；
- `ChordSlotCell` 清除按钮增加 `@pointerdown.stop`，避免与拖拽命中冲突；
- `BasePopover` 移除 `v-on-click-outside` 指令依赖，改用自有的 `window pointerdown`
  全局守卫（按下点判定，内按下外松开不误关）。

### 组件 API 完善与健壮性修复（2026-08-27 · 表单类组件审查 + marquee 指令化）

基于对 `src/components/base/` 通用组件的使用审查，完成 API 完善、无障碍与健壮性修复，并将 `BaseMarquee` 迁移为
`v-marquee` 指令。

**BaseMarquee → v-marquee 指令**

- 删除 `BaseMarquee.vue`，新增 `src/directives/vMarquee.ts` 并全局注册为 `v-marquee`；`tailwind.css` 同步新增
  `.marquee-viewport` / `.marquee-inner` 基础类；
- 支持 `mode: 'hover' | 'always' | 'none'`、`loopMode: 'pingpong' | 'continuous'`、`speed`（px/秒）/
  `duration`（毫秒）、`gap`、`delay`、`direction`、`pauseOnEdges` / `pauseDuration`、`fade`（两端羽化遮罩）；
- 派发 `marquee-start` / `marquee-end` / `marquee-overflow-change` 生命周期事件；`ResizeObserver`
  同时观察容器与内容，内部文本变化即时触发测量；尊重 `prefers-reduced-motion`；支持 `hover` / `always` / `left` /
  `right` / `continuous` / `fade` 等修饰符。

**组件 API 完善与修复**

- `BaseModal`：新增 `confirmLoading`（确认按钮 loading 并防重复触发）与 `beforeClose`（返回 `false`
  可拦截关闭）；内置右上角关闭按钮 `showClose`；`width` / `height` 支持任意 `number`（按 px）与字符串值；新增 `open` /
  `opened` / `close` / `closed` 生命周期事件；`setExternalInert` 改为遍历 `body` 子节点并排除自身、保留既有
  `inert`，SSR 环境守卫；标题以 `aria-labelledby` 关联唯一 ID；
- `BaseNumberInput`：`loopable` 默认改为 `false`，`wheelable` 默认 `false` 且仅聚焦生效；新增 `precision` 独立精度与
  `parser` 自定义解析；`Shift`（10x）/ `Alt`（0.1x）修饰键步长；补 `role="spinbutton"` 与
  `aria-valuenow/min/max`；小数位推导兼容科学计数法；非法输入恢复当前值展示；滚轮方向修正为向上增、向下减；
- `BasePagination`：统一为 `defineModel`；新增 `base: 0 | 1` 索引基准（默认
  `0`，兼容数组下标场景）、`pageSize`、`showJumper`
  页码跳转、`hideOnSinglePage`；步进改为按步长区间（chunk）对齐，避免末尾截断导致偏差；根节点改为
  `<nav aria-label="分页导航">` 并补齐翻页按钮 `aria-label`；
- `BasePopover`：`trigger` 扩展 `'focus'` / `'contextmenu'`；`trigger="click"`
  由组件统一接管点击切换（调用方不再重复绑定 `toggle`）；新增 `teleportTo` /
  `disabledTeleport`、`showArrow`（接入 Floating UI `arrow`
  中间件）、`matchTriggerWidthStrategy: 'width' | 'minWidth'`；浮层宿主→触发器引用改用 `WeakMap`；`hoverTimer`
  卸载时清理；点击外部守卫 `isShown` 避免退场动效期间重复触发；
- `BaseSegmentedControl`：泛型扩展支持 `boolean`，`options` 兼容纯原始类型数组；`texted` 收敛为
  `variant: 'pill' | 'text'`；新增 `item-icon` / `item-suffix` 插槽与方向键导航；补 `role="radiogroup"` /
  `role="radio"` + `aria-checked`；`toEl` 兼容组件实例 `$el`；`v-wave` 合并全局禁用态；逐项 `ResizeObserver`
  修复字体加载导致滑块错位；
- `BaseSelector`：新增 `fieldNames` 字段映射、`filterable` + `filterMethod` 搜索过滤、`multiple`
  多选（数组绑定 + 标签展示）、`prefix` / `suffix` / `header` / `footer`
  插槽；打开后面板自动聚焦当前项（filterable 时聚焦搜索框）；对象类型 value 用 `equalsValue` 稳健比较；选项高度按 `size`
  自适应，修正 `dropdownMaxHeight` 估算偏差；
- `BaseSlider`：新增 `marks` / `showTicks` 刻度与文本标签、`editable` 可编辑数值输入；`wheelable` 默认 `false`
  且聚焦生效、滚轮方向修正；`Shift` / `Alt` 修饰键步长；轨道按百分比渐变填充（Webkit）与
  `-moz-range-progress`（Firefox）；Label / Readout 移除 `role="button"`
  焦点冗余，重置收敛为滑块双击；小数位推导兼容科学计数法；
- `BaseFloatingBar`：修复浮条不显示问题（`isViewActive` 初始置 `true`，避免激活钩子未触发时被隐藏）。

**其他完善**

- `EmptyState`：新增 `title` / `description` / `action` 插槽与属性、自定义插画 `image`（加载失败自动降级）与 `icon`
  插槽、`role="status"` + `aria-live`；
- Toast：`ToastOptions` / `Toast` 增加 `description`、`customClass`，`onAction` 支持异步；`uiStore` 新增 `clear()` 与
  `promise()`（loading → success / error 自动收尾）；
- 乐理显示偏好拆分：`settingsStore` 新增工作台（`workbenchChordShorthand` /
  `workbenchShowPitchNames`）与乐谱（`scoreChordShorthand` / `scoreShowPitchNames`）两组独立开关，并保留兼容别名；
- `getChordName` 支持无 `nameSegments` 的输入（`chordName` / `name` / `customName` 兜底并尝试 `nameToSegments` 解析）；
- 空弦根音按钮配色调整：浅 / 深色主题的背景、边框、文字独立令牌化。

### 重构（2026-08-27 · 目录结构重组 / 抽象层清理 / 同步基础设施）

合并本轮工作区全部未推送改动：对通用抽象层做大幅重组与瘦身，并按领域拆分目录结构。

**组件目录重组（移动，非删除）**

- `src/components/Base*` 通用组件整体移至 `src/components/base/`；右键菜单 `ContextMenu` / `ContextMenuItems` 移至
  `context-menu/`；指板相关 `Fretboard` / `FretboardSvg` / `FretboardNote` / `ChordNameDisplay` 移至
  `fretboard/`；新增各层 `index.ts` 桶文件统一导出；
- 删除 `AppShell.vue`，三栏布局收拢至 `App.vue`（详见下方更早条目）。

**组合式函数与路由重组**

- `composables` 按领域拆分到 `composables/{app,fretboard,score}`，`score` 下新增 `lyrics-drag/` 拖拽子模块；真实删除的仅
  `useGridNavigation`（由 `vGridNav` 指令取代）、`useFocusReturn`、旧的 `useLyricsDragDrop`（重写为
  `composables/score/useLyricsDragDrop.ts`）；
- `router` 由 `src/router/index.ts` 扁平化为 `src/router.ts`，并删除
  `src/router/scrollMemory.ts`；导航改为状态/单视图驱动。

**工具函数按领域重组**

- `src/utils/*` 按领域拆分到 `src/utils/core`（通用）、`src/utils/music`（和弦指板/乐理）、`src/utils/score`，并新增
  `utils/index.ts` 桶文件；文件实为移动/重命名，未做内容裁撤。

**新增指令与同步基础设施**

- 新增 `vScrollCache` 指令（`src/directives/vScrollCache.ts`）用于滚动位置缓存；
- 新增同步抽象层 `services/sync/registry.ts` 与 `services/sync/syncBase.ts`，统一 `SyncProvider` 注册与基础行为；
- 新增 `.gitattributes` 规范仓库文本/二进制属性；
- vite 开发端口由 3000 调整为 5173，规避 Windows Hyper-V/Winnat 保留端口段（2977–3076）导致的 `EACCES`。

**测试对齐**

- 将因模块移动而失效的 7 个测试（`coreRegression` / `sanitizePersistedData` / `domain/models` / `bootstrapRobustness` /
  `BaseBadge` / `BaseFormRow` / `BaseSwitch`）的 import 重定向至新路径；
- `ChordSlotCell` 测试断言对齐重构后的 Tailwind 结构；`BaseSwitch` / `BaseBadge` 组件测试改用 `role` / `aria-*`
  / 根元素标签 / 内联样式等稳定断言（原语义 class 已改为 Tailwind 工具类）；
- 全量 113 项测试通过。

### 组件 API 完善（2026-08-27 · ActionButton 健壮性增强）

针对 `src/components/base/ActionButton.vue` 的 API 完善与健壮性增强：

- **新增 `type` 属性**：`'button' | 'submit' | 'reset'`，默认 `'button'`，避免原生 `<button>` 在表单内意外提交；
- **主题统一为 `color` 枚举**：`color?: 'default' | 'primary' | 'danger' | 'warning' | 'success'`（设计系统暂无 `info`
  令牌，故未纳入）；已彻底移除 `primary` / `danger` / `warning` 布尔语法糖，所有调用方统一改为 `color`；
- **`variant` 合并 `text`**：移除冗余的 `texted` 布尔，将 `'text'` 并入
  `variant: 'default' | 'subtle' | 'ghost' | 'text'`；`BaseSegmentedControl` 透传给 `ActionButton` 的 `:texted` 已改为
  `variant="text"`；
- **A11y 增强**：`loading` 时输出 `aria-busy="true"`；新增 `ariaLabel` 属性，`iconOnly`
  且缺省时开发期告警提示补充无障碍标签；
- **点击拦截**：`handleInternalClick` 增加 `disabled || loading` 守卫（`preventDefault`
  并提前返回），防止禁用/加载态下样式覆盖或特殊事件触发导致误冒泡；
- **Icon-Only 加载占位尺寸一致**：`loading` 时 Loader 尺寸随 `size`（`sm/md/lg` → `w-3.5/h-3.5` / `w-4/h-4` /
  `w-5/h-5`）统一，避免与默认插槽图标尺寸不一致产生跳动。

### 组件 API 完善（2026-08-27 · BaseBadge 解耦与健壮性）

针对 `src/components/base/BaseBadge.vue` 的 API 解耦与合法性修复：

- **`dot` 与 `statusDot` 解耦**：`dot` 仅渲染无内容的小红点（Dot 模式，忽略 `content`）；`statusDot`
  专门在文字前显示状态指示灯（前缀圆点），二者不再通过 `isDotOnly` / `hasDot` 耦合派生；
- **`hoverClose` 专有 `close` 事件**：开启 `hoverClose` 时点击徽标语义为“关闭”，改派发专有 `close` 事件（而非
  `click`），调用方可明确区分；`closable` 关闭按钮同样派发 `close`；
- **A11y 文案泛化**：移除硬编码业务文案（“新消息提示”“未读消息”）；通用描述交由外部 `aria-label` 传入，仅在 `max`
  截断时补充数字文本（`${max}+`），避免在作为状态标签（如“进行中”“已完成”）时产生误导；
- **消除非法 DOM 嵌套**：`closable` 关闭按钮统一渲染为 `<span role="button">`，杜绝外层
  `<button>`（`isInteractive`）内嵌 `<button>` 的非法结构及事件冒泡异常；
- **避免键盘事件重复触发**：外层渲染为原生 `<button>` 时移除多余的 `@keydown.enter` / `@keydown.space`
  监听，依赖浏览器原生单次 `click`，消除 Enter/Space 单次激活触发两次 `click` 的问题。

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
