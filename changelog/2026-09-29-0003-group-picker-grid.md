### 调整 · 非模态浮层的层叠来源改由浏览器 top-layer 承担（2026-09-29）

- **机制替换**：菜单 / 下拉 / 工具提示 / 贴边浮动面板 / 键盘聚焦环这五类**非模态**浮层，此前各自从一张
  全局层号池取 z-index（后开者取「当前最高占用 + 1」），现改走浏览器 top-layer —— 宿主元素挂
  `popover="manual"`，打开时 `showPopover()`、离场动画结束后 `hidePopover()`。层号池
  （`platform/ui/popover/floatingZ.ts`）与 `usePopoverZLayer` 随之删除；`usePopoverOrder` 改为只记
  **登记先后**（浏览器不暴露「读取 top-layer 顺序」的 API，而 top-layer 的排列规则恰好就是进入先后，
  故顺序只能自记）；`--z-menu: 9999` 这一档令牌与 Tailwind 的 `--z-index-menu` 一并移除。
- **用户可感知的变化**：① 浮层现在**恒在页面一切内容之上** —— 此前 9999 那一档仍可能被更大的
  z-index 盖住，现在不会；② 层叠顺序仍是「后开者在上」，与迁移前逐条等价；③ **「鼠标再次移入浮层即把它
  提到最前」的行为取消** —— 该动作原先靠重取层号实现，在 top-layer 下只能靠 `hidePopover()` +
  `showPopover()` 重排，代价是走一遍「焦点归还 + 一对 toggle 事件」，对一次不改变可见性的 hover
  不划算；④ 模态（Modal / Drawer）打开时**先收拢所有存量浮层**：模态本轮仍走 z-index，而 top-layer
  恒在一切 z-index 之上，不收拢就会出现「先开着的菜单浮在弹窗之上」。
- **UA 样式复位**：浏览器给 popover 的默认外观（`position:fixed` + `inset:0` + `margin:auto` +
  `width/height:fit-content` + 边框 / 内边距 / 背景）落在 UA 来源层，作者声明能压过它，但它的选择器
  特异性会盖掉工具类，故按「浮层宿主」与「面板本体」两个选择器分别归零，且复位项刻意不同 ——
  面板只清 `left`：写 `inset: auto` 会把工具类给的 `top/right/bottom` 一并清成 auto、面板直接塌到
  左上角；聚焦环与 tooltip 盒另需 `width/height: auto`，否则整视口的画布会被 UA 的 `fit-content` 压成 0×0。
- **聚焦环的层边界判据改口径**：非模态浮层宿主不再写任何 z 号，原先「按内联 z 反查层边界」的两条路
  （`resolveInlineZ` / `resolveStaticLayerZ`）随之删除，改为「按 DOM 属性认浮层宿主
  （`[popover]` / `dialog[open]` / `[data-floating-layer]` / `[data-floating-panel]`）+ 静态高层按
  `computed z >= 1000` 认」。聚焦环自身也迁入 top-layer：留在 z 路径的话会被任何后进层的浮层整个盖住。
- **模态层号就地自持**：`overlayLifecycle` 原先也从同一张池里取号，池删掉后改为模块内**只服务模态**的
  最小分配器（语义与迁移前一致：最高占用 + 1、上限 11000 —— 静态高层 `--z-top` 12000 / `--z-toast`
  13000 必须恒在模态之上），不再做成通用池：没有第二个调用方。
- **兼容性**：依赖 Popover API（Baseline 2024-04，与本仓既有的 `dvh` / `:has()` 同一档），**不保留
  z-index 双轨降级** —— 两套层叠来源并存时谁压谁取决于浏览器，等于把收益全部抵消。测试环境
  `tests/setup.ts` 补了 `showPopover` / `hidePopover` / `togglePopover` / `:popover-open` 与
  `beforetoggle` / `toggle` 事件的桩。
- 验证命令：改动文件逐个跑 `eslint --max-warnings 0` 与 `prettier --check`，0 问题；新增
  `tests/platform/popoverOrder.test.ts`（9 条）替代随池删除的 `tests/platform/floatingZ.test.ts`，
  改写后的 `tests/tokens/designTokens.test.ts`（9 条，原「层号池两档区间」断言改为静态高层次序）与
  tooltip 四份、聚焦环 / 遮罩 / 模态控制器等共 9 个文件 43 条全绿；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 调整 · 按审计结论收敛重复实现与手写 API，无用户可感知行为变化（2026-09-29）

- 触发：上一轮做了一次只读审计，把全仓分作「重复实现」「有现成 API 却手写」「核过理由成立」三类；本轮把前两类
  全部落地，第三类保持原样。以下改动均为等价替换，不改任何 eslint zone 规则、也不放宽保护区边界。
- **和弦签名口径收口**（新增 `chord/model/chordContentSignature.ts`）：渲染缓存键与判等此前各自拼
  `computeChordFingerprint` 再手写横按签名，六个判等消费方口径不齐；现统一为两个具名口径 —— 渲染缓存键用
  不含指法的内容签名、判等用含指法的内容键（`areChordContentsEqual` 供「是否改动过」判定）。指纹不含横按，
  漏补的判等处会把「同指法不同横按」判成重复而静默丢数据；`chordRepository` 读库去重、`chordMergeOps`
  重复分组、`chordDraftValidation` 的「无修改 / 重复」两处一并改走新口径。
- **横按签名不再手写**：`FretboardCanvas` 的位图缓存键与导出 Worker 的和弦栅格键此前各自 `join('|')` 拼横按，
  且不排序 —— 语义相同的指法会算出两个键；两处改走 `computeBarresSignature`（排序，顺序无关）。
- **「占用列 → 品窗」由两处收敛为一处**：`fretboard/model/fretWindow.ts` 新增
  `resolveFretWindowFromParts(storedFretCount, stringFrets, barres, trimEmptyEdgeFrets)`，渲染侧与导出 Worker 侧
  都改走它（导出侧原先自备一份 `usedFretColumns`，两处各写一遍「弦品位 + 横按 ⇒ 占用列」）。
- **导出 / Worker 侧三处小重复合并**：长图与 A4 两条分页路径共用「清底 + 铺底色」与「分段绘制」（唯一差别
  只剩大行间距）；`workerExportService` 的两条入队路径共用同一段「OffscreenCanvas 环境检查 + 清空闲计时 +
  入队 + 起泵」前奏；槽位键前缀 `line_` 收敛为 `scoreModel.ts` 的常量与由它拼出的解析正则，三处手写前缀与
  两处 `lineDropTargetKey` 一并改用。
- **三处 `visible` 三件套改 `defineModel`**（浮动面板、和弦编辑抽屉、和弦选择面板）：删掉各自的
  props + emit + computed 组合，读侧 `props.visible` 语义不变；**四处模板 ref 改用 `useTemplateRef`**，
  并清掉 `TopHeader.vue` 里「模板有 `ref="triggerBtnRef"`、脚本内无任何声明」的悬空引用。
- **三个滚动类 composable 的事件解绑改用 `AbortController`**（滚动记忆、吸顶头、分区滚动侦测）：一次
  `abort()` 摘掉该次挂载的全部监听，取代「记住元素 + 逐个 `removeEventListener`」；挂载前先 `abort()` 保证幂等。
- **八处基础 UI 组件补 `defineSlots`**（SlotShell、ActionButton、BaseCheckbox、Feedback、BaseRollingText、
  BaseDrawer、BaseModal、BaseFloatingPanel），插槽名与回传 props 逐一按模板实际形态标注（如 `titleId`、
  `{ disabled, loading, size }`、`{ size: IconSizeValue }`）。`BaseBadge.vue` **刻意不加**：它的插槽是
  「静态 `target` + 运行期按 `Object.keys(slots)` 动态转发」，静态声明既表达不了动态名，还会反过来把使用者
  传的任意插槽名判为非法。
- 验证命令：改动文件逐个跑 `eslint --max-warnings 0` 与 `prettier --check`，0 问题；按改动模块跑相关
  `vitest run`（渲染缓存键、指板几何 / 品窗、和弦库 store 与判等、导出分页、滚动记忆等）全绿；
  类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 宽屏预览也按页分段滚动，一页一段（2026-09-29）

- 原先只有窄屏（< md）的预览走「单页 + 按页吸附」，宽屏页流是连续横向滚动、会停在两页之间。
  现在横向**一律按页分段**：宽屏档保持「页按视口高贴合、一屏可见数页」的版式不变，但滚动按
  **单页宽 + 页间距**分段前进。
- 宽屏档的吸附对齐取 `snap-start`（窄屏仍是 `snap-center`）：这一档一屏可见数页，只有「页首对齐到
  内容起点」才使相邻吸附点间距恒等于「页宽 + 页间距」，与滚轮固定步长逐像素相等；居中吸附在容器
  远宽于页时会把头几页的落点钳到同一个值，一次滚轮直接跳过中间几页。滚动容器同时补 `scroll-pl-lg` /
  `max-md:scroll-pl-sm`，把吸附起点抬到内边距之内 —— 否则静止位会被吸附从 0 拽走、吃掉左留白。
- 滚轮档位随之统一：宽屏由「平滑 + 位移翻倍」改为与窄屏同款的**固定步长**（一次手势正好走一段）。
  代价是触控板一次横扫的几十条事件会连翻十几段，与「一次手势一段」同源，二者不可兼得。
- 滚动条的**分段吸附**仍只在窄屏单页档开启：宽屏档一屏可见数页，横向可滚距离小于「页数 × 单页宽 +
  间距」，等分出来的第 k 段与第 k 页的吸附点对不上（末尾几页还会挤在同一处），拖动拇指会与内容侧
  吸附互相拽；那一档的「分段」由内容吸附 + 固定步长承担，滚动条保持连续映射（页码读数气泡不变）。
- 顺带把 `SINGLE_PAGE_GAP_REM` 更名为 `PAGE_GAP_REM`：同一个页间距值现在同时供「单页档页宽扣减」
  与「宽屏档滚轮步长」两处使用，旧名只描述了其中一半。
- 验证命令：`eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；相关 `vitest run` 全绿；
  类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 交互指板空弦位补画落点预览环（2026-09-29）

- 修复：某弦已按品时它的空弦位没有圆点（圆点滑到了所按品位），而 `FretboardSvg` 的空弦位预览环此前对该位
  直接早退 —— 依据的是「空弦区恒有 `FretboardNote` 的空弦圆点兜底」这一不成立的假设。于是 Tab 进指板
  （`handleFocus` 一律把落点置为 `{0, 0}`）或 PageUp 回到空弦位时，焦点停在一个画面上不存在的位置上、
  没有任何可见反馈；该弦为空弦 / 静音时另有圆点接手，只有已按品时才暴露。
- 修法：悬停环与焦点环两处的下界判据由 `fretIndex <= 0` 改为 `fretIndex < 0`，该位有没有圆点一律交给
  `hasNoteAt` 判 —— 空弦 / 静音位仍由 `FretboardNote` 自身高亮环接手，已按品时才由预览环兜底。
- 验证命令：`eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。

### 新增 · 全项目补语义化标签：页面标题层级、折叠头 heading 化、导航地标（2026-09-29）

- **折叠头 heading 化（WAI-ARIA accordion 模式）**：`BaseCollapse` 的头部按钮包进
  `<h3 class="contents">`（headingLevel prop 可取 2/3/4，默认 3），全项目 15 处折叠面板的标题
  （侧栏分组名、工作台「指板设置 / 多指法」等面板题、设置弹层分组、DevPanel）从此是真实的
  heading，读屏用户可按标题层级导航。包裹层 display:contents 不生成盒——按钮的布局与吸附
  （sticky 经 $attrs 落在按钮上，containing block 与改前同为 section）逐像素不变；该属性剥离
  a11y 语义是 2020 年前旧浏览器缺陷，evergreen 均已修复。页面级主要小节
  （WorkbenchView 面板、GroupSection 分组）显式传 `heading-level="2"`。
- **页面标题**：WorkbenchView / ScoreView 各补一枚 `sr-only` 的 `<h1>`（「和弦工作台」/「乐谱」）
  ——视图以画布 / 面板为视觉主体、无标题位，读屏此前无法按标题定位页面。
- **导航地标**：顶栏「Fret Logic + 和弦/乐谱切换」区改 `<nav aria-label="主导航">`；乐谱页的
  「编辑 / 互动 / 预览」Tab 行整行改 `<nav aria-label="乐谱视图切换">`（div→nav，盒行为相同，
  居中/独占一行的 delicate 布局不动）；侧栏列表区改 `<nav aria-label="库导航">`。
- **刻意不做**：内容列表 div→ul/li（挂 Sortable 拖拽排序，风险大于收益）；卡片壳再套 section
  （BaseCollapse 根已是 section）；footer/time/figure（无对应场景）。既有语义（main/aside/header、
  弹窗 h3、role=status/alert、html lang）盘点确认已就位，不动。
- 验证命令：六文件 `eslint` 与 `prettier --check` 0 问题、全量 `vue-tsc --noEmit` 通过；dev server
  实测——`main h1` 落地、12+4 个折叠头均被 H2（contents）包裹、面板开合 aria-expanded 正常翻转、
  头部盒几何不变、console 0 错误；顶栏 / 侧栏 / Tab 行三处 nav 地标均在 DOM 中。

### 调整 · `buttonized` 从 BaseCheckbox 迁入 BaseSwitch，归位为按钮化开关形态（2026-09-29）

- **breaking（组件 API）**：BaseCheckbox 的 `buttonized` / `icon` / `iconOnly` 三个 props 删除，Action 按钮
  渲染分支整体迁入 BaseSwitch —— `variant="button"`。语义归位：该形态的两个消费方（顶栏侧栏开合、
  预览适配切换）都是 **icon-only 布尔开关**，不是集合勾选；checkbox 本体回归纯勾选语义（全选 /
  indeterminate 场景），buttonized 只为它存在的迁就逻辑（不上报 formRow id、专属图标 props）一并消失。
- **无障碍修正**：该形态的角色从错位的 `role="checkbox"` 修正为 `role="switch"` + `aria-checked`
  （实测 DOM：`BUTTON role=switch aria-checked=true`）。Action 按钮 subtle/ghost 主题、`icon-size` 等
  视觉口径不变（`buttonThemes.ts` 共享机制不动）。
- **BaseSwitch 侧配套**：`variant` / `icon` / `iconOnly` 三个 props（icon-only 在无 label / 默认插槽时
  自动开启）；模板成条件双根，按仓内惯例 `inheritAttrs: false` + 两分支显式 `v-bind="$attrs"`（调用方
  的 class / title / v-tooltip 落在实际渲染分支的根元素上）；button 形态不上报 formRow id（避免行标签
  for 悬空）；`loading` / `beforeChange` / `size` 契约对两种形态一致生效。
- 消费方迁移：`TopHeader.vue`（侧栏开关）、`ScorePreviewPane.vue`(适配模式开关)改用
  `<BaseSwitch variant="button">`，其余属性逐字不变。
- 验证命令：四文件 `eslint` 与 `prettier --check` 0 问题、全量 `vue-tsc --noEmit` 通过；dev server
  截图对比渲染一致，实测点击切换 aria-checked true ↔ false、v-model 正常回写。

### 新增 · BaseSegmentedControl 新增 boxed 形态：段内描边选中块 + 段间细分隔线（2026-09-29）

- `variant` 新增 `'boxed'` 档：白胶囊底板与 pill 共用，选中段由滑块呈现为「段内四周内缩的描边方块」——
  浅主色底 + 2px 主文字色强描边（`border-fg-title`，随主题近黑 / 近白），四周留出底色圈；相邻段之间渲染
  1px 细分隔线（静态元素画在滑块之下，滑块滑过时自动盖住，无需 z 管理）。
- 几何换算（`resolveIndicatorGeometry`）新增 boxed 分支并返回 `dx`（横向内缩偏移），静止测量与拖动跟手
  预览共用同一换算（`BOXED_INSET_PX = 3`）；拖动切换落 pill 分支（抓取偏移搬运），v-model / 键盘
  roving tabindex / 拖动滑块切换 / 禁用 / 尺寸档 / closeable 全部复用不变。
- 圆角刻意取 `rounded-sm` 而非 `rounded-lg`：本项目根字号随视口缩放（实测 22.25px），`rounded-lg`
  （1rem = 22.25px）超过段高一半会被浏览器钳成全胶囊，`rounded-sm`（0.375rem ≈ 段高 30%）与设计稿
  比例一致且各尺寸档都不触钳位。
- 验证命令：三文件 `eslint` 0 问题、全量 `vue-tsc --noEmit` 通过；dev server 动态挂载实测——3 项 /
  分隔线 2 根 / 滑块 2px rgb(28,28,30) 描边 + 主色 tint 底 + 8.3px 圆角，点击切换后 aria-checked 与
  滑块位移（127.4px → 8.6px，含 dx 内缩）均正确；无既有测试锚点（jsdom 无布局测量），按测试红线未新增。

### 调整 · BaseSegmentedControl 删除零消费方的 `closeable`（2026-09-29）

- **breaking（组件 API）**：`closeable` prop 删除，泛型参数 `C` 与模型/emit 上的
  `V | undefined` 条件形态、`emitValue` 收窄助手一并移除 —— 分段控件回归「恒有选中、无取消语义」
  的标准形态（radiogroup 惯例）。已复核全仓 src / tests 零消费方，删除无迁移成本；需要「再点取消
  选中」时再以显式命名（如 `allowDeselect`）加回。
- 拖动 composable 里引用 closeable 的补发 click 抑制注释同步改写（抑制机制本身保留——补发 click
  不应被当作真实点击，与取消选中无关）。
- 验证命令：两文件 `eslint` 与 `prettier --check` 0 问题、全量 `vue-tsc --noEmit` 通过；IDE 诊断干净。

### 调整 · BaseSegmentedControl 的 `tabbed` boolean 并入 `variant`（2026-09-29）

- **breaking（组件 API）**：`tabbed?: boolean` 删除，下划线 Tab 形态改由 `variant="tabbed"` 表达 ——
  此前「同一视觉维度两个入口 + boolean 隐式覆盖 variant」的优先级规则随 variant 增至四档（pill / text /
  tabbed / boxed）已成陷阱，收为一个联合。仅有的两个消费方（`TopHeader.vue` 顶栏页签、
  `ChordPickerPanel.vue` 分组页签）已同步迁移；`visualVariant` 相应简化为直接取 `variant`。
- **组件名评估后保留**：`BaseSegmentedControl` 是行业标准术语（iOS `UISegmentedControl`），四种形态
  均为「互斥单选」语义，改名 `ButtonGroup` 反而与「动作按钮组（无选中态）」语义错位；`compacted` 亦保留
  —— 它是跨组件约定（`BaseFormRow` / `GlobalNotification` 同名）。
- 验证命令：三文件 `eslint` 与 `prettier --check` 0 问题、全量 `vue-tsc --noEmit` 通过；dev server
  刷新截图对比迁移前后顶栏页签条渲染一致。

### 调整 · 分组选择网格抽为共享组件，移动与新建保存两处改用同一实现（2026-09-29）

- 新增受控组件 `GroupPickerGrid.vue`（`domains/chord/library/components/`）：只发 `update:modelValue`、不持有选中态，
  两处真实的语义差异（悬浮提示文案、是否禁用「当前所属分组」那一项）由 props 承担；
- 「移动至新分组」（`ChordModalsContainer.vue`）与「选择保存分组」（`ChordEditorDrawer.vue`）改用该组件，
  两份平行实现的重复 class 串、选中态、计数与 `v-marquee` 宿主一并收拢，`ChordModalsContainer` 里只为移动网格
  服务的 `moveGridCols` 与 `useResponsive` 依赖随之删除；
- 用户可感知的变化：抽屉「选择保存分组」网格在窄屏（< md，768px）由恒定 3 列改为 2 列，与「移动至新分组」取齐 ——
  3 列在手机上每格仅约 100px，分组名与计数挤成一团；列数档位此后只有一处维护；
- 顺带修掉先于代码失真的注释：两处注释此前各自声称「逐档取齐」，而列数档位实际已经分叉（一处两档、一处恒三列）。

### 调整 · 取消启动期云端数据自动比对，改在拉取 / 同步时判等并提示（2026-09-28）

- **移除**：启动后那次「非阻塞比对云端校验和」整条链不再存在 —— `main.ts` 的懒加载调用、
  `syncActions.checkCloudDataChange` 及随它一起的方向判定 / 常驻通知 / 一键修正动作、比对基准
  （`SYNC_COMPARE_BASELINE`）与「已提示过的不一致签名」（`SYNC_MISMATCH_ACK`）两个存储键、以及
  `BUILTIN_AUTHOR_TARGET_SUFFIX` 那条只为启动期 toast 存在的文案。启动不再联网，也不再出现
  「检测到云端较新」这类常驻通知；连带把各处「启动检测 / 启动比对」的注释按新事实改写
  （含 `songStore` / `chordStore` 的就绪门禁说明、四个 provider 的 meta 载体说明）。
- **新增**：判等挪到用户主动触发的两个动作里，两侧 md5 一字不差时弹一条提示、按「已是最新」收场 ——
  **上传**：推送前那一次 `fetchMeta`（本就为冲突判定而拉）顺带比 md5，相同则不推送、提示「云端数据与本地一致，无需上传」
  且不再叠一句「成功上传」；**拉取**：拉到后与本地同路径构建的包比 md5，相同则不返回载荷（三个拉取入口据此不开导入面板）、
  提示「云端数据与本地一致，无需拉取」。
- **口径**：两侧都走 `computePayloadMd5`（同一 selection 构建 + 同一 validate 归一化 + 同一哈希，
  并剔掉 dataMd5 / dataUpdatedAt / absentSections / deletedAt 这些传输标记），故「一致」是真一致；
  本地包构建失败（判不了等）一律照原流程走，绝不因为判等失败而拦住拉取。
- **保留**：推送前「云端比本地新」的冲突判定、以及 meta 写失败时的「重试上传」通知都照旧 ——
  只有它们引用的那段「其他设备启动比对会误判」的成因说明随自动比对一并改写。
- 验证命令：`vitest run` 新增的 4 条用例（含两条正对照）全绿，并做过变异检验（把两处判等分别改坏，
  3 条报红）；同目录既有同步测试 19 条全绿；`eslint --max-warnings 0` 与 `prettier --check` 对全部
  17 个改动文件 0 问题；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 五个长组件按接缝抽出 composable，无用户可感知行为变化（2026-09-29）

- 触发：上一轮把「值得拆的」按长函数 / 长组件做了准入判断，本轮把判为「值得拆」的全部落地。拆分口径统一
  为三条接缝 —— **状态机 vs 宿主副作用**（「何时」与「做什么」分开）、**纯函数 / 几何换算**、
  **布局度量**；跨组件边界无法迁移的 `v-memo` 依赖表一律留在原层，只把行级签名这类 computed 派生量外移。
- `ScoreInteractiveArea.vue` 1924 → 915 行，抽出 4 个 composable：行级和弦签名、视口缩放与沉降
  （预览 / 提交两段式 `zoom`、容器局部 px 与视觉 px 的双向换算）、渐进式视口渲染（前缀 + 空档 + 视口窗口 +
  空档 + 尾部的分段布局模型、空档高度与「视口落在空档何处」两套数同源、滚动补齐与兜底滚动）、行高过渡
  （高度 pin / 释放与动画）。
- `TopHeader.vue` 1179 → 842 行，抽出 3 个 composable：头部布局度量（窄屏 / 动作折叠 / 页签是否独占一行）、
  文档动作（播放、复制粘贴、导出三出口共用同一可用性判据）、同步入口（同步 / 拉取确认、设置弹层、菜单项）。
- `ChordPickerPanel.vue` 856 → 548 行，抽出选择态与虚拟列表两个 composable；分组页签 / 搜索 / 排序的记忆、
  分区派生、行窗口化与吸附头、分区滚动侦测一并外移，组件侧只剩接线。
- `GroupSection.vue` 664 → 307 行，抽出只读派生视图（分组 → 卡片表、展开判定、排序徽标与无障碍文案）、
  内容挂载门控（分块挂载 / 卸载、收起保留窗口、折叠体高度挂起、`flush: 'sync'` 的展开监听）、
  右键菜单委托（两个列表级单例菜单、目标反查与捕获期委托判定）。
- `FretboardCanvas.vue` 455 → 228 行，且不再需要那个只为「把位图缓存放进模块作用域」而存在的普通
  `<script>` 块：位图 LRU 与参考分辨率常量整体迁到 `fretboardBitmapCache.ts`（模块作用域天然满足
  「所有实例共享一份」），配色解析与「配色来源变化即重绘」迁到 `useFretboardCanvasTheme.ts`，
  几何 / CSS 尺寸 / 三层渲染选项与无障碍文案迁到 `useFretboardCanvasGeometry.ts`。
- 拆分本身不引入行为变化；顺带修掉 `GroupSection.vue` 里一处随 `usePickerSelection` 迁移而残留的
  `chordStore` 声明（已无 import 的孤儿引用），以及 `ChordModalsContainer.vue` 里指向
  `REFERENCE_DISPLAY_SCALE` 的失效文件引用（该常量已随缓存迁到 `fretboardBitmapCache.ts`）。
- 用户跑 `vue-tsc --noEmit` 报出 12 处错误，全部由本轮拆分引入，已逐条修掉：`GroupSection.vue` 三个新
  composable 的导入路径写成了同级 `./composables/`（实际在上一级，且本仓禁止 `../` 上溯、一律走 `@/`）；
  `ChordPickerPanel.vue` 的模板仍引用 `GroupSortRule`（枚举 import 随选择态迁走）与 `filteredChords`
  （该 computed 留在 `usePickerSelection` 内未导出）；`DropTargetRouterOptions.setExternalDropTarget`
  误标成 `(x, y)` 坐标签名，实际转发的是 `SetExternalDropTarget`（槽位键 + 行 id，行内空白处键为 null）；
  `ScorePreviewPane.vue` 漏解构 `usePreviewPageStream` 已导出的 `ensureFooterComposed`；
  `usePreviewContainerSize.ts` 的返回类型写成 `ReturnType<typeof computed<number>>`（解析到可写重载
  `WritableComputedRef`）而实际返回只读 `ComputedRef`。
- 验证命令：五个组件与其新增 composable 逐个跑 `eslint --max-warnings 0` 与 `prettier --check`，0 问题；
  按改动模块跑相关 `vitest run`（行窗口化、指板几何 / 品窗、缓存注册与 LRU、和弦库 store、拖拽与预览
  缓存键等）全绿；上述 12 处类型错误由用户执行全量 `vue-tsc` 发现后修复，修完未再跑全量；全量关卡按
  禁令未代跑。

### 修复 · 横按气泡在「同品两条互不相邻横按」间误锚到另一条（2026-09-29）

- 现象：指法 `11x11x`（1 品被静音弦拆成 0–1 与 3–4 两段横按）下，指针停在左段、点掉左段一个音符后，
  气泡先平移到右段上方再消失 —— 期望是原地收掉。
- 根因：`DisplayBarre.key` 只编码「品位 + 该品第几条」（`computeDisplayBarres`），序号是**压紧**的 ——
  同品靠左那条消失后，靠右那条的 key 前移顶上（`barre-fret-1-1` → `barre-fret-1`），与
  `useBarreBubble` 里记着的「上一条」撞车，`activeHoveredBarre` 仅按 key 匹配便把另一条横按认成同一条。
- 修法：`useBarreBubble` 给「当前激活的横按」成对记录 key 与**弦跨度**（`activateBarre`，两处设置点共用），
  direct 匹配要求 key 相等**且**跨度与上次激活的跨度相交 —— 候选按连续段切分、段与段之间恒有断点，
  两条候选的跨度必不重叠，故「相交＝同一条在生长 / 收缩，不相交＝别条顶了 key」。
  `computeDisplayBarres` 的 key 生成与横按梁的节点复用口径未动。
- 验证命令：`vitest run` 新增的 3 条用例（跨条不得认领 / 同条生长仍延续 / 指针真移过去仍改锚）全绿，
  并做了变异检验（把跨度校验退回「只比 key」，跨条那条报红并复现出锚点 10 → 70 即跳到右段）；
  同目录既有 `barre.test.ts`（18 条）与 `useFretboardInteraction.test.ts`（7 条）全绿；
  `eslint --max-warnings 0` 与 `prettier --check` 对两个改动文件 0 问题；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 修复 · 审计清单 P1 九条与 P2 若干条（2026-09-29）

- **useStorage 丢掉第四入参**：四参形态 `(key, initial, storage, options)` 在第三参为 `undefined`
  时（生产调用点就是这种形态）落到 options 分支，而该分支只展开第三参 ⇒ 自定义 serializer 静默失效，
  工作台四个面板的展开态读回 `'expanded'` / `'collapsed'` 字符串恒为真值、收起再也存不下来。
  改为两个位置一并收（第四位优先），且两条分支统一套 `writeDefaults: false`（透传分支此前漏了它）。
- **分组拖拽顺序不落盘**：实体 `put` 按 id 覆盖、IDB `getAll` 按主键序返回，而分组主键是随机 UUID ——
  纯换序（整表引用替换、元素引用不变）在按引用 diff 的 save 里完全静默，刷新即复原。按 songs 的
  `song-order` 同源口径补 `syncMeta` 的 `group-order` 索引：load 按索引重排（缺失/漂移者追加尾部），
  save 与实体同事务写入（顺序未变则不写）。
- **restoreChords 不校验分组存活**：快照里的实体带着删除那一刻的 groupId，「删和弦 → 删其分组 →
  点旧撤销通知」会把和弦写回一个已不存在的分组（库里在、卡片视图永不遍历）。孤儿收容抽为
  `shelterOrphanChords`，由撤销恢复与快照恢复共用（改挂走不可变更新）。
- **KeepAlive 停用不释放浮层资源**：`overlayLifecycle` 只有 `watch(visible)` 与 `onScopeDispose` ——
  切走页面（App.vue 的 `<KeepAlive :max="12">`）既不触发关闭也不触发卸载，于是滚动锁不还、阻断栈不出、
  window 上的 Esc 监听不解，新页面「整页点不动、背景也滚不动」，消费侧此前只能各自打补丁。
  补 `onDeactivated` / `onActivated`，打开态资源收敛为幂等的 `engage` / `releaseOpenResources`；
  `BaseFloatingPanel` 同型（Esc 登记残留）一并补。
- **搜索结果面板的 Esc 连带关掉宿主弹窗**：`useSearchResultsPanel` 的 Esc 只 `preventDefault` 不阻断冒泡，
  而 BasePopover 那条监听在 `!model.value` 处早退（stopPropagation 在守卫之后，拦不住）⇒ 宿主 Modal
  的 window keydown 随之关闭整个弹窗、表单内容丢失。Esc 分支补 `stopPropagation`（面板未打开时早已
  return，那条 Esc 照旧冒泡）。
- **BaseModal 的 `confirmLoading` 不屏蔽遮罩 / ESC**：与 props 文档（「同时屏蔽遮罩/ESC 关闭」）不符 ——
  导出中点遮罩即关，重开 `open()` 回落 pristine 把 busy 标记写回 false，同一份数据被并发提交两次。
- **歌词编辑器回灌抹掉行尾空格**：store 侧按行 trim（`sanitizeLyricsText`），回灌值与本地缓冲不同就
  整体重写 textarea ⇒ 光标跳到全文末尾、后续输入落进最后一行。加「规范化后等价即视为自家回显」分支
  （与 store 同一把尺子），保留本地缓冲、只推齐基线。
- **P2**：`generateUUID` 主路径 `slice` 掉 UUID 的连字符（实际 11 hex = 44 bit，与注释的「12 位 = 48 bit」
  及兜底分支字符集都不符），改为去连字符再截断、兜底也统一十六进制；`base64DecodeUtf8` 改 `fatal: true`
  （非 fatal 会把非法 UTF-8 换成 U+FFFD 后照常返回，绕过同步侧的损坏护栏）；五处原型链查表改
  `Object.prototype.hasOwnProperty.call`（chordSort 音名表、chordName 简写表、iconSizes 两个档位表、
  BaseIcon 注册表）；高对比主题 `--bg-disabled` 沿用亮色公式，深底下失效控件比所在面板更亮
  （dark 主题已就同一反转论证过），改取「面板底朝页面底压深一半」。
- **测试**：`sampleBackup.test.ts` 原先 `expect(migratePayloadVersion(SAMPLE)).toEqual(SAMPLE)` —— 迁移链
  返回浅拷贝、内层与入参共享引用，等于拿 SAMPLE 与自己比而恒真；改为喂 `structuredClone` 并顺带钉住
  「迁移链不改入参」；`useWorkbenchPanelExpanded.test.ts` 的「落盘为 expanded 字面量」靠的是被明令禁止的
  「初始化写默认值」，改为先收起再展开真正走写入 watch，并补一条生产形态（不传 storage）用例；
  `repositories.test.ts` 补分组顺序往返用例、事务 store 清单同步为三库。
- **另**：`tests/setup.ts` 新增的 popover 桩缺 node 环境守卫，在 logic project 里引用 `HTMLElement`
  直接抛 `ReferenceError`，整套 domain / data / stores 用例在收集阶段就红（该桩属并行进行的 top-layer
  迁移，此处只补 `typeof HTMLElement !== 'undefined'` 守卫一行，未动其实现）。
- 验证命令：相关子集 `vitest run` 覆盖 `tests/tokens` / `tests/data` / `tests/domain` / `tests/ui` /
  `tests/composables` / `tests/platform` / `tests/stores` / `tests/utils` → 除当时并行进行的 top-layer
  迁移留下的 3 处引用（`floatingZ` 模块已删、`focusRingOverlay.ts` 仍引用、`floatingZ.test.ts` 残留，
  已在那一轮收口）外全绿，909 条通过；`colorTokens.test.ts`
  24 条（含高对比主题对比度门禁）全绿；`eslint --max-warnings 0` 与 `prettier --check` 对 19 个改动文件
  0 问题；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 罗马数字后缀数据补项、md5 清单守卫、三处假绿测试、类型检查 8 处（2026-09-29）

- **`data/chord-qualities.json` 13 个 token 缺 `romanSuffix`**：`dom7flat5` / `maj7flat5` / `aug9` /
  `aug13` / `dom7flat13` / `min9flat5` / `maj9sharp11` / `maj7sharp11` / `dom7sharp9` / `dom7flat9` /
  `dom7sharp11` / `dom9sharp11` / `dom13sharp11` —— 后缀缺失时级数只剩光秃秃的数字（C7b5 在 C 调显示
  `I` 而不是 `I7b5`）且无处报错。取值与本表既有口径对齐（`maj7`→`maj7`、`aug7`→`+7`、`halfDim7`→`ø7`），
  并补 12 条度数断言作回归锚点；`min9flat5` 的两个写法（`m9b5` / `ø9`）实测在解析链里会被折成半减七，
  属另一条独立缺口，刻意不纳入本组（否则等于把它的现状固化成期望）。
- **md5 剔除字段清单加一致性守卫**：前端 `payloadChecksum.ts` 与 worker 的重算分支各手写一份
  「先 delete 再序列化」的字段清单，此前只比 md5 实现、不比清单，两侧不一致只在运行期 `console.warn`
  一声照常落库。新增用例从两侧源码各抽一次清单比对，并自检「是否真抽到清单」（任一侧改成别的写法会
  落空成空集，那样这条断言会退化成空集相等的恒真式）。
- **审计候选测试的三处假绿**：`synthEngineNative` 的钳位用例把 mock 时钟冻在 0，「钳到当下」与
  「钳到常量 0」因此不可区分（整段钳位写成 `return 0` 也绿）→ 改冻在 12.5 并断言下界；
  `backupCrypto` 从无断言读 `secrets.iter`（迭代数降到 1000 仍绿）→ 补 `v === 2` 与 `iter >= 600k`
  下界断言（不用常量比对，避免用被测常量断言自己）；`repositories` 声称验证「从 chordName 派生
  nameSegments」却只断长度 → 补派生断言，并补一条「三条同指纹记录只留首条、其余全部进重定向映射」用例。
- **类型检查 8 处错误（`defineModel` 迁移残留）**：`ChordEditorDrawer`（2）、`ChordPickerPanel`（3）、
  `BaseFloatingPanel`（3）三处已声明 `defineModel('visible')`，却仍按 `props.visible` 访问 ——
  model 声明下 `props` 上没有这个键。统一改为 `visibleModel.value`；其中 `BaseFloatingPanel` 的
  `onActivated` 里那处由本轮审计修复引入（沿用了旁边既有写法），其余 7 处是迁移残留未收尾。
  `ref(visibleModel.value)` 的初始快照按仓内既有先例标注 `vue/no-ref-object-reactivity-loss` 豁免。
- 验证命令：相关子集 `vitest run tests/app tests/data tests/domain tests/ui tests/worker/md5.test.ts`
  全绿（另有 `tests/tokens`、`tests/stores`、`tests/composables`、`tests/utils` 分批全绿）；
  `eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；类型检查由用户执行全量 `vue-tsc`
  发现上述 8 处、修复后未再跑全量；全量关卡按禁令未代跑。

### 修复 · 门禁假绿族：四处门禁失效、关卡补 `guidance:check`、模板去掉手抄份数（2026-09-29）

- **`bench.mjs`：本次实测为 0 判 ✓**。这份基准表每一项都是「一次调用的耗时（ms）」，真实跑数不可能恰好为 0，
  出现 0 只意味着测量点失效（该段代码没被走到）—— 而 `ratio = 0` 会一路判通过，哨兵在最该拦的形态下
  静默放行。改为 `value <= 0` 计失败并指向重录。
- **`prettier-format.mjs`：进程被信号杀死报成功**。`child.on('exit', code)` 在信号终止时 `code` 为 `null`，
  一路传到 `process.exit(null)` 即等同退出 0 —— 崩溃的 format 对调用方（HUSKY / CI）表现为通过。
  改为折算成非零（固定取 1，避免伪造出一个恰好落在 `CRASH_EXIT_CODES` 里的码、触发无谓的降并发重试）。
- **`verify-stamp.mjs`：脏工作区也落免检凭证**。凭证记的是 HEAD 树哈希，而 verify 读的是工作区 ——
  工作区带未提交改动时，那次绿跑证明的是「HEAD + 那些改动」，落凭证等于替一份从未被完整验过的提交内容背书。
  改为 write 前检查 `git status --porcelain`，脏则不落（静默跳过，不影响 verify 自身的退出码与结论）。
- **`compress-images.mjs`：缺源图退出 0**。源图缺失时一个产物都没生成，却与「全部生成成功」在调用方
  （CI / 手工串联的命令行）眼里毫无区别；改为 `exit(1)`，提示同步由 `warn` 升为 `error`。
- **`dev-webdav-proxy.mjs`：IPv6 回环判据按字面量比较**。回环 / ULA / 链路本地都有等价展开写法
  （`0:0:0:0:0:0:0:1`、`FD00::1`），只比字面量会把它们当成公网地址放行，与文件头的 SSRF 防护口径相抵触。
  改为先经 WHATWG URL 规范化再比较（自带合法性校验；带 zone id 的 `fe80::1%eth0` 这类 net 认、URL 不认的
  形态退回原文比较，不放行）。已用 11 条用例验证（等价写法 + 两条公网地址反向用例）。
- **关卡补 `guidance:check`**。`AGENTS.md` 与 `.codebuddy/rules/` 都是 `rules/` 的派生文件，而 `verify.mjs`
  的步骤表与 CI 都没有这条一致性检查 —— `HUSKY=0` 绕开钩子提交一份与 `rules/` 失配的 `AGENTS.md`
  （或直接手改派生文件）此前无人发现。两侧各补一步（插在 `changelog:check` 之后，同属廉价只读门禁），
  并同步 `rules/03-scoped-verification.md`、`CONTRIBUTING.md` 与两处脚本头注里的步数/清单。
- **模板写死份数**。`scripts/guidance/AGENTS.template.md` 里「9 份正文」是手抄的（生成器已有
  `{{RULES_COUNT}}` 占位符，同文件另一处就在用），`rules/` 增删后份数会自相矛盾而 `guidance:check` 仍绿；
  改用占位符，并重跑 `pnpm guidance:build`（`guidance:check` 通过）。
- 验证命令：六个改动脚本逐个 `node --check` 通过；`pnpm guidance:build` + `pnpm guidance:check` 通过；
  IPv6 判据的 11 条用例经内联脚本验证（该脚本无测试锚点、判据未导出，无法挂单测）；
  `eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；`pnpm bench` 属全量验证禁令范围未代跑
  （只改判定分支，未动测量与基线）；全量关卡按禁令未代跑。

### 修复 · CI 侧 `guidance:check` 恒绿：install 的 prepare 先重写了它要比对的那份（2026-09-29）

- **缺口**：上一轮补的那道 `guidance:check` 在 CI 里恒绿 —— `pnpm install --frozen-lockfile` 会跑根级
  `prepare`（`node scripts/build-guidance.mjs && husky`），而那正是生成器的**写盘**分支：轮到
  `guidance:check` 执行时，`AGENTS.md` 早已被重写成「由 `rules/` 现算出来的那份」，再拿它跟 `rules/`
  比对，比的就是它自己。提交里那份 `AGENTS.md` 有多陈旧都判绿，于是「`HUSKY=0` 绕开钩子提交一份与
  `rules/` 失配的 `AGENTS.md`」这条路径在远端没有任何关卡 —— 而那份文件正是宿主每次会话注入上下文的
  那一份。`--frozen-lockfile` 下 `prepare` 仍会执行，已实测确认（本地与 `CI=true` 两种环境均执行）。
- **修法**：不改安装语义，在 `guidance:check` 之后补一步**只看 git、不看盘上内容**的检查
  （`git diff --exit-code --stat -- AGENTS.md`）：install 之后工作区若被改过，只可能是 `prepare` 重写了
  它，即提交里那份与 `rules/` 已失配。两步互补 —— install 重写了文件时这条有效，没重写时上一步有效。
  未采用「CI 安装改 `--ignore-scripts`」：那会连带跳过 `pnpm-workspace.yaml` 的 `allowBuilds` 白名单里
  必须构建的依赖（`esbuild` / `workerd` / `unrs-resolver` / `@parcel/watcher` / `vue-demi`），
  CI 的 lint 与 build 会直接挂。
- **另两处口径**：`.codebuddy/rules/` 侧的「残留副本」检查在 CI 里也近乎空转（干净克隆里该目录不存在、
  由 install 刚生成，生成时不会有残留）—— 它的价值在本地，已在 CI 注释里写明；`.husky/pre-commit` 里
  「本地可被 `HUSKY=0` 绕过、远端那次不能」那句针对的是 `Changelog check`，那半句仍然成立
  （`prepare` 不生成 `.github/CHANGELOG.md`），失配的只有 guidance 这一侧。
- 验证命令：`prettier --experimental-cli --check .github/workflows/ci.yml` 0 问题（同时确认 YAML 可解析）；
  `pnpm guidance:check` 通过；跑一次写盘分支后 `git diff -- AGENTS.md` 为空 —— 生成器输出与 checkout
  出来的字节一致，这条检查不会在正常提交上误报（`.gitattributes` 已把 `*.md` 钉成 LF）；drift 检查的
  退出码语义（干净 exit 0 / 被重写 exit 1）在隔离仓库验证；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 修复 · 乐谱排序方式在水合窗口内被读成默认档且永不回填（2026-09-29）

- `songStore` 的 `readSongSortMethod` 直接拿 `kvGet` 的 `null` 当「用户没存过排序方式」，而 `kvGet`
  在水合前一律返回 `null`（与「键确实不存在」不可区分）—— 启动链路有超时兜底（`main.ts` 的
  `Promise.race`），故「store 初始化早于 kv 水合完成」是可达路径：IDB 打开被拖慢时，用户存的
  `title` / `updatedAt` 会被读成 `manual`，且此后没有任何回填，列表顺序凭空回到手动档。
- 修法：`readSongSortMethod` 先以 `isIdbKvHydrated()` 摘掉未水合这一种（成文要求，`App.vue` 与
  `settingsStore` 早已照此办理）；store 内再挂 `onIdbKvHydrated` 补读一次真值，并注销该监听。
  窗口期内用户若已手动选过排序方式（`setSongSortMethod`），以用户那次为准、不被回填覆盖。
- 顺带统一 `overwriteSongs` 的调用口径：备份导入与云端拉取两处裸调补 `void`（`DevPanel` 那处早已是
  `void`，同文件 `reorderSongs` 也为同型裸调专门论证过），避免未处理的拒绝在这两条 fire-and-forget
  路径上静默逃逸。
- 验证命令：`eslint --max-warnings 0` 与 `prettier --check` 对三个改动文件 0 问题；相关子集
  `vitest run tests/stores/songStoreOverwrite.test.ts tests/data/syncApplyOverwrite.test.ts tests/app/backupModalActions.test.ts`
  共 15 条全绿；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 审计清单二批 P1 九条：导出凭据窗口、同步 meta 缺失防线、行尾和弦丢失等（2026-09-29）

- **备份导出的凭据明文窗口**：`handleExportConfirm` 把 `modalData.exportSelection` 活引用直接传进
  `triggerFullExport`，执行链内多个 `await` 期间用户改开关会改到在途那次导出的判据 —— 勾了「同步配置」
  再取消勾选，会产出**含明文 Token 的备份文件**。确认侧改传浅拷贝（与导入路径同一手法）；
  导出弹窗的三个开关与密码框在 `exportBusy` 期间禁用，窗口本身收掉。
- **同步上传缺「云端 meta 缺失」防线**：云端有数据本体但 `fetchMeta` 返回 null（meta 机制上线前上传 /
  `pushMeta` 曾失败未补写）时，推送前的两道新旧判定整体短路，后传者会静默顶掉别的设备的新数据。
  补一道：meta 缺失且 `provider.exists()` 为真即抛 CONFLICT 引导先拉取（拉取后本地与云端一致，
  identical 短路自然解锁上传）；云端确无数据时 exists 为 false，首次上传不受影响。
- **ChordPro 行尾和弦整批消失**：内联解析对行尾 `[C]` 发出的 char 槽 index === 行长，导入端
  「index >= 行长」越界守卫把它整批丢弃且照样报「已导入乐谱」。改为标签后无可见文本时发 `end` 槽
  （序号递增，与行首 start 的既有口径同构），导入后在行尾正常显示。
- **裸三和弦被当「未知性质」豁免调内判定**：`chordTonesAllInKey` 对空性质直接返回 true ——
  C 大调里 D（实含 F#）被误判成调内 II。空性质按大三和弦语义走音集判定；
  无法识别的性质仍维持「不定罪、交由根音判据」的原口径。`chordDegree.test.ts` 补 6 条回归锚点。
- **转录被「解析不出值」的旧键整批卡死**：GROUPS / CHORD_LIST 键内容为空串或坏 JSON 时
  `parseJson` 得 undefined，validate 以「字段必须为数组」整批拒绝 → 转录每轮早退、实体 / kv /
  退役标记全不迁移，用户只见空库与一条 error 日志。改为仅对「解析不出任何值」的键按无分区处理
  （解析成功但不是数组的仍如实拦截——字节完好可能可抢救），坏键源键保留供人工排查。
  `migrateLegacy.test.ts` 补对应用例（含「解析成功但非数组仍拦截」的既有口径锚点）。
- **guidance 生成器的杂散文件守卫空转**：strays 检查在 `endsWith('.md')` 过滤之后做，
  `09-xxx.markdown` / `.MD` / `.md.bak` 这类命名从两份出口同时消失而 `guidance:check` 恒绿。
  改为对 rules/ 全量文件按「形似准则正文」（`*.md` / `*.MD` / `*.markdown` / `*.md.*`）收守门。
- **package.json 缺 engines**：CONTRIBUTING 与 deploy-worker 注释都声称按 Node 22 钉，字段不存在；
  补 `"engines": { "node": ">=22.13" }`（pnpm 11.20 的内建 `node:sqlite` 下限）。
- **两处测试假绿收口**：`transposition.test.ts` 的「保留性质与扩展」用例补 extensions 逐位断言
  （transpose.ts 记录过的 `{ ...e }` 摊平事故退回旧实现时必须红）；`chordCorpus.test.ts` 两组
  `it.each` 的输入由被测过滤器算出，退化即 0 用例整片报绿，各补条数下限守卫哨兵。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；`vitest run` 覆盖
  migrateLegacy / textCodec / chordDegree / transposition / chordCorpus / syncMd5Identical /
  backupModalActions 共 349 条全绿； `guidance:build` + `guidance:check` 通过（strays 重构后正常路径
  派生产物逐字节不变）；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 审计清单三批：导入白名单真正生效、`dark:` 变体挂回主题类、变体高亮改用判等口径（2026-09-29）

- **清洗层的「仅保留已知字段」承诺落空**：`payload.ts` 的门禁 schema 只做结构判断（`parsed.data`
  一律丢弃、原对象整体交给内核），而和弦内核 `sanitizeChordEntity` 用 `...(raw as unknown as ChordDraft)`
  展开入参 —— 外来备份里的**任意未知键**会被一路带进实体、落盘并长期驻留；IDB 载入路径同样经过它，
  脏键因此永不自愈。改为逐字段显式搬运的白名单构造（`chordName` 只在本就是字符串时搬运，它是
  `normalizeChord` 迁移分支的输入、读后即删；`capo` 已在 `fretOffset` 归一里消费掉）。
  门禁注释同步改成「门禁只管结构、收口在内核」，不再宣称 `.strip`。
  `payloadValidation.test.ts` 补一条未知键不得入库的回归锚点。
- **`dark:` 变体挂在系统偏好上，而不是本项目的主题**：Tailwind v4 内置 `dark:` 是
  `@media (prefers-color-scheme: dark)`，而本项目的主题真相是 `<html>` 上的 `.dark` / `data-theme`。
  BaseCheckbox 的未选中底（`dark:bg-(--bg-surface)`）因此两头都错：用户显式选浅色、系统恰是暗色时
  它照常命中（取到亮色档的 `--bg-surface`）；用户显式选深色、系统是亮色时它**从不命中** ——
  那正是为深色主题写的覆盖。在 `tailwind.css` 注册 `@custom-variant dark (&:where(.dark, .dark *))`
  让 `dark:` 与令牌层同源（已在隔离编译里确认产物由媒体查询变为类选择器）。
- **工作台变体高亮认错对象**：`WorkbenchVariantsPanel.isActiveVariant` 用裸 `computeChordFingerprint`
  判「当前草稿是哪个变体」，而指纹**不含横按** —— 草稿在编辑器里被就地改写，只加一条横按时指纹完全不变，
  于是这份草稿被判成与「未加横按的那个变体」同一个，卡片高亮与 `v-scroll-into-view` 一起锚错。
  改用判等口径的 `areChordContentsEqual`（指纹 + 横按含标指），顺带去掉重复的 `fretOffset` 比较。
- **`server` 目标的归属提示放走最危险的误判**：`isUsingBuiltinAuthorTarget` 按「持久化 `serverUrl`
  是否为空」判是否内置源，但后端地址由构建环境注入（`registry` 恒传 `CLOUD_SYNC_CONFIG.SERVER_URL`），
  那个持久化字段**没有任何请求路径读它**。用户以为自己连的是自建后端、实际拉的是作者线上示例数据时，
  恰恰拿不到那条归属提示。改为恒为内置源并写明理由（自建部署改 `VITE_SYNC_SERVER_URL` 时同样成立）。
- **顶栏窄屏「更多」菜单的同步组改为字面复用**：它此前把 `syncMenuItems` 的四个条目逐字重抄一遍
  （注释却自称「完全同源」），两处迟早漂移。改为直接映射宽屏那一份，只把末项 `divided` 置 false ——
  窄屏它后面还跟着「外观」，照抄会在菜单中间多出一条悬空的线。`getSyncProviderMeta` /
  `SYNC_PROVIDER_*` / `settingsStore` 三处随之从该文件退场。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；相关子集
  `vitest run tests/domain tests/stores tests/data tests/app tests/ui` 全绿（含新增锚点）；
  `dark:` 变体经 `tailwindcss` 的 `compile` 隔离编译核对产物选择器；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 调整 · 死码与文档对齐：四处测试独占 API 标注、三处永不触发的事件与死包装删除（2026-09-29）

- **治理道步数对齐**：`.github/CONTRIBUTING.md` 的等价命令清单漏了 `guidance:check`（列表 9 项却自称
  「同一组 10 步」）、pnpm 要求写作「≥ 9」（实际由 `packageManager` 钉 11.20.0）、并建议补 Playwright
  E2E（`package.json` 无该依赖、CI 也无对应步骤）；`.husky/pre-push` 与 `rules/03` 同样把 10 步写成 9 步，
  且 `rules/03` 漏记 CI 独有的 `Guidance drift check`。四处一并按真源改齐，`pnpm guidance:build`
  重生成 `AGENTS.md` 与 `.codebuddy/rules/` 后 `guidance:check` 通过。
- **ChordCard 的四个事件永不触发**：右键菜单改由 GroupSection 的列表级委托持有后，卡片只剩 `select`
  会抛，而 `delete` / `move` / `delete-variants` / `open-references` 的声明与父组件上的四条 `@` 绑定都还在
  —— 挂上它们不会报错，也永远不会收到事件。声明与死接线一并删除（菜单侧走 `useGroupSectionMenus`
  的 `emit`，不受影响）。
- **scoreEditorStore 的三个零消费者槽位操作**：`copySlotChord` / `moveSlotChord` / 只服务于它们的
  `peekSlotChord` 已无调用方（拖拽改走 `swapSlotChords`），删除后连带收掉 `getEdgeChords` /
  `lineCharChord` / `ChordId` 三处导入。
- **`buildBackupPayload` 死包装**：唯一消费者是 `syncPayloadSecurity.test.ts`，改为直接用
  `buildBackupPayloadResult` 后删除该导出。
- **`Recipe` 的两个只写不读字段**：`commonness`（连同其唯一消费者 `weightOf` 的导入）与
  `extensionCount` 在识别链里从未被读过，删除；评分改口径时它们只会误导后来者以为「公式还用着它」。
- **测试独占 API 就地标注**（保留、不删，但把「零生产调用方」写进注释，免得被当成可删或可依赖）：
  `preferredHit`、`areBarresEqual`、`parseQualityAst` / `parseChordNameAst`、`getChordDegree`
  （连同侧栏搜索框那句「支持名称与和弦级数检索」的失实文案一并改掉）、`executeUndoRestore`
  （用户可见的撤销走 toast 的 `restoreChords`）、以及 `useAudioPlayer` 的三个 `*ScorePlayback`
  —— 整条乐谱序进播放链完整且被测试覆盖，缺的是乐谱侧那个播放按钮，接线前不要当成死代码删掉。
- **`sanitizeSongList` 的孤儿剪枝说明**：生产路径不传 `validChordIds`，剪枝只在测试里生效 ——
  写明这是跨层取舍（score 域拿不到和弦全集，传不完整的 id 集比不剪更危险），以及真要启用时的合法模式。
- **补两条数据安全用例**：`chordStoreWriteGate.test.ts`（未水合时 `persistAll` 不得落盘，含水合后
  真落盘的正对照）与 `syncHydrationGate.test.ts`（两个 store 就绪门禁：等过一次水合仍不就绪时
  推送不构建载荷、不发起上传，拉取不取云端数据，含就绪时照常走完的正对照）。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；`vitest run` 覆盖
  domain / stores / data / app / ui 共 45 文件 671 条 + 新增两文件 5 条全绿；`guidance:check`、
  `changelog:check` 通过；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 死令牌档清退、半减九和弦不再折叠、原型链查表收窄（2026-09-29）

- **死令牌档清退**：`--shade-{primary,danger,warning,success,info}-20`（五族压深档）与
  `--color-success-rgb`（三主题各一份）全仓零消费，一并删除。仍在用的两族保留：`--shade-*-12`
  （ghost 悬停前景）与 `--color-{primary,warning}-rgb`（ChordCard / FretboardSvg /
  BaseSegmentedControl / ChordAnalysisPanel 的投影）。`tokens/shade.ts` 的 `SHADE_WEIGHTS`
  随之退化为单一权重常量；`light.ts` 里「`--color-{danger,info}-rgb` 为何不声明分量」的说明改写为
  一条共同理由 —— success 此前声明过一份，同样零引用，与另两个色同档处理。
- **`Cø9` 不再静默折叠成 `Cm7b5`**：`chordName.ts` 的半减七分支只看三/五/七音，而 `min9flat5`
  那枚九音挂在 token 的 `ast.extensions` 上、`trailing` 为空 —— 于是 `Cø9` / `Cm9b5` 被折成 `Cm7b5`，
  **九音连同 extensions 一起丢失**，`data/chord-qualities.json` 里 `min9flat5` 的 `romanSuffix:"ø9"`
  也因此永远取不到。分支补上「token 未自带扩展音」判据后，两条入口都归到 `min9flat5`、后缀取到 `ø9`
  （`Cø9` 保留输入写法，`Cm9b5` 归一到 `m9b5`）；带尾随张力音的 `Cm7b5(b9)` 结果不变 ——
  它走 recognized 分支，spelling 本就是 `m7b5`、b9 在 trailing 里单列。
  `tests/domain/chordDegree.test.ts` 原先因这个缺口刻意把 `min9flat5` 排除在外，现登记回本组。
- **原型链查表收窄**：`chordDegree.ts` 的调名根音查表（`key` 完全由调用方给出）与四处 UI props
  查表（`BaseBadge` 尺寸档 / `ActionButton` 图标尺寸档 / `GlobalNotification` 等级图标与着色 /
  `BaseDrawer` 尺寸档）改用 `hasOwn` —— 裸查表会把 `constructor` 这类继承键命中成 truthy 的
  `Object`，`?? 默认值` 兜不住。与 `iconSizes` / `chordSort` 的既有口径对齐。注意 `chordDegree.ts`
  真分支里那枚 `?? 0` **不能省**：`ROOT_PITCH_MAP` 是索引签名表，`noUncheckedIndexedAccess` 下索引
  一律返回 `number | undefined`，而 `hasOwn` 的谓词把键收窄成 `keyof Record<string, number>`（即
  `string`）拦不住它 —— 它只负责挡原型链，不负责挡 `undefined`。
- **根 `.workbuddy` 占位文件改回入库**：`.gitignore` 里那条无斜杠的 `.workbuddy` 把它连同目录一起忽略，
  于是克隆后的仓库**没有**这层 ENOTDIR 护栏，`rules/05` 第 3 条引用的那份说明也悬空。带斜杠的
  `.workbuddy/` 只匹配目录、正好放行这个同名文件，故删掉多余那条并就地写明不要补回来。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run tests/domain tests/data tests/stores tests/core` 50 文件 670 条、
  `tests/ui tests/domain tests/tokens` 41 文件 678 条、`tests/tokens/colorTokens.test.ts` 24 条全绿
  （含新增 2 条 `Cø9` / `Cm9b5` 级数锚点）；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 核查 · 审计「类级」四项经实测无需动作（2026-09-29）

- **死 barrel**：`src/domains/{chord,fretboard,score}/index.ts` 与 `src/platform/{ui,utils,store,services,
directives}/index.ts` 确实零导入，但前者是 `.github/CONTRIBUTING.md`「目录结构」明文规定的**模块清单**
  （「领域根 index.ts 仅为模块清单，不作导入入口」），后者是「公共出口 / 门面」定位 —— 都属有意保留，
  不是遗留死码。
- **过度导出**：实测 1338 个导出符号里 223 个零外部引用，但其中 222 个**在本文件内被使用**
  （导出多余却无害，且大半是配套 API 的类型导出，收窄反而让调用方无法标注）；剩下 3 个同文件也未用的
  （`listMorphPairs` 调试 API、`isUndefined` 通用工具、`MESSAGE_WARNING_DURATION_MS` 提示时长表）
  均带「供未来使用」性质的注释，属有意保留。
- **跨文件逐字块**：连续 6 行的跨文件逐字匹配只有两类 —— 顶栏/侧栏的 ActionButton 触发按钮模板片段
  （UI 结构的自然重复，抽组件属审美重构），以及 composable 的 `return {…}` 与调用方解构列表
  （标准用法，被滑动窗口切成 20 段正是审计那个「约 20 组」的来源）。没有可收敛的真实重复。
- **裸审计编号**：`§` / `第 N 节` 的命中全部落在 `changelog/` 已提交片段，按 `AGENTS.md` 的说明属
  历史记录、明令「不要去修正」；`src/` / `scripts/` / `tests/` 已无活引用。
