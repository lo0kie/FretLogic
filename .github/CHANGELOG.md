# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 修复与增强（2026-09-05 · 粘贴确认兜底与体验打磨）

- 修复多指法面板 KeepAlive 定位失效：`v-scroll-into-view` 的 `updated`
  钩子不再使用挂载时闭包的旧 `binding`，改为经可变容器读取最新绑定值，会话内动态点选最后一个后再切换页面也能正确居中定位；
- 和弦分析面板「构成音」由纵向列表改为横向自动换行的紧凑徽章排布（弦号 + 音名 + 度数圆点，根音暖色高亮），添加音符时面板高度变化更平滑；
- 乐谱粘贴导入新增「确认兜底」：含内嵌 `[和弦]`、ChordPro 指令或标题行的文本（有可确证结构）直接导入；无任何结构信号的纯散文需用户二次确认后才按纯歌词新建乐谱，杜绝框选 UI 装饰文字被静默误导入；
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
