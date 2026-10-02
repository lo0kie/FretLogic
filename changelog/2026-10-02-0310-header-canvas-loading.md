### 修复 · 指板和弦名输入框的 `v-model:editing` 是单向假双向（2026-10-02）

- 现象：`Fretboard` 用 `v-model:editing="isInputFocused"` 接 `BaseEditableText` 的编辑态，但那条通道
  只有「子 → 父」一半 —— 组件只 `emit('update:editing')`，**没有声明 `editing` prop**，父级写下去的
  值进不了组件内的编辑态。
- 根因：`editing` 不是 prop，于是落进 attrs，再经 `inheritAttrs: false` + `v-bind="forwardAttrs"`
  变成 contenteditable 宿主上一个无意义的 DOM 属性（`editing="false"`）；父级的任何重置（切对象、
  回收焦点）只改自己那份 ref，组件内的编辑态照旧。
- 修法：改用 `defineModel<boolean>('editing', { default: false })` 一行换掉整套手写（编译器会生成
  `editing` / `editingModifiers` prop 与 `update:editing` emit）；并补一条 watch：外部把 editing
  置回 false 时**真的**收掉 DOM 焦点 —— 否则「模型已退出编辑态、宿主仍聚焦」会让 modelValue 的同步
  watch 立刻开始覆盖用户正在输入的内容。
- 附注：当前调用点尚未用到重置能力，故本次没有可感知的行为变化，改的是通道本身与宿主上那个脏属性。
- 验证：改动文件 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；另用 compiler-sfc
  探针编译该 SFC，核对生成物确实含 `"editing": { type: Boolean, ...{ default: false } }` 与
  `["update:modelValue", "update:editing"]`；**类型检查未验证**（按禁令不代跑）；**真机未实测** ——
  和弦名的聚焦 / 失焦 / 切歌路径需在页面上复核。

### 修复 · IndexedDB 连接被异常终止后缓存不失效（2026-10-02）

- 现象：连接失效后本 tab 的持久化会被永久毒化 —— 缓存里那条已 resolve 的 Promise 继续把已关闭的
  连接交给所有调用方，此后每次读写都在它上面抛 InvalidStateError 且永不自愈。
- 根因：只接了 `blocking`（versionchange，即「本页旧连接挡住其它标签页升级」），没接 `terminated`。
  idb 把 `terminated` 挂在连接的 `close` 事件上、与 `db.close()` 无关，覆盖的是**异常终止**那条路
  （存储回收、浏览器 / 扩展强制关闭）—— 同一个缺陷的漏网分支。
- 修法：把「关连接 + 清 activeDb + 清 dbPromise」抽成 `invalidateConnection`，`blocking` 与
  `terminated` 共用同一份。
- 附注：另一标签页 `deleteDB` 走的**不是**这条路 —— 那是 versionchange，已由 blocking 覆盖。
- 验证：`tests/platform/idbSchemaHeal.test.ts` 3/3；改动文件 `pnpm eslint --max-warnings 0` 0 问题、
  `prettier --check` 通过；**该回调本身无单测** —— fake-indexeddb 造不出「异常终止」，且模块内的连接
  实例不对外暴露、触发不了 `close` 事件；**类型检查未验证**（按禁令不代跑）。

### 修复 · 音频设置的读取是裸断言，类型写错的值直通音频引擎（2026-10-02）

- 现象：`audioPlaybackSerializer.read` 是 `JSON.parse(raw) as AudioPlaybackSettings` —— 全仓唯一一处
  把持久化数据直接当业务类型用的读取点。字段类型写错（如 `strumDelayMs: "fast"`）会一路流到音频引擎，
  变成 `setTimeout(NaN)`、增益 NaN 这类静默失效。
- 附注（对原判据的两处更正）：截断的 JSON 会让 `JSON.parse` 抛错，而 `useStorage` 的 update 有
  try/catch，落到 onError 后保留默认值 —— 不是「静默产出 NaN」；缺失字段也已被 `mergeDefaults` 与
  initial 合并兜住。真正漏的只有**类型不对**的值。
- 修法：read 改为逐字段收口（数值走 `isFiniteNumber`，布尔走 `isBoolean`，回落目标与 store 的 initial
  共用同一份工厂）。两个字面量联合（timbre / strumDirection）**不做值域校验** —— 它们的取值表在设置
  UI 与音频引擎各有一份，在这里抄第三份会漂移，过严的校验反而会把新增音色的合法取值静默重置回默认；
  引擎侧对认不得的 id 已有兜底（`applyTimbre`）。默认值由内联对象改为工厂，避免 store 里那个会被就地
  改写的 ref 与「默认值」共享引用。
- 验证：改动文件 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；**该序列化器无单测**
  —— 它是模块私有的纯函数，且本仓没有「真 store + 播种 kv」的测试范式（现有 store 测试都是假 store），
  未为它新开导出或测试脚手架；**类型检查未验证**（按禁令不代跑）。

### 修复 · 顶栏构建指示的滑入滑出没有动画（2026-10-02）

- 现象：指示条展开/收起时按钮让位有过渡，但指示本体是瞬跳出现、瞬跳消失（motion-v 试验期掩盖了它）。
- 根因：内层的过渡列表写的是 `transition-[transform,opacity]`，而 Tailwind v4 的 `translate-x-*`
  工具类落在**独立的 CSS `translate` 属性**上（构建产物可证：`.translate-x-0` 生成的是
  `translate: var(--tw-translate-x) var(--tw-translate-y)`）—— 过渡列表里没有 `translate`，
  位移变化就没有可插值的过渡，只能瞬跳；opacity 那一项因为在列表里，淡入淡出正常。
- 修法：过渡列表改为 `transition-[translate,opacity]`，与工具类实际写入的属性对齐。
- 验证：`pnpm eslint --max-warnings 0` 与 prettier 对改动文件 0 问题；**真机未实测** —— 滑入滑出
  手感需在页面上复核。

### 修复 · 顶栏谱面构建指示在整谱出图前就消失（2026-10-02）

- 现象：切回「预览」标签后，顶栏那枚构建指示在整谱还没画完时就滑走了（骨架格也跟着收）。
- 根因：切回预览时**同一个内容键会起两轮** —— `onActivated` 的唤醒守卫一轮，`activeContentKey` 的防抖
  watcher 晚约 150ms 又一轮。`generate` 里「同键已有在途轮次即复用」那一判原本排在**缓存采纳之后**：
  后到的那一轮先走采纳分支，`adoptCachedRender` 把共享的 `isRendering` / `isPreviewRendering` 一并清掉
  （那是「本轮收工」的语义），随后才在复用分支早退出去 —— 在途那一轮剩下的页就再没人替它举着标志。
  它只在「后到那一轮跑到条目里已落下一页」之后才命中 `resumable`，故表现为偶发。
- 修法：把复用判据提到缓存采纳**之前**（`ScorePreviewPane` 的 `generate`）：同键在途就什么都不动，
  既不采纳也不改标志，交回在途那一轮自己的 `finally` 收尾。
- 验证：改动文件 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；**类型检查未验证**
  （本项目 typecheck 无文件级形态，按禁令不代跑）；该路径无单测（组件级），**真机未实测** —— 需在页面上
  复核「切回预览时指示一直挂到整谱画完」。

### 修复 · ActionButton 的 loading 图标不透传 icon-stroke（2026-10-02）

- 现象：按钮上配的 `icon-stroke`（如顶栏构建指示的 `:icon-stroke="40"`）在 loading 态完全不起作用。
- 根因：`ActionButton` 的 loading 态渲染的是**另一枚** `BaseIcon`（进/出 loading 瞬切、刻意不接形变），
  它只绑了 `name` 与尺寸档类名，漏了 `:icon-stroke`；而 loading 态恰好不渲染其余三处图标，于是整枚
  按钮的描边档静默失效。
- 修法：给该分支补上 `:icon-stroke`（组件默认 `'regular'` → 2.5px），与另外三处图标同一口径。
- 附注：`icon-stroke` 是 SVG 用户单位（`viewBox 0 0 24 24`），预设档 thin 2.2 / regular 2.5 / bold 3；
  裸数值 40 相当于直径级的线宽，会糊成一个实心圆 —— 要更粗的弧用 `bold` 或 3~4 一档即可。
- 验证：`tests/ui/button/actionButtonHoldable.test.ts` 7/7；改动文件 `pnpm eslint --max-warnings 0`
  0 问题、`prettier --check` 通过；**类型检查未验证**（按禁令不代跑）；**真机未实测** —— 描边观感需在
  页面上复核。

### 新增 · 顶栏谱面构建指示条（2026-10-02）

- 需求：乐谱页的 canvas 出图期间，顶栏给一个**纯视觉**的 loading —— 不带任何文字或交互提示，
  入场自右端滑入、离场滑回右端。
- 实现：
  - 新增 `domains/score/editor/arrangeCanvasBusy`（模块级单例，与 `scorePreviewCache` 导出的
    `isPreviewRendering` 并列）：排列区在**重排口径变化或换歌**时登记一次。连续登记会把收口时刻
    顺延，故一段连续构建只对应一次完整显示、不会中途闪断。构建本身是同步的（重排与逐行重绘都在
    Vue 的 patch 里跑完），收口因此走「两帧 + 最短可见时长」—— 少了最短时长，滑入动画会被当场
    打断，观感就是闪一下。
  - 登记点刻意**不是**每行的绘制：行画布由 `v-memo` 逐行重绘，逐行上报会让指示条在一段构建里
    反复重启；也刻意不含 `visibleLines` —— 它随滚动分片挂载而变，纳入就等于「一滚动就报」。
  - 顶栏：`useHeaderDocActions` 新增 `isScoreCanvasBuilding`（预览渲染中 ∨ 排列区构建中）。
    与既有的 `isPreviewBusy` 分工不同 —— 后者是**动作禁用判据**（只在预览 tab 参与判断），
    本条只驱动视觉指示，故两个 tab 的构建都算。
  - `TopHeader` 在乐谱页动作区**最左侧**加一枚指示，**与其它图标钮同一形态** —— 它就是 ActionButton
    的 `icon-only` + `loading` 档，不是另画一个方形；常驻、不随极窄档折叠（它是状态，不是动作）。
    两层各管一件事：外层 `max-width`（`0 ↔ 4rem`）管**让位**（展开时右侧按钮平滑左移，不是瞬跳）；
    内层 `translateX(100%) ↔ 0` 管**方向**（自右侧滑入、向右滑出）。宽度不用 `grid-template-columns`
    的 `fr` 过渡 —— 子项带 `min-w-max` 时列的 min-content 会把列宽顶成按钮宽、`0fr` 压不到 0，
    两端没有可插值的差，退化成瞬切。方向也不能交给「内容贴哪一侧 + 容器展开」去表达 ——
    容器在右组里左边缘固定，宽度增长只会把贴边内容整体往右推，观感正好相反。
    刻意不带 tooltip、不可点（`aria-hidden` + `pointer-events-none`）。
    没有对应的 Transition 规则：展开量由内容宽度决定，用 Transition 反而要硬编码宽度。
- 验证：新增 `tests/ui/arrangeCanvasBusy.test.ts` 2/2（假时钟：登记即置位、两帧 + 最短时长后
  收口；连续登记顺延，第一笔的计时不会提前关掉第二笔）；改动文件 `pnpm eslint` 0 问题、
  `prettier --check` 通过；**类型检查未验证**（本项目 typecheck 无文件级形态，按禁令不代跑）；
  全量关卡按禁令未代跑。**真机未实测** —— 指示的滑入滑出方向与按钮让位的手感需要在页面上复核。

### 调整 · ActionButton 接入宽度补间（2026-10-02）

- 现象：按钮宽度是硬跳的 —— 文案 / 图标 / 尺寸档一变，宽度当帧就跳到位。
- 修法：给 ActionButton 的根 `<button>` 接上既有的 `v-auto-width`（FLIP + WAAPI 补间）。
  `BaseBadge` / `BaseFloatingPill` / `BaseAnchorBubble` / `BasePopover` 早已在用，它是唯一没接的。
  两个前提不成立时不启用（与 `BaseBadge` 同一口径）：`width` 显式给了（定宽，本就不会变）、
  `block`（宽度由父容器决定，那是布局变化，补间只会与父级重排打架）。
  组件样式里的 `transition-property` 刻意不含 `width` —— 宽度补间只由指令驱动，两者叠加会互相顶掉。
- 验证：`tests/ui/button/actionButtonHoldable.test.ts` 7/7；改动文件 `pnpm eslint` 0 问题、
  `prettier --check` 通过；**类型检查未验证**（本项目 typecheck 无文件级形态，按禁令不代跑）；
  **真机未实测** —— 补间手感需在页面上复核。

### 调整 · 两条指令改名（2026-10-02）

- 动因：`v-action-card` 与 `v-grid-nav` 的名字与实际行为对不上 —— 前者指向业务概念「卡片」，而它做的是
  给**任意**元素注入按钮的键盘 / A11y 语义（徽标、槽位、卡片都在用）；后者只说「网格」，实际网格与列表
  同构（`cols: 1` 即列表档），机制是方向键按视觉几何就近移动焦点（含 Home / End）。
- 改法：`v-action-card` → `v-as-button`（`vActionCard` / `AsButtonBinding` / `AsButtonOptions` /
  `vAsButton.ts` 同步改名），`v-grid-nav` → `v-arrow-nav`（`vGridNav` / `ArrowNavBinding` /
  `ArrowNavOptions` / `ArrowNavOrientation` / `vArrowNav.ts` 同步改名）。模板调用点、`main.ts` 的注册、
  `vite-env.d.ts` 里 `GlobalDirectives` / `ComponentCustomDirectives` 三处声明、以及各处注释引用一并
  同步，共 20 个文件。
- 未动：其余 10 条指令（`v-tooltip` / `v-focus` / `v-scrollbar` / `v-marquee` / `v-edge-fade` /
  `v-chord-name` / `v-scroll-into-view` / `v-wheel-scroll` / `v-auto-width` / `v-auto-height`）名实相符，
  改名只会产生噪音；第三方 `v-wave` 由 v-wave 包提供，不在可改范围。
- 验证：改动文件 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；
  `tests/ui/composables/useResponsive.test.ts` 与 `tests/ui/floatingPanelModalYield.test.ts` 12/12；
  **类型检查未验证**（本项目 typecheck 无文件级形态，按禁令不代跑）；**真机未实测** —— 指令注册名只在
  模板编译期生效，需在页面上复核两处键盘交互（卡片 Enter / Space 激活、网格方向键导航）。

### 调整 · 动画类指令收拢到 `animation/` 子目录（2026-10-02）

- 动因：`platform/directives/` 平铺着 11 条指令，动画类的几条混在定位 / 语义 / 视觉类之间。
- 改法：新增 `platform/directives/animation/`，把 `vAutoHeight` / `vAutoWidth` / `vMarquee`
  （含 `vMarquee.scss`）移入。归入判据写进了门面注释：**核心职责是让某个量随时间变化**（补间、
  循环滚动）—— 定位 / 布局 / 语义 / 视觉遮罩类仍留在本级。它与 `vScrollbar/` 那种「一个指令一个目录」
  是两种不同的组织口径，注释里写明了区分。
- 同步面：门面导出、`main.ts` 的导入与注册、`vite-env.d.ts` 的类型导入、`tests/setup.ts` 与
  `tests/browser/collapseBehavior.test.ts` 的导入，共 5 个文件；指令名与对外契约零变化。
- 验证：改动文件 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；另用一次性探针机械
  核对了 `main.ts` / `vite-env.d.ts` / 门面 / 被移文件里的相对导入全部可解析（本仓 eslint 未开
  `import-x/no-unresolved`，只跑 lint 覆盖不到这一项）；**类型检查未验证**（按禁令不代跑）。

### 调整 · 指令注册收敛到各自的指令目录（2026-10-02）

- 动因：`main.ts` 里躺着整套 `app.directive(...)` 与一一对应的导入 —— 指令清单与注册名本属指令目录，
  却由装配层代持，增删一条指令要同时改两处。
- 改法：新增 `platform/directives/register.ts`（`registerPlatformDirectives`，11 条平台指令）与
  `domains/chord/directives/register.ts`（`registerChordDirectives`，`chord-name` 一条）；
  门面 `platform/directives/index.ts` 一并导出注册器（门面即装配入口）。`main.ts` 从
  「13 条导入 + 13 条注册」收敛为「2 条导入 + 2 次调用」。
- 为什么是两个注册器而不是一个：`v-chord-name` 在领域层，而 zone ① 明令 platform 不得反向依赖
  domains（含 type-only 导入），平台的注册器收不了它 —— 那条约束不接受任务级覆盖，故按层各留一个
  注册器，装配层按层各调一次。理由写在两个文件的头部注释里。
- 注册名仍逐条手写、不做 `vAutoWidth → auto-width` 的推导：注册名就是模板里实际敲的那个词，
  必须可 grep；推导出来的名字在源码里没有字面量，改名时全仓搜不到。
- 同步面：`main.ts`、`platform/directives/index.ts`、`domains/chord/index.ts`（域模块清单按该文件
  自己的约定同步）。
- 验证：12 条注册名与原 `main.ts` 逐条核对一致（11 + 1，含 `chord-name` 换到领域注册器）；改动文件
  `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；**类型检查未验证**（按禁令不代跑）。

### 新增 · v-shake 交互反馈指令（anime.js）（2026-10-02）

- 需求：给「操作不成立」一个落在**控件本身**的即时反馈。项目里悬停（CSS `hover:*`）、按压
  （`active:scale-*`）、点击涟漪（`v-wave`）、进出场（`transitions.scss`）各有其主，缺的正是被拒的
  那一下 —— 现在只有全局 toast，而 toast 离被拒的控件很远，用户还得回头找是哪一处。
- 为什么用 JS 动画库：抖动是**衰减振荡**（幅度 1 → 0.66 → 0.33 → 0，必然收在原位），且要求
  ① 可重复触发（连点被拒要重起、不排队）；② 可打断（中途换令牌先收干净再重起）；③ 收口与卸载
  必须精确还原宿主原有的内联 `transform`。这三件事用 CSS 类名切换得走「摘类 → 强制重排 → 挂类」，
  且没人替你还原；交给 anime.js 只需 `cancel` + 一次 `onComplete`。
- 契约（完整写在指令头部注释）：绑定值是**令牌** —— 值每变一次抖一次，值本身无意义（计数器 /
  时间戳 / 字符串都行），调用方在被拒的那一刻换掉令牌即可，不需要复位或守卫。**挂载不抖**；
  令牌非法（null / undefined / NaN / 空串）一律忽略**且不记录** —— 否则「合法 → 非法 → 回到同一个
  合法值」会白抖一次。减弱动效下不抖（抖动本身就是运动，没有静态替身），故调用点必须同时给出
  文字提示。
- 写入面：只动 `el.style.transform`，起抖前保存宿主原值、收口与卸载时还原。刻意写 `transform`
  而不是 `translate` —— 后者是 Tailwind `translate-x-*` / `hover:-translate-y-px` 用的属性，写它会
  顶掉宿主已有的位移；`transform` 与那些独立属性（`translate` / `scale` / `rotate`）是相加的，
  故宿主自带的 `active:scale-95` 不受影响。
- 接入：落在 `platform/directives/animation/`（归入判据同前：核心职责是让某个量随时间变化），
  门面导出、注册器登记为 `shake`、`vite-env.d.ts` 三处声明。
- 应用点：和弦编辑器抽屉的两处拒绝反馈 ——
  ① 页脚**保存按钮**：保存校验失败（同分组下已存在一模一样的和弦 / 格式不合法）与无分组时抖按钮；
  ② 弹窗内的**分组网格**：选了分组但保存失败时抖网格。
  两个令牌按「**被拒的那一刻谁在最上层**」分工，而不是按调用链分：弹窗打开期间页脚按钮被弹窗盖住，
  抖它没人看得见。toast 仍在，两者互补 —— 一个说「哪儿不对」，一个说「为什么不对」。
- 顺带改掉这条路径上两处会让人重走一遍的设计：
  - **未选分组时确认按钮直接禁用**（`:confirm-button-disabled`），不再靠「点下去 → 弹一条警告」——
    禁用本身就是答案，警告只是在用户已经做了无效操作之后补一句。
  - **保存失败时弹窗不再关闭**：失败原因多半是「该分组下已有同样的和弦」，保留弹窗与已选分组，
    换个分组原地重试即可；关掉再重开等于让「画指板 → 点保存 → 选分组」整条路重走一遍。
  - 随之删掉只服务于旧行为的 `uiStore` 依赖（该组件内已无其他用处）。
- 验证：新增 `tests/ui/directives/vShake.test.ts` 6/6（挂载不抖、令牌变化抖一次并还原宿主原值、
  同令牌重渲染不抖、非法令牌不记录、减弱动效不抖、卸载时还原宿主原值）；改动文件
  `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过。`ChordEditorDrawer` 属组件级改动、
  该组件无单测，接入本身未单测（指令行为已由上面 6 条覆盖）；**类型检查未验证**（按禁令不代跑）；
  **真机未实测** —— 抖动幅度与手感需在页面上复核。

### 调整 · 把「被拒」的反馈按两条口径铺到各处（2026-10-02）

判据两条：**能预判的用禁用，不能预判的才抖**；抖动只落在**被拒那一刻最上层**的那个控件上。

能预判 → 改成禁用（原先都是「点下去才弹一条提示」）：

- `PromptInputModal`（新建分组 / 重命名分组 / 新建乐谱三处共用）：内容为空时确认按钮禁用，Enter 也
  一并挡下 —— 空从来不是有效值，先灰掉比让用户点完再看提示直接。领域侧各自的空值校验保留
  （那是领域自己的契约，不只服务于这一个弹窗）。
- 移动和弦弹窗：未选目标分组时确认按钮禁用。
- 核对下来两处**本来就已禁用**、无需改动：「删除选中」（未勾选时已禁用）、移动弹窗的目标分组网格
  （`disable-active` 已挡下「目标与当前分组相同」那条）。

不可预判 → 接 `v-shake`（反馈落在刚点下去的控件上，toast 一条不删）：

- 顶栏两枚粘贴（和弦 / 乐谱）：剪贴板为空、内容损坏、格式不认识、贴错页面。为此
  `pasteChordFromClipboard` 改为返回「是否真的落地」（`pasteFromClipboard` 的 `T | null` 上浮）；
  乐谱侧本来就有 `PasteSongOutcome`，直接按 `status === 'none'` 判定。
- 指板的和弦名输入：名称不合法（要解析才知道）→ 抖那行刚编辑的字。
- 顶栏的「复制乐谱文字」与「复制整曲长图」：剪贴板写不进去、长图渲染 / 转码失败都算被拒 → 各抖自己
  那枚按钮。为此 `copySongText` 改为返回「是否真的复制成功」；长图侧 `handleScoreExport` 本来就返回
  成功文案或 `null`，容器按 `null` 判定（该按钮只在 `canExportScore` 为真时可点，此时拿到 `null`
  只可能是执行失败）。
- 导出面板的「复制 / 下载」：环境不支持、剪贴板权限、合成失败 → 各抖自己那枚按钮。
- 工作台保存操作栏的「更新保存 / 确认保存」：与和弦编辑器抽屉页脚那枚同一动作（`persistCurrentChord`
  返回 false 即被拒），只是另一处调用面 —— 组件里原本直接把动作当 click 处理器，返回值被丢掉，
  改为包一层 handler 递增令牌。同栏的「作为新和弦保存」不在此列：它只切到新建态并提示选分组，
  本身没有失败分支。
- 导入备份的「解密密码」：密码缺失 / 密码错误 → 抖密码输入框。为此 `handleImportConfirm` 改为返回
  结果码（`ImportConfirmOutcome`），状态壳与容器把它上浮到控件。

**刻意没接的**（理由）：

- 预览页的「复制本页 / 下载本页」：触发它的是右键菜单项，点下去菜单就收了，没有常驻控件可抖。
- 导入弹窗的「备份包未就绪」与通用导入失败：前者是状态错且会关弹窗，后者没有可指的控件 —— 只留 toast。
- 全局 / 网络类（同步冲突、云端 412）、非点击触发的（分享链接解析、启动期水合、持久化熔断）、
  「已部分接受」类（歌词超长截断、导入自动清洗 N 项）—— 都不属于「某个控件被拒」。

验证：改动文件 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/ui/directives/`
19/19（含 vShake 6 条）、`tests/app/backupModalActions.test.ts` 6/6、`tests/app/songImportKeyGuard.test.ts`
2/2；被改的组件在本仓没有组件级单测，这些接入未单测；**类型检查未验证**（按禁令不代跑）；
**真机未实测** —— 各处抖动的手感需在页面上复核。

### 新增 · v-draw（SVG 描边入场）与 v-stagger（子项交错入场）（2026-10-02）

- 应用点：
  - 工作台指板卡的 `.fretboard-string-line` 走 `v-draw`：六根弦依次描出（`gap` 40ms），`once` 给了
    名字，故一个会话只播一次；琴弦是竖线，读起来就是「从琴枕往下拉出来」。
  - 工作台变体面板的指法卡走 `v-stagger`：换和弦后新卡片依次浮入（弹簧收尾）。卡片上加了
    `.variant-card` 标记类 —— 只作动画钩子、不承载样式，与 `.chord-thumb-card` 同一种做法。
- 指板的音点滑移（`FretboardSvg`）**改由 anime.js 补间**（`domains/fretboard/directives/vNoteGlide.ts`，注册名 `note-glide`），替掉原先
  「CSS transition + 按弦序写 `transitionDelay`」的假交错。两条真实缺陷：① 固定弦序会让第 6 弦永远等
  90ms，哪怕它只挪一品，真正要读的「哪几根弦变了」反被序号噪声冲淡；② 连点两次和弦时第二次只是换
  目标值、延迟重新计一遍，没有「从当前帧重新起手」的能力。现在只动真的动了的弦、按位移量从大到小
  起手（`stagger({ from: order })`），新一次位移先取消在途补间、并以此刻的插值位置为起点。
  曲线与时长仍钉死原来那一对：`--bezier-sidebar` 从计算样式**现读**再编译（JS 侧不新增曲线字面量），
  时长取原来的 `$duration-base`（180ms），**不换弹簧** —— 过冲会先越过一格再退回，观感像按错品位。
  ⚠️ 位移**相同**的那一批（零品加粗 ↔ 偏移的整块骨架位移）**不参与错峰**：空弦标记位的反向抵消
  必须与容器逐帧同步（两边同长同曲线时恒等相消），错峰会让空弦音符跟着容器漂。指令落在指板域自己的指令目录（与 `v-chord-name` 同层），装配层按层多调一次
  `registerFretboardDirectives`；随之删掉只服务于旧
  机制的 `movingStringIndices` / `MOVING_UNLOCK_DELAY_MS` 与 `.is-moving` 过渡块。
- 图标形变**不做**：`iconMorphFlubber` 的逐帧 `d` 插值只能由 flubber 提供（anime 的 `morphTo` 要求
  两侧点数一致），把现有帧循环包进 timeline 不增加任何能力，属无收益重构。
- 契约（完整写在两个指令头部注释）：`v-draw` 的 `selector` / `gap` / `once`，减弱动效下不播过程；
  `v-stagger` 的 `selector` / `duration` / `gap` / `distance` / `spring`，触发不需要令牌（挂载播一次 +
  MutationObserver 接住新增子元素）。
- 两个都必须**收口清理**：`createDrawable` 会把量出的长度写死成 dash 属性，而指板线随品数 / 缩放改
  长度 —— 不清会被裁成半截（功能性回归，不是样式问题）；`v-stagger` 写的是内联 opacity / transform，
  留着会盖掉悬停 / 禁用态，并与 Tailwind 的 `translate-*` / `scale-*` 打架。
- 验证：新增 `tests/ui/directives/vDraw.test.ts` 3/3（减弱动效不写 dash、选择器查不到时不动作、
  `once` 同名只播一次）、`vStagger.test.ts` 4/4（挂载即播并清内联、新增子元素被接住、减弱动效不写、
  卸载清干净）；`tests/ui/directives/` 全量 26/26；改动文件 `pnpm eslint --max-warnings 0` 0 问题、
  `prettier --check` 通过。`v-draw` 的**真实描边过程未单测** —— 它要 `getTotalLength()`，jsdom 没实现，
  只能靠 browser 项目；**类型检查未验证**（按禁令不代跑）；**真机未实测**。

### 调整 · 排列和弦的逐行画布改为分片绘制（2026-10-02）

- 动因：排列区的行 canvas 原本在主线程**一帧内**画完（`draw()` 里同步调画笔），行内一切（行号、
  字符、指板图卡、两枚「+」、删除钮、各种高亮态）都要走一遍 2D 管线；一屏几十行几乎同时进来，
  那一帧就是一个几十毫秒的长任务 —— 拖动、滚动、悬停全排在它后面。
- 改法：新增 `editor/services/arrangeLinePaintQueue`（模块级单例队列），绘制改为**排成队列、每片
  6 条、片间用宏任务让出事件循环**：绘制摊到多帧，输入始终能插进来。队列先进先出（先挂载的行先
  出图，与滚动观感一致），不丢任务。
- ⚠️ **起跑必须排到宏任务里，不能同步跑第一片**：一屏几十行是在**同一轮里逐条排入**的（每行一个
  `onMounted` → 一次 `draw()`），若每次排入都同步把队列跑干净，「队列里永远只有一条」—— 分片退化
  成逐条同步执行，一帧内照样全画完，与不分片没有区别。首版就是这么写的，被本节的单测当场抓到
  （排入 20 条后同步阶段 `ran` 已是 20 条）。排到宏任务里起跑，同一轮的行才能先攒齐再按片摊开；
  代价是首片晚一个宏任务，那一瞬由「正在渲染」占位顶着（与离屏绘制时的时序一致）。
- ⚠️ **队列必须是模块级单例**：这套状态原本写在 `ScoreLineCanvas` 的 `<script setup>` 里，而那儿
  的顶层代码**按组件实例执行** —— 每行一条自带队列等于「一屏几十条单任务队列」，分片与取消一次
  都没生效（队列里永远只有一条）。键也由队列全局自增（组件侧的序号跨实例会撞）。
- **视窗优先（卸载即取消）**：父级只挂载视窗内的行（`v-for="visibleLines"`），卸载即离屏。快速
  拖动时整屏行被换掉，旧行的待画任务若照画，新入视窗的行就得排在它们后面白等 —— 故卸载时取消
  这一条，排空前再 prune 一次（不占切片名额）。
  ⚠️ 取消按**请求键**（`行 id#序号`）寻址，**不按行 id**：同一行会被换掉，新实例的任务可能先到、
  旧实例的取消后到，按行 id 会把刚发的新任务一并剔掉 —— 表现就是**一直不渲染、动一下鼠标才出图**。
  ⚠️ 取消标记记在**任务对象**上、任务出队即删（而不是一张只增的 `Set`）：取消可能落在**已经画完**
  的任务上，只记键的话那张表会随会话无限增长。
- **首帧占位**：任务要等轮到本片才画，在那之前这一行是空白的 —— 先同步写一行浅色「正在渲染」
  （取 `palette.lineText`，即 `--text-muted`；字号随排列区字号缩放），真画上去时整张位图被覆盖，
  不会残留。
  ⚠️ 位图尺寸必须**先设好再写占位**：占位是画在位图里的，位图还是默认的 300×150 时，画在
  `layout.width / 2` 处的文字落在位图之外被直接裁掉 —— 观感就是「占位没出现、整行空白」（第一版就
  踩了这个：`resizeBitmap()` 原本只放在画完那一步）。
  占位**只在这一行还没出过图时**写（`hasPainted` 守卫）：悬停移动等重绘也会走 `draw()`，每次都写会闪成一片；
  出过图之后再改内容就让它短暂停在旧画面上 —— 那比「一动指针就闪」好得多。
- **走过的弯路（为什么最后没走 worker）**：这条链路一度整体搬到 OffscreenCanvas worker（离屏服务、
  跨线程协议、`cloneDeep` 投递、调色板与 rem 基准全部改成入参），实测收益不值这些复杂度，已全部
  撤回 —— `editor/workers/`、离屏服务、`ArrangeDrawContext` / `FretboardRenderContext` 两个跨线程
  联合类型、`cardColors` / `remPx` 入参、画笔的 `palette` 入参一并删除，画笔与 `renderFretboardCanvas`
  回到原签名。两条硬事实值得留下：
  - **已取过渲染上下文的 `OffscreenCanvas` 按规范不可转移**（Chrome 报 _An OffscreenCanvas could not
    be transferred because it had a rendering context_），要回传只能 `transferToImageBitmap()` 取
    `ImageBitmap` —— 当初按「传本体更省」设计，结果是每条请求都在 `postMessage` 处抛错、被 `try`
    接住回成 error、每一行静默退回主线程（画面一直是对的，所以没人察觉）；
  - worker 里**读不到任何环境量**：主题变量、根字号（`rootFontSizePx()` 落到 16px 兜底，而本仓根
    字号是 22.25px，字形会缩水约 28%）、`document.fonts` 全都没有，得把两套调色板与 rem 基准都当
    数据传过去。为这点收益背一整套跨线程协议不划算。
- 验证：新增 `tests/services/arrangeLinePaintQueue.test.ts` 3/3（同一轮排入的批量不在同一轮跑完且
  让出后按序跑完 / 取消过的任务永不执行、其余照常 / 对已执行或未知的键取消是幂等空操作），
  断言里**不写死片长**（只要求「跑了一部分但没跑完」），改片长不会误伤；改动文件
  `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`paintArrangeLine` 全仓调用点只剩
  组件一处（已核）；**类型检查未验证**（按禁令不代跑）；**真机未实测** —— 画布对不对只能靠眼睛，
  需在页面上复核行内各态、缩放档，以及快速拖动时的手感（分片是否真的把尖峰抹平）。

### 新增 · 滚动条气泡支持悬停轨道/滑块显形（2026-10-02）

- 需求：v-scrollbar 的读数气泡此前**只在滚动时**出现（悬停滚动区刻意不弹，免得鼠标每次路过都糊上一块
  读数）；现要求**有气泡的那条轴**在指针悬停其轨道 / 滑块（拇指）时也显示气泡，默认开。
- 实现：
  - 新增 `ScrollbarBubbleOptions.hoverReveal`（默认 `true`；显式 `false` 退回「只在滚动时出现」）。
    判据集中在 core 的 `setBubbleHover`（启用态 / `hoverReveal` / **只认所属轴**），overlay 的轨道与拇指
    悬停处理只把事件递进去 —— 拇指与轨道是两个兄弟元素，指针在两者间移动会成对地 leave + enter，
    core 侧按「撤表 / 清表」对称处理，不会因此闪断。
  - **悬停期间不计时**：气泡常显到指针离开为止（新增状态位 `bubbleHover`）。照常按 hideDelay 计时会在
    指针底下把读数撤走，那与「指针还停在滚动条上」是互相打架的两件事；离开后回到与滚动结束同款的
    倒计时节奏（`armBubbleHide` 收敛了滚动显形与悬停离开两条路的「先撤旧表、再起新表」）。
  - **只认所属轴**：另一轴的轨道 / 拇指被悬停时不显形 —— 那一轴的读数并没有变，此刻显形等于递出一份
    陈旧读数（与滚动侧同一判据）。把鼠标移进滚动区（内容）仍不弹提示，这条口径没变。
  - 寿命上界不变：拇指若先一步自动隐藏，仍由 `setThumbsVisible` 把气泡一并收起。
  - `hoverReveal` 登记进 `structuralFingerprintOf`：它虽只被运行态读，漏登记会让运行时翻转发被静默
    冻结在挂载初值（与 `onlyInteractive` 同一处理）。
- 验证：新增 `tests/ui/directives/scrollbarBubbleHover.test.ts` 5/5（悬停所属轴显形 / 悬停另一轴不显形 /
  `hoverReveal:false` 不显形 / 悬停期间不计时且离开后按 hideDelay 淡出 / 未启用气泡时悬停是空操作）；
  改动文件与新增测试 `pnpm eslint --max-warnings 0` 0 问题、`prettier --check` 通过；**类型检查未验证**
  （本项目 typecheck 无文件级形态，按禁令不代跑）；**真机未实测** —— 悬停手感与气泡落点需在页面上复核。
