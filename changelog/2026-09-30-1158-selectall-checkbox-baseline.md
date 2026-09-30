### 修复 · 「删除指法」弹窗的全选复选框切换时不再上下位移（2026-09-30）

- 现象（用户提「删除多指法的全选checkbox切换状态会上下位移」）：宽屏下点「全选」，勾选框会整体**下沉
  1.73px** —— 勾选态与未勾选态的盒子高度都是 19.47px、行盒高度也不变，只有它在行盒里的对齐位置动了。
- 根因：宽屏那枚的包裹层是 `<span class="max-sm:hidden">`，默认 `display: block` 下复选框落进**行盒**、
  按基线对齐。而 BaseCheckbox 是 inline-flex，其基线取自第一个 flex item：未勾选时勾选框内为空 →
  基线 = 勾选框底边；勾选态盒内多一枚 16px 勾图 → 基线 = 勾图底边，比盒底高出
  (0.875rem − 16px) / 2 = 1.73px，整枚控件随之在行盒内下沉同量。
  窄屏那枚（计数行里）包裹层本就是 `flex w-[3.25rem]`，实测位移 0；备份弹窗两枚直接挂在
  `#header-extra`（父级即 `.modal-header-right` 这个 flex 行）上，同为 flex item，故均不受影响。
- 修法：宽屏那枚的包裹层补 `flex items-center`，复选框成为 flex item（块化、不参与行盒基线），
  与窄屏那枚逐字同源；`max-sm:hidden` 是媒体变体、在产物里排在基础档之后，仍能盖住基础档的 `flex`。
- 验证（真实 Chromium 探针，`.temp/probe-selectall-shift.mjs`，改前/改后各跑一遍）：改前宽屏 1280 位移
  **1.73px**、窄屏 480/390 均为 0；改后三档全部 **0**，且 < sm 时可见的仍是计数行那枚（宽屏那枚照旧隐藏）。
  改后宽屏那枚的**静止位置**由 354.52（未勾选）/ 356.25（勾选）收敛为恒定的 355.94 —— 即从「比这一行
  中线高约 1.4px」回到真正居中（包裹层高度 33.38 → 19.47 后由 `.modal-header-right` 的 `items-center`
  居中），与此行里的关闭钮同轴。另量了「已选 0 个 → 已选 12 个」这条路径：480 / 390 下计数行行高
  54.22px 不变、复选框位移 0（不存在第二条「计数变长顶动复选框」的通路）。改动文件
  `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 调整 · 徽标的选中态改为实心底（2026-09-30）

- 需求（用户提「badge 的选中状态改成实心底」「还有左侧栏」「和弦卡片的」）：三处徽标的选中态改为实底
  （`filled`）—— 推导面板候选和弦、左侧栏搜索结果行的「N 指法」、和弦卡片右上角的变体计数。
  - 前两处由浅底（`subtle`）改为实底，未选中档仍是 `subtle`；侧栏那枚原先**常驻** `subtle`、
    不随选中变化，现按插槽下发的 `selected` 切档（与同行的分组名文字、对勾图标同一判据）。
  - 和弦卡片那枚原先是**反着的**（选中 `subtle`、未选中 `filled`），现两档都 `filled`、只由
    `variant` 换色（`neutral` 灰实底 → `primary` 蓝实底）；未选中档保持灰实底，因为它压在缩略图
    角上、要实底的边界感才不糊，选中即由灰转蓝。
- 推导面板此前刻意不用 `filled` 的理由已失效：那版 `filled` 配的是 `--text-on-accent`，该令牌为过
  「强调色上的文字」对比度门禁、三主题统一取深墨，纯黑落在饱和蓝上刺眼。现在 `filled` 一律走
  `bg-<色>-solid` + `--text-on-solid`（实心档上的浅色字，过 AA），见 `BaseBadge` 的
  `COLOR_APPEARANCE_MAP` 注释 —— 已在原地补注说明，免得后来者照旧注释继续绕开实底。
- 两档都带 1px 边框（`filled` 是 `border-transparent`、`subtle` 是 `border-border-light`），
  切档时高度不跳。
- 落点：`ChordAnalysisPanel.vue`（候选徽章 `:appearance` 随 `isCandidateActive` 切）、
  `SidebarLeft.vue`（搜索结果行徽章 `:appearance` 随 `selected` 切）、
  `ChordCard.vue`（变体计数角标恒 `filled`，语义色随 `selected` 切 —— 该轴随后由 `variant` 归位为
  `color`，见本文件末尾「统一基础组件三轴口径」）。
- 验证：三个文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。
- 顺带（用户截图确认、规格澄清）：`BaseSegmentedControl` 的 `filled` 外观档原本带四处**非配色**
  差异（滑块四周内缩 3px、2px 强描边、`rounded-sm` 圆角、段间细分隔线、`border-fg-title` 深墨描边
  压在饱和蓝底上像脏边），与「filled 仅控制配色」的口径不一致 —— 这次按用户给的规格统一收掉：
  - `BaseSegmentedControl.logic.ts`：`FILLED_INSET_PX` 常量与 `resolveIndicatorGeometry`
    的 filled 分支删除，注释里 filled 段的「内缩」描述一并移除；`resolveIndicatorGeometry`
    现 pill / underline 共享同一条 fallback（与段同宽同高）。
  - `BaseSegmentedControl.vue`：段间细分隔线 `<span v-if="...filled && i>0">` 删除；
    `sliderClasses` 与 `itemClasses` 中 filled 档的 `rounded-sm` 全部换成 `rounded-full`
    （与 pill 同刻度）、`border-2` 换成 `border`、`border-fg-title` 换成 `border-transparent`
    （饱和底不描边，与 BaseBadge 的 filled 同口径）；描述注释同步换成「几何与 pill 完全一致，
    只切底 / 文字色」。
  - 落点：调用点只一处（`WorkbenchFretboardPanel` 的「显示品数」），改后选中块由原来的
    段内悬浮蓝块 + 深墨描边 + 段间分隔线 → 与段同宽同高的实心蓝底胶囊（4 / 5品之间不再有
    细分隔线、选中块不再有描边）。
  - 验证：lint / prettier 0 问题；类型检查无文件级形态、未验证；全量关卡按禁令未代跑。
  - 测试：当前没有针对 `resolveIndicatorGeometry` / `FILLED_INSET_PX` 的单测，删常量不破测试。
- 顺带核对（未改代码、结论为**无需修**）：省略标记组合的简写渲染此前被怀疑有问题（据称会渲出
  `M7no59` / `sus4add`），实测为**误报** —— 真实链路（`getChordName(…, { shorthand: true })`）16 条
  带省略标记的名字简写全部正确（合法、同 AST、同音集）：`Cmaj9no5` → `CM9(no5)`、`Csus4no3` →
  `Csus(no3)`、`Gm7b5(no3)` → `Gø7(no3)`。缘由是 `toShorthandQuality` 已经先剥离末尾的 `(no3)/(no5)`、
  把主体单独渲染再拼回末尾（该函数的注释记的就是这条坑），而解析端产出的 `quality` 一律是带括号的
  规范形态，必然被剥到。误报的来源是拿「去掉根音的原始输入」（`maj9no5`，未规范化）去调
  `toShorthandQuality`，而不是拿 `quality` 字段 —— 无括号形态走不到剥离分支、直接掉进
  `renderQualityAst` 的组合兜底。该兜底单独调用时确实仍会产出 `M7no59` / `sus4add`（省略标记被揉进
  骨架与扩展音之间；sus 分支还无条件拼 `add`），但对省略标记组合在当前链路不可达，属潜在残留。

### 修复 · 侧栏点选搜索结果后输入框不再抢回焦点（2026-09-30）

- 现象（用户提「左侧栏的 input，点搜索结果的 item 后又重新抢回焦点」）：鼠标点选侧栏搜索下拉里的
  结果行后，焦点被强行拉回搜索框，结果面板还跟着重开成「输入和弦名称搜索...」引导态——选完和弦
  焦点却停在侧栏输入框上。
- 根因：点选的行随面板卸载从 DOM 摘除，焦点掉到 body；BasePopover 关闭后的 `restoreFocus` 命中
  「焦点已丢 ⇒ 归还」分支，把焦点归还给打开面板时记录的 `previouslyFocused`（即输入框），输入框
  的 focus 又触发 `openResults` 重开面板。键盘 Enter 路径焦点从未离开输入框，归还本就是空操作，
  不受影响——问题只在鼠标点选这一条路。
- 修法：`BasePopover` 的关闭原因新增 `search-item-select`，与既有的「指针点在浮层外」同入
  「不归还焦点」集合（变量随之更名 `closedByPointerOutside` → `suppressFocusRestore`）；
  `BaseInput` 托管结果行的鼠标点选改走「先带 reason 的 close、再进统一选中路径
  `selectIndex`」，键盘 Enter 仍走原路径。BaseSelector 等其它浮层的「选中后焦点回触发器」
  行为不变。
- 验证：两个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；相关测试
  `baseInputLazyCommit` / `popoverOrder` 共 12 条全过；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 调整 · 分段控制拆分 variant / appearance 两轴并互相适配（2026-09-30）

- 需求（用户提「分段控制的 variant 和 appearance 要相互适配」）：早先形态与配色混在单一 `appearance`
  轴（pill / text / tabbed / filled），「实心底」占了一个形态位、无法与胶囊形态叠加。
- 拆分：**形态叫 `variant`**（pill / underline，与 BaseSwitch 的 switch / button 同族）、
  **配色叫 `appearance`**（subtle / filled，与 BaseBadge 同口径）；`tabbed` 改名为自描述的
  `underline`，无调用点的 `text` 与 `boxed` 形态一并移除。breaking 改名，调用点已迁移。
- 适配：`underline + filled` 此前被静默忽略——主色与主色实心两个令牌同源同色，贴底细线表达不出
  配色差。现按用户口径（实心、不圆角）渲染为**整段方角实心主色块 + 实心档浅字**，块替代细线成为
  选中态表达；几何换算、拖动手感（整块搬运、禁用段不预览）、拖动期过渡统一经新增的
  `geometryVariant` 以 pill 语义处理，静止 / 跟手 / 落定三种状态的块形严格一致；
  `showInactiveBorder` 的贴线下移补偿在块状组合下自然失效（该 prop 当前无调用点）。
- 落点：`BaseSegmentedControl.vue`（geometryVariant / sliderClasses / itemClasses 及口径注释）、
  `BaseSegmentedControl.logic.ts` 与 `useSegmentedDrag.ts`（appearance 例外口径与拖动形态注释同步）。
- 验证：三个文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。

### 新增 · 乐谱列表拼音分组排序下的滚动条分组气泡（2026-09-30）

- 需求（用户提「乐谱列表在拼音排序时，滚动条滚动气泡提示在哪个拼音分组下」）：拼音分组把长列表切成
  A-Z（# 置末）的段，快速滚动时「现在滚到哪一组了」没有任何读数。
- 实现：复用 vScrollbar 既有的滚动气泡（随拇指移动、读数逐字符翻页、闲置随滚动条淡出），不做新轮子。
  - `SongSection.vue`：分组小标题行打 `data-pinyin-group` 标记（分组键落在 DOM 上，作读数锚点）；
  - `SidebarLeft.vue`：列表滚动条绑定改为 computed —— 仅「乐谱页 + 拼音分组排序」启用气泡，
    `format` 现查滚动容器内的组头标记，视口顶压在哪个组头之下读数即哪个分组（顶端留白带归首组，
    不露空泡）；其余路由 / 排序方式维持默认滚动条。format 只在滚动帧读 DOM、不闭包捕获响应式列表，
    指令侧仅做引用替换；排序方式切换翻转 bubble.enabled 属结构性选项、整体重建一次（频率极低）。
- 落点：`SongSection.vue`（组头 data 标记）、`SidebarLeft.vue`（listScrollbar 绑定与
  resolvePinyinGroupLabel）。
- 验证：两个文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。

### 新增 · 预览/导出设置「忽略空行」（2026-09-30）

- 需求（用户提「预览乐谱加设置允许忽略空行」）：歌词里用作段落分隔的空行在预览/导出图中各占一行
  高度，用户需要一个开关把它们整个去掉。
- 行为：开关打开后，无可见文字（trim 为空）**且整行未挂任何和弦**（行首 / 字符位 / 行尾均无）的
  歌词行不进入渲染载荷——预览与导出（长图 / A4 分页 / PDF / ZIP）共用同一份载荷，全部同效。
  挂了和弦的白空格行不视为空行，跳过会连带丢用户挂的和弦。
- 接线（与「忽略空格」设置完全同链路）：STORAGE_KEYS 新增
  `CHORD_LAB_SCORE_IGNORE_EMPTY_LINES_V1`（默认关，保持既有排版）→ settingsStore（声明 /
  applyPreferencesBackup 恢复读 / return 导出）→ AppPreferencesBackup 类型 → 备份导出字段与
  zod 白名单（PREFERENCE_BOOLEAN_FIELDS 单表三处派生）→ HeaderConfigPopover「排版」组新增
  「忽略空行」开关（紧随「忽略空格」）→ buildRenderPayload 透传 → prepareWorkerExportPayload
  过滤空行 → scoreRenderCacheKey 页级段入键（换挡即整谱重渲）。
- 落点：`constants.ts` / `settingsStore.ts` / `types/settings.ts` / `payload.ts` /
  `buildBackupPayload.ts` / `HeaderConfigPopover.vue` / `workerExportService.ts` /
  `useScoreRenderPayload.ts` / `scoreRenderCacheKey.ts`；`syncPayloadSecurity.test.ts` 的
  preferences 逐字段断言补入新字段。
- 验证：全部改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；相关测试
  `syncPayloadSecurity` 2 条全过；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 新增 · 排列和弦纵向滚动行号气泡 + 滚动气泡 lg 档（2026-09-30）

- 需求（用户提「排列和弦竖向也显示分页气泡，滚动条气泡 size 扩展支持 lg」，气泡读数「要加上总行号」）：
  长谱面纵向可达数百行，滚动中「现在在第几行」只能靠行号逐行扫。
- 气泡 lg 档：`ScrollbarBubbleSize` 扩为 sm / md / lg——tokens.scss 新增
  `--bubble-padding-lg / -radius-lg / -font-size-lg`（度量仍取 $space / $radius / $fs 刻度，
  纵向留白与 md 同高，横向进一档；圆角取刻度内紧邻上一档）、vScrollbar.scss 新增 `--lg` 规则、
  `BUBBLE_ARROW_SIZE` 补 lg:12（箭头随气泡高度成比例）。既有 sm / md 档观感零变化。
- 行号气泡：排列和弦区（ScoreInteractiveArea）滚动条绑定纵向气泡，读数为「当前行 / 总行数」
  （当前行 1 基两位补零，与行内行号同一份 formatLineIndex 口径；总行数随歌词编辑实时跟随）。
  横向滚动不触发（bubble 轴锁 y）；绑定对象静态、无响应式依赖，指令侧零重建。
- 读数口径（用户随后提「这个气泡的行号直接用总滚动高度/当前滚动高度/总行号来算」）：由**滚动进度**
  换算 —— vScrollbar 下发的 `progressY`（= `scrollTop / (scrollHeight − clientHeight)`）线性映射到
  行号，进度 0 → 首行、进度 1 → 末行（`Math.round(ratio × (总行数 − 1))`）。
  初版是滚动帧里现查 DOM（行行打 `data-line-idx` 标记，取「最后一个行顶沿已越过容器上沿」的行）——
  虚拟化下未渲染的行不在 DOM、读数只能跟随已渲染窗口推进，且滚动帧里带一次全行遍历 + 每行一次
  `getBoundingClientRect`。改为比例换算后滚动帧零 DOM 查询、读数与拇指位置线性对应；行标记随之删除
  （`data-line-idx` 是该读数专用的，别处不用；拖拽契约的 `data-line-index` 未动）。
  **成立前提**是同一批次落地的实算占位（见上一条修复）：内容总高在分片挂载期间恒定，进度才稳定。
  代价是行高不均时读数只是近似（逐行严格对齐要求每行等高）——该读数的定位是「滚到哪一片了」的粗
  读数，要精确到行以行内行号为准。
- 落点：`scrollbarTypes.ts` / `tokens.scss` / `vScrollbar.scss`（lg 档三件套）、
  `ScoreInteractiveArea.vue`（气泡绑定 + 行号读数）。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。

### 调整 · 分段控件的一轴改称 `appearance`，其中 `boxed` 更名 `filled`（2026-09-30）

- **breaking（组件 API）**：`BaseSegmentedControl` 的 `variant` → `appearance`。这一轴描述的是**外观**
  （pill / text / tabbed / filled），与仓内 `BaseBadge` 的 `appearance`（filled / subtle / outline）+
  `variant`（语义色；该轴随后归位为 `color`）两轴同口径；旧的 `variant` 之名只留下「形态」这层误导（`tabbed` boolean 并入这一轴
  之后更是如此）。调用点三处已全部迁移：工作台指板面板（`appearance="filled"`）、和弦选择面板的分组页签
  与顶栏乐谱页签（`appearance="tabbed"`）。
- 值名 `boxed` → `filled`：该档的视觉已是实心主色块，「方块」不再是它的识别特征；`filled` 取 `BaseBadge`
  的既有词表（同一轴同一个词）。随之同步的内部名：`visualVariant` → `resolvedAppearance`（与
  `resolvedSize` / `resolvedIconSize` 同族）、拖动 composable 的 `visualVariant()` 选项 → `appearance()`、
  几何换算的参数与常量 `BOXED_INSET_PX` → `FILLED_INSET_PX`，注释里「视觉形态」一并改为「外观」。
- 验证：四个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；全仓 grep 确认无 `boxed` /
  `BOXED_` 残留；真实浏览器实测 `appearance="filled"` 生效（几何见下一条）；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。

### 重构 · 分段控件拆成「形态 / 配色」两轴，`tabbed` 改名 `underline`，移除 `text` 形态（2026-09-30）

- 需求（用户三句：先「新的样式太扁了, 它应该只改变配色, 不改变其它样式」，再截图确认后「边框」
  「边框颜色」，最后「`appearance="tabbed"` 改个名, `appearance` 和 `variant` 分开, `filled` 应该在
  `variant` 里」+「或者你按项目既有 api 来命名」+「移除 text」）。最终**按项目既有约定**落定：
  - **形态轴叫 `variant`** —— 同 BaseSwitch 的 `variant`（switch / button）；取值为 `'pill' | 'underline'`。
  - **浓淡轴叫 `appearance`** —— 同 ActionButton 的 `appearance`（default / subtle / ghost / text；
    该轴当时还叫 `variant`，见本文件末尾「统一基础组件三轴口径」）与 BaseBadge 的 `appearance`
    （subtle / outline / filled）；
    取值为 `'subtle' | 'filled'`，默认 `subtle`。
  - 用户第一句里「`filled` 应该在 `variant` 里」按既有 API 校正为落在 `appearance`：
    本项目里「底 / 描边的浓淡」一律叫 `appearance`、「结构形态」一律叫 `variant`，
    把 filled 塞进 `variant` 会与 BaseBadge / ActionButton 两处既有命名同时冲突。
  - 两轴独立后 filled 才能与胶囊形态叠加：`WorkbenchFretboardPanel` 的「显示品数」原写
    `appearance="filled"`（旧语义 = 独立形态位），新语义下**该调用点无需改动** ——
    它天然就是「pill 形态 + filled 配色」（形态走默认值）。
- 改名与移除：`tabbed` → `underline`（形态轴三个候选值里唯一的组件比喻词，换成自描述的形态词，
  与 pill 同族）；原 `text` 形态**无任何调用点**，连同 `SIZE_MAP` / `COMPACTED_SIZE_MAP` 的
  `textItem` 字段、`itemClasses` 的 text 支、`showSlider` 与 `handlePointerDown` 里的 text 判据一并删除。
- 结构项同步收口（「只改变配色，不改变其它」的落地）：内缩 3px、`rounded-sm` 圆角、段间细分隔线、
  `border-2` 强描边、`border-fg-title` 深墨描边全部收掉 —— 前四项改为与 pill 逐项同值
  （同宽同高 / `rounded-full` / 无分隔线 / 1px 描边），描边改 `border-transparent`（饱和底自身即边界，
  再描一圈是脏边，与 BaseBadge 的 filled 同口径）。落点：`BaseSegmentedControl.logic.ts`
  （`FILLED_INSET_PX` 常量与 `resolveIndicatorGeometry` 的 filled 分支删除、新增 `SegmentVariant` /
  `SegmentAppearance` 两个导出类型）、`BaseSegmentedControl.vue`（两轴解析 `resolvedVariant` /
  `resolvedAppearance`，`controlClasses` / `sliderClasses` / `itemClasses` 按「几何吃形态、配色吃
  appearance」重排，模板里的分隔线 `<span>` 删除）、`useSegmentedDrag.ts`（选项 `appearance()`
  → `variant()`，类型改 `SegmentVariant`）。
- 调用点迁移：`TopHeader.vue`（乐谱模式页签）与 `ChordPickerPanel.vue`（分组页签）的
  `appearance="tabbed"` → `variant="underline"`；其余分段控件调用点（`DevPanel` / `GroupModalsContainer`
  / `WorkbenchExportPanel` / `BaseFormRow`）本就没传这两个 props，走默认 `pill` + `subtle`，不受影响。
- 验证：五个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；全仓 grep 无 `tabbed`
  （注释里记改名沿革的两处除外）与 `textItem` 残留；定点类型探针（`.temp/typecheck-probe.mjs`）
  2 个根文件 / 闭包 213 源文件 0 条与本次改动相关的诊断（仅 2 条既有的 `import.meta.env` 噪声）；
  **`.vue` 模板层的 props 类型校验属 `vue-tsc` 全量、未验证**；全量关卡按禁令未代跑。

### 调整 · 统一基础组件三轴口径：`variant` 形态 / `appearance` 浓淡 / `color` 语义色（2026-09-30）

- 需求（用户先提「检查项目里哪些组件需要按 variant 和 appearance 来拆 api」，再提「全部修复成正常形态」）：
  仓内各基础组件此前**各自为政**——同一个词 `variant` 在 `BaseBadge` 里是语义色、在 `BaseSwitch` /
  `BaseSegmentedControl` 里是形态、在 `ActionButton` 里又是浓淡；语义色更散成五套词表。现统一为
  **`variant` = 结构形态、`appearance` = 底 / 描边的浓淡、`color` = 语义色（`ThemeColor`）**。
- 语义色词表收成**一份**：`ThemeColor` 首档由 `default` 更名 `neutral`（`default` 在本仓是「档位默认值」
  的词，与「显式要中性色」撞车）。四处自建词表随之归位：`BaseBadge` 的 `BadgeVariant` 删除、改用
  `ThemeColor`；`BaseCheckbox.color` 类型改 `Exclude<ThemeColor, 'neutral'>`（本组件配色表无中性档）；
  `BaseModal.confirmType` → `confirmColor`；`Feedback.actionColor` 类型改 `ThemeColor`。
- 轴归位（**breaking，调用点已全量迁移**）：
  - `ActionButton`：`variant` → `appearance`（default / subtle / ghost / text 描述的是浓淡、不是形态，
    本组件没有形态轴）；`color` 默认值 `default` → `neutral`。
  - `BaseBadge`：`variant`（语义色）→ `color`，`VARIANT_APPEARANCE_MAP` → `COLOR_APPEARANCE_MAP` ——
    至此与 `BaseSwitch` / `BaseSegmentedControl` 的 `variant`（形态）不再撞名。
  - `BaseCheckbox`：`bordered` 布尔 → `appearance: 'default' | 'outline'`（同一视觉维度不留两个入口）。
  - `Feedback`：`bordered` → `appearance`；`actionVariant` → `actionAppearance`（透传影子随宿主改名）。
  - `BaseTextarea` / `BaseNumberInput`：`variant`（default / glass）→ `appearance`；`BaseInput` **补齐同一轴**
    —— 三件套里原先只有它没有外观档，`glass` 场景只能由调用方压 class。
  - `BaseDivider`：`color`（light / glass / base）→ `appearance`（这是描边浓淡，与语义色无关）。
  - `BaseSwitch`：形态轴 `variant`（switch / button）本就合规，只把内部透传给 ActionButton 的
    `:variant` 改为 `:appearance`。
- 落点：`platform/types/ui.ts`、`buttonThemes.ts`（四张语义色表的 key 与注释）、`ActionButton` / `BaseBadge` /
  `BaseCheckbox` / `Feedback` / `BaseTextarea` / `BaseNumberInput` / `BaseInput` / `BaseDivider` / `BaseModal` /
  `BaseSwitch` / `BaseSegmentedControl`（两轴注释按新口径重述）；调用点 20 余个文件按**取值**区分批量迁移
  （`ghost` / `subtle` / `text` / `default` → `appearance`，`neutral` / `primary` / `warning` / `success` /
  `danger` → `color`）。

### 修复 · 菜单触发器按钮「变亮」：语义色字面量落空后不再静默丢类（2026-09-30）

- 现象（用户提「basemenu的按钮怎么这么亮?」）：顶栏与侧栏 `<BaseMenu>` 的 `#trigger` 触发器
  （ActionButton）图标明显比邻座亮一档。
- 根因：这些触发器写的是 `:color="isOpen ? 'primary' : 'default'"` —— 语义色首档更名 `neutral` 后，
  **动态绑定里的字面量**没跟着改，`BUTTON_*_THEME_MAP['default']` 查表落空返回 `undefined`，
  整条前景色类从 class 串里消失（只剩 `bg-transparent border-transparent`），图标退化成继承色。
  静态 `color="default"` 三处已随迁移改掉，三元里的 `'default'` 七处漏网（顶栏 5 / 侧栏 2）。
- 修法：七处字面量改 `neutral`；并在 `ActionButton` / `BaseBadge` 的查表处补**中性档兜底**
  （`?? MAP.neutral`）—— `color` / `appearance` 都是运行时值，TS 联合拦不住过期字面量，
  查表落空不该让整块配色类静默消失。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；全仓 grep 确认无失效的
  `'default'` 语义色字面量（`appearance` 的 default 档与 `$slots['default']` 除外）；类型检查无文件级
  形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 两端对齐只撑词外空隙，词内字距不再被拉开（2026-09-30）

- 现象（用户先提「预览乐谱里单词内的字母间距缩小」，再贴 A4 预览截图指出「上面一排间距比下面多」）：
  同一份和弦名，被撑开的那一段（本行非末段）字母松散，末段却是紧的 —— 词内字距随该段折行后
  剩下多少而变。
- 根因：`justifyGap` 按「每个字间空隙」均摊（`gapCount = chars.length − 1`），**词内空隙也在内**。
  A4 预览（`ScorePreviewPane` 恒传 `mode: 'a4'`）的可用宽是硬宽、`wrapScoreLines(..., justify = true)`，
  于是首段每个字母都被摊走一份对齐量；末段（`isLastSubLine`）不摊、保持折减后的自然字距 ——
  两段的词内字距因此对不上。
- 口径：两端对齐**只摊词外空隙**。抽出 `isWordInnerGap(prev, next)`（两侧都是词内字符）作为「词内」的
  唯一判据，三处共用：`getWordKern`（词内折减）、`justifiableGapCount`（摊几份）、绘制端的
  `extraPitch`（这一格摊不摊）。词内字距恒等于折减后的自然值，与所在段撑不撑开无关；对齐量全部
  落到词间 / 字外空隙上，右边界仍顶到可用宽（「除末段外都齐平」这条不变量不变）。
- 整段没有任何词外空隙时（例如整段就是一个连续词）`gapCount = 0` → 不拉伸：宁可这一段右边界参差，
  也不把词内字距撑开。纯汉字 / 中英混排行不受影响 —— 汉字不参与词内判定，其空隙照旧全部摊对齐量。
- 落点：`scoreExportLayout.ts`（新增 `isWordInnerGap` / `justifiableGapCount`，改 `measureSegmentContent` /
  `justifyGapOf` / `getWordKern` 与相关注释）、`scoreExportRender.ts`（`extraPitch` 逐格判词内）、
  `scoreExportTypes.ts`（`RenderSegment.justifyGap` 注释）、`tests/services/scoreTypography.test.ts`
  （两个重放辅助函数按新口径同步，另加「词内字形中心与不对齐时逐个相同」的断言与一条对照）。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；`pnpm vitest run
tests/services/scoreTypography.test.ts` 16/16 通过；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 折行提示符的不透明度再降一档（0.2 → 0.12）（2026-09-30）

- 现象（用户提「折线的亮度再降低一点」）：折行续行行首那条折线仍偏抢眼。
- 修法：只动 `SCORE_EXPORT_CONFIG.WRAPPED_LINE_MARK_ALPHA`（提示符唯一的「深浅」旋钮，线宽只管粗细），
  0.2 → 0.12；注释里同步记上这是该值第三轮下调（0.45 → 0.2 → 0.12）。
- 落点：`domains/score/constants.ts`（含注释）。绘制端与测试都读同一个常量（没写死字面量），无连带改动。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；`pnpm vitest run
tests/services/scoreTypography.test.ts` 16/16 通过。

### 新增 · 通用探针：把每次现写的调试脚本固化进 `scripts/probe/`（2026-09-30）

- 需求（用户提「我发现每次调试都要重写探针, 能直接写一份通用探针吗」）：此前每查一个视觉 / 样式问题都要
  现写一份一次性脚本（`.temp/` 下，跑完即删），样板——起 Chromium、注入 `dist/` 真样式表、复刻真实
  DOM 链、扫多视口、按显示宽度对齐表格——反复重写。
- 落点与形态：`scripts/probe/probe.mjs`（主入口）+ `lib/appCss.mjs`（产物样式表与工具类规则）+
  `lib/compile.mjs`（SFC 模板编译）+ `cases/example.mjs`（样例，兼自检）；`package.json` 增
  `"probe": "node scripts/probe/probe.mjs"`。截图写在 `.pp-probe/out/`（`.gitignore` 已忽略，只放可
  再生的产物），**代码本身放 `scripts/` 入库** —— 初版建在被忽略的 `.pp-probe/` 下，被用户指出「被git
  忽略了啊」，那样等于每次仍要重写。
- 契约留窄、判断留给 case：case 文件 ESM 默认导出一份配置（`title` / `theme` / `viewports` / `css` /
  `body` / `url` / `setup` / `measure`），`measure(page)` 必填、返回纯数据行。探针只负责「按视口起页、
  注入真样式、等字体就绪、把行打成表」，**问什么量什么由 case 决定** —— 样板不再重写，读数也才有可比性。
- 用法：`pnpm probe cases/<name>.mjs [--viewport 1440x900,390x844] [--shot] [--headful] [--keep]`；
  未知参数**直接报错**（静默忽略拼错的开关是最难发现的失败）。每视口重建 page、不继承上一档状态。
- `loadAppCss()` 只读 `dist/` 产物、不自己编译：类名大量来自 Tailwind 的**构建期扫描**，源码里的
  class 串不等于最终规则。入口表由 `dist/index.html` 的 `<link rel="stylesheet">` 定序（入口在前、
  分包随后，只注入入口会漏掉组件级 scoped 样式，顺序反过来则分包可能盖住 `:root` 令牌），并把产物
  最后写入时间一并返回由调用方打印 —— 产物是快照，读数与源码不符时第一个要看的就是它。
- `tailwindRules(classes)` 取产物里工具类的规则原文，按 Tailwind 自己的转义传**源码里写的那个类名**
  即可（`md:px-3`、`max-md:h-[1.6rem]` 照原样传）。实现踩了三个坑并已修：① 按 `}` 朴素切块会把
  `@media` 里那条切成 `@media (…)` 前缀而漏掉响应式类 → 改花括号配对取「选择器 + 规则体」；
  ② 只留规则体会让 `max-md:` 与 `md:` 两档在读数里长得一样 → 把外层 at-rule 条件接回前面
  （`@media not all and (min-width:48rem) { … }`）；③ 取声明起点时 `lastIndexOf('{', open)` 会命中
  `open` 自己那个 `{`（`fromIndex` 是闭区间）→ 传 `open - 1`。
- 验证：`pnpm probe cases/example.mjs --shot` 三视口读数一致（圆角 `22.25px`、卡底色
  `rgb(28, 28, 30)`、文字色 `rgb(152, 152, 157)`、主题 `dark`）；`tailwindRules` 四例命中、一例
  `md:px-3` 返回 0 条（源码从未写过该类，Tailwind 按用量裁剪，属**正确**的空命中，不是漏取）；
  改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 调整 · 和弦选择面板的卡片在行内等高（2026-09-30）

- 现象（用户提「chordpicker里, 一行有显示三品和五品时, 把三品的容器高度拉伸, 注意不是拉伸canvas,
  然后垂直居中」）：一行里混着 3 品与 5 品指法时卡片参差 —— 画布高随品数变（pickerScale 1.6 下
  3 品 129px / 5 品 173px），矮的那张只到自己内容的高度、贴行顶，行内下缘一条锯齿。
- 修法：行网格 `items-start` → `items-stretch`（行高本就由规划给出 = 本行最高卡片），并去掉卡片基类里的
  `self-start`（它会把卡片拉回内容高，留着则单卡不撑）。撑的是**卡片**（画布的父元素）与行网格，
  画布自身尺寸不动 —— 卡片是 `flex-col items-center justify-center`，多出的高度落在画布上下两侧均分。
- 刻意不动的两处：① 画布宽高是指板几何的产物（`FretboardCanvas` 的 `canvasStyle`），跟着拉伸会把整张
  指板连同品距一起拉变形，故 `FretboardCanvas` 一行未改；② 虚拟行高的算式（`ChordPickerPanel.logic`
  的 `getPickerCanvasCssHeight` + `getPickerCardChromePx`）不用动 —— 规划只需要「行高 = 本行最高卡片」，
  矮卡撑高不改变任何一行的行高。
- 验证（通用探针 `scripts/probe`，同页并排渲染新旧两组行、各含 3 品与 5 品卡，真实类名 + dist 真样式表）：
  旧组卡高 153.25 | 197.25，新组 197.25 | 197.25；画布高 129.00 | 173.00（未变）；画布上下留白
  34.13 / 34.13（3 品）与 12.13 / 12.13（5 品），即精确居中。改动文件 `eslint --max-warnings 0`
  与 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 位图画布另立几何子类：和弦名放大一档、降部由空弦区上 padding 让出（2026-09-30）

- 需求（用户提「位图canvas的子类也和worker侧一致, fretoffset偏移字号和空弦上padding」）：离屏指板图
  （屏幕缩略图 / 导出 PNG）此前直接吃基准几何、**一处都不重载**，而导出侧（乐谱 Worker）早就另立子类把
  和弦名放大了一档。现按导出侧同一套口径给画布侧也立一个子类。
- 落点：新增 `fretboard/model/canvasGeometry.ts`（`CanvasFretboardGeometry` + 两态单例 +
  `canvasGeometryFor`，与 `interactiveGeometry.ts` 同层）；`renderFretboardCanvas.ts` 的
  `CANVAS_GEOMETRY` 与 `computeFretboardLayout` 改读本侧子类；`ChordPickerPanel.logic.ts` 的
  `getPickerCanvasCssHeight`（虚拟行高的唯一口径）同步换过来 —— 占位必须与实绘同源，否则行高比卡片矮一截。
- 重载两项（**口径**与导出侧同一套、倍数各侧自定）：和弦名字号 × 1.2（导出侧 1.5），升降号上标字号与
  抬升偏移随正名等比派生；空弦区上 padding 加厚一个降部深度（0.223 × 本侧字号 = 3.43）。
  **只改字号，名字的位置与名字区高度都不动**（基线仍钉在名字区底边，`chordNameBlockH` 仍是 19.8）。
- 品号（字号 + 左偏移）**刻意不跟导出侧**：导出侧那份放大靠的是它栅格外面另垫的一圈 `padX`
  （= leftPad，左右各一份），画布没有那一圈 —— 品号右对齐在「首弦 − 偏移」处，左边能用的只有基准的
  左留白 14px。实测（Chromium，`bold Npx system-ui`）：基准 8px 的两位数宽 9.87，配 offset 4 时锚点
  距左缘 10，余量只剩 0.13px（已是极限）；换成导出侧的 12px / offset 6 需要 14.80px、可用只剩 8px，
  **两位数会被裁掉 6.8px**（fretOffset ≥ 6 时必然出现两位数）。要给品号腾地方就得加宽画布左留白，
  而画布宽度是消费方的布局锚点（picker 三列的内容宽只剩 7px 余量、谱面槽位按等宽几何对齐）。
- 验证：几何读数（直接读两侧几何实例）—— 画布名号 12.80 → 15.36、上标 9.60 → 10.56、上标偏移
  −4.00 → −4.80、上 padding 2.38 → 5.80、下 padding 2.38 与名字区高 19.80 均不变；画布图高
  3 品 80.85 → 84.28、5 品 107.85 → 111.28（picker 侧 CSS 高 129 → 135 / 173 → 178）。
  字形宽实测：名字 15.36px 下 `Cmaj7` = 48.4 < 可用宽 64，放得下（更长者仍走既有的贴合降级链）。
  改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 修复 · 模态在屏期间贴边浮动面板让位，和弦编辑抽屉不再被面板盖住（2026-09-30）

- 触发（用户报「chordpicker 和新建/修改和弦的层次打架了」，随后补「抽屉关闭时 header 会短暂盖过 Panel」）：
  从和弦选择面板里打开的和弦编辑抽屉被面板压住。
- 根因：模态（Modal / Drawer）走 z-index，非模态浮层（`BaseFloatingPanel`）走浏览器 top-layer，而
  top-layer 恒在一切 z-index 之上 —— 两者相遇时面板必胜。2026-09-29 迁移时定的口径
  「模态打开时**先收拢所有存量浮层**」只实装在 `BasePopover`（`closeAllPopovers`），贴边面板没有关闭
  函数可登记，这正是缺的那一半。
- 落点一（层号时机）：`overlay/overlayLifecycle.ts` 新增「模态在屏」登记
  （`onModalLayerPresenceChange`），计数从**打开瞬间**（`engage`，早于首帧）到**离场动画结束**
  （`after-leave`；停用 / 卸载兜底），且只在跨过 0 时通知。刻意不复用 `overlayStack` 的激活栈：那份
  进出时机服务 inert（入栈在 nextTick、出栈在关闭瞬间），照它让位会在抽屉还在滑出时就把面板放回顶层。
- 落点二（面板让位）：`floating-panel/BaseFloatingPanel.vue` 在模态在屏期间**离开 top-layer 并置
  `data-floating-yielded`**，模态走光后原样回层。面板不能跟着关闭 —— 宿主正是从面板内打开抽屉的，
  关面板会连带关掉抽屉。只在「已在层内时模态出现」这条路径上让位：面板若在模态开着时被打开（宿主自有
  判断），照旧进层，不因这条让位变成「点了没反应」。回层并非「原样」—— 隐藏用的是 `display: none`，
  翻回 `flex` 的那一帧没有任何过渡可依附，故回层时补一次淡入（见落点四）。
- 落点三（隐藏必须显式）：`assets/main.scss` 补
  `[popover][data-floating-panel][data-floating-yielded] { display: none }`。**只出层是不够的**：UA 那条
  `[popover]:not(:popover-open) { display: none }` 在 **UA 来源**，会被面板类名里作者来源的 `.flex`
  工具类整条盖掉（来源优先级先于特异性），面板出层后照旧 `display: flex`，只是掉进普通层叠、被模态的
  遮罩与面板压住 —— 观感正是用户报的「抽屉的 header 盖过 Panel」。
- 落点四（回层必须淡入，用户随后报「抽屉关闭时 panel 会从消失瞬间显示」）：`assets/main.scss` 补
  `@keyframes floating-panel-restore-in` + `.floating-panel-yield-restore`，`BaseFloatingPanel` 在
  恢复分支挂类、动画跑完摘类。用入场动画而不是「先写 opacity: 0、隔一帧再翻 display」那套两帧技巧：
  动画随元素重新进入渲染态自动起跑，不额外空出一帧。挂类**排在摘属性之前** —— 两者落在同一个 tick，
  样式结算时动画与 display 同时生效、起跑点就是 `from { opacity: 0 }`；反过来先摘属性，中间只要有一次
  样式结算（`showInTopLayer` 里的 `showPopover()` 就会触发一次），那一帧面板是不透明的，会先闪一下。
  类在两条**都不会触发 animationend** 的打断路径上各自兜底摘一次（淡入途中被关闭、淡入途中模态又出现
  —— 后者动画被 `display: none` 取消、只派发 animationcancel），否则类残留会让下次恢复的 `add` 变成
  空操作，面板又会在抽屉消失的那一帧跳出来。
- 验证一（新增单测）：`tests/ui/floatingPanelModalYield.test.ts`（7 条）—— 打开即让位 / 离场结束才回层、
  两个模态叠加时先离场者不提前放行、让位态下关闭面板不被唤回且让位标记清掉、回层时挂上淡入类且面板关闭
  时兜底摘掉、淡入途中再次让位后下一次恢复能重新起跑、模态开着时打开照旧进层、计数不泄漏。反向证伪：
  临时关掉让位 → 5 条里 4 条转红（余下那条正是「照旧进层」）；临时关掉淡入 → 新增的那条转红；临时去掉
  让位分支的类清理 → 「再次让位」那条转红。后一次证伪还顺带暴露了用例辅助 `mountPanel` 的一处缺陷：
  它按 `querySelector` 取**第一个**面板节点，某例断言中途挂掉没走到 unmount 时，残留节点会被后面的用例
  当成自己的面板，一处真实失败连带把后面两例也判红、真正的失败点被埋掉；已改为取最新挂上的那一个。
- 验证二（机制探针，Chromium 真渲染）：top-layer 元素在命中测试上压过 z-index 2000 的模态；出层后命中
  落到抽屉；`showPopover` 对 `display:none` 的元素照常生效（回层不需要重新上屏）。
- 验证三（真机时间线，dev server + 通用探针：播种数据 → 点槽位开面板 → 面板里开抽屉 → Esc，逐帧采样）：
  抽屉在屏期间面板 `display:none`（让位生效）；关闭过程中遮罩不透明度 1 → 0、抽屉 header 左移
  801 → 1441 出屏，**没有任何一帧出现「面板可见 + 抽屉在屏」**，面板恰在抽屉离场结束那一帧回层。
- 验证四（机制探针，Chromium 真渲染；验的是「`display:none` 翻回渲染态的同一个 tick 里挂上的入场动画
  会不会真的起跑」这条假设，不起跑的话淡入等于白做）：同一元素走两轮「让位 → 恢复」，一轮挂淡入类、
  一轮不挂作对照。让位后 `display: none`；挂类那轮逐帧 opacity `0.00 → 0.29 → 0.47 → 0.62 → 0.73 →
0.81 → 0.88 → 0.93`（0.18s 爬升的前 8 帧），对照那轮首帧即 `1.00` —— 爬升确由该动画引起。
  该轮探针用自定义 CSS（规则与 `main.scss` 逐字同源，只把时长 / 缓动令牌换成字面量），因为 dist 是旧
  产物、而全量 `pnpm build` 在本环境禁止代跑。
- 改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；
  全量关卡按禁令未代跑。

### 调整 · 滚动条气泡提到悬浮操作条之上（2026-09-30）

- 触发（用户提「滚动条的气泡层级应比 FloatingFAB 高」）：气泡是滚动期间的读数、贴着容器边缘出现，
  悬浮操作条（`--z-fab`）浮在容器角落；两者重叠时读数被操作条盖住。原层次把气泡排在操作条之下。
- 改法：`--z-scrollbar-bubble` 31 → 45（排在 `--z-fab` 40 之后、`--z-sidebar` 50 之前），
  `--z-scrollbar-track` / `--z-scrollbar-thumb`（29 / 30）不动 —— 轨道与拇指随容器内容走、属「被吸附头
  压住」的那一类，只有气泡反过来要压过操作条。引用侧无改动：三处 `z-index` 早已是 `var()`。
- 不变式同步：`tokens.scss` 注释由 `track < thumb < bubble < sticky < fab` 改为
  `track < thumb < sticky < fab < bubble`，并把「气泡为何在操作条之上」的理由写进注释；
  `useStickyHeads.ts` 的吸附头注释相应改为「高于容器内一切滚动内容（含滚动条 overlay 的**轨道与拇指**；
  气泡不在其列）」。
- 落点：`tokens.scss`（令牌值与注释）、`useStickyHeads.ts`（注释）、
  `tests/tokens/designTokens.test.ts`（层次不变式用例改为
  `expectAscending(['--z-scrollbar-track', '--z-scrollbar-thumb', '--z-sticky', '--z-fab', '--z-scrollbar-bubble'])`，
  「吸附头高于 `--z-float`」的断言保留）。
- 验证：`designTokens.test.ts` 9 条全过；`tokens.scss` 与 `useStickyHeads.ts` 无 eslint 覆盖项、
  该文件 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 调整 · 滚动气泡的侧向箭头改矮加宽：楔形恒宽于长、lg 档圆角收窄（2026-09-30）

- 触发（用户提「气泡的箭头优化一下，高度太少的情况下向右的箭头看起来特别小」，随后「太长了，
  然后加宽一点」）：v-scrollbar 的读数气泡是矮条形，侧向（朝右）的箭头两头都不对 —— 先是底宽被等比
  压成一个小疙瘩，放开凸出高度后又变成一根又细又长的刺。两次都不是参数没调好，而是同一处几何。
- 底宽的真实上限（写进 `arrowPanelPath.ts` 的注释）：侧向箭头的底宽 = 该边的**直边段** =
  `边高 − 2 × 圆角`。越过它，楔形底边就会啃进四角圆弧、让路径折返在角上挑刺，故只能按可用长度收缩
  —— 也就是说「箭头窄」的根因不在箭头，而在气泡自己的圆角把那条边吃掉了一大半。
- 落点一（加宽）：`--bubble-radius-lg` 由 `$radius-md`（0.625rem = 10px）改为与 md 同值的 `0.5rem`
  （8px）—— lg 气泡高 27.5px，圆角取 10px 时直边只剩 7.5px，收到 8px 后回到 11.5px（+53%）。
  `tokens.scss` 表头补一条「圆角刻意不从刻度上一档取」的理由，免得后来者照刻度把圆角加回去。
- 落点二（改矮）：`arrowPanelPath.ts` 新增 `ARROW_RISE_BASE_RATIO = 0.6` —— 凸出高度取「标称值」与
  「（收缩后的）底宽 × 0.6」中较小者，即楔形**恒宽于长**（顶角不小于约 79°）。常规面板上这条上界不
  生效（默认楔形的比值本就是 0.5），只有底宽被压窄的中小面板会收到它。
- 观感：lg 档箭头 7.5 × 7.5 → 11.5 × 6.9（顶角 53° → 79°，一根刺变成一枚宽箭头）；md / sm 档底宽不变、
  凸出高度各收一档（7.07 → 5.4、5.66 → 3.9）；常规面板上的箭头逐字不变，显式 `--arrow-width` /
  `--arrow-height` 里比值本来就不超过 0.6 的（如扁箭头）同样逐字不变 —— 更有比值更尖的声明会被这条
  上界收敛，这正是它存在的意义（`arrowPanel.ts` 的尺寸注释同步点明「两个值都只是名义值」）。
- 验证：`tests/platform/arrowPanelPath.test.ts` 与 `arrowPanel.test.ts` 共 54 条全过 —— 含新增一条
  「底宽被直边段压窄时凸出高度不跟着缩」，两侧都钉住（大于等比收缩值 `span/2`、小于标称值）；
  改动文件 `prettier --check` 0 问题；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 排列和弦的占位高度由分档估值改为实算，内容总高在分片挂载期间恒定（2026-09-30）

- 触发（用户先提「排列和弦的分片加载的占位高度能不能优化成真实高度」，改完一轮后提「那我往下滚动
  滚动条还是变化了啊, 说明可滚动高度在变」）：两轮分别是同一件事的两个半场 —— 占位高度**算得准**
  与占位高度**有人代表**，缺哪一半滚动条都会一路变。
  - 第一半：离屏行此前按「有卡 / 无卡」两档各取**视口内的最大实测行高**当占位，同一档里最高与最矮
    的行差多少、空档就偏多少；几百行的空档把这点差放大成几千像素。
  - 第二半（第一轮没碰到的）：**前缀之外那一段在 DOM 里根本没有代表**。内容总高只等于已挂载的那
    几行 + 一枚 32px 哨兵，所以每补一批行就长一截、滚动条拇指一路缩 —— 这与占位高度算得准不准无关，
    改占位算式在这一半上完全无效（用户看到的正是这个）。
- 口径：**行占位高度 = 行内最高那张指板图卡 + 行内除卡片之外的那一截 + 行间间隙**，三项都不依赖
  「这行渲染过没有」，故**从未挂进 DOM 的行**也算得出真实行高。
  - **卡高**走几何算式（新增 `score/editor/lineCardHeight.ts`），与画布实绘**同源**：品窗
    `resolveFretWindow(chord, trimEmptyEdgeFrets)`、弦枕判据 `nutIsDrawn`、弦数取和弦自身，高度取
    `canvasGeometryFor(boldNut).sizeOf(...)`（与 `useFretboardCanvasGeometry` 同一份算式、同一份
    缓存）。落在 `score` 侧而非 `fretboard` 侧 —— zone 规则只禁 `fretboard → score`，故算式必须
    建在 `score` 侧、由画布侧反向复用同一份几何工厂。
  - **那一截**由**实测**给出（新增 `lineRowChrome`，按有无卡分档）：它由槽壳 / 字形 / 行框三类样式
    共同决定（字符行还随 `--score-font-scale` 变），照着模板在 JS 里再写一遍等于把版式口径抄第二份、
    改一处样式就静默失准。量法 = 行高 − 本行自己那张卡的高度，各档取**最小值** —— 行在拖拽落点
    （`.is-drop-line` 的 `min-h-[108px]`）、行高过渡（`row.style.height` 内钉高）等瞬时态下只会被
    撑高，取 max 会把那一截记大，取 min 天然把它们筛掉。
  - **行间间隙**同样实测（新增 `lineRowGap`）：容器是 `gap-xs` / `max-md:gap-3xs` 两档，写死一档等于
    在另一档上系统性偏小；量法取相邻两行的间距（`rect.top − 上一行 rect.bottom`，与行高同一套
    `toContainerPx` 换算），取各对里的最小值。算在本行头上而不是单列一项：行在布局里就是「行高 +
    它下面那条间隙」，挂进来一行长出来的正好是这一整份。
- 三处占位出口同源（这是「总高恒定」的全部机制）：`linePlaceholderHeight` 是唯一来源，三处都按它
  逐行累加 ——
  1. **空档的 `margin-top`**（`gapMarginOf`，前缀 / 视口窗口 / 尾部三段模型用）；
  2. **元素级占位**（`.line-row` 的 `contain-intrinsic-size` 高轴）：宿主逐行下发
     `--score-line-height-row`，两档常量（`--score-line-height-*`）降级为量到之前的兜底 —— 分档常量
     对同一档里高矮不一的行一律取同一个值，而**从未被渲染过**的行吃的正是这个数，只有逐行下发才与
     另两处对得上；
  3. **未挂载段的撑高元素**（宿主在哨兵之后新增一枚 `height = tailPlaceholderHeight` 的空 div）：
     挂进来一行、它就矮一行，于是**内容总高在分片挂载期间恒定**；高度为 0 时自然不渲染（它代表的
     是「最后一段已挂载行之后」那一段，见下方第二处踩坑）。
     账目核对：设行高 h、间隙 g、已挂载 R 行，总高 = Σ_{i<R}h + g(R+1) + 32(哨兵) + Σ_{i≥R}(h+g)，
     R 增加时前后两项抵消、总高不变；整份挂完时哨兵与撑高元素一起消失，总高一次性少 44px（`2g + 32`，
     与改造前哨兵单独消失时的量级相同）。
- 快拖滚动条那条路也要跟着改（`expandAtViewport`）：没有空档时**先按视口位置补一次**（`expandGap`），
  再走原来的「剩余可滚距离不足即扩容」。有了撑高元素，「剩余可滚距离」在没滚到真实底部之前一直很大，
  快拖停稳后视口正落在撑高元素里时那条判据命中不了，只有按视口位置补才补得上；视口还在已挂载段里时
  `expandGap` 自己会判出「要补的那一段在上方之外」并原样返回，不产生额外动作。
- ⚠️ **踩坑与修正（用户随后报「滚动很卡」）**：上一条最初是把 `expandGap` 直接加进滚动帧的
  （`handleScroll` → `expandAtViewport` → `expandGap`），结果一路掉帧。原因是那条路要遍历全部行，
  而且**每帧都会按视口位置重算渲染窗口、挂进新行**（视口每前进一点，窗口下沿就前进一点）——
  等于把「挂载」从「哨兵按距离分批触发」摊成「每帧一次长任务」。现按**形态**把两条判据拆开：
  滚动帧走 `expandOnScrollFrame`，按视口位置补那条重路子只留给两个**一次性**时机 —— 滚动停稳
  （`scheduleExpandOnScrollSettle`）与手势缩放沉降收口。正常下滚的挂载仍由扩容哨兵按距离分批触发
  （与改造前同一节奏），快拖停稳后落进未挂载段里的视口照旧补得上。
- ⚠️ **第二处踩坑与修正（用户随后报「拖动到底部, 然后慢慢往上滚动, 中间的歌词没有被加载出来」）**：
  上一条按「一次性 / 滚动帧」拆分时，把**空档形态**那条每帧按位置补也一并收掉了 —— 而空档里没有
  任何 DOM，视口滚进去就是一片空白，那条恰恰必须每帧跑（改成「停稳再补」就是慢速滚动一路看着空白）。
  现改为按**形态**分档：有空档时每帧照旧按位置补（恢复空档模型本来的行为，并已把这条理由写进
  `expandOnScrollFrame` 的注释，免得再被当成「多余的重活」收掉）；没有空档时才只走廉价判据。
- 同一轮补上三段模型的一个缺口：**「视口窗口之后那一段」原先没人代表**。空档的两处 margin 只挂在
  窗口首行与尾部首行上（见 `gapMarginOf`），而尾部窗口只有「滚动到底部」那条路才立 —— 拖滚动条进
  空档时窗口下方是空的，窗口每跟着视口挪一格，末沿之后那一段就没人代表，内容总高当场短一截、
  滚动位置被夹回去，于是「拖到底部再慢慢往上滚」时中间那一段永远不出现。修法：撑高元素代表的
  那一段从「前缀之后」改成**最后一段已挂载行之后**（新增 `lastRenderedEnd`：尾部窗口在时即末尾，
  否则取视口窗口 / 前缀的末沿），两种窗口形态下都成立；它随之不再按 `hasGap` 让位，改为「高度为 0
  时自然不渲染」—— 视口窗口自己吃到末尾时高度为 0，不重复计账。
- 同源收口（无 breaking，纯内部）：`ChordSlot.vue` 的 `cardScale` 与宿主 `ScoreInteractiveArea.vue`
  的 `cardScale` 都改从 `lineCardHeight.ts` 的 `resolveScoreCardScale` 取 —— 原先
  `BASE_FRETBOARD_SCALE = 1.4` 与内联算式只存在于 `ChordSlot`，宿主那侧无从复用，占位与实绘各写一遍
  缩放口径就必然分叉。缩放口径自此只此一处。
- 接线：`useLineChordSignatures` 新增入参 `getCardHeightPx` 与派生量 `lineCardHeight`（按 chordId
  缓存后取本行最高卡 —— 几何工厂自带的 LRU 只容 8 条，逐槽调它会在一首和弦种类多的乐谱上来回淘汰）；
  `useScoreViewportRender` 的入参 `lineHasChord` → `lineCardHeight`，并新增导出
  `linePlaceholderHeight` / `tailPlaceholderHeight`。卡高算式由宿主注入而不塞进
  `useLineChordSignatures`：`effectiveFretboardScale` 只有 `ChordSlot` 与 `ScoreInteractiveArea` 读，
  推导必须落在「与画布读同一份设置」的组件层。
- 采样侧两处让路（`measureLineRowHeights`）：正在跑行高过渡的行（`row.style.height`）不进 chrome
  采样 —— 那一刻量到的是插值中间值，而它的 `is-chord-row` 早已翻转；含 `.is-drop-line` 子槽的行整行
  跳过 —— 该状态由 CSS 表达、行元素本身没有这个类。行 id 从行内的 `[data-line-index]` 现读（该属性
  是拖拽系统与行几何共用的寻址契约，不为省一次查询再往 `.line-row` 上复制一份）。间隙采样另有一条
  让路：只在没有空档时量，否则承载行的 `margin-top` 会混进这个差值里。
- 冻结口径不变：`lineRowChrome` / `lineRowGap` 与 `lineRowHeights` 同受「空档存在期间冻结」
  （`hasGap`）约束 —— 它们进的都是逐行累加的整段高度，量一次改一次等于一边滚一边把落底目标挪走。
  `lineRowHeights` 降级为只服务 `contain-intrinsic-size` 的兜底 + 实算还差条件时的兜底；
  `linePlaceholderHeight` 保留两级兜底：那一截还没量到 → 退回分档实测最大值 → 再退回
  `GAP_LINE_FALLBACK_PX`（120px，与 `.line-row` 的 CSS 兜底同值）。取档一律按**有没有卡**判，
  与实测取档同源。
- 落点：新增 `score/editor/lineCardHeight.ts`；改 `composables/useLineChordSignatures.ts`、
  `composables/useScoreViewportRender.ts`、`components/ScoreInteractiveArea.vue`
  （行内联 `--score-line-height-row` + 哨兵后的撑高元素 + 两条 `contain-intrinsic-size` 改吃行级变量）、
  `components/slot/ChordSlot.vue`；新增 `tests/domain/scoreLineCardHeight.test.ts`。
- 验证：6 个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `pnpm vitest run tests/domain/scoreLineCardHeight.test.ts` 5/5 通过 —— 断言卡高算式与**画布侧推导**
  （`useFretboardCanvasGeometry(...).cssHeight`）**逐像素一致**，覆盖四个场景（零品窗口画弦枕 / 偏移
  品窗不画弦枕 / 开启收紧 / 倍率 2.8），另有一条「收紧只会更矮」的单调断言，**不写死像素字面量**；
  定点类型探针（`.temp/score-typecheck.mjs`，4 个根文件含测试）0 条诊断；
  **`.vue` 模板层（`ScoreInteractiveArea` / `ChordSlot`）的 props 类型校验属 `vue-tsc` 全量、未验证**；
  真机数值（`lineRowChrome` / `lineRowGap` 是否量到、滚动全程 `scrollHeight` 是否恒定、滚动帧耗时、
  「拖到底部再往上滚」是否逐段出内容）未实测；全量关卡按禁令未代跑。

### 修复 · 聚焦环不再穿透右键菜单（2026-09-30）

- 现象（用户提「和弦的聚焦环, 在菜单打开后, 右键另一个和弦卡片, 菜单平移过去, 但是聚焦环会穿透这个
  菜单, 乐谱也同理」）：右键第一张卡片时环正常（在菜单之下），再右键另一张卡片时环压在菜单之上。
- 根因：**环每次 `show()` 都重进 top-layer 把自己抬到最上**（`focusRingOverlay` 的「层级策略」，为的是
  「后打开的浮层排在环之上、把它盖住」这一条）；而右键换锚点走的是 `BaseMenu.openMenuAt` 的**已打开**
  分支 —— 只改坐标 + 对宿主做一次 FLIP 位移动画，**不重进顶层**。于是第二次右键的焦点变化把环抬到菜单
  之上，菜单却停在原层次，环就画在菜单上了。首次右键没有这个问题：那一次菜单是「后进层」的一方。
- 修法：给 BasePopover 的面板（`.popover-panel`）打 `data-ring-occluder`，把「顶层浮层的面板」纳入环的
  遮挡物擦除 —— 与 FAB / 浮动胶囊 / 自绘滚动条拇指同一套动作（`destination-out` 逐块清零，见
  `focusRingOverlay` 的「遮挡物策略」），「浮层在环之上」这个次序在视觉上重新成立。
  - 标在**面板**而不是 `[data-floating-layer]` 宿主上：宿主是纯定位壳，盒子可能比看得见的面板大
    （宽度由 size 中间件按触发区给出，箭头探针与滚动条层也挂在它下面），照宿主盒子擦会在没有东西盖住的
    地方把环切掉一角 —— 正是该模块反复记过的那类观感问题。
  - 目标在浮层内时不受影响：那时宿主是遮挡物扫描的**层边界**（`resolveLayerBoundary`），扫描上到它即停、
    只扫同层兄弟，而面板是目标的**祖先** —— 天然排除。这也是「面板可以无条件声明为遮挡物」的全部依据，
    不需要在收集侧加任何「目标在不在我里面」的判断。
  - 覆盖面比报的那条路径宽：一切走 BasePopover 的浮层（菜单 / 下拉 / 选择器 / 抽屉式面板）都算，
    例如焦点从浮层内回到内容层、浮层仍开着时，环同样不会穿过它。（`vTooltip` 是独立的单例浮层，
    不在此列。）
- 落点：`BasePopover.vue`（面板加标记 + 理由注释）、`focusRingProbe.ts`（`RING_OCCLUDER_ATTR` 的口径由
  「内容层的覆盖元件」扩为两类）、`focusRingOverlay.ts`（「层级策略」补上「先开的浮层由擦除补回次序」，
  「遮挡物策略」补上第二类遮挡物）。
- 验证：三个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。**真机未实测**：擦除判据依赖真实布局（遮挡物按几何相交逐帧重来），
  jsdom 量不到盒子、本仓这一层也没有单测，需在浏览器里复现「右键 → 右键另一张卡」确认。

### 调整 · 拖拽影像的「抬起放大」改为过渡浮现（2026-09-30）

- 现象（用户提「拖拽时鼠标处复制出的节点变大太生硬了, 加过渡」）：`useSortableList` 的自建拖拽影像
  （`.drag-preview`，被拖元素的整块克隆）在越阈值那一刻**首帧就把 `PREVIEW_SCALE`（1.04）写进 transform**，
  而同一处的阴影与不透明度是 160ms 渐入的（`drag-preview-in`）—— 同一次「浮起」的两个分量，一个瞬跳、
  一个渐变。
- 修法：起拖时补一条 WAAPI 过渡，把放大从 1 爬到 1.04，时长与曲线取 `.drag-preview` 那条 animation 的
  **同一对值**（160ms + `$bezier-standard`）。
  - 只能走 WAAPI 且 `composite: 'add'`：CSS transition 用不了 —— `.drag-preview` 的 transition 恒为
    `none`（位置由每帧直接写，任何过渡都会让影像滞后于指针）；关键帧也不能用默认的 `replace` ——
    那会在动画期间整条盖掉内联 transform，影像这 160ms 不跟手、动画一结束再跳回指针处。`add` 是矩阵
    后乘、与内联那份复合，于是位置照旧逐帧跟手，只有缩放这一维在爬升（与 BaseMenu 换锚点位移同一条路）。
  - 补的倍率因此是**相对值**（`1/PREVIEW_SCALE` → 1）：内联那份已经带着最终倍数，两者相乘才是 1 → 1.04。
  - 时长与曲线落在 `constants.ts`（`PREVIEW_ENTER_DURATION` / `PREVIEW_ENTER_EASING`）并与 CSS 那条
    animation 互指；`prefers-reduced-motion` 下不补 —— 与同处的 `drag-preview-in` 被全局规则压掉同一口径。
- 两处如实记下、刻意不处理的边界：① 抓取点补偿仍按**最终倍数**算，浮现期实际倍数更小，故抓取点在
  160ms 内有不到边长 2% 的滑移、随浮现收敛到精确值；② 起拖后不足一个浮现时长就松手时，复位动画的首帧
  仍取最终倍数，会有不到 4% 的跳变 —— 该窗口只有 160ms，而这一下的位移远大于它。
- 落点：`useSortableList/preview.ts`（`activatePreview` 补过渡、抓取点补偿处补边界说明）、
  `useSortableList/constants.ts`（两个新常量）、`main.scss`（注释同步：缩放由 JS 补过渡，
  以及那条 animation 是浮现时长与曲线的唯一来源）。
- 验证：三个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  `pnpm vitest run tests/ui/composables/useSortableListClickSuppression.test.ts
tests/ui/composables/useSortableListScrollOffsets.test.ts` 11/11 通过 —— 前者的用例会驱动到
  `activatePreview`，jsdom 下 `Element.prototype.animate` 已由用例桩掉，新调用不会抛；该文件明确写着
  「动画本身不是断言对象」，故不为这条补断言；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。
  **真机未实测**：过渡观感需在浏览器里拖一次确认。

### 修复 · 选中卡片叠出双层描边（乐谱列表 / 和弦卡片）（2026-10-01）

- 现象（用户提「乐谱列表点击已选中的有两个外边框, 和弦卡片也是」）：选中态在 `border` 之外又叠了一圈
  `shadow-[0_0_0_1px_…]` 的**纯扩散**发丝边，而扩散量为 0 使它紧贴边框外沿 —— 两条 1px 线之间没有任何
  间隙，观感就是「选中的卡片有两个外边框」。全仓只有 `SongCard` / `ChordCard` 这两处用了这种写法，
  与用户点名的两个位置一一对应。
- 修法：删掉这两圈发丝边，选中态**只留一条描边**；悬停的加强改为只提边框色与底色。
  - `SongCard`：`hover:shadow-[0_0_0_1px_var(--color-primary)]`（全不透明，两处里最刺眼的一处）。
  - `ChordCard`：选中态**常驻**的 `shadow-[0_0_0_1px_rgba(…,0.25)]` 与悬停的 `…,0.4` 两处 ——
    它不悬停时也叠着，故这一处的双层比乐谱列表更容易撞见。
  - 选中语义由边框色（`border-tint-primary-*`）+ 淡底色（`bg-tint-primary-9x`）+ 标题 / 和弦名字色
    共同承担，不缺这一圈；`ChordCard` 的 `active:` 档只回退边框色与底色，不受影响。
- 落点：`score/library/components/SongCard.vue`（`stateClasses` 上方注释记因）、
  `chord/library/components/ChordCard.vue`（模板内注释记因，与该文件既有注释同处根元素内部）。
- 验证：两个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。**真机未实测**：需在浏览器里点一次选中卡片确认只剩一条描边。

### 修复 · 窄屏单页档第 2 页起吸附到偏右半个内边距（2026-10-01）

- 现象（用户提「窄屏上单页乐谱没有居中」）：窄屏（< md）单页档下，第 1 页看着居中，**第 2 页起每页
  都偏右**。两张真机截图正好给出对照：第 1 页纸面左 36 / 右 31（居中），第 2 页左 42 / 右 25（偏右 6px）。
- 根因：容器只设了 `scroll-pl-lg max-md:scroll-pl-sm`，`scroll-padding-right` 恒为 0 —— 而吸附容器
  （snapport）= 滚动口内缩 scroll-padding 后的区域，**它的中心才是 snap-center 的判据**。只缩左侧时
  snapport 中心比视口中心偏右 `p/2`（窄屏 `p-sm` = 0.5rem = 11.125px，故偏右 5.5625px）。
  第 1 页之所以正常：它的吸附点落在负方向、被钳到 `scrollLeft = 0`，于是靠「幻灯片盒正好铺满内容盒」
  自然居中 —— 也就是说这不是「第 1 页对、第 2 页错」，而是**只有第 1 页恰好被钳回正确位置**。
- 修法：给容器补上**与左侧同值**的右侧内缩 —— `scroll-pr-lg max-md:scroll-pr-sm`，两侧成对出现。
  宽屏页流档取 `snap-start`，只用得到左内缩，补右侧不改它的落点（落点 = 页首对齐 snapport 左沿）。
- 验证（探针复刻单页档 DOM，`750x1148` 与 `390x844` 两档，逐页 `scrollIntoView` 后量「页中心 −
  视口中心」）：**现状** P1 `0` / P2 `+5.75` / P3 `+5.5`；**补上 scroll-padding-right 后**
  P1 `0` / P2 `-0.25` / P3 `-0.5`。两档读数一致 —— 该偏移只由 snapport 的左右不对称决定，与页宽无关。
- 落点：`score/preview/components/ScorePreviewPane.vue`（容器类；容器上方与「吸附单元」两处注释各补
  一条成因，后者防止后人以为 `scroll-pl` 是唯一需要的那个而把右侧删掉）。
- 验证边界：该文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。**真机未实测**。
- 一处如实记下：`scroll-pr-*` 是本仓首次使用的工具类，`dist/` 旧产物里没有它（探针量的是旧产物，
  故类名生效性**没有**用产物验证过）。类名本身按 Tailwind v4.3.3 的前缀映射确认
  （`["scroll-pr","scroll-padding-right"]`，取 `--scroll-padding` / `--spacing` 标度，
  与既有的 `scroll-pl-sm/lg` 同源），机制侧则由上面那组「内联 scroll-padding-right」的对照读数证实。
