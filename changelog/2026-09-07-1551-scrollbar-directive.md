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
