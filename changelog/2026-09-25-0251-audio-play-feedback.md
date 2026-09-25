### 修复 · 试听按钮首次点击要等音频 chunk 到位才置灰（2026-09-25）

- 顶栏试听按钮的禁用态与图标原本只看 `isPlaying` / `isSustaining`，而这两个状态由懒加载模块
  `audioPlayback` 置位：首次点击要等 chunk 下载 + 模块求值完成才翻转，此前按钮既不置灰也不换图标，
  整段等待看起来就像页面卡住（预取只能把窗口压小，压不到零）；
- `useAudioPlayer` 新增 `isAudioPreparing`：点击当刻由状态壳同步置位、懒加载动作结算后复位，
  受理窗口覆盖 chunk 下载与模块求值，随后由真实播放状态接手；
- 顶栏试听按钮的图标与禁用态都接入受理窗口，点击即置灰并换成停止图标 —— 不给「正在准备音频引擎」
  这类中间文案，「已受理但尚未起音」的窗口直接按播放态呈现；
- 禁用判据刻意不含持续发声、延音路径也不置位受理标志：按钮一旦在长按期间被禁用，
  ActionButton 的「禁用即中止长按」会当场补发 hold-end，把刚起的持续发声掐掉。

### 修复 · 侧栏和弦卡的自动定位被分组行顶走（2026-09-25）

- 从搜索下拉选中和弦、切换分组时，卡片会先按自己的 `v-scroll-into-view` 定位，随后分组头上的
  `v-scroll-into-view.y.settle.gap-sm` 又把视口平滑拉回分组头 —— 同一帧里两个定位目标互相打架，
  后发起的那个（分组行）赢，卡片就此被顶出视口，观感是「卡片刚定位好又被折叠面板拉回」；
- 卡片的指令去掉 `.once`、补上 `.delay-220`（= 折叠体高度过渡时长，与设置弹层各分组头同一口径）。
  `.once` 只认挂载那一刻的激活态，分组已展开时从搜索框选中本卡**根本没有定位动作**；延迟到过渡结束再定位，
  既量到稳定布局（过渡期间折叠体高度不足，`scrollIntoView` 会连折叠体自身的滚动一并改掉），
  也保证这一次定位是最后落地的那个，分组行的滚动不再有机会覆盖它。

### 修复 · 滚动收起提示的作用域过宽（2026-09-25）

- `v-tooltip` 的「滚动即收起」挂在 window 捕获期、**无条件**隐藏当前提示：滚动侧栏列表会把顶栏按钮上
  正悬停着的提示一并关掉，程序化滚动（卡片自动定位、滚动位置贴回、折叠补偿）也会顺手关掉别处正在悬停的
  提示。这类误伤还**不可自愈** —— 收起后指针并未离开触发元素，`mouseenter` 不会再触发，提示一去不返，
  只能把鼠标移开再移回才能重新唤起；
- 收起判据改为「这次滚动会不会把锚点带走」：滚动源是锚点的祖先（含文档级）才收起 —— 只有祖先滚动才会让
  锚点在视口里位移，此时指针底下已经换成别的内容，收起才是对的；与锚点无关的滚动不再动它。
  拿不到节点（window 之类非 Node 目标）时保守按「会带走」处理，宁可多收一次也不让提示停在错位处。

### 修复 · 音频上下文挂起后首次试听抛 RangeError 导致整段扫弦静音（2026-09-25）

- 首次点击试听偶发 `RangeError: Failed to execute 'setValueAtTime' ... Time must be a finite non-negative
number: -0.0086`，一次抛错就打断 `triggerChordStrum` 的整个循环，扫弦中途静音且 `isPlaying` 随即复位；
- 成因是音频上下文被挂起（无用户手势 / 页面隐藏）后 `currentTime` 冻住，而 `resume()` 的 promise
  会早于音频时钟真正跨过有效起点 resolve —— 点击路径的基准时刻 `getAudioTime()` 读到的仍是滞后值
  （实测滞后约 8.6ms），再叠上负向的时序 jitter 就落到零以下，而 AudioParam 的时间参数只收有限非负数；
- 钳位下沉到 `triggerNote` —— 所有发声路径的唯一收口：起点按 `Math.max(startTime, currentTime)` 兜底。
  原先只有乐谱排程在调用点自己钳过（那是调用点各自的义务），用户点击路径从头到尾没有钳位，
  且引擎内只有 `releaseStart` 一处局部兜住了 `linearRamp`，`setValueAtTime` / `start()` 全裸奔。

### 修复 · 侧栏打开和弦的分组后刷新呈现「先变高、再定位」两段变化（2026-09-25）

- 在已展开和弦的分组里刷新，侧栏会先看到折叠面板逐段变高、随后才平滑定位到和弦卡片 —— 同一次刷新
  被拆成两段可见变化，像是先展开、再跳转；
- 成因是分块补挂（`useChunkedMount`，每帧补 12 张卡）与折叠体的高度测量叠在一起：单组全量是百级卡片，
  补挂确实要跨 3~4 帧，而折叠体把每一次内容高度变化都写成带过渡的 px（`vAutoHeight`），于是「补齐」
  被渲染成一段渐次展开；补挂结束后的卡片定位（`.delay-220`）就是第二段变化。补挂机制原本依赖
  「补挂发生在开合过渡未揭示到的行」来藏住这件事，而 `initial-auto` 让载入即展开的折叠体第一帧就是
  自然高度 —— 没有那段过渡可藏，逐批长高当场可见；
- `v-auto-height` 新增 `hold`：挂起期间展开态写 `auto`（跟随内容自然流动、高度不参与过渡，内容出现即到位），
  收起方向不受影响；`BaseCollapse` 透传为 `body-hold`，侧栏分组按 `chunked.isFilling` 接线。
  承载它的 `GroupSection` 同时把这段前提写进挂载门控的注释，避免下次再凭「视觉无感」的旧结论判断。

### 修复 · 审计整改：水合就绪门禁、落盘窗口与菜单键盘（2026-09-25）

- **水合晚到时不再「落盘即清库」，改为与窗口期改动合并**（`chordStore/index.ts`）：窗口期保护原先的处置是
  「跳过覆盖赋值 + 打开写回门禁 + 立即 `persistAll()`」。此刻内存里是「空初值 + 窗口期新建的几条」、磁盘上是
  完整库，而 `chordRepository.save` 的删除判据是「上一次落库镜像里有、本次快照里没有 ⇒ `delete`」—— 镜像刚由
  `load()` 用磁盘快照填满，于是这一次落盘会把磁盘上内存里没有的记录**全部删掉**。改为磁盘快照为底、窗口期
  改动叠加（两者不会撞 id：窗口期内存是空初值，用户只能新建）；顺带认领 `snapshot.mergedIds` —— 磁盘内容
  真的进了内存，那批被读侧清洗丢弃的重复项的重定向映射这才有意义。
  - 判据：**「跳过赋值」与「不落盘」不是同一件事** —— 在按引用 diff 的仓储上，送一份比磁盘少的快照过去，
    等价于下删除指令。
- **启动期云端比对加就绪门禁**（`main.ts` / `syncActions.ts` / 两个 store 新增 `isHydrated()`）：比对读的是两个
  store 的完整内存状态，而 8s 超时兜底只保证「挂载不等水合」、不保证水合已完成 —— 水合未完成时算出的
  `localMd5` 是「空库的校验和」，与云端一比必然不等，于是报出「云端数据较新」，而那个常驻通知上挂着一键
  「拉取云端覆盖本地」。`main.ts` 把真正的 `hydration` 单独留一份引用、比对前 `await` 它；`checkCloudDataChange`
  自身再兜一层 `isHydrated()`（水合读失败时 store 会一直保持未水合，那种情形宁可不比对，也不给出一个会把
  本地数据盖掉的方向判断）。
- **备份导入的勾选先取快照**（`backupModalActions.ts`）：门禁判定与写入（`applyImportSelection`）原先各自现读
  `modalData.importSelection`，而中间隔着 PBKDF2 解密的 `await` 窗口 —— 窗口内新勾上「同步配置」就会带着
  `syncSettings` 写入却跳过了解密校验，用户拿到一个「看起来已导入、实际凭据全是密文」的状态。
- **`replaceAllData` 补广播解绑**（`chordStore/index.ts`）：整表替换掉的和弦 id 全部失效，而乐谱槽位按 id 引用，
  桥接层收不到通知就把死引用留在谱面上 ——「只覆盖和弦、不覆盖乐谱」的云端拉取与备份导入必然走到这一步
  （两处勾选互相独立）。按「被移除的旧 id 集合」发 `emitChordsRemoved`，与 `removeChordsSnapshot` 同一条通道，
  解绑记录照旧进栈。
- **`useStorage` 关掉 `writeDefaults`**（`platform/composables/useStorage.ts`）：`@vueuse` 的 `writeDefaults`
  默认为 true，在「存储里没有该键」时把 initial 写进存储；而 `idbKv` 未水合时 `getItem` 一律返回 null，
  与「键不存在」不可区分 —— 一次伪写入就让 IDB 里的真实配置被默认值覆盖（晚到水合的窗口期保护此时也救不回：
  `dirtyKeys` 早被微批摘空）。关掉之后「从未设置」在存储层保持为「不存在」，读出的值仍由 initial 提供，
  用户可感知行为不变。
- **IDB 自愈段并入统一错误门禁**（`platform/services/storage/idb.ts`）：作废 `dbPromise` 的那一句原先只挂在
  「按声明版本打开」那一支上，自愈段的 `openAt(db.version + 1)` 与「补建后仍有缺口」的抛错都绕过了它 ——
  而这两条恰是磁盘库状态最脏、最需要重试的路径，一次偶发失败同样会毒化整个 tab 的持久化。判据改为
  「凡抛出必作废」，不按分支列举。
- **`idbKv.flushNow` 不再摘掉落盘期间新产生的脏标记**（`platform/services/storage/idbKv.ts`）：事务是 await 的，
  执行期间同一键可能又被 `kvSet` / `kvRemove` 弄脏，而完成后的 `dirtyKeys.delete(key)` 会把它一并抹掉 ——
  新值从此永不落盘（下一轮 flush 见脏集合为空直接 return，`pagehide` 的强制 flush 同样空转），内存与 IDB
  永久分叉。新增 `writeEpoch` 写入代数，只摘除本轮未被再次改写的键；广播同样只发这些键。
- **`mergeTransitionItem` 支持整串输入**（`platform/utils/motion.ts`）：原先只取整串的**首个 token** 当属性名，
  于是 `fadeTransition()` 给的 7 条里其余 6 条既没被替换、又和整串一起被追加进来 —— 重复条目每轮再叠一遍，
  串随调用次数单调膨胀（`applyFadeOffsetInstantly` 一次调用就净增 12 条），而 transition 里同名属性是后一条
  覆盖前一条，实际生效的过渡随时序摇摆。改为按属性名逐条替换。
- **菜单 ↑/↓ 下沉到各层列表**（`platform/ui/menu/`）：↑/↓ 原在 `BaseMenu` 的面板上处理，而它取行元素只能取到
  **顶层**列表的，且子面板经 Teleport 后不在它的 `@keydown` 之内 —— 子面板里按 ↑/↓ 会因「焦点不在顶层行上」
  把焦点弹回顶层第一项（子层的 `MenuItems` 只处理 →）。↑/↓ 随 → 一起下沉到列表根上，各层在自己的行集合里
  循环；`BaseMenu` 只留 Tab 关闭。
- **`getChordDegree` 的 `isDiatonic` 纳入和弦构成音**（`domains/chord/theory/chordDegree.ts`）：原先只看**根音**
  是否落在调内音级，于是「根音在调内、内部却含离调音」的和弦被算作调内 —— C 大调里 E7（G#）、A7（C#）、
  D7（F#）、Fm（Ab）全部报 true，而它们正是副属七与调式借用。音集展开复用识别层的
  `chordQualityAstToIntervals`（不另写一套，避免与扩展堆叠、omit 标记、6 与 13 的同音折叠等口径漂移）；小调
  额外并入**升七级导音**（和声小调），否则 `E7` 在 Am 下会因 G# 被判离调，而它恰是 A 小调最标准的属七；
  升六级（旋律小调）不并入，与根音判据保持同一口径。斜杠低音不参与判定。
- **`shift_frets` 越出品窗的弦改为静音，不再钳到 `fretCount`**（`domains/chord/theory/transpose.ts`）：
  `strings[].fret` 是窗口内**相对**品位（绝对品位 = `fretOffset + fret`），而旧实现只做
  `Math.min(shifted, fretCount)` —— 越界时相对品号被压回、绝对品位却没跟着变，结果是和弦名已按 N 个半音升了、
  实际音高没升；多根弦一起越界时还会**全部塌到同一品**（两个不同的音并成一个）。改为越出 `(0, fretCount]`
  一律静音，与清洗层 `boundFret` 同口径；横按梁同样丢弃而非钳制（钳完会横在错误的品上）。测试随之改写，
  并补一条「只静音越界的那根弦、窗口内的弦保留平移结果」的用例。
  - 判据：收紧品窗只能靠**减列数 + 右移窗口起点**，`Math.min` 压不住绝对音高。
  - 备注：`shift_frets` 全仓无生产调用方（唯一调用点走 `update_name`），属接线即暴露。

### 修复 · 和弦选择器大列表下滚到两端掉帧（2026-09-25）

- **大位移帧把预挂载缓冲收成 0**（`domains/chord/components/ChordPickerPanel.vue`、
  `platform/composables/useRowWindowing.ts`）：行窗口恒为「视口 + 上下各 260px」，而原生平滑滚动的时长与距离
  基本无关（约 30 帧）—— 列表越长每帧位移越大（775 卡下约 1600px/帧），预挂的行下一帧就被甩出视口，那批挂载
  （~0.8ms/张）全白付；每帧挂载数 ≈ 总卡数 / 30，这正是「只在数据量大时、只在滚到顶/底这条长距离路径上」
  掉帧的成因。改为按本帧位移决定缓冲量：位移已吃掉整个缓冲即收成 0（窗口只剩视口本身，约 3 行 ≈ 9 张），
  慢速滚动（滚轮约 100px/帧）恒为 260。
  - 判据：缓冲的语义是「提前挂还没进视口的行」，一帧走两行以上时那些行根本来不及被看见 —— 收掉它观感无变化；
    拖滚动条拇指、快速滚轮甩动与点「滚动到顶部/底部」是同一条路径，一并收下。
  - 同一帧内本函数可能被多处调用（滚动合帧 / 分区变化 / 开关面板），只在 `scrollTop` 真变了才重判 ——
    否则后几次位移为 0，会把刚收缩的窗口又撑回去，等于没收缩。
  - 备注：`useRowWindowing` 的 `overscanPx` 由构造期读一次改为可传函数按帧现读（该模块只有本选择器一个消费方）；
    新增 `tests/platform/useRowWindowing.test.ts` 钉住窗口几何、窗口引用等值守卫与「按帧现读」三条。

### 调整 · 谱面槽位事件改为容器委托（2026-09-25）

- **槽位点击 / 按下 / Delete 上提到行列表容器**（`domains/score/editor/components/ScoreInteractiveArea.vue`、
  `slot/SlotShell.vue`、`slot/ChordSlot.vue`、`slot/AddSlot.vue`）：一行就有二十多个槽、长谱面可达千级，
  逐槽各挂一份 `click` / `pointerdown` / `keydown` 监听器与闭包是纯开销。改为在行列表容器上按
  `[data-slot-key]` 寻址分发（该属性由 SlotShell 挂在槽根，拖拽系统同样按它寻址，故它本身就是寻址契约）；
  落在槽外的目标（行删除钮、FAB、面板）取不到该属性，天然被排除。
  - 判据：可委托的只有「不需要元素身份」的这三类。`v-wave`（涟漪坐标相对元素计算）与 `v-action-card`
    （要把 `role` / `tabindex` 注入到每个元素）都是按元素指令、必须逐元素挂，无法上提。
  - **焦点进出刻意不委托**：它只在焦点真正进出时才触发（不像点击 / 按下那样随交互次数增长），没有委托的
    收益；且它的唯一消费方是添加槽「焦点转交给 + 按钮」这条协议，属槽自己的事。槽壳因此保留
    `focusin` / `focusout` 两个监听器。
  - 顺带收敛：原先槽根同时挂 `@keydown.backspace` 与 `@keydown.delete`，而 Vue 的 `delete` 修饰符本就
    同时匹配 Backspace 与 Delete —— Backspace 会触发两次 `removeSlotChord`（第二次是空操作，撤销历史
    靠 `recordHistory` 的内容去重兜住，无用户可感知后果，但白付一次全量快照克隆）。合并为单个
    `@keydown.delete`。
  - 备注：槽组件不再自持事件策略（`SlotShell` 的 emit 只剩焦点两条、`AddSlot` 无 emit），
    `ChordSlot` 仍保留 `remove` 出口供悬停删除钮使用（该钮自身 `stopPropagation`，不经容器）。

### 调整 · 槽位激活态改由 CSS 表达、拖拽落点检测统一合帧（2026-09-25）

- **槽级激活态从「插槽参数」改为 `group-hover` / `group-focus-within`**（`slot/SlotShell.vue`、
  `slot/ChordSlot.vue`、`slot/AddSlot.vue`）：每个槽根都挂着 `v-wave`，而该指令在 `pointerdown` 里要读
  `getBoundingClientRect` + `getComputedStyle`；只要此刻样式是脏的，这一次读就会迫使浏览器当场把失效的
  样式与布局全部结清。而「指针划过槽」原先是响应式状态驱动的（`useElementHover` → `isActive` → 操作层
  换类），每次划过都写一次 DOM、正好把样式弄脏，且就发生在按下之前 —— 长谱面上实测一次
  `[Violation] Forced reflow while executing JavaScript took 33ms`。
  - 判据：涟漪要保留，就得让它前面那次「写」消失，而不是让它别读。激活态是纯展示，本就该由 CSS 承担。
  - 划过一个槽现在零 DOM 写入；顺带每个内容槽少挂 2 个 pointer 监听器，`SlotShell` 不再需要
    `useElementHover`，也不再自持 `isHovered` / `isFocused` / `isActive` 三个状态。
  - 拖拽中不浮现操作层的抑制随之从 `isActive` 里的 `&& !isDragActive` 移到 CSS：`ChordSlot` 用
    `:global(body.is-global-dragging .char-box .slot-overlay)` 压掉（标记由拖拽系统维护、不在本组件
    子树内；中间垫一层 `.char-box` 是为了拿到 (0,3,1) 压住 `group-hover` 的 (0,3,0)）。
  - ⚠️ **整条选择器必须包进 `:global()`**：写成「`:global(前缀)` + 后缀选择器」时，scoped 插件会把
    后缀整段丢掉 —— 规则退化成 `body.is-global-dragging { opacity: 0; pointer-events: none }`，于是
    拖拽期间被透明化、被禁指针的是整个 `<body>`（整页黑屏，`elementFromPoint` 恒为 null），而不是
    操作层；松手移除 body 上的标记即恢复。同一写法在 `ScoreInteractiveArea` 里也早已存在且一直静默
    失效（`.lyrics-line.is-empty-line` 被丢，`min-height: 116px` 落到了 `body` 上）—— 那条「拖拽时
    纯空行撑高」的设计意图其实从未生效，本轮直接把它移除了（见下）。
  - 添加槽的「+」只有槽级条件改 CSS：行级条件（所在行被悬停 / 本行是落点行）仍是 props 驱动的 `:class`
    —— 它只在进出整行时翻转一次、一行也仅两个添加槽。触屏常驻可见那一档（`.add-slot-idle` + `(hover: none)`
    变体）语义不变，判据从「未激活」收窄为「行级条件不满足」。
- **字形 hover 染色的拖拽抑制改由 CSS 承担，`isDragging` 从行 `v-memo` 依赖里摘掉**
  （`slot/SlotGlyph.vue`、`slot/SlotShell.vue`、`slot/ChordSlot.vue`、`slot/AddSlot.vue`、
  `components/ScoreInteractiveArea.vue`）：`is-drag-active` 原先由宿主逐层转发到字形，等于把
  「全局是否在拖拽」塞进每一行的 memo 依赖 —— 它是全行共享的，起拖 / 松手各让所有已渲染行重渲
  一次（每行二十多个槽，字形类名全改），而这两次重渲换来的一切现在都已由 CSS 表达。改为字形自己
  按 `body:not(.is-global-dragging)` 在 scoped 样式里判定后，这条 prop 链路整段消失
  （`SlotShell` 的 `#char` 不再下发任何插槽参数）。
  - 判据：写成「只在非拖拽时才成立」而不是「拖拽时覆盖回基础色」—— 基础色有 title / muted 两档
    （按 `isSeparator` 二选一），一个 `color` 值表达不了，覆盖式写法还得再引一个标记类才分得清。
- **移除「拖拽期间所有纯空行同时撑高」的规则**（`components/ScoreInteractiveArea.vue`）：它要求整篇
  空行一起撑高，代价是起拖瞬间全篇布局失效（长谱面一次几十毫秒）；而它要解决的「空行也要有落点
  高度」已由槽级 `.is-drop-line` 覆盖 —— 落点行（且只有落点行）的槽撑开成 `min-h-[108px]` 的落位
  目标，空行因此同样有落点高度，撑开范围还严格按行归约。
- **拖拽落点检测两条路径统一并入 rAF 合帧**（`composables/useLyricsDragDrop.ts`）：落点解析都是
  「先读几何、后写状态」，而写入（撑开行 / 落点边框）会让整行样式失效 —— 同步执行等于在指针事件里
  读脏样式。起拖那一次最贵：`startDrag` 刚给 body 挂上 `is-global-dragging`（该标记命中 `& *`，
  整篇样式失效），紧接着就读 `elementFromPoint` / 行与槽矩形，命中测试与几何读取都必须拿到最新布局，
  于是这次强制重排卡在指针事件处理里（内部源实测 ~33ms、外部源 ~36ms，后者逐行逐槽读得更重）。
  - 内部源改走已有的 `scheduleDropTargetUpdate`；**外部拖拽源（选器和弦浮动面板）此前仍是同步调用**，
    本轮补上同一条节流 `scheduleExternalDropTargetUpdate` —— 两条路径的差别只在「怎么找落点」
    （内部源命中测试、外部源几何就近），不在「什么时候找」。起拖与每次 move 都推迟到下一帧，
    与 ghost 位置同一批。
  - 判据：读写拆帧后起拖那一下不再阻塞输入；长按起拖（起拖后可能没有后续 move）也照常拿到初始落点，
    「起拖即松手」不会漏掉这次落点 —— 松手路径现在两条节流都 `flush` 兜底。
  - 顺带修掉一处由此暴露的错派：自动滚动的每帧回调固定走内部源那条更新（`updateDropTarget`），
    外部拖拽一旦滚到边缘就会切回命中测试 —— 指针下方是浮动面板 / 遮罩时命中不到槽位，落点被清空、
    松手无处可落。改为按拖拽源分派（`scheduleDropTargetBySource`），两条路径共用同一个落点状态。
  - 备注：本项改的是「这次布局在哪结清」，不是「要不要结清」—— 起拖那一帧里 body 类名与 ghost 挂载
    都已落地，样式与布局本来就是脏的，这次结清只是从指针事件里挪到 rAF 里，不再卡住输入。

### 修复 · 长乐谱滚动卡顿、「滚动到底部」滚不到底、点下去要等数秒、拖到空档中间不加载（2026-09-25）

- **瘦槽位改为内联渲染，不再挂组件**（`components/ScoreInteractiveArea.vue`、`slot/SlotShell.vue`、
  `slot/SlotGlyph.vue`、新增 `slot/slotStyles.ts`）：这才是「一行约 11ms」的根因。谱面里数量占绝对
  多数的是未绑和弦的普通字符槽（一行二十来个字符就是二十来个槽，长谱面可达数千个），而每个都挂
  `SlotShell` + `SlotGlyph` 两个组件实例，一行合计约 54 个实例、七八十个 DOM 节点 —— 上面那些
  「什么时候挂、一次挂多少」的调整都在这条成本之下绕行，所以拖滚动条一直没真正变快。
  - 改法：瘦槽位在宿主模板里直接内联 `div` + 字形 `span`（3 个节点、0 个组件；原先 4 个节点、
    2 个组件）。可行是因为它需要的一切都不再依赖组件：点击 / 按下 / Delete 已由行列表容器按
    `[data-slot-key]` 委托，hover 与拖拽抑制已由 CSS 承担，落点与面板目标高亮本就是类；
    `v-action-card` / `v-wave` 是全局注册的指令，内联元素照挂；`focusin` / `focusout` 只有添加槽
    用得上（焦点转交给「+」按钮），瘦槽位本就没接。
  - **类名单一来源**（这是内联能被接受的前提）：新增 `slot/slotStyles.ts`，槽根静态类串
    （`SLOT_SHELL_CLASS`）、槽根状态位（`slotShellStateClass`）、落点提示层（`SLOT_DROP_LAYER_CLASS`
    - `slotDropLayerStateClass`）、字形（`SLOT_GLYPH_CLASS` + `slotGlyphColorClass` / `slotGlyphText`）
      全部收在这里，由 `SlotShell` / `SlotGlyph` / 内联瘦槽位三处共用 —— 改槽的留白或状态视觉仍只改
      一处。`is-drop-line-vacant` 的合取（落点行 **且** 空格）也收进 `slotShellStateClass`，
      免得两处各写一遍 `&&`、漏一处就出现「同一个标记两种样子」。
  - 字形「非拖拽时染主题色」那条规则**没有复制**：它是 `SlotGlyph` 的 `:global()` 选择器，而
    `:global()` 整条不带 scoped 属性、本就是全局的 —— 内联字形带同一个 `.char-text` 即命中。
  - 骨架（根 → 落点提示层 → 字形）在两处各自的模板里，是唯一剩下的重复；瘦槽位省掉内容层 ——
    那一层在 `SlotShell` 里只服务指板图卡与「+」，对瘦槽位是个空 `div`，而字形靠自身的 `mt-auto`
    贴底，故布局逐像素不变。
- **离屏行的占位高度从写死的 120px 改为按实测行高分两档下发**（`components/ScoreInteractiveArea.vue`）：
  `.line-row` 靠 `content-visibility: auto` + `contain-intrinsic-size` 做准虚拟化，占位高度是「跳过态」
  下唯一参与布局的数字，而内容总高（`scrollHeight`）直接决定滚动落点。120px 远小于含指板图卡的真实行高
  （约一个指板图的高度 + 字符行），于是离屏行被系统性低估，「滚不到底」由此而来：
  `scrollTo({ top: scrollHeight })` 的目标算不到真实底部。
  - 修法：行高几乎只由「有没有指板图卡」决定（有卡行 ≈ 一个指板图的高度 + 字符行，无卡行只剩字符行），
    两档差着数倍，故分两档（`.is-chord-row` 由行级和弦签名派生）各取**视口内**实测最大值，
    经 `--score-line-height-*` 下发；量到之前退回 120px 兜底。只动高轴，宽轴沿用原值。
  - 只采信视口内的行：`content-visibility` 的行一旦离屏就只报占位高度，拿它当实测值等于把占位锁死在
    自身上 —— 行还没被真实渲染过一次时，测到的正是兜底值本身。
  - 分档取最大值而非取平均：占位偏小会把内容总高压低，而 `scrollTo` 无法越过内容上限去补偿它；
    偏大只会在行进入视口时缩回来一次。两害相权取其轻。
- **「滚动到底部」不再把整份乐谱挂进 DOM，改为「前缀 + 空档 + 尾部」三段窗口**（同上）：这是
  「点个滚动要等这么久」与「像快进」的共同病根。原写法把整份乐谱分帧挂完（每帧 60 行）再落底，
  长乐谱要等好几秒 —— 而用户点的是「滚到底部」，不是「等我把整份乐谱造出来」；那几秒若拿滚动当
  进度反馈（原写法每帧 `scrollToBottom('auto')` 贴一次底），每帧一次瞬时跳转连起来就是一段持续
  数秒的慢速滚动，读到的正是「像快进」。
  - 修法：只补挂**末尾** `TAIL_RENDER_ROWS`(12) 行真实内容，中间未挂载的那一段不产生任何 DOM、
    只按占位高度撑高：`gapHeight` = 该段逐行占位高度之和，经 `gapMarginOf` 挂在尾部首行的
    `margin-top` 上；`visibleLines` 由此变成「前缀 `[0, renderedLineCount)` + 尾部
    `[tailStartIndex, total)`」两段拼接（视口窗口加入后为三段，见下），
    `tailStartIndex = max(renderedLineCount, total - tailLineCount)`。
  - **点下去当帧就开始滚**（窗口切好、`await nextTick()` 后即 `scrollToBottom('smooth')`）：
    这一次滚动本身就是反馈，不再有「先挂完」的那段等待。
  - 空档是这一方案明码标价的代价：中途滚过去的那一段是背景色，落地那一段是真实内容；
    滚动条上段的刻度按占位高度估算，滚到哪补到哪 —— 视口停在哪，那一截就会补上真实内容（见下）。
  - 挂成「尾部首行的 `margin-top`」而不是在两段之间插一个空档元素：行是 `v-memo` 的缓存单元，
    要插兄弟节点就得把整个 `v-for` 包进 `<template>`（整块缩进随之全变），margin 只多一个绑定。
    它在 memo 依赖表里写的是本函数的**返回值** —— 除承载行外恒为 `undefined`，故空档缩短时只有
    承载行与新承载行两行失效，其余行照旧命中缓存。
  - 承载行按 `lineIdx`（位置）判定而不是 `lineId`（内容身份）：同一行在前缀窗口与尾部窗口里保持
    同一个 `lineIdx`（`useScoreLinesData` 按 `lineId` 缓存行数据，render fn 每次都用当前下标重建），
    故这条依赖不会引起额外的失效。
  - 短乐谱上两段直接相接（`renderedLineCount + TAIL_RENDER_ROWS >= total`）⇒ 退回普通的前缀窗口：
    那时 DOM 里本来就是整份乐谱，没有空档可言，滚动全程是真实内容。
- **补挂改由「视口的位置」驱动**（同上）：原滚动兜底（`handleScroll`，剩余可滚距离小于
  `SCROLL_PRELOAD_THRESHOLD_PX`(800) 即扩容）的触发条件是「接近**容器**底部」，而空档存在时容器的
  底部是尾部（或视口窗口）的底部、与前缀无关，照旧走会把前缀挂到不需要的位置上。
  - 新增 `expandGap`：逐段累加占位高度走出「哪几行是空档、空档的上下沿在哪」，把与「视口 + 上下
    预加载窗口」相交的那一截补成真实行（`fillGapAtViewport`）。位置用估算而非量 DOM：已挂载的行
    也按占位高度算，与空档高度的算法同源，两套数才不会互相漂移。
  - **一次补够覆盖视口，而不是每帧补一批。** 一批只有 `RENDER_BATCH_SIZE`(10) 行，视口一旦与空档
    相交，下一帧它多半还在相交区里，于是每帧再补一批 —— 每批都是一次挂载长任务，连起来就是
    「拖着滚动条一路卡」。改为按占位高度逐行累加（两档高度差着数倍，不能拿平均行高去除）补到
    「视口外沿 + 预加载窗口」全落在真实行上，这个方向才算补完。
  - 补出来的这一截与前缀 / 尾部相接就并进去（不留空档），否则成为**视口窗口**（见下一条）。
  - 至多两段空档可能与视口相交（视口横跨视口窗口的上下沿时），故跑两趟；每趟挂完布局都会变，
    所以每趟都按当前布局重算。
  - `expandNextBatch`（扩容哨兵与滚动兜底共用的那条路径）在空档存在期间一律让路：否则它会按
    「容器底部」再插一批，与 `expandGap` 抢挂；会话进行中（`isExpandingToBottom`）同样让路 ——
    补挂会改内容高度、把滚动目标挪走。
  - 扩容哨兵在空档存在期间不挂（`v-if="!hasGap && …"`）：那时尾部已含真实末尾、视口窗口更是悬在
    谱面中间，哨兵的位置与「前缀的末尾」不再对应，命中它只会把前缀挂到不需要的位置上。
  - 切歌（`onActivated` 的切歌分支与 `activeSongId` 的 watch）与行数收缩（`total` 的 watch）都要把
    `tailLineCount` 与 `viewportWindow` 归零：前者否则会把上一首歌的空档带进新歌，后者否则会让
    两段之和超过总行数、空档高度算成负数。
- **拖滚动条时不再每帧补挂，改为「大位移帧跳过、停下后补一次」**（同上）：这是「拖滚动条一直卡」的
  直接来源。原滚动兜底只看「剩余可滚距离 < `SCROLL_PRELOAD_THRESHOLD_PX`(800)」，而拖滚动条拇指时
  每帧都满足 —— 每帧补一批 10 行，每批都是一次含指板图卡的挂载长任务，连起来就是整段拖拽期间持续掉帧。
  - 判据：补挂的语义是「提前挂还没进视口的行」，一帧走掉整个预加载窗口（`SCROLL_BULK_DELTA_PX` =
    `VIEWPORT_PRELOAD_PX`(400)）时，本帧挂进去的行下一帧就在视口外了 —— 提前量当场作废，白付一次挂载。
    正常滚轮（约 100px/帧）与触摸板惯性都远低于该值，不会误伤。
  - 跳过的补挂不能没人收口：`scroll` 只在滚动期间派发、停下之后不再来一发，故补一条
    `scheduleExpandOnScrollSettle` —— rAF 轮询「连续两帧 `scrollTop` 不变」当作停下，再按当前视口
    位置补一次（与落底补底同口径，同样不引 `scrollend`；本处生命周期也完全自持）。
  - 停下那一帧位移为 0，不会再被判成大位移帧，故「跳过 → 停下 → 补上」是一条闭环。
  - 会话与采样点随之收敛：`cancelSettleExpand` 挂进失活 / 卸载；切歌（`onActivated` 的切歌分支与
    `activeSongId` 的 watch）把 `lastScrollTop` 归零 —— 新歌的 `scrollTop` 与上一首没有可比性，
    留着会让第一帧被误判成大位移帧。
- **落底后仍要补底**（同上）：落底会把底部那批行「点亮」成实测高度、把内容总高继续顶高，而 `scrollTo`
  的 top 在发起那一刻就被钳死 ⇒ 必然停在半路。故「落一次 → 等它停稳 → 仍未贴底就再落一次」，
  上限 4 轮、贴底余量 6px（与 `useSectionScrollSpy` 同口径）。
  - **空档存在期间冻结占位高度，落底全程只量一次行高**（建尾部窗口之前那一次）：空档高度是「空档里
    逐行占位高度之和」，几百行会把任何一点变化放大成几千像素 —— 而落底目标（`scrollHeight`）正由它
    决定。原先每轮落底前重量一次，等于一边滚一边把目标挪走：量到的新值一旦更大，`scrollHeight` 当场
    涨出几屏 ⇒ `remaining > clientHeight` ⇒ 走瞬时落底，观感正是「一点就瞬间到底部」。故
    `measureLineRowHeights` 在空档存在期间（`hasGap`）不写回 `lineRowHeights`，空档消失后才恢复更新
    （分档采样本身照旧返回，首屏补齐估算不受影响）。
  - 补底一律平滑滚动，不再有「跨度超过一屏就瞬时落底」那一档：既然目标不再中途漂移，就不必用瞬时
    跳转去「补估算差」，一屏内外同一条路径。取 `'smooth'` 而非 `'auto'` / `'instant'` —— 后两者是
    瞬跳，而用户否掉的正是「瞬间到底」。
  - 「停稳」判定用 rAF 轮询，不引 `scrollend`：本处只在滚动会话内跑、生命周期完全自持。判据是
    **「本轮确实见过位移」且「连续两帧 `scrollTop` 不变」** —— 少了前者，平滑滚动刚发起、`scrollTop`
    还没变的头几帧就会被当成停稳，当场补一次跳转，同样读作「一点就瞬间到底部」；少了后者则会在滚动
    途中反复重发 `scrollTo`，不断重置平滑滚动的进度。
  - **「已贴底」判据排在停稳判定之前**：真正在底部时压根不会有位移，等不到「见过位移」这一步，
    否则会在贴底处白跑满 4 轮。
  - 会话管理顺带收敛：结束路径抽出 `finishExpandToBottom`，`cancelExpandToBottom` 复用它，
    切歌 / 失活 / 卸载仍能打断补底并落定 Promise。
  - `isExpandingToBottom` 仍用普通变量而非 `ref`（它只在循环内部被读写、不驱动任何渲染），
    但声明提到了全部消费方之前 —— 扩容哨兵与滚动兜底都排在会话逻辑之前，却都要按它让路。
- **视口落进空档里时，把视口那一截补成真实行**（同上）：三段窗口只能表达「从头挂到 R」与「挂末尾
  T 行」，视口落在空档中间时**两侧都够不着** —— 拖滚动条到中间就永远是一片空白。这是上一版方案的
  直接漏洞：它把「视口整体落在空档里」当成「补了也够不着、白付一次挂载」，于是那一段被钉死为空白。
  - 新增**视口窗口**：布局变成「前缀 + 空档 + 视口窗口 + 空档 + 尾部」，至多两段空档，视口落在哪
    都能有真实内容，与普通虚拟列表同构。补的量只按「视口 + 上下预加载窗口」算，与视口在空档里陷得
    多深无关 —— 拖到空档正中间也只挂一屏多，不会把从空档上沿到视口那几百行一起挂进来（那正是
    「拖着滚动条一路卡」的老病根）。
  - 只保留一段：新窗口与旧窗口相接（含恰好相邻）就取并集，同一段空档里来回滚不反复拆挂；不相接时
    旧窗口被替换掉（它的行已离视口很远）。
  - 空档判据统一为 `hasGap`（尾部窗口 **或** 视口窗口），占位高度冻结、扩容哨兵是否挂载、
    `expandNextBatch` 是否让路、以及 `ensureSufficientRenderedLines` 的前缀上限全部改按它判 ——
    前缀不能长过视口窗口的起点，否则同一行会在 `visibleLines` 里出现两次（重复 key）。
  - 「滚动到底部」建窗口前先清掉视口窗口：它与尾部窗口互斥，留着会把空档切成两段、落底目标算不准。
- 实测行高的量法随之扩成 `measureLineRowHeights`（一次扫描同时给出首行高度与两档最大值），
  首屏补齐估算沿用「首个已渲染行」的旧口径不变 —— 那里要的是「填满视口」，与占位高度取最大值的取向相反。

### 修复 · 菜单项无障碍形态、行内和弦刷新、水合撤销与页脚层回收（2026-09-25）

- **菜单行不再对普通项谎报形态**（`platform/ui/menu/MenuRow.vue`）：`aria-checked` / `aria-expanded`
  原先无守卫，`false` 会被渲成 `aria-checked="false"` / `aria-expanded="false"`，于是每个叶子菜单项都被
  读屏念成「可勾选 / 可展开」。改为只在该状态确实存在时下发 —— `aria-expanded` 与 `aria-haspopup`
  同取 `hasPopup` 这道闸（两者都由级联触发器 `MenuSubmenu` 下发）。
- **谱面字符槽上的和弦被编辑后，行内不再停在旧内容**（`score/editor/components/ScoreInteractiveArea.vue`）：
  行级和弦签名原先只含绑定 id，而「改和弦库里的和弦内容」既不会换 `chordMap` 引用、也不会换字符槽那侧的
  `lineData.chars` 引用，于是全部 `v-memo` 依赖原样命中 ⇒ 该行不重渲染 ⇒ 槽位上的和弦名停在旧值。
  签名并入「指纹 + 横按」后，与渲染侧的两处同口径实现（`scoreExportCanvas` 的边和弦缓存签名、
  `scoreLineFingerprints`）对齐。
- **水合晚到的合并分支补上撤销收尾**（`chord/store/chordStore/index.ts`）：与正常水合分支同一套
  `pause / commit / clear`。少了它，合并赋值本身会被记成撤销点，且 last 快照仍停在初值 `[]` ——
  用户此后第一次点撤销就退回空库（内存层整库消失，随后落盘即真删）。
- **被覆盖的那一格页脚合成层回收 `object URL`**（`score/preview/components/ScorePreviewPane.vue`）：
  与 `writePage` 的覆盖分支同口径。页脚层的 URL 只在「被替换」与「条目被驱逐 / 被丢弃」两个时机回收，
  而被换掉的那个从此无人引用，也就再没有回收时机。
- **抽屉与浮动面板补无标题时的兜底可及名**（`platform/ui/drawer/BaseDrawer.vue`、
  `platform/ui/floating-panel/BaseFloatingPanel.vue`）：与 `BaseModal` 同构 —— 有标题走 `aria-labelledby`，
  无标题给出兜底名。浮动面板的 `aria-labelledby` 同时改由「确实有标题」决定，不再在只挂了
  `header-extra` 与关闭钮时指向并不存在的标题节点。
- **区间滑块 1 号拇指的数值气泡与 0 号同口径**（`platform/ui/slider/BaseSlider.vue`）：补齐 `compact.manual`
  —— 缺 `manual` 时气泡由悬停自行显隐，`showTooltip: 'never'` 对这一侧失效，紧凑观感也与另一拇指不一致。

### 修复 · 和弦分析候选列表「整表切换闪现」：位移交还 FLIP、宽度变化瞬时（2026-09-25）

- 现象（`chord/workbench/components/ChordAnalysisPanel.vue`）：换和弦 / 改音时候选名单几乎整表切换，观感是
  **起手闪一下**；简写开关切换时则**看不出平移**。
- 根因：这段位移被**两套机制同时动画**，而两者算的是**同一段位移**。
  - 候选徽章（`BaseBadge` 根）本来就挂着 `v-auto-width`（内容宽度变化时用 WAAPI 把 `width` 从旧值补到新值）——
    它补的是**布局输入**：宽度逐帧变、flex 逐帧重排，后面各格的 `left` 本来就是补间的*结果*；
  - 而本列表的 TransitionGroup 又叠了一层 FLIP：`applyTranslation` 按**一次性的新旧 rect 差**写死
    `transform`。几何是 `rendered = 旧左 − Δ + 2pΔ`（Δ = 新左 − 旧左，p = 补间进度）：**起手先朝反方向弹开
    |Δ|，再横滑两倍距离**，所以是「闪一下」而不是「滑过去」。
  - 还有第二层打架：WAAPI 宽度动画在起步瞬间的当前值仍等于旧宽（`composite: replace` 覆盖实时宽度），
    FLIP 在 `onUpdated` 里量到的 rect 差因此约等于 0、位移过渡根本不触发；而补间随后又把 FLIP 刚钉住的
    布局逐帧推开 —— 两者同时开等于白开，还多一层每帧强制布局。
- 修法：**位移只留给 FLIP，宽度变化瞬时生效**（反过来的形态试过、已推翻，见下）。
  - 恢复 TransitionGroup 的 FLIP：去掉 `move-class="v-transition-list-move-off"` 与组件内那条
    `transition: none` 的 scoped 规则，回到全局 `.v-transition-list-move`（`transform $duration-base
$bezier-sidebar`，`transitions.scss` 第 6 节）。FLIP 量的是 rect 差，跨行也只是一段更大的位移量，
    一样走 transform 过渡 —— 换行不再有例外。
  - `BaseBadge` 新增 `autoWidth`（默认 `true`）：本列表传 `:auto-width="false"`，宽度变化瞬时生效。
    这个开关存在的唯一理由就是上面那条互斥 —— 宽度是布局输入，与 FLIP 是同一段位移的两种记法。
  - `:key` 仍取**位次**：整表切换退化成**内容就地更新**，元素身份不变，FLIP 才有「同一个元素从旧位滑到
    新位」可谈；否则旧元素离场、新元素入场，位移无从补间。
- **为什么不能只留宽度补间**（上一版的形态，本轮推翻）：`flex-wrap` 的换行点是**离散**的 —— 宽度补间
  跨过某一步时，某一格会整体跳到下一行，这一跳不受补间控制，观感是「别的格都平滑、偏偏它闪一下」；
  且补间期间文字已换成新名、盒子还是旧宽，长名会被 `overflow-hidden` 裁掉一截。FLIP 没有这两个问题。
- 有意保留 / 有意接受：条数增减仍走 enter / leave（尾部若干格，scale + opacity，类仍取第 6 节）；
  同一格内是内容就地替换，不做淡入淡出；**徽标自身宽度是瞬时变化**（那一格会「啪」地变宽 / 变窄），
  而紧随其后的各格由 FLIP 平滑推开 —— 观感上的「挤压」是平滑的，瞬时的只是那一格自己的盒子。
- 一并否掉了 `@formkit/auto-animate`（曾考虑用它替换 TransitionGroup）：它的 MutationObserver
  **只监听 `{ childList: true }`**，而位次 key 的整表切换是同元素就地改文本、**不产生任何 childList 变动** ——
  实测该档动画属性清单为**空**、峰值 0 条、位移行程 0.00px（位置在同一帧内跳完），即「接上等于没接」。
  要让它动只能改回按名 key，可那样每格都是新元素、没有「旧宽 → 新宽」可补，**宽度补间整个失效**，
  它只补出约 1px 的 `scale(0.98 → 1)` 加淡入、布局转为硬切 —— 严格劣于本条修法。
- 验证：jsdom 无布局、不投递 ResizeObserver、不推进 WAAPI，测试质量红线（`rules/06-test-quality-and-self-check.md` 的「一」第 1 条）又禁止断言 CSS 类名与内联样式，故动画观感
  只能上真机。做法：同构最小页（外壳无过渡 / 内容自适应胶囊 / `flex-wrap`）四个变体，每个都是「10 条候选
  整表换名」，无头 Chrome + CDP 逐帧量 `[left, width]` 与 `document.getAnimations()` 的属性清单，采样 733ms、
  等效 60fps。`prefers-reduced-motion` 须显式压成 `no-preference` 并写进报告留痕 —— 需要自禁用规避的那类库
  默认值下会测出假阴性。**宽度补间那一档实测动画属性集合只有 `width`、不含 `transform`**，即那条路上位移
  确实只由一个驱动源产生；本轮换成的 FLIP 由 `.v-transition-list-move` 的 transform 声明承接
  （`hasCSSTransform` 只判「带 move 类的子项有没有 transform 过渡」），观感仍以真机为准。
- 试过又推翻的两条路（留个记录，免得下次再走一遍）：
  - **等宽 grid**（`grid-cols-[repeat(auto-fill,minmax(3rem,1fr))]` + 壳子 `min-w-0 justify-center` +
    胶囊 `max-w-full min-w-0`）：理论上确实能两全 —— 列数与格宽都只由容器宽决定、与内容无关，于是
    「换行点离散」与「补间推动兄弟」两条冲突一起消失，宽度补间与 FLIP 都能留。**但观感太丑**：胶囊不再随
    名字长短收窄、短名也占满整格，窄面板下长名还被省略号截断 —— 已按用户判断整体回退，不要再改回来。
  - **关掉 FLIP、只留宽度补间**（更早的一版）：栽在 `flex-wrap` 的换行点上，即上面那条「为什么不能只留
    宽度补间」。
