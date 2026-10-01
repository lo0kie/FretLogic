### 调整 · 排列和弦界面改为逐行 canvas 渲染，键盘导航移除（2026-10-01）

- 需求（用户提「排列和弦界面 canvas 化，以行为单位，其中键盘导航功能不再需要」）：排列区此前是纯 DOM
  谱面 —— 一行二十多个槽、每个槽挂若干组件实例，长谱面可达数千个槽；改为**一行一张 canvas**，
  行内一切（行号、字符、指板图卡、两枚「+」、行末删除钮、以及全部状态高亮）都画在同一张画布上。
- 渲染与命中**同源**（本轮的架构支点）：新增 `score/editor/render/arrangeLineLayout.ts` 把一行排成一份
  几何表（`ArrangeLineLayout`），**同一份矩形表既用来画、也用来命中**。任何一处各自算一遍都会让
  「点得中」与「看得见」错位，且不会报错 —— 这是 canvas 化的固有风险，用「一份表两个消费者」堵住。
  - 度量常量（槽内边距 / 字形行高 / 添加槽外边距 / 图标钮尺寸…）集中在文件顶部，与 Tailwind 类一一对应
    并注明来源；排版从 CSS 搬到了 JS，CSS 侧不再是真相源，这份清单就是那笔代价的落点。
  - 行高算式 `measureArrangeLineHeight` 与排版**共用同一组常量**，且是后者的唯一入口。
- 绘制归 `arrangeLinePainter.ts`：主题配色从根元素解析 `--text-*` / `--color-*` / `--bg-panel-*` /
  `--tint-primary-*`（canvas 消费不了 `var()`，与指板图同一条路，按主题缓存）；指板图直接调
  `renderFretboard`（与 `FretboardCanvas` 同一个纯函数渲染器）画进行画布；图标（`plus` / `trash-2`）
  用 lucide 同形路径走 `Path2D`，路径数据单列 `arrangeIconPaths.ts`（一长串指令会被 Tailwind 的
  「重复类名」规则误判，需要一条文件级例外注释，不该夹在绘制逻辑中间）。
- 行组件 `ScoreLineCanvas.vue`：只做挂画布、按依赖重绘、把尺寸交给 CSS。DPR 封顶 2 倍 —— 行 canvas 是
  逐行常驻的（视口内几十行），位图内存 = 宽 × 高 × dpr² × 4B，3 倍屏下几十行会顶到几百 MB。
- 虚拟化的行高改为**算式驱动**（`useScoreViewportRender`）：`lineHeightOf` 由宿主按排版算式给出，
  原先那套「逐行 `getBoundingClientRect` 实测 + 按有卡 / 无卡分档取最大值 + 空档期间冻结」整段删除。
  少的不只是几十行代码 —— 「实测值在空档存在期间必须冻结」这条约束一并消失（算式是纯函数，
  同一行永远给同一个值），离屏行与已挂载行逐像素一致。
- 拖拽落点改为**几何命中**（`lyrics-drag/dropGeometry.ts` 重写）：行「悬停」用宽容判断、槽位「落点」用
  精确判断，容差值与判据逐值不变，只是入参从「行 / 槽 DOM 元素」换成宿主给的几何表。
  - `useLyricsDragDrop` 不再自己找 DOM：落点解析、源槽高亮、长按蓄势三件事改由宿主注入
    （`resolveDropTarget` / `onDragSourceChange` / `onPressArmingChange`）—— canvas 行里既没有逐槽元素
    可供 `elementFromPoint` + `closest('[data-slot-key]')` 命中，也没有元素可加
    `is-dragging-source` / `is-press-arming`。会话状态机、合帧、ghost、边缘自动滚动四条链路原样保留。
  - `elementFromPoint` 只剩一处用途：**浮层探测**（面板 / 抽屉盖在谱面上时不产生落点）—— 这件事只有
    DOM 层答得出来，且不涉及槽位寻址。
  - 删除两个已无消费者的模块：`lyrics-drag/externalDropTarget.ts`（几何就近解析移到宿主）、
    `lyrics-drag/dropTargetRouter.ts`（两条落点路径合并为一条，合帧直接落在宿主）。
  - 「按下的是按钮就不登记拖拽意图」这一条**上移到宿主**：canvas 里没有按钮元素，宿主做命中测试时
    就知道这次按下的目标是哪一类元件，比在会话里反查 DOM 标签更准。
- 交互收敛为三处入口（都在排版表上做几何命中）：点槽位开面板、按在有和弦的槽上起拖、点删除钮 / 清除钮
  就地执行。悬停判定按 rAF 合帧（每 move 都要读行矩形，逐次同步执行等于把布局读压在指针热路径上）。
- 键盘导航**按需求整体移除**：`v-action-card`（Enter / Space → click）、槽位与两枚按钮的 `tabindex`、
  `aria-label` / `title`、`data-focusable-outline`、`Delete` / `Backspace` 键委托、添加槽的焦点转交协议
  （`focusin` → 「+」按钮）全部删除；行画布对读屏 `aria-hidden`。这是 canvas 化的必然代价：画布里没有
  可聚焦的元素。点击与拖拽两条编辑路径不受影响。
- 连带删除：`components/slot/` 整个目录（`AddSlot` / `ChordSlot` / `SlotGlyph` / `SlotShell` /
  `slotStyles.ts`）、`useLineRowHeightTransition.ts`（行高过渡：行高不再由内容撑出，钉住高度会让画布位图
  与元素尺寸不一致 —— 过渡期间内容会被拉伸变形，不值得保留）、`domains/score/index.ts` 里的 `ChordSlot`
  清单项（改为列出 `ScoreLineCanvas`）。
- 两处**有意的**视觉简化（都在代码注释里点名，不是漏掉的）：
  1. 拖拽落点行不再把槽撑到 `min-h-[108px]`（那要重排行内几何、行高会在拖拽中跳变），改由整行虚线框
     表达「可以落在这一行」，落点槽再叠一圈实线框；
  2. 槽上的「清除和弦」钮画在槽内右上角而非 DOM 版的槽外上方（`-top-2 -right-1`）：canvas 画不出自身
     位图之外的像素，超出槽顶的那半枚钮会被行 canvas 上边界硬裁，而给每行留顶部余量会连带改动占位高度、
     内容总高与滚动落点。
- 同一轮补上 `lineCardHeight.ts` 的卡**宽**算式（`chordCardCanvasSizePx`）：排列区改为 canvas 绘制后，
  卡片宽高都由它给出（DOM 版的宽度是 flex 自然撑出的），两侧若各算一份，卡片边框与字形基线会随名字
  长短漂移；`chordCardCanvasHeightPx` 保留为它的薄封装。
- 注释同步（引用已删组件的地方）：`fretboardBitmapCache.ts`（排列区不再消费该位图缓存）、
  `scoreEditorStore.ts`、`focusRingOverlay.ts`、`vTooltip.ts`、`ScorePreviewPane.vue`、
  `lineCardHeight.ts` 与 `tests/domain/scoreLineCardHeight.test.ts`。
- 落点：新增 `render/arrangeLineLayout.ts`、`render/arrangeLinePainter.ts`、`render/arrangeIconPaths.ts`、
  `components/ScoreLineCanvas.vue`、`tests/domain/arrangeLineLayout.test.ts`；重写
  `components/ScoreInteractiveArea.vue`、`composables/useLyricsDragDrop.ts`、
  `composables/lyrics-drag/{useDragHighlight,dropGeometry,dragSession}.ts`、
  `tests/ui/composables/useLyricsDragDrop.test.ts`；改 `composables/useScoreViewportRender.ts`、
  `lineCardHeight.ts`、`domains/score/index.ts` 与上列注释同步的文件。
- 验证：全部改动文件 `eslint --max-warnings 0` 通过；`pnpm vitest run
tests/domain/arrangeLineLayout.test.ts tests/domain/scoreLineCardHeight.test.ts
tests/ui/composables/useLyricsDragDrop.test.ts` 21/21 通过（新增的排版 / 命中用例锁两条契约：
  「排版行高与离屏占位算式逐值相等」「槽中心 / 删除钮中心 / 清除钮中心各自命中对应元件」，
  断言写成关系式、不写死像素字面量 —— jsdom 里文本度量走的是字符数粗估兜底）。
  **类型检查未验证**（本项目 typecheck 无文件级形态，按禁令不代跑全量）；**真机未实测**（画布观感、
  拖拽落点手感、滚动手感、缩放下的清晰度都需在浏览器里确认）；全量关卡按禁令未代跑。

### 修复 · 排列区行末删除钮压在行尾添加槽上（2026-10-01）

- 现象（用户提「行首和行尾的添加和删除按钮重叠了」）：行末删除钮与行尾那枚「+」落在同一段区间上。
- 根因：行末删除钮在 DOM 版里是内容流的**最后一个 flex 子项** —— `ml-auto` 只在**有多余空间**时把它
  推到行右端，空间不足时它紧跟内容之后。canvas 化时改成了「无条件贴行右端」的绝对定位，却没有把它
  的宽度计进行宽：于是内容一旦占满行宽（容器一窄内容就顶到行右端，窄屏最容易撞见），删除钮与行尾
  添加槽必然重叠。
- 修法：行宽兜底由 `max(内容流右沿, 容器宽)` 改为 `max(内容流右沿 + 删除钮边长, 容器宽)` —— 删除钮
  贴右端时因此必然落在内容之后，且行宽口径与 DOM 版（行宽本就含这枚钮）一致。
- 验证：`tests/domain/arrangeLineLayout.test.ts` 新增两条用例（窄容器下删除钮与**任何**槽位都不相交、
  宽容器下删除钮仍贴行右端且落在末槽之后），该文件 9/9 通过，连同另两个相关测试文件共 23/23 通过；
  改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；**真机未实测**。

### 修复 · 排列区删除钮：指针移上去不再消失，并补上悬停反馈（2026-10-01）

- 现象（用户提「删除和弦也加 hover 样式，和弦卡片的删除按钮移上去就消失了」）：指针一移到槽上的清除钮
  上，那枚钮当场消失；两个删除钮也都没有悬停反馈。
- 根因：悬停判定里只把 `kind === 'slot'` 算作「在某个槽上」，而命中清除钮时 `hitTestArrangeLine`
  返回的是 `slot-remove` —— 于是指针一进钮就被判成「不在任何槽上」，槽级 hover 被清空，而清除钮的
  可见性正是由槽级 hover 决定的，钮随之消失（指针一移开又出现，来回闪）。
- 修法：
  - 新增 `hitSlotKey(hit)`：把「清除钮与槽本体属于**同一个槽**」这条语义收在一处（行末删除钮不属于
    任何槽，返回 null），宿主改用它判定槽级 hover，免得每个消费方各写一遍 kind 判定。
  - 两个删除钮补上悬停态：实心危险底 + 反色图标（`--text-on-solid`）。DOM 版的 `ActionButton`
    本来就有 hover 底色，canvas 化时漏了 —— 这一档同时是「点下去就是删除」的即时承诺。
- 验证：`tests/domain/arrangeLineLayout.test.ts` 补两条断言（清除钮中心命中后 `hitSlotKey` 仍指向该槽、
  行末删除钮的 `hitSlotKey` 为 null），该文件 9/9、相关三个测试文件共 23/23 通过；
  改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；**真机未实测**。

### 修复 · 排列区度量按 Tailwind 标度重算，和弦↔歌词与行首尾间距放宽（2026-10-01）

- 现象（用户提「加一点和弦和歌词之间的间距，还有行首尾间距」）：指板图卡与歌词字符几乎贴在一起，
  行首的行号、行尾的删除钮也贴行框太近 —— 整体观感是「内容挤在一起」。
- 根因：canvas 化时把 Tailwind 类换算成 px 常量，却按「1 单位 = 4px」的直觉填了 2 / 4 / 8 / 12，
  而本项目根字号是 **22.25px**、Tailwind 的 `--spacing-*` 标度是 `3xs: 0.125rem` 起
  （`p-0.5` = 2.78px、`gap-2xs` = 0.25rem = 5.56px、`mr-2` = 0.5rem = 11.13px、`mx-md` = 0.75rem = 16.69px、
  `w-6` = 1.5rem = 33.38px）—— 于是槽内边距、字形内边距、卡片↔字符间距、行框内边距、行号间距、
  添加槽外边距、右侧留白栏**全线偏小**（最多差到 1.4 倍）。
- 修法：度量常量一律改为**以 rem 记录、运行时乘根字号**（与 Tailwind 标度同源），并在两处按用户要求
  **再进一档**：卡片与字符行之间 0.25rem → 0.375rem；行框内边距（行首 / 行尾两侧留白）0.25rem → 0.375rem。
  宿主侧的右侧留白栏（`w-6` / `w-2`）与行间间隙（`gap-xs` / `gap-3xs`）同样改为 rem 折算。
- 落点：`score/editor/render/arrangeLineLayout.ts`（常量表 + 两处算式 + 文件头的度量说明，注明
  「照 Tailwind 的 rem 值填、不要填 px」）、`components/ScoreInteractiveArea.vue`（`gutterWidth` / `lineGapPx`）。
- 验证：相关三个测试文件 23/23 通过（行高断言是「排版与离屏占位算式逐值相等」的关系式，不写死像素，
  故换算后照旧成立）；改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；**真机未实测**。

### 修复 · 排列区行末删除钮贴到行物理边缘、行框内边距在右端失效（2026-10-01）

- 现象（用户提「行删除按钮是直接贴边的，padding 没有生效」）：行末删除钮压在行的物理右边缘上，
  与行首那一侧（行号距左沿一个行框内边距）不对称。
- 根因：删除钮的 x 取 `行宽 − 钮宽`，把行框内边距（`lineInset`）整个吃掉 —— 行首那侧是从
  `lineInset` 起算的，右端却没有减掉同一段。
- 修法：x 改为 `行宽 − lineInset − 钮宽`，贴的是**内容区**右沿；行宽兜底（`contentEnd + deleteSize`）
  不变，故「不与行尾添加槽重叠」这条不变量照旧成立（测试仍在守）。
- 验证：`tests/domain/arrangeLineLayout.test.ts` 的右端断言由「贴行物理右沿」改为「右端留白 = 行号距
  左沿的那一段」（两端同源），该文件 9/9、相关三文件共 23/23 通过；lint / prettier 0 问题；真机未实测。

### 修复 · 排列区落点键的行归约函数参数类型放宽（2026-10-01）

- 现象（用户报类型错误）：`lineKeyOf` 的入参声明为 `SlotKey | null`，而拖拽落点键
  （`dragOverSlotKey`）来自几何命中、跨模块流动，类型上是裸 `string` —— 调用处因此报
  「`string | null` 不能赋给 `SlotKey | null`」。
- 修法：入参放宽为 `string | null`（返回类型仍是 `SlotKey | null`，前缀判定成立即证明它是槽位键），
  不为品牌类型反向约束拖拽模块。**类型检查本身未验证**（本项目 typecheck 无文件级形态、按禁令不代跑）。

### 修复 · 排列区清除钮的可见性按槽归约，指针移上按钮不再整行闪（2026-10-01）

- 现象（用户提「移动到添加按钮和弦卡片的删除按钮会闪一下」）：指针一移上两枚「+」或某张卡片的清除钮，
  同一行**所有**和弦卡片的清除钮一起冒出来（移开又一起消失），观感就是闪一下。
- 根因：清除钮的可见性被写成了**行级**布尔（「本行有没有槽被 hover」）—— 指针落在同行任意一格
  （包括两枚「+」所在的添加槽）都会让它为真。而 DOM 版里这枚钮的显隐是**槽根上的 `group-hover`**，
  本来就只作用于指针所在的那一格。
- 修法：`ArrangeLineVisualState` 的 `slotRemoveVisible: boolean` 换成
  `removeVisibleKey: SlotKey | null`（可见的那一枚）+ `removeAlwaysVisible: boolean`（无悬停能力的
  设备常驻，与前者是并列关系），绘制端按 `slot.slotKey` 精确比对。
- 验证：相关两个测试文件 18/18 通过；改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；
  **真机未实测**。

### 调整 · 排列区行内三枚图标钮各降一档，槽上清除钮移到卡片右上角外沿（2026-10-01）

- 需求（用户提「行的三个按钮缩小一点，卡片的按钮再往右上角移一些」）：
  - 三枚图标钮（行首「+」/ 行尾「+」/ 行末删除）此前桌面取 lg 档（2.3rem ≈ 51px），一行里并排显得
    过大 —— 改为桌面 **md**（1.9rem）、窄屏再降一档 **sm**（1.6rem）。档位改由控件标尺
    `CONTROL_HEIGHT_PRESETS` 折算，不再在宿主里手写 2.3 / 1.9 两个字面量。
  - 槽上清除钮原先压在卡片右上角的**内侧**（距槽顶 / 槽右沿各一个槽内边距），现**上提**到行顶附近、
    **右移**到略微越出槽右沿，视觉上落在卡片的右上角外沿（少遮指板图）。
- 上提量受行框内边距约束（`Math.max(0, lineInset − rise)` 钳住）：canvas 画不出自身位图之外的像素，
  越出行顶即被裁掉一角。行画布的顶沿到槽顶之间正好有这一段内边距可用，故不必为它额外加行高。
- 落点：`score/editor/render/arrangeLineLayout.ts`（新增 `REMOVE_BUTTON_RISE_REM` /
  `REMOVE_BUTTON_OFFSET_X_REM`，清除钮的 y 改为在行高算出后统一落位）、
  `components/ScoreInteractiveArea.vue`（`actionButtonSize` 降档 + `buttonSizePx` 改走标尺）。
- 验证：相关三个测试文件 23/23 通过（命中用例仍覆盖清除钮中心）；改动文件 `eslint --max-warnings 0`
  与 `prettier --check` 0 问题；**真机未实测**。

### 修复 · 排列区和弦名基线随画布重绘漂移（拖动后正常、鼠标一动就错位）（2026-10-01）

- 现象（用户提「拖动和弦到另一个字符后，和弦名字会上移；鼠标移出字符名字又下移，上移的位置才是正确的」）：
  同一个和弦卡，名字的纵向位置在两次绘制之间不一致 —— **拖动落地（画布尺寸变了）那次是对的，之后任何一次
  纯重绘（悬停态变化）都会把名字整体压下去**。用户明确指出「上移的那一版才对」，正是判据的来源：
  正确位置对应 `alphabetic` 基线（名字按传入的 `baselineY` 就是基线画），错位那一版是 `middle`。
- 根因：**canvas 的 `textBaseline` 是跨调用存活的画布级状态，而和弦名层依赖它保持 `alphabetic`**
  （`drawMeasuredChordName` 只设 `textAlign`，从不设 `textBaseline`）。排列区的行号要 `'middle'` 才能
  居中在行号矩形上，画完却不复位 —— 于是同一张行画布**下一次重绘**里的名字被下移半个字高。
  之所以表现为「时好时坏」：`ScoreLineCanvas` 只在 `canvas.width/height` 真的变了才重设位图，而
  改这两个属性会**连带重置整个画布状态**（基线回到 `alphabetic`）—— 布局尺寸一变（拖动落地改写了行宽 /
  卡片高）名字就自己「修好」，尺寸不变的重绘则暴露错位。同一份契约的另一端是 `drawFretNumbers`：
  它用 `'middle'` 标品号后**显式复位** `'alphabetic'`，本层却没享受同等待遇。
- 修法（两端各补一处，缺一仍会复发）：
  - `fretboardDrawCore.drawMeasuredChordName` 显式声明 `ctx.textBaseline = 'alphabetic'`：本层不再依赖
    任何环境状态，任何在同一 ctx 上先画过文本的消费方都不会再让它错位（其余消费方各画各的新画布，
    状态本就是默认值，故行为零变化）。
  - `arrangeLinePainter.paintArrangeLine` 的行号绘制整段包进 `save()` / `restore()`：行画布是**唯一**
    在一张位图上叠多层文本的消费方，画布级状态一律自己收口，不留跨调用的隐性契约。
- 验证：新增 `tests/domain/fretboardDrawCoreTextState.test.ts`（2 条：上游把基线留在 `middle` 时本层仍回到
  `alphabetic`；分片按宽度整体居中于 `centerX` 且纵坐标取传入基线），连同排列区 / 指板几何相关的
  4 个测试文件共 41/41 通过；改动文件 `eslint --max-warnings 0` 0 问题；**真机未实测**
  （名字是否回到正确高度需在浏览器里确认）。

### 修复 · 乐谱页面板切换时上一页画面残留（2026-10-01）

- 现象（用户提「从编辑歌词/预览切换到排列和弦，上一页的画面会短暂残留」，改后又提「从排列和弦切换到其它
  tab 有残留了」）：点 tab 之后，旧面板的画面还留在原位一小会儿，两个方向都会。
- 根因：`ScoreView` 的面板切换用的是**交叉淡入淡出**（`v-transition-fade`：旧面板淡出与新面板淡入同时
  进行，100ms）。两个面板叠在同一格（`stack-slot`），新面板在旧面板之上、但**入场时自身是半透明的**
  —— 旧面板于是在自己那 100ms 淡出里从新面板的透明处透出来。DOM 面板（歌词编辑器的整块文本域、
  预览页的 A4 卡片）内容密、遮得住；排列区是逐行 canvas，大片像素本就透明，旧页面正好从卡片与文字
  之间的空隙里显形，所以切到这一页时特别明显。
- 修法：新增「入场淡入、离场当帧隐去」的过渡档 `v-transition-fade-in`（`assets/transitions.scss` 的 1.2），
  `ScoreView` 改用它 —— 新旧面板从不同时可见，旧面板没有机会被看见，新面板只从背景色里浮出来。
  不选 `mode="out-in"`：那要等旧面板淡完才挂新的，整段串行等待正是当初选并行过渡要省掉的。
- 离场侧那条 `opacity: 0` **不是可选项**（第一版只写了入场侧，于是「切走之后上一页的画面残留」照样出现）：
  Vue 的离场要先 `nextFrame` 等一帧、再量过渡属性，判出「无过渡」才摘元素（见 runtime-dom 的 Transition
  leave 钩子，`whenTransitionEnds` 排在 `nextFrame` 回调里）—— 少了它，旧面板会以原样多留一到两帧，
  而那两帧里新面板正停在 `enter-from`（opacity 0）上，**只有旧面板可见**。它只声明 opacity、
  不带任何 transition（带上就等于又给了它一段动画）。
- 落点：`src/assets/transitions.scss`（新增 1.2 档并写明它与 1 档的分工、以及那条 leave 规则为何必需）、
  `src/domains/score/editor/components/ScoreView.vue`（transition name 与模板注释）。
  `v-transition-fade` 本身未动（`App.vue` / `SidebarLeft.vue` / `ChordPickerPanel.vue` 仍在用）。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；相关测试 11/11 通过
  （本档为纯样式 + 模板属性，无单测形态）；**真机未实测** —— 需在浏览器里确认两个方向的切换都不再出现
  旧画面、且新面板的淡入观感可接受。

### 修复 · 排列区「可撤销的删除」按精确快照还原，不再弹撤销栈顶（2026-10-01）

- 现象（用户提「删除和弦后 notice 是始终保留的，此时再执行编辑操作，点撤回没有回溯到真正的撤回，
  因为撤销栈已经被更新了」）：清掉一个和弦（或删掉一行）之后，通知一直挂着；此时若先做了别的编辑、
  再回来点通知上的「撤销」，撤掉的是**那次编辑**，而被删的那个和弦 / 那行照旧没了。
- 根因：排列区这两处删除的撤销动作走的是 `scoreEditor.undo()` —— **弹撤销历史栈顶**。而通知是
  **常驻**的（撤销入口随 toast 飘走就没了，用户必须能回看并补做），栈顶在用户点它之前早就换了人。
  同一个仓库里「删指法 / 删分组 / 删乐谱」三处**都没有**这么做：它们各自记一份精确快照、按原位写回，
  代码注释里写的正是这条理由（「删除与撤销之间可能夹着其它操作，弹栈顶会撤错对象」）—— 排列区是漏网的那一处。
- 修法（对齐那三处）：
  - `scoreEditorStore` 新增两个还原动作：`restoreDeletedSlot`（把被清的和弦插回原槽位）与
    `restoreDeletedLine`（把被删行的歌词文本 / 行序 / 该行槽位表按原下标一起写回），两者各自
    `recordHistory(); 写回; recordHistory();`，故「还原」本身也是一步可撤销的编辑。
    粒度取**被删掉的那一份**而不是整首歌面状态：删除与撤销之间夹着的其它改动一概不受影响。
  - `score/model/chordSlots` 新增 `restoreChordAtSlot`：**插回**而不是覆盖。清除边和弦会把列表摘短
    （`splice`），而 `bindNewChordToSlot` 在「下标仍落在列表长度内」时是覆盖 —— 直接用它还原会把原本
    排在后一位的和弦顶掉。它转发的正是「拖拽把和弦放到目标槽位」用的那条插入原语，故仍是单一实现。
  - `ScoreInteractiveArea`：两处删除各自在**删除前**记精确快照（删行的槽位表取 `cloneChordMap` 深克隆 ——
    删除会原地改写这些容器），通知的 `onAction` 改为调还原动作并回报具体结果；原先那个
    「弹栈顶 + 笼统回报」的 `undoWithFeedback` 随之删除。
- 验证：新增 `tests/stores/scoreEditorStoreRestoreDeletion.test.ts` 3 条（清字符槽后夹着别的编辑仍只写回
  那一个槽位；清行首边和弦按原位**插回**而非覆盖（覆盖会得到 `[a, b]`，断言完整列表 `[a, b, c]`）；
  删行后夹着别的编辑仍把该行与它绑的和弦一起按原下标写回），`tests/stores` 全目录 14 文件 42/42 通过；
  改动文件 `eslint --max-warnings 0` 与 `prettier` 0 问题。**本次改动触及 store 的 action 签名
  （新增两个动作与两个快照类型），按分级标准应跑一次全量检查 —— 本环境禁令下未代跑，请自行跑一次完整关卡**；
  真机未实测。
- 补记 · 该测试文件的夹具类型（用户贴出 9 条 TS2322 / TS2345）：三处从数组解构出来的
  `lineId` / `chordId` 被当成非可选品牌类型用，而 `tsconfig.json` 的 `noUncheckedIndexedAccess: true`
  （`tsconfig.tests.json` 继承同一套严格选项）让**数组索引与解构的结果一律带 `| undefined`** ——
  于是 `[l1, l2, l3] = ... as LineId[]` 的每个元素都成了 `LineId | undefined`，`snapshot.lineId`
  那一条是下游（源头是 `l2`）。修法是就地写死的那几组值改断言成**元组**（`as [LineId, LineId, LineId]`
  / `as [ChordId, ChordId, ChordId]`）：这些值既然就地写死就必然存在，元组把「确实有三个」一次说清，
  逐个 `!` 只会把它散成三处、且 `!` 一多就再也看不出哪一处是真的越界。补 `ChordId` 的 import。
  复跑定点类型探针：**0 条**；反向证伪（退回 `as LineId[]`）重新报出 5 条 `LineId | undefined`，
  随即还原。该文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题，3 条用例仍全绿。

### 修复 · 排列区切「符号简写 / 显示大横按」画面不更新（2026-10-01）

- 现象（用户提「切换符号简写和切换横按排列和弦没有更新数据」）：这两个显示开关在排列区切了没反应，
  指板图卡上的横按梁与和弦名写法都停在旧样子（切到别的 tab 再回来才变）。
- 根因：行组件的 `v-memo` 依赖表漏了绘制口径。依赖表里有**排版**口径 `layoutEpoch`（字号 / 卡倍率 /
  容器宽 / 钮尺寸 / 收紧品窗），而「符号简写」「显示大横按」只影响**绘制**、不进排版键 —— 于是切这两个
  开关时本行全部依赖原样命中、`:paint` 还停在旧对象上，子组件根本没收到新值，也就没有重绘。
  之所以只有这两个开关出问题：`paintOptions` 里其余三项（字号 / 卡倍率 / 收紧品窗）本就同时进
  `layoutEpoch`，靠排版口径那一侧已经把行刷掉了。
- 修法：依赖表补上 `paintOptions` **本身**（而不是逐个开关）—— 它就是子组件收到的那个值，
  「prop 变了 ⇒ 本行必须失效」由对象标识天然保证，日后新增绘制开关也不必回来补依赖。
- 落点：`score/editor/components/ScoreInteractiveArea.vue`（`v-memo` 依赖表 + 注释）。这是全仓唯一
  一处 `v-memo`（已 grep 确认），不存在同类的第二处。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题。**本档无单测形态**：断言点在
  「`v-memo` 依赖表是否覆盖渲染输入」上，要挂载整个排列区才能观测（而 jsdom 下 `getContext('2d')` 为
  null，画布绘制整段走不到），成本与一处模板依赖不成比例 —— 故未加用例，按禁令也不代跑全量。
  **真机未实测**：请确认切这两个开关时画面立刻刷新。

### 调整 · 排列区拖拽落点去掉行级虚线框，只留落点槽的实线框（2026-10-01）

- 需求（用户提「拖动时撑开是没加还是 bug？直接去掉吧」）：拖拽经过某一行时不再画任何行级框。
  DOM 版是靠把落点行的槽**撑高**到 `min-h-[108px]` 表达「可以落在这一行」；canvas 版一度改成
  「整行一圈虚线框 + 落点槽实线框」，现按用户要求把行级那圈也去掉 —— 拖拽期间行内只剩落点槽自己那圈实线框。
- 行级反馈仍由行自身的悬停底色 / 边框承担（指针在行内时本就会亮，与平时悬停是同一套语言）。
  **落点行的宽容判定保留**：两枚「+」仍按它显形（拖到行首 / 行尾的拉伸空白也能落在添加槽上）。
- 落点：`render/arrangeLinePainter.ts`（删掉 `dropLine` 状态与那圈虚线；文件头与 `arrangeLineLayout`
  文件头的「有意的视觉简化」一并改写）、`components/ScoreInteractiveArea.vue`（`visualStateOf` 不再下发
  `dropLine`，`isLineActiveDrop` 的注释改为只说它现在服务的那件事）、`lyrics-drag/dropGeometry.ts` 与
  `lyrics-drag/useDragHighlight.ts`（注释里「撑开该行」的措辞改为「判为落点行」）。
- 验证：相关三个测试文件 23/23 通过（本档是绘制侧视觉，断言点在画布像素上，无单测形态）；
  改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；**真机未实测**。

### 修复 · 排列区「+」被选中（面板目标）后指针移开就消失（2026-10-01）

- 现象（用户提「首尾添加按钮在点击后出现虚线边框，但是鼠标移出按钮会消失，改成选中就始终显示」）：
  点击行首 / 行尾的「+」打开选器和弦面板后，指针一移开，那一格就只剩一圈虚线框、按钮本身没了 ——
  「这一格已被选中」看不出个所以然。
- 根因：「+」的显隐此前只认 `addButtonVisible`（行悬停 / 落点行 / 无悬停能力的设备）。DOM 版里点击会
  让按钮拿到**焦点**，`group-focus-within` 于是把它一直亮着；canvas 里没有可聚焦元素，点击不留任何痕迹，
  指针一离开行就退回「未激活」那一档。
- 修法：`drawSlot` 里把「本槽是面板目标」（`pickerTargetKey === slot.slotKey`）并进「+」的显隐条件 ——
  **选中即常显**，与面板开着一日、框就一直在同一套口径。面板目标框本身本就只认状态、不认悬停（这轮把
  这个不变量在注释里写明）。
- 落点：`score/editor/render/arrangeLinePainter.ts`（`drawSlot` 的「+」显隐条件 + 面板目标框的注释）。
- 验证：`tests/domain/arrangeLineLayout.test.ts` 9/9 通过（本档是绘制侧视觉，断言点在画布像素上，
  无单测形态）；改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；**真机未实测**。

### 调整 · 三处重复实现收敛（用户确认后执行）（2026-10-01）

- 背景：用户提「检查整个项目，哪些地方可以用更优雅的实现」，抽查后报了三处，用户回「都改」——
  按 `rules/01-refactoring-ban-and-admission.md` 的「一、绝对重构禁令」，这类改动要有明确指令才动。
- 1. **行号格式化两处实现收成一处**：`ScoreInteractiveArea` 的 `formatLineIndex` 与
     `arrangeLineLayout` 的 `formatArrangeLineIndex` 逐字相同，而后者本就已导出 —— 组件改为 import，
     本地那份删除（行内排版与滚动气泡读数自此同一份实现）。
- 2. **槽上「清除和弦」钮不再写死 24px**：它与行首 / 行尾的「+」、行末删除钮是同一族控件，那三枚的
     档位由宿主按断点折算（桌面 md / 窄屏 sm）；清除钮钉死像素时，窄屏降档后它会相对变大、桌面又相对变小。
     改为 `buttonSize × 0.567`（≈ 24px @ md，正是此前观感；窄屏 sm 档下随之 ≈ 20px）。顺带删掉那句已过期的
     注释（「与 ChordSlot 的 REMOVE_BUTTON_SIZE 同值」——那个组件已随 canvas 化删除）。
- 3. **四处「可撤销的删除」通知收成一处**：新增 `platform/ui/feedback/useUndoableDeletionNotice.ts` ——
     一个 composable，在 setup 里取一次、拿到的是**已绑定 uiStore 的通知函数**（入参
     `{ title, restoredTip, undo }`）。store 实例在「已知有活跃 pinia」的那一刻解析一次并被闭包捕获，
     而不是每次调用时再去问「现在谁是活跃 pinia」—— 后者能跑，但把依赖藏进了环境状态
     （与 `app/services/persistFailureNotice` 同一条口径）。四处改为调用它，全仓 `uiStore.notice.info`
     只剩这一处；`SongSection` 因此不再需要 `uiStore`，其导入与实例一并删除。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier` 0 问题；受影响的三个测试文件 15/15 通过
  （清除钮的命中用例是按排版表算中心的关系式，尺寸改成比例后照旧成立）。**本次改动跨 6 个文件
  （含 1 个新增），按分级标准应跑一次全量检查 —— 本环境禁令下未代跑，请自行跑一次完整关卡**；
  真机未实测。

### 调整 · 审计 A 组的三处收口（vite 测试清单 / 共享 ResizeObserver / 歌词字符谓词）（2026-10-01）

- 背景：用户转来一份全项目审计，A 组标为「便宜且零行为风险」。逐条核对后落地三处（另两处见下）。
- 1. **vite 的 ui-only 用例清单收成一份常量**：四个 `tests/ui/**` 之外、靠显式登记划归 jsdom 工程的
     用例，此前在 logic 的 `exclude` 与 ui 的 `include` 各写一遍。漏改一边的后果不对称：只加进 include
     会让 logic 也收走它（node 下报 `document is not defined`），只加进 exclude 则**两个工程都不跑**
     （静默不测）。提成 `UI_ONLY_TESTS` 两处展开。
- 2. **排列区的容器宽度观察改走共享 ResizeObserver**：`platform/utils/dom` 的 `observeResize` 是全仓
     唯一的多路复用观察者（`vMarquee` / `vAutoWidth` 等都在用），此处此前自建一个实例；改为它之后顺带
     去掉「无 ResizeObserver 时静默降级」那半个判据（共享实现自己兜了），`disconnect` 也换成
     它返回的清理函数（只摘自己那一条回调，不再整实例断开）。
- 3. **歌词空格 / 分隔符判定收成一处**：三份实现（排列区行画布的具名 `isLyricSeparator`、导出排版端的
     同义改名 `isLyricBarChar`、导出绘制端的内联比较）合并进新的叶子模块
     `score/model/lyricChars.ts`（零 import，主线程与 Worker 都能引）。`scoreExportLayout` 那句
     「绘制端另有一份内联同义判定，留待下次碰那条路径时合并」的注释随之兑现。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier` 0 问题；`tests/utils/barre.test.ts` 18/18
  （证明 ui-only 清单改完仍被 ui 工程正确收录）、`scoreTypography` 16/16、`workerExportService` 2/2、
  `arrangeLineLayout` 9/9 通过。**本次改动跨 6 个文件（含 1 个新增），按分级标准应跑一次全量检查 ——
  本环境禁令下未代跑，请自行跑一次完整关卡**；真机未实测。

### 新增 · 和弦选择面板滚动条显示分区读数气泡（2026-10-01）

- 需求（用户提「chordpicker的滚动条也显示气泡」）：选择面板主列表（纵向）的滚动条此前无读数，
  长列表里「滚到哪个根音分区了」只能靠分区定位条或吸顶标题。
- 实现：复用 vScrollbar 既有的滚动气泡，`format` 在滚动帧里现查滚动容器内的 `data-section-id`
  分区块，取「视口顶已越过的最后一个分区块」的根音类别名 —— 与 SidebarLeft 的拼音分组读数同一手法
  （滚动帧读 DOM、不闭包捕获响应式列表；binding 是静态对象，指令侧零重建）。
- 判据刻意取**分区块**而不是分区头：分区头是吸顶的，钉在容器上沿时 `top` 恒等于 `hostTop`，
  按「头已越过上沿」判定会把当前分区慢报成上一个；分区块是正常流布局，无此问题。
  顶端留白带归首分区，不露空泡。
- 观感对齐 SidebarLeft 的分组读数：`roll: false`（分区名整段换、不做逐字翻页）、`hideDelay: 1500`，
  默认 sm 档、默认轴 y。
- 落点：`ChordPickerPanel.vue`（主滚动区 `:scrollbar="pickerScrollbar"` + 静态绑定与分区扫描）。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；类型检查无文件级形态、
  该项未验证；**真机未实测**（面板需「播种数据 → 开乐谱 → 开面板」整条链路）；全量关卡按禁令未代跑。

### 重构 · 和弦理论的半音事实与音级换算各自收成单源（2026-10-01）

- 需求（用户给出一份 A/B/C/D 四组重构清单并回复「授权」）：B 组「跨模块同形副本」两条 ——
  音程槽位的半音值、自然字母音级 + 升降号 → 音级。
- **音程槽位半音**：三度 `4 / 3`、五度 `7 / 6 / 8`、挂留 `5 / 2`、七度 `11 / 10 / 9` 这四组事实
  此前在 `chordQualityAst` / `chordRecognitionAst` / `chordEngine` 三处各抄一份（共 5 份字面量散落），
  且每处还要把「槽位集合 → 12 位掩码」再写一遍。现收口到 `chordQualityAst` 的四张表
  （`THIRD_SEMITONES` / `FIFTH_SEMITONES` / `SUS_SEMITONES` / `SEVENTH_SEMITONES`）加一个
  `semitoneMaskOf(semitones)`；`chordRecognitionAst` 的 `inputSlotsOf`、`rolesOfAst` 与
  `chordEngine` 的 `SLOT_GROUPS` 全部改由它们派生。为什么必须单源：这三处算的是**同一个乐理事实**，
  任何一处改错（如把 `min7` 的 10 写成 9）只会让「识别得出、展开不对」这类偏差漏到运行时，
  而在表里改一处则三个入口同步。
- **音级换算**：`((ROOT_PITCH_MAP[letter] ?? 0) + acc + 12) % 12` 这一式此前被抄了 6 份
  （`chordDegree` 的根音与斜杠低音各两份、`transpose.transposeRootSegment`、`chordAnalysis` 的
  斜杠低音同步），每份自带一遍 `?? 0` 兜底与归一。现收口为 `chordName` 的
  `pitchClassOf(letter, accidental = 0)`。刻意与 `parseChordName` 的 `?? 99` 区分：那里 99 是
  「解析不出」的哨兵，这里要的是「查不到就按 C 起算」的可用音级；也刻意不加 `hasOwn` 守卫 ——
  6 个原调用点都没有，加上会让「未知字母」从 NaN 变成可参与比较的音级，属语义变化而非收口。
- 验证：四个改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；定点 logic 用例
  10 个文件、375 passed | 1 todo 全绿（`chordCorpus` / `chordDegree` / `chordEngine` / `chordIdentity`
  / `chordNameParserConsistency` / `chordRecognitionCorpus` / `chordTheoryProperties` / `theory` /
  `theoryMore` / `transposition`）。
- 反向证伪（确认用例真的咬得住这两处单源）：① 把 `SEVENTH_SEMITONES.min7` 从 `10` 改成 `9` ——
  `chordCorpus` / `chordRecognitionCorpus` / `chordEngine` 多例转红（含 `'C7sus4' 展开为 [+0,5,7,10]`）；
  ② 把 `pitchClassOf` 的 `+ accidental` 翻成 `- accidental` —— `theory` 的等音异名等价判定 3 例
  （`Bbadd9/F#` ↔ `A#add9/F#`、`C#m7` ↔ `Dbm7` 及其对称性）与 `transposition` 的
  `transposeRootSegment` 转红。两处均随即还原并复跑全绿。
- 验证边界：全量关卡（`pnpm verify` / `typecheck`）按禁令未代跑；`.vue` 模板层与跨模块类型闭包未验证。

### 重构 · 滚动余量判据、事件钩子、悬停能力判据各自收成单源（2026-10-01）

- 需求：同上一条（用户「授权」的 B 组清单）。本条收口其中四条互不相干的跨模块副本。
- **滚动余量判据**：`v-wheel-scroll` 的 `canScrollBy` / `onWheel` 内联判据与 `v-scrollbar` 的
  `canHostAbsorb` 此前各写一份**逐字相同**的 `(delta > 0 && pos < max - 1) || (delta < 0 && pos > 1)`，
  两处只有注释互相点名维系。现收口为 `platform/utils/dom` 的 `hasScrollRoom(pos, max, delta)`
  与常量 `SCROLL_ROOM_TOLERANCE_PX`（三处调用点：`canScrollBy`、`onWheel` 的 `canScrollMore`、
  `canHostAbsorb`）。为什么必须同源：两处裁决的是同一个问题，一旦分叉，同一容器在**内容区**与
  **滚动条**两个落点会得到相反裁决（「在内容区滚到底才让位、在滚动条上却提前让位」）。
  验证：穷举 `pos / max / delta` 共 567 组组合，新旧三份判据结果逐一相等。
- **「Set + on/emit」事件钩子**：`persistFailure` / `motion` / `idbKv` / `overlayLifecycle` /
  `exitFlush` 五处各抄一份骨架，且**广播口径已经分叉** —— `overlayLifecycle` 与 `idbKv` 遍历
  `[...set]` 快照，另三处直接遍历 `Set` 本身。直接遍历时「回调里注册新监听」会让新监听在本轮就被
  调用（自我追加即死循环）。现收口为 `platform/utils/hook` 的 `createHook<T>()`（`on` / `emit` / `clear`），
  口径统一为**本轮接收者 = 广播开始那一刻的订阅者集合**。`exitFlush` 的「单个回调抛错不阻断其余」
  从广播循环里移进 `registerExitFlusher` 的注册包装（`createHook` 的广播本身不吞异常）。
  刻意不用 `@vueuse/core` 的 `createEventHook`：装的 14.4.0 无类型出口，`@vueuse/shared` 未安装。
- **悬停能力判据**：`useHeaderLayout` / `FretboardSvg` / `ScorePreviewPane` 三处各写
  `useMediaQuery('(hover: hover)')`、`vTooltip` 一处裸 `window.matchMedia('(hover: hover)')`
  （后者违反 `motion.ts` 自订的「消费方不得自行 matchMedia」）。现查询串收口为
  `motion.ts` 的 `HOVER_MEDIA_QUERY`，响应式那一份收口为 `platform/composables/useCanHover`
  的模块级单例 ref（三条 MQL 监听合一），一次性查询收口为 `motion.hasHoverCapability()`。
  `v-tooltip` 刻意保持**调用时求值**而不是取那个单例：它的用例按用例桩 `matchMedia` 翻转答案，
  单例在模块加载期就把值定死了 —— 这是刻意留着的翻转接缝。
- **长图渲染入参**：`scoreExportPages.renderLongImageBlob` 的 14 个位置参数改对象入参
  （`LongImageRenderOptions`），与本文件另一条渲染路径 `A4PageRenderOptions` 对齐。
  位置参数已排到第 14 位且**相邻多项同型**（`title` / `singer` / `keyText` / `capoText` /
  `timeSignatureText` 五个字符串连排），少写一个会把后面全部前移一格且编译期毫无察觉。
- **和弦根音拼写兜底表**：`chordEngine.getPreferredRootLabel` 的 `case 3 / 6 / 10`
  三个分支（`existingLabel || 'Eb' / 'F#' / 'Bb'`）与默认分支的
  `STANDARD_ROOT_NAMES[n]`（即 `KEY_OPTIONS`）逐字相同，纯冗余，删除后落回默认分支；
  `case 1`（兜底 `Db`，与 `KEY_OPTIONS[1]` 的 `C#` 刻意不同）与 `case 8`（小调改 `G#`）是真的例外，保留。
  顺带订正 `pitch.ts` 里一段**不实**注释（原称「拼写方向必须与另外三处一致」，实际音级 1 在两个
  语境下刻意不同）—— 把「弦上音名标签」与「和弦根音名」两个语境的区别写明，避免后人误去「统一」。
- 验证：改动文件 `eslint --max-warnings 0` 与 `prettier --check` 0 问题；新增
  `tests/platform/hook.test.ts`（5 例，把快照语义与「广播不吞异常」直接钉死）。
  定点 logic / ui 用例全绿：chord 域 379、钩子与浮层相关 36、悬停与 tooltip 相关 42、
  `useWorkbenchPanelExpanded` 4、score 导出 21。
- 反向证伪：① `createHook.on` 的退订函数改成空操作 → `persistFailure` 与 `exitFlush` 各 1 例转红；
  ② `createHook.emit` 改回直接遍历 `Set` → 新增的快照用例转红；③ `hasHoverCapability` 恒返回
  `true` → `vTooltipHoverCapability` 3 例转红。三处均随即还原并复跑全绿。
- **两条清单前提与现码不符，未按原样执行**（如实记下）：
  - 「`useStorage` 的 `storage?` 全仓无人传」**不成立** —— `tests/composables/useWorkbenchPanelExpanded.test.ts`
    三处显式注入内存 StorageLike，且 `useWorkbenchPanelExpanded` 的第二参就是它。故 `storage?`
    与 options 位置兼容层原样保留。
  - 同一处**试过把 vueuse 那份按类型铺开的 8 条重载塌成 2 条泛型重载，已回退** —— 塌完
    `settingsStore.ts` 立刻冒出 **19 条**类型错误（`githubOwner: RemovableRef<'lo0kie'>` 之类，
    TS2322「`string` 不能赋给 `'lo0kie'`」+ TS2367「`'look1e'` 与 `'lo0kie'` 永不重合」）。
    机制：泛型签名下 `T` 由 `initial` 反推，而 TS 只对**新鲜字面量**（当场写出的 `'lo0kie'`）拓宽
    字面量类型，对 `as const` 对象的只读属性（`GITHUB_SYNC_CONFIG.DEFAULT_OWNER`）**不拓宽**，
    于是 ref 的类型落成字面量而非 `string`。那 8 条重载不是冗余抄写，它们正是**拓宽**这一手。
    另试过给 `T` 加 `extends string | number | boolean` 约束：约束反而让 TS 保留字面量，连新鲜
    字面量那条路径也开始报错 —— 一并回退。两处结论已写进 `useStorage.ts` 的文件头注释。
  - 教训：上一轮把探针里这 19 条诊断当成「既有的 `settingsStore.ts` 噪声」记进了变更日志，
    没有核对它们是不是自己改出来的 —— 它们正是自己改出来的。此条已按实情改写。
  - `chordEngine.getPreferredRootLabel` 的 `default` 分支**无任何用例覆盖**（把它改成返回 `'ZZZ'`，
    379 条 chord 用例全绿）—— 因为 `collectNoteContext` 已把 12 个音级的 `labelByPitch` 全部填满，
    `existingLabel` 恒为真值。也就是说该 switch 里真正可达的只有 `case 1` / `case 8` 的小调早退。
    这也意味着本条的删除是**靠等价推理而非用例**保证的（`'Eb' || 'C'` ≡ `'Eb'`）。
- **三条未执行，附理由**：
  - 第 8 条（和弦名贴合求解器 2 份 → `fitFontSize`）：清单自述「副本 2，未达三次」。两份的
    收敛状态不同（一份是 `(basePx, accPx)` 一对，一份是单个 `scale`），抽出共享骨架后
    `scoreExportLayout` 的升降号字号要从 `round(accPx * ratio)` 变成 `round(nextBase * ratio)`，
    **可能差 1px**。清单要求像素回归，本环境跑不了，故不做（不做假绿）。
  - 第 15 条（两套 rAF 滚轮缓动 → `createSmoothScrollRunner`）：lerp 系数 `0.2`（内容条带）与
    `0.35`（滚动条宿主）分属两个容器、两种动线，未指明哪个是目标值；合并即改变其中一侧的手感，
    而手感回归只能人工验 —— 不做。
  - 第 14 条：前半（github / gitee 四方法 → `createGitSyncProviderMethods`）**已是现状**
    （`gitSyncProviderFactory.ts` 已存在，两个 provider 各 91 / 104 行）；后半
    （`platform/utils/transfer.ts` 的 `validateByRules` 与 `payload.ts` 的校验源）要改 platform，
    按 `rules/02` 需先声明流程 —— 未动。
- 验证边界：全量关卡（`pnpm verify` / `typecheck`）按禁令未代跑；`.vue` 模板层与跨模块类型闭包
  只走了定点探针（`.temp/probe/`，末态 **0 条**诊断）。探针里那 19 条 `settingsStore.ts` 诊断
  一度被误记为「既有噪声」，实为本轮 `useStorage` 重载塌缩的产物 —— 回退后归零，详见上文该条。
