### 调整 · 滚动条轨道常驻可命中、悬停即显形，拇指随轨道悬停高亮（2026-09-25）

- 交互契约改为（`platform/directives/vScrollbar/vScrollbar.scss`）：默认两者都不显示；悬停滚动容器时
  **拇指**显形；悬停**轨道区域**时轨道显形且拇指高亮；悬停**拇指**时轨道显形且拇指高亮；
- 关键一处：轨道隐藏态原先写的是 `pointer-events:none`，于是「悬停轨道」这条路径**根本不可达** ——
  元素收不到指针事件，`createAxisOverlays` 里挂在轨道上的 `mouseenter` 永远不触发，轨道只能靠悬停拇指
  间接触发。现改为默认 `pointer-events:auto`（即「轨道区域始终占位」）：隐藏态就是一条透明的可命中条
  （命中测试不看 `opacity`，不像 `visibility:hidden`），指针落到其上即由指令显形；
- 外扩热区（`::after`）分两档，两档特异性相同（都是「类 + 伪元素」），靠书写顺序让可见态那条胜出：
  **常驻档**只向容器边缘侧与沿长度两端各外扩 `HIT_AREA`、**绝不向内**；**显形后**再补成四向
  （`&--visible::after`）—— 后者是给已经找到滚动条的人放宽的点击余量，此时向内扩无碍（指针已在滚动条上，
  不会误伤内容点击）；前者补的正是边缘侧那条 `EDGE_OFFSET` 视觉间隙（`HIT_AREA` 与 `EDGE_OFFSET` 同值，
  扩一圈恰好覆盖）。这一档必须常驻：轨道只有 `THICKNESS` 宽又内缩 `EDGE_OFFSET`，若不常驻补，指针落在
  最外侧那几像素上就命中不到轨道 —— 而轨道显形只能由「悬停轨道 / 拇指」触发，于是命中带在隐藏时只有
  6px、显形后才是 14px，形成滞回：同一处边缘时灵时不灵（用户实测的「移到最右侧偶尔不显示轨道」）；
- 向内始终不补：那会在容器内缘多出一条常驻拦截带，点击与滚轮都落不到内容上（旧实现探针实测命中内缘 2~13px）；
- 拇指高亮在「悬停轨道」时也要亮：触发者是**兄弟**节点，而拇指在文档序里排在轨道**前面**
  （overlay 创建顺序决定），`~` 只能向后匹配、够不到「后面的兄弟被悬停」，故从共同父元素（overlay 挂载层）
  用 `:has(> .v-scrollbar-track--y:hover)` 反向匹配。两种情况共用同一条声明：高亮底色 + 向容器内侧加宽
  1px，轨道由既有的 `thumb:hover ~ track` 与自身 `:hover` 同步加宽，两者保持同心；
- 轨道显形**按轴隔离**（`scrollbarCore` 的 `setTracksVisible` 由「两轴一起切」改为按轴切）：此前它对
  `tracks.y` / `tracks.x` 一并 toggle，双轴都有溢出时悬停纵向轨道会把横向轨道也点亮 —— 指针只碰到一条、
  另一条却跟着淡入，即用户实测的「轨道 hover 高亮联动了另一条轴」。现只切被悬停的那一轴（调用点本就
  按轴注册，`axis` 现成），另一轴保持原状。拇指不需要同样处理：它的悬停高亮与加宽分别写在 `--y` /
  `--x` 两条规则里，天然不跨轴；
- 拇指隐藏态仍是 `pointer-events:none`，理由更新为「它那条命中区已被下方常驻可命中的轨道整段覆盖
  （同心、且拇指自己的 `::after` 随 `pointer-events:none` 一并失效），不需要靠可命中来被找到；
  它层级在轨道之上，保持不可命中就能让常驻的那条透明带始终由轨道这一层应答」；
- 如实记下占位的代价：容器右缘起 `THICKNESS + EDGE_OFFSET` 那一条（即上面那条常驻命中带）从此归滚动条
  —— 落在其上的点击按 `trackClick` 走翻页/跳转、不再穿透到内容，滚轮也改由 overlay 的转发链路接手
  （overlay 是兄弟节点，真实事件的祖先链里没有宿主，这条链路本就是这个场景的兜底）。这是「占位」的
  字面含义，不是疏漏；唯一例外是 `trackClick:'none'`：指令内联 `pointer-events:none`（纯视觉轨道
  不接受悬停显形），内联优先于类规则；
- 无溢出的轴不受影响：几何刷新仍写 `display:none`，那一条不参与命中测试。

### 调整 · 容器几何变化时滚动条位移改走平滑过渡（2026-09-25）

- 现象：拖动窗口 / 展开收起面板使滚动容器尺寸变化时，拇指的长度有过渡、**位置却瞬移**，看着像被掰了一下；
- 成因：位移属性（`top` / `left`）与长度不同 —— 它同时承载两种变化，而两者的期望相反：几何变化该平滑挪过去，
  滚动位置变化必须瞬时（那是最高频路径，给它加过渡会让拇指滞后于内容）。故它一直**刻意**不在
  `transition` 列表里，只有长度那两档在；
- 修法：时长不写进列表，改成一个**按元素切换的 CSS 变量** `--v-scrollbar-shift-duration`
  （SCSS 里以 `var(…, 0s)` 消费，缺省即位移不过渡，行为与加它之前逐值一致）。指令按刷新来源切换：
  几何路径（`ResizeObserver` / `MutationObserver` 共用的 `scheduleRefresh`）置为 150ms，滚动路径
  （宿主的 `scroll` 监听）置回 0s。两条路都在 `refreshAll` 之前写变量 —— 变量与位移的写入要落在同一次
  样式计算上，过渡时长才是新的那个；
- 时长与长度那两档 150ms **同值**（TS 的 `SHIFT_DURATION_MS`）：不同值会让长度先到位、位移后到；
- 该变量**不进** `ensureGlobalStyle` 的 `:root` 注入：那三个是常量，这个是开关，而且必须按元素写
  —— 多个滚动宿主可以共用同一个 overlay 父元素（见 `overlayPositionOwners`），写到父元素上会互相串。
  轨道与拇指都吃这个开关；
- 气泡不在此列（它的落点由拇指中位算出、只在滚动前后短暂可见）。若容器恰在那段残留窗口内变化，
  拇指会平滑挪、气泡会跳一下 —— 已知的窄窗口不一致，未处理；
- 滚到底后内容增长触发 `scrollTop` 钳位时，位移仍走瞬时：滚动事件先到并关掉了开关。那一格滚动位置
  真的变了，瞬时才是对的。

### 修复 · 和弦文本解析把尾随换行判成非法字段（2026-09-26）

- 现象：粘贴一份带尾随换行的和弦文本，解析直接失败（`INVALID_FIELD`）。字段循环对 `idx <= 0`
  一律报错，而 `text.split('\n')` 会为尾随换行产出一个末尾空串 —— 那个空串既不是字段、也不代表损坏；
- 触发路径真实可达：纯文本载体传进来的正是**未 trim 的原文**（`platform/utils/transfer.ts` 对
  `carrier: 'plain'` 返回 `raw`），复制 / 粘贴 / 文本编辑器保存都会带上尾换行；
- 改为跳过空行（`if (!line.trim()) continue;`）。**非空但缺 `KEY:` 形态的坏行仍然照常报错** ——
  豁免只针对空行，没有放宽真正的损坏（已加用例钉住这一条）。

### 修复 · 浮层层号可能重复，导致「置顶」静默失效（2026-09-26）

- `acquireFloatingZ(ceiling)` 取 `Math.min(max + 1, ceiling, CEILING)`，而 ceiling 是调用方传的
  「打开中的直接后代的最低层号 - 1」—— 它表达的是**上界**，不是空闲位，完全可能正好等于另一个浮层
  已占用的号。两个浮层并列后 z-index 退回 DOM 顺序裁决（父面板的 bring-to-front 静默失效），
  且任一先释放就把这个共享号从集合里摘掉，另一个还在用；
- 复现交错：父面板 P、与 P 同级的 E、P 内部打开的子浮层 C；P 置顶时 ceiling = C 的层号 - 1 = E 的层号
  ⇒ P 与 E 同号；
- 改为从候选向下让到最近的空闲位；极端情况下方全满（上千并发浮层）则退回 `max + 1` ——
  宁可反超子浮层，也不并列。

### 修复 · 全量覆盖乐谱时，扫描窗口内新建的歌被误判为孤立记录（2026-09-26）

- `songStore.overwriteSongs` 用 `await listSongIds()` **之前**取定的 `newIds` 判定孤儿记录，
  于是 await 窗口内新建并已落盘的歌不在 `newIds` 里，被判孤儿 → `markSongRemoved` →
  `flushSongsNow` 删掉它的存储记录，而它仍在 `songs.value` 中：内存有、库没有，刷新即丢歌；
- 触发条件真实存在：后台同步 pull 与备份导入都是 fire-and-forget，与用户新建乐谱并发即命中；
- 改为在扫描**返回之后**才取存活判据（`newIds` ∪ 当前内存），并用扫描到的键集做差。

### 修复 · 迁移转录的歌曲写回未按 updatedAt 合并（2026-09-26）

- 歌曲写回走 `songRepository.flushChanges({ dirtySongs })`，而它对 dirtySongs 是**无条件 put**
  （不是按引用 diff）。转录是「任一道守门失败即保留 localStorage、下次启动重试」的设计，同一份快照
  会被反复写回 ⇒ 直接写回必然把「上次转录之后用户改过的乐谱」整条回退，而回读核验只看数量与主键
  存在性、察觉不到内容回退。和弦侧早已按 updatedAt 合并（`mergeByUpdatedAt`），歌曲侧漏了；
- 补齐同一套合并（写回前先 `loadSongs()` 再按 updatedAt 取新）；
- **如实记下未覆盖的缺口**：快照里**缺失** `updatedAt` 时，宽松清洗会把它填成「现在」
  （`fillMissingTimestamps` 的既有行为），于是陈旧快照恒为「最新」、合并拦不住 —— 实测写回的记录
  时间戳即 `Date.now()`。这一条对和弦侧同样成立，属**既有缺口**，需要先决定「哪条路径允许凭空生成
  时间戳」才能动，本次未改。

### 修复 · 水合去重映射在「装配早于水合」时丢失（2026-09-26）

- `chordStore` 把「水合期去重丢弃的重复项 → 保留项」映射暂存为一次性值，唯一消费方
  `chordScoreBridge` 在**装配时同步取一次**。而装配并不保证晚于水合：`main.ts` 给水合设了 8s 兜底
  超时，超时即挂载 ⇒ 桥接取到 null，之后水合写入的映射再无人消费，被去重丢弃的和弦 id 在乐谱槽位里
  留成死引用；
- 改为在桥接里再等一次两个 store 的 `hydrate()`（两者都幂等：已水合即返回、进行中返回同一 promise），
  等齐之后才消费 —— 乐谱侧若还没数据，`remapChordBindings` 会打在空列表上等于没做，槽位照样是死引用。

### 修复 · 分区滚动高亮的 scroll 监听在容器重建后漏摘（2026-09-26）

- `useSectionScrollSpy` 的 `activate` / `stop` 各自现取 `options.getScroller()` 挂 / 摘 `scroll` 监听，
  而该容器**可能被 v-if 重建** ⇒ 摘除落到新元素上（那里本就没有监听），旧元素上的监听永久留下
  （泄漏 + 未来误触发）。同文件已为 `scrollend` 用 `frozenScroller` 修好这条，`scroll` 这条没同步；
- 改为记住挂载时的那个元素、从同一个元素摘除；并补 `onScopeDispose(stop)` 兜底（幂等，与宿主的
  显式 `stop` / `deactivate` 不冲突）。

### 修复 · 性能基准的基线哨兵静默失效（2026-09-26）

- `scripts/bench-baseline.json` 把 `getActiveBaseStrings` 记成 `0`，而比对分支
  `typeof base !== 'number' || base <= 0` 直接打「新增，无基线可比」并跳过 ⇒ 该项被基线宣称覆盖却
  **永不拦截**。根因是打印精度：该指标单次耗时低于 `toFixed(4)`，被打印成 `0.0000`；
- 跑数打印精度提到 6 位；并把「基线为 0 / 非正」从「无基线可比」里拆出来**计失败**并指向重录 ——
  与同文件对「基线里有、本次没跑到」的既有口径一致（那条注释已明确：别让它悄悄少守一项）；
- 需要你跑一次 `pnpm bench:baseline` 重录基线，这条哨兵才真正生效。

### 修复 · 全量审查整改第二批（2026-09-26）

- **水合读失败被当成「本地无乐谱」**（`songPersistence.ts` / `songStore.ts`）：设计口径写在两处
  （`2026-09-25-1605` 的变更日志、`syncActions.ts` 的就绪门禁注释）—— 读失败时 store 应保持未水合。
  而 `loadInitialSongs` 吞掉异常返回 `[]`，于是调用方无从区分「读失败」与「库本来就是空的」，
  `hydrated` 照样置位。启动期云端比对与同步动作的就绪门禁都以 `isHydrated()` 为准，把读失败当成
  「本地为空」，给出的正是那个「云端较新、可一键覆盖本地」的方向判断。改为读失败返回 `null`、
  `hydrate` 见 `null` 即保持未水合（可重试）；
- **`setSynthVolume` 缺有限性守卫**（`synthEngine.ts`）：与 `setReverbWet` 同源的问题 —— 非法值流进
  Web Audio 会让 `gain.value = NaN` 当场抛错，而调用点落在自己的 try/catch 之外，
  `isScorePlaying` 停在 true、UI 永久卡「播放中」；
- **`v-auto-height` 禁用时不交出内联高度**（`vAutoHeight.ts`）：契约是「禁用时不接管容器
  `style.height`」，而留着上一帧写下的内联 `height:Npx` 就等于仍在接管 —— 容器被钉死在那个像素
  高度，此后内容增删不再自适应。改为禁用时移除内联高度并复位已测值；
- **`ø7` 的正则交替顺序错**（`chordSearch.ts`）：`/ø|ø7/` 里 `ø` 先命中，`cø7` 被拆成
  `m7b5` + 残留的 `7` ⇒ 变体成了 `cm7b57`（脏数据）。alias 里的 `ø7` 简写把误匹配挡在了外面，
  所以症状一直没暴露。改为长的先匹配；
- **`resolveComponentWidth` 用 `in` 查表**（`constants.ts`）：`in` 走原型链，宽度传 `'toString'`
  / `'constructor'` 这类与 `Object.prototype` 同名的串会命中继承属性，返回一个函数当尺寸值。
  改为自身属性判据；
- **`useRafThrottle` 在 effectScope 内不注册回收**（`useRafThrottle.ts`）：原先只认
  `getCurrentInstance()`，Pinia setup / 手动 scope 里没有组件实例 ⇒ rAF 永不取消。补
  `onScopeDispose`（与 `useChunkedMount` / `useScrollMemory` 口径一致）；
- **`guidance:check` 对残留副本恒绿**（`build-guidance.mjs`）：改名 / 删除 `rules/NN-*.md` 后重生成，
  生成器按约定只写不删（该目录允许放注入探针），旧副本会一直留着 —— 而宿主 rules 通道是**整目录
  注入**，那份已不存在的准则仍会被注入给每个 Agent。现两侧都点名：`--check` 见到残留即失败，
  `build` 打 warn 并提示手工删除。只认准则副本的命名约定，探针不受影响；
- **`scorePreviewCache.test.ts` 写死 48**（两处）：同文件另一条用例已从模块取 `CACHE_MAX`，
  写死会让上限调大后循环不再触发驱逐、断言静默失效 —— 属项目明令禁止的「写死字面量脆弱测试」。

### 修复 · 该封在平台 / 组件里的跨边界实现收回（2026-09-26）

审查「哪些逻辑应下沉却在业务层实现」后落地的三处（都是**跨边界**问题，不是审美调整）：

- **全局拖拽类名双写**（`useLyricsDragDrop.ts`）：`is-global-dragging` 在平台有导出常量
  （`useSortableList/constants.ts`，注释写明「供各处拖拽共用」），而乐谱槽位拖拽三处直接写字面量。
  两边各写时改名**不会报错**，只会静默失配 —— 该标记对应 `main.scss` 里按类名匹配的光标与文本选择抑制，
  失配后拖拽期间光标照旧是 I 形、文本仍可被选中，且没有任何提示。现从 `useSortableList` 的 barrel
  引用同一份常量（barrel 一并把该常量对外，避免域侧深引组合式子模块）；
- **主题换装读取归主题模块**（`fretboardCanvasPalette.ts` / `useTheme.ts`）：调色板为「在指定主题下取
  配色」直接改写 `<html>` 的 `data-theme` 与 `.dark` 再复原。那是 `useTheme` 的状态（`apply` 是唯一
  写入方），别处改写一旦 `read` 抛错或中途早退，整个应用会停在导出用的那份配色上 —— 原来只靠调用点
  自己的 `try/finally` 兜。新增 `withThemeForRead(mode, read)` 承担换装 + **无条件复原**，调色板只传一个
  读回调；补 `tests/ui/composables/withThemeForRead.test.ts` 钉住复原契约（含读取抛错路径与
  「原本无 `data-theme` 时复原成无该属性」）。该用例属 ui 工程（依赖 DOM），故放在 `tests/ui/composables/`；
- **ghost 纵向偏移提为具名常量**（`useDragGhost.ts`）：`pos.y - 20` 在首帧定位与逐帧跟随两处硬编码，
  且读不出它是什么量。提为 `GHOST_POINTER_OFFSET_Y` 并写明是**视觉常量、刻意不按 ghost 高度推算**，
  只负责「别挡指针」，两处共用一处可改。

审查中另有两条**不成立**、故未改：`SongSection.vue` 的 `isBulkReplacing` / `bulkReplaceToken` 看着像
模块作用域，实际在 `<script setup>` 顶层 —— 那是 setup 作用域、每实例一份，不存在多实例互踩；
`ChordPickerPanel` 的 `getStickyHeadPx()` 也不与 `useStickyHeads` 重叠：后者按选择器收头是为了算
**吸附中那个头**的高度喂羽化内缩，前者要的是**首个头**在调用当刻的高度喂滚动定位，两者语义不同，
强行合并会把两件事耦在一起。

### 调整 · 拖拽手势原语下沉平台，rem→px 与根字号收敛（2026-09-27）

架构审查「哪些逻辑该下沉却在业务层」的落地部分，只动**零业务语义**的那几件：

- **`useDragAutoScroll` → `platform/composables/usePointerEdgeAutoScroll.ts`**（同时改名以对齐「文件名＝导出名」）：
  它是纯手势原语（只读容器矩形与可滚量、只写 `scrollTop/Left`），原先住在乐谱域的拖拽实现里，于是被绑在域内。
  与 `useEdgeScroll` 的分工写进文件头 —— 两者名字相近但关切不同（一个由指针位置驱动滚动、需要渐加速与逐帧续帧，
  一个只观测「还能不能滚」并暴露 `visible` / `scrollToEdge`），**不要互相替代**；
- **`useDragGhost` → `platform/composables/useDragGhostLayer.ts`**：影像层只管「元素 + 按帧合帧的位移」，
  内容留在域内（`useLyricsDragDrop` 自己持有 `ghostChordName`）。原先它内联了 `getChordName` ——
  那是它唯一的域依赖，也是它被绑在域内的原因；
- 两份文件都从 `domains/score/index.ts` 的**模块清单**里摘除（该清单是「本域有哪些模块」的说明，
  不是导入入口，见其文件头），引用点只剩 `useLyricsDragDrop`，已改指平台路径；
- **`remToPx` / `rootFontSizePx` 收进 `platform/utils/dom.ts`**：`ChordPickerPanel.logic.ts` 里
  `parseFloat(getComputedStyle(document.documentElement).fontSize) || 16` 手写了两遍（卡片 chrome 与网格 gap 各一处）。
  根字号是**流式**的（不恒为 16px），且与 `resolveLengthToPx` 同属「CSS 长度 → 像素」这一类，故一并收在 DOM 工具层；
  与 `resolveLengthToPx` 的分工也写明：那个借探针解析任意 CSS 长度（含 `var()` / `calc()`，代价是一次强制布局），
  这个是纯算术，供「已知是 rem、且要算很多次」的几何计算用；
- **审查中被否掉的四条**（不是缺陷，记在这里免得下次又被当成重复去合并）：
  · `ScoreInteractiveArea` 的窗口化**不能**接 `useRowWindowing` —— 后者是「分区 + 网格 + 行高可预算」的视口滑动窗口，
  而乐谱区是**行高实测 + 前缀窗口 + 尾部窗口**（谱面必须按序渲染、末页参与排版），算法不同，迁移等于重写；
  · 两处手写滚动位置记忆（`ScorePreviewPane` / `ScoreInteractiveArea`）**不在** `useScrollMemory` 职责内 ——
  该文件第 57-58 行自己写着「只记纵向 `scrollTop`；双轴 + detach→attach 复位语义不同，不在本函数职责内」；
  · `useEdgeScroll` 与 `useDragAutoScroll` **不是**同一个关切（见上），故不合并；
  · 三个表单控件的「本地即时值」不抽 `useLazyModel`：`BaseInput` 与 `BaseTextarea` 逐字相同（2 处），
  `BaseSlider` 是变体（lazy 写回挂在 computed setter 上，另有「忽略 lazy 立即落盘」的提交点），
  统一 API 需要三方法（`commitLocal` / `commitNow` / `flushIfLazy`），代价大于收益；
- **测试工程划分就地说明**（`vite.config.ts`）：依赖 DOM 的用例落在 `tests/ui/**` 之外、又没登记进 ui 的 include，
  会被 logic 工程按 node 收走并报 `document is not defined`，而该报错不提示修法。补注释写明两条修法
  （把文件挪进 `tests/ui/**`，或登记进 ui 的 include），不留「知道报错但不知道怎么办」；
- **补一条守卫用例**（`tests/stores/chordStoreImmutability.test.ts`）：审查里唯一一条「**没有任何机制在守**」
  的载荷型约定 —— `chordRepository` 的写回 diff 以**引用相等**判变更、`chordStore` 的快照与持久化 watch 是浅比较，
  故任何一处原地改都会让那次编辑**静默不落盘**（表现为重开应用后改动消失）。该约定原先只写在两处注释里
  （repository 的写回 diff、store 孤儿收容的「原地改不会触发快照提交与落盘」），现以 `moveVariantsByName`
  （要重写 `groupId`、必然派生新对象的那类路径）为锚点，断言旧引用未被就地修改、新引用已入列。
  刻意**不**拿 `updateChord` 当锚点：它由调用方传入新对象、只替换槽位，原地改与不可变改在它身上不可区分，
  测它等于同义反复（`rules/06` 的「一」）。已反证：把实现临时改成 `c.groupId = …` 原地改，该用例变红。

### 修复 · 全仓审查第一轮（platform 底座）的 5 处缺陷（2026-09-27）

- **弹窗数据跨开合残留**：`useModalController` 的 `modalData` 是所有弹窗共用的单份对象，`open`
  只覆盖传入字段，未覆盖字段保留上一个弹窗写入的旧值 —— 调用方并不都传全（`open('create')` 一个
  字段都不传），「activeGroup 等残留导致误操作」是可达路径。改为每次 `open` 先整体回落到出厂数据
  （创建时深拷贝定格的 `pristine`，浅回落会把嵌套改写带回升）再套 patch；回落语义与备份弹窗
  「关闭即归位到打开时默认值」的既有看门一致。
- **全仓 id 生成器熵偏低**：`generateUUID` 默认 8 个 hex = 32 bit，实体量上万时生日碰撞概率约 1%；
  且 7 个调用点里有 5 个再显式截到 8/10 位。默认长度提为 12（48 bit），5 处显式截短同步提为 12
  —— 只影响新生成的 id，存量 id 无需迁移。
- **`base64DecodeUtf8` 不吞脏输入**：内部 `atob` 对非法 base64 抛 `InvalidCharacterError`，与
  `transfer.ts`「脏输入一律 null」的边界口径相反，异常会原样穿透到界面。改为非法输入返回
  `string | null`；唯一调用方 `syncBase.decodeBase64Envelope` 对 null 抛
  `INVALID_CLOUD_DATA`（云端文件被截断/篡改 → 能读的中文文案，而非浏览器原文）。
- **打印兜底回收过短**：`printImagePages` 的 `CLEANUP_TIMEOUT_MS` 60s 到点即 revoke 图片源，
  而打印对话框可以被停留任意久 —— 中途断源出白页。放宽到 10 分钟：对象 URL 多驻留几分钟的代价
  远小于打印被掐断。
- **开发面板同名多实例缓存读数**：`aggregate` 只展示第一份实例的 `limit` / `maxBytes`，同名实例
  口径不一致时读数误导。改为不一致时取「最严格的一份」（数值最小者）。
- 测试：新增 `tests/platform/useModalController.test.ts`（回落契约 2 例，含嵌套对象污染回落源）、
  `tests/platform/commonBase64.test.ts`（边界口径 3 例）、`tests/platform/cacheAggregate.test.ts`
  （聚合口径 2 例）；`tests/stores` + `tests/domain` 全量 532 例通过（id 长度变化无回归）。

### 修复 · 顶栏居中栏的死分支，通用时间戳助手搬出仓储模块（2026-09-27）

- **死分支**（`app/layouts/TopHeader.vue`）：居中 Tab 栏那层壳的 `v-if` 与 `:class` 三元**共用同一条件**
  （`route.path === ROUTE_PATHS.SCORE`），于是三元恒取真分支、`items-center` 永不可达 ——
  读起来像「两种状态」的绑定实际只有一种。改为把 `items-stretch` 写进静态 class 并注明理由：
  语义不变（该节点本就只在乐谱路由渲染），但不再留假分支；
- **通用助手搬出域的仓储模块**（`platform/utils/common.ts`）：`Timestamped` + `fillMissingTimestamps`
  原住在 `domains/chord/model/chordRepository.ts`，于是乐谱域的 `songRepository` 与 app 层的
  `validation/persistedData` / `payload` 都得**跨域 import 一个仓储模块**才拿到这个纯形状助手 ——
  而仓储模块该导出的是仓储。两者只依赖 `{ createdAt?, updatedAt? }` 这一形状，现归平台通用工具层
  （与 `toPlainPersistable` / `serializeForStorage` 同类）；
- 顺带消掉一份**逐字重复**的谓词：`isValidTimestamp` 原先在 `chordRepository` 与 `songRepository`
  各写一份（已逐字比对，无分叉），现从平台取同一份；
- 改动只动「定义位置 + import」：`persistedData` 对外的 re-export 面保持不变（`payload` 未改），
  清洗逻辑一行未动 —— 由清洗链路用例覆盖（`sanitizePersistedData` / `repositories` / `migrateLegacy`，
  连同和弦不可变守卫共 28 例通过）。

### 修复 · `v-model.lazy` 在两个文本控件上永不写回（2026-09-27）

- 现象（`platform/ui/input/BaseInput.vue` / `BaseTextarea.vue`）：lazy 下输入期间不写 model（符合预期），
  但**提交点（change / 失焦）也不写** —— model 永不更新，唯一能写回的是清空按钮那条显式路径。
  两处注释都写着「change（失焦/回车）：lazy 模式下的提交点，把最终输入写回 model」，代码里却只调 `commitLocal`；
- 成因是**同一条状态机的两条写回条件分处两地**：「非 lazy 才写」写在**写入**侧（`commitLocal` 内），
  「lazy 才写」该写在**提交点**侧 —— 后者在两个文本控件里根本不存在。`BaseSlider` 同款模式却写对了
  （它另有显式的 `if (isLazy.value) model.value = …`），而三处 `v-model.lazy` 恰好都挂在滑块上
  （`HeaderConfigPopover` 的字号 / 和弦缩放 / 导出质量），故缺陷一直没被撞到：属**潜在缺陷**，非现网故障；
- 修法：把这段状态机抽成平台的 `useLazyModel`（`local` / `commitLocal` / `flushIfLazy`），
  两个文本控件的提交点补上 `flushIfLazy`，滑块那三处显式 lazy 写回改用同一函数 ——
  于是「非 lazy 才写」与「lazy 才写」成为同一组合式函数的两个分支，不再可能只实现一半；
- `flushIfLazy` 在非 lazy 时**刻意不重复写**：区间值那类「每次都是新数组」的形态重复写会让依赖 model 的下游
  多空跑一次（口径原写在 `BaseSlider` 的 `updateValue` 注释里，随实现一并收进组合式函数）；
- 顺带把三处 `vue/no-ref-object-reactivity-loss` 豁免清成 0：它们都是「有意取 `ref(prop.value)` 一次性快照」
  的同一误报，而快照现在只在组合式函数里做一次（用 `shallowRef`，值一律整体替换，无需深响应）。
  另两处同名豁免（`Fretboard.vue` / `ScoreLyricsEditor.vue`）是「同步基线」语义，与 lazy 无关，未动；
- 用例：新增 `tests/ui/baseInputLazyCommit.test.ts`（3 例：BaseInput 的 lazy 提交点、非 lazy 对照、
  BaseTextarea 同款契约）。「打字」一步刻意**不用** `setValue` —— VTU 的 `setValue` 会连 `change` 一起发
  （其源码注明是为 `v-model.lazy` 补的），而 `change` 正是本用例要单独验的提交点，两段混在一起就分不出
  是谁写回了 model。已反证：把 `flushIfLazy` 改成不落盘，两条提交点用例都变红（对照组仍绿）。

### 调整 · 指板品号改「整列滑动一行」，不再逐个原地翻字（2026-09-27）

- 现象（`fretboard/components/FretboardSvg.vue`）：改品位偏移时每个品号各自做逐字符翻页（旧字上滑离场、
  新字自下滑入），于是 123 → 234 看起来是「三个数字各自换字」，而不是**整列往上滑一行**
  （1 从顶端滑出并淡出、4 从底端滑入并淡入）；
- 改为：品号渲染成一条按**绝对品号**排布的数字带，整带按 `−fretOffset × 品距` 平移 —— 数字因此**跨行位移**
  （3 从第三行滑到第二行），而可见带（行 1..fretCount−1）两侧各多渲染一个，靠不透明度归零 / 升起承担
  「滑出的淡出、滑进的淡入」。平移与淡入淡出同用 `duration-slow` + `ease-sidebar`，故「边滑边淡」是一次动作；
  行距从几何现推（`fretLineY(1) − fretLineY(0)`）而不引常量，两张图（零品 / 偏移）都跟着几何走；
- 过渡的 `transition-transform` 走模板上的工具类而非内联 `var()`：内联写错时整条 `transition` 会静默失效
  （滑动退化成瞬移）。本轮先内联成 `var(--ease-sidebar)` —— 那是**工具类名**、不是变量名（实际变量叫
  `var(--bezier-sidebar)`，它存在），写错会静默失效，故改走工具类；
- 这一处刻意**不**走通用滚动文本组件：`BaseRollingText` 表达的是「同一位置换字」，而这里要的是位置在动
  （数字跨行），属指板层自己的排布；它的 `alwaysRoll`（整块翻滚）同样不适用 —— 那是「整块原地翻」，
  仍然没有跨行位移。随之 `FretboardSvg` 不再引用 `BaseRollingText` 与 `absoluteFretLabel`（两处导入已删）；
- **可视窗口钳在指板高度范围内**（品号层加 `overflow-y-clip`；该层是 `inset-0`，盒高即 `boardBoxHeight`）：
  数字带两端各多渲染一个，滑出 / 滑入的那两个本来会落到指板盒之外 —— 品数撑开时更明显：盒高还在从下往上
  展开，新出现的下端品号已经先落在盒外了。钳掉才只在指板范围内可见。用 `overflow-y-clip` 而非 `hidden`：
  横向必须保持 `visible`，多位数（如 24）从锚点向左展开，横向裁切会把首位切掉；
- 无新用例：这一层是纯观感，且 jsdom 测不了布局（`tests/setup.ts` 的说明），
  其依赖的几何仍由 `tests/domain/fretGeometry.test.ts` / `fretboardGeometry.test.ts`（28 例）覆盖；
- **已知且接受**：快速改偏移（如瞬间 0 → 7）时数字会滞后于目标位置，跨的档位越多偏得越远 ——
  这不是错位，也**与过渡时长无关**：数字带按绝对品号排布，1..7 在 DOM 上就是实打实的 7 行距离，
  跨 7 行的改动必然要走过那 7 行（位移距离是布局量，改时长只改走多快）。已在组件内注明
  「不要为大跨度加跳过过渡的特例、也不要试图调时长抹掉它」。

### 调整 · 零品加粗 ↔ 偏移切换时指板骨架位移也走过渡（2026-09-27）

- 现象：两档几何的 `gridTop` 差一个线宽（`gridTopShift` 是 `±线宽/2`），而这个差是**烘进坐标**的
  （SVG 的 y 属性、品号层的 top），坐标不参与过渡 —— 于是切换时整块内容瞬移约一个线宽；
- 改法（`fretboard/components/FretboardSvg.vue`）：在品数撑开容器上做一次 FLIP —— 切换那一帧垫上**反向**
  位移把整块按旧位置钉住（该帧内联 `transition-property: none`），下一帧放开过渡归零，
  看到的就是从旧位置平滑滑到新位置。位移与弦枕条同长同曲线（`$duration-base` + `$bezier-sidebar`）——
  两者由同一次切换触发，一个在长/收、一个在挪位，节奏不一致会看出是两件事；
  刻意**不**改几何把位移从坐标里挪出去：Canvas 与导出共用同一份几何，挪出去会连带改变那边的落笔位置；
- 容器的两条过渡（高度 / 位移）收在 scoped 的 `.fretboard-board-frame` 一条声明里，不再用 Tailwind 的
  `transition-[height]`：scoped 规则未进 `@layer`，会整体盖掉 `@layer utilities` 里的 `transition-property`，
  分两处写时后写的必然让另一条静默失效；
- **空弦标记位必须反向抵消**，否则切换时它被容器推着走 —— 那正是「空弦音符抽动」：
  `getStringNoteY` 对 0 品 / 静音返回 `geometry.markerCenterY`，而该位置**跨两档几何恒定**
  （不含弦枕，见 `FretboardSvg.logic` 的说明），与「整块补偿」不是同一套坐标。故音符本体、悬停环、
  焦点环三处统一改走新增的 `noteCenterY()`，在 `fret <= 0` 时把补偿减掉；1 品及以上取 `fretCenterY`，
  本身随网格顶移动、与容器补偿正好抵消，故不减；
- ⚠️ **但只减还不够：抵消必须与容器同步补间**。补偿若是**阶跃**的（切换帧垫上、下一帧归零），
  第 2 帧抵消就消失、容器却还在动画中途，音符照样跟着漂 —— 抽动只是从第 1 帧挪到第 2 帧（首版正是这样，
  用户复测「还是抽动」）。故把这段也纳入「音符位移过渡窗口」（复用品位滑行那套 `is-moving` + 250ms 解锁）：
  两边同长同曲线时，容器补间的 `+Δ·(1−e)` 与抵消的 `−Δ·(1−e)` 恒等相消，与缓动函数是什么无关；
- 无新用例：纯观感，且 jsdom 测不了布局（`tests/setup.ts` 的说明）；其依赖的几何仍由
  `tests/domain/fretGeometry.test.ts` / `fretboardGeometry.test.ts`（28 例）覆盖。

### 调整 · 指板横按气泡抽出平台原语 BaseAnchorBubble（2026-09-27）

- 边界按「谁的需求」划：
  · **平台**（`platform/ui/bubble/BaseAnchorBubble.vue`）：药丸面板（`v-auto-width` + 圆角 / 留白 / 字号档）、
  指向箭头（`BaseArrowPanel`，必须由它渲染成面板的**直接子节点**）、进出场过渡（`anchor-bubble-*`）、
  指针卫生（按下 / 点击 / 移动就地 `prevent` + `stop` —— 气泡浮在可交互内容之上时的固有需求）；
  · **业务**（`fretboard/components/FretboardSvg.vue`）：锚点坐标（左 / 上百分比跟随指板几何）、
  **位移动画**（`transition-[left,top]`）、两态外观（已标记实心档 / 未标记留白）、内容（图标 + 文案）、
  交互（点击标记、悬停保持）—— 这些是调用方的约定，不是气泡的固有行为；
- 两段样式随之下沉进组件：`barre-bubble-transition-*` 与波纹容器层级（`:deep([data-v-wave-container-internal])`）。
  ⚠️ 过渡规则**必须 scoped**：面板自带 Tailwind 的 `transition-[background-color,border-color,box-shadow]`
  工具类（与它同为单类选择器 (0,1,0)，且在样式表中更靠后），scoped 附加的 `[data-v-*]` 把特异性提到 (0,2,0)
  才能压过它 —— 去掉 scoped 会让进出场动画静默失效（原注释已写明，随规则一起搬走）；
- 调用方的 `@click` / `@pointerenter` 等经 attrs 与组件自身的处理**并存**（Vue 合并同元素的监听），
  故组件内的 `@click.stop` 不会吞掉调用方回调；`v-wave` 当时挂在**组件**上（指令随单根组件的根节点继承
  —— 本仓 `ActionButton` + `v-tooltip` 是同一手法，且有用例钉住这条通路），随后移入组件内部，见下节；
- 入场过渡由 `appear` 播（**静态无值**属性，恒真）：气泡所在的整棵子树随「显示」挂载 / 卸载
  （`FretboardSvg` 的定位容器带 `v-if`，横按气泡是「挂载即在场」），挂载那一次渲染里面板已经在了 ——
  入场只能由 appear 触发。抽组件时曾把它写成 `:appear`（`appear` prop 的简写，默认 false），
  入场动画随之静默消失；该 prop 已删除，不再留一个「看着像恒真、实为开关」的写法；
- 无新用例：气泡本体是纯观感（jsdom 测不了布局），几何与交互逻辑仍留在域侧原处、一行未动。

### 调整 · 气泡自带按压波纹与禁用态，对象守卫收口为 isObject（2026-09-27）

- **波纹归位**（`platform/ui/bubble/BaseAnchorBubble.vue`）：`v-wave` 从调用方移进组件 —— 波纹是
  「可交互气泡」这一形态自身的行为，不是某个调用方的需求；且它的裁剪外扩量由箭头尺寸推出
  （`ceil(arrowSize / √2)`：箭尖越出面板 border-box 这么多，而波纹容器自 border-box 撑开），
  而箭头尺寸**本来就是本组件的 prop**。这段推导原先写在 `useBarreBubble` 的 `barreWaveClip` 注释里，
  等于把「本组件箭头有多凸」这件私事抄了一份到外面，箭头尺寸一改要同步两处；
- 随之删除 `useBarreBubble` 的 `barreArrowSize` / `barreWaveClip` / `BARRE_ARROW_SIZE`，以及
  `FretboardSvg` 调用点上的 `v-wave` 与 `:arrow-size`。箭头尺寸回落到 `ARROW_PANEL_SIZE` 默认值，
  **数值与观感一字未变**（原 `BARRE_ARROW_SIZE` 就是 12）；裁剪形状仍由剪影层挂到面板上的
  `--arrow-panel-clip` 给出（面板 + 箭头一条非凸曲线），组件侧只负责「放开多少」；
- 新增两个 prop：`disabled` **只管交互不管外观** —— 禁用时 `pointer-events-none` + `cursor-default`
  （事件穿到下面的宿主，与气泡「不把指针事件漏给宿主」的取向同源：漏与不漏都由气泡自己决定），
  是否变灰留给调用方经 class 表达（组件不知道业务的两态外观是什么）；`wave` 是逃生口，置假即把
  波纹的 `disabled` 置真（v-wave 在 disabled 时**根本不建容器**，见其 `wave()` 首行），
  调用方不必去摘指令 —— 两者观感上无从区分，故合并成同一个判断；
- **新增 `isObject`**（`platform/utils/common.ts`）：`typeof x === 'object' && x !== null` 的具名形式，
  收掉两类复合格共 14 处 —— 正向 5 处（`asRawRecord`、`vActionCard`、`vFocus`（原自备局部
  `isConfigObject`）、`vGridNav`、`chordRepository`），否定式 `!x || typeof x !== 'object'` 9 处
  （`payload` ×4、`payloadMigrations`、`coordinates`、`syncBase`、`backupCrypto` ×2）。
  两类是同一事实的正反两面：`!x` 顺手兜掉的 undefined / 0 / '' / false 全在「非对象」之内，
  具名后「是不是对象」只有一种写法，不必每次重推那串短路；
- 类型谓词取 `object` 而非 `Record<string, unknown>`：**数组也是对象**（调用方常需自己判
  `Array.isArray`，如「对象但不是数组才算配置」），而 `Record` 对数组不成立（数组没有字符串索引签名）。
  「要索引签名 + 排除数组」的那种收窄仍单独留在 `asRawRecord`，两者分工写在注释里；
- ⚠️ 谓词的负分支会把**已确定是对象**的类型收成 `never`（`typeof x !== 'object'` 的写法同样如此，
  已用 `tsc --strict` 复核），故 `if (!isObject(x))` 的块内不要再读 `x` 的属性 —— 现有 14 处均无此写法
  （`payload.ts` 那处的块内只用到 `index`）；
- 无新用例：14 处全是等价替换、行为不变（`vFocus` 的局部谓词与 `FocusOptions` 收窄由共用谓词 +
  联合收窄承担）。受影响链路的既有用例已跑：`payloadValidation` / `backupCrypto` / `repositories` /
  `barre` / `commonBase64` / `payloadChecksum` / `sampleBackup` / `syncPayloadSecurity` 共 62 例全绿。

### 重构 · 尺寸观察与全局监听收口到共享实现（2026-09-27）

- **新增 `observeResizeTree`**（`platform/utils/dom.ts`）：观察「宿主 + 全部直接子元素」的盒尺寸，
  并在子树增删 / 文本变化时增量维护观察集，任一路径触发回调一次。三处手写版本
  （`vAutoHeight` / `vEdgeFade` / `v-scrollbar` 的 overlay）此前各自维护 `observedChildren` 集合 +
  各自的 unobserve 分支，其中一份注释还写着「对齐另一份的完备观察模式」—— 同一关注点被刻意对齐却
  没有单一来源，故收成一处。回调刻意**不带 entry**（语义是「有东西变了，去重测」）；
  要按 entry 精确处理（如 `arrowPanel` 读 `borderBoxSize` 的未缩放分数 px）仍直接用 `observeResize`；
- **11 处 `new ResizeObserver` 全部迁入共享观察者**（`platform/utils/dom.ts` 的单例），
  迁后全仓只剩单例那一处构造：
  · 指令 4 处：`vAutoHeight`、`vEdgeFade`、`vScrollbar/scrollbarOverlay`、`vScrollIntoView`；
  · 组件 5 处：`BaseInput`（右侧叠加容器 + searchable 根元素）、`BaseScrollArea`（容器 + 直接子元素）、
  `BaseSegmentedControl`（容器 + 全部选项）；
  · 组合式 1 处：`useStickyHeads`（列表根 + 滚动容器）；框架无关模块 1 处：`popover/arrowPanel`；
- 各处的 `disconnect()` / `unobserve()` / 子观察集维护随之删除，改为持有解绑函数（`stopObserve` 一类），
  重建时先解绑再挂 —— 「挂」与「摘」在同一处成对出现，不再分散在两个函数里靠人肉对齐；
  `vEdgeFade` / `v-scrollbar` 的「无 ResizeObserver 环境」分支由共享实现静默降级（原实现里
  `vEdgeFade` 是无保护的 `new ResizeObserver`，在无观察者环境会直接抛错）；
- **新增 `useConditionalListener`**（`platform/composables/`）：按判据挂/摘的全局监听。
  实现从 `BasePopover` 的本地 `bindGlobalListener` 抽出（该处注释已论证过为什么不用 `useEventListener`：
  它做的是「换目标时摘旧挂新」，而这里要的是「判据为假时干脆不挂」），`BasePopover` 改为只把
  「目标固定为 window、固定走捕获阶段」这层参数绑死；新消费方为输入框搜索面板（`focusin` 判据 =
  面板开合）与 `useSliderInteraction`（三条指针监听判据 = 拖拽态非空）。原先「按下挂三条、抬起摘三条」
  分散在两个函数里，漏摘的表现是松手后指针移动仍在改值，现在挂摘由同一个判据驱动；
- `useLyricsDragDrop` 的五条**常驻** window 监听改用 `useEventListener`（挂载即挂、卸载即摘，
  原先 onMounted 挂五条 / onBeforeUnmount 摘五条必须逐字对齐）；其 `contextmenu` 那条仍是条件挂摘，
  留在原处（判据 `activeSourceKey` 不是响应式的，改造成本与收益不成比例）；
- 刻意**未动**的两处及其理由：`useSegmentedDrag` 的挂载判据是「按下已开始」而 `isDragging` 表示
  「已越过拖动阈值」，两者不是同一个事实，套用条件监听要先把它私有的 `dragStartX` 改成 ref —— 属
  「为统一而改状态形状」，且该链路无用例覆盖，收益不足；`useSortableList` 的挂摘是它自己的
  init/destroy 契约（含独立于组件卸载的 `destroy()`），保持显式成对；
- 无新用例：迁移是「换构造点 + 删各自 disconnect」，行为等价；观察者本身在 jsdom 下不投递回调
  （`tests/setup.ts` 的桩刻意不回调），故不新增断言。已跑的既有用例：`arrowPanel` / `arrowPanelPath` /
  `scrollbarOverlayParent` / `motionTransitionMerge` / `baseInputLazyCommit` / `bodyHold` /
  `useLyricsDragDrop` / `useSortableListScrollOffsets` / `formRowWaveDelegation` 共 95 例全绿。

### 修复 · 三处类型收窄（2026-09-27）

- `FretboardSvg` 的气泡两态外观改读一个非空布尔 `isBubbleMarked`：`displayBubbleBarre` 是
  `DisplayBarre | null`（离开动画期间靠 `cachedBarre` 兜底），而**模板内联表达式拿不到 `v-if` /
  `:visible` 的收窄** —— `:class` 数组与两处插值里的 `.isMarked` 被 vue-tsc 判「可能为 null」（TS18047）。
  收口成 `computed(() => displayBubbleBarre.value?.isMarked ?? false)` 后语义不变：气泡不可见时内容
  本就不渲染，取 false 与「未标记态」同值；离开动画期间缓存仍在，两态外观不会中途跳档；
- `useConditionalListener` 的 `watch` 源归一为 `() => toValue(isOn)`：`MaybeRefOrGetter<boolean>` 里那个
  裸 `boolean` 分支过不了 `watch` 的 `WatchSource` 重载（TS2769）。⚠️ 顺手改成
  `watch([isOn], ([on]) => …)` 能编过但是错的 —— 数组重载把 `on` 推成 `MaybeRefOrGetter<boolean>`
  （**元素本身**而非它的值），`isOn` 传 ref / 取值器时它恒为真、摘除分支永远走不到；
- `cache.ts` 的 `strictest` 返回值域从 `number | null | undefined` 收到 `number | undefined`（TS2322）：
  两个字段「无口径」的写法本就不同 —— `limit` 是 `number | null`、`maxBytes` 是可选字段，在 helper 里
  归一成同一个联合只会把差异推给调用点去猜。现 `limit` 侧就地 `?? null`、`maxBytes` 侧原样保留
  `undefined`，与改写前逐值等价；
- 验证：三个文件经最小作用域 `vue-tsc`（独立 tsconfig，0 错误）与 `eslint --max-warnings 0`（0 问题）；
  `cacheAggregate` / `cacheRegistry` 共 19 例全绿。无新用例：三处均为等价收窄。

### 调整 · 剪贴板与「div 模拟按钮」协议改用平台既有实现（2026-09-27）

- DevPanel 两处直调 `navigator.clipboard.writeText`（读数行复制、IDB 键清单导出）改为平台封装的
  `writeTextToClipboard`，并经 `runBusyAction` 呈现结果。原先 `void` 掉返回值后无条件弹「已复制」——
  在无 clipboard API、页面失焦、权限被拒这三种情况下都是**假成功**，而封装里本就有能力检测、
  失焦检查与权限错误转中文；
- 和弦选择面板的卡片把手写的 `role="button"` + `tabindex="0"` + `@keydown.enter/@keydown.space`
  换成 `v-action-card`（与 ChordCard / SongCard / SlotShell / ScoreInteractiveArea 同一实现）。
  顺带收紧一处：`vActionCard` 只响应落在宿主**自身**上的按键，故焦点在卡内嵌套的编辑钮上时，
  Enter / Space 不再同时触发整卡选中（旧写法的事件冒泡会两边都执行）；
- 刻意未动：和弦变体选择弹窗的变体卡仍是同一套手写协议（`role="checkbox"` + 两个 keydown），
  属本次实现路径之外，留待下次一并收口；
- 验证：两个文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。两组件均无用例覆盖，
  无新增断言。

### 重构 · transition 的括号感知切分与按属性读取收敛到 motion（2026-09-27）

- 括号感知的顶层逗号切分此前有两份等价私有实现（`platform/utils/motion.ts` 的
  `splitTransitionItems`、`platform/ui/popover/arrowPanel.ts` 的 `splitTopLevel`），现收为
  `motion.ts` 导出的 `splitCssList`，两类读法共用：transition 简写的条目组合、box-shadow 的成员拆分；
- `motion.ts` 此前只有 transition 的**写侧**（`hasTransitionItem` / `mergeTransitionItem` /
  `removeTransitionItems`），读侧由 `arrowPanel` 自拼，现补上 `transitionItemOf(cs, property)`：
  按属性名从 computed style 的四个平行列表（property / duration / timing-function / delay）取回该属性的
  条目，`all` 与「短列表按下标循环」都按 CSS 规则处理，时长为 0s 视同未参与过渡。跟随方要把宿主的过渡
  原样抄到自己身上时用它，不再各自拼一遍；
- `paintArrowPanel` 顺带把三次 `getComputedStyle` 并为一次；
- 行为等价：三条 path 的产出逐字不变（`arrowPanel` 既有 10 例断言未改），
  `motionTransitionMerge` 的独立判据只更新了函数名引用。

### 优化 · 工作台窄屏适配：纵向堆叠与指板贴合可用宽度（2026-09-27）

- 窄屏改为纵向堆叠：指板卡在上、四张面板卡在下，整页由画布统一纵向滚动；否则仍是「指板卡 +
  右侧面板列」并排。堆叠判据用**实测画布宽度**而不是媒体查询 —— 主内容区 = 视口 − 左侧栏（344px），
  同一视口宽度下侧栏开着与否差 344px，媒体查询看不见这个差：1024px 视口开着侧栏时主区只剩 680px，
  按 lg 判并排会把指板卡压到 87px。阈值 = 卡片下限 400px + 面板列 `w-88`（489.5px）+ 两侧留白（103.6px）
  ≈ 993px，侧栏关着时与「< lg 堆叠」几乎等价；
- 修掉一处一直存在的覆盖：并排时面板列是绝对定位的浮层且不透明，而指板卡按**整幅画布**居中 ——
  画布宽度 < 卡片宽 + 面板可见宽 × 2 时右半张指板被面板压住（1440 屏开着侧栏、1366 屏都在这一档）。
  现在指板卡区改为「面板列之外的全部剩余空间」，卡片在其中居中，任何宽度下都不重叠。
  副作用是宽屏下卡片不再按整幅画布居中，而是在自由区居中 —— 让开宽度后的必然结果；
- `Fretboard` 新增 `maxWidth`（可用宽度装不下整张图时按同一因子等比缩小，见 `useFretboardLayout` 的
  `fitWidth`）。这条不是锦上添花：指板本体带 `touch-action: none`（滑动绘制要吃掉指针手势），
  图横向溢出时**没法靠手指拖动补救**，窄屏必须缩到装得下。缩放走既有的「整卡 CSS scale」通道，
  坐标反算按 `getBoundingClientRect` 反推，两处都不用改；
- 窄屏的留白改走 spacing 档：本侧留白是「图在该侧的留白 × 本侧 scale」（51.8px），手机上白占屏宽屏高；
  横向改由卡片区与面板列各自的 `px-md` 提供，两者同档；
- `useResponsive` 未接入本次的自动堆叠：其文件头列的「② 工作台右侧面板可收起」指用户手动收起，
  与本次的自动堆叠不是一回事，故该项仍未开工（同批次的顶栏 / 侧栏适配已接入 ①③，见下方两节）；
  已在文件头补记本次审计结论，免得下次重复论证；
- 新增 `tests/composables/fretboardLayoutFit.test.ts`（5 例）钉住贴合契约：只缩不放、缺省 / 0 / 负数不缩、
  宽高同乘一个因子、可用宽度变化时重算；
- 验证：7 个改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；
  `fretboardLayoutFit` + `motionTransitionMerge` + `arrowPanel` 共 19 例全绿。类型检查与全量关卡未代跑。

### 优化 · 侧栏在小屏切抽屉模式（2026-09-27）

- `< lg`（1024px）下侧栏由「挤在内容左侧的常驻栏」改为覆盖式抽屉：定位从 `absolute`（父容器内、
  顶栏之下）换成 `fixed`（视口坐标，压在顶栏之上），层级取 tokens 早已预留的 `--z-sidebar-top`
  （100 > `--z-scrim` 99 > `--z-header` 90，`tests/tokens/designTokens.test.ts` 断言的就是这个序）；
  宽度取 `min(344px, calc(100vw - var(--spacing-2xl)))` —— 右侧必须留出一条可点区域，遮罩才点得到
  （视口够宽时 `min()` 取设计宽，这条只在 < ~390px 的窄屏上真正生效）；
- 新增遮罩层（`bg-overlay`，与模态遮罩同色）承载「点外部关闭」；键盘出路是 Esc（`useKeybinding`，
  判据带 isDrawerMode，桌面档的常驻栏不受 Esc 影响）。这两条是仅有的关闭路径：抽屉展开时顶栏被遮罩
  压在下面，顶栏那个开关自己也点不到；
- `App.vue` 的 `main` 在同一判据下不再为侧栏让位 —— 否则展开抽屉会同时把内容挤走 344px，而屏幕本身
  可能只有 375px。让位判据与定位切换必须同源，两处一起改：一边浮层一边让位，就是「内容被推走、
  抽屉还盖在上面」；
- 抽屉展开时顶栏与主内容区一并 `inert`：遮罩只挡得住指针，挡不住键盘 —— 不 inert 的话 Tab 会落到
  被遮住的页面里（读屏也会继续念它）。抽屉自身在 `main` 之外，不受影响；顶栏那几个 Teleport 到 body
  的浮层（弹窗 / 下拉）也不在 inert 子树内；
- 抽屉档下**启动时**收起侧栏一次：小屏沿用桌面档的持久化展开态（默认展开）会让开机第一帧就被抽屉糊满。
  刻意不用 watch 盯档位翻转 —— 窗口从宽拖窄时不动用户的展开态，那是用户正在做的操作，浮层盖上来
  可预期、也点得掉。代价是在手机上访问过会把持久化偏好写成收起，桌面下次打开需点一下开关；
- `WorkbenchView` 的首帧画布估计同步减掉这一条：抽屉档不让位，故不减侧栏宽度（原先只判 `isLeftOpen`，
  抽屉档开着侧栏时首帧会算窄 344px、先按堆叠铺一帧再翻回并排）。顺带把展开态可能为 `undefined`
  （无存储环境）归一为「未展开」；
- 验证：见本片段最后一节的「验证」行。

### 优化 · 顶栏窄屏收纳：图标并入「更多」菜单、窄屏可换行（2026-09-27）

- `< md`（768px）起：品牌文字与左右两条分隔线收起、导航分段器转 `icon-only` + 紧凑内边距
  （label 仍作为 title / aria-label）、右侧偏好区（同步 / 外观 / 仓库 / 开发面板）并入一个「更多」菜单。
  文档操作（工作台：试听 / 复制 / 粘贴；乐谱：复制文字 / 粘贴 / 复制长图 / 下载）与设置浮层仍常驻 ——
  后者挂的是 360px 宽的表单浮层，不是一组菜单项，塞不进「更多」里，且它本身是最常用的偏好入口；
- 窄屏的间距按像素重新配过（根字号 22.25px 下每档都比直觉大一截）：顶栏横向留白 `px-4` → `px-md`、
  左右两组 `gap-sm`/`gap-xs` → `gap-xs`/`gap-2xs`。乐谱页右侧是 6 枚图标钮（4 枚文档操作 + 设置 + 更多），
  收完这几档才在 360/375px 上排得下 —— 排不下也不会溢出，但会整组换到第二行，顶栏变成三行；
- 乐谱 Tab 栏曾一并改为流内 `basis-full` 落到第二行 —— 这一条**当天已推翻**（前提错了），
  最终形态是「按顶栏装不装得下取舍」，见本片段末尾两节；
- 顶栏在窄屏改为可换行、左右两组 `flex-none`（不收缩，装不下就整组落到下一行；右组带 `ml-auto`，
  换行成独占一行时仍贴右缘）。原先两侧 `min-w-0 flex-1` 会被压到内容溢出，而里面的分段器是定宽控件，
  压不出「更窄」的样子，只会互相盖住；
- 「更多」菜单里的同步 / 外观与宽屏同源（同一个 `handleSyncMenuClick` / `openSyncSettings`、同一份
  `syncTarget` 收窄写法与 `themeMenuItems`），不另造一套偏好逻辑；触发方式沿用设置浮层那条口径
  （`canHover ? 'hover' : 'click'`）—— 窄屏下它是触屏设备上唯一的偏好入口，不能押在合成的 mouseenter 上；
- 图标注册表补一枚 `ellipsis`（lucide），供「更多」按钮使用；
- `useResponsive` 的 ①③ 至此接入（判据分别是 `< md` 与 `< lg`），并补
  `tests/ui/composables/useResponsive.test.ts`（5 例，自带可控视口宽度的 matchMedia 桩）钉住这两个阈值
  与「跟随视口变化」；文件头状态说明同步改写为「①③ 已接入、② 仍未开工」；
- 验证：8 个改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；改动 SFC 经
  `vue/compiler-sfc` 编译探针（`.temp/`，跑完即删）确认模板可编译；`useResponsive` 5 例全绿。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 顶栏与侧栏的窄屏观感需要在真实窄窗口 /
  真机上复核（本次只做到「不重叠、不溢出、关闭路径完整」这一层）。

### 修复 · 工作台指板卡回到画布居中：卡片区让位量改为按需（2026-09-27）

- 上一轮的工作台窄屏适配给卡片区写了固定 `mr-88`，把右侧面板列的整列宽度**无条件**让了出来。
  面板列是绝对定位、不吃流内空间，让位后卡片改在「自由区」居中，位置因此**恒定左移 245px**
  （面板列 489.5 ÷ 2）。可画布够宽时卡片本来就不碰面板列，这份让位纯属白让 ——
  宽屏上就表现为「指板不居中了」；
- 改为**按需让位**：让位量 = `clamp(左留白 − 右留白 + 卡片宽 + 2 × 面板列宽 − 画布宽, 0, 面板列宽)`。
  画布 ≥ 1563.6px（6 弦 3 品档）时归零，卡片回到**整幅画布居中**、与窄屏适配之前一致；更窄时按
  超出量逐步让开 —— 让位后卡片在剩下的自由区里居中、位置左移「让位量 ÷ 2」，故让位量与所需的
  左移量差一个因子 2（算式里的 `2 × 面板列宽` 即由此而来）；
- 卡片宽取「板宽 × 品数档位比例」（`INTERACTIVE_GEOMETRY.boardWidth` × `fretboardScaleOf`），
  与 `useFretboardLayout` 的 `realScaledWidth` 在 `fitScale = 1` 时同源，不复制算式；卡片真被贴合
  缩小时本值偏大，方向是安全的（让位偏大 → 卡片略偏左，不会反向压住面板）；
- 上下两个边界都是有意的：下界 0 让宽屏回到整幅居中，上界 = 面板列宽即「最多让出整列」。
  并排档下取不到上界（阈值 1096.7px 处约 467px），留作保险；
- 左右留白一正一负不是笔误：画布左右留白本就不等（左 `leftPad` 103.6、右 `edgePad` 51.8），
  而「居中」量的是内容盒，两者的差要计入；
- 卡片区的 `min-w-0`（否则 flex 项不肯收缩、让位会被内容宽吃掉）与「可用宽度量取点」两个职责不变；
  堆叠（窄屏）档不让位，仍占满整行；
- 顺带把 `SIDE_BY_SIDE_CARD_MIN` 注释里的阈值算式改对：原写「两侧留白 103.6 ≈ 993px」，
  代码实际是 `2 × leftPad` = 207.2 → **1096.7px**。只改注释，判据本身未动；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过、模板经 `vue/compiler-sfc`
  编译探针确认；另用一次性算式探针（`.temp/`，跑完即删）以 1px 步长扫过并排全区间（1097~3000px），
  卡片右缘越入面板列的最大量为 **0.00px**、让位量在 1563.6px 处归零、1400px 处卡片中心与画布中心
  只差 56px（改前恒为 245px）。类型检查无文件级形态、未验证；全量关卡按禁令未代跑。

### 修复 · 应用最小宽度放开到 320px：移动端控件不再被整页缩放压小（2026-09-27）

- 症状：手机上「控件都太小了」。根因不在控件尺寸（md 档 `1.9rem`，本项目根字号 22.25px，
  实测约 42.3px），而在 `body` 的 `min-width: 1024px`（`$app-min-width`）：手机视口（390px 上下）
  因此拿到一份 1024px 宽的文档，浏览器按「内容宽于视口」把整页缩到约 **0.38×** 显示，
  42.3px 的控件跟着只剩 ~16px；
- 改法：`$app-min-width` 1024px → **320px**，与 `App.vue` 根节点既有的 `min-w-[320px]` 对齐 ——
  两处此前互相矛盾（一个 1024、一个 320），现取小者。语义不变，仍是「低于此宽度不再收缩、
  改为横向滚动」，只是把这条线从「桌面端」口径改回「手机视口下限」；320 恰是手机视口的下限，
  故 ≥ 320px 时应用宽度与视口宽度恒等；
- 连带前提变化：**顶栏宽度 = 应用宽度 = 视口宽度**（顶栏横跨应用宽、不受侧栏占位影响）。
  窄屏那套适配（顶栏收纳 / 侧栏抽屉 / 工作台堆叠）本来就是为这个宽度准备的，
  此前因 min-width 1024 而**从未真正生效**过，放开后才成为可达路径；

### 修复 · 乐谱路由顶栏不再凭空多出一层：Tab 栏改回「装得下才居中」（2026-09-27）

- 症状：乐谱路由的顶栏比工作台路由高出一截，乐谱 Tab 栏（编辑歌词 / 排列和弦 / 预览）被挤到第二行；
- 根因是上一轮窄屏收纳的**前提错了**：`isNarrow` 按**视口**宽度判（< md，768px），而顶栏横跨的是
  **应用宽度**。当时应用宽度恒为 1024px（`body` 的 min-width），故视口 663px 时顶栏仍有 1024px 可用，
  「装不下」根本不成立 —— 按这个错误前提写下的 `order-last + basis-full` 把 Tab 栏无条件挤到了第二行；
- 改法分两步：第一步先把前提摆正（即上一节，min-width 放开到 320px），第二步才按**顶栏真实宽度**取舍。
  绝对居中要求左右两组都退到 Tab 栏两侧之外，三段自然宽约左组 279px / Tab 栏 284px / 右组 312px
  （dev 构建右组再多两枚图标 ≈ 359px），解得需 **W ≥ 952px**（dev ≈ 1000px）—— 正好落在
  `lg`（1024px）上，故判据直接取 `isTabRowOwnLine = breakpoints.smaller('lg')`，不为此引入第五个阈值；
- 于是 Tab 栏**两态**：装得下（≥ lg）绝对铺满居中、不占流内行；装不下（< lg）流内 `basis-full`
  独占一行。`scoreTabRowClass` 因此保留（中途曾按错误前提删掉），`<header>` 的换行也改由
  `isTabRowOwnLine` 驱动，与 Tab 栏两态同步；
- 顺带修正两处写错的推导：`isNarrow` 的注释原称「顶栏横跨整个视口宽、故判据只与视口有关」
  （错，当时顶栏宽度 = max(视口, 1024)），以及一组按 16px 根字号算出的自然宽（258 / 260 / 192px，
  本项目根字号 22.25px，实际约 1.39 倍）；
- `useResponsive` 文件头同步改写：① 的说明补上 Tab 栏的 `< lg` 判断与 952px 阈值；「判据的性质」
  一段从 min-width 1024 的旧口径改为 320px 后的新口径 —— ① 与 ③ 同属「相对视口的量」，
  可以放心用断点，不必像 ② 那样改成实测；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、
  未验证；全量关卡按禁令未代跑。放开 min-width 后窄屏那几条路径（顶栏收纳 / 侧栏抽屉 / 工作台堆叠）
  成为真正可达的路径，需在真机复核 —— 真机上一露头就报出两个问题，见下面两节。

### 修复 · 移动端顶栏不再分三层：极窄档把非主操作收进「更多」（2026-09-27）

- 症状：手机上顶栏被撑成三层 —— 左组（侧栏开关 + 导航）一行、右组（文档操作 + 设置 + 更多）一行、
  乐谱 Tab 栏再一行；
- 根因是「左组 + 右组」这一行**根本装不下**：左组（侧栏开关 1.9rem + gap-xs + 导航分段器，
  分段器自带 `p-1` 与 1px 描边）≈ 138px，顶栏左右留白 `px-md` × 2 ≈ 33px，右组每枚图标钮
  1.9rem ≈ 42.3px、项间 `gap-2xs` ≈ 5.6px —— 乐谱路由 6 枚 ≈ 281px，合计 ≈ 452px。
  390px 的视口下两组只能各占一行，加上 Tab 栏就是三层。窄屏那套收纳此前只收「偏好入口」，
  文档操作一枚没动，所以 375~430px 上一直是这个结果；
- 改法：新增一档更窄的判据 `isActionFold`（< 480px），命中时右组**只留「页内主操作 + 设置 + 更多」
  3 枚**，其余动作并入「更多」菜单 —— 乐谱留「复制文字」（粘贴 / 复制长图 / 下载 折叠），
  工作台留「试听」（复制 / 粘贴 折叠）。折叠后右组恒为 3 枚 ≈ 138px，合计 ≈ 309px，
  到 `$app-min-width` 的 320px 都装得下，于是任何受支持的宽度下顶栏都是两层（左组 + 右组 / Tab 栏）；
- 阈值同样是算出来的：未折叠时最宽的一档（乐谱 6 枚）合计 ≈ 452px、工作台 5 枚 ≈ 405px，
  取 480px 留 ~28px 余量。它留在 `TopHeader` 内、不进 `useResponsive` —— Tailwind 标准断点在
  sm(640) 之下没有档位，且这是「这一行装不下」的几何结果而非布局断点（与 `isTabRowOwnLine` 同理）；
  也刻意不写成 rem：媒体查询里的 rem 认浏览器初始字号（16px），与项目根字号 22.25px 无关；
- 折叠项与顶栏按钮**完全同源**：同一个禁用判据、同一份提示文案、同一个 handler（`foldedRouteActions`），
  只是换了承载形态 —— 判据分开写迟早冒出「顶栏上能点、菜单里却禁用」这类不一致。下载那一组
  （长图 / PDF / Zip / 打印）整体作子菜单挂进「更多」，不拆平（`MenuSubmenu` 尊重父项的 `disabled`，
  禁用时既不响应也不展开子面板）；折叠项排在菜单最前、与偏好入口之间补一条分割线
  （分割线渲染在项**之前**，故挂在首个偏好项上，挂在首项会在菜单顶部多出一条悬空的线）；
- 「更多」按钮的 aria-label 由「更多：同步、外观与仓库」改为「更多操作」——它现在也承载页内动作，
  旧文案会漏报；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过、模板经 `vue/compiler-sfc`
  编译探针确认。类型检查无文件级形态、未验证；全量关卡按禁令未代跑。

### 修复 · 移动端 Tab 栏下划线贴住文字：窄档给死行高（2026-09-27）

- 症状：移动端乐谱 Tab 栏的选中下划线直接压在文字底边上；
- 根因是窄档那层容器**高度不确定**：Tab 栏里的分段控件走 `full-height`（`h-full`），而 `h-full`
  只认父级的确定高度 —— 宽档下父级是 `absolute inset-0` 那一层、高度确定（≈ 2.5rem）；
  窄档下父级是流内行、高度由内容撑开，`h-full` 于是退化成 `auto`，控件高度塌成一行文字高
  （`text-xs` 约 16.7px），贴底的下划线自然就落在文字底边上。这一条与「顶栏分三层」同源：
  都是窄档从「绝对定位的一层」变成「流内一行」时带出来的；
- 改法：窄档容器给死高度（初值 `h-10`，与顶栏自身的 `min-h-10` 同档）—— 两态的控件高度因此一致，
  下划线到文字的距离也一致。原先那层 `py-xs` 同时去掉：高度既已给死，它只会从控件身上再切掉
  12px、把下划线往上顶。该初值随后被推翻：与顶栏第一行严格等高的 Tab 栏反而让顶栏凭空厚了一层，
  见后文「乐谱 Tab 栏窄档降档」一节；
- 验证：同上一节（`eslint` / `prettier` / 模板编译探针）。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑。

### 新增 · 菜单限高：`maxVisibleItems` 按项数折算面板高度，超出滚动（2026-09-27）

- 起因：上一节把页内动作折进「更多」后，该菜单在手机上的项数最多到 10 条（折叠动作 + 偏好入口 +
  开发面板），整条铺开约 596px，盖住整页内容；
- `BaseMenu` 新增 `maxVisibleItems`（不传 / ≤ 0 即不限）：按「行高 × N + 项间距 + 标题行 + 分割线」
  折算成面板的 `max-height`，**自动开启自绘滚动条**。限高只压高度、不裁剪项 ——
  所有入口照旧可达，只是要滚一下；
- **标题行与分割线必须算进来**（首版漏了，第 N 项会被裁掉一截）：它们不是背景装饰，而是列表这个
  flex 列里真实的子节点，每个子节点之间都要吃掉一个 `gap-xs`。于是前 N 项的可见高度 =
  上下内边距 2 段 + 子节点间距（子节点数 − 1）段 + N × 行高 + 标题行高 + 1px（标题下那条线）+
  列表内每个 `divided` 项的 (0.25rem + 1px) + 面板上下描边 2px；`dividedCount` 只数前 N 项里的
  （分割线渲染在项之前，可见范围之外的不计入）。补上后 7 项由 383px 修正为 415px；
- 折算用 `calc` 拼 rem、而不是先算成 px：项目根字号是 22.25px 而非 16px，只有 rem 才跟着根字号走。
  行高直接引用 `CONTROL_HEIGHT_PRESETS`（与 `MenuRow` 的 `h-[...]` 同源），间距与内边距取 `MenuItems`
  根节点的 `gap-xs p-xs`（两者同为 0.375rem，合并成「几段 0.375rem」来算），标题行高取
  `text-2xs leading-tight`（`--text-2xs` 没有配对的 line-height，行高只由 `leading-tight` 给出）。
  各值都不另抄一份数字，改标尺会带着它一起改；
- 自动开滚动条是必须的：`BasePopover` 的 `panelScrollbar` 走被动模式时原生滚动条是被隐藏的，
  只给 max-height 会表现为「内容被静默截断、看不出还能滚」；
- 面板高度的作用点沿用既有路径 —— 样式走 `panelStyle`（`BasePopover` 会与 `transformOrigin` 合并），
  滚动本身由 `v-scrollbar` 指令注入的 `overflow` 承担（`panelClass` 里写 `overflow-*` 会被内联样式覆盖，
  这条口径见 `BasePopover` 的注释）。折算的前提是面板自身不带内边距 —— 调用方往 `panelClass` 里
  塞 padding 会让它失准，这条已写进注释；
- 落地：窄屏「更多」菜单取 `MORE_MENU_MAX_VISIBLE_ITEMS = 7`（md 档下 ≈ 415px，约占 844px 高手机屏的
  49%），比全展开省下约 180px。数字留在 `TopHeader` 内，属该菜单的排版决策；
- 未做：级联子面板（下载 / 同步目标 / 外观）没有限高 —— 它们各自最多 4 项，不构成同一问题；
  `MenuItems` 也没有跟着加这个属性（限高是「面板」的事，子面板的高度由 `BasePopover` 管）；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过（`BaseMenu.vue` 的属性与
  import 顺序经 prettier 重排）、模板经 `vue/compiler-sfc` 编译探针确认；限高的像素值用一次性探针
  （`.temp/`，跑完即删）**从 SFC 里取出真实的 `menuMaxHeight` 源码求值**（不是另抄一份算式）后换算：
  7 项 + 标题 + 1 条分割线 ≈ 415px、6 项 ≈ 364px、10 项全展开 ≈ 596px。类型检查无文件级形态、
  未验证；全量关卡按禁令未代跑 —— 真机上值得看一眼滚动条在深色底上的可见度。

### 修复 · 级联子菜单在屏幕边缘翻不回来：flip 补上竖直备选方位（2026-09-27）

- 症状：手机上从「更多」里展开级联项（导出下载 / 同步目标 / 外观），子面板整块停在视口外，
  只看得到靠里的一条边；
- 根因是 flip 的备选列表**只有同轴方位**：floating-ui 对带对齐的 placement 展开出的是
  `getExpandedPlacements('right-start')` = `['right-end', 'left-start', 'left-end']`（见 utils 实现），
  全是左右侧、一个上下方位都没有。父面板贴着屏幕右缘时，行的右侧（`right-start`）与左侧
  （`left-start`）**同时**放不下 —— 子面板是 shrink-to-fit，最宽可到整个视口宽 —— flip 挑不出装得下的
  方位，只能按 bestFit 选一个仍然溢出的（实测选中 `left-start`，落点 x = −136）；而 shift 对水平方位钳的是
  交叉轴（`right-*` / `left-*` 的 `mainAxis` 是 y），x 归 flip 管，于是 x 无人纠正，面板就停在视口外。
  这也解释了「翻转在任何方向都不成立」：不是没翻，是翻过去的那一侧同样装不下；
- 改法：`BasePopover` 接出 flip 的 `fallbackPlacements`（`buildFloatingMiddlewares` 早有这个入参，
  只是没接到组件 props 上），`MenuSubmenu` 传 `['left-start', 'bottom-start', 'top-start']` ——
  先镜像到行的左侧，再退到下方、上方。竖直方位的 x 恰好是 shift 的 `mainAxis`，会连同溢出一起钳回视口内，
  「两侧都放不下」这条分支因此从无解变成有解；
- 显式给列表还顺手去掉了默认展开里的 `right-end` / `left-end`：前者与 `right-start` 同 x、
  后者与 `left-start` 同 x，x 溢出时必然一起被否，到不了「被选中」那一步；
- 桌面行为不变：左侧放得下时仍翻到 `left-start`，落点与改动前逐像素一致（探针实测）；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；翻转结果用一次性探针
  （`.temp/`，跑完即删）跑**真实的中间件链**（`buildFloatingMiddlewares`，不另抄参数）+
  core 的 `computePosition`（注入假平台，无需 DOM）实测：手机 390×844、子面板 200×200 时，
  改动前落点 x = −136（左溢出 136px，即用户看到的现象）、改动后为 `bottom-start` 落点 x = 68
  完全在视口内；桌面 1440×900 两态落点一致。类型检查无文件级形态、未验证；全量关卡按禁令未代跑。

### 修复 · 移动端拖拽排序不再吃掉滚动：触摸端改为长按起拖（2026-09-27）

- 症状：手机上想滚动列表时，手指一动就进了拖拽，列表（乃至整页）再也滚不动 ——
  歌曲列表整张卡片都是抓手，这一档尤其致命；
- 根因是 `useSortableList` 建实例时**没给 sortablejs 的触摸延迟档**：它默认 `delay: 0`，
  touchstart 即武装、第一次 touchmove 起拖，而 fallback 通道在 `_onTouchMove` 末句无条件
  `preventDefault()`。触屏上「按住就拖」与「滑动滚动」是同一根手指的同一个手势，没有时间门槛就只能二选一；
- 改法：给 Sortable 补三档 —— `delay: DRAG_LONG_PRESS_DELAY`（280ms）、`delayOnTouchOnly: true`
  （鼠标照旧按下即起拖，桌面行为不变）、`touchStartThreshold: DRAG_TOUCH_SLOP`（10px：长按等待期内
  滑动超过即放弃本次起拖，把这次手势交回浏览器滚动）。两条常量落在 `useSortableList/constants.ts`；
- 口径与歌词拖拽（`useLyricsDragDrop`：鼠标 5px 阈值起拖 / 触摸 280ms 长按起拖、等待期内滑动 > 10px 放弃）
  对齐 —— 顺带让 `GroupSection` / `WorkbenchView` 里「触屏仍靠长按拖拽」的既有注释成为事实：
  此前那只是文案，代码里没有任何长按档；
- 拖动影像不必改：`preview.begin` 在 onStart（长按到点之后）才拿到被拖元素，阈值前的移动一律不产生视觉，
  与「长按期间手指不动」正好同拍；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；四条路径用一次性探针
  （`.temp/`，跑完即删；jsdom + 真实 sortablejs，逐条补 touchend 清掉 sortable 的模块级状态）实测：
  不配 delay 时 touchstart + 滑动 30px 即武装起拖、配上后同一手势不武装（交回浏览器）、
  原地长按 320ms 正常武装、「先滚动一次再长按」仍能起拖（松手时 `_onDrop` 会清模块级状态，
  不会被一次滚动打死）。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  长按手感（280ms 是否偏长/偏短）与按压等待期没有任何反馈（歌词拖拽有 `is-press-arming` 高亮，
  排序列表没有）值得真机看一眼。

### 修复 · 移动端拖不动滚动条：拇指声明独占手势、轨道长按接管 touchmove（2026-09-27）

- 症状：手机上按住自绘滚动条拖动，滚动条纹丝不动 —— 动的反而是内容（页面照常滚）；
- 根因之一（拇指根本不可命中）：`.v-scrollbar-thumb` 隐藏态是 `opacity:0; pointer-events:none`，
  而点亮它的两条路径在触屏上都不可达 —— `attachHoverVisibility` / `createAxisOverlays` 只挂
  `mouseenter`（触屏没有 hover），`:focus-visible` 要键盘。于是手指落在滚动条上命中的是那条
  **常驻可命中**的轨道，按 `trackClick`（默认 `page`）翻页，与「拖拽」是两回事；
- 根因之二（命中了也留不住手势）：`touch-action` 默认为 `auto`，浏览器在手指一动的瞬间就把这次触摸
  接管成页面滚动，随即向元素派发 `pointercancel` —— 拇指那条被 `attachThumbDrag` 的 `endDrag` 收掉、
  轨道那条被 `attachTrackClick` 的 `endPress` 收掉，跟随当场中断。`pointerdown` 里那句
  `e.preventDefault()` 只对 pointer 事件生效，管不了浏览器的触摸手势（触摸滚动归 `touch-action` 管）；
- 改法一（轨道）：`attachTrackClick` 补一条非被动的 `touchmove` 守卫，**只在长按已激活时**
  `preventDefault()`。轨道不能像拇指那样直接声明 `touch-action:none` —— 这条贴边带是常驻可命中的，
  平时要能从这里滑动页面；所以只能按「300ms 长按门槛 + 激活后接管手势」区分滚动与拖拽，
  这也正是那个门槛存在的意义。口径与 `useLyricsDragDrop` 的触摸滚动守卫一致（在首个 touchmove 上
  preventDefault，前提是起滚尚未发生 —— 长按要求手指在原地按满 300ms，起滚本就没开始）；
- 改法二（拇指）：`.v-scrollbar-thumb` 声明 `touch-action:none` —— 拇指是纯拖拽控件，由它独占这次手势
  即可，代价是「显形后被按住」那一段里从它身上起手的滑动不再滚页面（拇指只有 6px 宽，
  且隐藏态 `pointer-events:none` 时这条声明根本不参与命中）；
- 两条路径因此分工明确：拇指显形时按下即拖；拇指已淡出时在滚动条上任一处按住 300ms 再拖
  （长按跟随把拇指居中到手指处，随后持续跟随）；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过（`vScrollbar.scss` 的声明顺序
  经 `prettier-plugin-css-order` 重排，`touch-action` 落在 `pointer-events` 之前）；守卫的开关时机用
  一次性探针（`.temp/`，跑完即删；vite-node + jsdom 直接调真实的 `attachTrackClick`）实测 11 项：
  长按未激活时 touchmove 放行、长按激活后拦截且 `userSelect` 已禁、松手后放行并归还 `userSelect`、
  等待期内被 `pointercancel` 打断则长按不生效且此后放行、`trackClick:'none'` 永不拦截、
  两轴各自独立（x 轴长按激活不影响 y 轴那条带的放行）。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机上值得看：300ms 门槛对「按住就拖」的直觉是否偏长
  （与排序列表的 280ms 长按同一量级），以及长按等待期没有任何反馈。

### 优化 · 乐谱页窄屏收窄整体留白（2026-09-27）

- 症状：手机上乐谱三个 Tab 的内容都被一圈桌面档留白包着。「编辑歌词」是 `p-xl px-2xl`
  （1.5rem / 2rem，按 22.25px 根字号即 33px / 44px），390px 宽的屏上左右各吃掉 44px、
  正文可用宽度只剩 302px；「整曲预览」的滚动容器是 `p-lg`（22px）；
- 改法：给这两处仍按桌面档留白的容器补窄屏档，统一收到 0.5rem —— `ScoreLyricsEditor` 的
  `p-xl px-2xl` 改写为 `px-2xl py-xl max-md:px-sm max-md:py-sm`，`ScorePreviewPane` 的滚动容器
  `p-lg` 补 `max-md:p-sm`；
- 拆成长写是有意的：桌面档与窄屏档要落在**同一个工具类**上（`px-*` 对 `px-*`、`py-*` 对 `py-*`），
  否则 `p-*` 与 `px-*` 分属两个属性、谁压谁要另判样式表顺序。互动面板的 `max-md:pt-sm max-md:pl-sm`
  用的也是这个写法；
- 口径与既有的互动面板一致：`ScoreInteractiveArea` 的窄屏档本就是 0.5rem，三档现在同为 0.5rem，
  切 Tab 时留白不再忽宽忽窄；
- 预览的自适应页高不受影响：`containerHeight` 取的是**内容盒高**（本就排除内边距，见
  `isTallerThanViewport` 的注释），留白变小只是让自适应页高相应变大，超高判定随之自然平移；
- 未动 `BaseTextarea` 自身的 `p-xl`：那是控件内部的内边距、且为全站共用，不属于「页面留白」，
  为乐谱页去改它属范围蔓延（真机上若觉得字仍偏里，那是另一个诉求）；
- 验证：两个改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过（类名顺序已是
  Tailwind 的规范序，无需重排）；`max-md:` 变体压得住桌面档用**构建产物**实测确认（一次性探针读
  `dist/assets/*.css` 的字节偏移：基础类 `.p-lg` / `.px-2xl` / `.py-xl` 均在 36k~39k，
  `max-md:pt-sm` / `max-md:pl-sm` 在 68k+，即变体整块排在基础类之后，同特异性后者胜），
  本次新增的 `max-md:px-sm` / `max-md:py-sm` / `max-md:p-sm` 即该变体与产物中已有的
  `px-sm` / `py-sm` / `p-sm` 的组合。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机上值得看 0.5rem 在 390px 屏上是否偏紧。

### 优化 · 触屏上不再显示悬停提示（tooltip）（2026-09-27）

- 症状：手机上点按顶栏图标 / 面板按钮都会弹一枚提示，盖住内容；而且**没有任何「移开指针」的动作
  能把它收掉** —— 得再点别处；
- 根因：触屏没有 hover，但浏览器会把点按**合成**为 `mouseenter`（Android 还会把焦点交给按钮并派发
  `focus`）。`v-tooltip` 的四个监听（`mouseenter` / `mouseleave` / `focus` / `blur`）本就按「有指针」
  这个假设挂，于是每次点按都完整走一遍「悬停显示」；
- 改法一：新增 `canHover()`（`(hover: hover)`）—— 与 `TopHeader` 的 `canHover`、`AddSlot` 的
  `(hover: none)` 变体同一口径（不用 `(pointer: coarse)`：二合一设备接上鼠标后是 hover，不该误降级）。
  取不到 `matchMedia` 的环境（jsdom / 老浏览器）按「有悬停」处理：宁可照常显示，也不要静默不显示；
- 改法二：三个 hover 调用点（悬停进入、挂载期的初始 `:hover` 检查、被 disabled 夺焦后的补显示）
  收口到一个 `showOnHover` 入口，一处判、三处共用。挂载期那条**必须一起拦**：触屏的 `:hover` 会
  「黏住」（点过的元素一直保持 hover 直到点别处），不拦的话挂载即弹；
- 改法三：`onFocus` 在无悬停能力的设备上只认「键盘来的焦点」（`:focus-visible`）—— 点按带来的 focus
  挡掉，无障碍路径（Tab / 快捷键聚焦）原样保留。判据问 `document.activeElement` 而不是 `el`：
  委托模式下焦点落在宿主的后代上，`el` 自身并不匹配；
- `manual` 模式刻意不经 `showOnHover`：那是程序驱动的读数气泡（滑块数值），触屏上拖滑块正需要它；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；新增
  `tests/ui/directives/vTooltipHoverCapability.test.ts`（5 例），`vitest run tests/ui/directives/`
  4 文件 13 例全绿（含既有 3 个 tooltip 用例，确认桌面路径无回归 —— 它们在无 `matchMedia` 的 jsdom 里
  跑的正是「按有悬停处理」这条回落）。另做了一次突变检查：把 `canHover()` 临时固定为 true 后，
  三条触屏用例如期失败（`expected 'visible' to be 'hidden'`）而 `manual` 与桌面两条仍绿，
  证明用例不是空跑。用例里的 `attachTo: document.body` 是必需项而非习惯：jsdom 对**游离**元素调
  `focus()` 是空操作（不派发事件、`activeElement` 也不动），不挂进文档那条永远绿不了。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机上值得看：长按图标时是否还有
  浏览器自身的 `title` / 长按菜单冒出来（那是 UA 行为，指令管不到）。

### 优化 · 乐谱 Tab 栏窄档降档：高度明显低于顶栏第一行（2026-09-27）

- 症状：手机上乐谱页三个 Tab（编辑歌词 / 排列和弦 / 预览）偏大 —— 三项自然宽 ≈ 284px；更突出的是**高度**：
  窄档 Tab 栏独占一行，原先给死的 `h-10`（2.5rem ≈ 55.6px）与顶栏第一行（`min-h-10`，同为 2.5rem）
  **严格等高**，tab 看上去和顶栏那排图标钮一个量级 —— 等于顶栏凭空多出一条一样厚的横杠；
- 改法一（档位）：Tab 栏的分段控件 `:size` 由静态 `lg` 改为 `isNarrow ? 'md' : 'lg'`（< md，768px 降档）。
  项由 `px-3 text-xs` 变 `px-3 text-2xs`（字号 0.75rem → 0.625rem，按 22.25px 根字号即 16.7px → 13.9px），
  三项自然宽随之收到 ≈ 256px，390px 屏上顶栏那一条更宽裕；
- 改法二（行高）：`scoreTabRowClass` 的窄档由 `h-10` 收到手机档 `h-7`（1.75rem ≈ 39px）、桌面窄档 `h-8`
  （2rem ≈ 44.5px）。**这两处必须一起改**：控件走 `full-height`，`size` 档自带的高度被 `controlClasses` 的
  `fullHeight ? 'h-full' : sizeConfig.wrapper` 短路掉，**tab 的高度就是这一行的高度**（项 `self-stretch`、
  下划线贴行底）—— 只降字号的话，tab 看上去仍是原来那么大；
- 改法三（分割线）：窄档本行另加 `border-t border-glass-border` —— 本行已经矮于顶栏第一行，但两者底色同为
  `bg-surface-panel`、中间只隔 `gap-y-xs`（6px），不加线时它看着仍像顶栏那行的下半截。线料与顶栏自身的
  `border-b` 一致（`SidebarLeft` 的面板底栏也是这条）；宽度随本行，顶栏有 `px-md` 内边距，故它是内缩的
  「内部分隔线」，不是通栏的那条。宽档（≥ lg）本行是 `absolute inset-0` 的一层、与左右两组同一行，
  没有可分隔的两行，不给线；
- 高度按「本行要明显低于顶栏第一行」取，不按控件档位自身的高度取（`lg` 2.3rem / `md` 1.9rem 同样贴近 2.5rem）：
  两个窄档现在都明显矮于顶栏那一行，彼此也差一档；手机档顶栏总高从
  2.5 + 0.375（两行之间的 `gap-y-xs`）+ 2.5 = 5.375rem ≈ 120px 收到 2.5 + 0.375 + 1.75 = 4.625rem ≈ 103px；
- 不会退回「下划线贴住文字」：项是 `leading-none`（字高 = 字号），行高 H 下的留白 =（H − 字高）/ 2 − 2px
  （下划线 2px 贴行底）—— 手机档 13.9px 字 ⇒ ≈ 10.5px、桌面窄档 16.7px 字 ⇒ ≈ 11.9px，都还是清晰的一段间距；
- 判据取脚本里的 `isNarrow` 而非 `max-md:` 变体：本文件的窄屏取舍一律走 `isNarrow` / `isTabRowOwnLine` /
  `isActionFold`，与导航分段器的 `:compacted` / `:icon-only` 同一处判据，不另引一条样式表顺序的依赖；
- 未动 `isTabRowOwnLine` 的 ≈ 952px 阈值：它算的是 ≥ lg 那一档的 284px 栏宽，桌面档仍是 `lg`，取值不变
  （手机档栏变窄只会让该阈值更保守，不会误判）；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机上值得看：13.9px 的字号是否偏小、39px 的行高按下去是否够、以及
  整条顶栏（≈ 103px）与页面其余留白是否协调。

### 新增 · 触屏长按 = 右键：卡片菜单在手机上可达，拖拽接管时自动收起（2026-09-27）

- 症状：全仓四个卡片菜单（乐谱卡 / 和弦分组头 / 和弦卡 / 预览页）都挂在 `BaseMenu` 的
  `trigger="contextmenu"` 上，即**右键**；触屏没有右键，此前也没有任何「长按 → 合成 contextmenu」的桥接 ——
  这些菜单在手机上根本打不开（只有 iOS Safari 平台自带的长按菜单能顶一下，且内容不受我们控制）；
- 改法（平台侧，一处）：`useSortableList` 新增可选能力 `longPressMenu: { onDismiss }`。触摸按下落在**本容器内**
  即起 280ms 计时（`DRAG_LONG_PRESS_DELAY`，与 sortable 起拖预备同一时长）；到点在**按下的那个元素**上派发一个
  合成 `contextmenu`（`bubbles` + `composed`，坐标即按下点），宿主已有的容器级委托（`@contextmenu` 按
  `[data-song-id]` / 分组头 / 卡片反查）原样复用 —— 本组合式不碰菜单实现，也不认目标是谁；
- 同一手势的另外两条出口：等待期内滑动超过 `DRAG_TOUCH_SLOP`（10px）即放弃长按（判为用户想滚动），
  到点前抬手同样取消 —— 与 sortable 那档容差同口径，互不抢手势；
- 收起：菜单弹出后手指开始移动、越过 `DRAG_ACTIVATE_THRESHOLD`（5px，与影像起浮同一阈值）即调 `onDismiss`，
  由宿主收起**自己那一个**菜单（`SongSection` 收列表级单例；`GroupSection` 收它的 header / card 两个，
  `closeMenu` 幂等）—— 刻意不调 `closeAllPopovers`，全局关闭会误伤他人浮层；
- 守卫（不改它会「长按后拖不动」）：`onContextMenu` 的「右键 = 取消排序」分支在 `dragActive` 时会置
  `dropCancelled` 并补发一个 `button: 2` 的合成 `pointerup`。合成的那次 `contextmenu` 必须跳过它，
  否则长按弹菜单会当场把已武装的拖拽打断。用 `isLongPressContextMenu` 标志在派发前后夹住（`try/finally`），
  只挡自己这一次派发，不影响真实右键；
- 已知边界（未处理）：拖拽进行中再来一根手指长按，仍会弹菜单（sortable 那边会因 `dragEl` 已存在而早退，
  但本组合式的长按与它无关）—— 单指手势下不可达，暂不为此加闸；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；一次性探针（`.temp/`，跑完即删；
  jsdom + 真实 sortablejs + 真实 `useSortableList`）13 条断言全过，覆盖：长按到点弹菜单且坐标 = 按下点、
  不误发 `button: 2` 的 pointerup、菜单弹出后移动收起**恰好一次**（继续移不重复）、等待期内滑动 > 10px 放弃、
  到点前抬手不弹、拖拽已武装时（`body.is-global-dragging` + 影像在场）长按仍弹菜单**且拖拽存活**，
  以及正对照（真右键确实补发 `button: 2` 的 pointerup 并结束拖拽，证明前一条断言不是恒真）；
- 验证环境上值得记一笔：vite-node 在跑入口前就会 require `@vue/runtime-dom`，而它在模块求值期缓存
  `typeof document !== 'undefined' ? document : null` —— jsdom 全局必须由 `node --import` 抢在前面装，
  入口文件里再设已经晚了（`doc` 恒为 null）；另需把 `window.*` 定时器换成 Node 的那套（被测代码用
  `window.setTimeout` 起、裸 `clearTimeout` 取消，两套实现混用会静默取消失败）；
- 类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机待看：长按弹菜单的手感（与「起拖预备」同拍）、
  菜单弹出后拖动收起是否跟手、iOS Safari 平台自带长按菜单是否与合成 contextmenu 打架。

### 优化 · 排列和弦窄屏：字符与指板图卡缩到 0.7、行间 gap 收到 1/3（2026-09-27）

- 症状：手机上排列和弦里一个字符是 19.5px（`0.875rem` × 22.25px 根字号，即本项目的 `text-sm` 档）、
  一张六弦四品指板图卡是 101 × 130px（基准缩放 1.4）—— 一行既装不下几个字、也装不下几张图，
  而排列和弦恰恰要「一眼看到一行怎么排」；行与行之间还隔着 `gap-xs`（8.3px），
  一行行看下去像被推开的；
- 改法一（整体缩放）：`ScoreInteractiveArea` 算一个视口系数（`isMobile` ⇒ 0.7，否则 1），
  **两个消费方吃同一个值** —— 字走 CSS（容器上的 `--score-font-scale`，`min-h` 与行高都由它派生，
  故一起等比缩）；指板是画布、尺寸走 JS，由新增的 `ChordSlot.scaleFactor` prop 递进去、
  乘在「1.4 × 用户的和弦缩放」上。两处必须同源：只缩字的话指板反而更显大，比例失衡。
  0.7 把字符落到 ≈ 13.6px（`text-2xs` 档 13.9px 上下）、图卡落到 71 × 91px；
- 改法二（行间 gap）：容器的 `gap-xs` 在窄屏收到 `gap-3xs`（8.3px → 2.8px，`max-md:` 变体，
  与本容器既有的 `max-md:pt-sm` / `max-md:pl-sm` 同一处写法）。收到的量级与槽内「图卡 ↔ 字符」
  的间距（`is-content-slot` 的 `gap-xs`）同拍，纵向节奏才一致 —— 行间比行内还宽会显得整块松散；
- 系数不写进 store：`arrangeFontScale` / `arrangeFretboardScale` 是用户偏好（换设备该保留），
  本系数是同一份偏好在窄屏上的呈现，两者相乘 —— 再想微调由顶栏偏好里的「字号 / 和弦缩放」承担；
- 判据用 `useResponsive` 的 `isMobile`（< md，768px）：窄屏下侧栏是抽屉（< lg 才切）、不占宽度，
  内容区宽 = 视口宽，媒体查询量得准（`useResponsive` 文件头记的正是「什么时候能用断点、什么时候必须实测」）；
  桌面与平板档不动；
- 只影响排列和弦（编辑视图）：`SLOT_GLYPH_CLASS` 只有 `ScoreInteractiveArea` 与 `SlotGlyph` 两处消费，
  `ChordSlot` 也只有它一个调用点；预览 / 导出那一路走 `previewFontScale` / `previewFretboardScale`，未动；
- 行高不必同步改：`--score-line-height-chord` / `-plain` 与离屏行的占位高度都是**实测**的
  （`measureLineRowHeights`），字与指板缩了它们自己会跟着变（0.7 档下带卡行 ≈ 118px，仍贴着 120px 兜底）；
- 验证：改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；尺寸由一次性探针
  （`.temp/`，跑完即删）实测：指板基准几何 72 × 93.2（scale 1）⇒ 编辑器 1.4 档 101 × 130；
  ×0.8 为 81 × 104 / 字符 15.6px，×0.7 为 71 × 91 / 字符 13.6px。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：13.6px 的字在手机上是否偏小、71px 的图卡里品号是否还看得清，
  以及 2.8px 的行间 gap 会不会让相邻两行的图卡显得贴在一起。

### 优化 · 移动端：边缘滚动钮贴边、编辑歌词字号降一档（2026-09-27）

- 症状一（排列和弦）：右下角两枚边缘滚动钮离屏幕边缘太远 —— `right: 2rem`（22.25px 根字号下 ≈ 44.5px，
  近一成屏宽）、`bottom: 7rem / 4rem`（≈ 155.8 / 89px），拇指要跨过去才够得着；
- 改法一：窄屏 `right` 收到 `1rem`（≈ 22.25px，与本平台浮动元件的默认边距同值：`floatingPositions` 的
  `ALIGN_CLASS_MAP` `end: right-4`），纵向 `7rem / 4rem` → `5rem / 2.5rem`（≈ 111 / 55.6px）：
  两钮间距不变，整摞下移后顶边 ≈ 6.5rem，正好与本容器给窄屏预留的底部留白
  （`max-md:pb-[calc(6.5rem+…)]`）对齐。判据走脚本里的 `isMobile`，桌面档不动；
- 症状二（编辑歌词）：文本域自带 `text-base/relaxed`（1rem ≈ 22.25px），手机上只装得下十来个字一行；
- 改法二：窄屏降到 `text-xs/relaxed`（0.75rem ≈ 16.7px）。定在 text-xs 有两个理由：① 与本项目其它
  输入控件同档（`BaseInput` 的 `FONT_SIZE_CLASS` md 档即 text-xs）；② 它略高于 16px —— iOS Safari
  对字号 < 16px 的输入框会在聚焦时把整页放大，这一档正好不触发。字号写死在文本域自身（组件根是包裹层），
  故用后代变体 `max-md:[&_textarea]:` 打到它；带 `/relaxed` 是**刻意保留**原来的行高比
  （`text-xs` 自带的 1.333 会顺带把歌词行压紧）。桌面档不动；
- 顺带核实（并**纠正此前的一条误判**）：本项目 `html` 的根字号是 22.25px，但 Tailwind 的断点是 rem 定义的
  （`--breakpoint-md: 48rem`）—— 媒体查询里的 `rem` 认的是**浏览器初始字号（16px）**，与应用根字号无关。
  故 `max-md:` 就是 `@media (width < 48rem)` = **< 768px**，`lg:` = < 1024px。此前记的「< 1068px」是把
  根字号 22.25px 乘进 rem 得到的，属误判；即 CSS 侧断点与 `useResponsive`（vueuse 的 px 断点，md = 768px）
  **本来就是一致的**，不存在「768 至 1068px 留白 / 字号已收、而 `viewScale` 没收」的错位段。
  已用浏览器实测钉住：`matchMedia('(width < 48rem)')` 在 767px 为 true、768px 为 false；
  `(width < 64rem)` 在 1023px 为 true、1024px 为 false；而当时的 `documentElement` 字号确为 22.25px。
  本次两处仍按各自文件的既有写法取 `max-md:` —— 它本来就跟 `useResponsive` 同拍；
- 验证：三个文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；Tailwind 类由一次性探针
  （`.temp/`，跑完即删；直接调 `tailwindcss` 的 `compile()` 出 CSS）确认生成：
  `max-md:[&_textarea]:text-xs/relaxed` → `@media (width < 48rem) { .… textarea { font-size: var(--text-xs);
line-height: var(--leading-relaxed) } }`；`gap-3xs` 的键在构建产物的主题段里（`--spacing-3xs: .125rem`）。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：16.7px 的歌词字号是否合适、
  贴边后的两枚按钮是否与系统手势条打架（`bottom` 已叠加 `env(safe-area-inset-bottom)`）。

### 修复 · 和弦选择面板卡片被挤压：网格按面板宽度分 3 / 2 列（2026-09-27 / 2026-09-28）

- 症状：和弦选择面板（ChordPickerPanel）的卡片整片挤在一起，相邻卡片的指板图互相压叠；
- 根因：卡内指板画布是**固定几何** —— `FretboardCanvas` 的 `cssWidth = 布局基准宽 × scale`，
  picker 取 `pickerScale = 1.6`（6 弦 4 品下基准宽 72 ⇒ ≈ 115px），宽度既不随列宽收缩也不换行。
  而列宽 =（面板宽 − 2×px-lg − 2×gap-md）/ 列数，面板宽恒为 520px（外壳再施加 92vw 上限），
  卡片自身还要吃掉 p-2 与边框。逐档算下来：
  - 3 列 · 面板满宽 520px：列宽 ≈ 147px、卡内容宽 ≈ 122.5px —— 画布 115px，余 7px；
  - 3 列 · 手机 390px（面板 92vw ≈ 359px）：列宽 ≈ 94px、卡内容宽 ≈ 69px —— 画布溢出 **46px**；
  - 2 列 · 面板满宽：列宽 ≈ 229px、卡内容宽 ≈ 204px（画布两侧各余 45px）；
  - 2 列 · 手机：列宽 ≈ 149px、卡内容宽 ≈ 124px（余 9px）。
- 2026-09-27 先整体降到 2 列（3 列在窄视口下破功，且当时只求「不再挤压」）；
  2026-09-28 按用户诉求改为「**宽屏 3 列、窄屏 2 列**」—— 3 列在面板满宽这一段其实成立，
  破功的是「面板被 92vw 压窄」之后，而这两件事可以分开判。本小节记的是**最终状态**；
- 改法：`PICKER_GRID_COLS = 2` 常量改为 `pickerGridCols` 计算属性
  （`useMediaQuery('(min-width: 565px)')` ⇒ 3，否则 2），模板行网格同步改为
  `pickerGridCols === 3 ? 'grid-cols-3' : 'grid-cols-2'`。两处必须同步 —— 前者喂
  `v-grid-nav` 的换行判据与 `buildPickerRowPlan` 的行切分，后者才是真实布局。
  卡片尺寸、行高与 `pickerScale` 均不动，虚拟化行规划按新列数自动重算（分区高度随行规划变）；
- 阈值 565px 怎么来的：面板宽恒为 `min(520, 92vw)`，故 92vw ≥ 520 ⟺ 视口 ≥ 565px ——
  这正是「面板不再被压窄」的那一点。真临界（卡内容宽压到 115px）在面板 497.6px、即视口 541px，
  取 565 是留一档安全余量。阈值留在组件内而不进 `useResponsive`：它是几何算出来的
  「这一行还放不放得下 3 列」，不是布局断点（同 TopHeader 的 isActionFold，见该文件头）；
- 列数变化后必须重算行窗口：行切分随列数变，而窗口里缓存的 `[first, last]` 是**旧行号** ——
  3 列切出的行数少于 2 列，退回 2 列后仍按旧区间 slice，视口下半段的行就不会被挂载
  （表现为分区内整片空白）。故加 `watch(pickerGridCols, () => { refresh(); updateWindow(); })`。
  尺寸观察者接不住这一档：它只同步滚动状态、不重算窗口（见 useRowWindowing 的 getPlans 说明）；
- 已知边界：7 / 8 弦调弦（`SEVEN_*` / `EIGHT_*`）的画布为 129 / 143px，两种列数下都会溢出 ——
  这是既有状况（手机 390px 下 2 列的内容宽只有 123.6px），不是本次引入的；也不值得把列数
  再绑上「库里最宽的指法」，那会让一张 8 弦和弦拖累整个面板；
- 验证：`.temp/` 一次性探针（Chromium 真渲染，跑完即删），复用 dist 的真样式表 ＋ 复刻真实
  DOM 链（aside → body → 滚动区 px-lg → 行网格 gap-md → 卡片 border + p-2 → 115px 画布）。
  实测（视口 → 面板宽 / 行宽 / 卡内容宽 / 画布）：1440 / 1024 / 768 / 640 / 566 →
  520 / 473.5 / **122.45** / 115，全部放得下；565 → 519.8 / 473.3 / 122.39；
  562 → 517.0 / 470.5 / 121.47；**541 → 497.7 / 451.2 / 115.03（正是临界点）**；
  480 → 441.6 / 395.1 / 96.31（此档已是 2 列）；390 → 358.8 / 312.3 / 68.72；
  320 → 294.4 / 247.9 / 47.25。即 565px 及以上 3 列全部放得下（阈值处余 7.4px），
  541px 起必须退 2 列 —— 与算式逐档吻合；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：宽屏 3 列下卡片是否显得偏空（每列 147px 里画布只占 115px）、
  窄视口（< 565px）切 2 列时是否有「重排一下才落定」的观感（列数变化会重算行窗口）、
  键盘上下方向键在两种列数下换行是否正确。

### 修复 · 分段控件吃掉横向滚动：横滚带里的页签滚不动（2026-09-27）

- 症状：和弦选择面板顶部「分组页签」与底部「分区定位」两条横向滚动带，手指落在分段控件上横滑滚不动；
  落在当前选中的那一段上更会变成「拖滑块」—— 滑块跟手移出去、松手又弹回原处（或直接切到别组），
  观感就是「拖了一下又被取消」；
- 根因：`BaseSegmentedControl` 的根类里写死 `touch-pan-y`（`touch-action: pan-y`），横向手势因此被
  组件独占（本意是给「拖动滑块切换」用），外层横滚轴拿不到这次手势；同时 `useSegmentedDrag` 会把
  激活块上的横滑解释成拖动切换。两套语义对同一套手势的归属互相矛盾，且谁也退不了让；
- 改法：组件本就提供 `noDrag`（关掉拖动切换），现在让 `touch-action` 随之分流 ——
  `props.noDrag ? 'touch-auto' : 'touch-pan-y'`，即「不拖了就把横向手势让回外层」。面板的两处横滚带
  （分组页签、分区定位）都补上 `no-drag`。点击切换不受影响，只是少了「按住拖滑块」这条快捷方式 ——
  在横滚带里这两者手势完全相同，必须二选一，横滑优先给滚动；
- 未改：全仓只有这两处把分段控件放进横向滚动容器（已核），其余位置仍保留拖动切换；
- 验证：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`touch-auto` / `touch-pan-y` 的产物
  由一次性探针（`.temp/`，跑完即删；直接调 `tailwindcss` 的 `compile()`）确认：
  `.touch-auto { touch-action: auto }`、`.touch-pan-y { touch-action: var(--tw-pan-x,) var(--tw-pan-y,) var(--tw-pinch-zoom,) }`。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：页签条横滑是否顺畅、
  点击切换分组是否仍准确。

### 修复 · 触摸端长按拖拽刚起来就被自己取消（2026-09-27）

- 症状：触摸端长按面板卡片起拖（ghost 已出现）后拖拽立刻中断，卡片「拖不出去」；
- 根因：`useLyricsDragDrop` 在指针会话期间于 window 捕获阶段挂 `preventContextMenu`，其中
  「拖拽中右键 ⇒ 取消本次拖拽」这一条是按鼠标写的，却同时接住了触摸端**长按产生的 contextmenu**。
  时序上拖拽由长按起来（`LONG_PRESS_DELAY` 280ms），而系统长按菜单通常要再过一两百毫秒才派发 ——
  于是每次长按起拖都必然「刚起来就被自己取消」；
- 改法：取消只认鼠标（`isDragging.value && startPointer.pointerType !== 'touch'`），触摸端只屏蔽菜单、
  会话继续到抬手落地；顺带把屏蔽条件从「拖拽中」放宽到「按压登记中」（加 `activeChord !== null`）——
  本监听本就只在指针会话存续期间挂着（`beginPointerSession` 挂、`resetDragState` 摘），「挂着」即
  「正在拖 / 正在等长按」，长按等待期同样不该弹菜单（系统菜单一弹，手势就被浏览器接管，长按起拖永远轮不到）；
- 验证：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：长按起拖后系统菜单是否还弹、松手落地是否正常、
  槽位端（内部拖拽源）长按起拖是否同样不再被取消。

### 调整 · 拖拽排序的影像抬升幅度：1.02 → 1.04（2026-09-27）

- 症状：拖拽排序起拖后看不出「卡片被拎起来了」—— 影像的放大只有 1.02，与阴影渐入叠在一起几乎无感；
- 改法：`PREVIEW_SCALE` 1.02 → 1.04。抓取点补偿公式（`activatePreview`）与落定关键帧
  （`settlePreview`）都读同一个常量，自动跟着走，不必逐处调整；
- 试过又撤掉的方案一：给影像**内层副本**加一段 `scale(1 / PREVIEW_SCALE) → scale(1)` 的 WAAPI 入场放大，
  想让放大「长起来」而不是一出现就是终值。**已回退** —— 那次调用落在 `activatePreview` 中段，
  一旦某环境没有 `Element.animate`（或它抛错），后面的定位、隐藏原位元素、加全局拖拽态就全都不执行，
  表现为「拖了没反应」；
- 试过又撤掉的方案二：在按下时给被按项挂放大类（触摸端长按等待期的反馈）。时机不对 ——
  拖拽还没触发就先放大了，且是瞬时跳变，观感生硬。「拎起来」属于已经起拖的影像；
- 验证：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：4% 是否够、鼠标端与触摸端是否都能正常起拖。

### 修复 · 手机上点顶栏「试听当前和弦」毫无反应（2026-09-27）

- 症状：触摸端轻点顶栏的播放按钮没有任何反应（图标不变、不出声），桌面鼠标端同一枚按钮一切正常；
- 根因：`ActionButton` 的 holdable 状态机把「指针离开按钮」一律当作**取消**（按下后滑出去再松手 ⇒
  本次按压作废，并抑制随后可能派发的 click）。这条判据是按鼠标写的 —— 鼠标松手时指针停在原地，
  `pointerup` 之后不会再有 `pointerleave`。**触摸端不成立**：触点抬起时浏览器释放触摸的**隐式指针捕获**，
  且触点本身已消失，于是补发一次 `pointerout` / `pointerleave`。Chromium 触摸模拟实测事件序为
  `pointerdown → pointerup → pointerout → pointerleave → click`（鼠标端为 `pointerdown → pointerup → click`），
  那一次 leave 撞上「取消 ⇒ `suppressClick = true`」，紧接着的原生 click 就被自己的吞没协议吃掉。
  全仓只有顶栏这一枚按钮是 `holdable`，故症状恰好只落在它身上、且只在触摸端发作；
- 改法：新增 `isPressActive` 单独记账「本次按压是否仍在进行中」（pointerdown 起，pointerup / leave / cancel 止），
  `endHoldPress` 开头据此早退 —— 已结算过的指针序列不再重复结算，更不会把「已松手」误判成
  「按住时滑出」。真正的取消（鼠标按住后滑出、`pointercancel`）行为不变；
  `abortHold`（禁用 / 卸载中止）一并把标志归位，避免中止后残留一个「仍在按压」的假状态；
- 为何不直接删掉取消：按下后拖出按钮再松手仍须作废，否则会误触发一次动作。要区分的是两类 leave，
  不是要不要 leave；
- 回归锚点：新增 `tests/ui/button/actionButtonHoldable.test.ts`（7 例）——触摸端轻点 / 鼠标端轻点 /
  触摸端连点两次必须派发 click，长按达阈值派发 hold-start、松手派发 hold-end 并吞掉次生 click，
  未达阈值不进入持续态，鼠标端按住滑出与 `pointercancel` 仍作废。移除本守卫复跑，触摸端轻点两例如期失败；
- 验证：`vitest run --project ui tests/ui/button/actionButtonHoldable.test.ts` 7/7 通过、
  `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：轻点是否立即出声（首次点击含音频懒加载，图标会先转「受理中」）、
  长按持续发声与松手停止是否照常。

### 调整 · 指板的滚动拦截收窄到品格区（2026-09-27）

- 症状：手机上手指落在指板任何位置都滚不动外层容器 —— 名字区、空弦区、板身留白一概如此；
- 根因：`Fretboard.vue` 的根节点带 `touch-action: none`，而它作用于**整棵子树**。想只拦品格区在 CSS 层
  无解：`touch-action` 只认命中元素及其祖先链的**交集**，而品格区的命中目标一半是 SVG 内的音符 / 横按梁
  （`pointer-events: auto`）。实测（Chromium 触摸模拟，同批探针里 DOM 元素上的同一属性正常生效，
  故已排除探针本身的问题）**SVG 子元素上的 `touch-action: none` 被浏览器忽略** ——
  既不能只给网格那一片，也不能给网格内的音符；
- 改法：根上换成 `touch-manipulation`（放开纵向滚动、仍压住双击缩放 —— 改前由 `none` 顺带压住的那条，
  本项目的 viewport 未禁缩放，不能漏），品格区的拦截改由 `useFretboardInteraction` 的 touchmove 守卫
  按**起手位置**逐次判定：起手落在 1..fretCount 品格内则 `preventDefault`，
  其余（名字区 / 空弦区 / 板身左右与底部留白）一律放行。两个细节是要害 ——
  监听必须**非被动**（浏览器会等回调返回再决定起不起滚，第一帧的 preventDefault 才拦得住整段手势），
  起手登记必须放在**捕获阶段**（名字区在自己的 pointerdown 上 stop 了冒泡，否则标志会滞留在上一次手势的判定上，
  「上一次在品格区拖动、这一次在名字区上滑」会被误拦）；
- 只在 touchmove 上拦，轻点与「微动几像素再松手」的合成 click 均不受影响；
- 代价：指板因此成为「非快速可滚区」，手指落在其上滚动时由主线程裁决（多几毫秒）。按区域拦截绕不开；
- 回归锚点：新增 `tests/ui/composables/useFretboardInteraction.test.ts`（7 例）——品格区起手拦下、
  空弦区 / 名字区 / 底部留白放行、判定只看起手位置、名字区起手必须被捕获阶段收到、鼠标起手不拦。
  去掉 `{ capture: true }` 或把判据放宽到整个指板，对应用例如期失败；
- 验证：该文件 7/7 通过；`tests/composables/fretboardPoint.test.ts` 13/13 通过（它是本次判定所依赖的
  「坐标 → 区域」反算的既有锚点，名字区 / 空弦区 / 越界三种情形本就在其中）；`eslint --max-warnings 0`
  0 问题、`prettier --check` 通过；`touch-manipulation` 的产物由一次性探针确认（`.temp/`，跑完即删）：
  `touch-action: manipulation`。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：品格区内拖动是否照常绘制与连续落笔、名字区 / 空弦区 / 留白处上滑是否滚得动、
  双击指板是否不缩放。

### 新增 · 排列和弦的固定拖拽取消区（2026-09-27）

- 需求：排列和弦里起拖之后没有「放弃」的出口 —— 落点无有效槽位固然不会落地，但用户无从判断
  「松手会怎样」，触摸端尤其如此（手指压着槽位，看不到落点边框）；
- 改法：视口底部居中加一块固定的「拖到此处取消」提示条（`ScoreInteractiveArea` 的 `Teleport` 里，
  与拖拽影像同处），只在拖拽会话期间出现 —— 位置固定、不跟手；松手即取消本次拖拽；
- 两档视觉刻意分开「待命」与「就绪」（2026-09-28 补）：**待命态半透明**（`opacity-70`，仍能看清是
  一块可放下的区域，但不会把「松手就取消」误读成默认落点），指针悬到它上面时透明度补满、
  **轻微放大**（`scale-105`）并把描边由虚线转实线、配色转 `danger`，三样一起确认「此刻松手是取消」。
  三样必须走同一条过渡，故 transition 取 `all` 而不是 `transition-colors` —— 后者只覆盖颜色，
  缩放与透明度会瞬跳。缩放用 Tailwind 的 `scale-*`（写 `scale` 独立属性）而不是拼 `transform`：
  与同元素上已有的 `-translate-x-1/2`（写 `translate` 独立属性）互不覆盖，两者天然叠加；
- 入场出场过渡（2026-09-28 补）：本区此前是裸 `v-if`，瞬现瞬没。改挂 `v-transition-scale`
  （transitions.scss 的「缩放微弹淡入淡出」档）—— 与它「拖拽期间才在、会话一结束就走」的浮层形态
  同构，比瞬现瞬没自然。对**矩形命中**无影响：本区只在起拖那一刻挂上（指针还在源槽位上、
  离视口底部很远）、松手之后才摘，过渡期间不会有任何一次命中判定；
- 这一改必须**多包一层**（过渡挂外层，视觉与 `setCancelZoneEl` 留内层），不是随手加的：
  `v-transition-scale` 往挂载元素上写 `opacity`，与本区自己的 `opacity-*`（待命 0.7 / 就绪 1）
  同属性、同特异性，胜负只看源序 —— `transitions.scss` 由 `main.scss` 在 Tailwind 工具层**之后**
  引入（产物实测：`.v-transition-scale-enter-from` 在字节 79078、`.opacity-100` 在 43005），
  过渡类因此压过工具类。单元素写法下入场会一路淡到 1、再在过渡类摘掉时跌回 0.7；
  出场更糟 —— 起始态被抬到 1，先「亮一下」再淡出。拆两层后外层的 0→1 与内层的 0.7 是相乘关系，
  两端都连续。命中的矩形仍取内层（它就是那个可见的盒子），外层只承担定位与过渡的 transform；
- 命中判定走**矩形**而不是 `elementFromPoint`：提示条刻意 `pointer-events: none`，
  若让它接管指针，内部源（槽位拖拽）的落点解析会被它先命中 —— `closest('[data-slot-key]')`
  与 `.interactive-score-zone` 两条都命中不到，等于把整片落点清空。矩形命中放在
  `useLyricsDragDrop` 的 `applyCancelZone`，内部源与外部源（选器和弦面板）两条路径共用；
- 判据必须落在**合帧回调内部**、不能放在 `schedule` 那一侧：松手时两条落点节流都会被 `flush` 一次，
  而 `flush` 绕过 `schedule` 直接拿「最后一帧的位置」执行 —— 判据留在 `schedule` 侧的话，
  那次 flush 会用「进入取消区之前」的旧坐标把落点写回去，松手反而落到某个槽上；
- 取消不需要额外的落地分支：清空落点即等价于「松手不落地」（`resolveLandingAction` 的准入判据
  本就要求 `dragOverSlotKey` 非空）；
- 纵向落位是**贴底**的 1.5rem（+ 安全区）：起先按「避开边缘自动滚动的判定带宽（50px，
  `usePointerEdgeAutoScroll`）」放在 5rem，观感上明显偏上，故改回贴底，并由 `handleGlobalPointerMove`
  在指针悬到本区上时**停掉**自动滚动 —— 否则一边「想取消」一边把谱面滚下去。
  这里必须显式 `stopAutoScroll()` 而不是跳过 `checkAutoScroll` 调用：那个循环的每帧读的是
  「最近一次上报的位置」，只跳过调用等于让它拿着进区前的旧位置继续滚。判据取上一帧的
  `isOverCancelZone`（合帧回调写入），不在 pointermove 里现读矩形 —— 那等于在指针热路径上强制布局，
  而差这一帧最多多滚 14px（`MAX_SCROLL_SPEED`）。层级取 `--z-fab`（高于谱面内容，
  与右侧两枚边缘滚动钮同层、水平位置不重叠）；
- 回归锚点：`tests/ui/composables/useLyricsDragDrop.test.ts` 增 4 例（沿用该文件既有的拖拽夹具）——
  ①「悬到取消区上 ⇒ 落点清空、`isOverCancelZone` 置位」、②「取消区之外的同一位置 ⇒ 落点照常命中槽位」
  （①的正对照；`elementFromPoint` 恒返回槽位元素，取消区一旦失效落点就会落到它身上）、
  ③「悬到取消区上 ⇒ 边缘自动滚动停住」、④「同一条底边带上没命中取消区 ⇒ 照常滚」（③的正对照，
  取消区照挂、只挪到指针够不着的地方，压住的是「悬停命中」而不是「挂没挂」）。
  三次变异复跑均已验证锚点有效：去掉取消区判据、把判据从合帧回调挪到 `schedule` 那一侧
  （后者正是上面「判据必须在合帧回调内」那条的现场：同一帧内先排队的槽位位置会把落点写回去）、
  去掉自动滚动门控（③如期失败：`scrollTop` 8.4 → 25.76）；
- 验证：`vitest run --project ui tests/ui/composables/useLyricsDragDrop.test.ts` 7/7 通过、
  `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：长按起拖后拖到底部提示条是否变红、松手是否取消（原槽位不变）、
  提示条与「滚动到底部」钮是否互不遮挡、悬停提示条时谱面是否停住不滚。
  补记（2026-09-28 的两档视觉与入场出场过渡）：改的是模板与类名，`useLyricsDragDrop` 与它那 4 例
  一字未动（测试自己造元素、自己 stub `getBoundingClientRect`，与组件 DOM 结构无关），故未复跑；
  那两个改动只跑了 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。真机另需看：
  起拖时提示条是否淡入弹出（不是瞬现）、松手后是否淡出（不是瞬没、且淡出前没有先「亮一下」）、
  悬到提示条上时半透明 → 实色 + 轻微放大的过渡是否平滑。

### 优化 · 「移动至新分组」弹窗在窄屏改 2 列（2026-09-27）

- 症状：手机（< 768px）上该弹窗是 3 列，每格只剩约 100px，分组名与计数挤成一团
  （和弦选择面板此前同样从 3 列收到 2 列，见本片段对应条目）；
- 改法：网格 `grid-cols-3` → `grid-cols-2 md:grid-cols-3`，桌面仍是 3 列。
  断点同源：`md`（768px）= `useResponsive` 的 `isMobile`，两处判的不是同一个实现，但阈值一致；
- **键盘导航的列数必须跟着改**：`v-grid-nav="3"` 里的 3 是「按 `± cols` 找上下行」的换行基数，
  视觉上改成 2 列而它仍是 3 的话，方向键会跨列跳（从第 1 列按下会落到第 2 列）。
  故改为 `v-grid-nav="{ cols: moveGridCols }"`（`computed`：窄屏 2、其余 3）——
  指令的 `updated` 钩子在组件重渲染时重取配置，断点翻转后自动跟上；
- 未加单测：本次改动是 CSS 类名加一个三元计算，属免测区（`rules/06` 的「严禁测试原子 UI 的 CSS 类名」
  与「严禁测试纯访问器」）；组件本身也没有既有测试挂载；
- 验证：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：手机上是否 2 列且分组名不再被截、桌面是否仍 3 列、
  方向键上下是否仍按行跳；
- 路径外发现（**未改**）：`BaseModal` 的卡片宽度是固定档位（默认 `md` = 480px，指法删除那个是 640px）
  且没有视口上限。但卡片本身**不会**横向溢出：它带 `overflow-hidden`，而 flex 项的自动最小尺寸
  （`min-width: auto`）只在 `overflow` 为 `visible` 时生效，于是卡片会一路缩到视口宽度
  （实测 390px 视口下卡片 356.6px、遮罩 `scrollWidth == clientWidth`）。真正溢出的是 footer 的按钮行，
  见本片段「弹窗 footer 在窄视口被裁掉左端按钮」一条。

### 修复 · 弹窗 footer 窄屏裁掉按钮：改为整行堆叠（2026-09-27）

- 症状：视口宽度装不下 footer 的按钮行时，被挤出去的那几枚按钮被卡片裁掉，既看不见也点不到。
  溢出方向取决于该行的对齐方式：`justify-end` 往**左**跑（「同步设置」：390px 下只剩「拉取」「同步」，
  「测试连接」整枚消失、只在左缘留一条残边，要等视口宽到约 494px 才回到一行）；
  `justify-between` 往**右**跑（「指法删除」的自绘按钮行：320~414px 下右侧的「全部删除」「删除选中」
  被右缘切掉，要等视口宽到约 429px 才装得下）；
- 根因是两件事叠加，缺一不成：
  ① **卡片会缩到视口宽度**：卡片自带 `overflow-hidden`，而 flex 项的自动最小尺寸（`min-width: auto`）
  只在 `overflow` 为 `visible` 时生效 —— 于是「不缩到内容最小尺寸以下」这层保护失效，卡片一路缩到视口宽；
  ② **按钮行不换行**：`modal-footer-zone` 是 `justify-end` + 不换行，装不下时多出来的宽度往**左**跑；
  「指法删除」的自绘行是 `justify-between`，负剩余空间下退化为 `flex-start`、多出来的往**右**跑。
  两个方向的溢出都被卡片的 `overflow-hidden` 裁掉、且没有任何滚动位置能滚到它 —— 往左那侧还额外
  量不出来（负向溢出不计入 `scrollWidth`），按 `scrollWidth` 查会误判成没问题；
- 改法：窄屏（`max-sm:`，< 640px）下按钮行改为**整行堆叠** —— 容器转 `flex-col` + `items-stretch`，
  每枚按钮占满一行。两处都改：`modal-footer-zone`（共享外壳，覆盖所有走默认 footer 或 `#footer`
  插槽的弹窗）；「指法删除」那行是自绘按钮行（`ChordModalsContainer`，全仓唯一一处不走外壳 footer），
  堆叠只落在它的外层 ——「取消」独占一行，内层动作组的两枚删除钮仍并排、各分一半宽度
  （`max-sm:*:grow`，即 Tailwind v4 的直接子元素变体）：拆成三行会把两枚成对的删除操作拆散。
  内层原有的 `ml-auto` 要去掉，否则交叉轴的自动外边距会让它退回内容宽度、不铺满，`grow` 随之失效
  （单行时的右对齐本就由外层的 `justify-between` 负责，它是多余的）；
- 为什么是堆叠而不是折行：先试过 `flex-wrap`，但按钮行天然右对齐，折行会在末行留一枚孤零零的按钮
  （390px 下「同步设置」排成「测试连接 / 拉取」+「同步」），观感零碎，已弃用。堆叠是移动端弹窗的
  常规形态，且每行都贴齐左右边缘、不留参差。断点取 `sm`：640px 起卡片恒为 480 档（视口 513px 以上
  就已取满 480），按钮行必能排成一行 —— 实测 639px 仍堆叠、640px 已回到一行；
- `flex-wrap` 保留为最后兜底：真出现比卡片还宽的按钮行时，宁可折行也不要被裁掉；
- 验证：一次性探针（`.temp/`，Chromium 真渲染，跑完即删）走「构建产物 + 运行时注入等价媒体规则」，
  避开全量构建（本环境禁令）。注入的就是 Tailwind 为 `max-sm:flex-col max-sm:items-stretch` 生成的那条
  （`@media not all and (min-width:40rem){ flex-direction:column; align-items:stretch }`，
  媒体查询写法照抄构建 CSS 里 `max-md:` 的产物）；
  ① 「同步设置」：320 / 360 / 390 / 480 / 639 上转成 column、3 行、按钮全部满宽、溢出 0px；
  640 / 768 / 1280 仍是 row、1 行、溢出 0px。改动前同一弹窗的溢出为 160.8 / 120.8 / 90.8 / 0.8 px
  （320 / 360 / 390 / 480，方向往左）；
  ② 「指法删除」的自绘行按该行的真实类名 + 从弹窗里克隆的真实 `ActionButton`（含真实 size 类）
  注入真实弹窗正文：改动前右溢出 116.3 / 76.3 / 46.3 / 22.3 px（320 / 360 / 390 / 414）；
  改后「取消」在窄屏独占一行且满宽，两枚删除钮在 360 / 390 / 414 / 639 上并排、各
  123 / 138 / 150 / 200 px（正好等分行宽），768 上仍是单行原样（113 / 113）；
  320px 下这两枚加起来超过行宽、由内层 `flex-wrap` 折成两行各满宽；全部宽度溢出 0px；
- 同批扫过的其余可达弹窗（导出备份 / 导入备份 / 新建分组）在 360~480 上均无溢出；
  溢出只发生在「按钮总宽 > 卡片内容盒」时；
- 影响面：`BaseModal` 是全部弹窗的外壳，所有走默认 footer 或 `#footer` 插槽的弹窗一并受益；
  「指法删除」的自绘按钮行单独修 —— 它是全仓唯一一处不走外壳 footer 的弹窗按钮行
  （全仓 grep 只此一处）。`src/platform/` 属稳定保护区，但本次是行为修复、
  不涉及依赖方向与 eslint zone 规则，故未走保护区的放宽流程；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏下「同步设置」的三枚按钮是否都可见可点且满宽、
  「指法删除」的「取消」是否满宽、两枚删除钮是否并排等分、桌面（≥ 640px）是否仍是原样一行。

### 优化 · 「指法删除」弹窗：恒定 3 列 + 窄屏横滚、指板保持 1.8（2026-09-27 / 2026-09-28）

- 症状（2026-09-27）：变体网格用的是自适应 `grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]`，
  7rem = 155.75px，于是手机（约 450px 以下）只排得下 **1 列** —— 一屏只能看到一个指法；
- 2026-09-27 的处置是「指板缩到 1.4 + 窄屏固定 2 列」。2026-09-28 用户明确
  「**三列，但是不要缩小**」，该处置整体推翻，改按下述口径重做 —— 本小节记的是**最终状态**；
- 改法（`ChordModalsContainer.vue`）：
  - `FretboardCanvas` 的 `scale` 回到 **1.8**（与工作台同档、也是本弹窗改造前的档位）。
    6 弦画布 130px（基准宽 72px = 2×14 侧留白 + 5×8.8 弦距，见 constants 的 `FRETBOARD_WIDTH`；
    `scale` 只改显示尺寸、不进位图键，缓存命中与共享关系不受影响）。相对位图参考分辨率 1.4 是
    1.29 倍上采样、线条略软；但 1.4 会把画布收到 101px —— 那是「两列时代」为塞进窄列付的代价，
    宽屏下没有理由再付；
  - 网格列数**恒定 3 列**（不再分档），装不下就**横向滚动**：`BaseScrollArea` 取 `axis="x"`、
    类名 `grid grid-cols-[repeat(3,minmax(min-content,1fr))] gap-lg p-xs`，自绘滚动条随 axis
    默认开启（刻意不写 `:scrollbar="false"` —— 它是「右边还有内容」的唯一可见线索）。
    轨道取 `minmax(min-content, 1fr)` 而不是 Tailwind `grid-cols-3` 的 `minmax(0, 1fr)`：
    后者的 0 下界会把轨道压得比画布还窄、画布就从卡片里挤出去 —— 这里的取舍是
    **宁可网格横向溢出、由滚动条兜住，也不缩指板**；
  - 横滚落在网格这一层而不是弹窗正文那一层：正文要管纵向，混在一处会让「共 N 个，已选 M 个」
    那一行跟着横向漂走；
- 3 列的下界与横滚触发点：卡内指板是**固定几何**、不随列宽收缩（同 picker 的判据），
  列宽小于画布就横向溢出卡片、盖到相邻卡片上（列宽 = 画布 130 + 两侧 1.5px 边框 = 133px）。
  3 列 + `gap-lg` 需要 `3×133 + 2×22.25 = 443.5px` 的网格内宽；把弹窗外壳一路减回去
  （卡片 640px、窄视口下 `100vw − 2×p-md` 且自身还有 1px 边框、正文 `px-xl`、网格 `p-xs`）
  折成视口约 **562px** —— 宽屏弹窗（640px）下网格内宽 554.6px，余量 111px、根本不触发滚动；
  被视口压到 562px 以下才开始横滚（390px 手机上网格内容 460px、可视 271px）；
- 验证：`.temp/` 一次性探针（Chromium 真渲染，跑完即删），复用 dist 的真样式表 ＋ 按真弹窗逐层
  照抄结构（overlay `p-md` → card 640px / border / `overflow-hidden` / `flex-shrink:1` → 正文
  `px-xl` → 网格 `gap-lg` + `p-xs` → 卡片 border + 130px 画布）。实测（视口 → 卡宽 / 正文内宽 /
  网格可视 / 网格内容 / 横滚量 / 每格内容宽）：1440 / 1024 / 768 → 640 / 638 / 571 / 571 /
  **0** / 168.0；640 → 606.6 / 605 / 538 / 538 / 0 / 156.9；566 → 532.6 / 531 / 464 / 464 / 0 /
  132.2；562 → 528.6 / 527 / 460 / 460 / 0 / 130.9；**541 → 507.6 / 506 / 439 / 457 / 18** / 130.0；
  480 → 446.6 / 445 / 378 / 457 / 79；390 → 356.6 / 355 / 288 / 457 / 169；
  320 → 286.6 / 285 / 218 / 457 / 239。即 562px 及以上三列铺满、不横滚，其下横滚量逐档变大；
  **所有宽度下每格内容宽都不低于 130px**（画布放得下）—— 这正是 `minmax(min-content, 1fr)`
  要的效果。探针用的是改动前构建的 dist CSS，其中尚无 `border-[1.5px]`（按 1px 量，每格差 1px）
  与新加的任意值网格类（按等价规则补注入），结论不受影响；
- 已知取舍：窄视口下要横向拖动才能看到第 3 列 —— 「恒定 3 列 / 不缩指板 / 不横滚」三者不可兼得；
- 影响面：只动这一个弹窗的变体网格与画布缩放；`hide-chord-name reserve-chord-name` 不动，
  位图仍与和弦库 picker 共用同一批条目；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：宽屏是否 3 列铺满、窄屏横滚手感与滚动条可见性、
  点选与「全选」是否正常、指板 1.8 时卡片是否被撑出弹窗。

### 修复 · 弹窗标题盖住 header 右侧组（复选框 / 关闭钮）（2026-09-27）

- 症状（用户报告「这个 modal 的 title 和 checkbox 重叠了」）：窄视口下「指法删除」弹窗的标题文字
  压在「全选」复选框上，最窄档连关闭钮一起被压住；
- 根因：`modal-header-left` 是 `min-w-0 flex-1` —— 这只让**盒子**能被压窄，压窄之后里面那棵子树
  照样按自己的宽度画。默认标题是 `<h3 class="truncate">`，装不下会收省略号；而这个弹窗的标题走
  `v-chord-name`，指令渲染出的是 `inline-flex` + 子项全 `whitespace-nowrap`：既不折行也不缩，
  于是**内容**直接画出盒子、盖到右侧组上。实测（640px 卡片，标题「删除和弦 Cmaj7 的指法」
  内容宽 239px，右侧组 = 全选 64px + 关闭钮，合计 110.7px）：414px 视口下压住右侧组 37.8px、
  390px 压 61.8px（复选框本身只有 64px，等于被整块盖住）、360px 压 91.8px、320px 压 131.8px；
  ≥ 480px 无重叠；
- 改法三处：
  1. `BaseModal` 的 `modal-header-left` 加 `overflow-hidden`（兜底）：自定义标题再怎么画也越不出左盒，
     宁可裁掉也不能盖住操作区。对默认 h3 标题零影响（它自带 `truncate`、本就不会越界）。
     同仓 `ChordReferencesModal` 也是自定义和弦名标题，一并被这条兜底护住；
  2. 「指法删除」的标题在 < sm 加 `block` + `truncate`：指令给的 `inline-flex` 装不下时连省略号都
     没有（硬裁），改 block 后子项按行内排版，`truncate` 才收得出省略号 —— 与外壳默认标题同一种收尾。
     ≥ sm 保持 `inline-flex` 不动；
  3. 同一弹窗在 < sm 把「全选」从 header 挪到正文计数行：只裁标题会丢掉小半截（390px 只剩 65%、
     360px 52%、320px 36%），腾出右侧组后标题拿回那 110.7px 的绝大部分 —— 改后 414px 及更宽 100% 可见、
     390px 96%、360px 84%、320px 67%，且「全选」正好落在「共 N 个，已选 M 个」旁边；
- 两处实例互补（`max-sm:hidden` / `sm:hidden`），任何宽度下恰好只显示一枚；控件完全受控，两处共用
  同一份 props / 事件（脚本的 `selectAllProps`），不存在两份状态。各包一层 `<span>` 是为了让 `hidden`
  说了算：BaseCheckbox 的根自带 display 类，而构建 CSS 里 `.hidden` 排在 `.inline-flex` **之前**，
  直接写在它身上会被后者盖掉；
- 断点取 `sm`（640px）：与本弹窗的 footer 堆叠、变体网格分档同一个断点；实测 480px 起标题已 100% 可见，
  取 sm 只是多挪了一段本可不动的位置，换来本弹窗窄屏只有一套版式；
- 一条容易踩的产物顺序：`max-sm:` 这类变体规则在构建 CSS 里排在**基础工具类之后**
  （实测 dist 里 `@media not all and (min-width:48rem)` 在 68635、`.inline-flex{` 在 19936），
  故 `max-sm:block` 能直接盖过指令的 `inline-flex`、不需要 `!important`；
- 验证：`.temp/` 一次性探针（Chromium 真渲染，跑完即删）。用**真弹窗**「导出备份」——它的 header
  与本例同构（自定义标题位 + `BaseCheckbox label="全选" size="sm"` + 关闭钮）且空库也可达；
  把卡片宽度改成 640px 对齐 lg 档，再把它的标题换成本例的 `v-chord-name` 标记（类名逐字取自指令，
  且分片之间**不留空白** —— 指令是 innerHTML 拼串，而 block 下换行会折叠成真实空格、凭空加宽约 20px，
  首轮就是这么把 390px 的可见比例误算成 89% 的）。修法用的类名由 tailwindcss 4 的 Node API 现编注入
  （dist 早于本次改动，没有这些规则）；
- 影响面：桌面（≥ 640px）header 几何逐像素不变（标题仍 `inline-flex`、「全选」仍在 header）；
  < 640px 的「全选」位置变化是本弹窗唯一的版式改动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：手机上标题是否收省略号而不压住「×」、
  正文计数行右侧的「全选」是否点得到且与勾选状态同步、桌面是否原样。

### 修复 · 排列和弦：点中的字符不再显示虚线高亮框（2026-09-28）

- 症状（用户报告「排列和弦里选中字符的提示没有了」，PC 与手机都没有 —— 与触屏 tooltip 那类门禁无关）：
  点某个字符打开选择和弦面板后，**看不出面板会把和弦写进哪一格** —— 该字符上那圈虚线高亮框不见了。
  高亮本身仍是「面板目标」的唯一指示（见 `ScoreInteractiveArea` 的 `handlePickerSelect`：
  目标不随填充移动，要换格得先点那一格），丢了它，「点一下就填」这条直给路径就成了盲填；
- 根因：槽根的 `.is-picker-target` 用 `outline` 画虚线框，而聚焦环模块在 `main.ts` 装配时往 `head`
  **末尾** append 了一条 `[data-focusable-outline]:not([data-focusable-outline="false"]){outline:none !important}`
  （画布画的顶层环替代原生 outline）。两条同为 `!important`、特异性又同为 (0,2,0)
  （属性选择器 + `:not()` 里的属性各算一个），于是**源序**决出胜负 —— 注入的 style 排在最后，
  `outline` 简写把 width / style / color 三个 longhand 一起重置回初始值
  （`outline-offset` 不属该简写，故幸存）。真应用实测：点击后 `is-picker-target` 类名确实加上了、
  `outline-offset: -2px` 也生效，但 `outline` 读出 `3px none currentColor`；
  把那一条注入 style 从 head 摘掉，虚线框**立刻出现**（截图确认）—— 根因即此；
- 附带纠正一处失实的注释：`slot/slotStyles.ts` 原写「`!important` 无视特异性，所以不带 `!` 的
  `outline-*` 会被整体吃掉」。后半句对、理由错 —— 两条 important 之间**先比特异性、再比源序**；
  `!` 的作用只是「不被普通声明压过」，它改变不了与另一条 important 规则的胜负。注释已按此改写
  （只改注释，类串一字未动）；
- 改法：把注入规则的选择器包进 `:where()`，特异性降到 0。该压住的照样压住 —— UA 的默认 outline
  与任何**普通**（非 important）作者规则都仍输给它，重要性与源序规则没变；变的只是「不再越权压过
  调用方显式 `!` 的描边」。域侧 `!` 保持不变（面对一条 important 规则，`!` 仍是必需的）；
- 验证（未启服务）：`.temp/` 一次性探针（Chromium 真渲染、跑完即删），用 `setContent` 离线复刻
  「两条规则 + 注入 style 在 head 末尾」的先后关系，选择器**逐字**取真值：
  修复前 `[data-focusable-outline]:not([...="false"])` → `3px none`（装饰被吃）、
  修复后 `:where(...)` → `2px dashed rgb(0,128,255)`（装饰胜出）；
  对照 `outline:5px solid red`（无 `!`）仍被清成 `3px none`，证明这条规则的职责没被削弱。
  首轮离线复刻只写了 `[data-focusable-outline]`（特异性 (0,1,0)）→ 结论整个反过来（装饰本来就赢），
  记下来：复刻必须逐字用真选择器，`:not()` 里的属性也计入特异性；
- 影响面：只影响「同时带 `data-focusable-outline` 且自己声明了 `!` 描边」的元素 —— 全仓仅此一处
  （`ScorePreviewPane` 的页码菜单高亮没有该标记、也不带 `!`，不受影响）；其余聚焦目标逐像素不变。
  本次改动了 `src/platform/ui/focus-ring/`（`02-protected-zones.md` 的「一」所列保护区）：
  属行为缺陷修复（根因在该模块的注入规则），不动依赖方向、不动 zone 规则，也未放宽保护区；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：点字符后虚线框是否出现、颜色是否为主题色 45 档、
  键盘 Tab 聚焦时是否仍只有顶层聚焦环（没有多冒出一圈原生 outline）。

### 优化 · 分组列表类弹窗补上边缘羽化（2026-09-28）

- 来由：用户提「移动分组也该用通用滚动容器包裹」。查下来它一直是 `BaseScrollArea`（`axis="y"`），
  并非裸容器 —— 差别在它自己写了 `:fade="false"`，把「通用容器」那套边缘羽化显式关掉了。
  用户随后确认「那就加上羽化」，故本轮补上；
- 改法：删掉「移动至新分组」（`ChordModalsContainer`）与「选择保存分组」（`ChordEditorDrawer`）
  两处滚动区的 `:fade="false"`，回到 `axis="y"` 的默认羽化 —— 与侧栏分组列表（`SidebarLeft` 的
  `scroll-body`，从未关过）同一档。`axis` 一给，`v-edge-fade` 自动按该轴定向，无需再传 size；
- 为什么这两层尤其需要：自绘滚动条是关的（`:scrollbar="false"` —— 网格里挂一条会挤掉一列），
  分组数超过 `max-h-[50vh]` 时上下两端的分组行被硬裁断，而**没有任何**「还有内容」的线索。
  羽化是这里唯一可用的提示，代价为零；
- 两处必须同步改：`ChordEditorDrawer` 的注释本就写着「复用『移动至新分组』的交互与外观」，
  只改一处等于把那句话作废（同一张分组网格，一处有渐隐一处没有）；
- 顺带回答「为什么会有三处」：分组列表共渲染在三块界面上 —— 侧栏常驻列表（`SidebarLeft`）、
  「移动至新分组」弹窗、「选择保存分组」弹窗（和弦编辑器抽屉里，新建和弦时选目标分组）。
  后两处的组件不同、状态不同、宿主不同，只是长得像，故各自持有一份 `BaseScrollArea`；
  羽化被显式关掉的恰好是后两处（第三处同构列表 —— 「和弦引用」弹窗 —— 见下一节）；
- 不打扰的一面（`v-edge-fade` 的贴边判定）：内容停在两端时，贴边那一侧端点量为 0、不渐隐 ——
  未滚动时顶端那一行照旧是实的，只有真的被裁断（滚到中间）才淡出；网格自带的 `p-xs`（8.34px）
  仍在，羽化带宽取默认 20px，落在第一行下沿附近；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：分组多到溢出时上下两端是否出现渐隐、滚到顶/底时该侧渐隐
  是否自动收起、网格列数与键盘导航是否照旧（本次未动 `v-grid-nav`）。

### 修复 · 弹窗高度按视口封顶：矮视口下不再超出屏幕、正文自己滚（2026-09-28）

- 症状（用户提「modal 在窄屏上限制最大高度不超过视高，内容滚动」）：视口被压矮时（手机、手机横屏、
  桌面窗口拖矮）弹窗卡片会高过屏幕 —— 卡片唯一的高度上限是正文那条 `max-h-[calc(800px-8rem)]`
  （622px，与视口无关），而卡片本身没有上限，于是「卡片 > 视口」时只能靠遮罩容器
  （`fixed inset-0 overflow-y-auto`）去滚整张卡片：头部与底部按钮一起被滚走，`items-center`
  居中在溢出时还会把卡片顶部推到可视区之外；
- 改法：新增 `VIEWPORT_MAX_HEIGHT_CLASS = max-h-[calc(100dvh-2*var(--spacing-md))]`，卡片与
  auto-height 档的正文层各挂一份。取值 = 视口高度减掉遮罩容器那一圈 `p-md` —— 遮罩是
  `fixed inset-0` + `p-md`，它的内容盒高度就是这个值，故卡片恰好落在可视区内；
- **取 `dvh` 不取 `vh`**：移动端 `vh` 是大视口（地址栏收起时的高度），按它限高，地址栏一展开卡片
  照样超出屏幕；`dvh` 跟着当前可视高度走。**不做「仅窄屏」的宽度断点**：视口够高时这条上限根本
  够不着（弹窗高度由内容与正文那条 800px − 8rem 里更紧的一条决定），只有视口真被压矮才接管 ——
  而「窗口够宽但够矮」正是宽度断点会漏掉的那一档；
- 上限为什么**必须落在正文层**（auto-height 档）：`v-auto-height` 量的是卡片的首个子元素，
  而卡片的 `overflow-hidden` 只裁不滚 —— 只给卡片挂上限、不给正文层挂的话，内容超出上限时底部
  按钮会被顶到卡片之外直接裁掉（卡片看着「少了一截」）。两处同值，量出来的值本身就 ≤ 上限；
- 正文层**保留 `shrink-0`、不换成 `min-h-0`**：收缩会让它的实高变成「卡片当时写下的高度」，
  `v-auto-height` 从此量到自己上一帧写的值 —— 内容变高也不再长高（自锁）。上限走 CSS `max-height`，
  实高 = min(内容, 上限)，缩回上限以内时它跟着缩、RO 照常通知指令改卡片高度，两侧都不失真；
- 真正让出空间的是**正文滚动容器**（`BaseScrollArea`）：它补 `min-h-0`，卡片被钳住时由它收缩、
  由 `v-scrollbar` 注入的 `overflow-y` 接管滚动（`:scrollbar="false"` 是被动模式，overflow 照样注入）。
  不补 `min-h-0` 时 `min-height: auto` 就等于内容高度，收缩无从发生；
- 影响面：`src/platform/ui/modal/` 属 `02-protected-zones.md` 的「一」所列保护区 —— 本次是行为修复
  （矮视口下的高度约束），不动依赖方向、不动 zone 规则，也未放宽保护区。全仓弹窗都没有传
  `height` prop（固定高度那档当前无消费方），故实际生效的只有 auto-height 那条路径；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：手机竖屏打开内容多的弹窗（如「分组和弦排序配置」）时
  头部与底部按钮是否都在屏内、只有正文滚、滚动到底是否不遮底部按钮；手机横屏与桌面窗口拖矮时
  卡片是否跟着收；视口变高后卡片能否长回去（`dvh` 变化会改正文层的 max-height → RO 触发重测）。

### 优化 · 工作台面板列的纵向留白只在并排时给（2026-09-28）

- 需求（用户提「这里 py-xl 改成仅在宽屏生效」）：面板列表容器的 `py-xl` 整个存在的理由是
  「把卡片拉回滚动宿主外扩前的原位」（宿主盒向外扩 P 给卡片投影落地，内容再补等量 padding 拉回来）；
  堆叠（窄屏）时宿主盒根本没有外扩、没有原位可拉回，它退化成首卡上方、末卡下方各 33.375px 的
  纯间距 —— 手机上就是白占两段屏高；
- 改法：`py-xl` 从静态类挪到 `:class="isStacked ? '' : 'py-xl'"`。判据取 `isStacked` 而不是宽度
  断点：同一个视口宽度下侧栏开着与否差 344px，媒体查询看不见这个差（见 `isStacked` 的说明），
  而模板上的列数与留白本来就都按它切换，三处必须同源；
- 未动的一面：并排档逐像素不变（宿主盒内缩 + `py-xl` 之和仍等于画布留白 `edgePad`，
  首卡顶边照旧与左侧指板卡顶边齐平）；堆叠档上下的分隔由画布自身的 `py-md` 提供，与面板区
  横向的 `px-md` 同档；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏工作台上面板列表上下是否还留着两段空白、
  并排档首卡顶边是否仍与指板卡齐平、跨过堆叠阈值来回切时卡片位置是否稳定。

### 优化 · 弹窗正文滚动区与「和弦引用」列表补上边缘羽化（2026-09-28）

- 需求（用户提「modal 内容滚动加羽化，引用（列表）也加羽化」）：全仓显式写 `:fade="false"` 的滚动区
  只剩两处 —— `BaseModal` 的正文滚动容器、`ChordReferencesModal`（「和弦引用」）的引用列表，
  本轮把它们一并开成默认羽化；
- 弹窗正文为什么需要：正文是弹窗内容的滚动出口，而 `:scrollbar="false"` 是被动模式 —— 自绘滚动条
  同样不出现。内容超出高度上限（正文的 800px − 8rem 或卡片那条视口上限，取更紧者）时，上下两端
  被硬裁断却没有任何提示，羽化是这里唯一可用的线索，代价为零；
- 与内层列表**不会叠加**：`v-edge-fade` 只在元素真的溢出那一侧显示，而内容里若另有自带
  `max-h-[50vh]` 的列表（分组列表 / 引用列表），实际滚动的是那个列表、正文的高度就等于内容高度
  （不溢出），正文的羽化不出现。反过来正文被视口上限钳住时，内层列表先被 flex 收缩，仍由它滚；
- 「和弦引用」列表与另两处同构（`max-h-[50vh]` + `scrollbar="false"` + 自绘滚动条关闭），
  至此三处列表取齐 —— 引用多到溢出时上下两端出现渐隐，滚到顶/底时该侧自动收起；
- 影响面：`src/platform/ui/modal/` 属 `02-protected-zones.md` 的「一」所列保护区 —— 本次只删一个
  显式关闭的 prop、回到默认值，不动依赖方向、不动 zone 规则，也未放宽保护区；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：内容多的弹窗滚到中间时上下两端是否出现渐隐、滚到两端是否
  收起、弹窗正文有内边距（`px-xl` + 上下 `lg`/`xl`）时羽化带是否仍盖在内容上而非空 padding 上、
  引用弹窗里引用条目多到溢出时观感是否与另两处列表一致。

### 优化 · 乐谱配置弹窗的选择器在窄屏收窄一档（2026-09-28）

- 需求（用户提「乐谱配置的 selector 在窄屏都改成 sm」，随后更正为**宽度**不是高度档）：拍号
  （`BaseSelector`）与三个调性字段（`KeySelector` × 3）原本都没传 `width`，一律吃 `BaseSelector`
  的默认档 `md`（`FORM_COMPONENT_WIDTH_MAP` 里 = 8rem / 178px）；
- 改法：`SongModalsContainer` 新增 `selectorWidth = computed<'sm' | undefined>(() => (isMobile ? 'sm' : undefined))`，
  四处共用同一个 computed（一处改档、四处同步，不散字面量）；判据用既有的 `useResponsive().isMobile`
  （< md，768px），与顶栏那批窄屏取舍同源。宽屏传 `undefined` 即回落控件默认档，逐像素不变；
- 为什么收的是宽度：窄屏下卡片被遮罩那圈 `p-md` 挤到视口宽（390px 视口时卡片内容宽约 290px），
  扣掉 6rem 的标签列只剩约 156px —— 默认的 8rem（178px）会顶出卡片可用宽度，5.5rem（122px）才放得下。
  高度不动：选择器的 `md` 与同列的文本输入框齐平，收高度会让这一行突兀地矮一截；
- 只作用于选择器：名称 / 歌手（`BaseInput`）与变调夹（`BaseNumberInput`）不跟这一档走 ——
  它们是文本与数字输入，可用宽度本来就要吃满标签列右侧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏打开「乐谱配置」时拍号与三个调性字段是否不再顶到卡片边缘、
  宽屏是否与改前逐像素一致、跨过 768px 来回缩放时档位切换是否平滑。

### 修复 · 窄屏 Toast 的长文字溢出屏幕（2026-09-28）

- 现象（用户提「窄屏 toast 长文字超出屏幕了，应该是最大宽度限制复用了宽屏的」）：窄屏下长文字
  Toast 横向溢出屏幕，左边缘跑到视口之外；
- 根因：Toast 卡片的宽度上限只有 `max-w-[22rem]`（= 489.5px，宽屏档），**有描述**那一档更是完全没写
  上限（`w-auto`）。而浮层是 `fixed` + `right-lg`，它的可用宽度只有「视口 − lg」（390px 视口时
  367.75px）；卡片在 cross axis 上又不 stretch（内层是 `items-end`），宽度由自身 max-content 与
  `max-width` 决定、**不受容器宽度约束** —— 上限比可用宽度还大时等于没有上限，卡片于是溢出容器左侧、
  贴到屏幕外（`items-end` 的溢出方向是起始侧）；
- 改法：两档都补视口项 —— 单行胶囊档 `max-w-[22rem]` → `max-w-[min(22rem,90vw)]`（宽屏照旧吃 22rem，
  只有视口窄到 90vw 更小时才接管）；多行卡片档补 `max-w-[90vw]`。90vw 与常驻通知段
  （`w-[20rem] max-w-[90vw]`）同档，窄屏下两者宽度一致；
- 为什么不给外层容器加 `max-width`：外层是 shrink-to-fit，卡片的 max-content 会参与它的宽度计算，
  加在容器上只会把容器压窄、卡片照样按自己的上限溢出 —— 上限必须落在卡片自身；
- 影响面：`src/platform/ui/feedback/` 属 `src/platform/`，本次是窄屏溢出的行为修复（保护区禁止的是
  「为审美微调实现」与「重新引入上层依赖」，两者都不涉及）；同一位置的 `position="*-center"`
  档另有隐患（`left-1/2` 让可用宽度只剩半个视口，90vw 仍会溢出），当前无消费方（`App.vue` 用默认
  `top-right`），未一并改动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏长文字 Toast 是否不再溢出屏幕、宽屏是否与改前逐像素一致、
  带描述的长文案是否换行而不是把卡片撑宽。

### 修复 · 「指法删除」弹窗切换全选时复选框上下位移（2026-09-28）

- 现象（用户先后两次反馈「窄屏上删除多指法的全选切换状态会有上下位移」「checkbox 还是有位移」）：
  窄屏下切换「全选」，计数行右侧的复选框会上下位移；
- 离线探针（`.temp/` 下用 dist 产物 CSS 复刻该行与完整弹窗，390 / 512 两种宽度、覆盖文本 0→1→10、
  勾选态、图标、网格选中、底部按钮解禁）：行高、复选框相对行顶的偏移、卡片高度**全程恒定**，
  没能复现出位移；但测出了一处确定的耦合 —— **文本与右侧复选框的宽度互相牵制**：文本内容宽度 +2px 时，
  右格被反向挤压 −1.53px（`p.w` 326→328 时 `cb.w` 61.30→59.77），两者之和恒等于行宽；
- 机制（按该耦合推出）：本行高度 = max(文本行数, 右格的 strut)，`items-center` 让复选框随行高重新居中；
  而文本的换行数取决于它的可用宽度 = 行宽 − gap − 右格宽度。右格宽度原本就是内容宽度（max-content），
  勾选态把「全选」切成 `font-medium`（`BaseCheckbox` 的 labelClass）→ 宽度 +1px → 左侧可用宽度 −1px
  → 窄屏下文本在临界处换行数跳变 → 行高跳变 → 复选框跟着位移；
- 改法：把两处宽度一起钉死 —— 文本 `min-w-0 flex-1`（`flex: 1 1 0%`，宽度完全由行宽决定，
  不再参与收缩分配），右格 `flex w-[3.25rem] shrink-0 justify-end`（固定占位、内容右对齐）。
  文本可用宽度因此恒定 → 行数恒定 → 行高恒定，复选框不再随勾选态移动。
  3.25rem 是「勾选框 + 间距 + 全选二字」的实测宽度（≈64px）再留约 8px 余量；
- 代价：右格比实际内容宽约 8px，文本可用宽度相应少 8px（390px 视口下 218 → 202px）——
  实测行数不变（仍 2 行），观感一致；
- ⚠️ 未验证的部分：探针复现不出位移，本次修复是按实测到的那处宽度耦合推出来的，**真机效果待确认**；
  若仍复现，需要窄屏下的具体读数（指法数量、机型 / 视口宽度、位移幅度）才能继续定位 ——
  届时的下一手是让复选框脱离行高（改 `self-start`），代价是与首行对齐而非整块居中；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑。

### 优化 · 无悬停能力的设备上指板横按气泡改为常驻（2026-09-28）

- 需求（用户提「窄屏上指板气泡始终显示」，澄清后确认是**希望窄屏下常驻**）：气泡本由指针悬停激活
  （`useBarreBubble` 的整套 hover 状态机），而触屏没有悬停 —— 「标记横按」这个功能在手机上等于不可达；
- 改法：`useBarreBubble` 新增可选选项 `alwaysShow`，为真时**跳过整段 hover 判定**、把气泡直接钉在
  `displayBarres[0]` 上；`FretboardSvg` 传 `alwaysShow: () => !canHover.value`；
- 判据取 `(hover: hover)` 而不是宽度断点：桌面窗口拖窄时指针照样能悬停，常驻反而白挡视线。
  与 `TopHeader` 的 `canHover`、`vTooltip` 的同一判据同源；
- 多条横按时**只呈现第一条**（当时本组件只渲染一枚气泡）—— 这一条**已被后一节「指板横按气泡逐条渲染」
  取代**：触屏上最多可以有三条横按，只呈现第一条等于另两条的「标记横按」点不到；
  横按被删 / 取消标记后 `displayBarres` 变化，气泡随之消失或改挂新的一条；
- 顺带记一处同源现象：触屏上 `pointerup` 之后浏览器**不会再补一次 `pointerleave`**
  （指针捕获隐式释放时指针位置仍在元素上），而 `handlePointerUp` 会把落点写回 `hoverPoint` ——
  这就是触屏上气泡「挂着不走」的来源。常驻模式绕开了整段 hover 判定，不再受它影响；
  悬停高亮环仍按原样工作（本次未动 `useFretboardInteraction`）；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：手机上打开和弦编辑器，横按上方是否始终有「标记横按」气泡、
  点它能否切成「取消标记」、横按被删后气泡是否消失；桌面（有悬停）行为是否与改前一致。

### 修复 · 设置浮层在窄屏上左右边距不一致（2026-09-28）

- 现象（用户提「headerpopoverconfig 在窄屏上左右边距不一致」）：`HeaderConfigPopover` 在窄屏下
  左右边距不等；
- 根因：卡片宽度固定 `w-[360px]`，而浮层由 `BasePopover` 的 `shift` 中间件限位（`padding: 12`，
  见 `floatingCore` 的中间件链）—— 它对齐的是顶栏那枚设置按钮，而按钮右侧还有「更多」菜单、
  不在视口最右。窄视口下 360px 的卡片被推到距左 12px、右侧却多出「更多」那一段
  （390px 视口 ≈ 左 12 / 右 18），320px 视口下卡片更是直接顶出屏幕右侧；
- 改法：卡片补 `max-w-[calc(100vw-24px)]`（24 = `shift` 的 padding × 2）—— 窄屏下卡片恰好在限位后
  距两侧各 12px，左右边距一致；宽屏（≥ 384px）这条上限够不着，仍是 360px 固定宽、逐像素不变；
- 未动的一面：横向留白仍在滚动宿主（`px-md`）上、纵向仍在卡片（`py-md`）上，理由见该文件顶部注释；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏打开设置浮层时左右边距是否一致、卡片是否不再顶出屏幕、
  宽屏是否与改前一致。

### 修复 · 指板横按气泡改为逐条渲染（2026-09-28）

- 现象（用户提「气泡现在是单例的，但是可以最多有三个横按，没有全部显示」）：上一节把触屏改为常驻后，
  气泡仍只有一枚 —— `useBarreBubble` 只暴露单条「当前激活横按」，常驻档直接钉在 `displayBarres[0]`；
  而 6 弦上最多可以并存三条横按（互不相邻的横按段各占一条，例如 `112233`：1 品两弦、2 品两弦、3 品两弦），
  另两条在手机上点不到；
- 改法：`useBarreBubble` 对外改给**一份气泡列表** `bubbleItems`（`BarreBubbleItem[]`：
  key / barre / geometry / visible），模板按它一维 `v-for` 渲染。两档的差异只在「条目从哪来」
  与「key 取什么」：
  - **悬停档**：至多一条，key 取常量 `HOVER_BUBBLE_KEY` —— 同一枚气泡在横按之间切换时复用同一个
    DOM 节点、靠 left/top 过渡滑过去（key 若取横按 key，每次换横按都会卸载重建，滑动过渡直接断掉，
    与 `activeHoveredBarre` 里那条「跨度生长平滑延续」是同一条口径）。离开动画期间仍给出这一条、
    只是 `visible` 转假，几何取 `cached*`，不闪到左上角；
  - **常驻档**：一条横按一条，key 取横按 key —— 节点随**横按本体**存亡，别的横按增删不会把它重建。
    三条分处不同品位，不会互相压住。该档不看挂载态：挂载态那套是给「悬停激活 → 延迟隐藏」的
    进出场用的，常驻档的存亡只由 `displayBarres` 决定；
- 随之收掉的几处：`activeHoveredBarre` 在常驻档恒为 `null`（该档不存在「当前这一条」这个概念）；
  `handleBarreBubbleClick` 改为**逐枚传回横按**（不再取「当前激活的那一条」）；
  `isBubbleMarked` 那层收窄 computed 删除 —— 按条目渲染后 `item.barre` 本身非空，
  模板拿不到 `v-if` 收窄的老问题不再存在；
- 顺带修一处只有常驻档才踩得到的：`isBubbleHovered` 现在只承认悬停档。它原先由气泡本体的
  pointerenter / leave 直接驱动，而触屏抬起后浏览器不会再补 `pointerleave` —— 常驻气泡一旦被点过，
  这个标志就永久为真，宿主据此让位的「空品位预览环」从此再不出现；
- 未动的一面：气泡的锚点约定（跨度中心水平位置、品丝线上方 4px、箭头向下）与两态外观一律照旧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；直接相关测试 4 个文件
  （`fretboardGeometry` / `fretGeometry` / `useFretboardInteraction` / `barre`）53 项全通过
  —— 本次未触及任何断言（这些文件都不引用 `useBarreBubble`）。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：手机（无悬停）上三横按指法是否三条气泡齐现、逐条点能否各自
  切成「取消标记」、删掉某条后是否只有它消失、桌面（有悬停）是否仍是一枚气泡滑来滑去。

### 优化 · 空弦区上下边距加厚 20%（2026-09-28）

- 需求（用户提「在基类里增加 20% 空弦区的上下边距」）：空弦区（和弦名与指板顶之间那一段，
  装空弦 / 静音标记）的上下留白各加厚 20%；
- 改法：动的是**基类那一个数** —— `FRETBOARD_CANVAS_CONFIG` 的 `CANVAS_MARKER_PAD_RATIO`
  `0.5 → 0.6`（= ×1.2）。它本就是「调空弦区松紧就只动这一个数（上下一起变）」的旋钮
  （见该常量注释），故不另开一份算式：`FretboardGeometry.markerPad` 仍是
  `弦枕高 × 本倍数 × scale`，三处指板（交互 SVG / 离屏画布 / 乐谱导出）一起变；
- 仍是**小于 1** 的倍数（0.6 < 1），「这段只是呼吸空间、不该有一条弦枕那么厚」的约束不破；
- 量级（交互侧 scale = 7.4）：单侧 13.32 → 15.98px（+2.66px），空弦区总高 82.88 → 88.21px（+5.33px）；
  基准图（scale = 1）单侧 1.8 → 2.16px。顺带一提：这段留白也是「指板顶到空弦音符」的距离，
  而横按气泡（高约 36px）恰好悬在指板顶之上 —— 加厚这一档等于给它多让出一点余量；
- 未动的一面：`EDGE_PAD`（图上下留白）与 `MARKER_AREA_H`（空弦区内容高度）一律照旧 ——
  加的是留白，不是把标记撑大；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`fretboardGeometry.test.ts`
  的派生关系用例全为相对断言（等比 / 单调），不写死数值，故不受影响 —— 同上 4 个文件 53 项全通过。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：三处指板的空弦区是否都松了一档、
  空弦音符与和弦名的间距是否仍然上下对称、乐谱导出的图与屏幕是否仍同比例。

### 修复 · 触屏上行末「删除此行」按钮不可达（2026-09-28）

- 现象（用户提「移动端排列和弦行末始终显示删除按钮」）：`ScoreInteractiveArea` 每行行末那枚删除钮
  由 `hoveredLineKey` 驱动显隐（`opacity-100` / `opacity-0 focus:opacity-100`），而触屏没有 hover
  —— 该按钮在手机上等于不存在，「删掉这一行」完全不可达；
- 改法：加**第三档「没有悬停能力的设备常驻可见」**，且走 CSS 媒体变体而不是 JS 判据 ——
  按钮在「行未悬停」那一档挂状态类 `.line-delete-idle`，静态类串上补
  `[@media(hover:none)]:[&.line-delete-idle]:opacity-100`（与 `AddSlot` 的「+」同一套写法、同一判据
  `(hover: none)`，理由同那边：它直接表达「这台设备没有悬停能力」，正是该线索失效的原因；
  触屏二合一接上鼠标后是 `(hover: hover)`、不会误触发）；
- 为什么走 CSS 而不是 `isMobile`：本行整块受 `v-memo` 约束，按断点判就得把 `isMobile` 写进那张依赖表，
  且窗口跨断点时若没命中重渲还会留下旧类名；媒体查询与渲染无关、跨断点自动生效
  （与「槽级 hover 一律走 CSS」是同一条理由）；
- 特异性：状态类带两个类 (0,2,0)，压得住 `:class` 里的 `opacity-0`；行被悬停时不挂这个类，
  `opacity-100` 不受影响。按钮本就没有 `pointer-events-none`（不像「+」那一档），故这里只需放开不透明度；
- 未动的一面：桌面（有悬停）的显隐行为、键盘 `focus:opacity-100`、按钮尺寸与 `text-danger` 配色一律照旧；
  常驻档给的是**全不透明度**（不是「+」那种 45% 的提示档）——触屏上没有 hover 可以把它提升到实色，
  压暗会被读成「不可用」；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过（本文件只动了这一处绑定 + 一条注释）。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：手机上每行行末是否都有删除钮、
  点它是否提示「已删除第 N 行」、桌面悬停显隐是否与改前一致。

### 优化 · 行首行尾添加按钮补外边距并与行末删除钮同尺寸（2026-09-28）

- 需求（用户提「行首行尾的添加按钮增加外边距，两端都要」+「这两个按钮和删除按钮改成一样尺寸」）：
  行首 / 行尾两枚「+」各自向外侧补一份外边距，并与同一行行末那枚删除钮取同一尺寸档；
- 外边距：`ml-xs` 落在行首添加槽、`mr-xs` 落在行尾添加槽（`xs` = 0.375rem ≈ 8.34px）——
  行自身只有 `p-2xs`（5.56px），两枚「+」作为整行内容的两端直接贴着行框，与行号 / 删除钮挤在一起。
  **归宿主而不是 AddSlot**：两端各留多少是行级排版，且行首 / 行尾要留的方向相反，组件无从自行判断；
- 尺寸：`AddSlot` 的「+」补 `size="lg"`（方形 2.3rem / 36.8px）—— 此前落在 ActionButton 的默认 `md`
  （1.9rem / 30.4px），与删除钮的 `lg` 差一档，并排一眼看得出。图标档两枚本就是 `lg`，未动；
  描边仍一粗一细（「+」`bold`、垃圾桶 `thin`），那是各自的语义、不算尺寸差异；
- 未动的一面：两枚「+」的显隐三档（行悬停 / 槽聚焦 / 无悬停设备常驻半透明）与落点视觉一律照旧；
  尺寸变大后添加槽的宽度随之 +6.4px 左右，行高不受影响（行高由和弦卡决定、各槽 `self-stretch`）；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：行首 / 行尾两枚「+」距行两端是否都松开了、与删除钮是否一样大、
  桌面悬停显隐是否与改前一致。

### 修复 · 和弦选择面板在窄视口左右边距不一致（2026-09-28）

- 现象（用户提「chordpicker 浮动窗在移动端改成左右外边距一致」）：`ChordPickerPanel` 在窄视口下
  左边贴边、右边空一截（390px 视口：左 ≈ 8.95px、右 22.25px）；
- 根因：面板贴的是 `right-lg`（右边距 = 1rem = 22.25px），而宽度上限只按视口取了一个比例 `92vw`
  —— 上限生效时右侧固定留 1rem、左侧剩 `8vw − 1rem`，两侧天然不等；
- 改法：**改通用组件而不是业务层** —— `BaseFloatingPanel` 的宽度上限由 `92vw` 改为
  `calc(100vw - 2 * var(--spacing-lg))`（= 视口 − 左右各一份 `lg`），上限生效时左右各恰好 1rem、
  与贴边那一份同值；宽视口下这条上限够不着，仍是宿主声明的 width（弦选面板 520px）。
  上限抽成常量 `PANEL_MAX_WIDTH`，**面板自身与拦截条带同源**（`stripWidthStyle` 也读它，
  否则条带与面板实际占位错位）；`1rem` 一并换成 `var(--spacing-lg)`，改贴边档位时不会分叉；
- 连带只动注释、不动逻辑：`ChordPickerPanel` 里三处「92vw」的说明同步改写（含 `isPanelFullWidth`
  那条 565px 阈值的推导）—— 两个口径算出的「面板满宽」阈值只差 0.7px（92vw → 565.2px，
  新口径 → 564.5px），故 565 这个媒体查询不必跟着动；
- 未动的一面：面板的贴边档（`top/right/bottom-lg`）、进出场与让位位移、`intercept` 条带的存在性
  与层级一律照旧；本次只改宽度上限这一个量；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有任何文件
  引用 `BaseFloatingPanel` / `ChordPickerPanel`，无测试影响面。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：手机上打开和弦选择面板，左右两边留白是否一样宽、
  面板是否仍贴右不越界、宽视口（≥ 565px）下是否仍是 520px 满宽。

### 优化 · 空行只留行首一枚添加按钮（2026-09-28）

- 需求（用户提「如果一行为空行则仅显示一个添加按钮，有任何数据（字符 / 和弦）都显示首尾」）：
  纯空行不再行首 / 行尾各挂一枚「+」，只留行首那一枚；本行有任何字符、或任何一侧的边和弦，
  两端照旧都留；
- 判据：`chars` 非空、或 `startChords` / `endChords` 非空即算「有内容」—— 与行容器的
  `.is-empty-line`（`chars.length === 0`）同源，两处对「空行」不会各执一词。留行首那枚的理由：
  它紧挨行号，读作「给这一行加」；两枚「+」在空行上是同一个入口的两份拷贝（同一行、同一个面板、
  落点也都是这一行），而空行只有一行高，两枚挤在一起只是噪声；
- 改法：行尾添加槽加 `v-if`，条件走新抽的行级判据 `lineHasContent(lineData)`。**没有新增
  v-memo 依赖**：它读的三个量（`chars` / `startChords` / `endChords`）本来就在依赖表里，
  空行填上第一个字时该行照常失效重渲染；
- 未动的一面：行首那枚的显隐三档（行悬停 / 槽聚焦 / 无悬停设备常驻）、两枚「+」的尺寸与外边距、
  落点视觉一律照旧。空行少一枚「+」后该行内容宽收窄约一个控件宽，但行容器是 `flex-[1_1_auto]`、
  行本身 `min-w-full`，行框与悬停区不受影响；行尾那格随之不再是拖拽落点（空行两端本就等价，
  拖到行首那枚即同一落点）；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ScoreInteractiveArea` / `AddSlot`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令
  未代跑 —— 真机值得看：空行是否只剩一枚「+」、填上字之后行尾那枚是否随即出现、
  只挂了边和弦而没有字符的行是否两端都在。

### 调整 · 「忽略空格」改为压缩连续空格（2026-09-28）

- 需求（用户提「预览的忽略空格改成仅连续空格，压缩成一个空格」）：这一档从「未挂和弦的空格不占列宽」
  （等价于把空格整批抹掉）改为**只压连续的那一段** —— 单个空格照旧占一格，一串空格收成一格。
  旧口径的问题正是「连单个空格一起抹掉」：词与词之间只要用一个空格分隔就会粘住，
  而用户要的只是「连续空格别撑出那么大一段空」；
- 落地位置：压缩在**排版入口一次完成**（`wrapScoreLines` 按行压缩 chars），而段落的 chars 就是
  绘制端读的那一份 —— 于是「量到的宽」与「画出来的宽」不可能分叉。此前靠「测量与绘制必须传同一个
  开关」这条纸面约定来保证，任一侧漏传就错位；压进数据后这条约定不再需要，`getCharColumnWidth`
  与 `renderScoreLine` 的 `ignoreEmptySpace` 形参随之摘掉（A4 分页渲染选项里那个只用于转发的字段
  一并摘掉，绘制端读的就是折行压好的 chars）。压缩返回**新数组**：绘制与折行都按 chars 顺序累加 x、
  不按索引记忆位置，故字符列表的增删不会让任何一处的位置假设失效；而长度真的短了，段宽才是实际
  占用 —— 留着空壳字符会让段宽虚高、折行提前换行；
- 边界：挂和弦的空格**不参与压缩**（那一格要承载指板图，收掉等于把和弦图弄丢），且它打断连续性，
  两侧的空格各自重新起算（`空格 空格(挂和弦) 空格` 原样保留）；半角与全角空格同一口径；
- 连带的文案：设置项「忽略空格」的帮助与 aria-label、`settingsStore` / `PlatformPreferences` 的
  字段注释同步改写。**存储键不动**（`scoreIgnoreEmptySpace` 是已落盘字段，改名等于把用户设置丢掉）。
  这一档仍同时作用于预览与导出图（共用排版内核），与设置项原本的适用范围一致；
- 测试：`tests/services/scoreTypography.test.ts` 补一条「连续空格压缩 / 单格与挂和弦的空格不受影响 /
  段宽等于实际占用」的用例。该文件的 `recomputeSegmentWidth` 本就不传这个开关，无需同步；
  原有那条「回借后拼回必须与原句一致」的不变量不受影响（其输入不含空格）；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过、
  `npx vitest run tests/services/scoreTypography.test.ts` 5 项全过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：开着这一档，在「A」与「B」之间敲三格空格是否收成一格、
  单个空格是否还在、挂和弦的空格是否没被吃掉、折行位置与图上实际绘制是否一致。

### 修复 · 云端比对基准在「云端没有数据」时不落地，每次加载都重新探测（2026-09-28）

- 现象（用户提「为什么还是在不停的对比线上数据」）：每次打开 / 刷新应用都会去线上拉一次元数据做比对；
- 机制：启动比对 `checkCloudDataChange` 只在「本地数据校验和与上次比对时相同」时短路。而那个基准
  此前**只在成功取到云端 meta 之后**才写 —— 「meta 为 null（旧数据 / 从未上传）」与
  `FILE_NOT_FOUND` 两条出口都直接 return，基准永远不成立，于是目标侧一直没数据时每次加载都重新探测、
  并重复弹同一条提示。现改为三条出口都写基准（新抽 `armCompareBaseline`）：一致、不一致、
  **云端没有数据**都是确定的比对结论，都算「这份本地数据已比对过」。`localMd5` 因此提到 `try`
  之外（catch 也要用它），`try` 内改用 `const md5` 承载本次比对的读数；
- 代价如实说：云端此后被别的设备上传了数据、而本地一字未改，本条不会自动发觉，要等本地产生一次改动
  才重新探测 —— 与既有 `compareBaseline` 已声明的取舍同源，不是新增损失；
- **仍然存在、且是设计如此的一面**：本地数据一变，下一次加载仍会重新探测（这正是基准失效的条件）。
  开发期反复改数据时看到的就是「每次刷新都联网比对一次」；要改成「只对用户自己配置的同步目标探测」
  或重新引入时间窗，属产品口径变更，本次未动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过、
  `npx vitest run tests/data/syncApplyOverwrite.test.ts` 6 项全过（`tests/` 里没有用例覆盖
  `checkCloudDataChange` 本身）。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：目标侧无数据时反复刷新，是否只在首次出现「请先上传数据」提示、之后不再联网探测。

### 修复 · 和弦选择面板筛选区的三个控件在窄屏被截断（2026-09-28）

- 现象（用户提「拖动和弦浮窗 header 的三个表单控件在窄屏上被截断了」）：面板筛选区的搜索框、
  排序规则、调式键三个控件在手机上同时被截掉；
- 根因：筛选区是**一行** `flex`（搜索框宽度 100%、分段控件 `auto`、调式键 5.5rem），面板被视口压窄到
  300 余像素时三者放不下，搜索框被挤到几乎不可见、后两个被挤出面板。而该区块的注释一直写的是
  **两行**布局（搜索独占一行、排序规则与调式键在下一行左对齐成组）—— 注释与结构在早前的紧凑化里
  失配了（面板初版确实是 `flex-col` + 排序子行）；
- 改法：结构恢复为注释所述的形态 —— 外层 `flex flex-col gap-xs`，搜索框独占首行，排序规则与调式键
  收进 `sort-action-group` 子行（左对齐成组）；子行自身 `flex-wrap`，极端窄的视口下换行而不是被裁；
- 未动的一面：面板宽度与「视口 − 2×lg」的上限、网格列数（3 列 / 2 列）切换、分组页签与分区定位条、
  分区吸顶与滚动定位一律照旧 —— 筛选区只是从一行变两行，头部高度按实测 DOM 走，没有硬编码高度要同步；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ChordPickerPanel`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：手机上搜索框是否独占一行且完整、排序规则与调式键是否在第二行左对齐且都没被裁、
  宽屏（≥ 565px）下三列网格与吸顶行为是否与改前一致。

### 优化 · 窄屏抽屉档下选中和弦 / 乐谱即收起侧栏（2026-09-28）

- 需求（用户提「窄屏点击和弦卡片/乐谱时关闭左侧栏」）：抽屉档下点侧栏里的和弦卡片或乐谱，
  侧栏要自己收起来；
- 为什么必须收：窄屏下侧栏是**盖在内容上的浮层**（主区被遮罩压住且 `inert`，点不进去），
  选完不收就等于自己挡在要看的画面前，用户还得再点一次遮罩；
- 改法：`SidebarLeft` 里 watch 两处**选中态**（`chordEditorStore.draftChord.id` /
  `scoreEditor.activeSongId`），变化且在抽屉档即 `closeSidebar()`。取选中态而不是点击事件：
  选中态一变就是「用户选了新的东西」，与点的是卡片本体、卡片里的按钮还是键盘操作无关，
  也不必让 domain 组件反向通知 app 层（那要给两个列表各加一条对外事件）。桌面档是常驻栏，不生效；
- 未动的一面：遮罩点击与 Esc 收起、`inert` / 位移 / 层级的抽屉实现、桌面档侧栏宽度与主区
  `padding-left` 一律照旧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `SidebarLeft`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：窄屏下点和弦卡片 / 乐谱后侧栏是否收起、桌面档点卡片侧栏是否照旧不动、
  卡片里的编辑 / 删除按钮是否仍只开弹窗（不收侧栏）。

### 调整 · 云端一致性比对加入 24 小时间隔（2026-09-28）

- 需求（用户提「反正不要一直去对比线上数据」）：启动期的云端比对不要一直在跑；
- 改法：比对基准加 `checkedAt`，短路条件从「本地校验和没变」扩成两道 ——
  ① 本地校验和没变即跳过；② 本地变过、但距上次探测不足 `CLOUD_COMPARE_INTERVAL_MS`（24 小时）也跳过。
  于是同一份本地数据不重复探测、本地改了也要等间隔到期才复核，一天至多联网比对一次。
  旧版本写入的基准没有 `checkedAt`，读作 0 = 早已过期，下一次照常探测（无需迁移）；
- 为什么不是「干脆不探测」：这道检测是数据安全的护栏（发现云端被别的设备更新过，给出一键修正方向，
  见 notifyCloudMismatch），间隔是「不再打扰」与「仍能发现云端改动」之间的取舍点；
- 与上一节的关系：上一节修的是「云端没有数据时基准不落地、于是每次加载都必探」，
  本节修的是「本地一变下次加载就探」—— 两条叠加后，自动探测的实际频率是「本地未变 → 不探；
  本地变过 → 至多一天一次」；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过、
  `npx vitest run tests/data/syncApplyOverwrite.test.ts` 6 项全过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：反复刷新时是否只有首次联网比对、
  `localStorage['CHORD_LAB_SYNC_COMPARE_BASELINE']` 里是否带上了 `checkedAt`。

### 优化 · 预览页菜单在窄屏改由右上角角标打开（2026-09-28）

- 需求（用户提「预览乐谱图片在窄屏不再长按触发，而是改成点击右上角角标」）：窄屏上的本页菜单
  （复制本页 / 下载本页）换成右上角一枚明确可点的角标，长按不再承担这件事；
- 为什么放弃长按：触屏上的长按由浏览器接管（弹的是系统菜单），要把它改成应用的入口就得拦手势 ——
  本轮先按「长按 = 合成右键」写过一版桥接，真机实测后**判定方向不成立、已整体回退**（用户口径
  「不是默认事件的问题」）。角标不需要跟浏览器抢手势语义，是可发现、可点、与右键同一条出口的替代入口；
- 改法：页面槽位里加一枚 `ActionButton`（icon-only / sm / `icon="ellipsis"`），定位
  `absolute top-2xs right-2xs`，点击走**与右键完全相同的出口** —— 同一个 `useTargetMenu` 实例、
  同一条「在光标处打开」的 `openPageMenuAt(e.clientX, e.clientY)`，因此菜单项、标题、描边高亮
  （`isPageMenuTarget`）、滚动收起、锚点机制一律复用，没有第二套菜单逻辑；
- 挂出判据是**并集**：窄屏（`useResponsive` 的 `isMobile`，< md）**或**任何没有悬停能力的设备
  （`useMediaQuery('(hover: hover)')` 取反）。只按窄屏判，宽而触屏的平板仍无入口；只按无悬停判，
  桌面浏览器把窗口拖窄（有鼠标有右键）就看不到角标 —— 而「窄屏」正是提出这件事的场景。
  两者都不满足（桌面宽屏）时行为与改前完全一致，仍是右键；
- 骨架格（该页尚未出图）不挂角标：与右键那条路一致 —— 没有图可复制 / 下载；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ScorePreviewPane`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：窄屏每页右上角是否都有角标、点它是否在点击处弹出「复制本页 / 下载本页」、
  滚动预览时是否收起、桌面宽屏是否不出现角标且右键照旧。

### 修复 · 窄屏长按仍会弹出本页菜单、被选中的页面仍描边（2026-09-28）

- 现象（用户提「长按不再触发菜单，窄屏乐谱图片选中不显示边框」）：加了角标之后，长按页图
  **仍然**会弹出「复制本页 / 下载本页」，且被选中的那一页会浮出一圈描边；
- 根因：长按这条线从来没有真正断开 —— 浏览器（Android Chrome）长按图片自己就会派发一个
  `contextmenu`，页面槽位上的 `@contextmenu` 委托照单全收，于是「长按 → 本页菜单」依旧成立。
  上一轮回退掉的只是我们**自己合成**的那个 contextmenu 桥接，浏览器原生的那一个一直没人处理。
  描边是同一个原因的另一半：菜单一开，`isPageMenuTarget` 命中，该页套上 `outline-primary`；
- 改法：把三条判据收拢到同一个开关 `showPageMenuBadge`（窄屏 **或** 无悬停能力）——
  ① 角标挂出（见上一节）；② **这一档不认 contextmenu**：没有悬停能力就没有右键，此时派发的
  contextmenu 只可能来自长按，`preventDefault` 后直接返回，长按什么都不发生（连浏览器自己的
  图片菜单也不弹 —— 与改前同一口径，改前本就一直在拦，不是新增行为）；③ **这一档不描边**：
  入口就是页角那枚角标，点的是哪一页一目了然，而页面在窄屏上被缩得很小，2px 描边压在图上
  更像「图裂了」；
- 未动的一面：桌面宽屏（有悬停能力且非窄屏）三条全不变 —— 右键弹菜单、被选中的页照旧描边；
  骨架格的右键放行、菜单项与标题、滚动收起、锚点机制一律照旧；
- 已知边界（如实说）：判据是**设备能力**，不是「这一次事件来自哪个指针」。触屏二合一设备
  （`hover: hover` 且带触摸屏）上用手指长按仍会走右键那条路 —— 但那台设备本来就有右键、
  也本来就不挂角标，两档口径一致，不为它单开一条分支；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ScorePreviewPane`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：窄屏长按页图是否毫无反应（不弹本页菜单、也不弹系统图片菜单）、点角标弹出的菜单
  是否不再给该页描边、桌面宽屏右键是否照旧弹菜单且照旧描边。

### 优化 · 排列和弦的行内三枚按钮在移动端整体小一档（2026-09-28）

- 需求（用户提「移动端排列和弦三个按钮都改小一档」）：排列和弦每行那三枚图标钮
  （行首「+」/ 行尾「+」/ 行末删除）在移动端整体降一档；
- 改法：三枚钮的控件尺寸档由**宿主统一下发** —— `ScoreInteractiveArea` 新增 `actionButtonSize`
  （`isMobile` ? md : lg），两处 `AddSlot` 与行末删除钮共用同一个值。`AddSlot` 因此多了一个
  `size` prop（缺省仍是 lg，行为不变），图标档跟随同一档位；移动端由 lg（方形 2.3rem / 图标 18px）
  落到 md（1.9rem / 16px）；
- 为什么走 prop 而不是像「+」的常驻那样写 CSS 媒体变体：尺寸档是控件标尺里的字面量
  （`platform/ui/controlSizes` 的 `CONTROL_SQUARE_CLASSES`，有单测逐档钉住），
  硬写 `max-md:h-[1.9rem]` 等于把标尺字典抄第二份、改一档要满仓找。代价是行的 `v-memo`
  依赖表里多了 `isMobile`（跨断点那一瞬已渲染行各重渲一次），顺带把 `viewScale` 此前没进表、
  跨断点不刷新的缺口一并盖上 —— 显隐那一档仍走 CSS，那条不变量不变；
- 未动的一面：三枚钮的外边距（`ml-xs` / `mr-xs`）、显隐三档、描边语义、落点与焦点协议、
  桌面档尺寸一律照旧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `AddSlot` / `ScoreInteractiveArea`，无测试影响面。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：移动端三枚钮是否都小了一档且彼此仍同尺寸、
  桌面档是否与改前一致、把窗口从宽拖到窄时按钮是否当场换档（不必等悬停某一行）。

### 优化 · 排列和弦两枚「+」的外边距加宽到两侧（2026-09-28）

- 需求（用户先提「添加按钮增加外边距，宽屏窄屏都要」，随即补「左右都要啊」，再报「行首的没有效果」）：
  行首 / 行尾两枚「+」的外边距加宽，且**两侧都要** —— 初版只补了外侧那一份（行首 `ml` / 行尾 `mr`）；
- 改法：两枚都改 `mx-md`（0.75rem ≈ 16.7px；初版外侧是 `xs` ≈ 8.3px），左右各一份。
  只留外侧那一份时按钮与相邻内容是粘的：行内相邻槽一律 `gap-0` 紧贴，内侧那份缺口本来就在；
- 为什么中间试过 `sm` 又提到 `md`：行首那一侧的左邻是**行号 div，它自带 `mr-2`（同为 0.5rem）**，
  于是 `sm` 只是把既有的 19.5px 间隙加到 22.2px（+2.8px），肉眼分辨不出 —— 用户报的「行首的没有效果」
  就是这个；再宽一档（+8.3px）才形成可辨的变化；
- 为什么不随宽窄屏分档：按钮本身在移动端已降一档（见上一节），外边距若跟着缩，两端只会更挤；
  这一档要的是「松」，两档同值即可；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ScoreInteractiveArea`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：两枚「+」左右两侧是否都明显松开、行首那侧（挨着行号）是否终于看得出变化、
  移动端（按钮已小一档）是否不再显挤。

### 优化 · 浮动面板在窄屏的左右留白收窄一档（2026-09-28）

- 需求（用户提「窄屏上 chordpicker 的浮动窗左右边距缩小一点」）：窄屏下面板两侧的留白收窄；
- 改法：`BaseFloatingPanel` 把「面板左右留白」抽成一个 CSS 变量 `--fp-gutter`（唯一来源，
  常量 `PANEL_GUTTER_CLASS`）—— 宽屏 `lg`（1rem / 22.25px），窄屏（< md）收到 `sm`（0.5rem / 11.1px），
  与预览区 / 排列区的窄屏留白同一档（`max-md:p-sm` / `max-md:pl-sm`）。三处消费全部改读它：
  面板的 `right` 偏移（原 `right-lg`）、宽度上限 `PANEL_MAX_WIDTH`（原写死 `--spacing-lg`）、
  拦截条带宽度（原 `+ var(--spacing-lg)`，右侧那条竖带原 `w-lg`）。变量同时挂在面板与拦截层
  两个根上 —— 两者是 Teleport 到同一父节点下的兄弟，谁也继承不到谁；
- 为什么必须一次改全：留白是这个组件里「左右对称」的唯一来源 —— 只收窄上限而不动 `right`，
  立刻回到 2026-09-28 修掉的那个「左边贴边、右边空一截」；只动面板不动条带，条带与面板占位
  错位，留白上的指针拦截会盖住面板本体或漏出缺口；
- 连带同步：`ChordPickerPanel` 里几处按「视口 − 2×lg」推导的注释改为「视口 − 2×留白」。
  **565 那个阈值刻意不动**：它是「面板已满宽」的最坏档（2×lg），窄屏留白收窄后只会更早满宽，
  565 仍是安全值；代价是 542 ~ 565px 这一段面板其实已满宽、列数仍保守取 2 列，已在注释里写明；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `BaseFloatingPanel` / `ChordPickerPanel`，无测试影响面。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏下面板左右留白是否都收到 0.5rem 且仍左右等宽、
  宽屏是否与改前一致（1rem）、面板内拖拽时留白上的落点是否照旧被条带接管（不遮面板、不留缝）。

### 优化 · 排列和弦的和弦卡片删除钮在窄屏常驻可见（2026-09-28）

- 需求（用户提「排列和弦的和弦卡片删除按钮在窄屏上始终显示」）：和弦卡片右上角那枚删除钮
  在窄屏下不再依赖悬停；
- 改法：`ChordSlot` 的 `.slot-overlay` 覆盖层加两条窄屏常驻变体
  （`max-md:[&.slot-overlay]:pointer-events-auto` / `max-md:[&.slot-overlay]:opacity-100`），
  与既有的 `group-hover` / `group-focus-within` 两档并列。显隐仍走 CSS 变体、不进 `:class` 条件，
  跨断点自动生效；两条变体锚在 `.slot-overlay` 这个**既有**类上（它不是状态类，只是借它把特异性
  抬到 (0,2,0)），才压得住同层的 `pointer-events-none` / `opacity-0`，胜负不必依赖 Tailwind 的
  产出顺序 —— 与 `AddSlot` 的 `.add-slot-idle`、行末删除钮的 `.line-delete-idle` 是同一手法；
- 为什么判据取**宽度**而不是 `(hover: none)`：后者描述的是**设备**，描述不了「桌面浏览器把窗口
  拖窄」—— 那种情况下 hover 能力仍在，按钮照旧只在指针精确悬到某张卡片上时才浮现，而用户是按
  宽度理解界面的。触屏那一侧宽度本来就 < md，两条同时命中、不冲突；
- 代价（记在这里）：常驻后窄屏下这枚钮的 36px 热区（视觉 24px + 伪元素外扩 6px）一直可命中，
  落在卡片右上角的那一下是删和弦 —— 既不是打开面板也不是起拖（删除钮的 `pointerdown` 本就
  `stopPropagation`）。这正是「常驻可见」的另一面，也是热区只扩 6px 的原因；
- 未动的一面：行末「删除此行」那枚仍是 `(hover: none)` 单档（它是另一枚钮、另一处状态类
  `.line-delete-idle`，触屏那一档早已存在）；`ActionButton` 本体（尺寸 / 图标档 / 热区外扩）一律未动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ChordSlot`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：窄屏每张和弦卡片右上角是否常驻一枚垃圾桶、宽屏是否仍只在悬停时出现、
  窄屏点卡片右上角是否如预期是删除而非打开面板。

### 新增 · 排列和弦支持手势缩放整个界面，倍率持久化（2026-09-28）

- 需求（用户提「允许以手势放大和缩小整个排列和弦界面而不是字号和和弦，做持久化记录」）：
  双指捏合缩放整个排列区，倍率记入持久化；
- 改法：新增组合式函数 `score/editor/composables/usePinchZoom.ts`（只做换算、不持有值：读现值 /
  写新值由调用方给），三条路径汇成同一套百分比 —— 触摸双指捏合（按两指间距相对起点的比值）、
  触控板捏合与鼠标 Ctrl+滚轮（浏览器把触控板捏合投递成带 `ctrlKey` 的 wheel，与预览区同一套换算）。
  值落在 store 的新维度 `arrangeViewZoom`（`useStorage` + 新键 `SCORE_ARRANGE_VIEW_ZOOM` +
  `percentScaleSerializer` + 既有防抖落盘，与另外两条 arrange 缩放同源），取值范围 50% ~ 200%
  （`score/constants` 的 `ARRANGE_VIEW_*`，与预览缩放常量同处）；
- **缩放作用在容器上，不是逐个节点上**：界面倍率只落在内容包裹层上（手势中走 `transform` 预览、
  停下提交为 CSS `zoom`，见下一条），子组件一个都不重渲。曾按「把倍率乘进 `effectiveFontScale` /
  `effectiveFretboardScale`」做过一版，用户实测判定「很卡」且方向不对 —— 那是节点级缩放：
  捏合每一帧都要重渲每个和弦槽、重画每块指板画布；
- 因此它是**独立维度**、不并进 `arrangeFontScale` / `arrangeFretboardScale`：那两条是用户各自调好的
  「字与指板谁大谁小」的比例，界面倍率叠在它们之上，两者的大小关系才不被手势改写。两者在视觉上相乘、
  在代码上互不相干（`effective*` 仍是各自那条 arrange 缩放，不含界面倍率）；
- `zoom` 的坐标系（无头 Chromium 探针实测，本功能全部长度换算的依据）：容器内所有长度都按倍率渲染
  —— `offsetHeight` 报**局部** px、`getBoundingClientRect()` 报**视觉** px，滚动容器的
  `clientHeight` / `scrollTop` / `scrollHeight` 报缩放后的**视觉** px；百分比尺寸仍按容器算
  （`min-w-full` 在倍率 > 1 与 < 1 时都不会把内容缩离容器，只是内容本身按倍率变大变小）。
  故本组件内所有长度统一记**容器局部 px**，只在两处显式换算（`toContainerPx` / `toVisualPx`）：
  行高与空档高度是局部 px，与滚动几何比较时换算成视觉 px；
- 行高为什么记局部 px 而不是量到的视觉 px：行高由字号 / 指板尺寸决定，**与容器 zoom 无关** ——
  局部 px 在缩放下是不变量，捏合改倍率既不必重新量行，也不会把每帧都在变的倍率牵进
  `--score-line-height-*` 那两条 CSS 变量（它们继承给整棵子树，值一变就是一次全子树样式 + 布局失效）。
  量到视觉 px 又不除回来，占位高度会被放大 zoom 倍，内容总高随之偏大、滚不到底；
- 触摸端的前置条件：容器（`BaseScrollArea` 根）声明 `[touch-action:pan-x_pan-y]`。默认 `auto` 下
  浏览器先接管双指手势做**页面级**捏合缩放、随后补发 `pointercancel`，我们这边只看到一次被取消的
  触摸（此时再 `preventDefault` 已经晚了）；禁掉它之后手势才轮到本函数，而 `pan-x pan-y` 保留单指
  滚动 —— 槽位本来就是这一档，容器补上它才让「落在槽外空白处」的双指手势同样归我们；
- 手势开始时先取消拖拽（`useLyricsDragDrop` 新增导出 `cancelDrag`，与原生 `pointercancel` 走同一条
  收尾、不新增路径）：两指落下时第一根手指可能已压在某个和弦上、起了长按计时（`LONG_PRESS_DELAY`
  280ms），不取消就会在捏合途中起拖、松手时把和弦丢到别处。取消同时清掉那个计时器，而计时器只在
  新的 pointerdown 上重挂，故整个捏合期间不会再被起拖；
- 会话状态以「起点两指的 identifier」为标志，而不是一个布尔量：触摸端的 `touchend` / `touchcancel`
  并非总会到达（切走应用、浏览器接管手势都可能吞掉它），只靠这两个事件复位的布尔量一旦漏复位，
  就会**永久**把后续单指滚动也一起 `preventDefault`（歌词再也滑不动，比手势本身失灵严重得多）。
  带 identifier 后每次 `touchmove` 都能自判：不足两指即结束会话、把剩下的手势交回浏览器；
  两指被换掉（抬起一指又补上）则以当前间距为新基准重开，不做跨会话累计；
- 未动的一面：顶栏偏好里那两条滑块仍各自读写 `arrangeFontScale` / `arrangeFretboardScale`，
  **界面倍率不反映在滑块上**（两个维度各自独立，它目前只能靠手势改，无对应控件）；
  预览 / 导出维度不受影响；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `usePinchZoom`，`useLyricsDragDrop` 的既有用例（`tests/ui/composables/useLyricsDragDrop.test.ts`）
  只断言行为、不断言导出面，本次只新增一个导出、未改既有行为，无测试影响面。类型检查无文件级形态、
  未验证；全量关卡按禁令未代跑 —— 真机值得看：双指捏合是否整块缩放且不再触发浏览器页面缩放、
  捏合起手时是否不会误起拖（按住和弦再补第二指）、Ctrl+滚轮 / 触控板捏合是否同样生效、
  刷新后倍率是否保留。

### 优化 · 手势缩放改「transform 预览 + 停下提交」：捏合不再每帧重光栅化（2026-09-28）

- 症状（用户实测，控制台）：`Handling of 'wheel' input event was delayed for N ms`（N 到过 1277）、
  `requestAnimationFrame handler 用时 N ms`、`Forced reflow while executing JavaScript`，
  落点一度指到 `vScrollbar/scrollbarOverlay.ts`；
- 归因（用户贴出的 `long-animation-frame` 输出是决定性的）：长帧 50–490ms，而**同一帧里的脚本归因
  只有 0–21ms**（只点到 `useRafThrottle` 与 v-scrollbar 的 `onwheel`，各 8–21ms），多数长帧干脆
  一个脚本都没有 —— 时间全花在**渲染**上，脚本这边没有可优化的余地。故先前的「补挂让路」「写入合帧」
  都只是外围，真正的成本是**改 `zoom` 会改整棵子树的光栅化倍率，每帧都得把可视区重新光栅化一遍**；
- 探针把便宜的假设逐个排除（无头 Chromium 实测）：① 改 zoom 的布局代价 —— 300 行、隔行一张画布、
  带 `content-visibility: auto`，反复改 zoom 并强制布局，平均 1.0ms / 最差 6.2ms（去掉
  `content-visibility` 才升到 5.9 / 11.3ms）；② 改 zoom **不触发 ResizeObserver**（RO 报的是元素
  自身坐标系的局部尺寸，被 zoom 的子树内部尺寸一个都没变）；③ 逐帧 20 步改 zoom 只补发 0 到 1 次
  scroll 事件（顶部 0、中部 1、底部 0；加 `overflow-anchor: none` 后中部也是 0），不存在滚动事件
  风暴；④ 把 `refreshAll` 的读写序列复刻一遍 ×30 只要 7.0ms。四条都排除后只剩「重光栅化」这一条；
- 改法：手势期间**只写包裹层的 `transform: scale()`** —— `transform` 只改合成层的变换矩阵，既不碰
  布局也不改光栅化倍率，先挂 `will-change: transform` 让它独立成层，逐帧改矩阵由合成器缩放**已有的
  光栅结果**。变换原点按容器局部 px 锚在**可视区中心**（可视区中心相对包裹层左 / 上边缘的偏移，
  用两边 `getBoundingClientRect()` 之差算 —— 包裹层窄于容器时会被 `mx-auto` 居中，它的左边缘并不在
  内容原点；再除已提交倍率换算成局部 px），内容于是在手指下原地缩放，而不是从内容左上角甩出去；
- 提交时机：沉降窗口（`ZOOM_SETTLE_MS = 200`）收口时写一次 `zoom`、撤掉预览层，并把**手势期间锚在
  可视区中心的那一点放回中心**，随后 `expandAtViewport` + 边缘态刷新（后三步排在 `nextTick` 之后，
  按新几何算）。触摸端与滚轮端共用这一条 —— Ctrl+滚轮没有「结束」事件，按时长收口比按事件收口可靠。
  手势期间 store 不写、Vue 一次都不重渲、内容总高不变，于是平台的滚动条几何刷新、边缘羽化与补挂
  全都不被惊动，整段手势是**零 JS 渲染**的；
- 锚点回位（用户实测「松手后位置变化了，滚动位置没有停在放大的位置」）：`zoom` 改的是内容的渲染尺度，
  而 `scrollTop` / `scrollLeft` 是**容器 px**、浏览器不会跟着倍率换算 —— 倍率一变，同一段 `scrollTop`
  就对应到另一处内容，不补就是松手一跳。口径：中心点按「中心相对包裹层左 / 上边缘的视觉偏移 ÷ 倍率」
  量（两边用 `getBoundingClientRect` 之差，`mx-auto` 的居中量与容器内边距都自动算进去，不靠 `scrollLeft`
  反推；手势中量到的是**已按预览倍率缩放**的 rect，故除的是预览倍率），撤 `transform` 前量一次、
  提交后量一次，差值乘回已提交倍率即所需滚动量（缩小时写出界由浏览器钳位，即「贴边」）；两次测量与
  其后的补挂 / 边缘态刷新都必须在新 `zoom` **落到 DOM 之后**（写 store 只是排队，DOM 要到下一个微任务
  才更新，此前那几步量到的是旧倍率的几何）。写 store 与撤 `transform` 同在一个微任务里落定，
  不会闪出一帧「未缩放」的画面；
- 保留的两件外围机制：`usePinchZoom` 的按帧合帧（`getValue` 改为先读预览值 —— 手势期间 store 是
  **旧值**，读它会拿已提交的基准去算增量、同帧多发的位移被整段丢掉）；沉降窗口内的补挂闸门
  （`expandNextBatch`）—— 它现在护的是**提交那一帧**（提交会改内容总高、可能补发 scroll 事件，
  不挡就会在那一帧再叠上一整批行）；
- 代价（明码标价）：手势中画面略微发虚（合成器缩放已有光栅，不再逐帧重光栅），提交后恢复清晰；
  提交那一帧照旧要重光栅化一次；滚动几何在手势期间不跟着变（内容总高不变），收口时一次性补到位；
- 未动的一面：`v-scrollbar` / `v-edge-fade` / `BaseScrollArea` 一行未改（`src/platform/` 是稳定
  保护区）—— 它们在这条链里都是被动承接方，把每帧的 `zoom` 写入去掉后不再被惊动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；类型检查无文件级形态、
  未验证；全量关卡按禁令未代跑 —— 真机值得看：长谱面捏合是否已经顺滑、内容是否在手指下原地缩放
  （而不是往右下角甩）、松手瞬间是否只有一次轻微的重绘、**松手后画面是否停在放大前那一处**（而不是
  跳到别处）、松手后该挂的行是否照旧挂上（视口不落空）、正常滚动时的兜底扩容是否不受影响。

### 新增 · 乐谱预览支持手势缩放（触摸双指捏合 / Ctrl+滚轮 / 触控板捏合）（2026-09-28）

- 需求（用户提「乐谱预览的放大缩小没有适配手势」）：预览页的缩放要能用手势；
- 现状：预览本来就有 Ctrl+滚轮 / 触控板捏合缩放（写 `activePercent`），但**触摸端的双指从未被接管**
  —— 容器没声明 `touch-action`，双指一落下就被浏览器当成**页面级**捏合，预览本身纹丝不动。
  组件里那句「Ctrl+滚轮 / 捏合 / 步进器三通道」中的「捏合」此前是缺的；
- 改法：与排列和弦区共用 `usePinchZoom`（它就在 `score/editor/composables`，预览早已从该目录取
  `useScoreLinesData` 与 store），两条通道汇成同一套百分比换算，最终都写 `activePercent`
  —— 写它即自动解除自适应模式、并按上下限钳制；容器补上 `[touch-action:pan-x_pan-y]`：禁掉
  页面级捏合，同时保留单指横向翻页与纵向滚动。原先自写的那段 wheel 监听随之删掉（同一个手势
  不留两份实现），`useEventListener` 也一并从导入里摘掉；
- 顺手修掉的「不跟手」：页盒平时带 `transition-[…,height,width]`（滑杆与「适应」开关要平滑补间），
  而手势是**逐帧**改尺寸 —— 每一帧都把上一段过渡打断、从当前位置重起一段，画面于是恒滞后手指。
  故新增 `isZoomGesturing`（手势窗口，最后一笔之后静默 200ms 收口，与 `usePinchZoom` 的会话判定
  同口径）：窗口内页盒只过渡描边 / 阴影，尺寸瞬时跟随。Ctrl+滚轮那条通道此前也吃这个亏，一并修好；
- 未动的一面：滑杆 / 「适应」开关 / 上下限 / 默认值与持久化（`settingsStore.previewZoomPercent`）
  一律未动；`v-wheel-scroll` 对组合键的放行口径未动（ctrl/meta/alt + 滚轮仍交还本函数）；
  A4 分页、页脚合成与 `content-visibility` 那套页流机制未动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `ScorePreviewPane`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：触屏双指捏合是否整页缩放（而不是把浏览器页面缩掉）、单指是否仍能横向翻页与纵向滚动、
  捏合时页面是否 1:1 跟手、松手后百分比读数与滑杆是否同步。

### 修复 · 顶栏第一行在窄档换行时塌高：与工作台路由不再差 13px（2026-09-28）

- 症状（用户报「从工作台切换到乐谱，header 高度会变少」）：同一个 `<header>`，工作台路由 55.6px，
  乐谱路由的第一行只有 ≈42.3px，切路由看得见跳动；
- 根因：`min-h-10` 挂在 `<header>` 这个**盒子**上，只保证盒子不小于 2.5rem；而多行 flex 容器的行高由
  内容决定（`min-height` 不会下发给每一行）—— 乐谱路由在窄档多一行 Tab 栏，整盒高度早已超过 2.5rem，
  第一行于是退回内容高（左右两组里最高的是 1.9rem ≈ 42.3px 的图标钮）；工作台路由只有一行，整盒被
  `min-h-10` 撑到 55.6px，那一行看上去就是 55.6px。两边的差正是这 13.3px；
- 改法：把 `min-h-10` 从「整盒」下移到**第一行的两个成员**（左组 / 右组各自的静态 class）。第一行的高度
  于是不再随顶栏的行数变化，恒为 2.5rem —— 与工作台路由（单行）逐像素等高；
- 未动的一面：乐谱 Tab 栏那一行仍是 `h-8` / `h-7`（刻意低于第一行，见上面「窄档降档」一节）；
  宽档（Tab 栏绝对铺满那档）本就只有一行，改动前后逐像素一致；
- 验证：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里只有
  `tests/ui/composables/useResponsive.test.ts` 在注释里提到 `TopHeader`，无测试影响面。类型检查无
  文件级形态、未验证；全量关卡按禁令未代跑 —— 真机上值得看：窄档切换工作台 / 乐谱时顶栏第一行是否
  不再跳动、≥ 1024px 那一档是否与改动前逐像素一致。

### 优化 · 工作台画布（内容区）补上边缘羽化（2026-09-28）

- 需求（用户提「工作台内容区域也加羽化」）：工作台原本只有**右侧面板列**有羽化
  （`BaseScrollArea` 的 `:fade="!isStacked"`），而承载它的画布这一层是裸 `overflow-auto` ——
  滚出内容时是硬裁断；乐谱互动区走 `BaseScrollArea`（`fade` 默认开），两条路由的观感因此不一致；
- 改法：画布补 `v-edge-fade`（不带修饰符 → 按实际溢出轴自动判定，与 `BaseScrollArea` 的
  `axis='both'` 写法等价）。内容不溢出时不挂遮罩、零开销；贴边一侧不渐隐、被裁切一侧羽化，
  滚到顶 / 底时该侧自动收起；
- 为什么不去套 `BaseScrollArea`：本层同时是**堆叠判据的量取点**（`canvasRef` 观察它的边框盒）
  与 `:class` / `:style` 随 `isStacked` 切换的同一个节点，换组件会动 DOM 结构与 attrs 落点，
  超出本次需求；指令是同一份实现，视觉口径完全一致；
- 未动的一面：面板列自身的羽化与滚动条、画布留白（`canvasGutterStyle`）、堆叠判据均未动。
  并排档下遮罩落在画布盒上，而面板列宿主盒的上缘只比画布上缘低 `edgePad − spacing-xl` ≈ 18.4px，
  于是它的最上沿有不到 2px 落在 20px 羽化带内 —— 那一小段是宿主盒自己的留白（卡片之下还有
  `py-xl`），够不着任何内容，观感无差；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `WorkbenchView`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：窄屏堆叠档滚动时上下两端是否出现渐隐、滚到顶 / 底是否自动收起、并排档不溢出时
  是否完全无遮罩（应与改前逐像素一致）。

### 优化 · 移动端收窄「编辑歌词」文本域的内边距（2026-09-28）

- 需求（用户提「移动端缩小编辑歌词 input 的内边距」）：文本域**自身**写死 `p-xl`
  （1.5rem ≈ 33.4px，在 `BaseTextarea` 里），而外层包裹的窄屏档早已收到 `px-sm py-sm`（0.5rem）
  —— 两圈内边距只收了一圈，手机上文字四周仍留着 1.5rem 的空白；
- 改法：左右与上收到 `sm`（0.5rem ≈ 11.1px，与外层窄屏档同值），**下边距保持 `p-xl` 不动**：
  `BaseTextarea` 右下角的字数统计（`bottom-2` + 约 26px 高）就落在那一圈里，收到 0.5rem 会被压在
  最后一行歌词上。类写在本组件下发给它的 `class` 上，落在 `BaseTextarea` 的**根元素**（即可见盒，
  内边距与 `size-full` 同属那一层 —— 该原语的可见盒在同一批改动里随后从 `<textarea>` 上移到根元素，
  见下面「长文本输入框」一节；两处合起来才是本条生效的完整口径）；
- 判据口径：仍按本文件既有写法取 `max-md:`。注意它在本项目里实际是 `@media (width < 48rem)`
  = **< 1068px**（根字号 22.25px，Tailwind 断点按 rem 定义），不是 768px —— 与 `useResponsive`
  的 px 断点不一致的老问题照旧（见上面「编辑歌词字号降一档」一节）；
- 未动的一面：桌面档逐像素不变；`BaseTextarea` 的内边距**值**未动（仍是 `p-xl`），改的只是它落在
  哪一层与哪些窄屏覆盖类；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；Tailwind 类由一次性探针
  （`.temp/`，跑完即删；`@tailwindcss/node` 的 `compile()`）确认生成：
  `max-md:px-sm` → `@media (width < 48rem) { … { padding-inline: var(--spacing-sm) } }`、
  `max-md:pt-sm` → `padding-top: var(--spacing-sm)`；两者都排在 `p-xl` 之后，故只覆盖对应方向、
  下边距自然落回 `p-xl`。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏下文字四周留白是否明显收窄、右下角字数是否仍落在空白处
  而不压住歌词、桌面档是否与改前逐像素一致。

### 修复 · 长文本输入框的内边距滚进滚动口就没了：可见盒上移到根元素（2026-09-28）

- 需求（用户提「长文本 input 改成 padding 始终可见」）：输入框的内边距要始终看得见；
- 根因：滚动容器的内边距属于**滚动口**（滚动口 = padding box），内容滚进去就把它盖住。`BaseTextarea`
  原先把 `p-xl` 写在 `<textarea>` 自身上，于是歌词一长、往里滚，四周的内边距（尤其上边距）就全没了，
  滚到底时下边距同样看不见（内容末端与裁切线齐平）——「有内边距」只在首尾两帧成立；
- 改法：把可见盒（描边 / 圆角 / 底色 / 内边距 / `transition`）从 `<textarea>` 上移到**根元素**，
  `<textarea>` 只做透明的滚动出口（`border-0 bg-transparent p-0`）。内边距因此落在不滚动的包裹层上，
  内容永远进不去。外框位置与改前**逐像素一致**：消费方给的 `size-full` 依旧落在根上，而原先文本域
  `size-full` + 自带描边，它的边框盒就等于根盒；
- 聚焦环：`data-focusable-outline` 随可见盒落到根元素 —— 环由 `closest()` 找到它，几何不变；若留在
  `<textarea>` 上，环会被内边距整个缩进去一圈。`vGridNav` 的 `DEFAULT_SELECTOR` 也认这个标记，但它
  只作用于和弦选择 / 分组列表 / 弹窗那几处容器，不含本控件所在的乐谱主内容区，故不引入额外的导航格；
- 顺带收拢的可见盒状态类：`variantClasses` + `stateBorderClasses` 合并为 `frameClasses` —— 三者都产出
  `bg-*` / `border-*`，分成两份时「谁赢」只由 Tailwind 产物里的先后决定（与类数组顺序无关）。
  按产物顺序核对过两处旧口径：玻璃态的静止描边一直是 `border-glass-border`（它排在
  `border-border-light` 之后），而 `border-danger` 排在它之前 —— 玻璃态的 `invalid` 描边此前根本没
  显出来，收成一处后按语义生效（本项目暂无 `invalid` 消费方，属预防性修正）。`:enabled` 前提改为显式
  判 disabled（`:enabled` 只对表单元素成立，而描边如今画在 div 上），`focus:enabled:bg-surface-panel`
  改为根元素上的 `focus-within:bg-surface-panel`；
- 消费方：`ScoreLyricsEditor` 的窄屏内边距覆盖由后代变体 `max-md:[&_textarea]:px-sm` 改为直接写
  `max-md:px-sm max-md:pt-sm`（内边距与 `size-full` 同属根元素，不必再打进去）；
- 影响面：`src/platform/ui/input/` 属 `02-protected-zones.md` 的「一」所列保护区 —— 本次不动依赖方向、
  不动 zone 规则，也未放宽保护区；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/ui/baseInputLazyCommit.test.ts`
  只按 `textarea` 选择器触发事件、不涉类名，无影响。类型检查无文件级形态、未验证；全量关卡按禁令
  未代跑 —— 真机值得看：歌词很长时上下滚动，四周的内边距是否始终在（文字不贴边）、聚焦环是否仍贴着
  输入框外沿、悬停 / 聚焦 / 禁用三态与改前是否一致、右下角字数是否仍落在空白处。

### 优化 · 顶栏的乐谱 Tab 栏改为按实测宽度判定是否独占一行（2026-09-28）

- 需求（用户提「header 在宽屏也做响应式, 避免重叠」）：宽屏下居中铺满的 Tab 栏要能避开左右两组；
- 现状：判据是 `breakpoints.smaller('lg')`（1024px），依据是一段三段自然宽的估算（左组 279px、
  右组 312px（dev 构建多两枚图标 ≈ 359px）、Tab 栏 284px → 阈值 952 至 1000px，正好落在 lg 上）。
  但估算与真实渲染对不上：dev 构建 1024 至 1100px 这一段居中就会把 Tab 压在图标上，而右组宽度还会随
  路由（工作台 / 乐谱的动作按钮不同）变化 —— 断点看不见这些。工作区里那句「判据是实测的」的注释与
  `headerRef` / `leftGroupRef` / `tabRowRef` 三个模板 ref 此前只落了注释与 ref，判据本身仍是断点；
- 改法：改为实测 —— 量 Tab 控件实际占的横向区间，与左右两组各自**内容**的边缘比（量内容不量盒：
  宽档下两组都是 `flex-1`、各占半幅，盒宽与内容宽无关），两边各留 `TAB_ROW_MIN_GAP = 16`。
  控件取自己的 rect 而不是本栏的（本栏宽档绝对铺满、窄档 `basis-full`，量它没有意义）：控件两态都由
  `justify-center` 居中、锚点相同，故判据在两种布局间自洽，不会「落一行之后又觉得自己装得下」来回翻；
- 重测时机：`observeResizeTree(header)` —— 顶栏盒宽（窗口缩放、侧栏让位）+ 两组的直接子元素盒尺寸 +
  子树增删 / 文本变化；后两者覆盖「路由切换换了动作按钮」「dev 构建多两枚图标」这类**不改顶栏宽度**
  的变化（只观察顶栏会漏掉，组的盒宽是 `flex-1` 定死的、也不会跟着动）。`onMounted` 里同步量一次
  （DOM 已落定、浏览器尚未绘制，写回的值与首帧渲染在同一批微任务里生效，首屏不闪错布局）；
  初值仍取 lg，非乐谱路由量不到 Tab 时**保留上一次判定**（否则切回乐谱页首帧会先按居中铺一帧再翻）；
- 未动的一面：两态的样式与高度（`h-7` / `h-8`、绝对铺满 / `basis-full`、顶部分割线）一律未动，
  只是「何时切」改由实测决定；`isNarrow` / `isActionFold` 两个判据未动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里只有
  `tests/ui/composables/useResponsive.test.ts` 在注释里提到 `TopHeader`，无测试影响面。类型检查无
  文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：1024~1100px（dev 构建尤其）Tab 是否不再
  压在图标上、窗口从宽拖到窄时是否只在真的装不下那一刻落行、来回拖是否稳定不跳。

### 优化 · 工作台面板卡片补底部内边距，列表容器的下内边距去掉（2026-09-28）

- 需求（用户提「工作台的四个卡片加底部 Padding，为了平衡视觉效果把整个容器的下内边距去掉」）；
- 改法：四张面板卡片各加 `pb-sm`（0.5rem ≈ 11.125px，在原有 `p-xs` 之外）；承载它们的面板列表容器
  `py-xl` → `pt-xl`，下内边距去掉；
- 为什么上边距留着：`pt-xl` 是「宿主盒向外扩 P 给卡片投影落地、内容再补等量 padding 拉回来」这套
  机制的下半（见 panelColumnInsetStyle），去掉它首卡顶边就不再与左侧指板卡顶边齐平；
- 代价（**当天即修掉**，见本片段末尾「末张面板卡片的底部投影被裁」一节）：末卡的**底部投影**在滚到底时
  被宿主盒的裁切线切掉 —— 宿主 `overflow` 裁在自己的盒边界上，而卡片自己的 `pb-sm` 是**内部**内边距，
  卡片的边框盒下缘仍与容器内容末端齐平，投影落在盒外、那 18.4px 用不上。修法是把这段底部留白从
  卡片内边距换成**卡片外边距**（末卡 `mb-lg`）：margin 落在滚动内容里，滚到底时与卡片一起进入可视区，
  投影正好落在上面，而容器的下内边距仍为 0 —— 「下边距由卡片提供」这个要求不变；
- 未动的一面：卡片 chrome（圆角 / 描边 / 底色 / `p-xs` / 投影）、卡间距 `gap-lg`、堆叠档（本容器本来
  就不给纵向留白）均未动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；`tests/` 里没有文件引用
  `WorkbenchView`，无测试影响面。类型检查无文件级形态、未验证；全量关卡按禁令未代跑 ——
  真机值得看：四张卡片的内容下缘是否不再贴着卡片下缘、并排档首卡顶边是否仍与指板卡齐平、
  滚到底时末卡底部投影是否被切得难看。

### 修复 · 顶栏 Tab 栏的「实测判据」从未生效，且「独占一行」档把两组压成 0 宽（2026-09-28）

- 症状（用户提「header 还是重叠并且按钮区不见了」）：968px 窗口下 Tab 栏与左组导航的字叠在一起
  （「乐谱」与「编辑歌词」字压字），而右侧那排动作按钮**整片消失**；
- 根因一（判据根本没生效）：`const isTabRowOwnLine = ref(breakpoints.smaller('lg'))` ——
  `breakpoints.smaller()` 返回的是**只读 `ComputedRef`**，而 `ref()` 收到一个 ref 时**原样返回它**
  （不另包装）。于是 `isTabRowOwnLine` 仍是那个只读 computed，`measureTabRow` 的赋值被 Vue 静默拒绝，
  控制台只留一条 `[Vue warn] Write operation failed: computed value is readonly`。判据永远停在 `lg`
  断点上 —— 上一轮那一整套实测代码（`groupContentEdge` / `measureTabRow` / `observeResizeTree`）
  等于一行没跑。改法：初值显式取 `.value`，并在注释里钉住这条坑（无类型错误、无运行时报错，只有一行 warning）；
- 根因二（「独占一行」档的布局本身是坏的）：该档下顶栏是 `flex-wrap`，Tab 栏 `order-last basis-full`
  （100%），而左右两组是 `flex-1`（flex-basis **0%**）。0% + 0% + 100% 正好等于容器宽 —— flex 的换行
  判定认为「装得下」，三者在同一行、两组各被压成 **0 宽**：右组 `justify-end` 把内容整片溢出到屏幕外
  （按钮区消失，实测 rect 的 x 为负、宽为 0），左组 `justify-start` 的内容向右溢出、正好被 Tab 栏压住
  （重叠）。改法：两组的宽档类由 `flex-1` 改为 `basis-1/2` —— 50% + 50% + 100% > 100%，Tab 栏这才真的
  落到第二行；而 50% + 50% = 100% 无剩余空间可分配，宽档下两组仍各占半幅，几何与 `flex-1` 逐像素相同；
- 修好后量出的真实阈值：宽档下左组内容右缘固定 395.9px、右组内容左缘 = W − 512.3，故「装得下」等价于
  W ≥ 1341px（两侧各留 `TAB_ROW_MIN_GAP = 16`）。即 dev 构建里 1024 至 1340px 这一段本来就该独占一行，
  旧断点（1024）正好把这一段全判错 —— 这正是「宽屏也重叠」的来源；
- 验证：Chrome（playwright，`.temp/` 探针，跑完即删）逐宽度实测顶栏几何 —— 320 / 480 / 768 / 900 / 968 /
  1000 / 1023 / 1024 / 1100 / 1200 / 1300 / 1330 为两行（Tab 栏独占一行、两组各半幅、末枚按钮右缘 ≤ 视口宽），
  1341 / 1345 / 1400 / 1600 / 1920 为单行（Tab 控件与两组内容的间距 16.3 / 18.3 / 45.8 / 145.8 / 305.8px，
  均 ≥ 16，无重叠）；968px 下截图确认第一行左组 + 右组按钮齐全、第二行 Tab 栏居中带顶部分割线。
  三个文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窗口从宽拖到窄时 Tab 栏是否只在 1341px 那一刻落行、来回拖是否稳定、
  窄档（< 768px）下第一行是否仍是「左组 + 右组」且不挤成三层。

### 修复 · 末张面板卡片的底部投影被裁：底部留白改由卡片自己的 `mb-lg` 出（2026-09-28）

- 症状（用户提「最后一个面板卡片阴影被截断了」）：滚到底时末卡下方的投影整条不见；
- 根因：上一轮把列表容器的下内边距去掉、改由**卡片自己的 `pb-sm`** 提供底部留白 —— 但那是卡片**内部**
  的内边距，卡片的边框盒下缘仍与容器内容末端齐平，投影落在盒外、被滚动宿主的 `overflow` 裁掉
  （宿主裁在自己的盒边界上，内容末端与裁切线齐平时盒外那 18.4px 用不上）；
- 改法：底部留白改由**末张卡片的 `mb-lg`** 提供（`:class="index === panels.length - 1 ? 'mb-lg' : ''"`）。
  margin 落在滚动内容里，滚到底时与卡片一起进入可视区，投影正好落在这段 margin 上；只给末卡 ——
  非末卡的下方已有 `gap-lg` 容得下投影。取 `lg`（22.25px）而不是更小的档：`--shadow-md` 的纵向下延展
  浅色约 16px（y4 + blur12）、深色 / 高对比约 18px，lg 是唯一够用的间距档。容器的下内边距仍为 0
  （「下边距由卡片提供」这个要求不变，只是承载它的从卡片内边距换成了卡片外边距）；
- 未动的一面：容器的 `pt-xl`（「把卡片拉回宿主盒外扩前的原位」那套机制的下半）、卡间距 `gap-lg`、
  卡片 chrome（`p-xs` / `pb-sm` / 圆角 / 描边 / 底色 / 投影）均未动；
- 验证：playwright 实测（1600px 并排档）—— 列表容器 padding-top 33.375px、padding-bottom 0、
  `row-gap` 22.25px、末卡 `margin-bottom` 22.25px；滚动宿主 scrollHeight 1318 > clientHeight 829（可滚），
  滚到底后截图确认末卡下缘与宿主下缘之间留有 22.25px、投影完整。`eslint --max-warnings 0` 0 问题、
  `prettier --check` 通过；`tests/` 里没有文件引用 `WorkbenchView`。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：滚到底时末卡投影是否完整、末尾与卡间两段留白是否看着同源。

### 优化 · 「编辑歌词」文本域的窄屏内边距改为四边等宽（2026-09-28）

- 需求（用户提「长文本输入框下内边距太多了, 改成四边等宽」）；
- 现状：窄屏覆盖写的是 `max-md:px-sm max-md:pt-sm` —— 左右与上收到 `sm`（0.5rem ≈ 11.1px），
  **下边距刻意留着 `p-xl`**（1.5rem ≈ 33.4px，为右下角字数统计让位）。于是下方那段空白是其余三边的
  三倍，文字块整体偏上；
- 改法：整档覆盖为 `max-md:p-sm`，四边同宽。代价（有意取舍）：字数统计（`bottom-2` + 约 22px 高）会与
  最后一行歌词的右下角重叠 —— 只在长文本滚到底时撞上，且它只有约 44px 宽；
- 宽档不需要覆盖：`p-xl` 本来就是四边等宽（`max-md:` 只在 < 768px 生效，见下）；
- 顺带纠正一条旧口径：`max-md:` 在本项目里是 **< 768px**（媒体查询的 rem 认浏览器初始字号 16px，
  与应用根字号 22.25px 无关），不是此前记的 1068px；实测与更正详见本片段「移动端：边缘滚动钮贴边、
  编辑歌词字号降一档」一节里的那段；
- 验证：浏览器实测 `matchMedia('(width < 48rem)')` 在 767px 为 true、768px 为 false，且生成的 CSS 里
  `@media (width < 48rem) { .max-md\:p-sm { padding: var(--spacing-sm) } }` 四边同值；
  `eslint --max-warnings 0` 0 问题、`prettier --check` 通过。类型检查无文件级形态、未验证；
  全量关卡按禁令未代跑 —— 真机值得看：窄屏下四边留白是否看着等宽、滚到底时字数是否压住歌词末行。

### 修复 · 工作台面板排序在触摸端「怎么拖都没反应」：把手按下即起拖 + 起拖震动（2026-09-28）

- 症状（用户报，两轮）：`拖拽排序触发时振动, 工作台的排序高概率无法拖动, wave走完就没了`；
  追问后确认为**手机/平板用手指拖**，现象是「就是没有反应，继续拖就滚动页面」；
- 复现（playwright，420×820 + `hasTouch`，CDP 派发真实 touch 序列）：
  - 按下折叠头后**立刻**上移 → `preview:0 / dragging:false / ph:0`，什么都不会发生（= 用户的现象）；
  - 按住 350ms **不动**再上移 → 正常起拖。即唯一的门槛是那 280ms 长按等待；
- 根因：`useSortableList` 对触摸端统一挂了 `delay: DRAG_LONG_PRESS_DELAY`（280ms）+
  `touchStartThreshold: DRAG_TOUCH_SLOP`（10px）。这套口径是为**整行/整卡即把手**的列表设的
  （那里「按住拖动」与「滑动滚动」是同一根手指的同一个手势，不设门槛列表就滚不动），
  而工作台面板列的把手是**专用元素**（折叠头）—— 列表并不靠它滚动，长按于是只剩下害处：
  手指一按就往目标方向挪（人不会在玻璃上静止 280ms 且漂移不超过 10px）→ 被 `touchStartThreshold`
  判成「想滚动」→ 放弃起拖 → 手势交回浏览器 → 页面滚动。波纹（`v-wave` 挂在折叠头上）照常播完，
  于是观感就是「wave 走完就没了」；
- 改法一（宿主侧）：`useSortableList` 新增 `touchDelay?: number`（默认仍是 280ms）。
  `WorkbenchView` 传 `touchDelay: 0` = 触摸端按下即起拖，与鼠标同档；
- 改法二（**必须成对**）：把手的 `touch-action` 同时关掉 —— 模板上给折叠头加 `touch-none`。
  只改 `touchDelay` 不够：浏览器仍会把这根手指判成滚动并抢走它（连带 `pointercancel` 打断影像层的
  指针流，卡片永远不会浮起）。`touch-action: none` 让浏览器从一开始就没有可仲裁的手势，
  `touchmove` 也不再被推迟派发（实测早前 4 次 `touchMove` 里 sortable 一个 `touchmove` 都没收到，
  起拖因此被拖后 100ms 以上）；
- 改法三（阈值分档）：新增 `dragThresholdFor(pointerType)` —— 触摸取 `DRAG_TOUCH_SLOP`（10px）、
  鼠标取 `DRAG_ACTIVATE_THRESHOLD`（5px），**影像浮现**与**落定后「真拖还是纯点击」**两处共用它。
  去掉长按后触摸端不再有「起拖前」那道闸，5px 的判定会把一次正常的点按（手指漂 5~10px）判成拖拽：
  卡片闪一下浮起再落回、同时把点击吞掉 —— 折叠头就是靠这个点击开合的；
- 代价（有意取舍）：**不能从折叠头起手滚动列表**（改从卡片内容区滚）。这是「专用把手」的应有语义，
  也是本轮修法的全部代价；侧栏那两处列表**不要跟着关**（整行/整卡即把手），故做成宿主可选参数而非改默认值；
- 顺带（用户同轮提的需求）：起拖加**触觉反馈**。新增 `platform/utils/haptics.ts` 的 `hapticTap()`，
  在 `activatePreview`（卡片浮起那一刻，也是唯一同时覆盖鼠标与触摸两档的起拖点）触发；
  `useLyricsDragDrop` 里原先内联的那段 `navigator.vibrate(20)` 一并改用同一函数，两处拖拽同源同时长。
  设备差异一律吞掉（`vibrate` 是 Android Chrome / Firefox 的 API，iOS Safari 没有；部分内核缺用户激活
  时抛 `NotAllowedError`）—— 反馈是锦上添花，不能因此打断手势；
- 排查中**排除**的几条（都不是成因，记下来免得重复走）：桌面鼠标拖（4 张面板逐张实测全部正常起拖、
  跟手、落定并落盘）；首访引导弹窗（`从线上拉取数据`）盖住整屏时确实什么都拖不动，但那是全新 profile
  的一次性状态；真实 `contextmenu` 落在拖拽中途会取消本轮排序（`onContextMenu` 的设计行为，已实测），
  但触摸端不产生该事件；面板列滚动条轨道 / 覆盖层没有盖住折叠头（横向 6 点采样全部命中折叠头内部）；
  `activatePreview` 没有抛错（4 张面板逐张拖拽，`pageerror` 与 console error 均为 0）；
- 验证（playwright，420×820 + `hasTouch`，坐标在滚动落定后重新量取并校验 `elementFromPoint` 命中折叠头）：
  - 按下后立刻上移 → `preview:1 / dragging:true`，松手后顺序真的换位（`指板设置` → `多指法` 之后）；
  - 纯点按 → `aria-expanded` true→false（切换照常）；带 7px 漂移的点按 → 照常切换（不被误判成拖拽）；
  - `navigator.vibrate` 打桩计数：起拖 1 次、点按 0 次；鼠标拖动路径与改前一致（顺序换位正常）；
- 改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；一次性探针（`.temp/`，跑完即删）。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：折叠头上不能起手滚动列表
  是否碍事（卡片内容区仍可滚）、起拖震动的手感、以及「波纹在卡片浮起那一刻被掐掉」是否刺眼
  （摘波纹是有意的，见 `activatePreview` 的说明）。

### 修复 · 顶栏在 768~1023px 两组内容正面重叠：收纳档从 `< md` 改到 `< lg`（2026-09-28）

- 症状（用户贴截图「这里按钮和分段控制重叠了」）：窄桌面窗 / 平板竖屏宽度下，左组的导航分段控件
  （带着「和弦」「乐谱」文字标签）与右组的动作按钮**叠在一起**，文字压图标；
- 量法（playwright + Chrome，逐宽度实测「左组内容右缘 − 右组内容左缘」，> 0 即重叠，`.temp/` 探针跑完即删）：
  score 路由 768px **+140.2**、800px +108.2、850px +58.2、880px +28.2、900px 仍 +8.2，≈910px 才归零；
  420 / 600 / 767 与 968px 以上均不重叠（前者已在紧凑档，后者半幅够用）。workbench 路由同段更轻
  （宽档右组少一枚按钮）：768px +89.6、850px +7.6，880px 以上不重叠；
- 根因：宽档下两组各占半幅（`basis-1/2`，上一轮为让 Tab 栏真的落到第二行而改，见上一条），
  而**半幅装不下右组的内容** —— 右组 8~9 枚 1.9rem 图标 + 2 条分隔线 + 9 个 `gap-xs`（16.4px）实测 **490px**，
  左组（侧栏开关 + 分隔线 + 品牌文字 + 带标签的导航）实测 **374px**；`justify-end` 的右组把内容整片向左
  溢出、`justify-start` 的左组向右溢出，两者各自越出半幅之后在半幅之外对撞。半幅 ≥ 490 要到 ≈1025px 才成立
  （1024px 时半幅 489.7px，其实还差 0.3px，靠左组那半幅的富余量兜住 —— 实测两组内容间距 115.8px）；
- 判据本身的错配：收纳档原先取 `useResponsive().isMobile`（< md，768px）—— 那是「是不是移动端」的语义
  断点，而装不装得下是**几何结果**。768 又正好是 `isMobile` 的翻转点：宽度一过 768，品牌文字、导航文字标签、
  两条分隔线**同时**出现，而半幅仍只有 (768 − 44.6) / 2 = 361.8px —— 需求跳到半幅之上、可用的半幅没变，
  于是 768~1023px 这一段全坏（用户的截图正落在其中）；
- 改法：`TopHeader` 的收纳档改为 `breakpoints.smaller('lg')`（1024px），模板与其它判据一行未动。
  取 lg 而不是算出来的 ≈910px，两个理由：一是**留余量**（910 附近两组内容间距只剩个位数像素，字体、
  路由、构建档任一变化都会吃掉它；1024px 有 115.8px）；二是 lg 与 `isDrawerMode` 同档 —— 这一段侧栏本
  就是浮层抽屉、整体已是移动式布局，导航转 icon-only 与之一致，不必再引第二个魔法数；
- 代价（有意）：768~1023px 看不到品牌文字与导航文字标签，同步 / 外观 / 仓库三个低频入口并入「更多」菜单
  （它们本就在无悬停设备上改点击触发）。换来的是功能一枚不丢 —— 右组按钮全在，不折叠；
- 附带变好的一处：紧凑档下 900px 以上 Tab 栏居中就装得下 → 顶栏回到**单行**（56.6px）；768~880px 与
  767px 完全同形（Tab 栏独占一行、整盒 95.6px），跨 768 那条边不再有任何跳变；
- 同步更新的注释：`TopHeader` 的 isNarrow 注释（记下逐宽度实测数字与取舍）、`useResponsive` 文件头第 ① 项、
  `useResponsive.test.ts` 文件头（收纳档改到 lg 后，1023/1024 那条边界断言同时钉住顶栏）；
- 验证：score / workbench 两条路由 × 768 / 850 / 900 / 1023 / 1024 / 1100 逐宽度实测「组间重叠」**全为负**
  （最紧的是 1024px 的 −115.8）、右组子元素越界数 0、右组按钮数在 1024px 处由 6 → 9（乐谱）/ 5 → 8（工作台，
  宽档多出常驻的三枚偏好入口）；截图确认 768（两行、无品牌文字）/ 900（单行、Tab 居中）/ 1024 与 1100
  （宽档，品牌文字与标签回来）均无重叠；跨档来回缩放（1100 → 420 → 1100，逐档停留）控制台除既有的
  Gitee 403 同步告警外无输出 —— 尤其没有 `computed value is readonly` 那条（`isNarrow` 现在是只读
  computed，全程只被读、没有被写）。三个改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：平板竖屏（768~1023）下只剩图标导航
  是否够用、1024px 那一跳（品牌文字与标签同时出现）是否突兀。

### 修复 · 工作台面板在触摸端又滚不动了：拖拽把手收进标题栏的抓手图标（2026-09-28）

- 症状（用户反馈「工作台现在不用长按直接拖拽了，都没办法滚动了」）：把触摸端改成「按下即拖」之后，
  手指落在面板区就再也滚不动画布；
- 根因：同一个元素不可能既「按下即拖」又「滑动滚动」——「按下即拖」要的那份 `touch-action: none`
  正是关掉滚动的那一份。上一轮把它加在**整条折叠头**上，而窄屏下四张卡几乎占满可视区
  （420×820 实测：首卡折叠头 559–604、内容区 604–997，其余三张的折叠头都在 1040 以下、已在折叠线外），
  于是面板区里没有一处可起手滚动；
- 改法（用户定调「移动端上改成仅拖拽图标可触发」）：把两个手势分到两个元素上 —— 滚动留给整条折叠头
  （去掉 `touch-none`，实测 `touch-action: auto`），拖拽收进标题栏里那枚抓手图标（`data-panel-grip`
  加 `touch-none`，再用 `-my-2` + `self-stretch` + `px-2` 把命中面从 16px 的图标撑到 **36 × 44.5**）。
  鼠标端仍是「整条折叠头即把手」，一行未动；
- 平台侧新增 `UseSortableListOptions.touchHandle`：触摸端只认它、鼠标端仍认 `handle`。
  `handle` 是 Sortable 的静态选项，但它在**每次起手时**才被读一次（`_onTapStart` 里
  `closest(target, options.handle)`），故在 document 捕获层的 pointerdown 里按 `pointerType`
  现切 `option('handle', …)` —— 那一刻早于 Sortable 挂在容器上的起手判定（它在冒泡阶段），切换必定先生效。
  切「无把手」档用空串而不是 `undefined`：`option(name, undefined)` 是**取值**语义，写不进去；
- 抓手在**有粗指针的设备上常驻**（`any-pointer-coarse:opacity-100`）：它不只是可发现性线索，
  而是触摸端唯一的拖拽入口，看不见就等于没有入口；
- 顺带（用户同轮要求）：四条面板小标题**统一成五个字** —— `候选把位`(4) → `候选把位图`、
  `候选名与音级`(6) → `名称与音级`（另两条 `品数与调音` / `图片与背景` 本就是 5 字）。四条并排出现在
  同一条标题行上，字数不齐时行尾参差；顺手改掉注释里那句「五张同构卡片」（实际四张）；
- 验证（playwright + CDP 真实触摸序列，`.temp/` 探针跑完即删）：
  - 420×820（hasTouch）：拖折叠头 → 画布 scrollTop 0 → 135 且 `preview` 0（滚了、没起拖）；
    拖抓手 → `preview` 1（起拖）；点折叠头 → `aria-expanded` true → false；四条小标题实测各 5 字、
    无截断；抓手实测 36 × 44.5、`opacity` 1、`touch-action: none`，折叠头 `touch-action: auto`；
  - 420×1400（hasTouch）：从抓手拖 520px → 顺序真的换位（`指板设置` ↔ `多指法`）；
  - 1400×1000（鼠标）：从折叠头标题文字处拖 620px → 顺序照旧换位（桌面端未受影响）；
  - 侧栏那两处列表未传 `touchHandle`，`syncHandleForPointer` 直接早退，`handle` 不被触碰，
    长按起拖的口径一行未改；
  - 改动文件 `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；类型检查无文件级形态、未验证；
    全量关卡按禁令未代跑 —— 真机值得看：抓手 36px 宽够不够按、常驻抓手在四张卡头上是否碍眼。

### 修复 · 触屏上气泡换态后箭头底色停在旧色（2026-09-28）

- 现象（用户提「移动端上气泡箭头的底色没有和本体一致」）：指板横按气泡在触屏上换态（标记 ↔ 取消标记）
  之后，箭头的填充仍是换态前那一档，与本体不同色；桌面上看不到；
- 根因：剪影的 `fill` / `stroke` 是从宿主 computed style **复刻来的快照**，而换色刚开始那一刻读到的是
  过渡起点（旧色）。`targetValueOf` 只保证「能取到终值时取终值」，取不到时快照就是旧色 —— 所以关键在
  **之后还有没有一次重绘**：桌面上鼠标随后移开就是一次 `pointerleave`，快照被顺手纠正；而触屏上
  `pointerup` 之后浏览器**不会再补 `pointerleave`**（同 `useBarreBubble` 里那条同源记录），
  读错的那一次就永久成了终态。此前触屏看不到气泡（没有悬停），本轮「无悬停设备上气泡常驻」之后
  才暴露出来；
- 改法：`observeRepaintTriggers` 补第 4 类触发源 —— 宿主**自己的换色过渡结束**（`transitionend` +
  `transitioncancel`），这是唯一能保证「读到的就是落定值」的时机。只认宿主自己（`event.target === host`）
  且只认换色属性（`background-color` / `border-*` / `box-shadow`）：`transitionend` 会冒泡，
  水波元素的 `opacity` 过渡也会打到宿主的监听上，白跑重绘；
- 该时机与既有触发源不重叠：类名变化由 MutationObserver 补、悬停由指针事件补、尺寸由观察者补，
  唯独「过渡结束」此前没有任何人管；
- 新增 3 例（`tests/platform/arrowPanel.test.ts` 的 `syncArrowPanel`）：宿主换色过渡结束要补一次重绘、
  尺寸类过渡与子元素的过渡都不算、`destroy` 之后不再重绘 —— 这段接线断掉不会有任何报错，
  正是要靠用例钉住的那类；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；相关用例 6 个文件 58 例
  （`arrowPanel` / `arrowPanelPath` / `scrollbarOverlayParent` / `vTooltip` ×4）全绿。
  类型检查无文件级形态、未验证；全量关卡按禁令未代跑 —— 真机值得看：手机上把某条横按标记 /
  取消标记，箭头底色是否与本体同步落定。

### 修复 · 工作台面板「拖出去又拖回原位」会顺手把面板点开/收起（2026-09-28）

- 现象（用户提「工作台的四个面板拖拽排序时，拖拽结束但是没有换位，也就是拖动后拖回原位，
  会切换面板开启状态」）：拖着面板标题行移出去、再拖回原位松手，展开态被翻了一次；
- 根因：松手时「算拖拽还是算点击」量的是**按下点 ↔ 松手点的直线距离**，而拖回原位时两端几乎重合
  —— 一次真拖被判成纯点击，于是走了「补偿补派一次 click」那条路，而合成 click 的落点正是松手的
  那个把手（`originalEvent.target`），把手又同时是 `BaseCollapse` 的折叠头（`@click="expanded = !expanded"`），
  于是「拖完顺手点开了自己」。位移判据与影像浮现的判据（`preview.handlePointerMove` 里逐帧比
  按下点）看着同源，实则一个「逐帧锁存」、一个「松手时量一次」，缝就在这里；
- 改法：判据换成**影像是否已浮现**（新增 `PreviewController.isActive()`，越阈值即锁存到 `clear` 为止），
  松手时不再自己量一遍位移 —— 阈值只剩 `preview.handlePointerMove` 一处，两端不可能再分叉。
  随之清掉三处随之变成死代码的东西：`dragStartPoint`（起拖点快照及其写入/复位）、
  `readEventPointerType`、`index.ts` 里对 `dragThresholdFor` 的引用（该函数现在只有 preview 在用）；
- 新增 2 例（`tests/ui/composables/useSortableListClickSuppression.test.ts`）：拖出去再拖回原位时
  补派的 click 被吞、把手不被点开；没动过的纯点击仍收到一次 click（补偿补派那条路没被误伤）。
  用例用 sortablejs 桩替身驱动 `onStart` / `onEnd`，只断言「把手上的点击处理器收到几次」这个
  用户可感知的结果 —— 把判据临时改回旧的位移式，第一例立刻变红（收到两次 click，正是线上表现）；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；相关用例 9 例
  （`useSortableListClickSuppression` 2 + `useSortableListScrollOffsets` 7）全绿。
  类型检查无文件级形态，改用受限工程的 `vue-tsc -p .temp/tsconfig.vuecheck.json`
  （只收该模块与该用例、沿用全严格开关）0 错误，跑完即删；全量关卡按禁令未代跑 ——
  真机值得看：拖出去再拖回原位松手，面板展开态是否纹丝不动；纯点击折叠头仍能开合。

### 修复 · 「新建和弦」抽屉里的指板在手机上巨大、横向要拖才看得全（2026-09-28）

- 现象（用户提「新建和弦抽屉在移动端非常巨大」）：390px 视口下抽屉只有 359px 宽，
  指板却按自然宽渲染（6 弦 3 品 533px），整块内容横向溢出两倍多，右侧被面板裁掉；
  桌面同样中招 —— 640px 抽屉里指板 533px，比卡片的可用宽度还宽 88px；
- 根因：指板的贴合缩小由 `useFretboardLayout` 的 `fitScale` 负责，而 `fitScale` 要宿主**量好可用宽度
  下发**（`Fretboard` 的 `maxWidth`）。工作台一直在下发（`WorkbenchView` 的 `boardAreaWidth`），
  本抽屉没下发 —— `maxWidth` 缺省即「不缩」，`fitScale` 恒为 1，指板一律按自然宽铺开；
- 改法：卡片兼作量取点（`ref="boardCardRef"`，量内容盒即「指板能用多宽」），
  经 `observeResize` 观测后下发 `:max-width="boardAreaWidth"`。三处必须一起改，少一处都不成立：
  1. 观测必须绑在 **ref 上**（`watch(boardCardRef, …, { flush: 'post' })`）而不是 `onMounted`：
     卡片在 `BaseDrawer` 面板的 `v-if` 之后，抽屉关着时 `boardCardRef` 就是 `null`，
     挂载那一刻绑观察者等于一次都不绑 —— 第一版就是这么写的，量到 0、白改；
  2. 卡片与外壳两层必须**定宽**（`w-fit` → `w-full`）：卡片若按内容收缩，
     「量到的宽度 → 指板缩小 → 卡片变窄 → 再量到更窄」会自己咬自己，一路缩到底；
  3. 去掉外壳那层横向内边距（原本 `px-xl`）：卡片既然铺满，这层内边距就是从指板可用宽度里直接扣，
     而滚动容器自己已有 `px-xl`。去掉后卡片外沿与 header/footer 的 `px-xl` 对齐，
     指板拿回约 67px。卡片自身横向内边距窄屏收一档（2rem → 0.75rem），≥768px 一行未动；
- 实测（真机浏览器量，改动前后）：手机 390 指板 533 → 256px、横向溢出 0；
  桌面 1440 指板 533（裁切）→ 481px、溢出 0；窄机 320 亦无横向溢出；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；类型检查无文件级形态，
  改用受限工程的 `vue-tsc -p .temp/tsconfig.vuecheck.json`（只收该组件、沿用全严格开关）0 错误，
  跑完即删；全量关卡按禁令未代跑 —— 真机值得看：手机上打开「新建和弦」，
  指板是否整块落在卡片内、无需左右拖；桌面指板是否不再被面板右沿裁掉。

### 修复 · 「排列和弦」里清除和弦是静默的，既无提示也无撤销入口（2026-09-28）

- 现象（用户提「排列和弦里删除和弦没有toast」）：槽位上那颗悬停删除钮点下去、或选中槽位按 Delete，
  和弦凭空消失，没有任何反馈，也没有撤销入口 —— 撤销只能靠用户自己想起来去点工具栏那颗按钮；
- 根因：清除槽位和弦有两条入口（`ChordSlot` 的悬停删除钮 emit `remove`、行列表容器委托的
  Delete / Backspace），两条都直连 store 的 `removeSlotChord`，而该 store 不引 `uiStore`（UI 无关），
  整条链路上没有任何一处负责回报；
- 改法：组件里收口成 `handleRemoveSlotChord`，两条入口都改走它，由它调 store 并派发通知。
  通知走 `notice.info` + 「撤销」按钮（与删行 / 删指法 / 删分组 / 删乐谱四处同款：撤销入口随 toast
  飘走就没了，必须能回看并补做），撤销动作即 `scoreEditor.undo()`（`removeSlotChord` 前后各记一次
  历史，单次撤销正好回到清除前）。三处细节：
  1. 和弦名必须在清除**之前**取 —— store 一落库，`slotChordOf` 就查不到了；
  2. 槽位本就没有绑定（重复按 Delete）时早退：既不空推一次撤销栈，也不弹「已清除」的假提示；
  3. 撤销的回报文案（`已恢复数据` / `没有可撤销的操作`）与删行那处原本各写一份，现抽成
     `undoWithFeedback` 一处 —— 同一颗撤销按钮不该按发起处给出两种说法；
- 实测（真机浏览器，改动前后）：清除前反馈区为空；点删除钮后通知「已清除和弦「D#madd9」」带撤销钮，
  槽位绑定变 null；点撤销后绑定回填 `c_99919ba5-80f`、提示「已恢复数据」；Delete 键同款；
  空槽位再按一次 Delete 不重复弹提示；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；类型检查无文件级形态，
  改用受限工程的 `vue-tsc -p .temp/tsconfig.vuecheck.json`（只收该组件、沿用全严格开关）0 错误，
  跑完即删；全量关卡按禁令未代跑。

### 修复 · 启动期云端比对「每次都发请求」，两道短路闸其实都没生效（2026-09-28）

- 现象（用户提「启动时还是无条件对云端数据，改成无论成功失败仅对比一次」）：每次冷启动都会向
  同步目标发一条 `fetchMeta` 请求。真机实测（拦掉请求模拟断网）：连续三次启动 = 1 / 1 / 1 条；
- 根因是**两条独立的**，缺一不可：
  1. **基准根本没落盘**（主因）：`compareBaseline` 是个对象，而它的 `useStorage` 调用把 initial
     写成 `null` —— @vueuse 按 initial 的类型猜序列化器，`null` 猜出来是 `any`，其 write 是
     `String(v)`：整个对象被写成字面量 `"[object Object]"`，读回来是个字符串。于是
     `baseline.target` 恒为 undefined、闸门永不成立。实测 localStorage 里就是这个值，
     说明「本地未变即短路」「间隔闸」两道闸从上线起就没生效过；
  2. **探测失败不写基准**：`armCompareBaseline` 原本只写在「取到 meta」与「云端无数据」两条出口，
     探测抛错（断网 / 401 / CORS / 代理没开）那条路径直接 `logger.warn` 后 return —— 而目标侧长期
     不可达恰恰是最常见的形态，于是每次都重新探测；
- 改法：
  - 显式给 `compareBaseline` 一份 JSON 序列化器（read 兜一层：解析不出对象的值一律当「没有基准」，
    历史落盘的 `"[object Object]"` 因此被自然清掉），并在接口注释里写明「这条曾静默失效过很久，
    别把序列化器当可选项删掉」；
  - 基准的写入收口到 `finally` 里唯一一处，用 `probed` 标志只覆盖「真发过探测」的情形
    （在 `await fetchMeta()` **之前**置位，抛错也算）。两条「跳过」出口不写：它们根本没发请求，
    写了会把 `checkedAt` 一路推到当下，间隔闸永远等不到期 —— 实测第三次启动后 `checkedAt` 与第一次
    逐字相同，正是这条守住了；
- 实测（真机浏览器，拦请求 / 伪造 meta 两条路径各跑三次启动）：失败路径 1 / 0 / 0；
  成功路径 1 / 0 / 0（首次仍照常报「云端数据较新」并给一键拉取）；基准落盘形态由
  `"[object Object]"` 变为 `{"target":"gitee","localMd5":"…","checkedAt":…}`；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；类型检查无文件级形态，
  改用受限工程的 `vue-tsc -p .temp/tsconfig.vuecheck.json` 0 错误，跑完即删；全量关卡按禁令未代跑。
  代价如实说：探测失败后要等本地产生改动、且距上次探测过一个间隔才会再试 —— 与既有取舍同源。

### 修复 · 「排列和弦」删掉和弦时行高硬跳，没有过渡（2026-09-28）

- 现象（用户提「排列和弦删除和弦行高变化没有过渡」）：清掉某行最后一个和弦时，该行从「指板图卡
  高度」直接塌到「只剩字符行」，整行连同下面所有行瞬间跳上去；
- 根因：行高是内容撑出来的（行内最高的那个槽决定），而 CSS 无法对 `auto ↔ auto` 插值，
  也没有哪个属性承载得住「旧高」这个起点 —— 纯 CSS 无解；
- 改法：在「删掉 / 撤销一个和弦」这条路径上手动补一次过渡（`animateLineRowHeight`）：
  量旧高 → 钉旧高（`transition: none`）→ 读一次布局落实这一帧 → 换成 height 过渡并改钉新高 →
  结束（`transitionend` / `transitioncancel`）把高度交回 `auto`。五处细节：
  1. **旧高必须在改数据之前量**：`removeSlotChord` 一落库，量到的已经是新高；
  2. 落点是 `.line-row` 而不是 `[data-line-index]` 那个歌词行：行号与两侧槽位都靠
     `items-stretch` 撑高，钉住行的高度才会整行一起收，钉歌词行则只有内容区在动；
  3. 同一行上重复触发（删完立刻撤销、连删两个和弦）时先把上一条结清
     （`pendingRowHeightReleases`）：否则新过渡会以上一次钉住的中间值为起点、量到的新高也正是
     那个中间值，动画静默失效、行高卡在半途；
  4. `measureLineRowHeights` 跳过内联钉着高度的行：过渡中的行量到的是插值中间值，而它的
     `is-chord-row` 早已翻转 —— 会把「有卡行的高度」记进「无卡行」那一档，把离屏占位撑大；
  5. **「摘掉钉住」与「调用已登记的回调」必须是两个函数**：第一版把前者写成「取出回调并调用」
     的复用，而登记的回调自己又要回头调它 —— 一次无限递归（`RangeError: Maximum call stack
size exceeded`），且内联高度永远摘不掉、整行此后钉死。现拆成 `clearRowHeightPin`（只摘样式
     与注销，绝不再调 `releaseRowHeight`）与 `releaseRowHeight`（只负责取出并调用回调）；
- 为什么不用现成的 `v-auto-height`：那要逐行常驻一份观察者（宿主 + 逐子元素 + 子树
  MutationObserver），而谱面行数可达数百、绝大多数行一辈子不会变高变矮。本过渡只在一条路径上发生，
  一次性钉高度就够，常态零成本。减弱动效偏好下直接跳过（不插值、停在终态）；
- **撤销侧的时序**（用户提「排列和弦撤回有时序问题」）：`undo()` 内部要让出一个宏任务结算响应式
  传播，而复原那一帧会先按自然高排出来并画上去 —— 若等它回来才量旧高、才钉，用户看到的就是
  「先弹回满高、再缩回去重放一遍动画」（实测改前逐帧采样里确有一帧 177.8 + `auto`）。
  故改成**在 `undo()` 之前就钉住旧高**（`pinRowHeight`），整个等待期行高都停在旧值上，
  一帧都不露；`undo()` 结算完再交回 auto、量新高、重新钉住并过渡 —— 这三步同步连做、
  中间不落绘制。相应地 `animateLineRowHeight` 改为**同步**（量的是此刻已排好版的高度），
  删除侧因此改成 `await nextTick()` 之后再调（回调仍在微任务里、绘制之前跑完）；
  复原抛错或「没有可撤销的操作」时显式交回 auto，不留钉住状态；
- 实测（真机浏览器，rAF 逐帧采样）：删除 177.8 → 69.9px，中间帧 176.5 / 174.7 / 132.5 / 127.4 /
  122.2 / 117.5 / 113.1 / 105.1 / 85.8 / 74.5 / 71.6 …，结束后内联高度交回 `auto`；
  撤销 69.9 → 177.8px：先钉在 69.8594px（**不再出现满高那一帧**）→ 中间帧 78.9 / 82.8 / 87.5 /
  92.6 / 134.7 / 161.9 / 174.1 … → 落定 177.8 且交回 `auto`；
  「删除过渡中途（70ms）就点撤销」的相撞路径：105.1 → 152.8 → 落定 177.8 + `auto`，
  绑定复原、页面零报错，随后再删一次仍能正常落到 69.9 + `auto`（无残留钉住）；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；受限工程的
  `vue-tsc -p .temp/tsconfig.vuecheck.json` 0 错误，跑完即删；全量关卡按禁令未代跑。

### 新增 · v-scrollbar 分段吸附 / v-wheel-scroll 固定步长：滚动条与滚轮按「一屏一段」控制（2026-09-28）

- 需求（用户提「滚动条加能力允许分段控制」）：宿主按「一屏一段」排内容时（分页预览、整屏轮播），
  滚动位置本就只有那几个合法值，而滚动条与滚轮都是按像素连续映射的；
- 新增 `v-scrollbar` 的 `snap: { count, axis? }`（见 `ScrollbarSnapOptions`）：把该轴的可滚动区间
  均分为 count 个停靠点（首末两点即滚动的两端），**滚动条自己发起**的位移全部量化到最近停靠点 ——
  拖拽拇指逐段吸附、轨道点击翻一段（原先是 0.8 屏的连续翻页）、轨道跳转落最近一段。
  停靠点与「一屏一段」的页边界逐点重合：count 段内容 ⇒ 最大可滚动量 = (count-1) × 单段步长，
  故 `i × maxScroll / (count - 1)` 正好是第 i 段内容的落点；
- 量化与步进是两条纯几何函数（`snapScrollPos` / `stepScrollPos`，落在 `scrollbarGeometry`）：
  拖拽、轨道跳转、轨道翻页三处共用同一份换算，落点算法不会各写一遍而互相错位；
  段数只经 `snapCountOf(state, axis)` 取，轴比对收在一处（吸附轴不是本轴就是 0，不吸附）；
- `snap` 进 `structuralFingerprintOf`：它是挂载期定型的运行态选项（拖拽 / 轨道读 `state.options.snap`），
  不进指纹就会「绑了新值被静默冻结在旧值」；
- 新增 `v-wheel-scroll` 的 `step`（固定步长，px）：开启后位移不按滚轮幅度映射，而是**一次手势走一步**
  —— 位移量恒为该值、方向取本事件在主轴上的真实方向，同一轮手势内的后续事件只拦截不再位移
  （手势窗口复用既有的 `edgeLock`）。缺了它，「一屏一段」的宿主里滚轮必然是坏的：一次滚轮幅度
  （约 100px）远小于一屏，位移会被宿主吸附抹平（滚轮像是坏了），而触控板一次横扫的几十条事件
  又会连翻十几屏。该档只认 `reverse`，不吃 `speed / double / triple`（固定步长谈不上倍率）；
- **一处必须记住的交互：强制吸附的宿主上不能用逐帧缓动**。宿主的 `scroll-snap-type: x mandatory`
  会把**每一次**写入都吸回原停靠点，于是「写绝对位置的 rAF 渐近」差值恒为一整段、收敛判据永不成立
  —— 两处各改一处：`v-wheel-scroll` 的 step 档走**浏览器原生** smooth（它本身吸附感知），
  `scrollbarWheel.wheelScroll` 的 overlay 兜底在吸附轴上直接写到位、不再渐近。两处都是
  「按幅度映射 + 逐帧渐近」这条老路与吸附不兼容，而不是新写的分支有 bug；
- 吸附只作用于滚动条发起的位移：宿主自己的触摸滑动、键盘、CSS 吸附都不经过它 ——
  「内容能停在哪」的最终裁决仍在宿主，本选项是让滚动条与宿主对齐，不是替代；
- 单测：`tests/platform/scrollbarSnap.test.ts`（停靠点与页边界重合、半步为界、两端不越界、
  段数不足不吸附、步进不跨段、吸附轴默认取 x 只有纵向滚动条时回落 y）；
- 验证命令：`vitest run tests/platform/scrollbarSnap.test.ts` 6 通过、`eslint --max-warnings 0` 0 问题、
  `prettier` 已跑；受限工程的 `vue-tsc -p .temp/tsconfig.vuecheck.json` 0 错误，跑完即删；
  全量关卡按禁令未代跑。

### 优化 · 窄屏乐谱预览改为单页：贴合屏宽、水平垂直居中、一页一页滑（2026-09-28）

- 需求（用户提「窄屏预览乐谱改成单页水平垂直居中，滑动钳制在一页一页滑」）：窄屏下横向排开的
  页流要求左右拖动才看得全一页，而每页宽度都超出屏幕 —— 一屏里既看不全一页、也不知道自己在第几页；
- 改法一（单页贴合）：窄屏（`isMobile`，< md）把贴合基准从**高度**换成**宽度** ——
  页宽 = 容器内容宽，页高由纸型比反推。窄屏下高度通常还有富余，按高度贴合只会得到一个比屏幕
  还宽的页；页宽一旦超过一屏，横向就退化成「页内平移」，而本档横向是按页吸附的，页内平移无从进行。
  页宽与页高在单页档都由「页宽」这一条链算出来（不再由页高反推宽度），避免 1px 级的横向溢出
  破坏「一屏一页」与吸附的逐像素对齐；
- 改法二（每页一层「一屏宽」的幻灯片盒）：页流步长必须**正好是一屏宽**，吸附点才会逐页落在
  「第 n 页居中」上（间距一旦参与，步长变成「一屏 + 间距」，每页都会越偏越多）。故给每页套一层
  `flex-none` 盒：单页档宽 = 容器内容宽、`snap-center`（对齐的是盒中心，容器内边距左右对称，
  故吸附落点恰为 `k × 一屏`）、`snap-always`（一次甩动只走一格）；页比盒窄的那一段即**页间距**，
  由居中平分为页两侧的留白（见改法六）；宽屏档这层只是空壳，布局与加它之前逐像素相同；
- 改法三（容器吸附）：单页档给滚动容器挂 `snap-x snap-mandatory`，页间距**不走 `gap`**（gap-0）——
  「滑动钳制在一页一页滑」由 CSS 吸附直接承担（触摸甩动、触控板、程序化写入都归它管），
  而不是在 JS 里监听 scrollend 再回吸；间距若由 `gap` 出，步长就不再是一屏，吸附点会逐页累积偏移；
- 改法四（滚动条与滚轮接上）：滚动条按页数声明 `snap`（见上一条），滚轮在单页档传 `step` = 一屏宽
  —— 三者落点完全一致：拖拇指 / 点轨道 / 滚轮 / 触摸滑动都只会停在第 n 页；
- 改法五（缩放上限跟着收）：单页档的缩放上限是「贴合一屏宽」而不是全局 200% ——
  页宽不得超过一屏（否则同上，页内平移无从进行）。收口在 `activePercent` 的 setter（捏合与
  Ctrl+滚轮同一条出口），滑杆的 `max` 与读数也取同一口径；「适应」开关的文案跟着判据走
  （单页档是「自适应窗口」——宽高都要装得下，其余仍是「自适应窗口高度」）；
- 改法六（页间距由页宽让出）：页间距取与宽屏档 `gap-lg` 同值的一档（1rem，经平台的
  `remToPx` 运行时换算 —— 模板间距类是 rem，而应用根字号是流式的、不恒为 16px，与和弦选择面板
  的网格间距同款），落法是**页宽上限 = 一屏宽 − 页间距**（`singlePageWidthLimitPx`），
  让出的部分由幻灯片盒的居中平分为页两侧的留白。只扣页宽、不动步长：吸附点、滚动条分段与
  滚轮步进仍落在 `k × 一屏` 上。上限设在「页宽上限」这一道闸而不是「页宽再减一次」——
  自适应与自定义百分比两态共用它，漏掉它自定义态放大到贴边时两页又会紧贴；
- 宽度记忆（`rememberedContainerWidth`）与高度记忆同款：页流步长是一个真实 px 值，
  v-if 重挂载的首帧拿不到测量值，没有兜底会先按桌面口径渲染一帧「比屏幕还宽」的页再缩回来；
- 实测（真机浏览器复验，3 页谱）：窄屏 390×844 —— 容器 390×748.44、内容宽 367.75（= 步长），
  页盒 345.5×488、页间距 22.25、页两侧留白各 11.13；加上容器自身的 `p-sm` 11.125，
  「页与页之间」与「页与屏边之间」同为 22.25（**四周留白同一个值**）；
  页流最大可滚动量 736 = 2 × 367.75，程序化落点逐点落在 0 / 368 / 736；
  滚轮一次手势 0 → 368，隔 700ms 再一发 → 736（一次手势一步）；轨道点中段 736 → 368（回退一段）；
  375×667 同构（步长 352.75、页盒 330.5×467、页间距 22.25）；
  Ctrl+滚轮差分：先缩小到页宽 238.19（页间距随之涨到 129.56）再一路放大，页宽停在 345.5 不再涨
  —— 自定义态同样吃「一屏宽 − 页间距」这道上限，两页不会贴到一起；
  页高于视口的横屏档（700×400）：页宽 199（由高度定，未触上限）、页盒 199×281、纵向溢出 0；
  宽屏档（1440×900）：页间距仍是 `gap-lg` 22.25px、页盒 564×798，与加单页档之前逐像素相同；
  纵向溢出恒为 0、竖向滚动条 `--off`；滚动条上滚不再有失控的 rAF（400ms 内 1 帧、其后 500ms 内 0 帧）；
  实时改宽 700 → 375 → 390 与干净加载三档一致；全程零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑。类型检查**本轮未复跑**：
  上一轮的受限工程（`vue-tsc -p .temp/tsconfig.vuecheck.json`）形态未能复现 —— 两次尝试报出的
  错误全在 ambient 类型（`ImportMeta.env` / 资源模块声明）与 `StoreName` 这类无关模块上，
  改动文件本身两次均为 0 错误，故按「没有文件级形态就跳过该项」处理；全量关卡按禁令未代跑。

### 修复 · 自适应档在矮视口下仍多出一条竖向滚动条（2026-09-28）

- 需求（用户提「自适应应该不出现竖向滚动条」）：自适应的语义是「整页装进视口」，
  而实测矮视口下自适应档反而多出一条竖向滚动条 —— 开关与它自己的定义相矛盾；
- 根因是页高的**最小缩放下限**：`fitPageHeight` 原先写作
  `max(页高按 MIN 百分比换算值, 容器内容盒高)`，理由（旧注释）是「视口极矮时不把页面压成一条线、
  交由超高判定转纵向浏览」。但下限一旦生效，页高就超过容器（844×390 横屏手机下 673px vs 294px），
  `isTallerThanViewport` 为真 → 切顶部对齐、纵向可滚、竖向滚动条随之出现
  （实测该档纵向溢出 88px、底部缺口 -65px）。**下限与「自适应」是同一条判据上的两种答案**，
  不能并存：自适应档保留下限，等于把「装进视口」让位给「别压得太小」；
- 改法一（自适应态页高恒 = 容器内容盒高）：删掉下限，容器尚未测量（0）时回退整页高
  —— 首帧按真实尺寸渲染一帧，也好过被压成 0 高。矮视口下页面就是变小（390px 高时约 26%），
  要放大请退出自适应：自定义态不受影响，超高即照旧转纵向浏览；
- 改法二（单页档改宽高**双向** contain）：原实现只按宽贴合（页宽 = 容器内容宽），
  矮视口下页高必然超出容器（700×400 横屏页盒 678×959 vs 容器 304）。新增
  `singlePageFitWidthPx` = `min(容器内容宽, floor(容器高 × 纸型比))`，页宽先由宽高两向定出，
  页高再按纸型比反推 —— 页宽与页高仍出自同一条链，横向不会多出 1px 级溢出；
- 改法三（反推页高改向下取整）：`Math.round` 向上取整的零点几像素就足以被判「超高」，
  从而切顶部对齐并多出一条竖向滚动条。取整方向与 `availableHeight` 同源，一律 `Math.floor`；
- 缩放上限跟着走同一口径：`maxZoomPercent` 取 `singlePageFitWidthPx` 的换算值（而非容器宽），
  否则滑杆会给出「拖到上限反而溢出屏幕」的档位；「适应」开关文案相应改为「自适应窗口」
  （单页档宽高都要装得下），非单页档仍是「自适应窗口高度」；
- 实测（真机浏览器，干净单档加载）：375×667 / 390×844 / 700×400 三档纵向溢出均为 0、
  竖向滚动条 `--off` 且不透明度 0（页盒 330.5×467 / 345.5×488 / 199×281，容器 375×571 / 390×748 / 700×304）；
  矮窗口 1200×300 也 0 溢出；非单页档的 844×390（自适应）由 88px 溢出降为 0（页盒 238 → 176）；
  横屏翻页能力保留（滚轮 0 → 678、轨道点击 → 1356）；全程零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；受限工程的
  `vue-tsc -p .temp/tsconfig.vuecheck.json` 0 错误，跑完即删；全量关卡按禁令未代跑。

### 修复 · 点指板会把外层容器的滚动位置拉过去（2026-09-28）

- 需求（用户提「点指板滚动距离会被拉过去」）：窄屏上点一下指板，工作台画布 / 乐谱编辑区的滚动
  位置自己就跳了 —— 实测指板 417px 高、上缘已滚出视口 166px 时点它，容器从 240 跳到 18（−222px）；
- 根因是四处**裸 `focus()`**（左键按下、右键设主音、点空弦标记、点升降号标记）：
  `focus()` 默认带「把目标滚进视口」的语义，而指板在窄屏是一整幅高卡片，一被聚焦就要求整块可见，
  于是外层容器被拽着走。焦点本身是**刻意给的**（方向键编辑与焦点环都依赖它），多出来的只是那次滚动；
- 改法：收成一个 `focusBoard()`（`focus({ preventScroll: true })`）四处共用 —— 焦点照给、滚动不动。
  四处同一意图的重复调用一并收口，改动后「点指板会带滚动」这件事不会在某一处被漏掉或再写回来；
- 实测（真机浏览器 390×844，工作台）：修前点指板板身 → 容器 240 → 18（−222px）；修后同一点击 →
  位移 0，且 `focusin` 仍落在指板根节点（键盘焦点与焦点环照旧）；点和弦名区同样位移 0；零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑。

### 优化 · 手机上工作台保存操作栏收一档（2026-09-28）

- 需求（用户提「手机上的工作台浮动胶囊太大了」）：手机上工作台的保存操作栏（浮动胶囊）明显偏大；
- 成因是**窄屏的流式根字号**：390px 宽时根字号 22.25px（不恒为 16px），而胶囊与钮的尺寸档都是 rem
  —— `md` 的 1.9rem 随之涨到 42.3px 高的钮、胶囊连内边距一起 66.5px 高，一个操作栏吃掉屏高的 8%，
  文字按钮的左右内边距也涨到 22.25px；
- 改法：手机（< md）上胶囊 `md → sm`、钮 `md → sm` 一并降一档，桌面档不变。尺寸档只能经 prop 下发、
  没有等价的媒体查询写法（标尺字典在 `platform/ui/controlSizes`，硬写 `max-md:h-[1.6rem]`
  等于把它抄第二份），与谱面编辑区行内三枚按钮同一条判据、同一种做法；胶囊与钮**必须同档**：
  只降其一，矮一档的钮落在宽内边距的胶囊里会显得更小，反而不像一次收紧；
- 实测（真机浏览器，工作台、草稿改脏后浮现）：390×844 胶囊 286.9×66.5 → **242.4×54.3**、
  钮 113.2×42.3 → 102.1×35.6、内边距 11.125/16.69 → 8.34/8.34（字号仍 16.69px：`sm` 与 `md`
  同取 text-xs，收的是高度与内边距）；360×640 同值；胶囊不横向溢出；贴底位置（按品数档位算出）未变；
  零页面报错。桌面档走 `md`，即改动前的默认值；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑。

### 优化 · 手机上和弦选择面板的头部收一档（2026-09-28）

- 需求（用户提「chordpicker 的 header 在窄屏占比太多」）：手机上打开和弦选择面板，头部（面板标题行 +
  搜索 + 排序 + 分组页签）占掉面板高度的 31%（390×844 实测 247.5 / 799.5）；
- 成因同工作台保存操作栏：窄屏根字号是流式的（390px 宽时 22.25px），而头部控件的尺寸档都是 rem ——
  一行 `md` 控件 42.3px、分组页签 `lg` 51.2px，几行 chrome 叠起来就是这个数；
- 改法：手机（< md）上头部控件整体降一档 —— 搜索框 / 排序分段 / 调式键 `md → sm`、
  分组页签 `lg → md`（与顶栏 Tab 栏的窄档同档）。**只降尺寸、不动布局**：搜索与排序仍是两行、
  页签仍在固定头里，故不触碰那条「面板宽度与视口无关、不按视口切两套布局」的口径 ——
  降的是标尺、不是行数。判据取 `isMobile`（< md）而不是本组件既有的 `isPanelFullWidth`：
  后者量的是「面板够不够宽」（决定网格列数），这里要的是「屏幕够不够小」；
- 顺带把搜索框此前**没传尺寸档**这件事摆正：它一直落在 `md`（42.3px），而旁边那句注释写的是
  「三者同取 sm 档位」——注释与实现本就分叉，现在按窄屏 `sm` / 宽屏 `md` 显式声明；
- 实测（真机浏览器 390×844）：picker 固定头 166.3 → **144**（搜索/排序行 104 → 90.7、
  页签行 62.3 → 53.4、页签 51.2 → 42.3），列表可视高 469.9 → **492.2**，头部占比 31% → **28.2%**；
  桌面档（1440×900）一字未动：固定头仍 166.3、页签仍 51.2、网格仍 3 列；零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑。

### 优化 · 分组和弦排序弹窗在窄屏整体收一档（2026-09-28）

- 需求（用户提「和弦库分组排序 modal 窄屏下紧凑布局」）：手机上打开分组的「和弦排序」弹窗，
  两行表单在窄屏里顶出、控件被挤到标签旁边；
- 成因有两层：① 窄屏根字号是流式的（390px 宽时 22.25px），`4.2rem` 的标签列随之涨到 93.4px、
  `lg` 行距涨到 22.25px；② 两枚控件都是**定宽**的 —— 分段控件按内容自适应（三个选项 202.7px）、
  调式选择器落在 `md` 档（8rem = 178px），而扣掉标签列与行距后控件列只剩 177.8px（390 档）
  / 147.8px（360 档）→ 分段控件在 390 档顶出 24.9px、360 档顶出 54.9px，选择器在 360 档顶出 30.3px；
- 改法（**只在窄屏 `< md` 生效，桌面档一律取改动前的原值**）：`BaseForm` 容器整体收一档
  —— `gap` `lg → md`、`label-width` `4.2rem → 3.6rem`、`size` `md → sm`（尺寸档经 prop 下发，
  没有等价的媒体查询写法，与工作台胶囊 / picker 头部同一条判据）；两枚定宽控件各自再收一层 ——
  分段控件开 `compacted`（三个选项的内边距各收一档，横向省约 33px），调式选择器在窄屏改 `width="full"`
  填满控件列。行数与行结构不变，收的是标尺；
- 踩到的坑：选择器最初改传 `width="100%"`，结果**塌成内容宽 74.7px** —— 它的 `width` 是加在触发器上、
  而触发器的父级（`BasePopover` 的 wrapper）默认是收缩尺寸，百分比对着收缩父级解析就退化成内容宽。
  正确写法是 `'full'` 档：它除了给 `100%`，还会把外层 popover 置为 `block`（`w-full`），父级先撑开、
  百分比才有参照；
- 实测（真机浏览器，右键分组头 →「和弦排序」）：390×844 卡片 356.6×366 → **356.6×360**、
  正文高 167.97 → **162.41**、标签列 93.44 → **80.09**、控件列 177.75 → **191.09**、
  分段控件 202.69×42.27 → **135.94×35.59**、选择器 178×42.27 → **191.09×35.59**（正好填满控件列），
  两行的「超出控件列」由 24.94 / 0.25 → **-55.15 / 0**；360×640 同构：控件列 147.75 → **161.09**，
  分段 135.94、选择器 161.09，超出量由 54.94 / 30.25 → **0 / 0**；桌面 1440×900 逐像素不变
  （卡片仍 480×313、分段仍 202.69×42.27、选择器仍 178×42.27、行距仍 22.25）；零页面报错；
- 一处如实说明：`BaseFormRow` 的横向行高被 `CONTROL_HEIGHT_CLASSES.md` 钉死在 42.27px，
  故降控件尺寸档收的是**控件自身**的高度与内边距（42.27 → 35.59），行高不变 ——
  纵向收益只来自行距档（22.25 → 16.69，两行合计 5.56px）。那是平台级行口径，未动；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑。

### 调整 · 弹窗 footer 在窄屏堆叠时改为「确认在上、取消在下」（2026-09-28）

- 需求（用户提「modal 在窄屏下确认按钮在上，取消在下，自定义 footer 的也改一下」）：窄屏下弹窗
  按钮行的堆叠次序反了 —— 次要的「取消」占着第一行，主要动作被压到最下面；
- 改法：两处堆叠类由 `max-sm:flex-col` 改为 `max-sm:flex-col-reverse` —— ① `BaseModal` 的
  `modal-footer-zone`（覆盖默认的取消/确认，也覆盖走 `#footer` 插槽的自定义 footer）；
  ② 「删除和弦」弹窗那行**自绘** footer（`ChordModalsContainer`，`hide-footer` 档自己画的按钮行）；
- **不改 DOM 次序**：两处的 DOM 恒为「取消 → 主要动作」，宽屏那一行要的就是这个左右次序
  （全站按钮行统一「次要左、主要右」）；若把 DOM 换成「主要动作 → 取消」，窄屏是顺了，
  宽屏却会变成「确认在左、取消在右」，与全站相反。反转只发生在堆叠态，宽屏一行逐像素不变；
- 代价如实记一笔：窄屏下 Tab 次序仍按 DOM（取消 → 确认），与视觉次序相反 —— 这是反转布局的固有取舍；
  这两处弹窗都另有 X / 遮罩 / Esc 三条关闭路径，键盘用户不依赖按钮行。已在 `BaseModal` 注释中写明；
- 实测（真机浏览器，390×844 / 360×640 / 1440×900）：默认 footer 窄屏视觉自上而下
  确认 → 取消（390 档 top 474.38 / 527.77，各 287.88 宽铺满整行；360 档 372.38 / 425.77，各 257.88）；
  自绘 footer 窄屏为「删除组（全部删除 + 删除选中 并排各半宽）→ 取消铺满整行」
  （390 档 546.02 → 604.97，两枚删除钮各 138.38；360 档 457.13 → 516.08，各 123.38）；
  两处的 DOM 次序均仍为「取消 → 主要动作」；桌面 1440×900 两处都仍是一行（取消在左、主要动作在右，
  同一 top 531.44 / 589.91）；零页面报错；
- 顺带说明（范围外，未改）：同步弹窗 `SyncModalContainer` 走的是 `#footer` 插槽，其三个**并列**
  动作钮（测试连接 / 拉取 / 推送）也一并随反转，窄屏自上而下变成 推送 / 拉取 / 测试连接 ——
  它们之间没有取消/确认之分，若这组并列动作的次序不该翻，需要单独给它开一个退出开关；
- 验证命令：`eslint --max-warnings 0` 0 问题（两个文件）、`prettier` 已跑；全量关卡按禁令未代跑。

### 优化 · 窄屏下通知与 Toast 改为横向居中、两侧外边距相等（2026-09-28）

- 需求（用户提「窄屏下 toast 改成居中的，左右外边距一致」）：窄屏下浮层贴着屏幕右缘，短提示的
  左边距远大于右边距，观感是一整条不对称的空白；
- 根因：`GlobalNotification` 的默认方位是 `top-right` → 外层 `right-lg items-end`，右边距恒为
  `lg`（22.25px），而卡片的宽度由**内容**决定（cross axis 上不 stretch）—— 于是左边距 =
  「视口 − 卡片宽 − lg」，短 Toast 时大得离谱，只有卡片恰好占满可用宽度时才对称；
- 改法：`< md` 时外层横向锚点整体换成 `left-1/2 w-full -translate-x-1/2`（新增常量
  `NARROW_CENTER_CLASS`，`positionClass` 按 `useResponsive().isMobile` 现切），同时把**合并区**的
  `items-end` 与「清空全部」按钮的 `self-end` 一并换成居中对齐 —— 只改外层锚点是不够的：
  合并区是 `self-stretch`、卡片的实际对齐由它决定，右对齐会让卡片贴着整幅视口的右缘、反而更不对称；
- `w-full` 不是顺手加的（历史片段里记的「`*-center` 档另有隐患」正是缺它）：该盒是 `fixed` +
  只给 `left`，按 shrink-to-fit 规则**可用宽度只有半个视口**（50vw），卡片自身的 `max-w-[90vw]`
  会被二次夹到 50vw —— 长文字卡片反而比宽屏还窄。`w-full` 把盒子摊成整幅视口，上限交回卡片自己的
  `max-w-*`，`items-center` 再在中线上居中，两侧留白 = (100vw − 卡片宽) / 2，与卡片宽度无关；
- 纵向方位与动效不动：`position` 的 `top` / `bottom` 定位与 `v-transition-slide-up` / `-fly-up`
  仍按原档走，本次只覆盖横向锚点（`App.vue` 用的是默认 `top-right`，无调用方传 `position`）；
- 实测（真机浏览器，390×844 / 360×640 / 1440×900；每种视口下同时种「短胶囊 + 带描述的多行卡片 +
  两条常驻通知」）：390 档多行卡片 351 宽、左右外边距 **19.5 / 19.5**，单行胶囊 179.95 宽、
  **105.02 / 105.03**（1 分差是取整），「清空全部（2）」**122.13 / 122.13**；360 档同构
  （324 宽 → **18 / 18**；胶囊 **90.02 / 90.03**；清空钮 **107.13 / 107.13**）；
  1440 档外层仍是 `right-lg items-end`、右边距 22.25px、左边缘 904.2 —— 与改前逐像素一致；零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑 ——
  真机值得看：窄屏短提示是否落在屏幕中线、长文案卡片是否不再被夹窄、跨过 768px 来回缩放时锚点切换
  是否平滑、底部方位（`position="bottom-*"`）若日后启用是否仍贴底。

### 修复 · 窄屏下指板卡比面板卡宽 2px（2026-09-28）

- 需求（用户提「窄屏下指板卡片与面板卡片宽度改成一致」）：堆叠档下两张卡片一上一下，宽度不一；
- 根因：下发给 `Fretboard` 的 `maxWidth` 直接取了卡片区的**可用宽度**（`boardAreaWidth`，量的是
  卡片区的内容盒），而 `Fretboard` 根元素的宽度 = 内容宽 + 卡片自身的左右边框 2px
  （`border border-glass-border`；卡片是 `shrink-0` + 宽度自适应的 flex 项，边框画在宽度之外），
  面板卡则是 `w-full`、宽度恰等于同一个内容盒宽 —— 于是指板卡恒宽 2px、左右各溢出内边距 1px；
- 改法：`WorkbenchView` 新增 `BOARD_CARD_BORDER_X = 2` 与 `boardFitWidth = max(0, boardAreaWidth − 2)`，
  `Fretboard` 的 `:max-width` 改吃后者；`max(0, …)` 保留「0 / 负数 = 还没量到 → 不缩」的既有语义
  （见 `useFretboardLayout` 的 `fitScale`）；
- 并排档不另做分支：那一档卡片取不到这个上限（1440 档卡片区可用宽 1109.22px、卡片自然宽 534.8px），
  减法在那里是空操作；
- 实测（真机浏览器）：360 档指板卡 **328.63 → 326.63**、左边缘 **15.69 → 16.69**，
  与面板卡（326.63 / 16.69）逐像素一致；390 档 **358.63 → 356.63**、左边缘 15.69 → 16.69，
  与面板卡（356.63 / 16.69）一致；1440 档并排时指板卡仍 534.8（左 390.8）、面板卡仍 400.5（左 995）
  —— 与改前逐像素不变；零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑。

### 修复 · 堆叠档下指板卡改取整宽（上面那 2px 只治了一半，2026-09-28）

- 现象（用户回帖「指板卡片和面板卡片还是不一样宽，指板卡片好像没有占满宽度」+ 一张真机截图）：
  上面那节减掉 2px 边框后，**默认和弦**下两张卡片确实等宽了，但换成弦少 / 品位窗口大的和弦又不等了；
- 根因（两层，第二层才是主因）：`fitWidth` **只缩不放**（`fitScale = min(1, 可用宽 / 自然宽)`，
  见 `useFretboardLayout`）—— 自然宽**小于**可用宽的和弦压根不参与缩放，卡片就按自然宽画。
  各档自然宽（`boardWidth(n) × fretboardScaleOf(f)`，实测值）：4 弦 5 品 342.18、4 弦 4 品 370.36、
  4 弦 3 品 402.56、6 弦 5 品 452.88、6 弦 3 品 532.8 …… 而 390 档可用宽 356.63、
  360 档 326.63 —— 只要自然宽落在可用宽之下（390 档的 4 弦 5 品 / 4 弦 4 品；360 档全部和弦），
  卡片就窄于面板卡。用户截图那一档按两条比值反推正是这一支：卡片/面板 = 0.965（实测 0.970）、
  两侧留白比 = 1.373（实测 1.39），两条都对得上「4 弦 5 品 + 390 档」；
- 改法：堆叠档给指板卡加 `w-full`（`:class="isStacked ? 'w-full' : ''"`）—— 卡片宽度从此**无条件**
  等于面板卡（两者都是「卡片区 / 面板列内容盒」的整宽），图的缩放口径一个字节都没动。
  并排档**不能**加：那一档卡片是「图的自然宽」，`boardAreaInsetRight` 按它算让位量，撑满会把指板推到面板列底下；
- 代价如实记一笔：自然宽小于可用宽时，图仍按原 scale 在卡内居中（本卡 `items-center`，cross 轴即横向），
  于是卡内两侧出现一段对称留白 —— 那是「不放大」这条既有规则的代价。390 档 4 弦 5 品约 6.2px/侧
  （与图自身 103.6px 的左右留白比，肉眼不可见），500 档 4 弦 3 品约 31px/侧。若要求「图也填满」，
  得放开 `fitScale` 的上限（会让宽而仍堆叠的视口上指板被放大到 1.8 倍），是另一个决定，本次不做；
- 实测（真机浏览器，360×640 / 390×844 / 500×766 / 1440×900；每档跑默认 6 弦 3 品、4 弦 5 品、
  4 弦 3 品）：三档堆叠视口下卡片宽度**恒等于**面板卡（360 档 326.63、390 档 356.63、
  500 档 466.63，左边缘同为 16.69）；1440 档并排时指板卡仍 534.8（左 390.8）、面板卡仍 400.5
  （左 995）—— 与改前逐像素一致；零页面报错；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier` 已跑；全量关卡按禁令未代跑。

### 修复 · 软键盘弹出时浮层不动、收起时整体跳（viewport meta 补 interactive-widget，2026-09-28）

- 现象（用户先问「为什么在 modal 的 input 里关闭输入法 modal 会从屏幕中间高度向上复位」，
  随后自己查了资料、把五种方案贴回来问「哪个好使」）：软键盘弹出 / 收起时，居中浮层的位置跳一次；
- 已排除的路径（上一轮走查）：`overlayLifecycle` 的两处 focus 都带 `preventScroll`、`overlayGuards`
  无滚动代码、`BaseModal` 无高度重算逻辑；探针实测卡片高度由 `v-auto-height` 写成内联值、键盘前后
  不变（285px），变的是「居中位置重算」——`.modal-overlay-container` 是 `fixed inset-0
flex items-center justify-center`，视口高度一变，居中的卡片就跟着挪（844 → 420 → 844 时
  top 279.5 → 67.5 → 279.5）；
- 根因：`index.html` 的 viewport meta 只有 `width=device-width, initial-scale=1.0`。Chrome 108 起
  `interactive-widget` 的默认值是 `resizes-visual`（**只**压缩视觉视口），布局视口、`100vh`、
  `100dvh`、`innerHeight` 全都不随键盘变 —— 浮层于是停在原处被键盘盖住，键盘收起时再跳回来。
  项目里 `dvh` 早已在用（`BaseModal` 的 `max-height`），但**没有这一项时它不响应键盘**，
  这是「用了 dvh 还是失灵」的由来；
- 改法：meta 补 `interactive-widget=resizes-content`（布局 + 视觉视口一起压缩）。零 JS，
  且不必动任何浮层代码 —— 居中定位、`dvh` 上限、`v-auto-height` 全都自动跟上。
  这一项也是五种方案里唯一同时满足「零 JS + 不用改结构 + 覆盖本项目全部浮层」的一条：
  方案一（`dvh`）已在用、但缺本项时不响应键盘；方案三 / 四（`visualViewport` + CSS 变量 /
  键盘避让）只在需要兼容 Chrome 108 以下或要抬「底部固定输入栏」时才必要，本项目浮层是居中定位、
  也没有贴底的输入栏；方案五（flex 替代 fixed）与本项目无关，浮层天然是覆盖层；
- ⚠️ 范围与边界：该属性只被 Chrome / Android 系支持，iOS Safari 忽略它（它本来就不压缩布局视口，
  走「整体上移页面」那条路，故既不受影响也不受益）；对全站所有 `fixed` 浮层生效，属全局行为变化。
  真机需确认：Android Chrome 上键盘弹出时弹窗是否随之上移 / 变矮而不是被盖住、收起时是否不再跳，
  iOS Safari 上是否与改动前一致（预期一致）；
- 验证命令：`prettier` 已跑；改动只有一条 meta 属性，无 lint / 单测可覆盖（类型检查无文件级形态、
  未验证）；全量关卡按禁令未代跑。

### 优化 · 乐谱预览里的英文歌词被和弦图撑开、读不成一个词（2026-09-28）

- 需求（用户先提「预览乐谱中连续的字母且没有字母分隔时应视为一个单词，它们之间的间距应缩小至一半」，
  看过效果后又提「单词还是从首字母被隔开了，应该连续的字母/字符视为一个整体，中间有和弦才分开它们」）：
  预览 / 导出图里的英文歌词是「每字一格」的栅格排法，字母之间与词之间一样宽；更要紧的是
  **和弦图会撑开它所在的那个字** —— 一段英文读起来是一列孤立的字，而不是一个词；
- 旧口径（两处叠加）：① 字与字之间没有折减，间距一律等于一个「字间隙」；② 挂和弦的字占一整列
  （`max(指板框宽 + CHORD_COLUMN_EXTRA_PAD, 字宽)`，出厂 76px），字形居中于列 —— 字被推到自己列的
  正中，而那一列宽到装得下一整张指板图，于是和弦挂在词首字时整个词从首字起就被推开
  （`A6` 被排成 `A⎵⎵⎵6`：两个字形中心相距 47.5px，其中 28px 是图撑出来的）；
- 新口径（**两条独立的口径，互不干扰**）：
  - **字形**按字宽逐字推进，词内相邻两字再收半个字间隙（**词内折减** = 半个「字间隙」=
    `(REGULAR_CHAR_WIDTH − LYRICS_FONT_SIZE) / 2`，出厂 (30 − 23) / 2 = 3.5px）：词内相邻两字只剩 15.5px；
  - **和弦图**锚定所在字符的**字形中心**，不再撑宽字符格；唯一的约束是「与上一张图的中心至少相距
    指板框宽 + `CHORD_COLUMN_EXTRA_PAD`」，不够就把本字连同其后内容右推。于是隔开两段字的只有和弦本身；
- 词的判定（`isWordChar`）：**半角、非空格、非歌词分隔符（`|` / `｜`）**。空格与分隔符才是真正
  打断一个词的东西；数字与标点一律算词内 —— 若按「只认 A-Za-z」把标点排除，`don't` 会变成
  `don ' t`（撇号两侧各留一份全间距），比不处理更难看。全角汉字本就不参与折减（字宽另走一档），
  中英混排时汉字两侧仍是全间距；
- 挂和弦**不再豁免折减**：旧口径让挂和弦的字不参与折减，理由是「那一列宽由指板框决定，收半个字间隙
  在观感上什么也没发生」；图不再撑宽字符格之后这条理由失效，而图与图的间隔已由推挤独立保证
  （折减只作用在字形上，推挤发生在字形中心之间，两者不会互相吃掉），故 `A6` 现在是紧挨着的两个字形；
- 落点（折行端与绘制端必须同口径，任一处漏改就会「量到的宽」与「画出来的宽」分叉）：
  ① `scoreExportLayout` 新增 `LyricFlow`（字形游标 `x` + 最后一张图的中心 `figureCenter`）与
  `beginLyricFlow` / `placeLyricChar` / `lyricFlowWidth` / `reserveBeforeEndChords`；
  `getCharColumnWidth` 随之改名为 `getGlyphAdvanceWidth` 并**去掉和弦占位那一档** ——
  它返回的已经是「字宽」，「列」这个中间概念不复存在；
  ② 绘制端 `renderScoreLine` 的字形与指板图都改由 `placeLyricChar` 给出的字形中心落位
  （字形居中于自己的字宽、图居中于字形中心），所有 x 以段首为原点、绘制时统一加 `startX`；
  ③ 折行端 `wrapScoreLines` 的累加与判定都改走同一套原语，判定前先把本字放进一条**影子流**读出
  本段会变成多宽 —— 段宽是「字形游标与最后一张图右边缘取大者」，只用游标会漏掉末尾那张图探出的
  半个框宽（实测窄宽 + 密集和弦下超 20px）；避头尾回借与孤字回借两条路径同步改为按新口径重算；
  ④ 边和弦组入列前先 `reserveBeforeEndChords` 把游标推过段尾那张图，否则会压在图上；
- 为什么不把推挤塞进 `getGlyphAdvanceWidth`：推挤量取决于**上一张图在哪**，不是单字的属性；
  而折减是**两字之间**的量，同样不属于任何单独一个字；
- 实测（真机浏览器里用导出排版 / 绘制层直接渲染三行，记录 `fillText` 与 `drawImage` 的落点）：
  - `hello world`（`h` 挂和弦）：字形中心 384 / 399.5 / 415 / 430.5 / 446（词内 **15.5px**），
    空格之后 483 / 498.5 / 514 / 529.5 / 545；改前词内是 47.5px；
  - `A6 G#maj7 D#aug B7sus4`（`A` / `G` / `D` / `B` 各挂和弦）：四个词的内部一律 **15.5px**、
    词界 37px、被图撑开处 60.5px；改前 `A` 与 `6` 相距 47.5px；
  - `告别旋律星河灯火琴弦山谷看着轻轻`（`告` / `别` / `律` / `琴` / `看` 各挂和弦）：汉字之间一律
    **30px**（= 全角字宽，无折减），只有「告↔别」76px、「旋↔律」46px 两处被图撑开；
  - 逐字对照：绘制端落点与排版层独立算出的字形中心**逐字一致**（汉字行 16/16；两行英文去掉
    不落笔的空格后 19/19 与 10/10，差值 < 0.01px）；
  - 折行不变量（窄宽 300 + 每隔一字挂和弦）：6 段宽度 235 / 267 / 267 / 267 / 267 / 115 **全部 ≤ 300**、
    段内任意两张图的中心距 ≥ 框宽、拼回原文不丢字不乱序；
- 单测：`tests/services/scoreTypography.test.ts` 的段宽重算式改为按同一套原语重走一遍（它此前是
  `Σ 列宽`，正是这次要改的那条口径），并新增两条用例 —— 「和弦图不撑宽字符格」（有 / 无和弦的词内
  间距相等、相邻两图中心距 = 框宽 + pad、段首那张图不越出段首）与「段尾图与行尾边和弦组不叠」；
- 范围外（未改，仅记录）：指板图按和弦**自身弦数**绘制（4 弦图 54.4px 宽），而占位与居中一律按
  **6 弦框宽**（72px），故弦数少于 6 的图会比自己那个字形中心偏左 8.8px（= 一个弦距）。这是本次改动
  之前就有的口径（旧口径同样偏 8.8px），与本次无关；要修得让占位宽度跟着和弦弦数走，属另一条决定；
- 验证命令：`vitest run tests/services/scoreTypography.test.ts` 9 项通过、`eslint` 0 问题
  （7 个文件）、`prettier --check` 全绿；全量关卡按禁令未代跑。

### 优化 · 空弦区上下边距再加厚 10%（2026-09-28）

- 需求（用户提「基类的空弦上下边距再增加10%」）：承上一档（0.5 → 0.6，各加厚 20%），这次再各加厚 10%；
- 改法：仍是那**一个旋钮** —— `src/domains/fretboard/constants.ts` 的 `CANVAS_MARKER_PAD_RATIO`
  `0.6 → 0.66`（= 0.6 × 1.1，即相对出厂 `0.5` 是 0.5 × 1.2 × 1.1）。派生链不动：
  `CANVAS_MARKER_PAD` = 弦枕高 × 本倍数 → `FRETBOARD_CANVAS_CONFIG.MARKER_PAD` →
  `FretboardGeometry.markerPad` → `markerAreaH_total` / `markerCenterY`，三处指板
  （交互 SVG / 离屏画布 / 乐谱导出）一起变，各侧只差 scale；
- 仍是**小于 1** 的倍数（0.66 < 1），「这段只是呼吸空间、不该有一条弦枕那么厚」的约束不破 ——
  该常量注释里的算式与理由已同步改写；
- 量级：基准图（scale = 1）单侧 2.16 → 2.376px（+0.216px）；交互侧（scale = 7.4）单侧
  15.98 → 17.58px（+1.60px），空弦区总高 88.21 → 91.41px（+3.20px，比单侧多一倍，因为上下各一份）；
- 未动的一面：`EDGE_PAD`（图上下留白）与 `MARKER_AREA_H`（空弦区内容高度）一律照旧 ——
  加的是留白，不是把标记撑大；弦枕高（`NUT_HEIGHT`）也未动；
- 保护区说明：本次改的是**基准常量表** `src/domains/fretboard/constants.ts`，不是
  `rules/02` 稳定保护区清单里的 `src/domains/fretboard/model/` 实现；且是用户明确的数值指令，
  非审美重构；
- 验证命令：`vitest run tests/domain/fretboardGeometry.test.ts tests/services/scoreTypography.test.ts`
  19 项通过（两文件的派生断言全为相对值 —— 等比 / 单调 / 与 `fretboardBoxWidth()` 比，不写死数值，
  故不受影响）、`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；全量关卡按禁令未代跑 ——
  真机值得看：三处指板的空弦区是否又松了一档、空弦音符与和弦名的上下间距是否仍对称、
  乐谱导出图与屏幕是否仍同比例。

### 修复 · CI 性能哨兵每笔必红：getActiveBaseStrings 计时恒为 0（2026-09-28）

- 症状：CI 的 bench 硬步骤（`.github/workflows/ci.yml`）**每一笔都红**，其余门禁信号被淹没；
  本地看不出来 —— `pnpm verify` 的 8 步里不含 bench，只有 CI 跑它；
- 根因：`bench.mjs` 里 `getActiveBaseStrings('STANDARD')` 的**返回值没人消费**，V8 把整段调用
  优化掉，`elapsed / iterations` 恒为 0；基线据此记成 `0`，而判定分支对 `base <= 0` 是
  **计失败**（「基线为 0，无法比对」）—— 这条哨兵于是每笔必红，且红的原因与真实性能无关；
- 改法：调用点把返回值累加进一个**汇点**再挂到 `globalThis`（局部变量「读过但没人用」仍可能
  被判成死值，写进全局对象才是不可消除的副作用），iterations `50000 → 200000`；顺手修正
  `bench()` 里那段把 0 归因于「打印精度不够」的注释 —— 精度只是下限问题，真出现 0 必须去调用点补汇点；
- 重录基线：`scripts/bench-baseline.json` 全量重录（本机 win32-x64 / node v22.22.2）——
  `analyzeChordGraph` 0.00869、`getActiveBaseStrings` 0.00004、`analyzeChordGraph x60` 0.041119；
- 实测：改前该项打印 `0.000000`，改后连跑两次为 `0.000036` / `0.000040`（36 至 40ns 一次，
  与「一次调弦预设查表」的量级相符），另两项 0.0086 至 0.0087 / 0.0411 在 3x 容差内；
- 未动的一面：容差（`TOLERANCE = 3`）、倍率判定口径、其余两项的 iterations 一律照旧；
- 验证命令：直接跑脚本本体两次（`vite-node .temp/bench-run.ts`，即 `bench.mjs` 写出的那一份，
  脚本正文由生成器从 `bench.mjs` 抽取、逐字一致）；`pnpm bench` / `pnpm bench:baseline`
  按禁令未代跑 —— 真机值得看：CI 的 bench 步骤是否恢复绿灯。

### 修复 · 工作台面板展开态被伪默认值覆盖（writeDefaults）（2026-09-28）

- 症状：IDB 未水合（启动链路有超时兜底，不保证水合先于一切初始化）时，四个工作台面板各写一次
  伪默认 `'expanded'`；idbKv 是**窗口写覆盖**，用户存的「收起」就此永久丢失，全程无任何报错；
- 根因：`useWorkbenchPanelExpanded` 是全仓**唯一**显式传 `writeDefaults: true` 的调用点，
  而 `useStorage` 入口已把它定为 `false`（注释里写明理由），显式传 `true` 恰好把这层保护反掉 ——
  vueuse 把「未水合时 getItem 返回的 null」当作「键不存在」，于是把 initial 写进存储；
- 改法：删掉那一行（读路径本就不需要它：无值时 ref 由 initial 提供，展开态依旧是真），
  并在注释里写明「为什么这里刻意不传」；
- 未动的一面：自定义序列化器与旧值归一化（`'true'` → 收起、`'collapsed'` → 收起等）逐字保留；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；该组合式无单测、
  类型检查无文件级形态，两项未验证；全量关卡按禁令未代跑 —— 真机值得看：收起某个面板后刷新，
  面板是否仍是收起的。

### 修复 · 歌词删字后和弦静默挂到后一个字（2026-09-28）

- 症状：删掉行首那个**带和弦**的字，和弦不是跟着消失，而是静默挂到后一个字上，并落盘、进备份、进导出；
- 根因：`shiftCharSlotsForEditedLines` 里「和弦所在的位置被删掉」的两条分支（旧下标越界 /
  重映射为 -1）只 `continue`，**不置 `lineChanged`**；`lineChanged` 为假时整行的新 `char`
  根本不被写回，旧槽位原样留着 —— 而字符左移后，原下标正好落到后一个字上；
- 改法：两条丢弃分支都置 `lineChanged = true`（丢弃本身就是一次改动）。清空后的空容器由紧随
  其后的 `garbageCollectChordMap` 回收 —— `updateLyrics` 里两者本就相邻（先平移、再回收）；
- 未动的一面：`buildCharIndexRemap` 的近似对齐、边和弦槽位的原样保留、越界回收那一档；
- 验证命令：`vitest run tests/utils/chordMap.test.ts` 16 项通过、`eslint --max-warnings 0` 0 问题、
  `prettier --check` 通过；全量关卡按禁令未代跑 —— 真机值得看：删掉行首带和弦的字后，
  和弦是否随那个字一起消失，撤销能否还原。

### 修复 · 和弦简写收敛到唯一实现（title 与卡面不再各说一套）（2026-09-28）

- 症状：同一张卡上 `ChordCard.vue` 的 title 与卡面显示不同写法 —— title 出 `CM` / `Cmin7`，
  卡面出 `C` / `Cm7`；半减七同理（title 经特判得 `ø7`，卡面走 token 得 `m7b5`）；
- 根因：`segmentsToString` 仍查**遗留的按字符串映射表** `SHORTHAND_QUALITY_MAP`，
  而 `vChordName` 已统一到 `toShorthandQuality`（token 表驱动）。那张表自己的注释写着
  「`maj` → `M` 与 AST 路径的 `major` → `''` 的差异不影响实际显示」—— 在 segmentsToString
  这条路径上并不成立，它正是 title 那一侧的渲染入口；
- 改法：`segmentsToString` 的简写分支改为 `quality = toShorthandQuality(quality)`，删掉
  「`m7` / `m` + b5 扩展音 → `ø7`」的特判：半减七在新分片里是**一个完整性质** `m7b5`
  （见 `nameToSegments` 的说明），走 token 简写直接得 `ø7`；旧形态由 `normalizeChord` 一次性迁移，
  特判只是「救旧持久化分片」的第二处补丁。`extensions` 随之由 `let` 改 `const`；
- 同步测试：`tests/domain/chordSegments.test.ts` 的 `Cmaj` 简写断言 `'CM' → 'C'`
  （AST 路径下大三和弦的简写即裸音名），新增 `Cmin7 → 'Cm7'` 一条（钉住「同一性质的不同写法
  收敛到同一简写」）；那条结构化 fixture 的 `m7` + b5 扩展音改为解析器**现产出**的 `m7b5`
  （三条断言逐字不变，仍为 `F#m7b5/A` / `F#ø7/A` / `F♯ø7/A`），并清掉随之不再使用的
  `ExtensionSegment` 导入；
- 未动的一面：`SHORTHAND_QUALITY_MAP` 保留（`toShorthandQuality` 对未识别性质的回退，
  以及既有单测对 `formatChordQuality` 的锁定），简写规则仍只有 `toShorthandQuality` 一处实现；
- 验证命令：`vitest run` 六个相关文件共 257 项通过（chordSegments 32 / chordSearch 19 /
  chordCorpus 199 / theory 32 / chordNameParserConsistency 3 / workerExportService 2）、
  `eslint --max-warnings 0` 0 问题、`prettier --check` 通过；全量关卡按禁令未代跑 ——
  真机值得看：同一张卡的 title 与卡面是否已同字，搜索别名是否仍命中（`Cmin7` 这类全称别名照旧）。

### 修复 · 触摸长按同时弹出菜单并改写折叠 / 选中（2026-09-28）

- 症状：触摸端长按一次，菜单弹出**且**折叠头当场收起 / 卡片当场选中 —— 一次手势干了两件事，
  与「长按 = 右键」的契约相悖，每次必现；
- 根因：长按到点派发合成 `contextmenu` 后，`pointerup` 的 `clearLongPress` 把会话清掉，
  随后 `onEnd` 的 `settleClickAfterDrop` 按「影像未浮现」判成纯点击、补派一次合成 click，
  浏览器补派的原生 click 也照常到达 —— 把手实际被点了**两次**（变异检验实测
  `expected [ 'a', 'a' ] to deeply equal []`，这也解释了「偶尔看起来没反应」的错觉）；
- 改法：新增 `longPressConsumed`（**存活到松手落定**，故刻意不随 `clearLongPress` 复位）：
  松手时既不补派合成 click，也吞掉 sortable 放行的原生 click（与真拖分支共用同一套
  `swallowNextClick`）。复位点只有三处 —— 落定消费、`onPointerDown`（新手势）、`destroy`；
- 新增用例：`tests/ui/composables/useSortableListClickSuppression.test.ts` 第三条
  （触摸长按 → 长按合成事件收到 1 次、把手 click 收到 0 次），宿主挂载函数加了
  `longPressMenu` 开关；该用例经**变异检验**（临时废掉新分支必红）；
- 未动的一面：真拖分支、「纯点击补派」那条路径、长按滑动放弃与拖拽接管的两个阈值一律照旧；
- 验证命令：`vitest run` 三个文件共 26 项通过（clickSuppression 3 / scrollOffsets 7 /
  chordMap 16）、`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；全量关卡按禁令未代跑 ——
  真机值得看：触屏长按折叠头 / 卡片，是否只弹菜单、不再连带收起或选中。

### 修复 · 和弦选择器跨 565px 后分区下半段整片空白（2026-09-28）

- 症状：竖↔横切换或拖动窗口跨过 565px（列数 2↔3）后，2 列所需的下半段行**永不挂载**，
  分区内整片空白，直到滚动一下才自愈；
- 根因：列数 watch 里**同步**跑 `refresh()` / `updateWindow()` —— 此刻网格还是旧列数的节点，
  量到的是旧行；而窗口缓存的 `[first, last]` 是**行号**，旧区间在新列数下覆盖不到下半段；
  尺寸观察者接不住这一档（它只同步滚动状态，不重算窗口）；
- 改法：与上面「分区集合变化」那条同一条口径 —— 包一层 `nextTick`，等 DOM 落到新列数后再量、
  再重算窗口；不必 `syncSections`（那是「分区增删」的事）；
- 未动的一面：`useRowWindowing` 的行规划与尺寸观察者那条通道一行未改；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；该组件无单测、
  类型检查无文件级形态，两项未验证；全量关卡按禁令未代跑 —— 真机值得看：拖窗跨 565px 往返，
  分区下半段是否始终有内容。

### 修复 · 指板骨架位移补偿（FLIP）完全不生效（2026-09-28）

- 症状：零品加粗 ↔ 偏移两档切换时，整块内容仍瞬移一个线宽 —— 注释承诺已修的跳变原样在；
- 根因：`rAF` 回调**早于本帧的样式重算**，「垫上反向位移」与「放开过渡归零」被合并进同一次
  计算，浏览器只看见最终值，过渡没有起点可插值 —— 补偿值从未被计算过，FLIP 形同虚设；
- 改法：放开过渡前读一次容器布局属性（`boardFrameEl.offsetWidth`）强制**同步重排**，
  把垫位移钉成「前一帧的样式」；容器加 `ref="boardFrameEl"`，`onBeforeUnmount` 取消在途 rAF
  （否则回调会去写已销毁组件的 ref），重复切换时先取消上一帧；
- 未动的一面：几何本身（`gridTop` 仍烘进坐标，Canvas 与导出共用）、空弦音符的反向抵消、
  与品号层共用的过渡窗口一律照旧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；该组件无单测、
  类型检查无文件级形态，两项未验证；全量关卡按禁令未代跑 —— 真机值得看：切换零品加粗档时
  骨架是否**平滑滑**一个线宽而不是瞬移，空弦音符是否仍钉在标记位上。

### 修复 · 乐谱交互区在非 100% 缩放下行高被逐次推大（2026-09-28）

- 症状：缩放不是 100% 时，删掉一个带和弦的字（或撤销）之后，那一行的高度会**一次比一次大**，
  行与行之间越挤越开，直到重新排布才回正；
- 根因：容器带 `zoom`，`style.height` 写的是**容器内长度**、渲染时会被再乘一次倍率，而
  `getBoundingClientRect()` 报的是**视觉 px** —— 两处「钉住行高」的写入（`pinRowHeight`、
  `animateLineRowHeight`）与删除动效的 `fromHeight` 都直接把视觉 px 写回，等于每轮放大 zoom 倍；
  更糟的是下一轮又在这个已放大的值上量一遍，于是「钉 → 量 → 钉」往复把它推成 zoom² 倍；
- 改法：这三处一律经 `toContainerPx` 换算（与 `lineRowHeights` 同口径），`pinRowHeight` 也改为
  返回局部 px —— 于是喂回 `animateLineRowHeight` 的 `fromHeight` 在缩放下是个不变量；
- 未动的一面：行高过渡的时长曲线（与 zoom 无关）、`measureLineRowHeights` 的量取口径、
  `fillGapAtViewport` 那套滚动补白一律照旧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；该组件无单测、
  类型检查无文件级形态，两项未验证；全量关卡按禁令未代跑 —— 真机值得看：缩放到 150% 左右，
  反复删/撤销带和弦的字，行高是否**只跟内容**变化。

### 修复 · 工作台卡片让位量凭空多出纵向留白（2026-09-28）

- 症状：指板卡被**白白推左**一截（本侧缩放下约 26px），与注释承诺的「尽可能留在整幅画布的中心」
  正相反；并排触发的阈值也跟着虚高，本该并排的窗口宽度下仍然竖排；
- 根因：让位量的式子里带了一项「左留白 − 右留白」，而这是**量纲错误** —— 它拿的是基准的**上下**
  留白（`EDGE_PAD`）去减画布的**左右**留白，而画布的左右留白是同一个常量、左右各一份同值
  （见 constants 的登记），横向差恒为 0，这一项本就该是 0；
- 改法：删掉该项，式子的下界回到「画布宽 ≥ 卡片宽」，注释里把量纲依据与删它的理由一并写清；
- 未动的一面：卡片自然宽的测取、面板列宽、并排判定的其余分支一律照旧；
- 验证命令：`eslint --max-warnings 0` 0 问题、`prettier --check` 通过；这条让位量没有任何单测
  （当初是探针实测的），本批也没补 —— 该项未验证；类型检查无文件级形态，同样未验证；
  全量关卡按禁令未代跑 —— 真机值得看：拖窗到并排临界宽度附近往返，卡片是否居中、阈值是否回到
  「刚好放得下卡片」。

### 修复 · 文档把 CI 的 bench 说成「信息性输出」等四处失真（2026-09-28）

- 症状：四处文档各写了一份「本地关卡与 CI 的关系」，且**四处都错**：
  1. `rules/03`（及由其派生的 `AGENTS.md`）说 CI「跑同一组关卡，只是少了 `changelog:check`、多了
     **信息性的** `pnpm bench`」—— 两处都不实：CI **有** `changelog:check`（它是 pre-commit 那道
     关卡的远端版本），而 bench 是**硬门禁**（与入库基线比倍率、超 3 倍即 exit 1）；
  2. 同一处的步骤清单写作「串行 8 步」，实际是 **9 步** —— 漏了 `typecheck:worker`；
  3. `scripts/verify.mjs` 头注自称「当前 9 步」，紧接着列出的却只有 8 条，同样漏 `typecheck:worker`；
  4. `.github/workflows/deploy.yml` 的注释还列着 **Coverage**（2026-09-25 已整条拿掉的关卡），
     且同样漏 `changelog:check`。
- 后果：这条「bench 只是信息性输出」的失真，正是 CI 哨兵烂掉却没人发现的原因 —— 本批修的
  `getActiveBaseStrings: 0` 会让 CI 每笔必红，而按文档的说法它「不该拦人」，于是要么被当成噪声，
  要么被当成跑机抖动；本地 `pnpm verify` 又不含这一步，看不到。
- 改法：四处一并按事实改写（9 步 + `typecheck:worker`；CI 是同一组 9 步再多一步 bench；bench 是
  硬门禁）；`deploy.yml` 那处**不再逐条枚举**关卡（枚举本身就是第二事实源，改一次漏一次），改为只
  指向 `ci.yml`；`AGENTS.md` 按 `pnpm guidance:build` 重新生成（只改它派生的那两处）。
- 未动的一面：关卡本身**一条未改**，本轮改的全是说明文字；`pnpm verify` 与 CI 的实际行为与改前一致。
- 验证命令：`prettier --check` 对四处与 `AGENTS.md` 全通过；纯文档改动，无对应单测、类型检查亦无
  文件级形态，两项未验证；全量关卡按禁令未代跑。

### 修复 · 注释里三处失真数字与一个假成因（2026-09-28）

- **性质表条数 63 写成 64 的反面**：`chordEngine.ts`（两处）与 `chord/types.ts` 都把
  `QUALITY_TOKENS` 记作「63 条 token」，而 `data/chord-qualities.json` 实为 **64 条**（表长过一次、
  注释没跟）；`chordEngine.ts` 另有一处「63/63 自检」—— 该自检只跑**非 notationOnly** 的 token
  （现 3 条被排除 ⇒ 61 条），是个会随数据表变的派生数，改为「自检覆盖全表」不再抄第二遍。
- **lineId 位数 8 写成 12 的反面**：`scoreModel.ts` 的 `parseSlotKey` 注释称「`l_` + 8 位 hex」
  （示例 `l_3f2a1b8c`），而 `createLineId` 走的是 `generateUUID('', 12)` —— 8 是 `generateUUID`
  的**旧**默认长度，默认改 12 后这处没跟。
- **根字号「流式」是假成因**：`platform/utils/dom.ts` 称根字号是流式的、且「tokens.scss 按视口/档位
  给 html 字号」—— 两处都不实：`tokens.scss` 根本没有 `html` 字号规则，真正给值的是
  `assets/main.scss` 的 `html { font-size: 22.25px }`，而且是**固定值**（全仓无第二条根字号规则、
  无相关媒体查询、无运行时写入）。结论（别写死 16）依旧成立，被推翻的只是**成因**；同一句「流式 /
  随视口变」的复述还散在 4 个业务文件里（`ChordPickerPanel.logic.ts`、`ChordPickerPanel.vue`、
  `WorkbenchView.vue` 两处、`ScorePreviewPane.vue` 两处），一并按事实改写。
- 未动的一面：**没有一行运行时行为改动** —— 全是注释与文档；条数、位数、根字号本身都与改前一致。
- 验证命令：`prettier --check` 对全部改动文件通过、`eslint --max-warnings 0` 对全部改动的
  `.ts` / `.vue` 0 问题；改动是注释，未跑单测（无行为可测）、类型检查无文件级形态，两项未验证；
  全量关卡按禁令未代跑。

### 修复 · 四条测试缺口：其中一条此前对真回归是盲的（2026-09-28）

四条都用「改坏实现看用例是否报红」的变异检验过，改前/改后各跑一次：

- **`scoreTypography` 的「段尾图与行尾边和弦组不叠」此前是盲的**：用例把第一张边和弦图的左边缘
  多算了半个框宽。`drawFretboard` 收的是**左边缘**（行内那一路传的就是 `centerX − 框宽/2`），
  边和弦组这一路直接传 `flow.x + EDGE_CHORD_SECTION_GAP`；多算的半框宽（72px 的框 = 36px）恰好
  就是它要守的那段安全距离，于是断言凭空松掉一半。变异检验：把 `reserveBeforeEndChords` 的推挤
  改成空操作 —— 改前 89.5 ≥ 78 **过**，改后 53.5 ≥ 78 **红**。
- **`floatingZ` 只钉了「不并列」没钉「向下」**：用例名写着「向下让位」，断言却只有「两个浮层不
  同号」。分配器若从别处取一个更高的空闲号，层号照样互不相同 —— 而那正是 ceiling 要防的
  （父面板反超自己面板内打开中的子浮层）。补上「结果不得越过 ceiling」。变异检验：取号改成不看
  ceiling，新断言报红、旧断言仍过。
- **`cacheAggregate` 漏了实例份数**：口径一致的用例只断言 `limit`，聚合的另一半（这个名字下挂了
  几个实例）无人守 —— 补 `instances`。
- **`useLyricsDragDrop` 的取消区绕开了松手那条路径**：原有四条用例都跨帧（走 rAF 回调），恰好避开
  `handleGlobalPointerUp` 的 flush —— 而实现里「取消区判据必须落在合帧回调内部、不能放在 schedule
  侧」这条注释防的正是它（判据留在 schedule 侧，flush 会用进区前的旧坐标把落点写回槽位）。补两条：
  命中取消区即跳过落点解析；正对照 —— 同一条 flush 路径落在槽位上确实解析，且用的是**最后一帧**的
  坐标。观测点只能取 `elementFromPoint` 的调用：落点状态在松手收尾的 `resetDragState →
clearDragClasses` 里一律被清空，松手之后读不到那次 flush 的结果。变异检验：判据恒不命中时新用例报红。
- 未动的一面：**没有一行运行时代码改动**（变异只用于检验、已全部还原；`git diff` 对三个被变异过的
  源文件为空）。
- 验证命令：`vitest run` 上述四个测试文件 21 用例全绿；`eslint --max-warnings 0` 0 问题；
  `prettier --check` 通过；类型检查无文件级形态、该项未验证；全量关卡按禁令未代跑。

### 修复 · 预览面板休眠一次后，改歌词 / 改排版不再自动重渲（2026-09-28）

- **症状**：预览标签与别的标签之间来回切过一次之后，改歌词、改排版、换主题都不再触发重渲。切回预览
  的那一下是好的（`onActivated` 的唤醒守卫会补一次），所以看着像一切正常，直到下一次编辑。
- **根因**：`activeContentKey` 的短路条件是**普通 `let`** —— `computed(() => (isPaneActive ?
reactiveContentKey.value : ''))`。computed 的依赖集是**每次求值后重建**的：休眠期间那次求值走
  `''` 分支、根本没读 `reactiveContentKey`，它的依赖随之被摘掉；此后写回 `true` 既不触发失效、依赖
  也不会重新登记，`watch(activeContentKey)` 就**永久失聪**（此后键再变也不会有任何回调）。
- **改法**：`let isPaneActive` → `const isPaneActive = ref(true)`，四处读写随之带 `.value`。短路优化
  （休眠期间不重算指纹 / 横按签名 / 排序 / 整串拼接）原样保留：ref 的写值本身就让 computed 失效，
  激活时会重新读到 `reactiveContentKey`。也考虑过把守卫挪进 watch 回调 —— 那会让休眠期间每次键入
  都重算整串键，正是该处注释说明要避免的，故不取。
- **未动的一面**：watch 的早退、`onActivated` 的唤醒守卫、主题标记 `consumeThemeChange` 的消费时机
  一律没改。「休眠 → 激活」这一跳现在会与 `onActivated` 各起一轮 —— 这正是该 watch 注释里点名的
  「onActivated 与防抖各起一轮」那条路径（`generate` 起手的在途复用分支、命中缓存即收工两处都在），
  修好之前它反倒因为上面那条失聪而从未走到。
- 验证命令：`eslint --max-warnings 0` 与 `prettier --check` 对该文件 0 问题；该组件没有组件级测试
  （挂载需 Worker / OffscreenCanvas），本次未新增用例，**行为未经单测验证**；类型检查无文件级形态、
  该项未验证；全量关卡按禁令未代跑。
