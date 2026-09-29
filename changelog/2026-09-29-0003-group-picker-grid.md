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

### 修复 · 指针归属族（七处 + 长按一条）（2026-09-30）

- **共同缺陷**：拖拽/长按期间挂在 window / document 上的 pointermove / pointerup 监听不认 `pointerId`，
  触屏第二根手指一落下即串台 —— 它的移动被当成在途手势继续改值/改落点，它的抬起又会顺手结算。
- `useSliderInteraction`：记发起拖拽的 pointerId（`startDrag` 增参、`BaseSlider` 三处模板调用同步下发），
  move / up 只认它；已有在途拖拽时新按下不接管。
- `BaseNumberInput`：长按连发的停止回调改为带事件、只停发起那一指；已有在途连发时新按下不接管
  （原先第二指按下会先把第一指的连发停掉，随后又只清它自己的 id，计时器就此悬空）。
- `useSegmentedDrag`：拖动会话记 pointerId，move / up 只认它，`abortDrag` 与收尾同步清空。
- `vScrollbar` 的 `scrollbarDrag`：已有在途拖拽时忽略新的 pointerdown —— 否则第二指会抢走指针捕获、
  把起点覆盖成它按下时的位置，第一指的拖动当场跳到别处。
- `useSortableList`：三个 document 级监听（全页共用一份）统一按 pointerId 归属 —— 按下记 id、move 只认它、
  抬手/取消走新增的 `onPointerEnd` 只认它并清空在途标记（`preview` 的按压起点与长按登记因此不再被第二指重置）。
- `useSortableList` 长按的另一条：菜单弹出时**就地**置「吞掉紧随的 click」。此前只靠 sortable 的 onEnd 置位，
  而卡片不在 handle 上、或实例被禁用时这次手势根本不经过 sortable，onEnd 永不执行 ——
  抬手 click 直达业务，菜单与卡片选中同时发生。
- `BaseSwitch` 与 `lyrics-drag` 的 `dragSession` 经核实**已自带**同口径守卫（`activePointerId` /
  `isEventForActivePointer`，后者含「拖拽中放行任意 id」那条已修不变量），本次未重复改动。
- 验证命令：`vitest run tests/ui tests/domain` 684 条通过；新增长按用例后
  `useSortableListClickSuppression` 4 条通过，并做变异检验（移除那处置位后**只有**新用例报红，恢复后全绿）；
  `eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；类型检查需用户跑全量；全量关卡按禁令未代跑。

### 修复 · 省略标记可与基础性质组合：半减七路径不再抹掉 no3（2026-09-30）

- 实测边界（先跑探针再动手）：`maj9no3` / `maj9(no3)` / `M7no3` / `7no3` / `7(no3)` / `G5no3` / `m7no3`
  等组合写法**当前已可解析、可存、可往返** —— `parseQualityWithToken` 的尾随循环里已含省略标记那一支，
  `notationOnly` 只影响识别候选、不影响写法解析。真正坏的只有 `m7b5no3` / `m7b5(no3)` 一族。
- 根因：`nameToSegments` 的半减七提前收敛分支（`isHalfDiminished(ast) && !ast.extensions`）只读
  third / fifth / seventh 三个槽，把带 `omitThird` 的 AST 也当成裸半减七收敛成 `'m7b5'` —— 省略语义
  整段丢失，存回去再读被撤掉的三音就回来了（`Gm7b5no3` 往返成 `Gm7b5`，音集由 [0,6,10] 退回 [0,3,6,10]）。
- 修法：该分支把省略标记列为例外（带 `omitThird` / `omitFifth` 时落 recognized 分支，由含省略标记的
  spelling 作 quality），与 `maj9no3` 走同一条路；非省略路径（裸 `m7b5`、`m7b5b9`）行为不变。
- 写法口径：省略标记的**规范形态改为带括号**（`maj9(no3)` / `13(no3)` / `m7b5(no3)`）—— 它前面常常
  就是个数字，不隔开既难读、也容易被读成度数的一部分；与张力音那条「收敛掉括号」（`C7(#9)` → `C7#9`）
  刻意分成两条口径（`#9` / `b13` 紧跟性质、不粘连）。解析端两种写法照旧都收（`Gmaj9no3` 能解析），
  只是规整到带括号这一种形态；`chordSegments` 的用例两种输入各占一组。
- 两点实测澄清，均未改动：① 两个省略标记同时出现（`7(no3)(no5)`）能解析，但被自洽性规则拦下
  （撤掉三音与五音后只剩根音与七音，`isSelfConsistentQualityAst` 判讲不通）→ `isValidChordName` 为 false，
  属另一条规则；② 推导端仍不出 no3（`notationOnly` 有意排除在候选生成之外），本次未触碰识别候选。
- 验证命令：`vitest run tests/domain tests/data tests/stores tests/ui` 785 条通过；`chordSegments` 新增
  2 条用例（9 个组合写法的解析 / 往返 / 音集，以及裸半减七的回归）；`eslint --max-warnings 0` 与
  `prettier --check` 对改动文件 0 问题；类型检查需用户跑全量；全量关卡按禁令未代跑。

### 功能 · 省略读法进入识别候选：`Gmaj9(no3)` 这类指型可推导（2026-09-30）

- **背景**：`no3` / `no5` 在 token 表里是 notationOnly（不进识别候选）—— 三音缺席的解读本就不唯一，
  只有根音与三音的音集该读成裸三和弦。代价是「含七音/张力音但撤掉三音」的指型推不出完整读法：
  `G A D F#` 用 sus2 解释会把 F# 丢成 extra、用裸三和弦解释又缺 B，于是引擎退化成 `Gsus2`(p0.75) /
  `G5`(p0.50)；**不标注主音**时还会读成 `D/G`（D 大三和弦 + G 低音，四音全保但根音错位）——
  同一指型标注与否给出两种读法。
- **做法**：候选池新增「基础配方 + 撤三音」的省略变体，只对**含七音**的配方生成 —— 此时和弦性质已被
  张力音锁定，省略三音是唯一自洽的读法（`G A D F#` 里的 F# 排除了 sus2）。运行时判据与叠加音相反：
  要求该音**不在**音集里。`no3` 自身仍不进候选，notationOnly 那条约束不变。
- **让位规则（两级）**：① 同一根音内已有常规完整解释时，省略读法**整体出局** —— `Cm7` 不会被
  `C7#9(no3)` 抢走（两者音集逐音相同：`Eb` 既是小三度、也是升九度）；② 排序列里同分时，不靠
  「撤掉某个音」解释的写法优先。
- **用户可感知**：`G A D F#`（6弦3品 G / 4弦4品 F# / 3弦2品 A / 2弦3品 D）现在推出 `Gmaj9(no3)`
  （并列 `GmMaj9(no3)`，均 purity 1.000），且**自动判根音落在 G** —— 标注主音与否结果一致。
- **取舍（2026-09-30 裁决）**：跨根音层面省略读法可与转位全保读法竞争，语料 `{A,G#,B,E}` 的裁决
  由 `E/A` 改为 `AmMaj9(no3)`（A 根音下同样只有省略读法，E 根音是转位）。这条是「省略读法参与
  竞争」的既定后果，语料已按新口径重写并注明与 `Cm7` 那条的差别。
- **大调系优先**：省略读法内部按「大三度是默认假设」裁决 —— 三音被撤时它没有音作为证据，
  只有根音与三音的音集读大三和弦而不是小三，故 `Gmaj9(no3)` 必须排在 `GmMaj9(no3)` 之前。
  该档**只在两侧都是省略变体时生效**：三音在场的场景（`{G,Bb,D,F,C}` 的 Bb 既可是小七的小三度、
  也可是属七的升九度）仍由分数裁决，否则 `Gm7add11` 会被 `G7#9add11` 挤掉。
  落点是两处：`chordRecognitionAst` 的排序列 + `chordEngine` 的候选序比较器（透传 `omitMajRank`）——
  后者是候选列表真正的排序依据（纯度 → 分数 → **大调系** → 根音 → 配方序）。
- **简写渲染**：省略标记改为**先剥离、主体简写完再拼回末尾**。此前它被直接丢进 AST 的组合兜底，
  于是被揉进骨架与扩展音之间 —— `maj9(no3)` 简写成 `M7no39`（九度被挤到最末、`no3` 卡在中间）、
  `maj7(no3)` 简写成 `M7no3`（括号丢失、与前一个数字粘连）。现在分别是 `AM9(no3)` / `AM7(no3)` /
  `A7(no3)`，与全称同形。落点 `toShorthandQuality`（`segmentsToString` 与 `vChordName` 共用同一实现）。
- 验证命令：`vitest run tests/domain tests/ui tests/data tests/stores` 787 条通过（新增指型锚点 1 条、
  按新口径改写裁决语料 1 条）；`eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；
  类型检查需用户跑全量；全量关卡按禁令未代跑。

### 调整与修复 · 左栏搜索加 trim、浮层指针外点不再抢回焦点（2026-09-30）

- **左栏搜索框加 `v-model.trim`**：走 Vue 的标准修饰符（BaseInput 读 `modelModifiers.trim`，
  与它自有的 `trim` prop 同义），提交点整串去首尾空白 —— 搜索词两端误输的空格不再进入查询。
- **「失焦后又被重新聚焦」**：`BasePopover` 的 `restoreFocus` 判据是「焦点已丢给 body 就归还」——
  那对「面板卸载把原焦点元素带走了」成立，但用户**点页面空白处**时浏览器同样把焦点丢给 body，
  于是关窗那一刻恰好命中该分支，浮层把焦点抢回触发器（现场：输入框聚焦后点页面其他地方，
  失焦了又自己重新聚焦）。改为按关闭入口区分：指针外点（`outside-pointerdown` /
  `outside-contextmenu`）一律不归还 —— 用户主动离开，焦点该留在那里；Esc / 选中项 / toggle
  等入口照旧归还。
- **删掉 `BaseInput` 的 `trim` prop**：它与 `.trim` 修饰符同义（`isTrimEnabled` 原本是两者的或），
  调用方无从判断该用哪个，属同一件事的两条入口。全仓排查后确认**这是唯一一处「prop 与 v-model
  修饰符并存」**——`BaseTextarea` / `BaseSlider` 的 `lazy` 本就只认 `modelModifiers`，
  也没有 `number` / `uppercase` 之类的输入语义 prop。现在 `BaseInput` 的 `.lazy` / `.trim`
  都只走 `modelModifiers` 一条路径（删 prop 前已确认全仓无调用点在传它）。
- **`BaseEditableText` 支持 `.trim`**：和弦名行内编辑（`Fretboard.vue` 的 `v-model.trim`）在提交点
  （失焦 / Enter）去首尾空格。此前该组件用 `defineModel` 却未声明 `modelModifiers` ——
  任何 `v-model` 修饰符在它上面都静默无效（写上去不报错、也不生效）。trim 刻意**只在提交点**做：
  逐键 trim 会让用户在词中间根本打不出空格；且 DOM 与模型一起回写，只改模型的话输入框仍显示
  `Cmaj7` 的原文。该组件全仓只有和弦名一处调用。
- 验证命令：`vitest run tests/ui tests/domain tests/data tests/stores` 794 条通过；
  `eslint --max-warnings 0` 与 `prettier --check` 对改动文件 0 问题；类型检查需用户跑全量；
  全量关卡按禁令未代跑。

### 调整 · 预览分段翻页放开连续滚轮：v-wheel-scroll 新增 stepRepeat 节拍（2026-09-29）

- **v-wheel-scroll 新增 `stepRepeat` 选项**（`platform/directives/vWheelScroll.ts`）：固定步长档此前是
  「一次手势只走一步」—— 同一轮手势（默认 300ms 的 edgeLock 窗口）内的后续事件一律拦截且不位移，
  触控板一次横扫因此只翻一段。新增该选项后，本轮手势内距上一步满该毫秒数就再走一段，未满仍拦截
  不位移；单格滚轮一轮只有一条事件，行为与原来完全一致。缺省 0 = 关闭，即沿用旧口径。
- **step 档的步进基准改为「上一步的目标」**（同文件）：平滑档动画收尾前回读 `scrollLeft` 拿到的是
  插值中的中间值，连续步进若以它累加，每一步都在动画中途重新起跑、越走越短，最后被宿主吸附拉回原
  停靠点。改为按记录在 handler 上的步进锚点推进，判定出新手势即刷新；首次步进与未开 `stepRepeat`
  时与旧算式完全等价。
- **预览分段档启用连续翻页**（`score/preview/components/ScorePreviewPane.vue`）：按页分段的滚轮档位
  传入 `stepRepeat: 300`（`PAGE_STEP_REPEAT_MS`），触控板一次横扫由「只翻一段」变为「一段接一段地
  连续翻页」，单格滚轮仍是一段；上一段未落定就叠下一段的观感由该值取自平滑滚动收尾时长量级规避。
- 验证命令：两个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 均 0 问题；类型检查无文件级
  形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 手写实现改走标准库：id 生成、正则迭代、base64 分块、数值判定（2026-09-29）

- **滚动条宿主 id 改用全仓唯一的 id 生成器**（`vScrollbar/scrollbarOverlay.ts`）：宿主无 id 时此前就地
  拼 `Math.random().toString(36).slice(2, 8)`，是全仓唯一绕过 `generateUUID` 的 id 生成点 ——
  `Math.random` 非密码学随机、字符集与其余 id 分叉，而这个 id 正是拇指 `aria-controls` 的反查目标，
  两处相撞会让读屏把滚动条关联到另一个滚动区。改为 `generateUUID('v-scrollbar-host')`。
- **两处 `while ((m = RE.exec(x)))` 改 `matchAll`**（`score/transfer/textCodec.ts`）：`BRACKET_CHORD_REGEX`
  是带 `g` 的模块级单例，`exec` 循环靠它的 `lastIndex` 推进，而「命中即 return」与任何中途抛错都会把
  `lastIndex` 留在半路 —— 此前靠每次调用前手动复位来规避。`matchAll` 内部拷贝正则，不留这类状态；
  `match.index` 在 `RegExpMatchArray` 上类型可选，故取 `?? 0` 做类型收窄（带 `g` 的正则必然给下标）。
- **备份凭据的 base64 编码补分块**（`app/services/backup/backupCrypto.ts`）：`btoa(String.fromCharCode(...bytes))`
  一次展开整个数组，超过调用栈上限即抛 RangeError；同仓另两处（`utils/common.ts` 的 `base64EncodeUtf8`、
  `utils/transfer.ts` 的 `bytesToBase64Url`）都带 `CHAR_CHUNK_SIZE = 0x8000` 分块，只有这条路径漏了，
  改后三处同一口径。（`Uint8Array.prototype.toBase64()` 是更彻底的标准库替代，但本仓运行环境 Node 22
  尚未提供该 API，测试会直接红，故不采用。）
- **数值判定统一为 `Number.isNaN`**（`ui/input/BaseNumberInput.vue` 两处、`ui/slider/BaseSlider.vue` 一处）：
  全局 `isNaN` 先做 ToNumber，`'abc'` 会被判成 NaN。这三处参数虽已是 number、行为恰好相同，但
  `utils/common.ts` 早已明文定下「不要退回全局 isNaN」的口径，同一个判定不该在仓里有两种含义。
- **同步提交信息的时间戳改 `toISOString()`**（`app/services/sync/syncBase.ts`）：`toLocaleString()` 不带
  locale / options 时输出随运行环境的默认 locale 变，而这条信息会落进云端提交历史、由别的设备读，
  形态必须稳定可读。GitHub / Gitee 的提交信息从此恒为 ISO 8601。
- 用户可感知的变化只有最后一条（云端提交信息的形态），其余四条均为等价替换。
- 验证命令：六个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；相关子集
  `vitest run tests/domain/textCodec.test.ts tests/app/backupCrypto.test.ts
tests/platform/scrollbarOverlayParent.test.ts tests/platform/scrollbarSnap.test.ts
tests/data/syncPayloadSecurity.test.ts tests/data/syncMd5Identical.test.ts
tests/data/syncHydrationGate.test.ts` 全绿；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 工程 · 开发期依赖接入：属性测试、网络层 mock、无障碍回归、真实浏览器项目（2026-09-29）

- **属性测试（`fast-check`）**：新增 `tests/domain/chordTheoryProperties.test.ts`，把语料库钉住的「这几条写法」
  推广到「任意写法 / 任意字段组合」。覆盖三类：性质 AST 的跨字段交互（`omitThird` 与 `third: 'none'`
  在展开层完全等价、`13` 的累积语义两个方向）、名字层往返（渲染幂等、渲染不改音集、结果仍合法）、
  移调不变量（`0` / `±12` 位移同解、移调不改音集、`transposePitch` 的群公理）。断言只取实现**没有**
  构造保证的性质，`all` 升序去重这类由 `Set` + `sort` 直接保证的形态不写。
- **网络层 mock 换 `msw`**（`tests/data/` 下四个同步测试）：原先用 `vi.stubGlobal('fetch', …)` 按**调用次序**
  发牌，「请求打到哪个 URL、用的哪个 method」在测试里完全不可见 —— 改错端点、把 `?ref=` 写丢、
  把 PUT 写成 POST 都照样绿。改为按 method + URL 路由，并开 `onUnhandledRequest: 'error'`
  （未声明的请求直接报错），请求形态成为可断言对象。
- **`msw` 暂钉在精确版本 `2.13.6`（不写 `^`）**：定位期间刻意不改动拦截链的形态（`2.14` 起 frames
  重写），免得给一个未解的问题再叠一个变量；`3.0.0` 亦未采用（刚发布的 major，且会被 pnpm 的
  `minimumReleaseAge` 冷却策略拦住）。
- **三条 `pull()` 用例的 `Body is unusable: Body has already been read`：定位到 undici 的
  「响应体流终结器」并修掉**。这句是 undici 对「流已加锁」与「流已被读」共用的文案，本身不含
  「是谁先动的体」；给原型挂探针记下每条响应体流的**首个消费者**后，拿到的栈是
  `FinalizationRegistry.cleanupSome` → `node:internal/deps/undici/undici` → `ReadableStream.cancel`，
  而 undici 里唯一「在终结器回调里取消体流」的就是 `streamRegistry`：

  ```js
  streamRegistry = new FinalizationRegistry(weakRef => {
    const stream = weakRef.deref();
    if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
      stream.cancel('Response object has been garbage collected').catch(noop);
    }
  });
  ```

  登记点有两处：`Response.prototype.clone()`（登记**被克隆的那个响应**，持有值是该响应体流的
  WeakRef）与 `fromInnerResponse()`（登记新建的响应）。**关键是 msw 的 mock 链会把体流别名出去**：
  `new Response(stream)` 不 tee、直接取用同一条流（实测 `new Response(s).body === s`），而
  「handler 的 `HttpResponse` → http-frame 的 `response.clone()` → 拦截器
  `new FetchResponse(raw.body)`」这条链上每一环都在共享或派生同一条流 —— 于是某个中间 Response
  被回收时，取消会落在**调用方还没读**的那条流上（该失败只在全量 113 文件下出现，
  `--no-file-parallelism` 单进程跑法同样必现，子集一律不复现）。全量跑测时堆更脏，`decodePayload`
  里那次冷动态 import（约 250ms、分配量大）会触发 major GC，正好把中间对象收走 —— 这同时解释了
  「失败恒为该文件内第一个 `pull()`」（唯一付冷 import 的那次）与「子集跑法不复现」，也解释了为什么
  单独造一个窗口（裸 fetch / 带 `AbortSignal` / 带冷 import）复现不出来：探针里那几个中间对象始终
  被局部引用保着。**具体是哪一环被收走不必钉死** —— 修法直接把终结器的效果去掉。

- **修法落在 `tests/setup.ts`**：测试进程里让 undici 不再登记这类体流终结器（判据取登记时的形态
  —— 持有值是 ReadableStream，或其 WeakRef 指向 ReadableStream —— 不依赖 undici 的文案，也不影响
  其他 FinalizationRegistry 使用者）。生产环境没有这条别名（真实 fetch 的响应体只由应用自己持有，
  应用活着就轮不到终结器碰它），故不动产品代码。先前写下的「调用方与 mock 响应共用同一个
  ReadableStream」当时被一次复刻实测否定，现在看是**复刻的形状不对**（漏了「clone 会把原响应的
  流换成 tee 分支」这一步，所以比较时刻已经错开），别名本身是真的。
- 已排除：单 server 顺序起停的状态泄漏、双 server 同时 listen、`AbortSignal`、CPU 满载、
  `onUnhandledRequest` 静默 bypass（这条确实存在 —— 以 `.json` 结尾的 URL 被判为常见静态资源而
  不报错 —— 但与本次失败无关）。
- 为取证加的诊断钩子（`MSW_BODY_PROBE=1`）已按原计划**整块删除**：它的职责是取证，取证完成即退出，
  不再留在 setup 里。
- **无障碍回归（`vitest-axe`）**：新增 `tests/ui/baseSliderA11y.test.ts`，按真实形态（`BaseFormRow` 包
  `BaseSlider`）挂载后跑 axe 默认规则集。选它是因为该组件的可访问名称**完全来自** FormRow 注入的
  `aria-labelledby`：脱离 FormRow 挂载时这条属性整条不渲染，读屏只剩一个没有名字的 `role="slider"`，
  而这类回归在功能测试里看不见。`color-contrast` 规则显式关闭（jsdom 无真实布局，该规则只会去调未实现的
  canvas API）。vitest-axe 0.1.0 的两个 matcher 入口在本仓不可用 —— `extend-expect` 的产物是空文件，
  `matchers.d.ts` 只写了 `export type *`（在 `verbatimModuleSyntax` 下值导入被整条擦除），故只用其
  `axe` runner、直接断言 `violations` 数组。
- **真实浏览器项目（`@vitest/browser` + `playwright`）**：新增 `tests/browser/`，覆盖 jsdom 拿不到真值的
  场景 —— 依赖实际布局尺寸的判定（滚动条显隐）与 `IntersectionObserver` 的真实进出视口行为。
  `pnpm test` 从此只跑 logic + ui 两个项目，浏览器项目走 `pnpm test:browser`（首次需
  `npx playwright install chromium`），以免默认关卡要求先下载 300MB 浏览器；CI 增加「装浏览器」
  与「跑该项目」两步。
- **和弦语料口径审计（`tonal`）**：新增 `scripts/audit-chord-qualities.ts`（`pnpm audit:qualities`），
  把 64 个 token 的配方与 tonal 逐条对照并分类输出。当前结果：音集一致 36 / 真分歧 6 /
  tonal 认配方但不认写法 5 / tonal 未收录 17。它是审计工具、不设退出码（判定要人做）。
- **未采用 `peggy`**：本项目唯一的解析场景是和弦名，已有 `parseChordName` / `parseChordNameAst` /
  `parseChordNameTokens` 三套实现，且其规则依赖 token 表的**运行时**状态（大小写折叠是否安全，取决于
  折叠键有没有别的主人），PEG 表达不了；再引入一套语法是第四套实现，纯负债。依赖已移除。
- 用户可感知的变化：无（本次改动全在测试与工装侧，不进产物）。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --write` 0 问题；
  `vitest run --project logic tests/domain/chordTheoryProperties.test.ts`（12 通过 + 1 todo）、
  `tests/data/{githubSyncProvider,giteeSyncProvider,serverSyncProvider,syncTestConnection}.test.ts`
  （5 / 5 / 8 / 15 通过）、`vitest run --project ui tests/ui/baseSliderA11y.test.ts`（3 通过）、
  `vitest run --project browser tests/browser/scrollAreaLayout.test.ts`（2 通过）；
  `vitest run --project logic tests/data`（10 文件 55 条）、
  `--project logic --project ui tests/data tests/ui`（33 文件 192 条）、
  `--project logic --project ui tests/data tests/ui tests/app tests/core`（46 文件 302 条，再以
  `--no-file-parallelism` 单进程复跑同样全绿）—— 即**子集跑法复现不出**那 3 条全量失败；
  「关掉体流终结器」这条修复另做了 A/B 对照（脚本与探针都跑完即删、不入库）：
  1）纯 node 脚本按「handler 响应 → http-frame 克隆 → 拦截器别名」复刻这条链、丢掉中间对象、
  强制 GC —— 不打修补时读出 `Body is unusable: Body has already been read`（与全量失败逐字一致），
  打上修补后同一脚本读出正常 JSON；
  2）`vitest` 内的探针直接验修补本身 —— 跳过体流终结器登记时 `registry.unregister(token)` 返回
  `false`，其他持有值的登记返回 `true`（证明只挡体流那一类），且「中间响应被 GC 后调用方仍能读体」；
  把修补临时关掉，这两条都会红。
  修复后 `vitest run --project logic tests/data`（10 文件 55 条）与上面那 46 文件 302 条子集都复跑过、
  仍全绿。类型检查无文件级形态、该项未验证；**全量关卡按禁令未代跑** —— 那 3 条全量失败是否消失
  需用户跑一次完整关卡确认。

### 工程 · 依赖接入：深比较 / 快捷键 / Worker RPC 改走成熟库，虚拟滚动与手势库评估后不接入（2026-09-29）

- **接入三个依赖**：`dequal`、`tinykeys`、`comlink`。候选里另三个（`@tanstack/vue-virtual`、
  `@vueuse/gesture`、`@leeoniya/ufuzzy`）评估后判定**不接入**，依赖已一并卸载 —— 装而不接线等于把
  一份不参与产物、也不被任何代码引用的依赖留在 `dependencies` 里，日后只会被误认为在用。包名更正一处：
  `uFuzzy` 在 npm 上的正式名是 `@leeoniya/ufuzzy`（`ufuzzy` 无此包）。
- **深比较换 `dequal`（四处，全仓手写判等已扫尽）**：
  - `platform/ui/selector/BaseSelector.logic.ts` 的 `equalsValue`：原用
    `JSON.stringify(a) === JSON.stringify(b)` 判对象值相等，**受键序影响**（同一份内容换个写入顺序即判
    不等），遇循环引用还会抛错（原代码靠 try/catch 兜成「判不等」）。`dequal` 按键值对递归，并认得
    Date / RegExp / Map / Set / ArrayBuffer；try/catch 保留 —— `dequal` 自身不做环检测，环上会一路递归到
    栈溢出，那个 RangeError 是同步抛出的，仍能兜成同一契约。
  - `domains/chord/workbench/composables/useWorkbenchPanelsOrder.ts`：`storedOrder` 的 deep watch 里
    逐次 `JSON.stringify` 两个面板顺序数组，改为 `dequal`（数组项是字符串，走到逐项比较即返回）。
  - `domains/score/editor/store/useScoreHistory.ts`：删掉手写的 `chordMapsEqual`（16 行）与
    `lineIdsEqual`（5 行），栈顶去重改为 `dequal` 比 `lineIds` 与 `chordMap`。前者要逐层手工对齐
    `ChordLineSlots` 的形状（`char` 比 size + 逐项、`start`/`end` 比长度 + 逐项）—— 这类手写判等一旦与
    结构脱节就是**静默**失效：日后 `ChordLineSlots` 多一个字段而这里忘了补，两边内容不同也会被判成
    「一样」，于是这次编辑不进历史栈（用户看到的是撤销少了一步，没有任何报错）；`dequal` 按结构递归，
    不会与类型定义脱节。
  - `domains/score/library/store/songMeta.ts`：删掉与上面逐字相同的第二份 `lineIdsEqual`（无外部引用，
    也不在 barrel 里），`applySongMeta` 的行序 diff 改用 `dequal` —— 同一个语义不再在仓里有两份实现
    各自漂移。
  - 扫到但**刻意不动**的三处：`useStickyHeads` 的 `sameSet`（5 行 `Set<string>` 谓词，跑在每滚动帧的
    守卫上，专用实现比走通用派发更快也更直白）、`BaseSlider.logic` 的 `isValueEqual`（`number | [n,n]`
    的窄谓词，本就不是深比较实现）、`chord/model/chordContentSignature` 的 `areChordContentsEqual`
    （按**指纹签名串**判等，是刻意的键设计，换成结构比较反而改语义）。
- **快捷键换 `tinykeys`（`platform/composables/useKeybinding.ts`，公开签名不变）**：原先自带一套
  `parseCombo` + 修饰符精确匹配，现由 tinykeys 承担解析与匹配，本函数只留生命周期与业务门控。三处必须
  显式对齐的地方：
  1. `Mod` 要翻译成 tinykeys 的 `$mod`，且修饰符**大小写必须归一** —— tinykeys 逐字比对
     `getModifierState("Control")`，写成 `ctrl` 会永不匹配；
  2. `ignore` 必须自带 —— tinykeys 的默认判据对 `input/select/textarea` 一律忽略，而本项目刻意把
     checkbox / radio / button 这类**非文本** input 排除在外（点过侧栏开关后 Ctrl+Z 仍须生效）；
  3. 合成 `KeyboardEvent` 必须带 `code` —— tinykeys 的 `isKeyboardEvent` 要求 key / code /
     getModifierState 三者齐备（防自动补全派发的非键盘 Event），而 jsdom 里构造的事件 `code` 默认为空串。

  未知修饰符仍在注册期抛错：tinykeys 对认不得的修饰符只会「永不匹配」，写错的快捷键会静默失效。
  新增 `tests/ui/composables/useKeybinding.test.ts`（8 条）钉住上述语义。

- **Worker RPC 换 `comlink`（剪贴板 PNG 转码）**：worker 侧 `expose({ transcode })`、主线程
  `wrap(worker).transcode(blob)`，`{ ok, png, message }` 结果信封与两个消息类型一并删除，失败改为异常
  （comlink 会把 worker 侧抛出的 Error 连 message / stack 还原到主线程）。**超时与「线程起不来」两条
  兜底仍留在主线程**：comlink 既不监听 Worker 的 error 事件（脚本加载失败时那笔调用会永远悬着），
  也没有超时概念。
- **导出渲染 Worker 刻意不换**：它的协议是**流式 + 可中断**（逐页 `page` 上报、`pages-planned` 先报页数、
  `cancel` 置中断标志、空闲 60s 自动 terminate），RPC 的「一次调用一个结果」覆盖不了这些；换过去只会把
  一条已调优的消息协议拆成 comlink 代理回调，收益为负。
- **`idbKv` 的 BroadcastChannel 也不用 comlink**：那条通道是**跨标签页的失效广播**
  （`postMessage({ type: 'kv-update', keys })` → 其他标签页回读对齐内存），发送方不等回复、没有返回值，
  comlink 的 promise 代理在这里只会凭空造出一笔永不 settle 的调用。仓里 `postMessage` 家族到此扫尽
  （另两处就是上面两个 Worker）。
- **`@tanstack/vue-virtual` 未应用**：全仓有两套自研窗口化 —— `useRowWindowing`（单滚动容器 + 多分区网格 +
  只窗口化行，分区壳常驻、容器高度由行规划精确占位，调用侧叠了三条不变量：与滚动高亮共用同一 rAF、
  元素查询每帧至多一次、按帧位移自适应缓冲）与 `useScoreViewportRender`（721 行，前缀 + 视口 + 尾部三段
  窗口 + 空档外边距 + 扩容哨兵 + 缩放沉降闸门，服务的是「边输入边增长」的文档编辑器）。两者都不是
  「一个滚动容器 N 个等高项」的模型：前者换库要把 `ChordPickerPanel` 模板改成绝对定位 + 每分区一个
  virtualizer + `scrollMargin` 并重做「方向键到窗口边缘」的兜底导航（目标行未挂载，不能
  `scrollIntoView`），后者要重做前缀/尾部两段与空档占位。收益不明，而视觉回归在 jsdom 里测不出来
  （browser 项目目前只有两个文件）。依赖已卸载。
- **`@vueuse/gesture` 未应用**：仓里的手势都是「语义比库多」的自研状态机 —— 长按起拖 + 点击抑制
  （歌词拖拽）、padding-box / border-box 坐标换算与「抓取偏移 vs 指针居中」按形态分流（分段控件滑块）、
  以两指 identifier 判会话并对读数逐帧合帧（捏合缩放）、`setPointerCapture` 失败即不开会话（指板落笔）。
  `useDrag` / `usePinch` 覆盖不到这些，且它是 setup 期 composable，`vScrollbar` / `vWheelScroll` 这类
  指令挂不上。指针族已逐个扫过（歌词拖拽、分段控件、滑块、捏合缩放、指板落笔、滚动条拇指、滚轮指令、
  popover 悬停追踪、拖拽影像层、边缘自动滚动、sortablejs 列表），无一例是「库覆盖得比现状更多」的。
  依赖已卸载。
- **`@leeoniya/ufuzzy` 未应用**：全仓只有三处文本过滤输入（`SidebarLeft` 的 `searchQuery`、
  `ChordPickerPanel` 的 `pickerSearchQuery`、`BaseSelector` 的 `searchQuery`），前两条都汇进
  `chordStore.getGroupedCards/getFilteredChords` → `domains/chord/theory/chordSearch.ts`（保护区，
  非专门指令视为只读），第三条走的是 `filterable` —— 而 `filterable` 全仓无人设置（`grep` 零命中），
  改它等于改死代码。且和弦搜索的价值正来自别名 × 变体展开（`CΔ7` / `Cø` / `C°` / Unicode↔ASCII
  互通），换到调用侧（`chordStore`）只剩 `getChordName` 一条，会丢功能。故不动，依赖已卸载。
- **不需要 `ky`**：同步层的 `request()` 只有 20 行（`AbortController` + 15s 超时 + `AbortError` →
  `SyncError('TIMEOUT')` + 按 provider 注入的错误分类），而 ky 的默认行为恰好与这层的需要相反 ——
  它对非 2xx 抛 `HTTPError`、按 content-type 自动解析响应体，而四个 provider 都要拿原始 `Response` 判
  404 / 409 并按各自方式取体（JSON / base64 信封 / 纯文本）；`retry` 默认两次自动重试，对「用户显式发起的
  推送」是危险的（PUT 已落地的重试会造出重复提交）。剩下的收益只有 `timeout` 一个选项（省 6 行），代价是
  一份新的运行时依赖，而本仓 `build:budget` 是硬门禁、首屏预算刚收紧过。故不引入。
- 用户可感知的变化：无（三条接线都是等价替换）。
- 验证命令：七个改动文件 + 新增测试 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project ui tests/ui/composables/useKeybinding.test.ts`（8 通过）、
  `tests/ui/BaseSelectorCheckOnIcon.test.ts` 与 `tests/ui/form/formRowWaveDelegation.test.ts`（11 通过）、
  `--project logic tests/stores/{scoreEditorStoreUndo,scoreEditorStoreUndoCascade,scoreEditorStoreTranspose,
songStoreHydrateGate,songStoreOverwrite,songStoreReorder,songStoreTranspose,songChordOpsTranspose}.test.ts
--project ui tests/ui/songStoreCrossSong.test.ts`（9 文件 31 通过）；
  `useScoreHistory` 这次替换另做了 **A/B 等价性对照**（临时脚本，跑完即删）：把旧实现逐字抄回来，
  对 16 例 `chordMap`（含「键集不同但 size 相同」「空 map」「多行中仅一行不同」）与 9 例 `lineIds`
  （含空数组、重复项、顺序颠倒）逐例比对 —— 25 例两实现判定**逐例一致**。单靠撤销测试全绿不足以
  支撑这次替换：那些用例未必覆盖到「与栈顶一字不差则不入栈」这条分支，而它判错是静默的（历史少一条、
  无任何报错）。
  comlink 往返在**真实 Chromium** 里验过（临时探针：`wrap(worker).transcode(jpeg)` 拿到 `image/png`、
  非图片 Blob 以 rejected promise 回到主线程；跑完即删、不入库）；类型检查按
  `rules/03-scoped-verification.md` 的「1.1」无文件级形态，本次另用 TypeScript API 以**项目真实
  compilerOptions**（paths / strict / lib 全保留）只对八个改动文件跑了一遍定点检查、0 诊断 ——
  该探针不替代提交前的全量 `typecheck`；**全量关卡按禁令未代跑**。

### 调整 · 类型收口：字面量集合从 `string[]` 收成联合、断言改守卫、枚举删除（2026-09-29）

- **拍号预设从 `readonly string[]` 收成联合**（`domains/score/constants.ts`）：`SONG_TIME_SIGNATURES`
  此前显式标注 `readonly string[]`，把 7 个预设值的字面量信息在类型层抹掉，消费方（下拉、筛选）拿到的
  只是 `string`。改 `as const` 并导出派生联合 `SongTimeSignature`，另加成员判定 `isSongTimeSignature`。
  同文件的 `isValidTimeSignature` 更名 `isTimeSignatureFormat` —— 它判的是**格式**（`\d{1,2}/\d{1,2}`）
  而非预设集，名字没体现这一点。
  **`Song.timeSignature` 刻意仍留 `string`**：导入的文本谱里 `9/8`、`11/8` 这类合法但未列入预设的拍号
  很常见，收窄到预设集会让它们在清洗 / 导入时静默变空串（用户看到的是拍号凭空消失），那是行为回归。
- **单页尺寸档位 id 收成联合并上移到平台层**（`platform/types/settings.ts` 新增 `ScorePageSizeId`、
  `ScorePageMargin`）：`'a4' | 'a5' | 'letter'` 此前在仓里存在三份（preset 表里隐式、`settingsStore`
  的 `useStorage<'a4'|'a5'|'letter'>` 手抄、worker 载荷的 `pageSize?: string`），而 preset 表那份**没被
  导出**，取用点只能写 `string` —— 写错档位 id 只会在运行时静默回落 A4。现在 preset 表用 `satisfies`
  向平台层的值域对齐（依赖方向单向：域表 → 平台值域，因为 `platform` 不得 import `domains`），
  `getScorePageSize` / `getScorePageSizeMm` / 预览缓存条目 / `getA4Blobs` 回传值 / worker 载荷全部换用。
- **主题字面量四处内联统一到 `ThemeMode`**（`useFretboardCanvasTheme` / `FretboardCanvas.vue` /
  `fretboardCanvasPalette`）：三处各自重抄 `'light' | 'dark' | 'high-contrast'`，新增第四档主题时
  画布侧会静默不认（仍按旧档位配色）。
- **调名 `playKey` / `originalKey` 接入 `KeyName`**（`chord/theory/pitch.ts` 新增 `KEY_NAMES` 与
  `isKeyName`；`KEY_OPTIONS` 改 `as const`）。值域**是 17 个而非 12 个**：`transpose.ts` 的 `spellPitch`
  优先沿用原写法的升降号方向，源调名含 `b` 走降号表、含 `#` 走升号表，于是 `Bb` 升 3 个半音得 `Db`
  （而非 `C#`）、`C#` 升 2 个得 `D#` —— 收窄到 `KEY_OPTIONS` 那 12 个会让应用自身的移调结果落在类型域外。
  收口后清洗层（`songRepository`）、文本导入（`textCodec` 的 ChordPro 指令行 / 行首「原调：」/
  `ORIGKEY:` / `PLAYKEY:` 四个入口）、移调回写（`songStore.transposeSong`）、弹窗落库
  （`useSongModals`）五处都必须过守卫。此前 `playKey` 是三者中唯一参与乐理计算的元信息
  （`computeSongKey` → `transposeChordName`），却只判「非空字符串」。
  **用户可感知的变化**：文本里写错的调名（如 `{key: H}`）从此被丢弃并保留默认 `C`，而不是一路进移调。
- **两处 `as` 强转改守卫**：`TopHeader` 的主题菜单与 `SidebarLeft` 的排序菜单此前都写
  `value as ThemePreference` / `value as SongSortMethod`（菜单项 `value` 声明为 `string`）——
  而 `isThemePreference` 早已存在于 `useTheme`，只是没导出；排序那份的成员链则散在 kv 读取处。
  现在前者导出复用、后者新增 `isSongSortMethod`（kv 读取处也改用它，同一判据不再两份）。
- **琴弦节点的 zod 门禁补 `.int()` 与上界**（`app/services/validation/payload.ts`）：原为
  `z.number().finite().gte(-1)`，`-0.5`、`1e9` 都能过。上界取 `MAX_STRING_FRET`
  （`fretOffset` 上限 12 + `FRET_COUNTS` 最大值 5 = 17，因为 `strings[].fret` 是窗口内相对品号）。
  **用户可感知的变化**：非整数 / 越界品位的和弦在导入时走既有的「该和弦节点损坏」分支
  （逐条报原因并跳过），而不是把脏值存进库。
- **静音弦标记 `-1` 收敛为共享常量 `MUTED_FRET`**（`fretboard/constants.ts`，另加 `MAX_STRING_FRET`）：
  它是跨域约定值（指板绘制、音高与和弦推导、和弦编辑、乐谱文本编解码都判它），而
  `GuitarStringEntity.fret` 是裸 `number`（上界随 fretCount 变，收不成固定联合），此前 11 个文件各写
  一遍 `-1`，写错只表现为「某根弦的音画错了」。`?? -1` 那类「索引越界哨兵」保持原样 —— 它们表达的是
  「取不到」而不是「静音」，混用常量反而误导。
- **`idbKv` 跨标签页广播的判别值收口**（`platform/services/storage/idbKv.ts`）：发送侧与接收侧各写一遍
  字面量 `'kv-update'`，任一处改字都只表现为「跨标签页同步悄悄失效」。收进 `KV_UPDATE_TYPE` 并补
  `KvBroadcastMessage` 形状。
- **三个 TS `enum` 全部删除**（`GroupSortRule`、`Tuning`、`MessageType`）：改为「常量对象是唯一真相源、
  联合类型由它派生」（`export const X = {...} as const; export type X = (typeof X)[keyof typeof X]`），
  与本仓 `ErrorCode` 早已在用的形态一致。enum 会生成运行时对象、不能 `import type`，与
  `isolatedModules` / `verbatimModuleSyntax` 的「可擦除语法」方向相悖。因常量对象与类型同名，
  全部 `X.MEMBER` 取值点与 `x: X` 类型点**零改动**；唯一需要改的是 `Group` 判别联合里
  **类型位置**的成员引用（常量对象的成员只能作值用），改写字面量。
  `Tuning` 在保护区 `domains/chord/theory/`（`rules/02-protected-zones.md` 的「一、稳定保护区」）——
  本次只做 enum → 常量对象的等价替换，不动任何理论函数与预设数据，`data/tunings.json` 的 id 契约不变。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic`（14 文件 128 通过）+ `--project ui`（5 文件 41 通过）；
  类型检查按 `rules/03-scoped-verification.md` 的「1.1」无文件级形态，本次另用 TypeScript API 以
  **项目真实 compilerOptions** 对 **40 个改动源文件 + 29 个引用到改动符号的消费方文件 + 38 个测试文件**
  跑定点检查，仅剩 2 条诊断，且都是已知的探针盲区（`Cannot find module '...Fretboard.vue'`：
  裸 `tsc` API 解析不到 `.vue` 类型导入，该 import 早于本次改动）；该探针不替代提交前的全量
  `typecheck`；**全量关卡按禁令未代跑**。

### 修复 · 同品两条互不相邻横按：点掉左段音符后右侧横按无故动画（2026-09-29）

- **现象**：交互指板上 `11x111` 这类「同一品、不连续两段横按」，悬停左段出现气泡后点掉左段一个音，
  右侧横按会播放一段动画（从左段几何滑移到右段位置）。
- **根因**：`DisplayBarre.key` 按「同品第几条」**压紧编号**（`barre-fret-1` / `barre-fret-1-1`）。
  左段因点音消失后，右段升为该品第 0 条、key 顶替成 `barre-fret-1` —— Vue keyed diff 把**左段的
  DOM 节点**复用给右段，而横按梁元素带 `transition-all` 且 x/width 由内联 style 驱动，节点被改写
  几何时便从左段位置动画滑过去。上一轮的气泡误锚修复（key + 跨度双判定）只治了气泡认锚这一层，
  横按梁节点复用口径当时刻意未动，本条即那个遗留面。
- **修法**：key 改为 `barre-fret-{品位}-{段右端弦}`。同品的横按段互不相交（候选按连续段切分、
  已标记经 normalizeAndMergeBarres 合并），右端弦在同品内唯一 → key 即段的身份，相邻段存亡互不
  顶替；跨度变化但右端不变时（`xxx222 → xx2222` 向低音侧生长，原「稳定品位键」注释记载的平滑
  形态延展场景）key 不变、节点复用与过渡**保留**。唯一可能撞 key 的形态是「同品同右端的子跨度
  并存」（标记 [4,5] 与后出现的候选 [3,5]），此时追加 fromString 消歧——该形态让渡平滑延展、
  身份正确优先。`parseBarreFretFromKey` 兼容新旧形态（regex 按前缀取品位）。
- **取舍得失**：向高音弦侧生长（右端弦变化）与「点掉段右端音」时 key 变化 → 节点重建、无平滑
  过渡——身份错误会闹鬼影，过渡断了只是少个动画，取舍成立；气泡的直接认领校验（key + 跨度）
  在新 key 下语义更严谨（key 相等即同一条），跨度校验降级为不变式兜底。
- 验证命令：`useBarreBubble.test.ts`（4 条，含新增「同品同右端子跨度 key 消歧」用例；原夹具断言
  更新为新 key 格式并作为回归锚点——旧方案下右段 key 会变成 `barre-fret-1` 报红）与 `barre.test.ts`、
  `scoreRenderCacheKey.test.ts` 共 36 条全绿；三文件 `eslint` 与 `prettier --check` 0 问题、
  全量 `vue-tsc --noEmit` 通过。

### 修复 · 横按入场动画在右端弦变化的生长 / 收缩时恒为从左向右重播（2026-09-29）

- 上一条 key 修复的后续：key 编码段右端弦后，右端弦变化的跨度变形（向高音弦侧生长、右缘收缩）
  会更换 key、视觉梁节点卸载重建 —— `barre-slide-in`（scaleX 0→1 左起）是挂载即播的入场动画，
  于是这些变形从「平滑形态延展」退化成「从左向右重新画一遍」。
- **修法**：延续段（同品、跨度与上一帧相交，即同一条的变形）不播入场动画，改为 **FLIP 式形变
  进入** —— 新节点先摆到上一帧那条的几何（`v-barre-enter-from` 指令：写覆盖值 → 强制样式解算 →
  清空回落），`.barre-transition` 随即从旧几何平滑形变到新跨度，观感与节点复用时代一致；真正
  新出现的横按照常播放入场。判定抽为纯函数 `findContinuedBarre`（同品 + 跨度相交，与气泡的段
  身份口径同源），上一代集合 post flush 落盘供渲染当帧读取。
- 本条描述的播放侧补丁（`v-barre-enter-from`）随后被下一条「一份计划 + 一个播放器」整块替换 ——
  梁的几何改由 WAAPI 关键帧播，该指令与 `.barre-slide-in` 一并删除；**判定侧存留至今**：
  `findContinuedBarre` 仍是 `findPredecessor` 在「按渲染 key 精确命中不到」时的退化分支。
- 验证命令：`useBarreBubble.test.ts`（9 条，新增 5 条延续判定单测：右端生长 / 左端生长 / 右缘
  收缩均识别为延续，同品不相交与跨品位不误认）全绿；三文件 `eslint` 与 `prettier --check` 0 问题、
  全量 `vue-tsc --noEmit` 通过；reduced-motion 下 transition 为 none，清空即瞬达，天然降级。

### 修复 · 指板横按梁动画全面失效，改为「一份计划 + 一个播放器」（2026-09-29）

- **根因：形态变化原先靠 `x` / `y` / `width` 的 CSS transition 播，而这条路径在真实页面里不成立。**
  三个属性都是 SVG 几何属性，实测值一变就被浏览器「创建即取消」（同一毫秒内
  `transitionrun` → `transitionstart` → `transitioncancel`），于是**节点重建的那些跨度变化**
  （`111xxx → 1111xx` / `11111x` / `111111`、`111xxx → 11xxxx` 等，key 编码右端弦、右端一变就换 key）
  全部退化为瞬变 —— 这正是「只有从左往右有动画、其余都是生硬瞬变」的成因。
  几何改由 WAAPI（`Element.animate`）播关键帧，实测逐帧平滑。
- **结构：一份计划 + 一个播放器。** `liveBeamPlans` / `ghostBeamPlans` 两条 computed 一次算好每条梁的
  起点与终点几何，模板只读结果、`v-barre-beam` 只负责播出来。随之删掉 `v-barre-enter-from`（FLIP 补丁）、
  `barreBeamStyleOf`、`.barre-slide-in` / `.barre-slide-out` 与 `@keyframes barre-slide-right`、
  `BARRE_LEAVE_MS` 定时器，模板里不再有任何动画分支；退场驱逐改由 `animation.finished` 驱动，
  档位与驱逐时限从此只有一个来源。
- **起点几何的三种来源**：延续段 —— `findPredecessor` 先按渲染 key 精确命中（key 相同即节点复用，
  元素此刻显示的就是那条的几何，起步不会跳），命中不到再退化为同品位跨度相交；真新横按 ——
  锚点处的**起手块**（上一帧两端已有音符 → 中点；仅一端 → 该端）；退场 ghost —— 向剩余音符端缩成
  起手块 + 渐隐。
- **入场 / 退场从「起手块」开始，而不是零宽**（`blockGeomAt`）：起手块是边长等于梁厚的方块，
  锚点决定它贴哪一侧（left 左缘贴锚点向右展开 / right 右缘贴锚点向左展开 / center 以锚点居中向两边）。
  零宽起步在屏幕上只是「无中生有」的一条细线，方块起步才读得出「一个小方块展开」——
  两弦横按（`1xxxxx → 11xxxx`）体量本来就小，这条尤其明显。
- **修复 · 拆分（`111111` 点掉中间一根）时两段都停在整梁几何上闪一下**：原先两段都以上一帧整梁为起点，
  重叠区域把半透明填充叠深一档。新增 `splitStartGeoms`：按相邻两段的断点把整梁切开，两侧各让出一个
  圆角半径的重叠量 —— 恰好等于圆角半径时两段的端头圆角互补，起步那一帧的并集仍是原来那条完整胶囊
  （既不叠深也不露凹口），随后两段各自从断开处向外收拢。
- **修复 · 合并时被复用的那条梁跳到终值**：幽灵入列会让计划重算，而重算时「上一帧快照」已经落盘，
  延续段被认成它自己（起点 = 终点，正在播的形变被当场取消）。现存 / 幽灵拆成两条 computed，
  幽灵的增删不再影响现存那半；ghost 同时改排在前面（画在下面），被吞并时不再与吞并方叠深。
- **修复 · 没点音符动画自己播一次**：指令的 `updated` 在**每次**重渲染都会跑（例如退场 ghost 被驱逐时），
  照着重播会让刚播完的形变从起点再走一遍。补一道「目标几何未变就不重播」的闸。
- **修复 · 入场锚点一直失效**：写入端 `useChordDraftEditing.handleStringsChange` 是**原地改写**
  （`draftChord.strings[i] = {...}`），数组与元素身份都不变，而上一帧按弦快照存的是**引用** ——
  「上一帧按弦」会跟着变成「本帧按弦」，两端恒判为「已有音符」，锚点永远落在中点。
  快照改为 `cloneGuitarStrings` 出来的副本。
- 用户可感知的变化：横按梁的展开 / 形变 / 退场 / 拆分 / 合并全部有动画；
  `prefers-reduced-motion` 下整体降级为瞬变。
- 已知残留：极速反复增删同一形位时（连点间隔约 45ms），被吞并的段会在吞并方已经铺开的那一帧里
  与它重叠约 0.1s，半透明填充叠深一档；单次合并不受影响（幽灵此时已淡到 0.36 上下，叠深轻微）。
- 验证命令：`FretboardSvg.vue` 与 `FretboardSvg.logic.ts` 的 `eslint --max-warnings 0` 与
  `prettier --check` 0 问题；`vitest run --project ui tests/ui/composables/useBarreBubble.test.ts
tests/utils/barre.test.ts`（35 通过）。
  另用临时探针（跑完即删、不入库）在真实 Chromium 里逐帧采样 + 拦截 `Element.animate` 核对过：
  六个生命周期场景与拆分 / 合并的起点终点关键帧全部符合预期；两弦横按的关键帧只有 `opacity`；
  随机乱点 + 极速连点 + 反复拆分合并共 52 个动作、1200 余帧无报错、无空闲自播、无几何异常；
  悬停横按仍正常浮现气泡。
  类型检查按 `rules/03-scoped-verification.md` 的「1.1」无文件级形态、该项未验证；
  **全量关卡按禁令未代跑**。

### 调整 · 手写实现改走原生 API：选区、URL 拼装、方向键可见性、脚本自定位（2026-09-29）

- **光标折叠改用 Selection 自身的两个方法**（`platform/ui/input/BaseEditableText.vue`）：
  `createRange` + `selectNodeContents` + `collapse(false)` + `removeAllRanges` + `addRange` 五行换成
  `selectAllChildren(el)` + `collapseToEnd()` 两行 —— 前者本身就先清空选区，语义逐项等价。
  换之前实测过 jsdom 两个方法都在位（ui 测试项目跑在 jsdom 上），不是「浏览器能用、测试环境崩」的换法。
- **推送地址的 query 拼装改走原生 URL**（`app/services/sync/serverSyncProvider.ts`）：原写法靠
  `serverUrl.includes('?') ? '&' : '?'` 手工取舍分隔符，源地址以 `?` 结尾时会拼出 `?&md5=`；
  改为 `new URL(serverUrl)` + `searchParams.set`。md5 是十六进制、updatedAt 是整数，
  URLSearchParams 的 urlencoded 序列化与 `encodeURIComponent` 对这两个值逐字节一致，
  服务端读到的 query 不变（既有用例本就是按 `new URL(call.url).searchParams` 断言的）。
- **方向键候选的可见性判定改用原生 `checkVisibility`**（`platform/directives/vGridNav.ts`）：
  原判据是「`offsetParent !== null` 即可见，否则回退读本元素的计算样式」。**回退那一支有洞** ——
  `offsetParent` 在「祖先 `display:none`」时同样是 null，而 `getComputedStyle(el).display` 读到的是
  **本元素自己的**计算值（浏览器不会把祖先的 none 报成后代的 none），于是隐藏子树里的格子被判成可见、
  混进方向键候选，按下去焦点无处可去。`checkVisibility` 是**祖先感知**的：本元素或任一祖先
  `display:none` / `content-visibility:hidden` 即不可见（加 `visibilityProperty` 后还看 `visibility`，
  加 `opacityProperty` 看 `opacity:0`）。Safari < 17.4 没有该 API，回退分支原样保留（并补注释说明
  `offsetParent === null` 的两种成因，fixed/sticky 那条豁免不能丢）。测试环境仍走原有的恒可见短路。
  **用户可感知的变化**：被隐藏（`v-show` / 折叠 / `opacity:0` 的祖先）容器内的格子不再被方向键选中。
- **构建脚本的自身定位改 `import.meta.dirname`**（`scripts/` 7 个 + `worker/scripts/` 2 个）：
  `path.dirname(fileURLToPath(import.meta.url))` → `import.meta.dirname`，并删掉随之无用的
  `node:url` 导入；`scripts/compress-images.mjs` 的 `__dirname` 垫片随之整体删除，
  `scripts/generate-all-code.mjs` 的「是否作为主模块运行」判据改 `import.meta.filename`。
  `engines` 已是 `node >=22.13`（两属性自 20.11 起可用），不需改配置；这两处改动本身由
  `changelog:check` / `guidance:check` 跑通验证（它们就是这两个脚本）。
- **预览区滚动收菜单的监听改用 `useEventListener`**（`domains/score/preview/components/ScorePreviewPane.vue`）：
  手写的 `watch(el, prev)` + `addEventListener` / `removeEventListener` + `onBeforeUnmount` 三处配对
  换成一行 —— 元素引用变化时重绑、作用域销毁时摘除由 useEventListener 承担（对 ref 目标它内部
  `watch` 且 `immediate` 绑定）。
- 用户可感知的变化只有可见性判定那一条，其余四条均为等价替换。
- 验证命令：13 个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/data/serverSyncProvider.test.ts tests/data/syncTestConnection.test.ts`
  （23 通过）；`node scripts/build-changelog.mjs --check` 与 `node scripts/build-guidance.mjs --check`
  通过；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 滚动条几何变化不再走过渡：位置与长度瞬时写入（2026-09-29）

- **滚动条不再为自己加过渡**（`platform/directives/vScrollbar/vScrollbar.scss`）：轨道与拇指此前
  `width` / `height` 恒有 150ms 过渡，位移（`top` / `left`）则由 `--v-scrollbar-shift-duration` 在
  「几何变化」那一路临时置 150ms（滚动时置回 0s）。于是容器尺寸 / 内容增删引起的长度变化、以及
  几何变化时的位移，都会让滚动条慢慢挪过去 —— 而它同时又是滚动位置的实时指示物，滞后于内容即失真。
  现在长度与位移一律不过渡，滚动条只如实反映当前几何与位置；平滑感全部来自**滚动本身**：
  轨道点击 / 长按跟随走 `scrollTo` 的 `smooth`、滚轮转发走 rAF 渐近（两者都没动）。
- **保留过渡的维度**：显隐（`opacity`）、悬停内移（`transform`）、悬停加宽（粗细那一维）。
  `width` / `height` 的时长按属性名拆成 `--v-scrollbar-w-dur` / `--v-scrollbar-h-dur`（缺省 0s）——
  同一对属性在两轴上的含义相反（纵向轴 `width` 是粗细、`height` 是长度；横向轴反过来），
  各轴块只把自己那一维置成 150ms，长度维保持 0s。
- **位移过渡机制整块删除**（`scrollbarCore.ts` 的 `SHIFT_DURATION_MS` / `setShiftAnimated` 与
  `scrollbarOverlay.ts` 的两处调用）：它的唯一职责就是给几何变化那一路打开位移过渡，口径改了之后
  没有任何调用点还需要它。
- 验证命令：两个 TS 改动文件 `eslint --max-warnings 0` 与三个改动文件 `prettier --check` 0 问题
  （`.scss` 不在 eslint 的配置范围内）；`vitest run --project logic tests/platform/scrollbarSnap.test.ts
tests/platform/scrollbarOverlayParent.test.ts`（11 通过）；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 修复 · 滚动条读数气泡拖拽时多出一圈描边（「两个气泡」）（2026-09-29）

- **现象**：预览乐谱的横向滚动条鼠标拖动时，读数气泡旁边像是出现了第二个气泡 —— 气泡本体之外又套着
  一层大一圈的描边。截图（140×92）逐像素解出来是：填充区占 x≈16..111 / y≈33..70，右侧另有
  x≈123..125 的一圈 3px 描边、上下对称收圆，**左侧没有任何多余轮廓**；连通域分析（阈值 26）只找到
  一个 component ⇒ 页面上只有一个气泡元素，多出来的那圈是它自己的**剪影层**。
- **根因**：`setBubbleCellChar` 把离场字符的 `.br-roll-leave-active`（`position: absolute; inset: 0`）
  与入场字符的起点类**一起**延后到 rAF，于是那一帧里单元格同时含两个**在流**字符、宽度多出一个字。
  气泡宽度正是由读数撑开的，单元格宽一帧就等于气泡宽一帧；而那一帧里剪影层（`arrowPanel`）恰好被
  宿主 style 变更驱动重绘，读到的是宽版 `offsetWidth`，于是描边与楔形按「多一个字」的宽度画出来。
  紧随其后的 rAF 把单元格收回原宽，**ResizeObserver 看不到这次净变化**（宽出去的那一帧落在它两次
  投递之间），剪影就此永久停在宽版轮廓上。组件版（`BaseRollingText`）没有这个缺陷：Vue
  `<Transition>` 的 performLeave 就是**当场**加 leave-active 的，延后到 nextFrame 的只有入场侧起点类。
- **修法**：离场字符当场加 `leave-active` / `leave-to`（与组件版同一时序），只把「摘除入场字符的
  `-from` 类」留在 rAF —— 入场侧的起点类仍必须分帧，否则插入与切类同帧完成会让浏览器把「from」与
  目标态合并成一次样式计算，过渡没有起点。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。

### 修复 · 拖拽会话只认 pointerup 收尾：右键唤出菜单后「裸移动」仍在拖动（2026-09-29）

- **现象**：拖动滚动条拇指后点鼠标右键、松手，再把鼠标移上去（**不按键**）内容仍跟着移动。
- **取证（临时探针，跑完即删）**：Chromium 里多键指针事件的真实语义与直觉不同 ——
  `pointerup` 只在**所有键都松开**时派发：左键按住时按右键，只得到 `buttons=3` 的 `pointermove`
  （没有 pointerdown）；左键按住时先松左键同样没有 pointerup，只得到 `buttons=2` 的 pointermove。
  右键抬起会派发 `pointerup` + `contextmenu`，而**原生菜单持有指针之后，左键的抬起不再派发给页面**。
  于是「拖拽中按右键 → 菜单弹出 → 松左键」这条路径上，那次收尾用的 pointerup 永远到不了页面，
  `dragAxis` 永久停在非空 —— 此后仅凭悬停移动就会走进拖拽分支。指针捕获挡不住这一种：捕获只保证
  事件落到本元素，不保证事件一定会发生（指针在窗口外抬起同理）。
- **修法**：在 move 处理器上加自愈守卫 `e.buttons === 0`（与 `useSliderInteraction` / `BaseSwitch`
  既有的同名守卫同口径）。触摸端另用探针实测过：`pointermove` 在按住期间**恒为 1**、`pointerup` 才归 0
  （触摸是 1 不是 0），故该守卫不会误伤触摸拖拽。
- **同类问题一并收口**（判据：会话状态只由 pointerup 收尾，且已存在会作用于该状态的 move 处理器）：
  - `vScrollbar` 拇指拖拽（`scrollbarDrag.ts`）与轨道长按跟随（`scrollbarTrack.ts`，后者残留时
    连**静止悬停**都会被 `reJump` 当成长按跟随）。
  - **分段控件滑块拖拽**（`platform/ui/segmented/useSegmentedDrag.ts`）：监听挂在 **window** 上，
    会话不复位时滑块会跟着光标满屏走。新增 `abortDrag`（中止收尾：不 flush 待处理帧、不置
    `suppressClick` —— 没有落定就没有要吞的次生 click，其余与 `handleDragPointerUp` 同口径）。
  - **开关拖拽**（`platform/ui/switch/BaseSwitch.vue`）：原有守卫只清 `isDragging` / `dragOffset`，
    残留的 `isPressed` 会让之后「在别处按下、再拖过开关」的按压被当成本开关的拖拽（起点是上一次
    手势的陈旧坐标，拇指当场跳一下），残留的 `hasMovedSignificantly` 会把下一次真实点击吞掉
    （表现为「开关偶尔点不动」）。抽出 `abortPress` 与 pointercancel 共用同一条收尾。
  - **指板滑动绘制**（`domains/fretboard/composables/useFretboardInteraction.ts`）：会话开着时
    无按键的移动会被当成滑动绘制**逐格改写音符**。`paint.begin` 的注释只防了「指针捕获失败」那一种
    成因（捕获失败就不开会话），防不住菜单接管 —— 捕获成功也照样收不到那次 pointerup。
  - **歌词拖拽**（`domains/score/editor/composables/lyrics-drag/dragSession.ts`）：右键那条路径
    已由 `preventContextMenu` 挡在菜单弹出之前（不变量②），但「指针在窗口外抬起」挡不住。按**取消**
    收尾而非落定 —— 手势已经死了，落点无从判定，与窗口失焦同一条路径。
- **测试夹具修正**（`tests/ui/composables/useLyricsDragDrop.test.ts`）：`MockPointerEvent` 此前不给
  `buttons`（`MouseEvent` 的缺省值是 0），新守卫下这些 move 会被判成「所有键都已松开、手势早已结束」，
  拖拽当场被收掉 —— 8 条用例红在「拖拽没起来」这种与用例意图无关的地方。按「不得为迎合测试改业务
  代码」的方向**修正夹具**：模拟在途手势的 move 一律显式带 `buttons: 1`，并在 `MockPointerEvent`
  的注释里写明这条要求（与既有的 `pointerType` 必须显式传同一条口径）。
- **刻意未动的同类项**（形态不同：需要新增监听，或原语本身不接指针事件，属调用方会话的收尾）：
  `ActionButton` 的 `isPressActive` / `isHolding`（模板未绑 pointermove；持续态另有音频侧有限占位
  停止兜底）、`BasePopover` 的 `isPointerDown`（只有 window 的 pointerup/cancel，守卫残留会让
  `focusout` 不再关面板，且无任何报错）、`BaseNumberInput` 的长按连发（靠 pointerleave 兜底，
  菜单持有指针期间会一直步进到边界）、`usePointerEdgeAutoScroll`（通用原语，随调用方会话收尾）。
- 验证命令：七个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project ui tests/ui/composables/useLyricsDragDrop.test.ts
tests/ui/composables/useFretboardInteraction.test.ts`（9 + 7 通过）、
  `--project ui tests/ui/form/formRowWaveDelegation.test.ts`（8 通过）、
  `--project logic tests/platform/scrollbarSnap.test.ts tests/platform/scrollbarOverlayParent.test.ts`
  （6 + 5 通过）、`--project browser tests/browser/scrollAreaLayout.test.ts`（2 通过）。
  修复本身另在**真实 Chromium** 里做过 A/B（临时探针：`pointerdown` 起拖 → 派发一条 `buttons: 0` 的
  `pointermove`）：不打守卫时 `scrollTop` 从 200 被拖到 300（复现「裸移动仍在拖动」），打上守卫后
  停在 200；探针与失败截图跑完即删、不入库。类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 开关拖拽中右键：滑块卡在拖拽态、值被误提交、且此后点页面任意处都会切换（2026-09-29）

- **现象**：拖动开关途中点鼠标右键，滑块停在拖到一半的位置、维持拖拽期那条内联 transform（被压扁的
  形状），要等指针**再移回开关上**才复位；另一种表现是右键松手被当成「确认落位」，开关值直接提交、
  滑块滑到拖到的那一侧。**第三条**：从关闭态按住向右拖、再按右键（滑块已回到左侧关闭位），此时在
  页面内**任意位置**点一下（原生菜单还开着），开关会被切换一次。
- **根因（三条并存）**：
  1. `handlePointerUp` **不按 `button` 过滤**，右键抬起派发的 `pointerup`（`button === 2`）照常走进
     落定分支，按落点结算并提交值。
  2. 原生上下文菜单弹出后可能把这次手势的 `pointerup` **整个吞掉**（与 `useSortableList` 的
     `onContextMenu` 同因），那时 `isDragging` 无人清，只能等下一次 move 落到开关上、由既有的
     `buttons === 0` 守卫自愈 —— 这正是「移回去才复位」。
  3. 指针捕获**从未被释放**：`abortPress()` 在无事件入参时不调 `releasePointerCapture`，而隐式释放
     挂在 `pointerup` / `pointercancel` 的派发上 —— 恰恰就是被菜单吞掉的那一次。捕获留着，此后页面内
     **任意位置**的按下/抬起都被重定向到本开关，加上第 4 条把「吞 click」的守卫也解除了，于是任何
     位置的一次点击都变成对本开关的点击。
  4. `abortPress` 顺手清掉 `hasMovedSignificantly`，而它正是 `handleClick` 用来吞掉「拖拽手势补出的
     那一次 click」的守卫；被取消的手势仍会补出 click（那次左键抬起），守卫已卸 → 开关被切一次。
- **修法**：① `handlePointerUp` 增加 `e.button !== 0` 过滤，非主键松手走 `abortPress`（取消收尾、
  不提交）。② 在 `<button>` 上接 `@contextmenu`，按压仍在即当场 `abortPress` —— `contextmenu` 必定
  派发且早于菜单接管指针，不依赖那次可能丢失的 pointerup。刻意不 `preventDefault`：与
  `useSortableList` 同口径，这里只负责让按压复位，不拦菜单。③ 新增 `activePointerId`（`pointerdown`
  记、收尾清），`abortPress` 用它**主动释放捕获**；`contextmenu` 是 MouseEvent 拿不到 pointerId，
  故必须记一份。④ `abortPress` 不再动 `hasMovedSignificantly`，取消掉的手势补出的 click 继续被吞。
- 随之把 `handleClick` 的判据从「见标志即吞」收紧为「**指针产生**的 click 才吞」（`event.detail > 0`）：
  键盘在聚焦按钮上触发的 click 其 `detail` 为 0，若一起吞掉就会出现「取消/拖拽之后键盘点不动」——
  这正是第 ④ 条敢让标志长期留着的依据（标志留给下一次 `pointerdown` 复位）。
- 顺带收口 `abortPress` 里 `e?.currentTarget as HTMLElement | null` 之后又读 `e.pointerId` 的空值收窄
  报错。
- **验证（真实 Chromium 探针，跑完即删）**：六条用例 —— ① `contextmenu` 后滑块的内联 transform 与
  类名逐字节回到静止态、`change` 未触发、且 `releasePointerCapture` 被以 `pointerId: 1` 调用一次；
  ② 取消后手势补出的指针 click（`detail: 1`）不得切换；③ 取消后的键盘 click（`detail: 0`）必须照常
  切换；④ 未拖拽的普通点击照常切换；⑤ 真拖拽落定后尾随的指针 click 仍被吞（只切一次）；⑥ `pointerup`
  照常到达（`button: 2`）时同样按取消收尾。A/B 三处各关一次：摘掉 `@contextmenu` 绑定 → ①转红且失败
  信息正是 `expected 'transform: translateX(0px) scaleX(1) …' to be ''`；关掉捕获释放并恢复标志复位
  → ①转红（`expected [] to deeply equal [{ pointerId: 1, tag: 'BUTTON' }]`）、②转红（click 把开关切了）；
  去掉 `detail` 判据 → ③转红。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；六个相关测试文件
  （51 通过）。类型检查对 `.vue` 无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 拖拽排序右键取消后，已换位的卡片没有复位动画（2026-09-29）

- **现象**：拖拽排序途中按右键取消，被拖的那张卡片平滑滑回起拖位置，但**已经被挤开的卡片直接瞬移回位**
  （一帧之内跳整整一格），没有复位动画。
- **根因**：`useSortableList` 的 `onEnd` 里取样视觉位置的 `capturePositions` 排在
  `restoreOriginOrder()` **之后**。取消路径上那一步已经把 DOM 顺序还原成起拖时，再量得到的快照与实时
  位置逐元素重合，`playFlip` 比不出位移、整批跳过（位移不足半像素即不动）—— 于是除被拖节点
  （另有 `preview.settle` 单独处理）之外无人播复位动画。
- **修法**：把 `capturePositions` 提到 `restoreOriginOrder()` 之前，即**任何 DOM 搬动之前**取样。正常落定
  路径不受影响：这一步与原先的位置之间没有任何 DOM 写操作（`settleClickAfterDrop` 的补派 click 走
  `queueMicrotask`、`resolveNextOrder` 只读）。
- **验证（真实 Chromium 探针，跑完即删）**：挂真实 `useSortableList` + 真实 sortablejs（`forceFallback`
  通道），按 `pointerdown` → `pointermove`（换位由 sortable 的 50ms 轮询驱动）→ `contextmenu` 走完取消，
  再用 rAF 采样已换位卡片的顶边轨迹。A/B 结论明确：修复前轨迹为 `1 0.2 0 | 60 60 60 …`（单帧瞬移 60px
  后静止），修复后为 `0 0 4.2 13.2 24.5 … 59.8 60`（连续下滑，最大单帧 11.3px）。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；定点类型探针
  （`.temp/typecheck-probe.mjs`，只对改动文件及其 import 闭包起 Program）在根文件上 0 诊断；
  `vitest run` 六个相关测试文件（51 通过）。类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 手写实现改走平台单一来源：base64 分块、层叠次序、CSS 长度、可编辑目标、修饰键倍率、和弦克隆、滚动定位、忙碌管线、卡片 A11y（2026-09-29）

- **base64 编解码收出两个原语**（`platform/utils/common.ts` 新增 `bytesToBase64` / `base64ToBytes`）：
  `transfer.ts` 的 `bytesToBase64Url` / `base64UrlToBytes` 与 `app/services/backup/backupCrypto.ts` 的
  `toB64` / `fromB64` 两份实现随之删除，`base64EncodeUtf8` / `base64DecodeUtf8` 也改为转调。
  四处都是「Uint8Array → base64」，此前各写一遍分块循环 —— 任一处漏了分块就只在那条路径上、且只在
  数据够大时才崩（本地小样本测不出来）。`base64ToBytes` 对非法输入按 `atob` 原样抛错、**不在原语里吞**：
  各调用点的容错要求本就不一致（`base64DecodeUtf8` / `base64UrlToBytes` 返回 null，`backupCrypto` 让异常穿透）。
- **`lastMatching` 收口「取登记表最后一名」这条层叠规则**（`platform/utils/common.ts` 新增；
  `ui/overlay/overlayStack.ts`、`ui/popover/usePopoverOrder.ts`、`ui/floating-panel/escapeDispatcher.ts`
  三处改用它）：三份实现回答的是同一个问题 ——「谁在最上层」（模态阻断栈的 `Array.from(set).pop()`、
  打开中浮层登记表的手写 for 循环、Esc 登记表的「遍历时不断覆盖 picked」），差别只在集合类型与判据。
  浏览器不暴露「读取 top-layer 顺序」的 API，这条规则注定要在多个登记表上重复出现，收在一处至少让
  「最后一个」只有一个定义。刻意不引 `Array.prototype.findLast`：它要先 `Array.from` 拷一份（本函数
  直接吃 Iterable），且 `lib` 停在 ES2022、类型上并不存在。
- **`isCssLength` 收口 CSS 长度形态**（`platform/utils/dom.ts` 新增；`ui/icons/iconSizes.ts` 与
  `ui/floating-bar/floatingPositions.ts` 两份实现删除）：两处口径**已经分叉** —— 裸 `0` 在图标那份
  写在正则里、在浮动定位那份写在正则外的 `=== '0'` 判断里。只覆盖「一眼看出是长度」的字面量，
  **不含** `var()` / `calc()` / `auto`：它的用途是开发期告警而非 CSS 解析器，把 `auto` 放进来只会让
  「笔误成 `'ml'`」这类真正的错误漏过。等价替换。
- **`isEditableTarget` 下沉到 `platform/utils/dom.ts` 成唯一口径**（`composables/useKeybinding.ts` 的
  本地实现删除，`directives/vGridNav.ts` 与 `domains/fretboard/composables/useFretboardKeyboard.ts`
  改用它）：三处判定面互有出入 —— `useKeybinding` 排除了非文本类 input，另两处只比
  `tagName === 'INPUT'`，**差集就是缺陷**。判据同时从 `instanceof HTMLElement` / `HTMLInputElement`
  改成结构判定（`tagName` / `type` / `isContentEditable`）：`instanceof` 跨 realm 失效（iframe 里派发
  上来的输入框会被判成非编辑目标），也会把纯逻辑组合式的单测钉死在有 DOM 全局的环境（logic 工程跑在 node）。
  **用户可感知的变化**：焦点停在复选框 / 单选 / 按钮上时，网格导航与指板键盘不再吞掉方向键
  （那类控件本就不消费方向键，此前表现为「网格里按方向键没反应」）。
- **`resolveMultiplier`（Alt ×0.1 / Shift ×10）收成一份**（`ui/slider/BaseSlider.logic.ts` 导出；
  `ui/input/BaseNumberInput.vue` 的本地副本删除）：滑块与数字输入共用同一倍率语义，各写一份迟早漂移。
  等价替换。
- **删除歌曲的撤销快照改用 `cloneChordMap`**（`domains/score/library/components/SongSection.vue`，
  原 `new Map(song.chordMap)`）：浅拷贝会让撤销快照与实时编辑**共享行容器**，「之前的状态」跟着当前
  编辑一起变 —— 撤销等于没撤。这是既有实现（`score/model/chordSlots.ts`）的漏用，不是新工具。
  **用户可感知的变化**：删除歌曲后撤销恢复，和弦布局回到删除那一刻的样子。
- **`scrollIntoViewNow` 提供命令式滚动入口**（`directives/vScrollIntoView.ts` 新增导出；
  `ui/selector/BaseSelector.vue` 改用）：打开下拉时「把选中项摆进视口」是一次性定位，没有可绑定的
  激活态，走不了指令的 mounted / updated 通道。此前 BaseSelector 自己量 rect 改 `scrollTop`，
  与指令 `block: 'nearest'` + gap 的数学重复，且**只认一个容器**（指令走原生 `scrollIntoView`，
  嵌套滚动容器一并处理）。`behavior` 显式传 `'auto'`：默认走非挂载档 `'smooth'`，对「面板刚出现
  就自己滑一段」是错的。**用户可感知的变化**：下拉在嵌套滚动容器里也能把选中项正确滚进视口。
- **`vActionCard` 新增 `active` 选项，BaseBadge 改由指令接管**（`directives/vActionCard.ts`；
  `ui/badge/BaseBadge.vue` 删掉本地 `tabindex` 绑定与 `handleKeydown`）：`active: false` 与 `disabled`
  是两件事 —— 后者是「是个按钮但现在不可用」（role / tabindex 该留着，读屏要能读出「不可用的按钮」），
  前者是「此刻根本不是按钮」（纯展示徽标不该凭空多出一个 Tab 停靠点）。撤 A11y 属性时**只撤自己写上去的**
  （撤前比对当前值是否仍等于自己写的那个）。`tabindex` 不再由模板绑定：同一属性由指令与模板各写一份
  必然打架 —— Vue 的 patch 比对的是新旧 vnode，看不见指令直接改的 DOM。`role` 仍留在模板（非交互态是
  `status`、原生 button 档留空，都不是「按钮」，指令表达不了）。
- **`runBusyAction` 新增 `lock` 选项，Toast / 通知的忙碌态接入**（`platform/composables/runBusyAction.ts`；
  `ui/feedback/GlobalNotification.vue` 里 Toast 与通知各一份手抄流水线删除）：忙碌态是**按条目**的
  （点哪条只让那条转圈），一个共享布尔位塞不下。管线只负责「同步检查 + 同步置位」这个顺序 ——
  它正是防重入的全部依据，中间夹一次 `await` 就等于没守卫。
- **「空打开状态粘贴乐谱」改用 `runBusyAction`**（`domains/score/editor/components/ScoreView.vue`）：
  原先只有 `if (isPasting) return` + try / finally，异常被 `void` 掉的 promise 吞掉。
  **用户可感知的变化**：粘贴失败从此会弹出错误提示（`errorFallback: '粘贴失败'`），不再无声失败。
  该处理器护的是「粘贴 + 可能的确认导入」整段，与 `pasteSongFromClipboard` 内部那条只管自己那一段的
  守卫不是一回事，故外层另起一份。
- 用户可感知的变化：`isEditableTarget`、`cloneChordMap`、`scrollIntoViewNow`、`runBusyAction` 四条；
  其余为等价替换。

### 调整 · 手写实现改走已装库 / 原生 API：防抖、全局监听、rAF 循环、可见性判定（2026-09-29）

- **两处持久化防抖改 `useDebounceFn`**（`domains/score/library/store/songPersistence.ts`、
  `domains/chord/store/chordStore/persistence.ts`）：两边同源，差别只在 `maxWait` 一项 —— 歌曲侧带
  `{ maxWait: PERSIST_MAX_WAIT_MS }`（连续编辑的封顶窗口），和弦侧不带（一次刷写即整库 diff，保持
  拆分前的既有写盘节奏）。歌曲侧原先把「刷写失败后的一次性重试」也挂在 maxWaitTimer 上，现拆成独立的
  `retryTimer` —— 它与防抖那两档无关，接的是「这批数据已回到脏集合、此后无人再碰」那条缝（用防抖档
  重试在配额熔断这类永久失败下会变成热循环）。等价替换。
- **三条全局监听改 `useEventListener`**（`ui/focus-ring/focusRingOverlay.ts` 的 transitionend / focusin /
  focusout，`ui/floating-panel/escapeDispatcher.ts` 的 window keydown）：注册与摘除成对返回，收尾不必再
  手写一份 `removeEventListener`。focusRingOverlay 是常驻单例，漏摘一个就是常驻监听器（重复 setup 时
  旧的那份会一直活着）。escapeDispatcher 里**摘除句柄需自己把 `detachKeydown` 复位** ——
  `useEventListener` 只负责摘监听，不复位会让下一次挂接因「已有句柄」而早退，全局监听再也挂不上。
- **焦点环的每帧循环改 `useRafFn`**（`focusRingOverlay.ts`，删掉自持的 `let raf = 0`）：原先
  「启动（show）/ 自停（target 没了）/ 取消（hide）/ 复活（revive）」四个动作分散在四处，每处都要
  记得判句柄非零，漏一处就是双循环或隐藏后空转。库的 `resume` / `pause` 幂等，四个调用点各自只剩
  「该跑 / 不该跑」一个语义。循环自身保留「target 没了就 `pause()`」的兜底 —— 置空 target 的路径
  不止 `hide()` 一条。等价替换。
- **焦点环的可见性判定改原生 `checkVisibility`**（`ui/focus-ring/focusRingProbe.ts`）：与 `vGridNav`
  的候选可见性同口径，老浏览器（Safari < 17.4）回退计算样式。两条路径的差别只有「祖先感知」与
  「opacity 阈值」两点，对本用途都只会更准（几何停在最后一次写入位置的隐藏子树最该被跳过），
  阈值差（0.005 与 0）只落在过渡最后一瞬。「祖先的 opacity 两条路径都不查」的既有口径保留。
- 用户可感知的变化：无（四条都是等价替换）。
- 验证命令：本层 32 个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/platform/{commonBase64,arrowPanelPath,arrowPanel,popoverOrder,
focusRingSelector,overlayMaskClose}.test.ts tests/utils/chordMap.test.ts
tests/stores/{chordStoreExitFlush,chordStoreWriteGate,songStoreHydrateGate}.test.ts`（87 通过）、
  `--project ui tests/ui/composables/useKeybinding.test.ts tests/ui/BaseSelectorCheckOnIcon.test.ts
tests/ui/form/formRowWaveDelegation.test.ts tests/ui/directives`（32 通过）；
  `ScoreView.vue` / `GlobalNotification.vue` 两个组件另做了**定点类型检查**（临时
  `.temp/tsconfig.probe.json`：`extends` 根 tsconfig、`include` 只放这两个 `.vue` 加 `vite-env.d.ts`
  与 `appDbSchema.ts` 两个环境声明源，跑完即删）—— 0 诊断，修掉了三处报错：
  模板仍引用已改名的 `pasteSongFromClipboardHandler`（TS2339），以及 `run: item.onAction` 传入
  `() => void | Promise<void>` 与管线要求的 `() => Promise<T>` 不兼容（TS2322，两处）。
  该探针不替代提交前的全量 `typecheck`；全量关卡按禁令未代跑。
  （这两处改动本身不在测试覆盖面内：`tests/` 下没有任何文件引用 `ScoreView` / `GlobalNotification`。）

### 修复 · 手势收尾三处漏判：非主键抬起被当成落定、指针捕获只靠隐式释放（2026-09-29）

- **分段控件拖拽：右键抬起会把选择提交掉**（`ui/segmented/useSegmentedDrag.ts`）。
  `handleDragPointerUp` 挂在 window 上且不看 `button`，于是「按住滑块拖到别处 → 按下右键想撤销 →
  抬起右键」这一串里，右键抬起派发的那个 pointerup（`button === 2`）照常走落定路径：先 flush 待处理帧，
  再按指针位置 `hitDragIndex` → `commitSelect`，滑块当场停到指针所在的段上。改为主键之外一律走
  `abortDrag`（判据 `e.button > 0`，与 BaseSwitch 的 `handlePointerUp` 同口径，同时挡住中键；
  pointercancel 的 `button` 恒为 -1，故触摸端被浏览器接管时仍走原有的结算路径）。
- **滚动条拇指拖拽：收尾不释放指针捕获**（`directives/vScrollbar/scrollbarDrag.ts`）。
  `endDrag` 只把 `state.dragAxis` 置空，`pointerdown` 里 `setPointerCapture` 取得的捕获全靠隐式释放。
  而隐式释放挂在 pointerup / pointercancel 的**派发**上：拖拽途中按下右键唤出的原生菜单会把这次手势的
  pointerup 整个吞掉，那一条就不会发生 —— 捕获留在拇指上，此后页面内**任意位置**的按下/抬起都被重定向
  到它（点哪都点不动，反而是滚动条跟着光标走）。与 BaseSwitch 已修的那条同因：记录发起指针的
  `pointerId`，收尾主动 `releasePointerCapture`（未持有捕获时是空操作，多释放一次无副作用）。
- **指板滑动绘制：同一形态**（`domains/fretboard/composables/useFretboardPaintSession.ts`）。
  `begin` 里捕获成功才开会话，但会话收尾只清 `dragPaint`、不释放捕获 —— 该模块的 pointermove 自愈注释
  本就记下了「菜单持有指针后左键的抬起不再派发」这条缝，却只复位了会话状态。`end()` 里补主动释放
  （`pointerup` / `pointercancel` / 自愈三条收尾路径共用它，一处补齐即可）。
- 用户可感知的变化：三条都是「右键取消不再被当成确认落定」与「手势结束后点页面其它位置恢复正常」。
- 验证命令：三个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run tests/ui/composables/useFretboardInteraction.test.ts
tests/platform/{scrollbarOverlayParent,scrollbarSnap}.test.ts`（18 通过）；
  三个文件另做了**定点类型检查**（临时 `.temp/tsconfig.probe.json`：`extends` 根 tsconfig、
  `include` 只放这三个文件加 `vite-env.d.ts`，跑完即删）—— 0 诊断。分段控件与滚动条拇指拖拽在
  `tests/` 下无任何用例，这两条的修复依据是代码判据与 BaseSwitch / useFretboardInteraction 的既有结论，
  未做端到端复现。

### 调整 · 挂在单词上的和弦图改锚定词中心（2026-09-29）

- 需求（用户提「预览乐谱里，视为单词的连续字符，和弦应在它们中间」，并强调「单词的字母之间的间距
  应比正常字符少」）：预览 / 导出图里，一段连续字母（词块）上方挂的那张和弦图应当属于**整个词**，
  落在这一串字的中间，而不是压在它所挂的那一个字上；同时词内字距必须仍是收紧的那一档。
- 旧口径：图锚定**它所在那一字**的字形中心。挂在词首字时图压住后面几个字母；挂在词中 / 词尾字时，
  那一字连同其后内容被推挤右移，词被图从中间掰开（`A6` 的 `A` 与 `6` 相距 15.5 + 13 = 28.5px，
  而不是词内字距）—— 这正是「字母间距该比正常字符少」在挂尾字时失效的那条路径。
- 新口径：词块内**恰好一张**图时，图锚定**块的中心**（块首字字形中心 + 字距 × 步数），也就是那一串
  字母的中间（块长为偶数时落在两字之间）；**推挤随之在块首字一次算定**，整块（含其后各字）一起右移
  —— 词内字距因此只由字宽与词内折减决定，与图挂在哪一字无关。
  块内 0 张图、2 张以上图、以及单字块（中心就是它自己的字形中心）一律不标注，保持「各锚定自己
  那一字」的既有口径（两张图都想落在同一个中心上只会互相挤开）—— 这一档的左右边距另见
  「正常字符挂图撑开左右边距」一节。
- **步数锚定**：块中心相对块首字字形中心的差值恒为词块字距（`wordCharPitch` = 半角推进宽 − 词内折减）
  的整数 / 半整数倍，故只记**倍数**、运行时乘当时的字距 —— 字号缩放改的是字距，改不了这个倍数，
  折行端（预扫描时记下）与绘制端（按当时的字距换算）因此天然同口径，缩放后不必重算。
- 落点（折行端与绘制端仍共用同一套原语，段宽不变量不变）：
  ① `scoreExportLayout` 新增 `markWordBlockCenters`（预扫描一行的字符，按块首字写入
  `WeakMap<ExportCharItem, { steps, figureItem }>`）——存模块级 WeakMap 而不是往 `ExportCharItem`
  上加字段：字符项要经 `postMessage` 结构化克隆进 Worker，排版状态不该混进载荷；
  ② `placeLyricChar` 的落位分三种（词块首字 / 块内那张图所在的字 / 其余挂图字），`LyricFlow` 新增
  `figureReservedFor`（记**字本身**而非布尔值：折行把词块截断在两段之间时，图所在那一字落在新段里、
  新段并没有为它预留过，身份比对天然区分「本段预留过」与「跨段了」）；
  ③ `wrapScoreLines` 的行首调用预扫描，影子流同步带上 `figureReservedFor`（否则影子流会把已预留的
  那一字按普通挂图字再推一次，读出的段宽与真实落位分叉）；
  ④ 绘制端 `renderScoreLine` 的指板图改按 `flow.figureCenter` 落位（原先按字形中心 `centerX`）。
- 单测：`tests/services/scoreTypography.test.ts` 新增「和弦图落在词块中心」一条，覆盖 5 字词
  （图 = 第 3 个字中心 = 首末两字中点）、2 字词（图落在两字之间）、和弦挂词中 / 词尾字（图仍在词中心，
  且两字间距与挂首字时逐像素相同）、汉字不参与词块（图仍锚定自己那一字）、块内两张图（各锚定自己
  那一字、中心距 = 框宽 + pad）；五个用例的段宽不变量（`seg.width` = 逐字重算）全部成立。
- 范围外（未改，仅记录）：块内挂两张以上图时字距仍会被图撑开 —— 一个中心放不下两张图，属另一条决定。
- 验证命令：三个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/scoreExportAbort.test.ts`
  （14 通过）；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 词内字距再收紧一档：词内折减由半个字间隙改为一整个（2026-09-29）

- 需求（用户看过预览后提「单词的字母之间的间距应比正常字符少」「看起来单词的字母和普通字符一样多」
  「再缩小一点我看看效果」）：词内相邻两字的间距要**明显**小于普通字符。
- 口径：`getWordKern` 的折减量由「半个字间隙」改为「一整个字间隙」（出厂 30 − 23 = 7px，此前 3.5px）
  —— 词内相邻两字的**中心距由 15.5px 收到 12px**，可视间隙归零：半角格 19px 里字形推进宽占 11.5px，
  减掉整整一个字间隙后只剩推进宽本身，外加 `wordCharAdvance` 取整留下的 0.5px。
  词界（空格两侧）与汉字一侧的间距**不变**，收紧的只有「没有分隔符、本该连读」的那一段。
- 边界（已写进注释）：12px 是**紧到不能再紧**的一档，再收就只有字形重叠 —— Sarasa Mono 子集的 ASCII
  推进宽恒为 0.5em = 11.5px，正常路径恒有余量；回落字体（Consolas 0.55em、Menlo / SF Mono 0.6em）的
  推进宽大于这个中心距，故只有字体装载失败（离线且缓存未命中）时才会出现词内相邻字母轻微相碰。
- 落点：`scoreExportLayout.ts` 的 `wordKernValue`（**一处口径**，折行端与绘制端共用，改这一处即全谱
  生效）；`getWordKern`、`halfWidthCharWidth`、`HALF_WIDTH_ADVANCE_RATIO` 三处按「半个字间隙」写的
  注释同步改写。
- 单测：`tests/services/scoreTypography.test.ts` 的「词内折减」用例改按一整个字间隙断言，并补一条
  「词内中心距 > 字形推进宽（0.5em）」的防叠字守卫；孤字回借用例的窄宽改为**按词内中心距推导**
  （原先按汉字宽度取，折减口径一变那个宽度就不再逼出折行，用例会静默失效）；10 条全绿。
- 验证命令：两个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts`（11 通过）；
  类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 正常字符挂图撑开左右边距：图两侧各留半个图宽（2026-09-29）

- 需求（用户看过预览后提「正常字符仍需撑开左右边距」）：挂在**单个**字符上的和弦图要占满一整列，
  两侧邻居一起让位 —— 否则图（恒宽 72px）居中于字宽只有 19 / 30px 的字符上时，左半必然压到
  前一个字的格上。
- 旧口径（2026-09-28 起）：图只在与上一张图相撞时把本字连同其后内容**右推**（`chordFigurePush`），
  不撑本字格。上一张图离得远时推挤量为 0 —— 图左半因此压进前一字格，只有右侧被推开，两侧不对称。
- 新口径：挂图的**正常字符**（汉字 / 单字词块 / 块内多图）改占**一整列** = 字宽 + 左右各半个图宽的
  边距（`chordFigureMargin` = (框宽 + pad − 字宽) / 2）：左半由本字（连同其后内容）右移让出、右半由
  游标多推让出，图两侧因此各留 pad/2 —— 与更早的「挂和弦的列宽 = max(框宽 + pad, 字宽)、字形居中于
  列」逐像素同值。**词块那一档不撑**（图去词的中间，撑开只会把一段连续字母掰开，见上一节）。
  推挤保留为兜底（图与图之间恒留 pad）。
- 单测：`tests/services/scoreTypography.test.ts` 新增「正常字符挂图撑开左右边距」一条 —— 汉字三连
  （中间那个挂图）下断言「前一字不动」「图居中于本字」「图左边缘 = 前一字格右端 + pad/2」
  「下一字格左端 = 图右边缘 + pad/2」以及「挂图那一字比不挂图时正好远出一整列」；
  另把「和弦图不撑宽字符格」一条改名为「词块内连续字母不被和弦图撑开」（旧名在新口径下只对词块成立），
  段首单字挂图的段宽断言由「框宽 + 半个 pad」改为整列「框宽 + pad」。
  测试助手 `glyphCentersOf` 改为经 `wrapScoreLines` 走一遍：词块锚定是**行级预扫描**的结果，
  直接摆一条流会跳过它、把词块里的图当普通挂图字算（该助手此前正是这么写的，本次改动把它暴露了出来）。
- 验证命令：三个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/scoreExportAbort.test.ts`
  （14 通过）；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 工程 · 开发测试数据随机标注成立的横按（2026-09-29）

- 需求（用户提「测试数据应随机给成立的横按标记」）：开发面板那份大规模测试数据里的和弦此前
  **一条横按都没有**（`buildChords` 从不传 `barres`），于是横按绘制、横按气泡、双横按梁这些路径
  在真实数据上压不到。
- 改法（`app/modals/devSeedData.ts`）：新增 `pickBarres` —— 候选取自
  `fretboard/model/coordinates` 的 `computeBarreCandidates`（**指板横按编辑弹窗用的同一份判定**：
  两端弦严格同品、被跨弦不低于该品、每段连续子段自成一条），再按固定种子 LCG 随机取 0 ~ 全部候选；
  刻意不自写一套判据，自造判定迟早与「什么算合法横按」分叉、生成出编辑器不认（`isBarreStillValid`
  判否）的横按。抽取发生在指法去重**之后**，不给被丢弃的重复指法白耗随机数。
- 实测（`.temp/` 探针跑中等档，跑完即删）：257 个和弦里 68 个带横按（其中 6 个是多条 / 双横按），
  共 74 条，逐条过 `isBarreStillValid` **0 条不合法**。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；该模块只被 dev 面板引用、
  `tests/` 下无任何引用，故无单测可跑（探针已删）；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 预览与导出的和弦名加大一档、降部改由空弦区上 padding 让出，放不下时先转简写再缩字号（2026-09-29）

- 需求（用户提「预览的子类把和弦名加大一档, 然后和弦名超长时转为简写, 还超长则缩小字号」，随后提
  「和弦名能不能底部对齐, 避免像 jg 这种字符下伸过多」，最后定调「jgy 的方案改成调子类空弦区的上
  padding, 别再做额外处理了」）：指板图内的和弦名比屏幕指板**大一号**；j / g 这类降部不压到空弦
  标记上；名字超出图列宽时按「转简写 → 再缩字号」的次序退让。
- **加大一档**（`scoreExportLayout.ts` 新增 `EXPORT_CHORD_NAME_FONT_RATIO = 1.5`，
  `ExportFretboardGeometry` 重载 `chordNameFontSize`）：基准 12.8 → 19.2，随「和弦缩放」等比
  （用户自行由 1.125 调到 1.25、再调到 1.5，只动这一个常量即可再调）。
  写**比值**而不是绝对 px，与既有的升降号两项同因 —— 绝对 px 贴着当时的基准字号，基准一改就不跟，
  而「导出比基准大一号」这条关系本该恒定；升降号上标字号与抬升偏移本就由正名字号派生，随之等比。
  只改字号，**名字的位置与名字区高度都不动**：字变大后向上吃掉一点名字区的顶部留白（7 → 5.7，仍为正）。
- **降部让位只加上 padding**（新增 `EXPORT_CHORD_NAME_DESCENT_RATIO = 0.223`，
  `ExportFretboardGeometry` 重载 `markerPadTop` = `super.markerPadTop` + 比值 × 本侧名字字号）：
  名字的基线由基准给出、钉在**名字区底边**，降部（j / g / p / q / y 的下伸笔画）整段探到名字区**之外** ——
  基准字号下 j / g 的尾巴落在 0.223 × 12.8 = 2.85 处，而名字区底边到空弦标记上沿只有上 padding 那
  2.38：基准字号下它已经压在标记上 0.48（基准容忍这一点，靠绘制顺序把标记画在名字之后盖住它）。
  本侧字号 1.5 倍，降部按比例加深到 4.28，压进标记近 2px、半个圆点，这就是「j / g 下伸过多」的由来。
  修法落在降部实际占用的那段空间上：降部是名字探下来的，但它占的是**名字与空弦标记之间**的留白，
  而那段留白正是空弦区上 padding —— 按降部深度把它加厚，空弦区与指板整体下移，尾巴落回留白里，
  与标记之间仍隔着基准那一份。
  为此把基准「上下同值」的那一个 `markerPad` 拆成 `markerPadTop` / `markerPadBottom`
  （`fretboardGeometry.ts`；基准两份同值，**只有上 padding 各侧可重载**，纵向链注释同步改写）：
  下 padding 不跟着变，本侧上下两段留白因此不再对称 —— 刻意的，前者要容纳降部、后者不用。
  0.223 是**实测**值而非估值：读 `data/fonts/SarasaMonoSC-Bold.woff2` 得 j / g 的 `yMin = -223`（upem
  1000），p / q / y 为 -215、Q -189、括号 -161，取最深的 j / g 作上界。
  曾试过、已撤掉的那条路（记录以免再走）：重载 `chordNameBaselineY` 把名字整体上移一个降部深度
  （「按底边对齐」）。效果相同，但等于给同一张图的文字另立一套定位口径 —— 基准、离屏缩略图、交互 SVG
  都按「基线 = 名字区底边」画，只有导出图不是，此后任一处改字号或名字区高度都要回来核对这条隐式约定；
  且第一版锚在空弦标记上沿时降部底线正好贴着标记、留白被吃干，视觉上仍连成一片（用户回「还是太多了,
  g 和空弦区都重叠了」）。现方案不动名字位置，唯一被改的是那段留白本身。
- 代价（已写进注释）：本侧空弦区比基准厚一个降部深度（1.5 倍下 4.28 基准 px），指板随之下移、图高这
  一截；放大上限约 1.55 倍（名字的 1em 外框要收在名字区内 = 19.8），再大位图就要向上扩张、压进上一行。
- **降级链**（`drawFormattedChordName` 新增 `compactName` 形参，`maxWidth` 那一档分三级，
  两条快速路径抽成 `drawEpochChordName` 共用）：① 完整名放得下 → 原字号；
  ② 完整名放不下、简写名放得下 → 改画简写、**字号不动**（名字变短而不是变小）；
  ③ 都放不下 → 取两者中**更窄**的那个缩字号贴合。三级都只改「画什么 / 画多大」，仍不做横向压缩。
  取「更窄」而不是「简写」：简写表里也有与完整名等长甚至更长的条目（未收录的性质原样透传）。
- **两个候选名都得过线程**（`ExportChordData` 新增 `shorthandName?`，`workerExportService` 的
  `buildExportChordData` 一并填）：装不装得下要量过宽度才知道，主线程只负责把用户设置决定的那一个
  填进 `chordName`。用户已选简写时两者同值，不再重复带一份（载荷是结构化克隆过线程的）。
- 位图键补上简写名（`buildChordRasterKey`）：画出来的是哪一个由贴合求解决定，两者都是位图内容的输入。
  同时核对 `computeFretboardStyleKey` 的前提 —— 所有几何重载都必须是 `scale` 的函数，新增的重载
  分别走 `scaled(...)` 与相对基准字号 / 上 padding 的比值算式，键无需追加输入。
- 单测：`tests/services/scoreTypography.test.ts` 新增两条 —— 「导出和弦名大于基准，降部由空弦区上
  padding 让出：名字位置不动，与标记之间仍隔一份基准留白」（断言基线仍等于基准的、降部底线落在名字区
  底边之下且越过了基准的标记上沿、上 padding 加厚到把标记推到降部之下、两者间距 = 基准的上 padding、
  下 padding 不跟着变）、「降级链：先转简写，简写也放不下才缩字号」（用极简 2D 上下文替身按字号量宽，
  逐级断言画出的名字与字号：够放 / 换简写 / 缩字号 / 简写更长时取完整名 / 同名不构成降级 / 不传可用宽不降级）；
  `tests/services/workerExportService.test.ts` 的简写用例补「完整名那一档带上简写名、已选简写则不带」。
- 范围外（未改，仅记录）：屏幕侧交互指板（编辑器里的和弦卡）另有一套贴合逻辑，本次不动；基准侧那份
  「名字降部由空弦标记压住」的绘制顺序保留（回落字体 Consolas / Menlo 降部更深，仍靠它兜底）。
- 验证命令：四个改动文件（`scoreExportLayout.ts`、`fretboardGeometry.ts`、`constants.ts`、
  `scoreTypography.test.ts`）`eslint --max-warnings 0` 与 `prettier --check` 0 问题；三组定点
  `vitest run` 全绿 —— 导出侧三文件 18 通过、指板几何 / 布局 / 取点五个文件 60 通过、交互指板 7 通过；
  类型检查按 `rules/03-scoped-verification.md` 的「1.1」无文件级形态，本次另用定点探针
  （`.temp/tsconfig.probe.json`：extends 根 tsconfig、include 只放 `vite-env.d.ts` + 三个改动源文件
  - 该测试文件，跑完即删）跑出 0 诊断 —— 该探针不替代提交前的全量 `typecheck`；
    **全量关卡按禁令未代跑**。

### 调整 · 预览与导出的品号字号加大一档，向左偏移同步加宽（2026-09-29）

- 需求（用户提「预览子类放大一档 fretoffset 字体, 向左偏移量也增多」）：指板图左侧那列品位数字
  比屏幕指板大一号，且它与首弦之间那段空隙同步加宽。
- 改法（`scoreExportLayout.ts` 两个常量）：`EXPORT_CAPO_TEXT_FONT_SIZE` 10 → 12（= 基准
  `CAPO_TEXT_FONT_SIZE` 8 的 1.5 倍，与和弦名同倍），`EXPORT_FRET_NUMBER_X_OFFSET` 3.8 → 6
  （先加到 5，用户随后自行调到 6）。
  品号字号仍是**绝对 px**（本侧字体项里唯一保留绝对 px 的一项）：它不随和弦名派生 —— 名字放大不该
  把品号一起拖大，基准那份也是独立常量。取 12 的判据是仍容得下：数字墨迹高 0.735em = 8.8，
  品格行高 13.5。
  偏移的语义是「品号**右对齐**到首弦 − 本值」，即品号与指板之间那段空隙（见 `fretboardDrawCore`
  的品号绘制）；字号调大后数字变宽，偏移不一起加宽就会贴到首弦上。
- 顺带修正同一处注释：原文写「和弦名字号是这几项里**唯一调大**的一项」，而品号 10 本就大于基准 8 ——
  改为「本侧调大的是和弦名与品号**两项**文字」。
- 无单测：两个都是几何常量，按 `rules/06-test-quality-and-self-check.md` 的「一」第 2 条，把可变配置
  常量写死进断言属于脆弱测试，故不加。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/scoreExportAbort.test.ts
tests/services/workerExportService.test.ts`（18 通过）；类型检查无文件级形态、该项未验证；
  **全量关卡按禁令未代跑**。

### 修复 · 预览里复制 / 下载单页不再等整轮渲染收尾（2026-09-29）

- 需求（用户提「预览里复制单页时不需要等全量渲染完成, 只需要当前完成即可」）：页一画到屏上，
  右键「复制本页 / 下载本页」就该能用，不必等整轮渲染收尾。
- **根因**：这两条路径与右键菜单里的页大小读数都从 `currentRenderData` 取页 Blob，而它只在**整轮收尾**
  的 `applyEntry` 换值 —— 流式渲染期间（`pages-planned` 之后、收尾之前）它仍是上一轮那条（首次预览时
  为 null）。于是屏上那几页明明已经画出来了，复制 / 下载却拿到 null（或上一轮的页）。
- **修法**：新增 `displayEntry`（屏上页流的归属条目），在 `pages-planned`（`canStream`）时由
  `adoptStreamingEntry(entry)` 定格 —— 中间这段时间屏上那几页归本轮条目；`applyDisplayUrls`（整批换源）、
  失败清空页流、切歌三处同步写它。取值统一走 `entryOfDisplayedPage(index)`：先认**归属条目**，再退到
  `currentRenderData`（后者只在「屏上挂着别的内容键的旧图」那条整批换新路径上才是屏上的来源），
  且**两道都按「该条目手里真有这一页」**（`pageBlob(entry, index) !== undefined`）筛 —— 归属只是引用
  层面的记账，真取页时仍以条目自己有没有这格为准，记账一旦滞后也不会把空页当有效页报出去。
- 页 URL 的所有权仍在缓存条目，本模块只持有引用（文件头不变量①同步改写）；`menuPageSize` 与
  `fetchPageBlob`（复制 / 下载共用的取页）都改走这条口径。
- 无单测：该 composable 在 `tests/` 下无任何引用（`ScorePreviewPane.vue` 亦无），按
  `rules/06-test-quality-and-self-check.md` 的「一」不为此新增用例。
- 验证命令：两个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/workerExportService.test.ts`
  （15 通过）；类型检查按 `rules/03-scoped-verification.md` 的「1.1」无文件级形态，本次另用定点探针
  （`.temp/typecheck-probe.mjs`：以项目真实 compilerOptions 只对改动文件 + `appDbSchema.ts` +
  `vite-env.d.ts` 起 Program，后两个是声明合并与环境声明的来源，缺了会报与改动无关的假错）跑出
  **0 诊断** —— 该探针不替代提交前的全量 `typecheck`；**全量关卡按禁令未代跑**。

### 调整 · 预览折行续行缩进加宽到两格、折行子行间距收紧（2026-09-29）

- 需求（用户提「预览里, 长行折行再缩进多一个单位, 行内上下的间距再缩小」）：
  预览里长歌词行折出的续行要退得更明显，同一行内部折出来的子行之间要更紧。
- **续行缩进 32 → 62**（`WRAPPED_LINE_INDENT`，`score/constants.ts`）：量纲取**汉字格**
  （`REGULAR_CHAR_WIDTH` = 30），原值约一格、新值约两格。退一格时续行与首行首字几乎齐平，
  看不出「这是上一行的继续」；退两格才有可辨的悬挂层次。
- **折行子行间距 18 → 12**（`WRAPPED_LINE_ROW_GAP`）：与 `LINE_ROW_GAP`（36，行与行之间）是
  **两个口径** —— 折出来的子行同属一个歌词行，它们之间的间距要明显小于行间，读起来才是一整句
  而不是几句。原值是标准行距的二分之一，现为三分之一。
- 两个键都在 `FONT_SCALED_KEYS` 里，随「字号缩放」等比缩放，故续行缩进与字列始终同源，
  缩放后不会与首行错位；改的是**基准值**，预览与导出图同源生效（两者共用同一套 Worker 排版）。
- 只动 `src/domains/score/constants.ts` 一个文件（两个常量值 + 注释）：缩进量的消费点
  （`scoreExportPages` 的 `startX`、`scoreExportLayout` 的 `maxWForContinuation` 与段宽累加）
  与子行间距的消费点（`scoreExportPages` 的绘制循环、总高与 A4 分页的 `dynamicRowGap`）
  全部读同一个键，无第二处口径。
- 验证命令：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts`（13 通过，段宽不变量用例
  引用的是常量而非写死像素，故两个值改动后仍绿）；类型检查按
  `rules/03-scoped-verification.md` 的「1.1」无文件级形态、该项未验证；**全量关卡按禁令未代跑**。

### 调整 · 预览 A4 折行两端对齐：除本行末段外，字距均摊撑满可用宽（2026-09-29）

- 需求（用户提「折行的文字gap自适应, 除了末行, 其它的都要类似于space-evenly」，并澄清是**水平**行）：
  长歌词行折出来的各段，除本行最后一段外，都要把**字与字之间的空隙**均匀撑开、右边界顶到可用宽。
- 做法：折行时为「本行非末段」的每一段算一个对齐量 `justifyGap`（`RenderSegment` 新增字段，
  见 `wrapScoreLines` 的出口），绘制端按它逐字摊开（`renderScoreLine`）。
- **摊法**：`(可用宽 − 本段自然宽) / (字数 − 1)` —— 按**空隙数**而不是字数分：按字数分会把整段
  右边界多推出去一个空隙的量（末字之后没有空隙可摊）。末段不摊，这是排版惯例（末行不拉伸），
  也正是需求里「除了末行」的字面含义；没折过的行只有一段、它自己就是末段，故单行歌词版面零变化。
  单字段（孤字段）没有空隙可摊，返回 0 不拉伸 —— 撑满整行只会把那个字推到行中间。
- **不是线性式，故实测收敛**：段内和弦图之间的推挤是 `max(0, …)` 折点（见 `chordFigurePush`），
  字距被撑开之后，段首原本需要的那一截推挤就不再需要 —— 实测段首挂图的长行，线性估计比实际宽
  4.5px。故先按线性式估一轮，再按**实测残差**补，最多 3 轮（容差 0.05px）。
- **段宽写实测值**而不是目标宽：收敛残差与折点都可能吃掉零点几像素，写目标宽会让「量到的宽」与
  「画出来的宽」分叉，而绘制端是按段宽居中 / 定位的（`scoreExportPages` 的 `startX`），差多少就摆偏多少。
- **对齐量必须进词块字距**：`placeLyricChar` 新增 `extraPitch` 参数（末字传 0），词块中心的推算
  （`block.steps × 字距`）也要带上它 —— 否则块内那张图仍按未撑开的字距算块中心，而块内各字已经
  按撑开后的字距排开，图会从块中心偏出去。折行端与绘制端共用这一个参数，两处口径不会分叉。
- **只在 A4 分页传 `justify`**：那里的可用宽是一条**硬宽**（页宽 − 左右页边距），折出来的各段
  本就该顶到同一条右边界。长图 / estimate 不传 —— 它们的可用宽是**上限**而非目标（画布宽由最宽行
  反推），在那里对齐会把每一折行都撑到上限、画布随即被顶到上限宽，「自适应最宽行宽度」这条既有
  特性就没了。预览与 PDF / ZIP 导出同为 A4，故两者一致。
- 落点：`scoreExportTypes.ts`（`RenderSegment.justifyGap`）、`scoreExportLayout.ts`
  （`measureSegmentContent` / `justifyGapOf` / `placeLyricChar` 的 `extraPitch` / `wrapScoreLines`
  的对齐后处理与第四参 `justify`）、`scoreExportRender.ts`（逐字摊开）、`index.ts`（A4 分支传 true）。
- 验证命令：四个改动文件 + 测试 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/workerExportService.test.ts
tests/services/scoreExportAbort.test.ts`（19 通过，其中排版 14 条 —— 新增「折行两端对齐」用例，覆盖
  摊法算术、末段不拉伸、单行不受影响、孤字段不拉伸、词块图仍居中、长图档不传 justify 时零对齐量）；
  定点类型探针（`.temp/typecheck-probe.mjs`，四个改动文件 + `appDbSchema.ts` + `vite-env.d.ts`）
  **0 诊断** —— 该探针不替代提交前的全量 `typecheck`；**全量关卡按禁令未代跑**。

### 修复 · 折行续行首字的和弦不再占列：续行首字落在缩进位上（2026-09-29）

- 现象（用户提「折行首字符的和弦不计入占位, 也就是这里的人应该和长对齐」）：续行的首字挂了和弦时，
  「挂图字占一整列」那条规则（`chordFigureMargin`）把首字连同其后内容右推半个图宽，
  两条续行的行首于是对不齐 —— 后一条的首字比前一条的首字多缩进了约半个图宽。
- 修法：`LyricFlow` 新增 `hangFirstChord`（由 `beginLyricFlow` 的第二参 `continuation` 置位、
  `placeLyricChar` 用完即清）：续行首字挂图时**既不撑左右边距、也不做「段首不贴边」的推挤**，
  图直接居中于本字、左侧探进续行缩进那段留白（缩进 62 远大于探出量）。首字因此落在缩进位上，
  与上一续行的首字左对齐。
- 为什么连推挤也一并免掉：段首本就没有上一张图可撞，而 `NO_PREVIOUS_FIGURE_CENTER` 那条推挤
  （`max(0, …)`）会把首字重新推回半个图宽 —— 只免边距不免推挤等于没改。
- 为什么**首行**不放开：首行的段首是**版心左边界**，图探出去落进的是页边距，那是真的越出版心；
  续行探进去的是缩进留白。故 `continuation` 只对折行续行置位（`isContinuation`）。
- 首字位置由这一位决定，**折行端与绘制端必须同口径**，故四处调用点一并改：折行端的三处
  `beginLyricFlow`（折行后新建的续行流、避头尾回借重建的流、孤字回借重建的流）、绘制端
  `renderScoreLine`、段宽实测 `measureSegmentContent`；折行端的**影子流**也要镜像这一位 ——
  漏了它会按「图占一整列」估宽，与真实落位（不占列）差半个图宽，折行位置随之偏前。
- 落点：`scoreExportLayout.ts`（`LyricFlow.hangFirstChord` / `beginLyricFlow` 第二参 /
  `placeLyricChar` 的两处分支与清位 / 影子流镜像）、`scoreExportRender.ts`（按 `isContinuation` 置位）。
- 验证命令：改动文件 + 测试 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/workerExportService.test.ts
tests/services/scoreExportAbort.test.ts`（20 通过，其中排版 15 条 —— 新增「续行首字的和弦不占列」用例，
  钉住「续行首字左边缘 = 段首、图居中于本字、两条续行首字左对齐、首行仍占一整列、两处口径一致」）；
  定点类型探针 0 诊断 —— 该探针不替代提交前的全量 `typecheck`；**全量关卡按禁令未代跑**。

### 调整 · 折行续行行首的提示符改为弯折线，并加「折行提示」显示开关（2026-09-29）

- 需求（用户提「折行加一个字符提示, 不要占用排版空间」→ 后续「应该是一个弯折线, 加粗一点,
  在设置加可选显示开关」）：续行要有个可辨的行首标记，但它不得挪动任何一个字、不得改变段宽、
  也不得影响折行位置与两端对齐的结果；形状由字符改为**画出来的一条折线**，并在设置里给一档开关。
- **为什么不再用字符**（先后试过 `↩`(U+21A9) 与 `↖`(U+2196)）：字符的粗细、折角、臂长全不可控，
  换个字重形状就变；它还依赖随包字体子集里正好有那个字形 —— 换符号得先翻
  `scripts/build-font-subset.py` 的码位区间（Arrows 区 `0x2190-0x21FF` 在内，`⤶`/`⏎` 不在），
  缺字形会静默回落到系统字体、风格与整谱不一致。两次换字符也都卡在「箭头到底指向哪」上，
  而这里要表达的其实是「从上面折下来」—— 一个折角比一个箭头贴切，也不必再纠结指向。
- **形状与落点**：竖臂朝上、折角在左下、横臂朝右的 L 形（读作「接着上面那一行、从这里继续读」），
  方框左下角锚在「续行缩进段起点 × 歌词基线」上；臂长 `WRAPPED_LINE_MARK_SIZE`（14px）、
  线宽 `WRAPPED_LINE_MARK_STROKE`（3px —— 单根线没有字形的墨迹量，按正文字重画会发飘，
  故取「比正文笔画粗一档」）。折角圆化半径由线宽派生（`stroke × 2.5` ≈ 7.5px、约合臂长的一半，
  按用户反馈「圆角曲率加大一点」调大），不另立常量：圆角是线宽的观感修正，不是一条独立可调的
  排版量；同时夹在臂长以内 —— 半径超过臂长时折角的终点会跑到起点另一侧、两条直臂互相反向。
- **弱一档画**：次级色之外再压一道 `globalAlpha`（`WRAPPED_LINE_MARK_ALPHA`）。只靠
  `colors.SUB_TEXT` 不够 —— 暗色主题下那是 `#a1a1aa`，与歌词正文的亮度差得很小，画出来几乎与
  正文同重（用户：「它现在太亮了」）。不新增配色令牌：令牌要跟着主题一起维护，而这里要的只是
  「同一支次级色、更淡一点」，属绘制参数而非主题决策。alpha 是绘制状态、**不随 `strokeStyle` 复位**，
  画完必须显式还原，否则同一行后面的歌词会整体变淡（描边状态本身不必还原：本渲染路径其余部分
  一律只用填充，不读 `strokeStyle` / `lineWidth`）。
- **两轮用户反馈把这一笔调到现在的分寸**：先是 0.45 仍偏抢眼（用户：「还是太亮了」），
  同时嫌整体偏大（用户：「然后缩小一点」），故 alpha 由 0.45 一路降到 0.2、臂长 20 → 14、
  线宽 4 → 3 —— 线宽只管粗细、alpha 只管深浅，两个旋钮分开，改哪一个都不会牵动另一个；
  随后又要求折角更圆（用户：「圆角曲率加大一点」），圆化倍率 1.5 → 2.5。
- **纯叠加**：不进 `chars`、不进段宽、不参与折行判定与两端对齐 —— 绘制阶段在字符循环之前
  `stroke` 一笔（`scoreExportRender` 的 `renderScoreLine`），只对 `isContinuation` 的段画、首行不画。
  臂长与线宽两个尺寸键归入 `FONT_SCALED_KEYS`，随「字号缩放」等比；横向落点复用
  `WRAPPED_LINE_INDENT`（该键同样在 `FONT_SCALED_KEYS` 里），故提示符与续行缩进始终同源 ——
  缩放后不会与首字错位，也不会有第二处「提示符该退多远」的口径。
- **设置里的开关**（`scoreShowWrappedLineMark`，缺省开 = 保持既有视觉）走的是本项目新设置项的
  完整链路，四处逐字对齐：类型 `AppPreferencesBackup` / `buildBackupPayload` 的导出 /
  `validation/payload` 的布尔白名单 / `settingsStore.applyPreferencesBackup` 的恢复读 ——
  少一处即「导出不写该字段、白名单又把外来包里的它 strip 掉」的双重静默丢失（P2 审计 #15 那类缺陷）。
  开关只决定「这一笔画不画」，不触发重排；但它**必须进预览内容键**（`scoreRenderCacheKey` 的页级段），
  否则切开关会命中旧条目、回吐还带着提示符的那张图 —— 这一点与「显示页脚」正相反（页脚是独立合成层，
  刻意不进键）。
- 落点：`score/constants.ts`（`WRAPPED_LINE_MARK_SIZE` / `_STROKE` / `_ALPHA` 及其注释）、
  `scoreExportLayout.ts`（两个尺寸键归入 `FONT_SCALED_KEYS`）、`scoreExportRender.ts`（1.5 段画折线
  与新增的 `showWrappedLineMark` 参数）、`scoreExportPages.ts` / `index.ts` / `scoreExportTypes.ts` /
  `workerExportService.ts` / `useScoreRenderPayload.ts`（开关透传）、`scoreRenderCacheKey.ts`（进键）、
  `platform/utils/constants.ts` + `platform/types/settings.ts` + `platform/store/settingsStore.ts` +
  `HeaderConfigPopover.vue` + `backup/buildBackupPayload.ts` + `validation/payload.ts`（设置项本体）。
- 验证命令：18 个改动文件 + changelog 片段 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `vitest run --project logic tests/services/scoreTypography.test.ts tests/services/workerExportService.test.ts
tests/services/scoreExportAbort.test.ts`（21 通过，其中排版 16 条）+ `vitest run
tests/data/syncPayloadSecurity.test.ts tests/ui/scoreRenderCacheKey.test.ts`（16 通过）——
  提示符用例改为「是一条弱一档的折线」，钉住「两臂端点与形状（竖臂同 x、横臂同 y）、
  线宽 = `WRAPPED_LINE_MARK_STROKE`、整条落在缩进段里、首行不画、开关关掉不画、折线不在 `chars` 里、
  段宽与逐字重算一致、落笔 alpha 为 `_ALPHA` 且画完还原为 1」，另在缓存键用例里补「切开关必须换键」；
  定点类型探针（`.temp/typecheck-probe.mjs`）19 个根文件 / 闭包 594 源文件 **0 诊断** ——
  该探针不替代提交前的全量 `typecheck`，`HeaderConfigPopover.vue` 的模板改动探针覆盖不到；
  **全量关卡按禁令未代跑**。

### 功能 · 缩品数优先删首部空品格，越界音不再被直接掐成闷音（2026-09-30）

- 需求（用户提「指板切换显示3/4/5品时, 优先从首/尾的空品格删, 比如四品时, xx444x, 切换三品是
  xx333x」）：缩小可视品位数时，若越界音符之前的窗口列均为空（无任何按弦音），把窗口起点右移
  （`fretOffset` 增大、按弦音的相对品号同步左移），越界音符随之落回窗内、**绝对品位不变** ——
  4 品 `xx444x` 切 3 品得 `xx333x`，而不是把 4 品音掐成 x；空弦（0）不参与平移，其绝对音高本就
  不随窗口移动。首部空列不足（或 `fretOffset` 已达上限 12 移不动）时，余量仍回退为既有的掐音。
- 横按随窗口同步平移，并补 `isBarreStillValid` 复检（锚点被掐即废弃，与 reconcile 语义一致）；
  根音标记口径不变（所在弦被掐则清除，随窗平移不影响）。
- `setFretCount` 挂程序性标记跳过横按 watcher 的逐弦重算：平移是**批量**改动按弦品号，而该
  watcher 是 `flush: 'sync'`，会在「部分弦已平移」的中间态里把横按锚点判失配而整条误清 ——
  横按的平移与失效清理由 `pruneForFretCount` 内部一次完成。
- 落点：`chordBarreLogic.ts`（`pruneForFretCount` 的移窗 + 回退 + 横按处理）、
  `chordEditorStore.ts`（`setFretCount` 的程序性标记）。
- 验证命令：三个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；新增
  `tests/domain/chordBarreLogicPrune.test.ts` 7 条全绿（用户例子锚点、无空列回退、空列不足先移窗
  再掐、上限 12、无越界不动、横按平移与废弃、根音失效）；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。
