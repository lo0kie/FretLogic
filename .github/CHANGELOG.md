# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循
[Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

### 修复 · 点击与按钮自我禁用后提示气泡的空闪、不再显示（2026-09-25）

- 现象一（`platform/directives/vTooltip.ts`）：鼠标停在带 `v-tooltip` 的按钮上时点一下按钮，
  已经稳定显示的提示会闪一下 —— 透明度与缩放重放一遍入场动画；
- 成因分两段：① 鼠标点击会让按钮**获得焦点**（Windows / Chromium 下 `<button>` 的默认行为），
  指令的 `onFocus` 随即以 `immediate` 再调一次 `showTooltip`；② `executeShow` 里那段
  「先倒回 `opacity:0 + scale(.95)`、两次强制回流、再补间回 1」的入场态重放是**无条件**的 ——
  它本是为「快速滑过多个 trigger 时每个都重放淡入」而设，对**同一目标**的重复触发没有守卫，
  于是显示中的提示被空重放一次；
- 修法：`executeShow` 开头加同目标守卫 —— `currentTargetEl === el` 且浮层已是
  `visibility:visible + opacity:1` 时直接返回。判据必须带 `opacity`：淡出窗口内（`opacity` 已置 0、
  `visibility` 仍 visible、`currentTargetEl` 尚未清）仍需重放动画，不能一并拦掉；跨 trigger 的
  重放不受影响（那时 `currentTargetEl` 已换成别人）；
- 现象二（同一处，同批修掉）：点完即自我禁用的按钮（顶栏「复制整张长图 / 复制乐谱文字 / 粘贴乐谱 /
  复制当前和弦」按下当刻就 `disabled` —— 凡「点击进入 busy、结束后自动恢复」的按钮都落在这个形态里，
  与具体是哪个按钮无关）还会因浏览器夺焦触发 `onBlur` → 立即隐藏，而 loading 结束后**再也显示不出来**：
  指针没动过，`mouseenter` 不会再触发，禁用控件上又收不到 `mouseleave`（实测：`disabled=true` 当刻
  `activeElement` 退回 body、指针从禁用按钮上移开时 `mouseleave` / `mouseout` 一个都不派发）；
- 修法：`onBlur` 记下这次「被状态夺焦」，`updated` 里发现该按钮重新可用且指针仍停在宿主上时补一次
  显示。判据只能用 `:hover` 直接问指针 —— 禁用期间没有任何鼠标事件可依赖，而 `:hover` 实测在禁用态
  下依旧如实跟随指针（在按钮上为 true、移开后为 false）；指针已离开就不再弹出来。刻意**不**采用
  「blur 时指针还在就不隐藏」的写法：那会让收起只剩 `mouseleave` 一条路，而该事件在禁用控件上
  根本不派发，指针移开也收不掉，会留下停在原地的浮层；
- 补显示这一支必须是**外层 `if` 的 `else if`，花括号不可省**：收起后 `currentTargetEl` 已被清成
  null，它恰好在「不是当前目标」时才该跑；少一层花括号会被就近绑定规则挂到**内层** `if` 上，于是只在
  `currentTargetEl === el` 时求值 —— 在唯一该生效的场景里永不执行，整支沦为死代码（首版正是这样写的，
  靠下面这条用例才发现）。新增 `tests/ui/directives/vTooltipDisableRecovery.test.ts` 钉住它：指令挂在
  **组件**上（复刻 ActionButton 形态，验「组件 vnode 的 dirs 继承到根元素 → 派发 updated」这条唯一
  触发通路）、根节点是带原生 `disabled` 的 `<button>`，正例验补显示，两条反例分别验「指针已离开」与
  「非禁用夺焦的失焦」都不补。`matches(':hover')` 在该用例里被桩成「由用例给出的答案」：jsdom 不做
  命中测试、该选择器恒为 false，那件事只能在真实浏览器里看。

### 修复 · 侧栏分组的开合动画被高度挂起整段抹掉（2026-09-25）

- 现象（`chord/library/components/GroupSection.vue`）：侧栏和弦库分组的展开 / 收起不再有高度过渡，
  内容瞬现瞬没；
- 成因：上一版为修「载入即展开时逐批补挂被看见成渐次长高」引入的 `body-hold`，接线时按
  `chunked.isFilling(group.id)` **无差别**开启，而补挂窗口对每一次展开都存在（`startFill` 就调在
  展开的同步 watcher 里）。挂起期写的是 `auto` —— 没有可插值的起点，0→N 的展开过渡被一并抹掉。
  该挂起原本只服务「载入即展开」那条路径：`initial-auto` 让折叠体首帧就是自然高度，没有过渡可藏；
  手动展开时折叠体正是从 `0px` 起走那段过渡、分批补挂藏在它未揭示到的行里，本来就看不见。
  故无差别开启等于用「抹掉开合动画」去换一个只在该路径存在的问题；
- 修法：`GroupSection` 记下 `immediate` 那一趟展开的分组 id（`holdGroupId`），`body-hold` 只对该组、
  且仅在其首批补齐进行中为真（判据里带着 `isFilling`，补挂一停就不再挂起）；任何一次开合
  （收起 / 换一组）都关闭这个窗口，同一组此后手动开合照常播放高度过渡；
- `v-auto-height` 的 `hold` 与 `BaseCollapse` 的 `body-hold` 补上口径说明：挂起期高度是 `auto`、
  0→N 的展开过渡会一并消失，只该用在本来就没有开合过渡可藏的路径上。

### 修复 · 同步动作的就绪门禁、两个 store 的水合门禁同构与撤销回填的空行僵尸绑定（2026-09-25）

- `songStore.hydrate` 的「窗口期保护」早退分支排在 `hydrated = true` 之前，于是「水合数据晚到但
  窗口期内已有本地改动」这条路径走完，`isHydrated()` 永久为 false —— 而上一笔新加的启动比对门禁
  正是以它为准，结果是**整个会话静默不比对**（只 warn、无重试）。门禁改为在「读成功之后、窗口期
  分支之前」置位：读失败仍保持 false（可重试、写回门禁也不该开），跳过赋值那条路径同样算水合完成。
  与 `chordStore.hydrate` 的同位写法对齐；
- 同步动作（上传 / 拉取）此前没有就绪门禁：未水合时内存是空初值，上传会把空库推上云端，拉取后经
  `applyOverwriteWithCloud` 写回时本地那份真实数据也不在内存里参与判断 —— 两个方向都会丢数据。
  新增 `ensureHydratedForSync`：**先等一次水合**（`hydrate` 幂等、读失败可重试），仍不就绪才拒绝并
  提示。调用点落在 `runCloudAction` 的 `run` **内部**，不进函数头 —— 那里是重入守卫的同步区间，
  放一个 `await` 会让双击的两次调用都越过守卫。三个手动入口（顶栏、首访引导、同步设置弹窗）与
  上传路径由此一并覆盖；
- `restoreChordBindingsToSongs` 的撤销回填在**空行**上会写下标 0 的字符绑定：`Math.max(0, 长度 - 1)`
  把 `-1` 钳成 0，而空行没有任何字符位。这种绑定界面上看不见、也删不掉，`extractSongChordSequence`
  遍历 `slots.char` 又不做越界过滤，会把它带进复制 / 导出的文本，并随备份与同步扩散（GC 只在
  `updateLyrics` 里跑）。改为行长为 0 时直接丢弃 —— 与「键不可解析 / 行已删」两条同口径；
- `BaseModal` 在消费方使用 `#title` 插槽时对话框无可用名：`aria-labelledby` 指向的 `titleId`
  只存在于插槽默认内容的 `<h3>` 上，插槽一替换 DOM 里就没这个 id，而 `'对话框'` 兜底被同一个条件
  关掉。判据改为「内置标题元素是否真的落地」（`title` 有值**且**未用插槽），插槽那条路径回落到
  `aria-label="对话框"`（通用名，但至少存在）；插槽作用域里给了 `title-id`，调用方要具体名字就绑它；
- `bodyHold.test.ts` 第三条用例的中间一步传的是**同值** props，不触发重渲染、指令的 `updated`
  根本不跑，那条断言等于空跑（同值赋值被 Vue 的 `hasChanged` 挡掉）；改为由一个真的会变的 prop
  驱动这次更新。顺带把「叠层 spy」改成复用同一对 spy 改写返回值 —— 原先第二对 spy 从未回收。

### 调整 · 指板横按气泡改实心档、品号改逐字符翻页、零品琴枕改高度插值（2026-09-25）

- 补记：这三条属**上一笔已提交的批次**，其片段（`2026-09-25-0251-audio-play-feedback.md`）已冻结
  而漏记，故按分区规则记在当前工作区片段；
- 已标记的横按气泡由 `bg-tint-primary-88 + text-primary` 改为 `bg-primary-solid + text-fg-on-solid`
  （`--text-on-solid` 只许配 `--color-<族>-solid`，是本仓唯一过对比度门禁的组合）；悬停不再走
  勾选框那套 `hover:bg-lift-*`（lift 由 `--color-primary` 派生，底一亮白字三主题全部低于 AA，
  高对比档连 3:1 都不保），改为加深投影，未标记态维持不填充 —— 两态由「实心 vs 留白」区分；
- 左侧品号改由 `BaseRollingText` 承载：改品位偏移时同一格上的数字「旧字上滑离场、新字自下滑入」
  （单档即 3 → 4），跨品窗跳转则整列一起翻；该层显式关掉 `aria-live`（整层 `aria-hidden` 的装饰层）；
- 零品加粗琴枕不再用 `v-if` 卸载：矩形常驻，只让高度在 0 ↔ 琴枕高之间插值，顶边锚在「指板顶那条
  线」（跨窗口恒定），看到的是自顶线向下长满 / 向上收没。此前 `v-if` 把 `.wide-nut-bar` 那条
  `height` 过渡连同元素一起卸掉 —— 那才是「瞬时跳变」的唯一原因，不是缺过渡规则。

### 新增 · 浮层箭头支持内角圆角与底宽 / 高度分调，三个开关都走 CSS 变量（2026-09-25）

- 现状（`platform/ui/popover/arrowPanelPath.ts`、`arrowPanel.ts`）：面板四角是真圆弧，楔形的三个内角
  却恒为尖角（`L` 折线）—— 同一条轮廓里两种风格并存；且箭头的底宽与高度被 `size` 绑死在 √2 比例上
  （底宽 `size·√2`、高 `size/√2`），只能整体缩放。本次补上「内角圆角」与「两个方向分别调」；
- 入口：`ArrowPanelPathInput` 新增可缺省字段 `arrowRadius`（**几何层缺省 0 = 输出与改动前逐字节一致**，
  测试钉住「不传」与「传 0」同串）；几何层早已分别接受 `base` / `rise`，故「分调」只需把上面那层
  写死的换算改成可被宿主覆盖。圆角画成**真 `A` 弧**，不是把折线切成多段；
- **三个内角的算法并不相同，这是本改动最容易写错的一处**：箭尖是「面板 ∪ 楔形」并集的**凸角**，
  切点距顶点 `t = R / tan(θ/2)`；两个底角是并集的**凹角**（刀口挖掉的是面板边线与两翼之间的缺口），
  切点距顶点 `t = R · tan(θ/2)` —— 系数互为倒数。按同一个公式写，底角刀口会甩到十几像素之外
  （实测 R=3 时切点距 8.55px，正确值 1.05px），楔形被磨成一个疙瘩；
- **同一个角的两个切点必须等距，这是紧随其后的第二个坑**：切点长度全路径只有两个值 —— 两个底角的
  四个切点都取 `tBase`、箭尖的两个切点都取 `tTip`。曾把**远侧**底角的翼上切点写成 `tTip`（近侧写的
  是 `tBase`），两值相差约 2.4 倍（R=2 时 `tBase≈0.83`、`tTip=2`），于是该处的弧与底边、与翼**都不
  相切**，接缝两端各留一个折角 —— 路径合法、弦长也合法，界面上表现为「一侧接缝平滑、另一侧生硬」
  （上边的遍历自左向右，近侧即左侧，故症状是左顺右生硬）。已修，并补两条判据钉住它：
  **① 相切性**（反解弧心后，半径向量与相邻直线段方向的夹角正弦必须 = 1；判据本身用一段与直线成角的
  弧做对照，确认能报非相切）、**② 镜像对称**（三处刀口的六个切点关于箭头轴互为镜像）；反向探针确认
  两条在四个朝向上都会变红；
- 半径三重收敛，取最小：① 楔形的**内切圆半径** `half·h / (half + leg)` —— 分界量是「半径还明显小于
  楔形本身」（再大就不叫三个圆角、而是整个楔形被磨圆），它顺带保证底角刀口不会互相越过
  （`tBase + tTip ≤ leg` 与 `2·tBase ≤ half` 恒成立，无需另设约束）；② **该边的余量** `slack` ——
  底角刀口是顺着箭头所在那条边往两侧吃进去的，吃掉的量超过余量，切点就退进面板的上一条角弧里
  （轮廓上表现为那一小段被拉平），余量为 0 时**退回尖角**而不是画出折返路径；③ 宿主给的值本身。
  内切圆随楔形放大而变大，故**扁箭头 / 小箭头的圆角会被夹得更小**，这是几何本身的边界；
- **三处弧的旋向是 0 / 1 / 0，不是同一个值**：同一条轮廓里凸角与凹角混排，箭尖右转、两个底角左转。
  照「一个楔形只有一种旋向」的直觉写，会让其中一处弧鼓向内侧（角被啃掉一块）；
- 填充路径（`buildArrowFillPath`）圆角时必须与轮廓**共用同一条楔形边界**（同样的六个切点、同样的
  三处弧），只在底边那一小段整体内移 `overlap`。理由：底角刀口是往凹角里吃进去的，那一小块也在轮廓
  围出的形状之内，填充若照尖角走就会在那儿露出底色（轮廓的弧还把边描在上面，缝隙格外显眼）；
- 开关：观感与尺寸依旧由宿主的 CSS 表达 —— `arrowPanel.ts` 的 `readArrowPanelPaint` 新增读取三个
  自定义属性（与 `--arrow-panel-clip` 同一口径），四个消费方共用，不新增组件 prop。属性可继承，
  写在高层即对所有箭头生效：
  - `--arrow-radius`：内角圆角半径，**未声明时取 `ARROW_PANEL_RADIUS`（= 2）**，写 `0` 即尖角
    （「未声明」与「显式 0」必须分开，不能被 `|| 默认值` 一起吃掉）；
  - `--arrow-width` / `--arrow-height`：底宽 / 凸出高度覆盖值（px，指箭头自身的两个方向，
    与贴在面板哪条边无关）；未声明或 ≤ 0 时沿用 `size` 的 √2 换算；
  - **可感知边界**：默认 12px 箭头（底宽 17px、高 8.5px）的内切圆只有 3.5px —— 默认值 2 放得进去、
    原样生效，但请求值一旦超过 3.5（如 4、6）就会被夹到内切圆，而**默认圆角必须放得进默认箭头**，
    否则这个默认值形同虚设；圆角化还会让箭尖回缩 `R·(1/sin(θ/2) − 1)`（等腰直角楔形即 `0.414·R`，
    R=2 时约 0.83px），这是真 `A` 弧的必然结果、不是 bug。要让更大的圆角原样生效就把箭头放大到
    内切圆 > R（如 `--arrow-width: 20px; --arrow-height: 10px`，内切圆 ≈4.14）。另外箭头贴到该边
    直边段尽头（伸到两侧的余量为 0）时不画圆角 —— 小面板（如 v-scrollbar 读数气泡）的箭头仍是尖角；
- `tests/platform/arrowPanelPath.test.ts` 增加 10 例：缺省不改观感、半径 ≤ 内切圆且切点不越过直边段、
  底宽与高度分调后仍按各自的内切圆收敛、三处弧的旋向（按 SVG 规范 F.6.5 反解圆心，判定凸刀圆心在
  弦内侧、凹刀在外侧）、每处「直线 ↔ 弧」接缝都相切、三处刀口的六个切点关于箭头轴互为镜像、
  填充与轮廓同边界且底边仍内移 1px、余量为 0 时退回尖角、极端半径与退化尺寸不产出非法路径。
  其中「旋向」与上面两条新判据都已用反向探针确认有牙（分别把箭尖的 sweep 写反、把远侧底角的切点
  长度写成 `tTip` → 各例四个朝向全变红）；
- 新增 `tests/platform/arrowPanel.test.ts`（7 例）钉住「宿主 CSS 声明 → 路径几何」这条链路：三个属性
  的读值口径（未声明 / 显式 0 / 非法值）、默认圆角确实落到弧半径上、请求值超过内切圆时确实被夹住、
  显式 0 确实退回尖角、底宽与高度覆盖值确实改变楔形尺寸。用**假的 computed style** 而不是真元素 ——
  jsdom 没有布局，量出来恒为 0，只有把声明直接交到读值那一步才能断言「声明 ↔ 画出来的路径」一一对应；

### 修复 · 第 20 轮审计整改：判据、竞态、单源收敛与门禁（2026-09-25）

- **判据假安全**：`isSyncProviderKind` 由 `in` 改 `hasOwnProperty` —— `in` 沿原型链判，对
  `'constructor'` / `'toString'` 这类外来字符串恒真，查表会拿到 `Object.prototype.constructor`
  而类型谓词同时声明它是 `{label: string}`；`detectMergedDuplicates` 由两两比对改为**按重复组收敛**
  —— 两两比对在 ≥3 个同指纹变体上可同时产出 a→b 与 b→c，而 b 自己也已被丢弃，映射终点是死 id，
  桥接层据此重定向乐谱槽位就指到不存在的和弦上；`setCharChord` 在槽位键不可解析时早退 ——
  原先 `current` 是 undefined、必不等于 `chordId`，「值未变」守卫当场失效，白推 `song.version`
  （渲染缓存键的维度）并标脏落盘，与 `removeCharChord` 的早退不对称；`percentScaleSerializer.read`
  补脏值兜底 —— `Number('')` 是 0、`Number('abc')` 是 NaN，两者都会直进布局算式与滑块；
- **竞态与门禁**：`audioPlayback.startScorePlayback` 的重入互斥抢到 `await ensureAudioReady()`
  **之前**（原先 `isScorePlaying` 到 await 之后才置真，引擎冷启动时连点两次会各自越过检查、
  各有 tick 循环共用模块级游标；同文件 `startChordSustain` 就是「先置位 → await → 复检」的正解）；
  `idbKv.applyRemoteKvUpdate` 跳过有未落盘写入的键（否则跨标签页回读覆盖内存镜像，随后 flush
  落盘的也是被覆盖后的值 —— 本地这次写入静默丢失；与 `flushNow` 的 `writeEpoch` 是同一件事的两半）；
  `songPersistence` 落盘失败后重挂**慢速**定时器（原先只把 id 退回脏集合，没有任何东西会再碰它们，
  用户此后不再编辑就只剩 `pagehide` 一次机会），`markSongRemoved` 自行标脏索引并排刷写
  （原先靠调用方额外配一次 `markIndexDirty`，纯约定）；
- **单源收敛**：`ControlSize` 改为 `ComponentSize` 的别名（原先同一个联合两个名字，加档位漏改一处
  即分叉）；新增 `CONTROL_MIN_HEIGHT_CLASSES`，模态与抽屉头部右侧不再各写一遍 `min-h-[1.6rem]`；
  `dropdownPanelHeight` 导出 `DROPDOWN_ITEM_GAP_CLASS` 并由它反推 `GAP_REM`（原先 TS 记数值、
  模板另写 `gap-0.5`）；`menuRowStyle` 导出 `MENU_COLOR_*`，主题菜单不再自己写 `var(...)` 字面量
  （那张 tint 表按字符串值查，两边各写一遍时改一处不会带着另一处改、查表静默落空）；
  A4 的 px 尺寸改引 `SCORE_EXPORT_CONFIG`（原先预设里写死 794/1123、回退分支读常量，同一对象里
  两种口径）；`theory.shared` 头注去掉已自持 `NOTES_*` 的 `pitch`；
  `PANEL_HALO.y` 保留实测值 44，注释改为说明「它不是 `--spacing-xl` 的换算结果（33.375）」；
- **协议与体积**：worker 的 `HEAD '*'` 通配会把 `/history`、`/meta`、`/auth-check` 的 HEAD 也按快照
  应答（Hono 不把 HEAD 交给 GET 路由），这三个端点显式登记为 405；载荷上限改用**字节**口径
  （原先 `payloadText.length` 是 UTF-16 码元数，中文下等于把闸门放宽到约 3 倍）；`transfer` 的
  token 判形补长度上限，并按「这次输入是不是明确冲着 token 来的」分流解不开的处置 —— 地址形态仍判
  `broken`，裸串回退纯文本（判形只有「≥32 + 字符集合规」，一行无空白的英文歌词完全落在这个形状里，
  原先一律判 broken 等于把用户的歌词整条吞掉、还告诉他「内容损坏」）；
- **无障碍与资源**：指板外层 `<svg role="img">` 改 `role="group"` —— `role="img"` 会让整棵子树按
  ARIA 变成 presentational，内层逐弦 `<g role="img" aria-label>` 的标签永远进不了无障碍树；
  `overlayStack` 改为保住**栈顶浮层的祖先链**（inert 沿子树生效，浮层经 `teleportTo` 挂进 body 的
  某个后代时，原先只放行 body 直接子元素的写法会把整个浮层一起 inert）；
  `useSectionScrollSpy` 记下 scrollend 挂在哪个元素、从**同一个**元素摘（原先摘除时现取
  `getScroller()`，容器重建后摘不掉、监听永久残留）；`useScoreLinesData` 的换歌清缓存改为**读时自检**
  （原先的 `watch` 绑在首个调用方的作用域上，那个组件被 KeepAlive 淘汰后单例仍在、清理永久停摆）；
  `vMarquee` 终点判据改用 `state.maskDist`（原先用闭包捕获的 `dist`，与同文件「几何必须存 state、
  不许闭包捕获」的约定直接冲突，容器变宽后右缘羽化静默消失）；
- **交互缺陷**：`BaseNumberInput` 的步进按钮补 `isEditing` 闸（编辑态点步进会被随后的 `commitInput()`
  用旧 `tempValue` 静默撤销，capo 档位即此形态）；`BaseSwitch` 的 `pointercancel` 复位
  `hasMovedSignificantly`（否则下一次真实点击被 `handleClick` 吞掉）；`BaseCheckbox` 的 readonly 分支
  复位原生 `checked`（`toggle()` 早退，但浏览器已把 DOM 翻过来，而 `:checked` 是属性绑定、状态没变
  不会重新 patch，两者长期背离）；`MenuItems` 的行 key 改为位次在前且带分隔符（原先 `label + index`
  裸拼，`{label:'x1',index:2}` 与 `{label:'x',index:12}` 撞键，而 `itemEls` 按 index 收集，
  键盘导航会 focus 到别的行）；`useTargetMenu` 的打开态按 `BaseMenu.openMenuAt` 的返回值校正
  （后者现在返回「是否真的打开」—— 被 `disabled` / 空 items 拒绝时，原先没有任何路径复位 `isOpen`）；
- **工装**：`verify.mjs` 头注的步骤清单补全为 9 步，并如实写明 bench 的基线**尚未入库**、哨兵实际
  未启用（原先称它「自 2026-09-24 起是真的回归哨兵」）；`bench.mjs` 打印的容差改为判定实际所用的
  `TOLERANCE`（原先打印 `baseline.tolerance`，照错的数去调），「基线里有、本次没跑到」的项改为
  **计失败**（原先只打印 —— 项被改名或删掉时这条哨兵静默失效，而基线仍显示覆盖它）。

### 修复 · 未水合即当事实的最后一处下游、滚动区观察者与旧存储索引（2026-09-25）

- `settingsStore` 的两处一次性数据迁移（Gitee 预设纠正、混响干湿比迁百分制）改为**等 kv 水合完成**
  再跑（新增 `afterKvHydrated`）：未水合时 `useStorage` 读到的全是**出厂默认值**（`kvGet` 一律
  返回 null，与「键不存在」不可区分），迁移既没做成、又会把「已执行」标记消费掉 ——
  标记一旦落盘，磁盘上真实的旧值（如 0~1 的 `reverbWet`）永不迁移。启动链路有超时兜底
  （`main.ts` 的 `Promise.race`），所以「store 初始化早于水合完成」是可达路径而非理论情况；
- `idbKv.hydrateIdbKv` 完成时**逐个派发 vueuse 存储事件**，把已存在的 `useStorage` ref 从默认值
  刷成磁盘值，再回调新增的 `onIdbKvHydrated`：跨标签页那条路径早有 `applyRemoteKvUpdate` 做同样
  的事（同一事件名、同一 `storageArea` 口径），本地水合这条一直缺 —— 少了它，超时窗口里创建的
  ref 会永远停在默认值，上面那条迁移的「等水合」也就只是把错误推迟了一次；
- `BaseScrollArea` 的三个观察器（容器尺寸 / 直接子元素尺寸 / 子节点增删）抽成 `bindObservers()`
  并随 `tag` 变化重挂：根元素是 `<component :is="tag">`，换标签会换掉真实 DOM 节点，而观察器绑的是
  元素本身 —— 原先既不观察新节点、也不断开旧节点（旧节点上留着悬挂观察器，新节点上的尺寸变化
  从此无人响应）；
- `migrateLegacy` 的 `SONGS_INDEX` 由「预置进必删名单」改为**条件删除**：只有没有待人工修复的歌曲
  分片时才删。分片是**内容**、索引是**次序**，把待修复的歌留下却无条件删掉描述其次序的索引，
  人工修复时那份次序就没了 —— 与上方三条 `consumedKeys.add` 同一口径（按「信息是否真的进了 IDB」
  判，不按「键名属于谁」判）；
- `BaseSegmentedControl` 的全项禁用行为补上口径说明（整组不可聚焦是**有意保持**的，让禁用项可聚焦
  反而错；业务该用组件的 `disabled` 表达「整组不可用」，它会同时关掉指示器与整组交互）。

### 修复 · 文本协议的自由文本字段补转义，分组名与歌名可原样往返（2026-09-25）

- 现象（`chordTextCodec.ts:251,270-277`、`textCodec.ts:258-262`）：`NAME:`（分组）与
  `TITLE:` / `SINGER:` / `ORIGKEY:`（乐谱）都是「一行一个字段」的**行内嵌入值**，此前不做任何转义 ——
  值里含换行会把一行拆成两行：轻则回读必失败（`INVALID_NAME` / `INVALID_FIELD`），重则被解析成
  伪造的段（名字里塞 `\nCHORDS:` 就能凭空造出一个和弦段）；
- 修法：新增 `escapeFieldValue` / `unescapeFieldValue`（`chordTextCodec.ts`，乐谱侧复用同一份），
  转义集是 `\` / 换行 / 回车三个 —— **反斜杠必须一起转义**（只转义换行的话，值里本来就有的 `\n`
  这两个字符回读时会被当成换行，往返不再保真，且歧义无法在解析侧消除）；回车一并转义（解析侧只剥
  **行尾**的 `\r`，值中间的裸回车会原样留在导出文本里）。`TS:` / `PLAYKEY:` / `CAPO:` 不转义
  —— 它们是枚举与数字，值域受限；
- 与歌词行那套 `escapeLyricsLine` 刻意分开：那套是**行首前缀式**、针对「整行恰好像段标记」，
  这套针对**行内嵌入的值**，两者不可互换也不合并；
- 兼容口径（**一律反转义**）：只认 `\\` / `\n` / `\r` 三个序列，其余 `\x`（含末尾孤立的 `\`）
  原样保留 —— 这样**转义引入之前**导出的文本里含反斜杠的值（如 `C\E`）不会被吃掉一个字符。
  代价如实说：旧文本里恰好含 `\n` / `\r` / `\\` 这三种组合的（如字面 `C\nD`）仍会被误解成转义序列，
  这是不做协议版本协商换来的最小代价；
- 协议版本号**不动**：值里不含这三个字符时输出与改动前逐字节相同，故新旧互读照旧
  （含特殊字符的名字在旧版本里本来就解析失败，升版本反而要把旧文本判成 `INVALID_HEADER`）；
- 测试：`chordTextCodec.test.ts` / `textCodec.test.ts` 各补一条往返用例（含换行 / 回车 / 反斜杠 /
  字面 `\n` / 尾部孤立反斜杠），并断言「转义后仍是单行」与「注入形态回读后仍只是一个名字 / 标题、
  不多出段」。往返用例已用反向探针确认有牙（把分组序列化的转义去掉 → 该例变红）。

### 修复 · 浮层箭头补上主题那圈发丝边：本体两道边而箭头只有一道（2026-09-25）

- **现象**：暗色 / 高对比主题下，提示气泡 **本体**看起来有两道边（外一道浅、内一道深），
  **箭头**只有一道。亮色主题下没有这个差别。
- **根因不在剪影，而在主题令牌**：暗色与高对比的每一档 `--shadow-*` 末尾都带一条**纯扩散**的阴影
  （`{ x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.06 }`，见 `tokens/themes/dark.ts`
  的「阴影：黑色投影 + 一圈极淡白描边（深底上靠描边分层，纯投影读不出来）」；高对比档 α 到
  0.18~0.22，更明显；亮色档全部是纯投影、没有这条）。它等于**紧贴 border-box 外侧的一圈 1px 描边**，
  于是本体 = CSS `border` + 这圈环两道；而剪影只复刻了 `background-color` / `border-*` /
  `border-radius`，没复刻 `box-shadow` —— **环是 box-shadow，只跟着宿主的矩形走，永远不会绕到
  楔形上**，箭头因此少一道。
- **修法只能是让剪影也复刻它**（而不是去掉主题那圈环）：环是主题有意的分层手段，去掉它要改
  `--shadow-*`，会同时改掉模态 / 抽屉 / 菜单等所有浮层；而剪影的职责本来就是「把宿主的整份外观
  画成带箭头的形状」，漏了 box-shadow 属于复刻不全。
  - `arrowPanel.ts` 新增 `ArrowPanelRim` 与 `rimOf()`：从 `box-shadow` 里挑出**纯扩散**的那一圈。
    判定刻意严格 —— 只认「offset 与 blur 都是 0、只有 spread > 0」，有偏移或模糊的是投影（照它
    扩出去是一圈糊边，复刻比不复刻更错），`inset` 打在盒内侧、与轮廓无关，多条符合取最大的一圈，
    全透明的视同没有。分条用 `splitTopLevel`：`rgba(255, 255, 255, 0.06)` 自带逗号，朴素 `split`
    会把一条阴影切成几段、整条被丢掉，环静默消失；
  - `ArrowPanelPaths` 多一条 `rim`（**必填**：漏传时类型直接报错，而不是静默少一层）。绘制序
    填充 → 环 → 轮廓（DOM 序即绘制序）：环必须压在填充之上 —— 贴着楔形底边的那一段会被填充
    （往面板内多伸 `overlap` 的一整块）压掉，得由它自己盖回来；
  - 环的几何 = 把整条轮廓（含楔形）**外挪 `spread / 2`** 再以 `spread` 描边：描边内外沿正好落在
    「border-box」与「border-box 外扩 spread」上，本体那一圈与它**逐像素重合**（不会冒出第三道
    边），而楔形也因此有了环。圆角跟着 `+spread/2`（`box-shadow` 的 spread 本来就会把圆角一起
    放大），否则四角会与本体的环错开；
  - **最容易写错的一处是口径**：三个参数里只有方框与 `radius` 要外扩，`rise` 与 `arrowRadius`
    保持原值 —— `radius` 是 CSS `border-radius`，量的是**描边外沿**（要 +drift）；而 `rise` /
    `arrowRadius` 是轮廓**骨架**自身的量，骨架到描边外沿的那一格由轮廓那条 path 的内缩抵掉。
    给它们也加外扩量，环的内沿会离箭尖差 0.324px（实测），箭尖外侧就露出一道缝；
- 环也抄宿主的 `box-shadow` 过渡（换色时与本体同速同曲线，与 fill / stroke 同一口径）；
  亮色主题取不到环，这条 path 就不画任何东西（`d` 为空、`stroke: none`），观感与改动前一致；
- `tests/platform/arrowPanel.test.ts` 增加 2 例：① `rimOf` 的取形口径 —— `none` / 投影（有偏移）/
  有模糊 / `spread: 0` / `inset` 五种都取不到，暗色实形（颜色自带逗号）取到
  `{ width: 1, color: 'rgba(255, 255, 255, 0.06)' }`，多条取最大、全透明视同没有；② 绘制 —— 有环时
  填充与轮廓两条路径与无环时**逐字相同**（本体上不能冒出第三道边）、环的 `transform` 是
  `translate(-0.5 -0.5)`、`stroke-width` = spread、圆角 = 面板圆角 + spread/2，且**环的内沿正好落在
  轮廓外沿上**（尖角楔形下量得准 —— 圆角形态的极值落在弧上、不在坐标里）。已用反向探针确认有牙
  （把 `arrowRadius` 也加外扩量 → 该例立即变红，差值 0.324）。

### 修复 · 发丝边与本体在楔形两翼上**左右不等距**：左侧离出一条缝、右侧压在描边上（2026-09-25）

- **现象**：补上发丝边之后，环在楔形上是**斜的** —— 左翼与本体之间空出一条深色的缝，右翼则紧贴
  甚至压进描边里。把截图放大到约 7 倍量：左翼「环 → 缝 → 描边」三带分明，缝约 4px；右翼是一条
  连成一片的带（环被描边盖掉了一半）。镜像求差直接指到左翼那一条线上（最大差 18/255）。
- **根因是那一格平移被楔形跟着吃了**：环的几何是「帧的宽高各外扩 `spread`」再整体
  `translate(-spread/2, -spread/2)` 挪回来 —— 这对方框是**必须**的（不然环整体偏在一边），
  但楔形的**沿轴位置是绝对量**：箭头指向锚点，跟着帧一起平移就整条左偏 `spread/2`。
  后果按两侧反号：左翼的环被推远 `0.354px`（垂直向），环带落在 `[0.914, 1.914]`，与描边外沿
  `0.5` 之间留出 `0.414px` 的缝；右翼反过来被推近，环带 `[0.207, 1.207]` 与描边重叠 `0.293px`
  —— 重叠处由描边（实色）盖住，看起来就是「右翼的环细了一半」。水平向合计约 `0.9px` 的不对称，
  7 倍放大下正是那条 4px 的缝。
- **修法**：给环那条 path 传 `center + drift`（`arrowPanel.ts` 里 `paintArrowPanel` 的环分支），
  把楔形的沿轴锚点补回平移量。**缺省 `center` 不用补** —— 「取该边中点」是**帧相对量**，环的帧
  两侧同样外扩、又同样偏移，恰好自己抵消。这也正是既有 3 例环测试都没拦住它的原因：`draw()`
  走的就是缺省中点那条路。
- `tests/platform/arrowPanel.test.ts` 增加第 3 例**同轴不变量**：显式给 `center` 画一次，量「环的
  楔形轴」与「本体的楔形轴」是否重合。量的是**画出来的位置**（把 `d` 里 `y < 0` 的落点取两侧最外
  再取中，并**并入 `transform` 的平移** —— 只看 `d` 会把帧的补偿误判成楔形偏了，这一点自己也踩过
  一次：只看 `d` 时环读出 60.5、本体 60）。先断言楔形落点 ≥ 4 个，保证判据不是空集。
- **同类但未动的第二处（留给后续）**：环的两处**底角**刀口是**凹角**，向外偏移 `d` 时应是**同心**
  弧、半径 `R - d`；而环的几何是拿外扩后的楔形**重跑同一套 `fillet()`**，于是弧心比同心位置远了
  约 `d`、半径却仍是 `R` —— 底角附近环的内沿因此比描边外沿再远约 `0.5px`。箭尖是凸角、方向相反
  （`R + d`），而它恰好被 `rise` 不外扩的口径抵消掉了，所以箭尖是齐的。要修得让几何层能分别给
  「底角半径」与「箭尖半径」两个值，属接口变更，本次不动。

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

### 修复 · 强调色底上的文字全域收口，并补上缺失的「实心档 + 浅色字」令牌（2026-09-24）

- **根因是令牌档位缺失，不是某个组件选错了颜色**：全集里只有 `--text-on-accent` 一支「强调色上的字」，
  而它被对比度门禁锁死为深墨（断言「四种底全过 AA」）—— 于是任何实心强调色底都只能落深墨，而深墨压饱和色
  正是「对比度过高」的眩光来源。白字落现有四色实测为亮色 primary 4.02 / danger 3.55 / success 2.22 /
  warning 2.20、暗色 3.65 / 3.41 / 2.02 / 1.41，绿与橙连大字下限 3:1 都保不住；深墨则分别为
  5.23 / 5.92 / 9.46 / 9.55 与 5.76 / 6.16 / 10.39 / 14.88，四色全过 AA 正文线。`--fb-dot-text`
  与 `--switch-thumb-bg` 的白色各服务指板圆点与滑块把手，底不同、借不过来；压深族 `--shade-*` 也救不了 ——
  它只存在 `-12` 一档，白字落其上 success 2.85 / warning 2.83，仍远不达标。据此本轮 `--text-on-accent`
  在亮色与暗色主题下改为深墨（高对比主题原本就是深墨）；
- 指板音符圆点上的字色**拆出独立令牌** `--fb-dot-text`：圆点底是饱和蓝，与强调色的取档方向相反
  （亮色主题的圆点较暗，白字 5.17:1 优于黑字 4.06:1；暗色与高对比的圆点是中性蓝，黑字 5.71:1 优于白字
  3.68:1）。两种底此前共用一个令牌、只能顾一头 —— 若只把该令牌改深，指板音符反而会从达标掉到不达标。
  亮色主题的根音圆点字色 `--fb-root-text` 同理由暖白改深墨：圆点底是暖橙（`--color-warning`），暖白在其上
  只有 2.07:1，深墨 5.90:1 —— 与暗色 / 高对比取同值（同一底色、同一最优墨色）；
- 新增 **`--text-on-solid`**（三主题皆白；与 `--text-on-accent` 是「同一族底、相反方向的两支墨」），
  并在 `@theme` 转发为 `--color-fg-on-solid`。`--text-on-accent` 及其门禁**未动**。同时新增门禁断言：
  在强调色实心底上，深墨的比值必须高于浅墨 —— 锁住两支的方向，防互换、防塌成同值；比值由 culori 现算、
  不写死色值。**该断言刻意不承诺浅墨过 AA**（浅墨是降眩光取向），本令牌的授权范围改由「底必须是实心档」
  来把关 —— 本批随后补上了实心档（见文末「实心档」一节），授权随之从「非文本图形且底为 `primary`」改为
  「底为 `--color-<族>-solid`」，并由测试常驻执行；
- **各站点退出实心底，改走项目既有的选中态写法** `bg-tint-primary-88` + `text-primary`（`BaseDropdownItem`
  的 `ACTIVE_CLASS`、`MenuRow`、`WorkbenchVariantsPanel`、`SongCard` 都是这一套，所以这不是新造形态，
  而是回到惯例）：和弦卡片的指法角标由 `filled` 改 `subtle`（选没选中已由卡片自身的描边与蓝色和弦名表达，
  计数器不必再承载强调色语义，未选中态不变）；和弦分析的候选和弦片改为常挂 `subtle`、只切 `variant`；
  指板横按气泡的「已标记」态由 `border-primary bg-primary` 改为 `border-primary bg-tint-primary-88`，
  未标记态的 hover 由 `-88` 让到 `-92` 以免两态在同一档撞色。箭头必须同源：`useBarreBubble.ts` 按面板取色
  复刻（楔形斜边与面板描边不同色会在接缝处阶跃变色），故已标记的 hover 档 `-82` 也一并写入；
- 其余站点一并收口：`buttonThemes.ts` 的 `default` 档四个语义色补齐为浅底，其悬停档按各家族实有档位取
  （`TINT_SCALES.primary` 没有 78、`success` 只有 `20 / 82 / 88`，故分别落到 `-80` 与 `-82`）。
  顺带查明 `ActionButton` 的 `variant` / `color` 默认值都是 `default`（即中性底），而全项目 5 处
  `color="primary"` 都显式带了 `ghost` 或 `subtle`、`color="success"` 一处没有 —— 即 primary / success
  的实心档**并无渲染路径**，本轮仍按口径补齐，只为消掉「后续调用方一填就踩」的陷阱；
  根音徽章（`ChordAnalysisPanel`）单独取 `outline` 而非 `subtle`，因为它所在行自身已是
  `bg-tint-warning-90`、同档浅底会糊进行底，`outline` 靠描边加同色前景立住；输入框清空按钮的 hover
  由 `bg-danger` 改为 `bg-tint-danger-88` + `text-danger`；
- `BaseCheckbox` 勾选态回到 `bg-<色>-solid text-fg-on-solid`（勾选必须一眼可辨，浅底浅勾与未选中态同属
  浅色系、会糊在一起；底色为什么必须是实心档而不是常规强调色，见文末「实心档」一节），并**顺带修掉一处
  独立缺陷**：原先只有未选中态带 `border` 宽度类，选中态只写 `border-<色>`（只是颜色）而宽度为 0，
  比未选中态少一圈、显得发平 —— 现两态都带。本组件全项目无一处传 `color`，故实际只走默认 `primary`；
- `BaseBadge` 的四个 `filled` 档由 `text-fg-on-accent` 改为 `text-fg-on-solid`（实心底配浅字，
  这才是 `filled` 的完整含义），底色同步换成实心档；`warning` 是唯一例外，改配 `text-fg-on-accent`
  深墨（它没有实心档）。`BaseSwitch` 的 `checked-text` 插槽**改回** `text-fg-on-accent` ——
  本轮一度跟着换成浅色字，但它的轨道是**常规**强调色实心底、不在实心档的授权范围内，
  只得退回深墨（该插槽全项目仍无调用点）；
- 刻意未动一处：`BaseSwitch` 轨道必须保持饱和才能表达开 / 关，且其关闭底色与描边同色、没有有意义的描边色
  可取；`BaseBadge.filled` 是「实心底」这一档的原始定义，其强调色档调用方已全部改走 `subtle`，
  保留原义可避免 `filled` 与 `subtle` 塌成同一档；
- 上述令牌与落底的门禁同时由「正文色 × 落底」扩为四组（另加「强调色上的文字」「指板圆点上的文字」
  与「实心档上的浅色字」），比值一律由 culori 算出、改回旧值即失败；
- 代价如实记下：指法角标改 `subtle` 后蓝字落浅蓝底约 3.4:1，低于 AA 4.5（原黑字落蓝底 5.23:1）。
  这枚 `2xs` 角标一直不是文字对比度的承载点 —— 未选中态的 `text-fg-disabled` 落白底只有约 1.7:1，
  语义另有 `aria-label` / `title` 兜底，故此处以「不出现视觉故障」优先于那 1.8 的比值。

### 优化 · 基础组件补齐静止描边，并修掉徽章描边被基类压掉的老问题（2026-09-24）

- 口径：**只给「浅底、且直接坐在页面或面板背景之上」的组件补 1px 发丝描边**；描边统一取
  `border-border-light`（项目既有的静止描边档 —— `BaseInput` / `BaseSelector` / `BaseTextarea` /
  `BaseNumberInput` / `SegmentedControl` 胶囊都在用），交互态提到 `border-border-base`；
- `BaseBadge`：5 个 `subtle` 档由 `border-transparent` 改为 `border-border-light`（中性档加四个语义色档）。
  底色是 tint 时没有描边就只剩一块无界色斑，落在同色系的行底与卡片上尤其糊（候选片、歌手段、分组计数）。
  `filled` 实底档保持不描边 —— 饱和底自身即边界，再描一圈只会像脏边；
- **改完发现描边还是不出现，由此挖出一个一直没生效的老问题**：徽章的基类自带 `border-transparent`，而 Tailwind
  把**未加变体**的 border-color 工具类按色名排序输出，`transparent` 落在 `t` 位 —— 于是 `.border-border-light`
  / `.border-border-base` / `.border-primary` / `.border-success` / `.border-danger` **全都排在它之前而被它压掉**
  （只有 `warning` 恰好在 `w` 位、排在它之后才幸免）。也就是说改动前**本组件的 `outline` 档彩色描边一直是死的**
  （`DevPanel` 的容量徽章、`GroupSection` 的展开态徽章都在用），`neutral.filled` 的 `border-border-light`
  也从未生效过。修法是**把基类里的 `border-transparent` 删掉**（`border` 宽度保留），色值只由外观映射一处提供 ——
  15 个档全都自带色值，不会回落到 `currentColor`。带 `hover:` / `focus-within:` / `active:` 前缀的变体输出在
  同名未变体工具类之后，故 `ScoreInteractiveArea` 那种「透明底、hover 才出描边」的写法不受影响；
- `buttonThemes.ts`：`default` 档的四个语义色由 `border-transparent` 改为 `border-border-light`；
- `BaseSegmentedControl` 的 `text` 形态选中段：容器是无底的 `bg-transparent`，选中块补发丝描边；
- `Feedback` 的 lg 图标圆底：`bg-surface-panel-hover` 补发丝描边；
- `BaseSlider`：修正文档与实现不符 —— prop 注释写「默认 true」，实现却是 `false`，已按文档校正为 `true`。
  当前 7 个消费方本就全都显式传了 `bordered`，故本次**零视觉变化**，只是不再让下一个调用方拿到无描边胶囊；
- `BaseCollapse` 折叠头**补过又撤除**：它自带面板底色且常驻吸附，再叠一层描边会与吸附态一起显得分层过重；
- 顺带把「同一元素上出现两个未加变体的 border-color」这一模式全项目自查了一遍：**除徽章外没有第二处** ——
  其余站点要么是互斥三元，要么落在带 `hover:` / `focus-within:` / `active:` 前缀的变体里（变体输出在未变体之后，
  不受影响），要么是带 `!` 的强调档。色名顺序恰好使「基类 `border-*` + 条件 `border-primary`」这类写法落在
  安全方向（`border-light` / `border-base` / `primary` / `success` / `danger` 都排在 `transparent` 之前，
  即先输出、后被条件色覆盖）；能反向压掉别人的只有排在末尾的 `transparent` 与 `warning`，而徽章是唯一实例；
- 刻意未加，逐类说明：**纯布局或本身无底色**（`BaseForm`、`BaseFormRow`、`BaseIcon`、`BaseDivider`、
  `BaseRollingText`、`BaseScrollArea`）；**已处在有描边浮层之内的行与片**（`MenuRow`、`BaseDropdownItem`、
  `MenuItems` / `MenuSubmenu` —— 面板描边由 `BasePopover` 的 `border-glass-border` 提供，再叠一层会成嵌套方框）；
  **本就有描边**（`BaseInput` / `BaseTextarea` / `BaseNumberInput` / `BaseSelector` / `BaseDrawer` / `BaseModal` /
  `BasePopover` / `BaseFab` / `BaseFloatingPill` / `BaseFloatingPanel` / `GlobalNotification` / `Feedback` 的
  `bordered` 档）；**以无底为形态的透明底变体**（按钮的 `ghost` 与 `text` 档）。`BaseSwitch` 轨道也不加：
  其底分别是 `--border-base`（关）与强调色（开），前者与描边同色、后者自身即边界，没有有意义的描边色可取。

### 优化 · 颜色令牌补三道结构守卫，次级文字色修正到 WCAG AA 达标（2026-09-24）

- 亮色的 `--text-muted` 压深一档：旧值 `#6b6b70` 在 `--bg-panel-hover` 上只有 4.46:1 —— 原注释是照 `--bg-main`
  推的「最坏落底」，而本主题里最深的文字落底其实是面板悬停底，于是差 0.04 没到 WCAG AA 4.5。现取在其上 4.52:1 的最浅一档
  `#6a6a6f`，四档层次与 systemGray 家族的色偏（b − r = 5）不变；
- 新增对比度门禁：三档正文色 × 七种背景落底逐一算 WCAG 比值（由 culori 计算，不手抄字面量），越线即失败 —— 把原先只写在 light
  / dark 注释里的「按 AA 反推」变成可执行断言。`--text-disabled` 按 WCAG 1.4.3 对失效控件的豁免不入列；
- 新增 `@theme` 转发守卫：每条颜色转发必须指向真实存在的令牌（指向落空时工具类算空值、元素静默回落继承色），且 tint /
  shade 族按族名整族对账 —— 顺带补上此前漏转发的
  `--tint-texttitle-90`。tailwind.css 注释里记的「曾因此漏掉 5 处」正是同一失效形态；
- 新增三主题键集守卫：`:root` 是继承基底、不许有洞；dark 与 HC 的覆盖范围改为显式白名单（`--switch-thumb-*` /
  `--export-*` 只在 `:root` 声明、另两主题继承同值；`--fb-barre-rgb`
  在 HC 刻意缺档以回落明色档）。这套继承此前只靠注释维系，漏一个主题就会静默取到别的主题的值，肉眼极难发现；
- 删除零引用的
  `--color-danger-rgb`（三主题各一条）：全仓没有「danger 色带 alpha」的投影消费方，留着只会让「改主题时要不要同步它」变成每次都要重新判断的假问题。

### 修复 · 审计整改：数据安全与持久化（2026-09-24）

- **迁移的源键删除判据由「按前缀」改为「逐条落库」，歌曲分片再细分到「按字节是否可用」**（`migrateLegacy.ts`）：
  原判据是 `consumedKeys.has(key) || key.startsWith(SONG_ENTRY_PREFIX)`，于是歌曲分片**按前缀无条件删** ——
  而 `parseJson` 失败的分片从未进 `rawSongs`、被宽容清洗丢弃的分片也没进落库结果，两者都还是用户的唯一副本，
  删掉即单首歌级不可逆丢失。守门的 `verifyEntitiesPersisted` 只看总数与主键清单：`hasEntityData` 为假时
  `entityCounts` 全零 ⇒ `0 < 0` 为假、空数组的 `every` 恒真 ⇒ **恒过**。
  - 新增模块级 `recordsPersisted(records, persistedIds, normalize)`，主键（`GROUPS` / `CHORD_LIST` / `SONGS`）
    改为「它承载的记录逐条已进 IDB」才可删（同一行 `consumedKeys.add` 循环里三处同缺陷）。
  - 歌曲分片**不再一律删**，改按两类未转录的**丢失代价**分流：`parseJson` 拿不到对象者（字节写坏 / 被截断）
    本就不可用，随退役一并清除；**能解析出对象却没进 IDB 者**（如缺 `title` 过不了 `songGateSchema`、
    或 id 归一后没落库）**保留源键** —— 字段可补，源键是这首歌内容在本地的唯一副本。留下的代价如实说：
    退役标记已落，运行时与下次启动都不再回读 localStorage，只能由人在 devtools 里读出补齐后重新导入。
    两条 `logger.warn` 分开记名（两者的可挽救性正相反），旧版合成一条「未能转录」正是最容易误导人的地方。
  - 判据：**「源键可删」必须逐条核验，不能看总数** —— 清洗会静默减少 expected，总数核验在丢弃场景下与
    「全部成功」等价；且**判据要取「字节是否可用」而非「是否转录成功」**，两者的可挽救性正相反。
- **被驱逐但仍展示的预览条目不再被整批回收**（`scorePreviewCache.ts`）：`orphanedHeld`（WeakSet）只在
  `setCurrentRender` 摘除，而 `touchEntry` 的 else 分支走 `registerEntry` 重新入账时不摘 ⇒ 下次换展示项时
  把一条**仍在缓存里**的完整条目 `revokeEntry`，回来时 `getCachedRender` + `isComplete` 判可信、直接铺死链。
  `registerEntry` 里 `cache.set` 之后补 `orphanedHeld.delete(data)`：入账即摘标记，真正离场时仍照常回收，
  不漏 object URL。
- **IDB 键值水合窗口内的写入不再被抹掉**（`idbKv.ts`）：`hydrateIdbKv` 在 `await idb.getAll` 之后
  `memory.clear()`，窗口期的写入（本页 `kvSet` 或跨标签页 `applyRemoteKvUpdate`）被整片抹掉；更糟的是这些键
  仍在 `dirtyKeys` 里，排在后面的微批 flush 见 `memory.get(key) === undefined` 走删除分支 ⇒ **一次写入被读成
  一次删除**。改为水合前按 `dirtyKeys` 快照内存、回读后覆盖回去（判据取 `dirtyKeys` 而非整份 memory：它是
  「已写未落盘」的键集，启动首轮为空，故正常启动仍是纯 IDB 真相，只有窗口期真发生过写入才覆盖回来）；
  新增 `removedKeys`，`flushNow` 只对**显式删除**（`kvRemove` 记的）执行 IDB delete，`memory` 里没有但并非
  显式删除的键只从脏集合摘掉。
  - 连带修 `App.vue` 的首访判定：`kvGet` 在水合前返回 null、与「键不存在」不可区分，而启动链路的 8s 超时
    兜底（`main.ts` 的 `Promise.race`）会照样 mount ⇒ 老用户被判成首访。改为 `isIdbKvHydrated() && !kvGet(…)`，
    方向取保守（宁可新用户晚一次看到引导）。
- **两条「永不下岗的迁移」补一次性标记**（`settingsStore.ts`）：Gitee 预设纠正的判据 `branch === 'master'`
  与用户的合法取值重合（Gitee 仓库默认分支就是 master，且与 `transfer.ts` 的 `defaultOnEmpty: 'master'`
  对撞）；音频混响干湿比的 `< 2 → ×100` 写在**读序列化器**里，于是每次读取都迁一次。两条各配一次性标记
  （`STORAGE_KEYS.GITEE_PRESET_MIGRATED` / `AUDIO_WET_SCALE_MIGRATED`），序列化器回归纯函数。
  - 判据：**迁移判据只要与用户的合法取值集合有交集，就必须配一次性标记**；读 / 写序列化器里绝不能放迁移。
- **IDB 自愈补上索引维度**（`idb.ts`）：原自愈只看缺不缺 store，于是「库已是当前版本却少一个索引」的库永远
  缺着，按该索引查询恒空（静默返回错数据）。抽出 `findSchemaDrift(db)`（缺 store **或** 缺 SCHEMA 声明的索引
  都算漂移）与 `readIndexNames(db, storeName, wanted)`（`IDBDatabase` 不暴露索引，须经一次只读事务取对象库读
  `indexNames`；探测失败回退成「齐全」，否则每次开库都 bump 一次版本）。
  - 判据：**`onupgradeneeded` 只在版本变化时触发** ⇒ 任何「SCHEMA 与磁盘库对齐」的判据都必须把 store 与索引
    都算上。
- **`chordStore` 删除路径与水合竞态四条**：①`hydrate` 在 `await loadSnapshot()` 后**复查 `hydrated`**，
  而非看「列表是否非空」—— 窗口期若已被 `replaceAllData` 接管，用户交出的可以是空库（清空后恢复），按长度判
  会把磁盘旧内容灌回，顺带覆盖「`hydrate` 并发调用两次」；②新增 `commitDeletion()`（`markDataDeleted()` +
  `void persistAll()` + `void flushIdbKv()`），三处删除路径（`removeChordsSnapshot` / `deleteGroup` 空分组
  分支 / `moveVariantsByName`）统一走它 —— 原来 kv 微批 50ms、实体防抖 400ms，删除后有约 350ms 的
  「水位线已抬、实体还在」窗口，强退后 `meta.updatedAt` 偏新；③`deleteGroup` **先摘分组再删名下和弦**，
  空分组时补一次 `commitDeletion`（`removeChordsSnapshot` 在空列表时提前返回，会留下「和弦已删、分组还在」
  的中间态）；④`registerExitFlusher` 的注销函数不再丢弃，收进 `unregisterExitFlusher` 并
  `onScopeDispose(unregisterExitFlusher)`（注册表是模块级 Set，实例化一次多一条且永不回收；`songStore.ts`
  同一处同款修复）。
- `migrateLegacy.ts` 注释纠错：原文说「熔断期 remove 静默失效」，而 `flushNow` 的 delete 分支刻意不在熔断守卫内
  （删除是用户腾空间的唯一手段），注释与代码位置正好相反。

### 修复 · 审计整改：乐谱预览（2026-09-24）

- **渲染缓存键补上槽位位置维度**（`scoreRenderCacheKey.ts`）：`buildChordRefSignatures` 在 `sort()` 前只收
  「这批和弦长什么样」，于是同一对和弦在第 0 / 第 1 个字符槽位上对调后键不变 —— 而那是「和弦名画在哪个字
  上方」的差别。签名改为 `行id:槽位=c/s/e+下标=指纹:横按签名`。
  - 判据：**乐观锁版本号（`song.version`）是兜底，不是某个维度的凭据**；键里少一维就要单独补上，别靠它顶。
  - 连带按 AGENTS §7.2 改测试：`tests/ui/scoreRenderCacheKey.test.ts` 原有用例「槽位顺序不影响渲染结果」
    把 `slotsOf('c2','c1')` 判成与 `slotsOf('c1','c2')` 同键，等于把 bug 当成了规格；拆成「chordMap **插入
    顺序**不进键」（这条是真的）与「槽位**下标**必须进键」两条。同文件另补一例带真实 `chordLookup` 的用例 ——
    此前全部用例都传空 Map，横按签名分支从未被执行，正是模块头点名的事故所在。
- **纸张档位不再有两条来源**（`scoreExportActions.ts`）：`getA4Blobs` 改为回传 `{ blobs, pageSize }` ——
  命中缓存时档位来自条目、回退重渲染时来自实时设置，**由生产者把「产物实际用的参数」一并交回**，调用方不再
  各自去读 `currentRenderData` 或实时设置去猜其中一支。PDF 的 MediaBox 与打印纸张都改用这个返回值。
  - 判据：**产物与产物的参数必须同源回传**；任何「调用方按另一条路径推算参数」的写法在分支不一致时必错。
- **预览渲染态不再卡死**（`ScorePreviewPane.vue`）：抽出 `resetRenderState()`（`streamTotal` / `isRendering` /
  `isPreviewRendering` / 更新中提示一起复位），`generate` 的 `finally` 与「无内容可渲染」的早退共用它。
  `invalidateInFlightRender` 换代 token 后旧轮的 `finally` 刻意不复位，早退就必须自己收干净；同类第二处
  `adoptCachedRender` 只清 `isRendering` 不清 `isPreviewRendering`（命中缓存早退绕开 `finally`），一并补上 ——
  `isPreviewRendering` 是顶栏禁用导出按钮的共享标志，两者必须**同进同出**。
  - 判据：**`generate` 里任何在 `try/finally` 之前的早退都不会复位渲染态**。
- `ScorePreviewPane.vue:172` 注释声称「模块级」实为实例级 → 改注释而非改代码：搬进普通 `<script>` 块确实能变
  模块级，但该块内容先于 `<script setup>` 的 import，会触发 `import/first`（实测 27 个 error）。按「实例级
  足够」写清：要覆盖的场景是模板内 `v-if` 重挂载（不重跑 setup），整体卸载再挂载时丢记忆反而自愈。

### 修复 · 审计整改：乐理与识别（2026-09-24）

- **和弦图分析的绝对层缓存键补上八度**（`chordEngine.ts`）：键串原本只有 `弦号_音级_音名`，而
  `collectNoteContext` 的 `pitchOf` 已改按 `midi` 取最低音 ⇒ 同一形状在 `fretOffset` 0 与 12 下键串逐字相同、
  最低音却是 G2 与 D3（正确读法 `G` / `G/D`）。键串拼进 `n.midi ?? -1`。
- **搜小七不再命中大七**（`chordSearch.ts`）：审计点到的是 `:84` 的 `maj → m` 别名，**实际根因更深** ——
  `collectChordAliases` 把简写名一律 `.toLowerCase()` 折进同一档，`CM7`（maj7 的简写）折成 `cm7` 后与 Cm7
  同键，故删掉那行别名并不足以修好。改为别名分两档：`loose`（全小写，容忍 `cmaj7` 搜到 `Cmaj7`）与
  `strict`（含大写 `M` 的简写只按原大小写比对），`matchChordSearch` 两轮匹配；查询词用 `capitalizeRoot`
  把根音首字母统一大写、其余不折叠（保住 `cM7` 这种「小写根音 + 大写 M」的容错）。
  - 判据：**搜索别名一旦折叠大小写，`M` / `m` 承载的语义就被抹掉** —— 与 `chordQualityAst` 的
    `canFoldToLower`（折叠键已被别的 token 占用就拒绝折叠）是同一条原则，只是那边在解析层、这边在搜索层。
  - 测试：`tests/domain/chordSearch.test.ts` 原本断言搜 `cm7` 命中 Cmaj7（把 bug 当规格），按 §7.2 改测试，
    并新增「小七与大七互不误命中」。
- **移调不再一律输出升号**（`transpose.ts`）：`Eb` 即使移调 0 个半音也变成 `D#`，调名（`computeSongKey`）与
  歌内和弦名都露在界面上。抽出 `spellPitch(pitch, sourceLabel)`：原写法带降号即续用降号，不带升降号时按
  `getDefaultPreferFlatForPitch` 定；顺带把 `transposeRootSegment` 里裸写的 `newPitch === 10 || 3 || 8`
  换成同一个函数（行为等价，那三个值正是表里为 true 的三个）。
- **音级 8 的拼写由 `G#` 改 `Ab`**（`pitch.ts`）：方向由三处独立证据定 —— `KEY_OPTIONS` 用 `Ab`、
  `chordEngine.getPreferredRootLabel` 在非小调根音给 `Ab`、`transposeRootSegment` 的裸值三元组也把 8 归
  降号侧。`tests/domain/theory.test.ts` 相应把 8 从升号组挪到降号组。
- **扩展音判等与归一化同口径**（`chordDegree.ts`）：`${d}:${a}` → `${d}:${a ?? 0}`，与
  `normalizeChord.areSegmentsEqual` 对齐。`[9]` 与 `[9,0]` 是同一个音，此前拼成 `9:undefined` / `9:0`
  被判为不等价 ⇒ 同和弦的两份等义分片被判成不同和弦。
- 注释与前提纠错三处：①`chordQualityAstParse.ts:25-30` 把「反斜杠低音前缀 → 半角」算作已收敛，而全仓
  （含旧 `toChordNameKey`）都没有任何 `\` → `/` 归一，`C\E` 根本不支持；②`chordSearch.ts` 称两处「同口径」
  过强，收紧为「与 `bassByPitch=true` 同口径，`false` 分支靠空弦音高随弦序单调递增退化」；③
  `scoreEditorStore.ts:276` 原写「`transposeChordName` 一律输出升号（`Eb` → `D#`）」，该前提已不成立 ——
  等音异名判等的**理由仍成立**（移调按记谱习惯选号，与库里既有拼写未必一致），只改前提。
- 两处经核实无需改代码（审计标「待核」）：`chordQualityAstParse.ts:474-491` 声称 `(no3)` / `7(#9)` 收敛到
  无括号形态**准确**（括号写法确实登记在 `data/chord-qualities.json` 的 spellings 里，`findTokenBySpelling`
  命中后因 `spelling.includes('(')` 不放行、落到 tokenId 分支取 `spellings[0]`，语料测试已覆盖）；
  `chordEngine.ts:493` 的 `bassByPitch=false` 按弦序取最低在非重入调弦下与按 MIDI 取等价，两个生产调用点都按
  `isReentrantTuning` 传值，无缺陷。

### 修复 · 审计整改：指板与乐谱（2026-09-24）

- **指板绘制的指针捕获提到会话之前**（`useFretboardInteraction.ts`）：`setPointerCapture` 移到 `dragPaint`
  赋值之前，且 `try/catch` 失败即 `return`（不开会话）。捕获抛错后后续 `pointerup` 不会再落到本元素，会话就
  永远收不了尾；而 `dragPaint` 一旦存在，无按键的 `pointermove` 也会被当成滑动落笔改字母。次序必须是
  「先拿住指针，再置状态」。
- **位图路径与兜底直画逐像素对齐**（`FretboardCanvas.vue`）：兜底分支补上与位图路径同一段 `-nameReserveH`
  平移（`ctx.translate(0, -trim)` 包住 `renderFretboardBody`）。位图按「预留名字位」的几何存档、贴图时整体
  上移，兜底若不上移就高出一个名字块（12.8px）。
- **工作台面板留白收成一处并订正注释**（`WorkbenchView.vue`）：抽 `PANEL_HALO = { x: 44, y: 44 }`，
  `v-scrollbar` 的两个值改为引用它；注释改按 token 名（`--spacing-2xl` / `--spacing-xl`）表述并写清根字号
  22.25px 下实为 44.5 / 33.375px。
  - 判据：**`v-scrollbar` 收 number、读不到 CSS var**，其 `endInset` / `edgeOffset` 只能写像素，必须与 token
    成对同步；旧注释按 16px 根字号写 32 / 24，与 token 实际值互斥（本项目根字号见 `src/assets/main.scss`）。
- **和弦分析的斜杠低音偏好恢复同步**（`ChordAnalysisPanel.vue`）：`break` 从「该弦在发声」分支移到「命中目标
  音」分支之后 —— 原写法循环总在第一条发声弦停住，`preferFlat` 实际不同步。`for` 里 `break` 的落点必须是
  「条件真正满足」的那层。
- **工作台 URL 去掉 `?v=N` 位置索引**（`useWorkbenchRouteSync.ts`）：整体移除该参数（比「改判据」更彻底）——
  `chord` 参数已携带变体自身 id，草稿被切成变体后 `draft.id` 就是那条变体自己的 id，`v` 完全冗余；同时
  `mirrorStoreToUrl` 的 patch 显式写 `v: undefined`（`replaceQuery` 只合并 patch，不显式写就摘不掉旧链接
  残留的 `?v=N`）。
  - 判据：**位置索引在排序判据变化后会静默指向别项，实体 id 才稳定**；若另一个参数已携带同一实体 id，
    该索引参数应直接删除而非重定义。

### 修复 · 审计整改：UI 与浮层（2026-09-24）

- **`BaseInput` 不再静默丢弃 `class` / `style`**：根 div 改为 `:class="[{…}, attrClass]"` /
  `:style="[{ width }, attrStyle]"`，`inputAttrs` 仍只带 `rest`。`inheritAttrs: false` 之后 class / style
  不再有 fallthrough 兜底，不显式转发就是丢（实例：`SidebarLeft.vue` 的
  `class="header-search-input min-w-0 flex-1"` 此前从未生效）。与 `BaseTextarea.vue` 的「class / style 给根、
  其余给控件」对齐。
  - 判据：`useAttrs()` 返回响应式对象，**解构即失活**（`BaseTextarea` 那处的
    `computed(() => attrClass)` 是拿快照算的，等于没响应）；改用 `computed(() => attrs['class'])` 保住响应性。
- **遮罩关闭改为校验按下与松开两侧**（`overlayGuards.ts`）：新增 `handleMaskMouseup` 记松开点，
  `handleMaskClick` 要求三点同为目标，`handleMaskMousedown` 顺带清空 `mouseupTarget`（每次按下开一次新手势）；
  消费方 `BaseModal.vue` / `BaseDrawer.vue` 各加一行 `@mouseup`。
  - 判据：**click 的目标是按下点与松开点的最近公共祖先**，而遮罩是面板的**父**元素 ⇒「遮罩按下 → 拖进卡片
    松开」与「卡片按下 → 拖到遮罩松开」的 `click.target` 都是遮罩本身，只看 click + mousedown 只能挡住后者。
  - 新增 `tests/platform/overlayMaskClose.test.ts`（5 例，纯对象造事件、不依赖 jsdom 的 MouseEvent），含
    「残留松开点不得替下一轮作证」一条。
- **子面板自然收起时注销滚动守卫**（`MenuItems.vue` / `MenuSubmenu.vue`）：`MenuSubmenu` 补 `close` 事件
  （转发 BasePopover 的 `close`），`MenuItems` 接 `@close="handleSubmenuClose(index)"` 复位游标 + 释放守卫。
  此前只认「父级主动关」一条路径，子面板被外部点击 / Esc / ← 关掉后守卫与游标都留着 ⇒ 随手滚一下页面就给
  `closeAllSubmenus(true)` 记下抑制窗口，之后同级子项再也展不开。
- **浮层登记回调复查 `visible`**（`overlayLifecycle.ts`）：回调首行 `if (!opts.visible.value) return;`
  （连 `focusPanel()` 一起挡掉）。关闭分支跑时元素尚未登记，其 `unregisterOverlay` 空转，随后这一行把已关掉的
  浮层永久留在栈里 ⇒ 栈非空 ⇒ 除它以外整页 `inert`，而它自己是隐藏的。
- **`BasePopover` 惰性挂载注释订正**：`enabled: false` 走 `mountPassiveScrollbar`，**仍注入 overflow
  （无 direction ⇒ 双轴 auto）并隐藏原生滚动条**，不是「不注入任何样式 / DOM」；附带写明「面板 overflow 由
  指令给出，`panelClass` 里的 `overflow-*` 会被内联样式覆盖」。
- **`BaseSlider` 区间分支补上「值未变不写回」**：比对 `rangeValues.value` 后再赋值。区间值每次都是新数组，
  裸赋值让依赖 `modelValue` 的下游在拖拽每帧空跑；单值分支的 `snapped !== modelValue.value` 就是这条守卫，
  两分支必须同口径。
- **`BaseSelector` 的 `required` 模型不再被写入 `undefined`**：模型类型 `M extends true ? V[] : V` 不含
  `undefined`（消费方如 `editorStore.draftChord.tuning` 按 `Tuning` 消费），而 `handleClear` 在「单选 +
  无 `defaultValue`」时写 `undefined`。改法取**「不写」而非「放宽类型」** —— 放宽会经 `v-model` 反向逼消费方
  把 `draftChord.tuning` 也改成可空，那是 `fretboard/model` 保护区红线。故该场景直接 `return`，`canClear`
  相应只对多选放行。
  - 判据：**「模型类型不含某状态」时，缺的是那个状态还是那条写入路径？** 先看能否把空值来源交给调用方
    （`defaultValue`）—— 能，就删写入路径；不能，才动类型，且要先算清 `v-model` 的反向传播会波及谁。
- **「减弱动效」收敛为真正的单一来源**（`motion.ts` / `vMarquee.ts` / `BaseMenu.vue`）：补
  `onReducedMotionChange(listener)`（模块级共享 `MediaQueryList` + 监听器 Set，无 DOM / matchMedia 时返回
  空解绑）；`vMarquee` 的私有 `getReducedMotionMql` + `MQL_STATES` 改为「集合空即退订」的
  `ensureReducedMotionWatch` / `releaseReducedMotionWatch`；`BaseMenu` 的内联 `matchMedia` 换成
  `prefersReducedMotion()`。
  - 判据：**「单一来源」必须同时覆盖「查询」与「订阅」两条通道**，否则出现「查询说没减弱、监听说减弱了」的
    错位；且订阅要有退订路径，不然订阅表里留空监听。

### 修复 · 审计整改：指令与组合式（2026-09-24）

- **滚动条滚轮驱动改为逐轴**（`scrollbarWheel.ts`）：`wheelAnim` 拆成 `top` / `left` + `activeX` /
  `activeY` 两个「本轴是否已被驱动」标志；某轴本轮首次被驱动时目标从宿主当前位置起算，`step` 里逐轴判收尾。
  原写法纵向缓动期间每帧都把 `scrollLeft` 一起写回，横向位移被吞。
  - 判据：**缓动状态机承载多轴时必须逐轴记录「有没有被驱动」**，否则「未被驱动的轴」会被当成「目标值 = 当前
    值」把别人的位移写没；`canHostAbsorb` 的判据同样要按轴取。
- **`useSortableList` 的监听注册次序与 sortablejs 相反**：`bindPointerWatchers()` 从 `start()` 开头移到
  `new SortableCtor(…)` **之后**。sortablejs 的 click 忽略监听挂在**模块求值期**（`Sortable.js:1021` 模块级
  `document.addEventListener('click', …, true)`），我们先挂就排在它前面，`stopImmediatePropagation` 令其
  `ignoreNextClick` 标志永不被消费 ⇒ 下一次无关点击被吞。
- **同文件的触摸坐标读取**：`readOriginalMouseEvent` 换成 `readEventPoint` —— `MouseEvent` 取 `clientX/Y`、
  `TouchEvent` 取 `changedTouches[0]`。**`TouchEvent` 不是 `MouseEvent` 的子类**，只判 `MouseEvent` 会让
  触摸坐标退化成 0,0，位移被算成「起拖点到屏幕原点」的距离（必然超阈值）⇒ 纯点击被误判成真拖。坐标不可得时
  用 `moved === null` 表示，按纯点击处理。
- **同文件复位补 `isConnected` 守卫**：改判 `element.parentElement !== container` 即跳过（等价 `isConnected`，
  且在 jsdom 下成立），避免把已移出 DOM 的幽灵行搬回来。
- **FLIP 收尾的让位判据改为计时器身份**（`useSortableList/order.ts`）：原判据
  `el.style.transition !== transition` 不可靠 —— **CSSOM 会把写入值重新序列化**（`200ms` 读回成 `0.2s`，
  字符串比对恒不等），而 jsdom 恰好原样回读 ⇒ 单测看不见这个 bug。改比 `timers.get(el) !== timer`；摘
  transition 也由整条覆写改为 `removeTransitionItems(…, 'transform')` 条目级摘除。
- **`vMarquee` 三处**：①`applyFadeMask` 的 `el.style.transition = ''` 会连兄弟指令写的条目一起抹掉，改条目级
  摘除、铺遮罩处改用 `mergeTransitionItem` 追加；②`startMaskLoop` 先把几何写进 `state.maskDist` /
  `maskTravel` 再早退、`step` 从 state 读（原闭包捕获旧尺寸，容器 resize 后采样偏移不更新）；③
  `collectContentInto` 跳过 `Node.COMMENT_NODE` —— **Vue 的 `v-if` / `v-for` 用注释节点当占位锚点**，把它
  搬进 inner 会让宿主上任何 `v-if` 由假转真时抛 `NotFoundError`（插入走
  `container.insertBefore(node, anchor)`，anchor 必须是 container 的子节点）。
- **`vWheelScroll` 的 x 分支补文档级特例**：与 y 分支同口径补 `isDocScroller`（`document.scrollingElement`
  上 `overflowX` 读不到 `auto`，不特判则横向滚轮永远被吞）。
- **`useSectionScrollSpy` 两处**：①`activate` 末行改 `syncSections()`，不再无条件覆写首区；②轮询判「滚动落定」
  的基线由 freeze 那刻的值改为 `lastPolledTop`（上一次轮询读到的值）—— 拿 freeze 值当基线等价于只比一帧，
  平滑滚动首帧常无位移，会被当场判成已停住。
- **`useScrollMemory` 的回声守卫共用**：抽 `isSelfEcho(el)`，`save` 与换档 `watch` 共用（原换档路径可把自己
  刚写进去的钳位值当成用户滚动存下来）。
- **横按气泡入场类一并摘除**（`scrollbarBubbleRoll.ts`）：`settleBubbleRoll` 同时摘 `-from` 类 —— 该类带
  `translateY(110%) + opacity 0`，只摘 `-active` 会让读数永久停在空白（那条 rAF 因 `pending` 已清空而早退）。
- **`vTooltip` 键盘唤起补 aria 关联**：`setCurrentTarget()` 统一维护 `aria-describedby`（按 id 列表追加、
  保留调用方自己写的，摘空即 `removeAttribute`），键盘与鼠标路径同口径。
- **`useSortableList` 的异步建实例开关**经核实**不是缺陷**（`start()` 在 `await loadSortable()` 之后才
  `disabled: !isEnabled()` 现读一次），只补注释。

### 修复 · 审计整改：工装、CI 与文档（2026-09-24）

- **打包失败不再被报成成功**（`worker/scripts/build-worker.mjs`）：`exit(code ?? 0)` 在两种情况下会骗过
  调用方 —— 被信号杀死（OOM SIGKILL / Ctrl-C）时 `code` 为 `null`、真因在 `signal`；spawn 自身失败只触发
  `'error'`、同样 `code === null`。两条路径都让 `deploy-worker` 认为打包成功，而它部署的是**上一次**的
  `worker/dist/index.mjs`（wrangler 侧 `no_bundle`）⇒ 旧产物上生产。改为「`code` 严格等于 0 才算成功」，
  `signal` 与 `'error'` 一律退 1；`deploy-worker` 主部署调用那行同款 `code ?? 0` 一并改 `?? 1`。
  - 判据：**退出码的「未知」不等于「成功」** —— `code ?? 0` 这类兜底必须默认到失败侧，否则「子进程根本没
    跑起来」与「跑完且成功」在调用方眼里无法区分。
- **`wrangler` / `esbuild` 不再走 `npx --yes …@latest`**：新增 `worker/scripts/toolchain.mjs` 承载版本常量
  （`WRANGLER_VERSION` / `ESBUILD_VERSION`），三处调用改引用它。理由：`deploy-worker` 在带
  `CLOUDFLARE_API_TOKEN` 的 CI 里调用它们、且 `worker/**` 一改就自动发生产，而 `pnpm-lock.yaml` 里根本
  没有这两个包（`npx` 不经 lockfile）—— `@latest` 等于把「每次部署现场执行一个当天才发布的包」写进生产
  发布流程。钉死后升级变成显式动作。
- **覆盖率声明订正**（`vite.config.ts`）：分母实为 `src/**` + `tokens/**`（`tests/tokens/**` 直接 import
  了它，带真实覆盖率而非恒 0% 行，与 `scripts/**` / `worker/**` 不同）；分层门槛只给 `chord/model` 与
  `score/model` 定档，`fretboard/model` 无档（原写 `domains/*/model` 会让它看起来被覆盖）。**只改注释、
  不动 `exclude`**：动分母会连带作废文件里记录的实测水位。
- **`worker/lib/md5.mjs` 的双源补上测试与类型**：新增 `tests/worker/md5.test.ts`（RFC 1321 七条标准向量、
  长度 0~130 逐条与 `js-md5` 比对以覆盖全部 mod 64 补位边界、中文 / emoji / 组合字符、字节数组入参、真实
  载荷 JSON 文本）与 `worker/lib/md5.d.mts`。
  - `worker/` 不在任何 tsconfig 的 `include` 内且 `allowJs` 关闭，测试 import 那个 `.mjs` 会 TS2307；补一份
    **同名同目录**的 `.d.mts` 即按 `.mjs → .d.mts` 约定解析。
- **CI 覆盖 `dev` 分支**：`ci.yml` 的 `push` / `pull_request` branches 加 `dev`（长期存在的集成分支，此前
  推 `dev` 与开向 `dev` 的 PR 都拿不到任何关卡）。
- **`AGENTS.md` 两处与事实不符**：①4.1 原写「提交前必须绿灯的完整命令」却只列 3 条（实际关卡是
  `pnpm verify` 的 8 步，CI 另跑 `pnpm bench`），改为先点明完整关卡、再说明这 3 条不是全部；②原写「保护区与
  6 条 zone 一一对应」实为两套口径（`chord/theory`、`tests` 无 zone；zone ④⑤⑥ 无保护区条目），逐条写清差异。
- **`SECURITY.md` 的假门禁订正**：原写「Dependency audit failures block CI」不成立，改为如实描述
  （Dependabot 每周提 PR；CI 无 `pnpm audit` 关卡）。**不代加**该步骤：`pnpm audit` 需联网、存量告警未知，
  贸然上门禁可能当场把 CI 打红。
- **`CONTRIBUTING.md` 的 Node 版本**：`≥ 20` → `≥ 22.13`（`pnpm@11.20.0` 依赖内建 `node:sqlite`，低于此
  版本 `pnpm install` 抛 `ERR_UNKNOWN_BUILTIN_MODULE`；CI 与 `packageManager` 都按 22 钉）。
- **README 四处事实不符**：①GitHub 分支默认值（实为 dev 构建 `dev-data-sync` / 生产 `data-sync`，非
  `main`；Path 默认 `backup/chords.json`）；②Gitee 鉴权实走 `Authorization: token <token>` 请求头，不是
  query 里的 `access_token`；③WebDAV 开发代理端口 `8787` → `9003`（`PROXY_PORT ?? 9003`，两处）；④自建
  服务器接口 `GET / PUT` → `GET / POST`（worker 只注册了 `app.post('*')`）。
- **`data/sample-backup.json` 修好并接进关卡**：该文件此前零引用、`version` 与 `CURRENT_PAYLOAD_VERSION`
  脱钩、10 条示例里 8 条的 `rootStringIndex` 不指根音（而 `chordSearch` 优先取它）。用**真实迁移链**把 v6 升到
  v7（琴弦元组 → 对象、`chordMap` 扁平 → 按行嵌套），再修 8 处 `rootStringIndex`，并保持 `data/` 的紧凑排版
  （该目录在 `.prettierignore` 里）。新增 `tests/data/sampleBackup.test.ts` 把它接进关卡：①
  `migratePayloadVersion(sample)` 必须是恒等变换（版本 + 结构双锁，版本递增后忘了更新示例会立刻红）；②每条
  和弦「按标记解析的根音」与「按和弦名解析的根音」必须同值（直接复用 `resolveChordRootPitch`，不另写一套
  音高换算）。

### 修复 · 审计整改：注释、死码与测试质量（2026-09-24）

- 注释与实现不符三处：①`chordEngine.ts` 的 `softScore` 注释写「低音项取值域 0 ~ −27」，实际是四个离散值
  —— `bassScore` 0.78 / 0.68 / 0.55 / 0.35 对应 `BASS_SCALE × (bassScore − 1)` = −44 / −64 / −90 / −130，
  `BASS_SCALE` 自己的注释里「扣约 10% 总分」同样不可核，一并改成逐档可验的表述；②
  `chordRecognitionAst.ts` 的 `noThird` JSDoc 写「无三音（5 和弦、no3）」，而 `weightOf` 的守卫是
  `if (!ast.omitThird && …)` ⇒ **`no3` 恰恰被排除**，改为「定义上无三音（`5` 和弦）」；同文件
  `perExtension` 的「每个**实际新增**的张力音」实为**声明数**（`ast.extensions.length`），改写为「预支」
  语义并点明缺席音的两种归宿（合法可省 → `perOmittedExtension` 全额撤回、不可省 → `perUnusedDeclared`
  罚更重）；③`useChordGroupModals.ts` 写「`moveVariantsByName` 对同组移动是静默 no-op」**不成立** ——
  同组时 `movedIds` 全部落在目标分组内，`detectMergedDuplicates` 会真的合并去重（丢弃重复项 +
  `commitDeletion()` + `emitChordsMerged`），上游 warning 挡住了这条路径，故是注释不实而非活 bug。
- `FretboardCanvas.vue` 的 HMR 注释「注册表那边另有一道闸门：新实例登记时把同名旧条目移出」**与实现相反**：
  `registerCache` 明确「同名实例一律保留、不覆盖也不清空」，由 `listCaches` 挑「最近活跃」的一份展示、
  `clear` 逐份下发。注释改为如实描述（用 `clear()` 而非 `dispose()` 的选择本身正确：`clear` 会触发
  `onEvict`、注册表要求旧实例自己释放）。
- **两处逐字相同的 `cloneChordMap` 收进 `score/model/chordSlots.ts`**（`score/editor` 与 `score/library`
  各一份，两者互不依赖），注释写明为什么必须是深拷贝：浅拷贝会让撤销快照与实时编辑共享行容器，撤销等于没撤。
- **删掉唯一确认为真死码的 `activeTopOffset` 链**：`useFretboardLayout` 的 computed、返回值与
  `useFretboardInteraction` 的转发一并移除（全仓 3 处引用，`Fretboard.vue` 的解构列表里没有它）。
- **测试质量两条**：①`tests/domain/chordIdentity.test.ts` 删掉「同一对象重复求值命中缓存且结果一致」——
  纯函数同输入同输出，断言恒真，测的是内部 WeakMap 而非业务行为（AGENTS §7.1 同义反复），换成两条**就地
  改写**用例（改 `strings[1].fret` / 改 `rootStringIndex`），这正是缓存签名校验存在的理由；②
  `tests/ui/composables/useLyricsDragDrop.test.ts` 的 `MockPointerEvent` 缺省 `pointerType` 由 `'mouse'`
  改 `''`（= 浏览器里 `new PointerEvent(type)` 的真实取值，也是应用代码伪造 cancel 事件的形态），手势辅助
  函数改为显式传 `'mouse'`，并新增「非活动指针的 `pointermove` 被忽略」用例（第二支指针移动不起拖 + 活动
  指针移动起拖作正对照）。
- 其余「零引用」经核实**不动**（零引用不等于死码）：`FRETBOARD_WIDTH` 在
  `tests/domain/customStringCount.test.ts` 里当基准锚点用；三个「零引用 barrel」自述是「模块清单…不是导入
  入口」（跨领域走深路径）；`MUTING_COOL_DOWN` 是 `INTERACTION_CONFIG` 里有文档的配置旋钮（同族另三项都在
  用）；`chordQualityAstParse.ts` 的两个零调用解析入口在理论内核保护区内、且被 `parseQualityText` 的文档引作
  对照，与 `useResponsive` 同类，保留待定夺。`renderFretboardCanvas.ts` 与 `transitions.scss` 的两处被点名项
  经核对**注释本身准确**（前者 `chordNameBlockH − edgePad` 恰为名字字号 12.8；后者是刻意的「无样式
  transition name」，`useChunkedMount.ts` 两处注释已写明）。

### 优化 · 浮层箭头改为「容器 + 箭头一条连续轮廓」，四个消费方共用一个基础组件（2026-09-24）

- **动因是一条压不掉的缝**：旧做法里面板描边与箭头描边是**两条独立的边**，各自抗锯齿，在接缝处
  叠加出比两侧都暗的缝，只能靠「把楔形插进面板 1px」去盖。而指板横按气泡整棵子树处在
  `Fretboard` 的 `transform: scale(0.85)` 内，1px 描边视觉上只剩 0.85px，插入量随之缩水 ——
  缝隙反复出现，微调插入量治不了。
- **做法**：把「面板描边 + 楔形」画成**一条 SVG 轮廓**，接缝从构造上不存在，与缩放无关。
  新增 `platform/ui/popover/arrowPanelPath.ts`（纯几何，不碰 DOM）、`arrowPanel.ts`
  （框架无关：建剪影层、复刻宿主配色、跟随尺寸与换色）、`BaseArrowPanel.vue`（Vue 薄壳）。
  四个消费方全部切换：`BasePopover`、`vTooltip`、`v-scrollbar` 读数气泡、指板横按气泡；
  旧模块 `floatingArrow.ts` 及其 `buildFloatingArrowStyle` / `applyFloatingArrowStyle` 一并删除。
- **为什么核心是原生的**：`vTooltip` 与 `v-scrollbar` 气泡都是指令，拿不到组件实例。故几何与 DOM
  落在 `arrowPanel.ts`，Vue 侧只留薄壳；薄壳自己用模板渲染 `<svg>` 而不让 TS 往面板里塞节点 ——
  面板的 children 归 Vue 的补丁锚点管，外来节点会让 `insertBefore` 抛 NotFoundError。
- **配色不另立一份**：剪影从宿主的 computed style 复刻 `background-color` / `border-color` /
  `border-width` / `border-radius`，故 `panelClass` 里的 `bg-*` / `border-*` 覆盖照旧生效。
  宿主的过渡时长与曲线也一并抄到两条 path 上，悬停/标记态换色时剪影与面板同速同曲线。
  换色触发源三类：宿主 `class`/`style` 变化、`<html>` 的主题切换（观察者）、悬停与聚焦（事件）——
  最后一类不可省，`hover:bg-*` 由 CSS 伪类命中、类名不变，观察者看不见。
- **尺寸取 `ResizeObserver` 的 `borderBoxSize`**：`getBoundingClientRect` 会带上祖先
  `transform: scale()`（指板气泡就在 0.85 缩放内，量出来偏小），`offsetWidth` 会取整（0.4px 误差
  足以让剪影与面板错开一像素）。**观察者未投递时退回布局尺寸**：无头 Chrome 的虚拟时间下
  `ResizeObserver` 一次都不投递，只认它会把首帧尺寸一直用下去。
- **坐标原点要平移**：绝对定位子元素的包含块是宿主的 padding box（`left:0` 落在描边内侧），而几何
  以 border-box 左上角为原点，故剪影层是宿主子元素时统一 `translate(-borderWidth, …)`。该判断由
  剪影层自己的父子关系推出，无需调用方声明（vTooltip 挂在无描边的 `.v-tooltip-root` 下，平移量自动归零）。
- **楔形底宽会按可用直边段等比收缩**：底宽必须 ≤ 该边的直边段长度，否则底边越过四角圆弧会让路径
  折返、在角上挑出一根刺。小面板会碰到这条：v-scrollbar 读数气泡高 25px、圆角 8.3px，直边只剩
  6.3px，而 8px 的箭头底宽有 11.3px。旧实现里楔形是独立元素、底边越过圆角只是「多盖一点」，
  轮廓合一后必须收缩。**用户可感知**：该气泡的箭头会等比变小（宽高同缩，形状不变）；
  指板气泡与 tooltip 的直边段足够长，不触发收缩、观感不变。
- 四个消费方的箭头元素退化为**不绘制的定位探针**（`popover-arrow-anchor` / `.v-tooltip-arrow`）：
  `BasePopover` 与 `vTooltip` 的箭头位置来自 floating-ui 的 arrow 中间件，中间件要按箭头元素的宽高
  算落点，故保留一个透明同尺寸的盒子；探针必须可见（`display:none` 会让 `offsetWidth` 归零、落点全错）。
  `v-scrollbar` 气泡与指板气泡方位恒定，不需要中间件，朝向直接给定、中心取该边中点。
- 顺带纠正两处注释：`floatingCore` 与 `BasePopover` 里「箭头 size=14、外露约 9px」与实际
  （size=12、外露 `size/√2` ≈ 8.5px）不符，按实现改写。
- **修掉本方案自己引入的一处路径缺陷**：箭头三段之后漏了「走完这条边剩下的部分」，路径于是从远侧
  交点直接连到角点 —— 那段圆弧的弦长超过直径，渲染器按规范把半径放大到刚好够用，**在气泡旁凭空
  画出一个圆环**。它离接缝很远，盯着箭头看根本注意不到（实测由用户发现）。顺带把直边段长度为 0 的
  边（`rounded-full` 面板的左右边全是圆弧）整条跳过，不再发零长度的 H/V。
- 新增 `tests/platform/arrowPanelPath.test.ts`（10 例）：四个朝向各断言「圆弧弦长不超过直径」与
  「极值点落在箭尖上」，另两例覆盖底宽超限时的等比收缩与尺寸退化。断言取路径本身可验证的几何性质，
  不写坐标字面量 —— 调输出精度或换圆角取值都不该让它变红。已用反向探针确认有牙（注释掉「走完剩余
  边段」那一行后，上/下两向立即变红）。
- 剪影层顺带把**同一条轮廓**写成宿主上的 CSS 变量 `--arrow-panel-clip`：它是「面板 + 箭头」这个
  非凸形状的唯一权威描述，波纹容器的裁剪与未来的同类需求都直接取用，不必各自再拼一次几何
  （用法见下一节）。
- **修掉三处「剪影层与宿主不同步」**（均由用户实测发现，都是迁移时漏掉的口径）：
  - **tooltip 本体与箭头之间有一条线**：剪影层与内容盒是兄弟节点，而 `.v-tooltip-box` 是
    `position:relative;z-index:1`，剪影层没声明层级就被内容盒自己的描边压住 —— 本体描边于是横穿
    箭头根部。补 `z-index: 2`（旧实现里箭头元素正是靠 `z-index: 2` 压过内容，这条是迁移时漏掉的）。
  - **主体 hover 时箭头不变色**：换色走 CSS 过渡，而过渡期间 computed style 返回的是**当前帧的中间
    值** —— `pointerenter` 触发的重绘读到的是过渡起点（旧色），此后不再有触发，箭头就永远停在旧色。
    改为从运行中的过渡动画取**末帧终值**（`getAnimations()` + `effect.getKeyframes()`），并把宿主的
    时长/曲线抄到两条 path 上，剪影便按同一条曲线补间过去；这条同时避开了对 `requestAnimationFrame`
    的依赖（后台标签页里它会被节流）。
  - **宽度过渡后水波按旧轮廓裁**：`ResizeObserver` 给的分数尺寸可能晚到、甚至在某些环境完全不投递，
    只认它会把首帧尺寸一直用下去。改为与当前布局尺寸做一致性校验（差 1px 以上即认定过期，改用现读值）。
  - **箭头与本体换色不同步（一个慢一点）**：过渡口径原先是在绑定那一刻**快照**宿主的
    `transition-duration` / `transition-timing-function` 首项 —— 而绑定发生在面板还挂着入场过渡
    （`opacity, transform` / 0.18s）的时候，箭头于是拿错了时长；且 `transition-property` 是多值列表，
    第 0 项未必是 `background-color`。改为**每次重绘按属性对齐现读**（`fill` 取宿主的 `background-color`
    那一项、`stroke` 取 `border-color`）。顺带修掉一个更隐蔽的：`transition-timing-function` 的
    `cubic-bezier(0.4, 0, 0.2, 1)` 自带逗号，朴素的 `split(',')` 会把值切碎、拼回去非法而被浏览器整条
    丢弃（表现为箭头完全没有过渡，或停在上一次成功写入的旧值上）—— 切分改为跳过括号内的逗号。

### 优化 · 横按气泡的水波可扫过指向箭头，裁剪范围下沉为依赖层通用能力（2026-09-24）

- 横按气泡的 `v-wave` 传 `{ clip: { bottom: 9 } }`：波纹容器自气泡 border-box 向下撑开 9px，
  水波因此扫得到凸出盒外的指向箭头，又不会像完全不裁那样漫出一大团。
- **裁剪形状由剪影层的轮廓给出，不靠矩形加圆角**：剪影层把同一条轮廓（面板 + 箭头）写成宿主上的
  `--arrow-panel-clip`，补丁优先按它裁。仅撑开矩形是不够的 —— 撑开后 `border-radius` 会被浏览器按
  容器高度收敛成胶囊，箭头左右也跟着放开，水波就从箭头两侧溢出来（实测：波纹在气泡下方形成一条整
  宽的圆角带）。**用户可感知**：水波现在只出现在气泡本体与箭头之内。
- `clip` 选项由 `patches/v-wave.patch` 新增，形如 `true | { top?, right?, bottom?, left? }`：
  `true`（默认）保持上游的三道裁剪，对象则先按四向外扩量把容器撑开、再按宿主轮廓裁。指令级与插件级
  都能传 —— 通用能力落在依赖层，组件只声明「往哪放、放多少」，不必各自写一套「压掉内联裁剪」的局部样式。
  **刻意只留这两档**：中途出现过的「`false` 完全不裁」与「宿主没写轮廓时退回 `border-radius`」都已删除 ——
  前者是为「让水波扫过箭头」加的，改成轮廓裁剪后就没用了；后者会静默退化成「箭头左右也能看见水波」，
  比直接不裁更难查。
- 那个 9 由箭头几何推出、不是试出来的：箭尖越出面板 border-box 底边 `size/√2`（楔形底边落在
  border-box 边上），而容器自 border-box 起算，令容器底边不低于箭尖即得 `bleed ≥ size/√2`（向上取整
  留抗锯齿余量）。组件侧因此只写 `BARRE_ARROW_SIZE` 一个常量，裁剪量随它自动跟着箭头走。
- 容器改为自**宿主 border-box** 起算（此前自 padding-box），轮廓路径与容器的坐标系才对齐。
  同时把裁剪口径抽成可重入的 `applyContainerClip`：容器在首次点击时创建、之后一直缓存，而宿主尺寸会变
  （`v-auto-width` 的气泡换个文案就换宽），复用容器时逐次刷新，否则水波会按旧轮廓溢出或不足。
- **关键一条：只关 `overflow` / `border-radius` 不够**。v-wave 给容器无条件写死
  `-webkit-mask-image: -webkit-radial-gradient(white, black)`（原意是逼出合成层），而 css-masking-1
  规定元素被 mask 后「绘制内容被限制在 mask painting area（默认 border-box）内」—— 无头 Chrome 上以
  同结构两版对照实测：带 mask 时水波被裁成胶囊形、箭头完全见不到波纹；去掉 mask 才是完整圆形水波。
  故补丁把三道裁剪（overflow、border-radius、mask）一起收进 `clip !== false` 分支。
- 顺带补上一处静默失效：补丁的 cjs 分支此前只把 `tagName` 透传给 `createContainer`、漏了 `clip`，于是走
  cjs 的消费方无论传什么都是上游行为（mjs 分支正常）。
- 组件侧只留一件事：把波纹容器抬到剪影层（面板轮廓，即箭头本身）之上，水波才扫得过箭头；靠文档序决定
  先后太脆，显式层级才稳。
- 扩散半径不动：半径是「点击点到元素盒最远角」的 `SCALE_FACTOR`（2.05）的一半，必然覆盖近中心的箭头，
  故不需要放大系数 —— 收敛靠裁剪范围，不靠改半径。
- `pnpm-workspace.yaml` 登记 `patchedDependencies`，锁文件随之记录补丁哈希（`index.iife.js` 不参与
  打包链路，未打补丁）。
- **剪影变量随剪影一起摘除**：`--arrow-panel-clip` 由剪影层写在宿主上，而 Vue 侧 `BaseArrowPanel` 的
  `unbind()` 此前只 `sync?.destroy()` 销毁剪影、不摘变量（原生入口 `arrowPanel.ts` 的 `destroy()`
  两条都做）—— 同一件事两条路径口径不一致，一旦出现「面板留着、箭头先摘」（面板复用 / 箭头条件渲染）
  的消费方，水波就会按一个**已不存在**的轮廓裁剪。现解绑收成「没有剪影就直接返回」，有则在 `destroy()`
  之后 `removeProperty('--arrow-panel-clip')`（`onBeforeUnmount` 阶段元素尚未离场，`parentElement` 仍可读）。

### 优化 · 颜色令牌对标成熟 UI 库补齐覆盖场景：第五语义色、提亮档与禁用三件套（2026-09-24）

- **新增第五个语义色 `--color-info`**：Element Plus 的 `--el-color-info` 与 Ant Design 的 `colorInfo`
  都是五色起步，本项目此前只有四色。三主题取值 —— 亮色 `#30b0c7` / 暗色 `#40c8e0` / 高对比 `#6fdcf0`
  （同属 iOS systemTeal 一族）。**选色由门禁反推、不按观感挑**：候选须同时满足「深墨 ≥ 4.5」与方向锁，
  且与既有四色在 oklch 色相上可分。落定后深墨比值 8.16 / 10.56 / 13.17、浅墨 2.57 / 1.99 / 1.59，
  与既有四色同走「浅底 + 深墨」口径；
  - 反面例证记下：Element 的 `#909399` **不可照搬** —— 其彩度仅 0.01（本质是灰），搬过来是多一档灰，
    而不是一支语义色；
  - 门禁由四色扩为五色（`ACCENT_TOKENS` 加 `--color-info`），五色 × 三主题 × 两支墨全过，方向锁同守；
  - **当前无消费方，且刻意不接**：`Feedback` 的 `FeedbackType` 只有
    `empty / 404 / network / search / loading / error`，没有 info 型；要接上去等于新增一个反馈类型
    （图标 + 文案 + 语义），那是产品功能而非令牌覆盖。故本轮只把令牌补到可用态。
- **新增 `lift` 派生算子**（`tokens/lift.ts`，产出 `--lift-<族>-10` = 语义色与**纯白** 10% 混合）：
  这是「实心档悬停」一直缺的那一档。`tint` 的锚点是**主题底色**（同一档在亮 / 暗主题下方向会漂），
  `shade` 的锚点是纯黑；`lift` 以纯白为绝对锚点，两者配对后「悬停一律更亮、按下一律更深」在三主题下
  同时成立 —— 而实心档的悬停方向本来就与主题无关；
- **`shade` 族补 `-20` 档与 `borderbase` 支**：`-20` 与 Element Plus 的 `dark-2` 同口径，供实心档的按下；
  `borderbase` 支供中性底的悬停 / 按下（此前中性底无档可取，开关关闭态只能用滤镜凑）；
- **`tint` 五族共用同一张场景档位表**：原先各族按需长档，`success` 只有 `20 / 82 / 88` 三档，给组件找
  「浅底悬停档」时**无档可取** —— 这类死角随本次统一消除。历史档位逐个核实**确有消费方**
  （`tint-success-82/88`、`tint-current-82` 等），故只**增档不改档**，既有取值一个未动；
- **新增禁用三件套** `--bg-disabled` / `--border-disabled`（`--text-disabled` 复用既有正文档），
  并在 `@theme` 转发为 `--color-surface-disabled` / `--color-border-disabled`；
- 五族的源色映射收进 `tokens/semanticFamilies.ts`（`tint` / `shade` / `lift` 三处共用一份），
  避免新增一族时要同步改三处；
- 守卫同步扩面：派生档位名正则收 `lift`、`ScaleView.kind` 加 `lift` 分支、整族转发守卫由两族扩为
  **tint / shade / lift 三族**（漏一档即该档取不到实色），颜色转发守卫的语义色清单加 `--color-info`。

### 优化 · 交互态与禁用态改用令牌，不再让引擎现算（2026-09-24）

- **`brightness()` 滤镜全部换成交互态令牌**（9 处 = `BaseCheckbox` 勾选态 4 色 + `BaseSwitch` 轨道
  on / off 4 组）：`group-hover:brightness-105` → `group-hover:bg-lift-<族>-10`，开关关闭态的
  `group-hover:brightness-95` → `group-hover:bg-shade-borderbase-12`；
  - 判据：**滤镜由引擎算 ⇒ 产物的真实色值不可审查、也进不了对比度门禁**；且 `brightness()` 是通道乘
    系数而非混合，对通道触顶的饱和色并非真的提亮；
  - `BaseSwitch` 的 `group-disabled:*` 补偿段保留（`:hover` 在 disabled 的 `button` 上仍会命中，
    少了它禁用开关被指针划过依旧变色），只是换成同一批令牌。
- **禁用态由整元素 opacity 改为令牌三件套**（`ActionButton` / `BaseInput` / `BaseTextarea`）：
  - 判据：**透明度是相对的** —— 它把底、描边、文字、图标按同一比例一起压淡，既无法单独控制，观感又
    随所处底色漂移，深色主题下会把文字压到近乎不可读；三件套各档各司其职，且可被对比度门禁审查；
  - `ActionButton` 的禁用列**必须按变体给**（落在 `buttonThemes.ts` 的 `BUTTON_DISABLED_THEME_MAP`）：
    有填充面的 `default` / `subtle` 上满三件套；透明底的 `ghost` / `text` 只收前景色 —— 给它们硬套
    禁用底色会凭空多出一块色斑，而这两种变体的全部信息量就在前景色上；
  - 前景一路不必照顾图标（`BaseIcon` 缺省 `currentColor`，随禁用列自动继承），这正是透明度方案做不到的：
    它无法让图标跟着文字档走而不连带压淡别的东西；
  - `BaseInput` / `BaseTextarea` 补三件套（`disabled:border-border-disabled` 与
    `disabled:bg-surface-disabled`、`disabled:text-fg-disabled`）；`BaseTextarea` 原写的
    `disabled:bg-surface-body` 与常态底色同值、实为空转规则，一并替掉。
- **透明底控件的禁用淡化改为取前景档**（`BaseSegmentedControl`、`MenuRow`、`BaseNumberInput` 步进 ×2）：
  `disabled:opacity-30~40` → `disabled:text-fg-disabled`。这类元素本无填充面，透明度实际只作用在前景上，
  直接取「失效文字档」等价且可审查。
- **刻意未改，逐条说明**（均为「换令牌就得到别处先扩档」或语义另有承载，不是遗漏）：
  - `ActionButton` 的 `active:not-disabled:brightness-95`（按下档）：`tint` 族在**悬停档与应用档之间
    没有更细的档位可取**（`primary` 连 78 都缺），令牌化须先给五族补出按下档，属另一次档位扩张；
  - `BaseSwitch` 的 `disabled:opacity-50`：轨道是开 / 关的唯一载体，整体淡化仍保留状态区分，
    换成中性禁用底会把「开」与「关」抹成同一个样子；
  - `BaseBadge` 关闭钮的 `65 / 100 / 40`：这是一条**相对透明度阶梯**（静止淡化 → 悬停全额 → 禁用再压），
    三步同属相对语义，只拆一步改令牌会让阶梯失去可比性；
  - `BaseSlider` 步进钮：启用态本已取 `--text-disabled`，再淡化即「比失效档更淡」，而正文只有
    title / body / muted / disabled 四档、**没有更淡的一档** —— 这是既有令牌误用（启用态取了失效档），
    欲修须先定它的正确档位，不在本轮范围；
  - `FretboardSvg` 横按梁的 `hover:brightness-110`：其填充是 `rgba(var(--fb-barre-rgb), α)`，属
    **相对 alpha 的明暗通道**，而 lift / shade / tint 三族全部定义为不含 alpha 的实色中间混合，
    令牌化须先为指板明暗通道新增一支带 alpha 的档位族。

### 修复 · info 等级不再借用品牌色，禁用态三件套收口（2026-09-24）

- **`--color-info` 接入通知与 Toast**（`GlobalNotification`）：`LEVEL_CLASS_MAP.info` 与
  `MESSAGE_ICON_MAP.info` 此前都取 `text-primary` —— 于是「中性告知」与「品牌主色强调 / 进行中」长得
  一模一样，而通知里 success / warning / error 各有语义色，唯独 info 没有自己的档。这是**令牌缺失**，
  不是选色失误：新档就位后改取 `text-info`。
  - **用户可感知的影响**：`uiStore.addNotice` 的缺省等级本就是 `info`（`options.type ?? 'info'`），
    故**不显式传等级的常驻通知会由主色蓝变为 info 青**，Toast 的 info 型同理。
  - `loading` 与 `neutral` 刻意不动：前者是「进行中」（与品牌主色同源是合理的），后者是「无语义等级」
    （保持不染色、只压一档存在感）。三者此前共用一个 `text-primary`，正是它们该分开的证据。
- **半迁移的禁用态收口**（`ChordModalsContainer`）：该处此前已是「手写禁用三件套 + 残留 `opacity-50`」
  （`disabled:bg-surface-main` + `disabled:border-border-light` + `disabled:text-fg-disabled`），
  只因当时**没有** `--bg-disabled` / `--border-disabled` 可取，才拿页面底与静止发丝档顶替。
  现改用正式三件套，并去掉 `disabled:opacity-50`。
- **去掉禁用态的双重淡化**（`BaseSegmentedControl`）：容器原写 `props.disabled ? 'opacity-50 …'`，而项自身
  本轮已改走 `disabled:text-fg-disabled` ⇒ 实际观感是两者**相乘**（40% × 50%），比任何单一档都淡。
  现容器只保留 `cursor-not-allowed`（项与项之间的空白不属于任何项，光靠项的 cursor 挡不住），
  并由 `props.disabled` 把滑块换成禁用底与描边 —— 滑块是容器的**兄弟节点**、本身不是可禁用元素，
  拿不到 `:disabled`，不显式处理就会留下一块「看着还能点」的主色指示块。
- 复核中确认**无需改动**的两类（避免下一轮重复判断）：`hover:opacity-85/100` 这类是**相对 alpha 的
  元素存在感阶梯**（菜单行图标、选择器清除钮、可点击徽章），与禁用态无关，且 lift / shade / tint
  三族都是不含 alpha 的实色中间混合，表达不了它们；`--color-info` 不补 `-rgb` 分量也是刻意的
  （全仓没有「info 色带 alpha」的投影消费方，与 danger 同理，已在 `light.ts` 注明）。

### 优化 · 点行标签也能触发控件：波纹委托推广为「标签按下委托」，选择器可点标签开面板（2026-09-24）

- **缺口**：`BaseFormRow` 的行标签与控件是兄弟节点，而波纹指令只监听自己所在元素上的指针事件 —— 点标签能
  激活控件、却收不到任何波纹反馈。同一个动作有两条入口，只有一条有反馈。进一步查清：缺口**只存在于「波纹
  元素不是那个被标签关联的元素本身」的控件上**：
  - `BaseSwitch`：波纹挂在按钮**内部**的轨道上。标签的激活行为只在按钮上派发一次合成 click，事件自按钮向
    **上**冒泡、到不了按钮内部的轨道 ⇒ 无波纹；
  - `BaseCheckbox`（非 buttonized）：波纹挂在与 `<input>` **兄弟**的勾选框上，同理收不到。
  - **`ActionButton` 不是缺口，本轮不改**：它的波纹元素就是那个 `<button>`，本身即标签关联的目标 —— 浏览器
    点标签时会在它身上派发一个 `detail: 0` 的合成 click，而指令的 click 监听**只认 `detail === 0`**（真指针
    点击走 pointerdown，不进这条），取出元素中心放波纹。即「点标签出波纹」对按钮早已成立；据此也就没有
    「给全项目 50 余处按钮补 `id` 才能被标签指到」的理由。
- **补法复用指令给键盘 / 合成激活预留的那条分支**：行在标签被按下时代调控件登记的 `press()`，由控件在自己的
  波纹元素上派发一个 `detail=0` 且**不冒泡**的 click。指令的 click 监听只认 `detail===0`，命中后以元素中心
  为圆心、不等抬起 —— 正是「拿不到指针坐标时」的口径，故不传坐标：指针落在标签上，拿标签坐标当圆心只会把
  波纹甩到元素盒外。
- 通道落在 `formRowContext` 既有约定上（新增 ③ **标签交互委托**，`useFormRowLabelPress`）。③ 承担两件事：
  **补波纹**（波纹元素与标签是兄弟节点、收不到落在标签上的指针事件）与**补激活**（触发器不可标签化、
  `label` 的 `for` 指不到它）。两者的分界线同源 —— 标签点了「确实会有反应」才委托：或标签确实是 `<label>`
  （激活由浏览器经 `for` 完成），或控件声明**自己实现激活**（`selfActivating`）。行据此同时决定**是否给手型**
  与**是否放行委托**，判据只出一处（`labelIsClickable`）—— 分两处写会漂移成「有手型但点了没事」。
- **两件事挂在不同事件上，不可合并**：`press` 挂 `pointerdown`（只补波纹 —— 墨水必须在指针落下那刻就晕开，
  与按在控件本身上同口径），`activate` 挂 `click`（才补激活 —— 激活是点击语义，浏览器原生 click 的时机就是
  「同一次按压在同一个元素上松开」）。合并成一档就会**一按就开面板**：按住标签往外一拖再松手也会激活控件，
  而同样手法按触发器本身什么都不会发生，且没法用「拖走松手」取消。**该缺陷真实出现过**（`BaseSelector` 的
  行标签此前一按就弹出面板、与点触发器手感不一致），修法即把激活从 `press` 挪到 `activate`；回归锚点是
  「按下之后 `aria-expanded` 仍为 `false`，click 之后才为 `true`」。
- **`selfActivating` 是给 `BaseSelector` 这类控件补的口子**：其触发器是 `role=combobox` 的 div，行标签既不能
  用 `for` 指向它（Chrome 只认 input / select / textarea / button 那几类），也包不住它（两者是兄弟节点），
  标签因此退化为 `<span>` —— 缺口不止少一圈波纹，而是**整个激活动作都不存在**。声明 `selfActivating` 后，
  行才把「退化标签」的委托也接过来。承接方在 `activate`（click）档开面板：走与键盘同一条路（直接置 `isOpen`，
  与触发器上的 Enter / 空格同口径），且**只开不关、不做 toggle** —— 面板开着时按标签，会在**捕获阶段**先被
  `BasePopover` 的外点关闭置假（其 outside 监听挂在 `window` 捕获阶段），此处再 toggle 会把刚关掉的面板又
  翻回来、结果随先前开合漂移；恒置真则无论先前开合都是「打开」。也正因此，那次补波纹的合成 click
  **必须不冒泡**：冒泡会抵达 `BasePopover` 触发区的 `@click` 去 toggle，与「只开不关」直接冲突；
  同理**不**改用 `referenceRef.click()` —— 它必冒泡，且若运行时给合成 click 的 detail 恰为 0，还会在波纹
  元素上再补出第二圈波纹。
- `BaseSelector` 的 `disabled` 只在 `activate` 一侧判：波纹该不该出由指令内部的 `wave()` 裁决（与本组件直接
  点击的守卫同源），但「开面板」没有任何默认拦截，漏判就会出现「键盘进不去（触发器 `tabindex` 已关）、
  鼠标反倒能开」的自相矛盾。
- 「退化为 `<span>` 的行点标签激活不了控件」这条判据**收窄为缺省行为**：仅对未声明 `selfActivating` 的控件
  成立，适用范围见下一条。
- **`BaseCheckbox` 另有一处同源缺口：控件自身的文字标签**（`label` prop / 默认插槽，如弹窗头部的「全选」）。
  它与勾选框同在组件的 `<label>` 内，点文字即可勾选，但波纹元素只有勾选框那一小块 —— 于是**全项目
  `BaseCheckbox` 唯一带可见文字标签的用法（`BackupModalsContainer` / `ChordModalsContainer` 的「全选」）
  恰恰是点上去没波纹的那个**。补法相同（往勾选框补一个 detail=0 且不冒泡的合成 click），但**必须跳过落在
  勾选框上的按压**：那条路径由指令自己的 pointerdown 监听负责，不跳过就是两圈波纹（外层 `<label>` 会收到
  来自勾选框的冒泡事件）。**`BaseSwitch` 的 `label` prop 位置同理**（`switch-label` 在 `<button>` 内、
  与轨道是兄弟节点，点文字即可切换但波纹元素只有轨道那一小块），此前因全项目零调用、`switch-label`
  从不渲染而按 §1.1 未接 —— 本轮经用户点名后补齐。两者的实现**必须不同**：开关的处理器挂**标签自身**，
  而标签是轨道的兄弟节点、指针不可能落在轨道内，故不需要那条「跳过波纹元素」的判断；复选框挂的是外层
  `<label>`，那个元素**包着**勾选框，所以必须显式跳过。派发物本身（detail=0 且不冒泡的合成 click）两处一致。
- **不接的控件与判据**（是「点击块唯一」，不是「好不好看」）：分段控件每段一块、`BaseNumberInput` 两个步进钮、
  `BaseInput` 还有一个清空钮 —— 点标签时没有唯一落点，波纹画在哪一块都是错的；`BaseTextarea` 无点击块，
  点标签只是聚焦、没有按下语义。与行标签 `cursor` 的口径完全对齐（两者同由 `labelIsClickable` 决定）。
- 行**刻意不判 `disabled`**：波纹该不该出现交给控件自己的 `v-wave` 选项裁决（指令内部即检查），行再存一份就是
  第二个真理源 —— 两边不一致时会出现「点标签没波纹、点控件反而有波纹」。行的 `disabled` 只管置灰标签与向插槽
  透传（是否真的禁用取决于控件自接，见该 prop 说明）。标签按下只认**主键**：标签的激活行为本就只由主键点击
  触发；控件侧 `v-wave` 的 pointerdown 监听不筛按键，本行不沿用那一档宽口径。
- 新增 `tests/ui/form/formRowWaveDelegation.test.ts`（8 例，`ui` project）钉住会静默退化的事，并以反向探针逐条
  证实有牙：①`bubbles: false` —— 冒泡会让合成 click 撞上开关自己的 `@click`，实测模型被写回两次（值回到原处，
  肉眼即「点标签没反应」）—— 这一条在**行标签**与**开关自身文字标签**两处各钉一次（后者是用户点名补齐的
  路径，且它的标签在 `<button>` 内，与前者不是同一个 DOM 位置，故必须各有一条锚点）；②**落在波纹元素上的
  按压不得补发** —— 摘掉该判断后，按勾选框会多记一次合成点击（即两圈波纹），断言准确变红；③`detail: 0` ——
  指令的 click 监听只认它，改了波纹静默消失且页面不报错。冒泡那条锚点在探针里特意排到后果断言之后，
  确认它能独立成立。断言对象是**委托出去的那个事件本身**（我们拥有的协议边界）——全局 setup 把 wave 指令
  换成了空实现，库内部的波纹 DOM 在单测里不可见。
- **选择器那两例是真实 `BaseSelector` 挂载**（不是桩）：断言前先钉住「行标签是 `<span>`」这个结构前提，否则
  用例可能在「闸门根本没被绕过」时假绿。正向那例按**时机**分两段断：按下后波纹已补上、但 `aria-expanded`
  **仍是 `false`**（这正是「一按就开」那个缺陷的回归锚点），`click` 之后才转 `true`，且波纹不因这次 click
  再添一圈（分工不可互换）。三条反向探针各自证实非空跑 —— 摘掉 `{ selfActivating: true }` 时委托整体失效
  （合成为 `[]`）；**把激活挪回 `press`**（即恢复缺陷写法）时按下就变 `true`、断言准确变红；`activate` 里摘掉
  `if (disabled) return;` 时禁用态面板照开。禁用那例只断言「面板绝不开」并钉住按下档的派发 —— 波纹该不该出
  由指令的 `wave()` 裁决，而全局 setup 把 wave 换成了空实现，单测里根本看不到它最后有没有画，对波纹断言必假。
- 顺带给 `tests/setup.ts` 补 **`ResizeObserver` 桩**：jsdom 不内置，且它比 `IntersectionObserver` 更常被撞上
  —— 任何一个浮层 / 滚动区（`BasePopover` → `BaseScrollArea`）挂载时都会构造一个，不补则上面那两例直接
  `ReferenceError`。刻意**不回调**：与相邻的 `IntersectionObserver` 桩不同，这里的回调链是「测量 → 写样式 →
  尺寸变化 → 再测量」，在 `observe()` 里同步触发会变成自激循环；而这些回调本就依赖真实布局（jsdom 的
  `getBoundingClientRect` 恒为 0），喂假数据只会让断言建立在假测量上。故 jsdom 下**不能**断言依赖实际尺寸的
  布局结果（滚动条显隐、边缘渐隐、虚拟滚动定位），那类场景应改用真实浏览器，本桩只保证「组件能挂载、
  能响应交互」这一层。
- 「合成 click 会被指令认下」这一点**有既有行为作保**：键盘 Tab 到控件后按 Enter / Space，浏览器派发的
  click 同样是 `detail === 0`，而指令正是为这条路径预留了该分支（真指针点击走 pointerdown）。故本机制不是
  新开一条通道，而是让「点标签」与「敲键盘」走同一条。
- 环境事实一并记下：**jsdom 26.1.0 没有 `PointerEvent`**，故行处理器只读 `button`、不做 `instanceof` 收窄
  （运行时收窄在测试环境会变成 `ReferenceError`）；`MouseEvent` 在 jsdom 里 `detail` 默认即 0、`bubbles`
  默认即 `false` —— 与本机制的两条核心假设恰好一致。这与 `tests/ui/composables/useLyricsDragDrop.test.ts`
  需自备 `MockPointerEvent` 垫片是同一条环境约束。

### 优化 · 分析候选增删时的排版补间（2026-09-24）

- `ChordAnalysisPanel` 的候选和弦片由裸 `v-for` 改为 `TransitionGroup`（`name="v-transition-list"`，类定义见
  `assets/transitions.scss` 第 6 节，与 `GroupSection` / `SongSection` 同一档）：候选随指板按音增删时，
  留下的片按 FLIP 滑到新位置、进出者各自淡入淡出并缩放，不再整块跳变。
- **每条候选必须包一层自身无过渡的普通元素壳**，不能把 `BaseBadge` 直接当 `TransitionGroup` 的子项 ——
  首版正是直接当子项，实测**完全没有动画**。两个原因：
  - ① `BaseBadge` 的模板在根元素之前有注释，dev 编译会把注释保留成 vnode ⇒ 组件根退化为**片段**。用本仓
    `@vue/compiler-sfc` 实测：`comments: true` 得到 `_createElementBlock(_Fragment, null, [ _createCommentVNode(…) …`
    ，`comments: false` 才是单个元素根。过渡钩子是沿组件根下发的，落到 Fragment 上没有元素可承接 ⇒
    enter / leave / move 一律不触发。这也是它在生产构建里不复现的原因（注释被剥离、根就是元素）。
  - ② 即便根是元素，`BaseBadge` 自带 scoped `.base-badge[data-v-*]` 过渡特异性（0,2,0）也高于列表三档的
    单类（0,1,0），会把 move 的 `$duration-base` / `$bezier-sidebar` 压成 `$duration-fast`，enter / leave 同理。
    实测：同一元素挂上 `v-transition-list-move`，其 `transition-property` 仍是
    `color, background-color, border-color, box-shadow, opacity, transform, translate, scale, rotate`，其中
    `transform` 为 0.1s 而非列表档的 0.18s。
  - 壳子两个问题一起解决：它是真元素（钩子落得上），自身不带 transition（列表档抢不走）。这与本仓既有写法
    一致 —— `ChordCard` 的根也是这样的壳，其注释明确要求「注释必须留在根元素内部」。
- **flex 布局必须从滚动区挪到组容器上**：组容器会成为滚动区里**唯一**的 flex 项，而 flex 项的宽度默认取内容宽
  —— flex / gap 若留在 `BaseScrollArea` 上，候选就再也不会换行、整行溢出。故把
  `flex flex-wrap content-start gap-1` 移交给 `TransitionGroup`，滚动区退为普通块级容器，布局结果不变。
- 壳子取 `flex shrink-0`：`shrink-0` 与原「徽章自己就是 flex 项且自带 shrink-0」等价；`flex` 则避免行内子元素
  产生行盒、在徽章下沿凭空多出一段基线空隙。组容器加 `relative`：`v-transition-list-leave-active` 会把离场元素
  转为 `absolute` 脱离流（留下的片才有空位可滑），定位基准就是它。空态分支刻意留在组外 —— 候选清零时整组卸载
  直接切空态框，那是面板整体换形态，不是列表增减。
- 不新增测试：`jsdom` 无布局（`getBoundingClientRect` 恒为 0），Vue 的 FLIP 根本不会产生位移与 `-move` 类；本仓
  §7 又明令禁止断言 CSS 类名与内联样式。故结论取自**真实浏览器实测**：无头 Chromium 里用真 Vue + 逐字复制自
  构建产物的 CSS 跑最小复现，对照「徽章直接当子项 / 包壳 / 片段根组件 / 元素根组件」四种形态，确认片段根子项
  收不到任何过渡类、而包壳后 `-move` 正常挂上且解析回 `transform 0.18s`。
- 顺带留痕（本次未动）：`BaseBadge` 的片段根不只影响本面板 —— 任何把它直接当 `<Transition>` /
  `<TransitionGroup>` 子项的地方在 dev 下过渡都是死的。根治要把 `BaseBadge` 模板里那两条注释挪进根元素内部
  （同 `ChordCard` 的做法），属独立改动。
- 减弱动效无需本处处理：`main.scss` 的全局 `prefers-reduced-motion` 会把所有过渡压到 0.01ms。

### 优化 · 聚焦反馈统一到平台顶层外扩环，不再各自为政（2026-09-24）

- **折叠面板**（`BaseCollapse`）：此前是全仓**唯一**自绘聚焦环的组件 —— 头部内挂一个 `absolute inset-0` 的
  覆盖子元素，用 `ring-2 ring-inset` + `group-focus-visible/head:opacity-100` 画环。现删去该元素，改为头部
  按钮标记 `data-focusable-outline`。自绘给出的两条理由都已被顶层环覆盖，属重复实现：①`ring` 画在**背景相位**，
  会被头部内任何带底色的子元素（业务自绘的吸附露出带等）盖住，故当时改用覆盖子元素；②外扩的环伸出头部边界后
  会被滚动容器的 `overflow` 裁掉上半圈 —— 而折叠头在侧栏、设置弹层、开发面板三处都是吸附头
  （`useStickyHeads` 下发 `sticky z-sticky`），恰好贴着容器可视上沿。顶层环挂 body 顶层、不受任何容器裁剪，
  且逐帧按「裁剪祖先 ∩ 视口」外扩 `RING_OUTSET` 绘制，贴边目标的外扩圈仍完整。观感上环从「贴头部内缘的
  2px 内描边」变为与全站一致的「外扩双色环」；
- **自绘滚动条的拇指**（`vScrollbar`）：它带 `tabindex="0"` 与 `role="scrollbar"`（方向键 / PageUp/Down /
  Home/End 可滚），但聚焦时唯一的反馈是 `:focus-visible` 让拇指淡入 —— 那只能说明「拇指在哪」，说不清
  「焦点在它身上」，还会露出原生描边。现补挂 `data-focusable-outline`，与其余可聚焦元素同一套反馈；
  该属性同时让环模块注入 `outline:none`，原生描边一并顶掉。拇指的淡入保留 —— 环要有可见的实体可环绕，
  而拇指平时是 `opacity: 0`。
- **标记带值也算数，只有显式写 `false` 才是关**（`focusRingOverlay.ts`）：`data-focusable-outline` 原先
  只按「属性在不在」判定（纯 `[data-focusable-outline]`，对值一视同仁），而 Vue 的布尔绑定在假值时渲染出的
  是 `="false"`、**不是**把属性摘掉（只有 `null` / `undefined` 才摘），于是
  `:data-focusable-outline="someBool"` 这种写法**关不掉** —— 环照旧画出来。现选择器改为
  `:not([data-focusable-outline="false"])`，与 `dom.ts` 里 contenteditable 那条同一个口径
  （`true` / 空串 / 只写属性名都算开，`false` 算关；认的就是这一个字符串，其余未知值不当成关）。
  注入的那条「清除原生 outline」规则**直接复用同一个选择器常量**，不另抄一遍：两条规则必须同时命中或
  同时落空，否则 `="false"` 的元素会既没有原生 outline、也没有顶层环，聚焦反馈彻底不可见。
  既有调用点全是裸属性或空串，故渲染结果零变化；`vGridNav` 的候选集合选择器刻意**不同步** ——
  它问的是「哪些节点可作方向键候选」，与「要不要画环」不是同一事实（带 `="false"` 的元素照样可聚焦、
  照样是候选）。新增 `tests/platform/focusRingSelector.test.ts` 锁住这套值语义（3 例）。

### 优化 · 新增 solid 派生算子与三个实心档，实心强调色底终于能放白字（2026-09-24）

- **动因是本文件第一段留下的那句「另议」**：`--text-on-solid` 当时只能授权给「非文本图形」（勾、减号、
  图标），因为白字落在**常规**强调色上先天不够 —— 亮色 success 2.22 / warning 2.20，连 WCAG 1.4.11
  的非文本下限 3:1 都保不住。要让 `filled` 徽章、勾选框勾选态这类**承载文字**的实心底用上浅色字，
  缺的不是一个色值，而是一族「压深到白字可读」的档位；
- **新增派生算子 `solid`**（`tokens/types.ts` 声明口径、`tokens/index.ts` 求值）：值 = 源色朝纯黑压深到
  「白字**恰好**过 AA 正文门槛（4.5:1）」的**最小整数档**。它和 `shade` 的差别不在公式而在**档位的来源** ——
  `shade` 的档位是观感档（人手挑的 `-12`），`solid` 的档位是**结果档**：由门槛反推。所以三主题写的是
  同一句话（`{ kind: 'solid', source: '--color-primary' }`），算出的压深量各不相同 —— 这**不是**
  「按主题手工覆盖某一档」（本目录明令禁止的那种，那会让同族同档在不同主题下口径不一），
  压深量只是源色明度的函数；
- 实现上刻意「整数口径取值、culori 只当判据」：色值仍由 `mixRgb` 的整数混合（四舍六入五成双）产出，
  `wcagContrast` 只回答「够了没有」。这样构建与测试共用**同一个判据**（不会出现「构建说达标、测试说不
  达标」），也不会把 culori 那套浮点插值引进色值 —— 那正是本目录当初弃用 `culori.mix` 的原因。
  线性扫描不设兜底分支：压到 100% 即纯黑、白字 21:1 必然达标，**恒有解**；真跑到 100 才返回的写法等于把
  「门槛被改坏」这件事暴露成一条极深的实心档，而门禁会当场报出来；
- **只给三族声明 `primary` / `success` / `danger`**（三主题各一条，共 9 个值）。当前取值与白字比值：
  亮色 `#0071ed`（压深 7%）/ `#23873d`（32%）/ `#de332a`（13%），白字 4.58 / 4.56 / 4.55；
  暗色 `#0975e3`（11%）/ `#1f8839`（35%）/ `#d93b31`（15%），白字 4.50 / 4.53 / 4.55；
  高对比 `#2d7abd`（26%）/ `#258651`（39%）/ `#c4514b`（23%），白字 4.54 / 4.56 / 4.54。
  压深量差得这么开正是这套算子存在的理由：同一个门槛下亮色 primary 只需 7%、高对比 primary 要 26%；
  照 `shade` 的办法手挑一个固定档，三主题里必有两个不达标，而挑三个不同的固定档就等于又回到
  「同族同档口径不一」。全部落在「刚好过 4.5」的最小档上，本身就是按门槛反推的证据；
- **`warning` 刻意没有这一档**：亮黄的白字上限约 1.9:1，压深到够用会把它压成深橄榄色、毁掉警示语义。
  它的实心底（徽章 `filled`、勾选框勾选态）一律配 `--text-on-accent` 深墨（≈ 9.6:1），
  这也正是「警示底配深墨」的通行做法 —— 于是「某族有没有实心档」这件事本身携带信息，而不是漏了一格；
- 三主题的 `--text-on-solid` 注释同步重写：授权范围从「非文本图形」改为「底必须是 `--color-<族>-solid`」；
  高对比主题原先写的「本主题不要消费本令牌」一并撤回 —— 那句与真实消费面不符（高对比下的勾选框一直
  用着它，且当时连非文本下限都没过），`@theme` 里三条转发注释同批更正；
- 门禁新增一组断言（`tests/tokens/colorTokens.test.ts`）：`--text-on-solid` 落三个实心档 × 三主题
  必须全部 ≥ 4.5:1，**且实心档必须比源色更深**（防「忘了派生、退化成常规色」）；期望值由 culori 现算、
  不写死色值。顺带补一条 `@theme` 守卫：转发**不许带兜底值**（`var(--x, #fff)` 会把「令牌不存在」
  静默变成「用了另一个颜色」，而 `readThemeForwards` 的解析也只认 `var(--x);`，带兜底的转发会被跳过）——
  当前 `tailwind.css` 零命中，属预防性断言；
- 一句话口径：**「实心底要放字」先换底色到 `bg-<族>-solid`，再用 `--text-on-solid`；底色是常规强调色时
  一律用 `--text-on-accent` 深墨。** 这条边界现在由测试守着，不再是注释里的君子协定。
- 已知残留（记在 `BaseCheckbox` 注释里）：悬停帧取的是常规强调色的提亮档（`group-hover:bg-lift-<族>-10`），
  浅色字在那一帧又回到饱和底，图形下限 3:1 在高对比主题下仍不保 —— 该帧等比改动前更差的情况并未变坏
  （改前常态底就只有 2.62:1）。要连悬停帧也严格达标，得再补一族「实心档 + 提亮」的令牌，本轮不做。

### 修复 · 审计第二轮：变更日志门禁补上远端关卡，脏分片不再假留（2026-09-24）

- **「只带汇总、漏带片段」的提交此前拦不住**（`.husky/pre-commit` + `.github/workflows/ci.yml`）：
  `changelog/` 是来源、`.github/CHANGELOG.md` 是派生。钩子每次提交都会重算汇总，但片段没跟着进索引时
  它只 echo 一句提示就 `exit 0` —— 钩子自己的头部注释写着「只提示，不替你做主」，与它本该防的事正好相反。
  于是这类提交在本地看不出任何问题（刚重算过、工作区是绿的），却把一份**别人克隆后 `changelog:check`
  必红**的失配留在了历史里。现钩子直接 `exit 1` 拦下，并给出 `HUSKY=0` 的显式绕行方式；CI 补上同一道
  关卡的远端版本（`pnpm changelog:check`，放在安装依赖之后、Lint 之前 —— 它不需要工具链，纯内容一致性，
  失败得越早越好）。**本地那道可以被 `HUSKY=0` 绕过，远端那道不能**，缺一边都不算门禁；
- **未转录的歌曲分片不再「原样保留」**（`migrateLegacy.ts`）：上一轮把分片的删除判据从「按前缀」改成
  「逐条已落库」，未转录的分片于是被留下并写进日志。但退役标记 `RETIRED_FLAG_KEY` 就在同一函数里更早
  落下，下次启动 `:187` 的短路让整个函数直接 `return`，运行时也不再回读 `localStorage` ——
  那些分片**已经**没有任何读取路径了。旧文案（「已原样保留以免不可逆丢失」）等于把一件已经发生的事写成
  一个占位符，读起来还像「将来能补」。现分片一律随本次退役一并删除，代价如实写进注释：
  **解析失败的那首歌从此不可见、也不可恢复**；日志保留一条如实记名的 warn（「已随本次退役一并清除
  （不可恢复）」），不再写「保留」。`TranscriptionResult` 的 `retainedNote` 与 info 日志里的
  「（保留 N 个…）」一并去掉 —— 报一个不存在的保留量比不报更误导；
- `tests/core/migrateLegacy.test.ts` 三条断言随之改口径（它们此前断言的正是「脏分片被保留」）：
  单曲损坏、仅有损坏分片、被宽容清洗丢弃的分片，三种场景现在都断言该分片为 `null`。
  连 `bootstrapRobustness.test.ts` 共 12 例通过；
- **两处注释失真**：①`WorkbenchVariantsPanel` 的缩略图注释写「顶部对齐以保证所有卡片的琴枕与空弦基准
  高度恒定一致」，而实现是 `justify-center`（卡片在容器 `items-stretch` 下被拉成等高，居中的是缩略图
  自身）—— 同一分组里 `fretCount` 可为 3/4/5，画布高度随品数变，**居中之后琴枕基准本就不再逐卡对齐**。
  这是有意的观感选择（不同品数的卡片在视觉重心上更均衡），故保留居中、把注释改成如实声明这条取舍，
  并写明「要恢复逐卡对齐，把 `justify-center` 改成 `justify-start` 即可」；②`tokens/themes/light.ts`
  的 `--text-on-accent` 注释写「四个强调色」，而 `--color-info` 是上一批新增的第五个语义色，改为「五个」
  （同一段里的实测比值表本来就是五行）。

### 优化 · v-scrollbar 的 overlay 可委托给上级节点显示（2026-09-24）

- `overlayParent` 新增**选择器字符串**形态：从**宿主父元素起** `closest()` 向上找最近命中的祖先，拿它当
  注入点兼坐标系基准 —— 即「把滚动条委托到上级显示」。**只换注入位置**：滚动、拇指行程、轨道点击、
  气泡读数等逻辑一概不动，几何仍走 `getHostOffset` 沿 offsetParent 链累加（容器被补上定位上下文后必然
  出现在链上，链尾就是它；中间层是 static 时会被链跳过，累加结果同样正确）。
- 口径对齐 v-tooltip / v-marquee 已有的「委托上级节点」（两者的 `trigger` 都收选择器）：**挂载期解析一次**，
  **命中不到时回落宿主父元素**（而不是不挂）—— 同那两处「宁可退化成默认形态，也不要静默不生效」的取向。
  **起点取父元素而不是宿主**，这是与那两个 `trigger` 的唯一差别：`closest()` 含自身，而滚动条绝不能挂进
  滚动容器内部（absolute 子元素锚在 padding box 上，宿主一滚它就跟着内容走、拇指当场失效，还会混进宿主
  的直接子元素被尺寸观察逐个登记）—— 故「把传给宿主的 class 写进选择器」这类写法会退化成默认形态，
  而不是产出一个看着像生效、实际不滚的滚动条。原有「传元素 / 传函数」两种写法与默认行为逐字不变，
  `BaseScrollArea` 的 `:scrollbar` 原样透传（`{ ...value, direction }`），选择器形态开箱可用。
- 用它可以不再为「宿主父元素是 Vue 在 diff 的容器」或「父元素带尺寸/裁剪约束」而专门加一层壳
  （ChordAnalysisPanel 与 BasePopover 现在各有一处为此写的壳 + ref）：把滚动条挂到已知的上级即可。
- 已知边界（**未改，属既有性质**）：`overlayParent` 的值在运行期改变不会搬动已挂好的 overlay —— 它不在
  `structuralFingerprintOf` 的判据里；这对原有的元素 / 函数两种形态早就成立，不是本次引入的。
  要连这条一起收口，须同时把 `updated` 里构造候选 state 用的 `el.parentElement` 换成 `resolveOverlayParent`
  并把 `state.parent` 登记进指纹，属另一轮的事。

### 修复 · 滚轮从横向条带滚进相邻面板时滚动被抽回（2026-09-24）

- **`v-wheel-scroll` 的交接期新增「让位守卫」**（`vWheelScroll.ts`）：`handOffToOuter` 把余量交给外层祖先后会
  对外层起一条逐帧写 `scrollTop` 的缓动，但外层自己那份 `v-wheel-scroll` 处于 `disabled`（`BaseScrollArea`
  的 `wheel` prop 默认 `false`）⇒ 落在它身上的滚轮**从不被 `preventDefault`**，浏览器原生滚动在同一条轴上接手，
  与缓动抢同一个 `scrollTop`：容器被推过目标几十像素，缓动再反向追回 —— 表现就是「滚过头又被拉回」。条带滚出
  光标后事件不再经过条带 handler，这一条尤其容易触发。
- 交接成功后（仅 `smooth` 档）在**交接目标**上挂捕获相 `wheel` 监听，把落在它身上的位移按同一倍率累加进
  `performSmoothScroll(target, axis, delta)` —— **同一份状态条目、同一个 rafId、同一个目标值**，让位窗口内这一轴
  只剩一个写入者。三条放行：组合键（浏览器手势）、**落在任一生效宿主内部**的事件（守卫在捕获相先于宿主 handler，
  不排除就会双计）、本轴已无缓动在跑（缓动停了必须把该轴交回原生，不能继续吞）。
- **一个交接目标可以被多个宿主让位**（同层两条横向条带都向同一个外层容器让位）：守卫登记项只保留「最近一次让位
  宿主的倍率」，新源**并进**既有守卫而不另挂一个。旧实现拿 `state.disposeGuard` 当「已挂」判据、非空即 `return`，
  于是第二个宿主不挂守卫、它的事件却被既有守卫按**第一个**宿主的倍率收走（排除判据也只认第一个源）—— 同一条
  事件记两次、倍率还取错。排除判据随之改为「事件是否落在**任一生效宿主**内部」，沿祖先链查宿主登记表而非维护
  一份源集合：WeakMap 不可枚举但**可按元素查**，于是不需要任何登记/注销逻辑，也就不会漏摘；`disabled` 的宿主
  不算「会处置」，否则那块区域在让位窗口内会两个写入者都不动。
- 守卫摘除挂在 `performSmoothScroll` 新增的唯一收尾出口上，并**刻意不依赖诊断开关** —— 否则关掉日志就等于
  永久吞掉那个容器的滚轮。
- 判据：**交接的语义是「把这一轴让给外层」，就必须同时保证外层在缓动期间不被原生滚动插手**；只交出位移、
  不接管事件，等于把同一条轴交给两个写入者。

### 修复 · 拖拽排序时面板内的横向滚动位置被静默丢掉（2026-09-24）

- **`useSortableList` 新增子树滚动偏移的保全**（`useSortableList/scrollOffsets.ts`）：Sortable 换位与落定后的
  keyed diff 都靠 `insertBefore` 搬 DOM，被搬节点先脱离文档再插回去，整棵子树随之失去 box —— 而按规范
  **没有 box 时 `scrollLeft` / `scrollTop` 一律读作 0**，重新插入后偏移从 0 重新开始，且**全程不派发 `scroll`**。
  表现是「面板卡里的横向条带滚到一半，拖动排序后弹回最左」；更麻烦的是 `v-edge-fade` 的三个重测信号
  （自身 `scroll` / `ResizeObserver` / `MutationObserver`）一个都不响，`--fade-start` 停在上一步滚动时写下的值上
  —— 位置已经回到最左、羽化却还在。
- 起拖时记下容器**子树**里真正被滚动的元素（偏移非 0 的），每次 Sortable 搬完 DOM（`onChange`）与落定后的
  `nextTick`（与 `playFlip` / `preview.settle` 同拍，此刻 DOM 已是最终顺序且尚未绘制）按元素引用写回。
  回填**只在该轴当前读到 0 时才写**：搬动确实清零了就写回原值；没被搬动的元素（大多数 onChange 只搬一两张卡）
  与拖拽期间用户自己滚过的位置一律跳过，既不产生多余写入也不跟用户抢值；已脱离文档的元素（拖拽期间列表被增删、
  或被 Vue 换掉整批节点）直接跳过。写回会派发 `scroll`，`v-scrollbar` 的拇指与 `v-edge-fade` 的羽化随之同步。
- 判据：**祖先被搬动导致子树滚动被丢，没有任何原生 API 可观察**（`scroll` / RO / MO 全不响），所以不去追信号，
  而是在搬动前后保住值本身 —— 位置没变，所有消费者自然正确，也不必各自去补「复位后重测」。
- 落在共享组合式上，三个排序列表（工作台面板列 / 歌曲列表 / 分组列表）同源受益，不局限于工作台。

### 修复 · 拖拽影像上的滚动位置恒为零、与本体不一致（2026-09-24）

- **影像克隆补上滚动状态**（`useSortableList/scrollOffsets.ts` 新增 `mirrorScrollOffsets` + `preview.ts`）：
  `cloneNode` 不复制 `scrollLeft` / `scrollTop`，副本里每个元素都从 0 开始 —— 拖一张内含横向条带的面板卡时，
  影像上那条滚到一半的条带显示成贴左，与旁边的原位元素对不上。
- 两侧结构同源、文档序一一对应，按下标配对即可；但**配对与写回必须分两步**：配对要赶在「摘副本里的波纹容器」
  这类会改动结构的清理之前（否则两侧子元素数量不再相等、按序配对整体错位），写回要等影像挂进文档之后
  （没有 box 的元素写 `scrollLeft` / `scrollTop` 是空操作，值不会留到挂载那一刻）。两侧数量不等时放弃配对，不猜。
- 判据：**克隆是「同一份视觉」而不是「同一份结构」** —— 凡是靠节点自身状态表达、又不随 `cloneNode` 走的东西
  （滚动偏移、canvas 位图）都得显式搬一次，本文件里这两处现在是同一个套路。

### 修复 · 失效文字被抬到与次级文字同亮，压回 muted 之下（2026-09-24）

- **`.dark` 与 `[data-theme='high-contrast']` 的 `--text-disabled` 改为「`--text-muted` 朝纯黑压深 35%」**
  （dark `#98989d → #636366`、HC `#b9b9c4 → #78787f`）：上一批「禁用态由整元素 `opacity-35` 改为令牌三件套」
  之后，失效文字从「`--text-body` 打 35% 透明度」（dark ≈ `#656567`）换成了 `#8e8e96` —— 后者当初是为过
  axe 的 color-contrast 提上来的，落面板 5.23:1，与 `--text-muted` 的 5.93:1 只差 0.04 亮度，**失效文字读起来
  和次级文字一样重**，「失效」这个状态就没有视觉承载了。改后 2.84:1 / 4.27:1，明显低于各自主题的 muted。
- 写成**派生**而不是写死色值：这样它永远跟着 `--text-muted` 走，不会哪天又被单独提亮回去。
- **两件事互斥，此处取「失效就该看起来失效」**：WCAG 1.4.3 明确豁免失效控件，本仓自己的门禁也据此把
  `--text-disabled` 排除在正文三档之外（`tests/tokens/colorTokens.test.ts` 的 `READABLE_TEXT_TOKENS`）——
  规范上并不要求它达 AA，那个值是被外部扫描器逼出来的。代价是 axe 的 color-contrast 会对禁用控件报一项，属已知豁免。
- `.light` 不动：它的 `--text-disabled` 落面板仅 1.63:1（muted 5.20:1），本就在 muted 之下；且上一批改完后
  它是**变淡**（1.84 → 1.63），方向与深浅两主题相反。
- 顺带修正 `light.ts` 里滚动条拇指那条注释：原理由「暗色下 `--text-muted` 被提亮、两态会几乎同色」在本次改动后
  不再成立，改为记录真正的理由（文字层级档 vs UI 面，取值口径本就不同）。

### 修复 · 顶栏图标按钮的启用态与禁用态几乎同色（2026-09-24）

- **上一节把失效文字压深之后，顶栏的 ghost 图标按钮反而更分不出禁用与否** —— 根因不在令牌取值，而是
  **启用档直接取了禁用档**：`BUTTON_GHOST_THEME_MAP.default` 的静止前景原本就是 `text-fg-disabled`，
  与禁用列 `BUTTON_DISABLED_THEME_MAP.ghost` 的 `disabled:text-fg-disabled` 是**同一个颜色**，
  于是「禁用前后」在色值上根本无从区分（`ActionButton` 的 `color` 默认 `default`，顶栏那排 8 个 ghost
  图标按钮、颜色模式触发器与 GitHub 按钮全部命中）。
- 静止档改为 `text-fg-muted`（悬停仍是 `text-fg-body`），这一族终于有得可降，形成
  **disabled < 静止(muted) < 悬停(body)** 三级。
- 顺带纠正一处误用：静止档是**启用中的可交互图标**，受 WCAG 1.4.11（非文本 3:1）约束，
  而 `--text-disabled` 在亮色主题落面板只有 1.63:1，本就够不着 —— 取它作启用态前景从两个方向都是错的。
  `--text-muted` 亮色 5.20:1 / 暗色 5.93:1 双双达标。
- **影响面如实记下**：`BUTTON_GHOST_THEME_MAP` 是共享样式，除顶栏外另有约 10 个文件的 ghost 按钮
  （`SidebarLeft` / `DevPanel` / `GlobalNotification` / `BaseModal` 等）静止前景同时变深一档 ——
  这是修根因的必要代价，而非范围蔓延。
- 该映射表的唯一消费方是 `ActionButton.vue`，全仓无任何测试挂载 `ActionButton` 或断言这些串，故无回归可跑。

### 修复 · 换主题时预览先撤空旧页流再重渲，两套配色不再同屏（2026-09-24）

- 换主题与改排版走的是同一条重渲触发链（**主题本就是内容键的一个维度**），而这条链此前一律按「逐页覆盖」
  上屏：屏上挂着另一内容键的旧图时逐格换成新页，不清页流、不闪骨架。这在改排版时是对的（旧图只是版式旧了，
  配色仍然正确，用户正盯着调字号，留着有对照），在换主题时却是错的 —— 旧图的**整套配色**（纸底 + 墨色）
  都错了，逐页覆盖期间两套配色的图同屏，看着像渲染坏了；渲染再快也总有几页残着上一个主题的底色；
- 两路按 `ScorePreviewPane.vue` 新增的 `consumeThemeChange()`（比对「上次上屏时」的主题，**调用即推进基准**）
  分流：换主题 → `applyEntry(null)` 撤空页流（旧图当场消失、模板铺骨架）+ `currentContentKey = ''` +
  `debouncedGenerate()`；改排版 → 维持 `debouncedGenerate(true)` 的逐页覆盖。撤空后 `pages` 为空，
  `generate` 的 `canStream` 自然为真，新主题照旧**逐页流式**铺开，只是开头多一帧骨架。
  - 判据：**「旧图还能不能留着」取决于旧图的哪一部分错了**。版式错了可以逐页覆盖（旧图仍是本主题的正确
    配色）；配色错了必须整批撤换 —— 两套配色的补间没有任何中间态是有意义的。
- 休眠期间（`activeContentKey` 为空、watcher 早退）刻意**不消费**这个标记：那时并没有重渲，标记必须留给
  `onActivated` 的唤醒守卫，否则切回预览时屏上会一直留着旧主题的图（这才是「渲染得快反而更像卡住」的来路）。
  唤醒守卫的判据随之从「内容键变了」扩为「内容键变了**或**主题变了」，并在这一支上分流：
  - 缓存里已有该主题的**完整**一套 → `adoptCachedRender` 整批换图（比「撤空再逐页铺」更快也更稳，且不必闪骨架）；
  - 缓存缺页 / 有洞 → 同样撤空（此前只判 `!cached`）：留着旧配色的图与新页同屏正是本次要消灭的现象。
- 缓存侧的判据无需改动、也**不能**改：`buildScorePageLevelKey` 本就含生效主题，`findInheritSource` 要求页级段
  逐字相同 ⇒ 跨主题的按页继承早被否决，这一轮必然是整谱重画，撤空页流不会白撤。「换主题不复用旧页」这条
  不变量由两个**已测**判据合起来保证（`tests/ui/scoreRenderCacheKey.test.ts` 的「生效主题进键」+
  `tests/ui/scorePreviewCache.test.ts` 的「页级段不同即不继承」），本次改的只是**上屏时机**，
  故未新增用例；组件自身的两路分流（watcher / onActivated）无组件级渲染测试可挂，属手测路径。

### 新增 · 两态图标切换走线条级形变（2026-09-24）

- 新增 `BaseMorphIcon` 与 `iconMorph`：在两个图标之间做**线条级形变** —— 旧图标的笔画就地变形为新图标，
  而不是把旧图标换掉、新图标出现。**零依赖**：逐段端点插值 + 一条 `cubic-bezier` 求值器，不引动画库
  （这个 pair 本质是「四个端点各走一条线」，而任意两条直线段之间插值在数学上没有失败模式）；
- **适用范围刻意收窄**：只覆盖 `d` 里全是 `M`/`L`/`H`/`V` 的图标对（plus / minus / check / x / chevron /
  arrow / menu 这一类）。含 `C`/`A`/`rect`/`circle` 的图标（play / pause / trash / copy / star / heart…）
  没有可配对的直线段，同时渲染会叠影；跨结构变形须先把曲线转成贝塞尔并让两侧命令数逐项对齐，
  那是 flubber / MorphSVG 那类库的领域，不在本能力内；
- **未登记的图标对自动退化为直接切换**，不会画错也不会留白 —— 段数据是按对人工登记的，
  漏登记时应当「少一个动画」而不是「少一个图标」；
- **真实成本在人工挑端点映射**（不在补间引擎）：端点顺序决定每个端点往哪边跑，配错会出现「对穿」
  （中间帧两根线互相穿过对方）。启发式是让两侧的 a 端落在同一侧（都靠左下 / 都靠上），端点位移就都是
  就近小步挪。故段数据的端点顺序**属于配对、不属于图标**，同一图标换个搭档可能要用完全不同的顺序；
- 段数不等靠「零长度占位段」补齐，占位位置取另一侧对应段的**中点**，生长与收拢都落在视觉重心
  （取 `(0,0)` 之类的固定点会让线从视口角落飞进来）。占位段长度趋零时输出单个 `M x y` 而非
  `M x y L x y` —— 后者在 `stroke-linecap: round` 下会被圆头端帽画成一颗直径等于描边宽的**圆点**；
- 缓动在 JS 侧求值：`platform/utils/motion.ts` 新增 `compileEasing`，把 CSS 缓动写法编译成 `t → 进度` 的
  求值函数。补间改的是 SVG 的 `d` 属性，而 `d` 不是可插值属性（CSS `d` 插值 Firefox 至今不支持），
  transition 驱动不了它。缓动的**定义**仍只有 `constants.ts` 一处，`compileEasing` 只做「字符串 → 函数」
  的编译，不新增第二份控制点字面量；
- 首处接入：**指板横按气泡的「标记 / 取消标记」**（`plus` ↔ `check`），由原来的两个 `BaseIcon` 二选一
  改为单个两态图标，切换时「+」就地张开成「✓」。减弱动效偏好下直落终态；缓动编译失败同样直落
  （宁可没动画，不可卡在中间态）。

### 修复 · 隐藏后的交互式 tooltip 不再拦截指针（2026-09-24）

- **根因是「可命中性」与「可见性」各管各的**：浮层是 `position: fixed` 的**单例**，隐藏后尺寸与位置仍停在
  上一个 tooltip 处；而 `opacity: 0` **不影响命中测试**（只有 `visibility` / `display` / `pointer-events`
  才退出），交互式浮层的 `pointer-events: auto` 又只在显示时被打开、隐藏时从不重置 ⇒ 鼠标移到 tooltip
  原位就被它接走。**用户可感知**：顶栏 GitHub 图标的 tooltip 移开后，浮层原位置点不动，紧邻的主题 / 同步
  图标点不进去。
- **它还会自锁**：指针被浮层接走 ⇒ 下层元素收不到 `mouseenter` ⇒ 新 tooltip 永不显示；而浮层自己的
  `mouseenter` 又会 `clearTimers()`，把「淡出后设 `visibility: hidden`」那道收尾一并清掉（那段收尾本是为
  「移入浮层不收起」服务的）⇒ 该区域**永久不可点**，且没有任何东西能把它恢复。故自锁不是叠加的第二处缺陷，
  而是同一条缺失不变量的必然结果。
- 修法：新增 `setBoxClickThrough()`，把「可命中性」提升为与「可见性」成对维护的不变量 —— 显示时按
  `interactive` 打开，两条隐藏路径（淡出 / 即时）都显式关闭。淡出期间不能设 `visibility`（会打断动画），
  命中测试只能靠 `pointer-events` 摘，故摘的时机必须与「压 opacity」同刻，不能只依赖收尾的
  `visibility: hidden`。
- 顺带修正打开时机：`pointerEvents` 的赋值由 `executeShow` 前段移到 `await updatePosition` **之后**的显隐块
  里 —— 原来在 await 期间浮层还是上一轮遗留的 `opacity: 0 + visibility: visible`，提前设 `auto` 等于在它
  还没显示时就先开始吃指针。
- **交互式浮层的时间窗不受影响**：移出触发元素后的最小隐藏延迟（`TOOLTIP_INTERACTIVE_MIN_HIDE_DELAY_MS`）
  内浮层仍可命中，「跨过间隙移入浮层」照旧成立；只有越过这个窗口、淡出真正开跑之后才转为穿透。
- 新增 `tests/ui/directives/vTooltipHitTest.test.ts`（3 例）：交互式「显示时可命中 → 移出瞬间仍可命中 →
  越过窗口后穿透（且此时 `visibility` 仍是 `visible`，即穿透确实由 `pointer-events` 兜住）」、非交互式
  显示时也不接指针、以及立即隐藏路径（失焦）同样穿透。两条反向探针各自证实非空跑（摘掉淡出路径那次
  第一例红，摘掉即时路径那次第三例红）。断言对象是浮层根元素上的内联 `pointer-events`（我们拥有的
  不变量）—— jsdom 不做命中测试、`dispatchEvent` 也完全不看它，「点击能否落到下层」只能在真实浏览器里看。

### 优化 · 浮层面板接入宽度过渡，但打开过程不播（2026-09-24）

- `BasePopover` 的面板挂上 `v-auto-width`（挂在组件内、故所有 popover 一并生效）：面板宽度变化时平滑
  补间，不再跳变。
- **打开过程刻意不补间**，这正是本处唯一需要额外接线的地方：面板每次打开都会**重新挂载**，而挂载那一刻
  宽度还没定稿 —— 打开流程是「宿主先落到锚点 → 面板上屏 → 再复算一次」，等宽（`matchTriggerWidth`）
  走的是 floating-ui 的 size 中间件、写的是**浮层宿主**的宽，要到那次复算才生效。宽度指令在挂载时记下的
  基准于是是「内容自然宽度」，随后被等宽改写 ⇒ 表现为**打开时宽度从内容宽度动画到等宽宽度**。
  故指令在打开过程结束（入场过渡收尾）前保持禁用，那一刻宽度已定稿，基准才是有意义的起点。
- 判据：**「基准」必须取在尺寸定稿之后**；指令的 `mounted` 只说明「元素进了 DOM」，不等于「尺寸已定」。
  面板每次打开都重新挂载，故这条对每一次打开都成立，而不是只对首次。
- 未为该行为新增单测：jsdom 无布局（`getBoundingClientRect` 恒为 0、`ResizeObserver` 桩不投递）、
  过渡也不推进，任何断言都会建立在假测量上（AGENTS §7.1 的垃圾用例）。

### 优化 · 图标形变改为 BaseIcon 内建、由图标名变化自动触发（2026-09-24）

- `BaseIcon` 新增 **`morphDisable`（默认 false，即形变默认开）**：`name` 变化时，若两侧图标在
  `iconMorph` 里登记过配对，就地把旧图标的笔画变形为新图标。调用方**只需换 `name`**，不必声明
  「从哪个图标到哪个图标」，也不必传开关值。开关取「关闭」这一向而非 `morph = true`：默认开的开关用
  正向命名时唯一写法是 `:morph="false"`，而默认关的开关在模板里能写成无值的 `morph-disable`，
  与全项目其它布尔属性同一种读法。
- 上一轮为此新建的 `BaseMorphIcon` **已删除**：它是「两态图标」这一个用法的专用组件，而能力本身属于
  `BaseIcon` —— 任何换 name 的地方都该受益，专用组件只会让下一处用法再抄一遍。
- 形变分支用自绘 svg 承载逐帧 `d`（配对登记见 `iconMorph.ts`），**其余情况一律渲染图标组件本身**，
  故不改变任何图标的既有渲染结果。补间首尾两帧与两侧图标的几何逐段等价，两个分支互相切换不会跳变。
- **形变途中又换名**：以「当前这一帧的段」为起点重新配对 —— 沿用登记表的起点段会跳回起点图标
  （连点两下会看到闪回）。
- **起点取首帧的时间戳，不取 `performance.now()`**：两者按规范同源于 timeOrigin，但并非所有环境都真的
  对齐（jsdom 下相差上千毫秒），混用会让首帧算出**负进度**、几何被外推到画面之外。
- 首处接入：指板横按气泡的「标记 / 取消标记」由 `BaseMorphIcon` 换成
  `<BaseIcon :name="… ? 'check' : 'plus'" />`，观感与上一轮一致。

### 优化 · 默认开启的布尔 prop 一律改为反向命名（2026-09-24）

- 全项目「默认 `true` 的布尔 prop」统一改为**反向命名**，使调用方在模板里写无值属性即可关闭，不必再写
  `:prop="false"`：`showXxx` → `hideXxx`（`showClose` / `showFooter` / `showButtons` / `showReadout` /
  `showZero` / `showChordName` / `showBarre` / `showBoldNut` / `showFretNumbers` / `showOpenStringNotes`）、
  `closeOnXxx` → `keepOnXxx`（外点 / Esc / 失焦 / 点触发区四档）、`destroyOnClose` → `preserveOnClose`、
  `emphasizeOnExpand` → `noEmphasizeOnExpand`、`safeAreaInset` → `noSafeAreaInset`、`mask` → `noMask`、
  `keyboard` → `noKeyboard`、`intercept` → `noIntercept`、`draggable` → `noDrag`、`autoIncrement` →
  `noAutoIncrement`、`spellcheck` → `noSpellcheck`、`visible` → `hidden`、`editable` → `readonly`、
  `bordered` → `borderless`、`centered` → `topAligned`、`searchSynced` → `searchUnsynced`。
- 起因是 `BaseIcon` 的形变开关：默认开的开关用正向命名时唯一写法是 `:morph="false"`，反向命名后能写成无值的
  `morph-disable`，与全项目其它布尔属性同一种读法。同一条判据适用于所有默认 `true` 的开关，故一并收口 ——
  与 ESLint 的 `vue/prefer-true-attribute-shorthand`（禁止 `:prop="true"`）取向一致：默认态由默认值表达，
  模板里出现的永远是「与默认不同的那一档」。
- 命名口径：能自然取反义词的用反义词，没有自然反义词的用 `no` / `Disable` 前缀。`GlobalNotification` 的
  `teleport` 并入既有的 `disabledTeleport`，与其它浮层组件同族。
- 涉及 `BasePopover` / `BaseMenu` / `BaseInput` / `BaseTextarea` / `BaseNumberInput` / `BaseDrawer` /
  `BaseModal` / `BaseFloatingPanel` / `BaseFab` / `BaseFloatingPill` / `BaseSlider` / `BaseBadge` /
  `BaseCollapse` / `BaseSegmentedControl` / `GlobalNotification` / `FretboardCanvas` 共 16 个组件，以及全部调用方。
- **行为逐项等价**：每个 prop 的默认值与其全部引用点的判据同步取反（`p` → `!q`、`!p` → `q`）；条件分支与
  三元里的两臂一并换位，避免「名字反了、逻辑没反」。`FretboardCanvas` 传给渲染管线（`renderFretboardCanvas` /
  `fretboardGeometry` / 导出 worker）的 opts 名保持不变 —— 那套名字是几何与位图键的一部分，只在组件边界做取反转换。
- **未纳入**：`BaseScrollArea` 的 `fade` / `scrollbar`。二者是多态选项（`boolean | number | string | 选项对象`），
  `false` 本就是其类型内的合法取值之一、用于表达「关闭」这一档，反向布尔命名会丢掉数值与选项对象档。

### 修复 · 徽标的根退化成片段，dev 下父级 class 静默丢失（2026-09-24）

- **根因不在组件逻辑，而在模板的第一个节点是注释**：`@vue/compiler-dom` 的解析器**默认保留**注释节点
  （实测 `baseParse(src, {})` 与 `{comments:true}` 产出相同的子节点序列），而本仓 `vite.config.ts` 的
  `vue()` 只设了 `whitespace` 与 nodeTransforms、**没有** `compilerOptions.comments` —— 于是根被编译成
  `_createElementBlock(_Fragment, null, [_createCommentVNode(…), …])`。
- **后果**：Vue 的 attrs 回落只对「单元素 / 单组件根」生效，片段根下父级传的**非 prop 属性被直接丢弃**。
  全仓 9 个消费方里 `DevPanel` 有两处传了 `class="mt-1"`，即 dev 下徽标少一档外边距、并伴随一条 Vue 警告；
  `Transition` 钩子沿组件根下发，落到 Fragment 上同样没有元素承接（本组件的叠加模式无人使用，故未命中这条）。
- **只在 dev 复现**：生产构建会剥离模板注释、根回到元素 —— 已用刚构建的 `dist/assets/*.js` 核实（36 个文件里
  模板注释文本零命中）。这也意味着**「根是元素还是片段」不是源码可目测的属性**，凡涉及 attrs 回落 /
  过渡钩子的问题，先看编译产物再下结论。
- **做法**：把两处描述根节点的注释移进各自分支**内部**（与本仓既有约定一致：注释必须留在根元素内部，
  见 `ChordAnalysisPanel.vue` 的那段说明）。改完编译产物回到 `hasTarget ? span : component` 单根。

### 工程 · 工装补三道门：bench 回归哨兵、worker 类型检查、形变测试去抖动（2026-09-24）

- **bench 从「信息性输出」变成真哨兵**：与新增的 `scripts/bench-baseline.json` 比**倍率**，超 3x 才 `exit 1`。
  比倍率而不是绝对毫秒，是因为 CI 共享跑机噪声能差出数倍、绝对阈值必抖。基线缺失时退化为信息性输出并提示
  `pnpm bench:baseline` —— 那是「哨兵未启用」，不是「静默通过」。**代价要认**：基线是**机器相关**的，
  换机器 / 换 Node 大版本后需重录；且本仓目前**尚未提交基线文件**，哨兵要等跑一次 `pnpm bench:baseline` 才真正生效。
- **`worker/` 纳入类型检查**（此前不在任何 tsconfig 的 include 内）：新增 `tsconfig.worker.json`
  （`allowJs + checkJs`，**刻意不开 strict** —— worker 全仓 0 处 JSDoc，开了只会刷出成百条「可能是 undefined」
  把真问题淹掉）与 `worker/bindings.d.ts`（手写 D1 与绑定的最小声明，只覆盖用到的面；不引
  `@cloudflare/workers-types` 的代价是这份 shim 会与真实 API 漂移，已写在文件头）。`index.mjs` 的
  `new Hono()` 补上 JSDoc 泛型断言，使 `c.env` 不再是无类型的 `unknown` —— **绑定名拼错现在能在本地/CI 就红**
  （负向验证：把 `c.env.DB` 改成 `c.env.DBB` 即报 TS2339）。已挂进 `pnpm verify` 与 CI。
- **`BaseIconMorph` 测试不再实等 600ms**：改为假时钟推帧。踩到的一个坑记在这里：假时钟的 rAF 按 16ms/帧、
  且**首帧落在 t=16 而非 t=0**，故「推进 180ms」只够跑 11 帧、进度停在 0.98 附近，断言会看到中间态 ——
  必须推进 200ms 以上。改完后该用例从「等一个比时长大的实数」变成确定性断言，文件整体从 600ms+ 降到 60ms。
- **`useResponsive` 保留，但补上到期条件**：把「有意预留」写成三条可判定的触发条件（三项都明确不做时应删除
  本文件），免得每轮审计都要把同一段论证重来一遍。仅改注释，实现未动。

### 优化 · 选择器触发器尾部的箭头与清空叉接上形变（2026-09-24）

- `BaseSelector` 触发器尾部原本是**两个 `BaseIcon` 换 `display`**（清空叉 `hidden` + `group-hover:block`、
  箭头 `block` + `group-hover:hidden`）：`display` 不可过渡，形态切换是瞬切；两个 `name` 又都是写死的常量，
  形变引擎（`BaseIcon` 的 `watch(() => name)`）一次也等不到 —— 这正是「明明已经写了图标动画却不生效」的来路。
- 改为**一枚常驻图标换 `name`**：悬停或聚焦触发器时由 `chevron-down` 就地向两侧张开成 `x`，移开后合回箭头；
  新增登记对 `chevron-down:x`（两侧各两段、段数相等，无需占位段）。hover / focus 由纯 CSS 提为 JS 状态，
  命中范围与原 `group-hover` / `group-focus-within` 一致 —— 仍是挂在触发器根上，悬停任意位置即出清空叉。
- **清空形态的判据含「浮层在途」**，不只是 hover / focus：面板一打开，焦点就被移进面板里的选项或搜索框
  （teleport 出去的独立浮层，不在触发器内），指针也多半已离开触发器去点选项 —— 只认 hover / focus 的话，
  清空叉会在打开的那一瞬间缩回箭头，而那一刻恰恰最需要清空入口（面板已展开、值还没改）。
- **「在途」要一路盯到离场收尾**，不能止于「不算打开」：`close()` 一瞬就把打开态置假，而 popover 把焦点
  归还给触发器是在**离场动画结束**（`handleAfterLeave` → `restoreFocus`）—— 中间约一个动画时长的空档里
  hover / focus / 打开态三者全假，清空叉会先缩回箭头、焦点一回来又张开成叉（用户实测「按 Esc 关闭会从 ×
  变一下再变回 ×」）。值侧的硬前提不变：`canClear` 为假（没有可回退的值）时，开着面板也不出。
- **该判据 2026-09-25 修正过一次**：首版取的是「面板里我们自己的那个根元素还在不在 DOM 里」，理由是
  「与面板挂载态同生命周期、不必依赖 popover 暴露内部状态」—— **这条推理是错的**。模板 ref 随面板
  **vnode 卸载**置空，而渲染器的卸载次序是**先 `unmountChildren`**（槽内容连同其模板 ref 一起消失）
  **再 `remove(vnode)`**，只有后者把 DOM 元素留到过渡结束。于是整段离场窗口里 ref 已是 null、面板却还在
  屏幕上，抖动原样回来。现改为读 popover 公开的 `isMounted`（新增到 `BasePopover` 的 `defineExpose`）——
  它的存活区间恰好就是「宿主仍在 DOM」。判据：**「离场期间」这类窗口只能由真正掌握该生命周期的层给出，
  不能拿子树的存活当代理**；组件内的 ref 一律不构成「还在屏幕上」的证明。
- **翻转只作用于箭头形态**：`rotate-180` 的用意是「展开时箭头朝上」，而叉没有方向 —— 判据不带形态时，
  打开那一拍会给叉也叠上 180°，肉眼看到的是「× 在空转半圈」（用户实测）。现判据为
  `_isOpen && !clearActionShown`。
- **形变只走悬停这一路**，由纯键盘聚焦引出的换形态仍是瞬切：`BaseIcon` 的补间分支与终态分支是两个不同节点
  （自绘 svg ↔ 图标组件），进出各替换一次 DOM；而这枚图标在聚焦路径下正是一个 tab 停靠点，键盘用户可能在
  上一次形变结束前就 Tab 到它身上，节点一被替换焦点即掉回 `body`。悬停路径没有这个隐患（按下事件已被拦下）。
- 交互口径逐项保持：不可清空（未开 `clearable` / 无可回退值 / 禁用）时恒为箭头、悬停也不变形；点箭头照旧
  开合面板（`stop` / `prevent` 不能写成模板修饰符 —— 修饰符无条件生效，会把箭头形态的点击一并拦掉）；
  清空形态下仍拦下按下事件（触发器上挂着 `v-wave`，放行会在清空键底下再补一圈波纹）。
- 顺带修掉一处无障碍缺陷：这枚图标在清空形态下带 `role="button"` + `aria-label` + `tabindex="0"`，
  但 `BaseIcon` 模板里内联的默认 `aria-hidden="true"` 一直没被盖掉 —— 即「可聚焦、有名字，却对辅助技术
  不可见」（且 `aria-hidden` 本不该出现在可聚焦元素上）。`BaseSelector` 现在按形态显式传 `aria-hidden`。
- 形态切换的判据（**同一实例改名**、翻转只作用于箭头形态）写在 `BaseSelector` 的注释里。这类观感不做单测：
  jsdom 不做 CSS 过渡、离场时序与真机不同，能写出来的断言只剩与实现同源的废话。

### 新增 · 图标形变补上通用兜底档，任意两个已登记图标之间都能补间（2026-09-25）

- 上一轮的形变只覆盖 `iconMorph.ts` 里**手工登记过配对**的图标（`plus` ↔ `check`、`chevron-down` ↔ `x`）：
  顶栏「同步目标」那几枚后端图标（`server` / `git-branch` / `folder-sync`）选中、前导槽换成 `check` 时
  仍是瞬切。本轮引入 flubber 作为**通用档** —— 任意两个登记了原始 SVG 正文的图标之间都能补间，
  不必再逐个挑端点映射。
- 两档判据：登记档（`morphPairOf`，手写段级配对、几何精确）优先 → 未命中落通用档
  （`iconMorphFlubber.ts`）→ 两档都未命中、或两端有一端不在可形变名表里，直接切换。
  **登记档的渲染结果与行为一字未改**；通用档同样遵守「补间首尾两帧不经引擎、直接吐两侧图标的原始路径」，
  这是形变分支与图标组件分支互相切换不闪的依据。
- **flubber 对「开口笔画」有三处硬伤**，直接喂原始 `d` 会画错：① 子路径一律被规范化为**闭合环**
  （`normalizeRing` 顺时针对称化 + 按 `maxSegmentLength` 二分）；② 点数不齐时 `addPoints` 沿**闭环周长**补点，
  补在「末点→首点」那条根本不存在的弦上（`check` 于是被当成三角形）；③ `interpolateRing` 的 `rotate`
  **无条件旋转起点**，对开口折线等于换一条折线 —— 第一帧就跳形。第 ③ 条尤其要命：它坏的正是「起手那一拍」，
  肉眼最像故障。
- 绕行办法：把开口笔画改写成「**去程 + 原路返回**的退化闭环」再交给 flubber —— 三个硬伤同时失效
  （对称化后往返两半自相重合、补点补在已走过的边上、起点旋转转的是一条重合的环），端点几何逐像素回到
  原图标。曲线图标（含 `C/S/Q/A`）先按弧长采样成折线；纯折线传 `maxSegmentLength = Infinity` 跳过二分、
  由 `exactRing` 直取顶点列表。另有两个必须自己做的动作：子路径要先过 flubber 的 `splitPathString`
  **绝对化**再拆（`plus` 的 `M5 12h14m-7-7v14` 带相对 `m`，朴素按 `M` 切会把锚点读成 `(-7,-7)`，中间帧飞出
  视口）；也不能拿 `interpolate(d, d)` 取点环（它照样把开口折线当闭环）。
- **引擎与原始 SVG 正文必须懒加载**：flubber 打包 18.6KB gzip（正文另计），而首屏预算 220KB 只剩约 30KB，
  静态引入会被 `pnpm build:budget` 拦下。故二者只经 `BaseIcon` 的动态 `import()` 进入异步 chunk；
  代价是「chunk 还没到就换了图标」这一次退化为瞬切，故 `BaseIcon` 在名字变化时**先预热**：只要两端有一端
  在可形变名表里就去拉 chunk，两端都在名表里才真播。名表 `MORPHABLE_ICON_NAMES` 本身留在首屏模块 ——
  要不要预热必须**同步**判断得出，异步模块答不了。
- 原始 SVG 正文**内联**在 `iconMorphBodies.ts`，未用 `~icons/lucide/check?raw`：Vite 6 的 fs 访问守卫
  （`isFileLoadingAllowed`）在 Windows 上拒绝**任何含 `~` 的 `?raw` id，而 unplugin-icons 的 `resolveId`
  恰好把 `~icons/…` 原样返回 ⇒ 一律 `Denied ID`。代价是正文与上游成了两份拷贝，**没有任何自动兜底**
  （原先那份逐条与 `@iconify-json/lucide` 的 `body` 对拍的用例，已随本轮「1=1 测试」清理一并删除）——
  升级 `@iconify-json/lucide` 之后要人工比一遍本表。
- 只登记 Lucide **描边类**图标：实心图标没有可描边的轮廓，与描边图标形变会出现「实心 → 空心」的风格跳变。
  ⇒ 顶栏「同步目标」四枚里的 GitHub 曾因取的是 simple-icons **实心标**而落在名表外（那一枚瞬切），
  本轮换成 Lucide 的**描边版**后并入 —— 同名的实心/描边两个版本不是同一画法，登记前先确认取到哪一版。
- 该正文表整表豁免 `better-tailwindcss/no-duplicate-classes`：规则按 `eslint.config.mjs` 的
  `variables: [['.*', …]]` 把变量里的字符串**一律**按空白切成类名 token，于是两个 `<rect width="20" …>` 的
  `width="20"` / `x="2"` 被读成「重复类名」。而该规则带 autofix，一旦被自动修会直接删掉这些属性、把图标削坏
  —— 故显式豁免，而不是把属性改写成不重复的形式去迎合它。
- 引擎要保证四件**会静默画错、肉眼又容易漏**的事：名表与正文键集一致（错位时表现为「部分图标永远不形变」
  且无任何报错）、`at(0)` / `at(1)` 逐子路径回到两侧原始几何、**起手不跳形**（补间产物沿边加密采样后，
  每个采样点都必须落在源图标自己的笔画上 —— 专抓凭空长出来的弦）、几何能力缺失时返回 `null` 降级而非抛错。
- **jsdom 没有 `<path>.getTotalLength()`**，曲线图标的弧长采样在单测环境取不到，故引擎在测量失败时
  `try/catch` 返回 `null`、由调用方退化成瞬切。曲线图标的补间质量只能去真浏览器看，已用无头 Chromium
  逐帧截图确认端点与起手两帧。
- 本轮**新增登记乐谱列表排序按钮的四个图标**（`list` / `type` / `clock` / `pencil`）：它们是同一个
  `<BaseIcon>` 的四种状态（`SidebarLeft.vue` 的排序菜单按当前排序方式换 `name`），此前全不在名表内
  ⇒ 换排序方式时图标硬切。登记后任意两两之间都有补间；`list` 是纯折线、另三枚含曲线，后者只有真机看得到。
- 同理**新增登记外观设置的三枚**（`sun` / `moon` / `laptop`，`TopHeader.vue` 的主题菜单）：触发器那一枚在
  `sun` ↔ `moon` 之间换，菜单项里三枚还会与勾选态的 `check` 互相切换。`sun` 被拆成 9 条子路径（圆 + 8 条
  射线），`moon` / `laptop` 各 1~2 条，子路径数不等由引擎补退化点补齐 —— 观感是「圆就地变成月牙、射线原地
  收掉」，三枚都含曲线，同样只有真机看得到。
- 通用档的子路径**按文档顺序**配对，故子路径数不同的对（`list` 6 条 → `type` 3 条）会呈现「小点长成笔画、
  长线收成点」的观感 —— 这是 flubber 形状匹配的固有代价，不是缺陷；要更贴直觉只能改配对启发式（本轮未动）。
- 十二个有序对的逐帧几何已用无头 Chromium 截图逐一确认（临时预览页在 `.temp/`，未入库）：全部建得出通道、
  中间帧无飞线、起手不跳形。
- **登记只是必要条件，不是充分条件**：形变由 `BaseIcon` 内 `watch(() => name)` 驱动，故「旧图标 → 新图标」
  必须落在**同一个 BaseIcon 实例**上。菜单前导槽原先写成 `v-if` / `v-else-if` 两枚 `<BaseIcon>`（勾选态一枚、
  条目图标一枚），而 **Vue 3.5 给 v-if 分支生成隐式 key**（编译产物里是 `key: 0` / `key: 1`）—— 两支之间
  切换是**卸载再挂载**，`name` 从未变化、watch 不触发，登记多少图标都不会动。同步目标子菜单的勾选态即此形态。
  改为**单枚常驻 `<BaseIcon>`**，名字在 `resolvedItems` 里算好（`leadingIcon`，勾选在左时是 `check`，否则是
  条目图标；`icon` 为组件形态时留空、仍走 `<component>` 分支）。判据：**要「同一个实例改名」，模板里就不能
  把两种形态写成两支 v-if** —— 与选择器触发器尾部那枚（`chevron-down` ↔ `x`）是同一条。
- `resolvedItems` 因此从「单选组才映射」改为**逐项映射**，且**必须无条件复制**并带上 `leadingIcon` ——
  不能「没变就原样返回」：`leadingIcon` 是本层新加的字段，调用方给的条目上没有它，一旦早退，模板的
  `v-if` 恒假、**整列图标静默消失**（本批次实际踩过：同步菜单的「推送到云端」「从云端拉取」「同步设置」
  三行图标一起没了）。复制不影响调用方：`MenuSubmenu` / `MenuRow` 都只读字段、不比引用。
- 同步目标子菜单的五个图标（`server` / `github` / `git-branch` / `folder-sync` / `check`）至此全部接上形变：
  勾选态把该行的条目图标换成 `check`、取消勾选时换回来，选中另一行则上一行同步还原，两行各自是同一个实例上的
  一次改名。`check` ↔ 四枚后端图标、以及四枚之间（子菜单触发器那行显示当前目标）都有补间。
- GitHub 的换版是**必须**的一步而非顺带：simple-icons 是实心标，引擎固定 `fill="none"` + `stroke`，
  直接登记会在点下去那一瞬把标**掏空**成轮廓、形变走完再跳回实心。换 Lucide 描边版后端点几何与组件分支
  一致，起止都不跳。`@iconify-json/simple-icons` 随之失去引用，已从 `devDependencies` 删除并同步锁文件。
- 复选框的半选 / 勾选两态走**登记档**（`iconMorph.ts` 的 `SHAPES` 新增 `check:minus`），不走通用档：
  两枚都是纯折线（`minus` = `M5 12h14` 一条横线、`check` 两笔），段级配对能给出精确几何，没有理由让
  flubber 去猜形状。两侧段数 1 ↔ 2 不等，短侧由 `pairSegments` 按对侧段的**中点**补零长度占位段 ——
  勾的短捺从自身中点 (6.5, 14.5) 张开、紧挨长撇起笔 (9,17)，不是从视口角落飞进来；横线两端都往右上
  就近挪（(5,12)→(9,17)、(19,12)→(20,6)），中途无对穿。登记档在通用档**之前**命中，故 `minus` 不必进
  `MORPHABLE_ICON_NAMES`、也不需要原始 SVG 正文。逐帧 `d` 已用 `.temp/` 里的 esbuild + node 脚本打印核对：
  `t=0` / `t=1` 与 Lucide 原文逐子路径一致、两个方向可逆、中帧无飞线。
- `BaseCheckbox` 勾选框里原先是两支 `v-if` 各一枚 `<BaseIcon>`（`indeterminate` → `minus`、`isChecked` →
  `check`），同样是「实例被卸载重建」的形态 ⇒ 与菜单前导槽同一根因、同一处法：改成**单枚常驻
  `<BaseIcon>`**，名字由状态派生的 `indicatorIcon` 给出（半选优先于勾选）。两个具名插槽
  `indeterminate-icon` / `icon` 保留为覆盖入口 —— 插槽内容由调用方提供、无从配对，故各自独立成支，
  命中插槽时按老路渲染、不参与形变（当前代码库内无使用者）。
- 密码框的明文/密文眼睛（`BaseInput.vue`）与顶栏工作台的试听/停止（`TopHeader.vue` 的播放按钮）本轮
  一并登记进通用档。两处都是**同一枚 `<BaseIcon>` 换 name**：前者由 `:name="showPassword ? 'eye' : 'eye-off'"`
  直接换名，后者把 `:icon` 交给 `ActionButton`、落到内容区那一枚的 `name` 上（`icon-only` + 无 label
  ⇒ `isIconOnly` 恒真、span 与其中那枚 BaseIcon 常驻，换 `icon` 不会重建实例）。此前两处都是硬切。
- 四枚都含曲线，只有真机看得到补间：`eye` 是眼形轮廓 + 瞳孔圆，`eye-off` 是断开的轮廓 + 一条斜杠，
  `play` 是圆角三角，`square` 是 `<rect rx="2">`。逐帧几何已用无头 Chromium 截图确认（`.temp/morph-probe.*`，
  未入库）：
  - `play` ↔ `square` 都是**闭合环**（`play` 原文以 `z` 收尾，`square` 的 `<rect rx="2">` 被引擎转成带 A 弧
    的闭合 `d`），故不走「开口笔画 → 退化闭环」那条改写，直接交给 flubber 的成环插值。观感是三角的左顶点
    一路滑到左边界、整体收成圆角方，逐帧包围盒恒在 `[3,21]²` 内、单条子路径，起止与原文逐字一致。
  - `eye` ↔ `eye-off` 的子路径数是 **2 ↔ 4**（`eye-off` 那条 `M10.733 …m-6.41-.679…` 的相对 `m` 与斜杠
    各拆出一条），多出来的两条由引擎按文档顺序补「就地折叠的退化点」，折叠点取各自 moveto ⇒ 斜杠是从自己
    的左上端点 (2,2) 向外抻开的。中间帧（t≈0.3~0.7）轮廓与瞳孔会互相穿过、看着略缠，但两端逐子路径与原文
    一致、无飞线，且这处按钮的图标档是 `xs`（12px），实际观感就是一下闪烁。
- `iconMorph.ts` 文件头原以 `play` 举例说明「含曲线的图标做不了」—— 那是**本模块（登记档）**的范围，
  `play` 本轮已走通用档，例子换成 `trash / copy / star / heart` 并补一句指向通用档，免得读成「play 没动画」。
- `Feedback` 的 type 图标集（`inbox` / `file-question` / `wifi-off` / `search-x` / `loader-2` /
  `alert-circle`）**本轮不登记**：全仓没有任何调用方原地改 `type`（所有用法的 `type` / `icon` 都是静态字面量，
  `BaseInput` 搜索回退那三态还各自带 `key`、本就是不同实例）⇒ 登记了也只是六份永远触发不了的正文与名表项。
  将来真出现原地换 `type` 的调用方，补正文 + 进名表两步即可，不需要别的改动。
- `ActionButton` 的两处「换支」**本轮不并支**，都只在代码里记一笔、不改结构：
  - loading 圈：`v-if="loading"` 与 `<slot v-else>` 里的主图标是两枚节点，进/出 loading 是卸载重建、改名不触发；
    而且就算并成单枚常驻，`loader-2` 也得与**所有**按钮图标两两登记，而按钮图标由调用方随手给
    （`play` / `copy` / `clipboard-paste` / `refresh-cw` / `cloud-download` / `trash-2`…）是**开放集合** ——
    覆盖范围收不住，形状匹配在这些对上的观感也无从保证 ⇒ 维持瞬切。
  - 主图标本身也写在两支里（`#prefix` 槽内 `resolvedIcon && hasText`、内容区 `v-else-if="resolvedIcon"`），
    「有文案 ↔ 纯图标」之间切换会换支 ⇒ 实例重建、改名不触发。当前无调用方在运行中改文案
    （`label` / 默认插槽都是静态传入的），故只记不并。
- `MenuItems` 行尾那枚勾（`checkPosition: 'right'`）**不需要形变**：它是独立的 `v-if`，选中时凭空出现、
  取消时消失，属「出现 / 消失」而非「同一实例换名」，没有可配对的来源图标（`SidebarLeft` 的筛选菜单即此形态，
  那些行本来也不带图标）。勾选在左时走的是 `leadingIcon` 在前导槽换名，那一条已在覆盖内。

### 新增 · 选择器选项带图标时，勾选标记落到图标位（2026-09-25）

- `BaseSelector` 新增 `noCheckOnIcon`，**不传即开启**「勾选落在图标位」：选项传了 `icon` 且处于选中态时，
  对勾**顶替该项图标**出现在前导槽，行尾不再重复出对勾。与菜单那套的默认档同一观感 ——
  `MenuItems` 里 `checkPosition !== 'right'` 时也是 `check` 占前导槽、条目图标让位。
- **无图标的选项不受影响**：前导槽本就空着，对勾挪过去等于在行首凭空冒出来，故这类选项恒走行尾 ——
  否则同一份选项列表里会「有的勾在左、有的勾在右」。这条由用例单独钉住。
- 属性取「不」这一向而不是 `checkOnIcon = true`：默认开的开关写正向命名时模板里唯一写法是
  `:check-on-icon="false"`，反向命名后能写成无值的 `no-check-on-icon`，与全项目其它布尔属性同一种读法。
- **本轮唯一一处「写法一换就静默失效」的地方**：前导槽里选中前后必须落在**同一支** `v-if`，换的只是同一个
  `BaseIcon` 实例的 `name` —— 形变引擎（`watch(() => name)`）等的就是这个。若给选中态单开一支 `v-if`，
  两支各带编译器注入的隐式 key（`key: 0` / `key: 1`），实例每次被销毁重建，动画一次都播不出来
  （观感即瞬切），而落点断言仍然全绿 —— 即错误不会以测试失败的形式暴露，只能靠注释挡住。
- 条目图标是**组件**（非 `IconName`）时不在可形变名表里、没有可补间的几何，选中态直接换成 `check`
  （另立一支）；这是「少一个动画，不少一个图标」的老口径。
- 行尾槽在 `BaseDropdownItem` 里是**固定宽**，故「行尾对勾的有无」不会让选项文字左右跳动。
- **补间在这一处基本看不到**，本属性只影响静态落点：单选默认选中即关面板（`handleSelect` 里的 `close()`），
  补间会被关场动画切掉；能看到动画的是 `multiple` / `keepOpenOnSelect` 的用法。
- 新增 `tests/ui/BaseSelectorCheckOnIcon.test.ts`（3 例）：默认档 / `noCheckOnIcon` 档 / 无图标条目。
  断言对象是**行的 DOM 结构**（哪一端是图标、行里共几枚）与图标的**几何指纹**（取自「同一个图标名单独
  渲染」的产物，不写死坐标），不碰类名与内联样式。负向验证过：把判据改成恒假，第一例即红
  （另两例守的是关掉后的那一档，本就该绿；「属性被忽略、恒开」的反例由第二例拦下）。
- 顺带记一处测试侧的坑：`findAllComponents(BaseIcon)[i].element` **拿不到图标自己的元素** ——
  `BaseIcon` 的模板在根元素之前有一行注释，dev 编译把根退化成 Fragment，那个 `element` 会解析到
  整行按钮上（实测），拿它做元素身份比较必然失败，且失败信息会被 vitest 打印元素差异时的序列化异常
  盖掉（报成 `Cannot read properties of undefined`）。找图标元素要从**行**这一侧看结构。

### 工程 · 拿掉整条覆盖率关卡（2026-09-25）

- `package.json` 删掉 `test:coverage` 脚本；`vite.config.ts` 删掉整段 `coverage` 配置（provider / exclude /
  全局地板与六档分层阈值）；`scripts/verify.mjs` 与 CI 的该步改用 `pnpm test`。文档同步改掉凡写「跑
  `test:coverage`、以分层门槛为准」的地方：`AGENTS.md`、`README.md`、`.github/CONTRIBUTING.md`、`ARCHITECTURE.md`。
- 判据：**覆盖率门槛的收益是「拦住新增大量零覆盖代码」，代价是持续催生「为把数字抬上去而写」的用例** ——
  后者每次重构都要跟着改，而前者只是发现得晚一点（分层 glob 之外的大量 Vue 组件本来就靠人守）。两边不对称，
  故整条拿掉，而不是把阈值调低留个形式。
- `@vitest/coverage-v8` 随之失去引用，已从 `devDependencies` 删除并同步锁文件。

### 修复 · 预览缩放胶囊的宽度补间把「适应窗口高度」开关拖着走（2026-09-25）

- 现象：预览右下角缩放胶囊里那枚 buttonized 的「适应窗口高度」开关，开启 / 关闭时都会横向跳一大段。
- 根因是胶囊的 `v-auto-width`（内容宽度变化时按 FLIP 补间容器宽度）撞上胶囊的**右对齐**：胶囊靠
  `right` 钉住、内容却按**左**边缘排布，而该开关会把滑杆 + 分隔线整组从 DOM 里摘掉 / 装回。补间期间
  容器宽度在变、内容仍贴左边缘 ⇒ 尾部那枚开关被横着拖过被收起内容的整段宽度。**两态的静止位置本来
  完全相同**（开关恒贴胶囊右边缘），位移只存在于补间的中途帧 —— 这也是「看起来在闪」而不是「位置不对」。
- 修法是**改布局，不动补间**：滑杆组整组包进一个可收缩的裁剪盒（`min-w-0 shrink overflow-hidden`），
  尾部开关包一层 `shrink-0`，胶囊加 `justify-end`。于是补间期间容器变窄时先压裁剪盒（内容被**裁掉**
  而不是被压扁，收缩量由容器宽度反算、天然与补间同步），开关被 `justify-end` 钉在右边缘不动；
  展开方向同理，滑杆是被逐帧**露出来**。
- 为什么不能靠关掉补间（一度这么改过，已回退）：那等于把胶囊的收缩动画整个删掉。也不能只调对齐：
  单给 `justify-end` 而不加裁剪盒，展开方向起始帧（容器还只有收起后的宽度）内容比容器宽，会被 flex
  压扁或溢出到胶囊外。
- 残留：开启「适应」那一向滑杆组是被摘掉的，滑杆本身仍瞬隐（「一组内容消失」的固有一步，要连它淡出
  得再套一层进出场过渡）；位移已消。
- 已用复刻同构布局（右对齐胶囊 + 左对齐内容 + WAAPI 宽度补间）的临时页在无头 Chromium 里逐帧量过：
  改前开关在补间中途横移 118px（开启向）/ 14px 并越出胶囊右边缘（关闭向），改后两个方向**逐帧 0 位移**
  （距视口右边缘恒为 38.0px），两态静止宽度与改前一致。

### 新增 · 编辑歌词后按页最小重建：只重画内容真的变了的页（2026-09-24）

- 编辑歌词后不再整谱重画：歌词在内容键里，改一个字键就换代，此前新键一律从零渲染全部页。现在新键起手会在**同一首歌**的旧版本里找一版「页级段相同、且只有若干行内容变了」的条目，把未受影响的页连同页脚合成层一并**转移**过来（`findInheritSource`
  / `inheritableIndexes` / `movePages`），那些页直接进 `havePages`
  被渲染线程跳过 —— 逐页落账的机制本就支持「只画缺的页」，这一步只是把「缺」的定义从「同键的洞」扩展到「跨键未受影响的页」。写歌时最常见的「末尾追加一行」因此只需重画最后一页；
- 两道判据必须**同源**于渲染输入：`buildScorePageLevelKey`（键去掉 `version`
  / 歌词 / 槽位和弦指纹后的「页级段」—— 标题、歌者、调性、拍号、变调夹、主题、各项排版设置、预览缩放）必须逐字相同，否则每一页都不可信；页级段相同再按逐行指纹（`scoreLineFingerprints`，行文本 + 行内和弦的「指纹:横按签名」）找出内容变了的行，与上一版的
  `pageLineRanges`
  求交即得必须重画的页。判据把「其实变了」判成「没变」的后果是**静默错图**（屏上留着上一版内容，而键已换代、没有任何机制会纠正），故漏一个维度就等于错一屏；`version`
  与歌词刻意不进页级段（前者只是「发生过编辑」的粗暴标记，后者归行级），槽位和弦按行承载（否则「改一个和弦」会把整谱的继承资格一并作废）；
- 行数变化时**多出来的行一律算脏**（末尾追加是写歌时最常见的编辑，前面十几页没有理由重画），少掉的行由逐位比对自然判脏；一行的折行数若被改动，分页边界会挪，由下面的复核兜住；
- 「声明」与「校验」分离：`havePages` 必须在派发**之前**给出，而「继承来的那几页是否仍属于本次排版」只能等
  `pages-planned` 回带行范围才知道 —— 故这是一次乐观声明，排版结果一到立刻用 `sameLayout`
  复核，不符即整段判废重跑。最坏情况白跑一轮排版，与本功能存在之前「一律整谱重画」的代价相同，不会更坏；
- 页 URL 是**所有权移交**而非共享：转移时来源条目那几格留洞、两侧重新落账（LRU 只在写入时更新字节合计，不重新称重等于「页搬走了还按原重计费」）。共享会让同一批 URL 有两个主人 —— 来源条目被淘汰时一撤，目标条目手里就是死 URL，且只在「继承 + 淘汰」同时发生时才复现；
- 逐行指纹与页脚合成层一样计入条目占用（`entryBytes` 与缓存 `weigh`
  同口径）：纯文本判据，量级极小，但同属条目占用，免得日后有人照着「配额＝页图字节」去估内存；
- `writePage`
  覆盖已有页时就地回收被换掉的那个 URL：继承让「条目里预置在位页」成为常态，一旦真的被覆盖（正常不会发生，那几页正是渲染线程跳过的），那个 URL 就再没有回收时机；
- `tests/ui/scorePreviewCache.test.ts`
  补 6 例（主路径 / 三条否决条件 / 末尾追加 / 多版取最近 / 页为洞 / 页脚层随页转移），`tests/ui/scoreRenderCacheKey.test.ts`
  补 4 例盯住「哪些维度进页级段与行指纹、哪些必须不进」。

### 修复 · 构建在途时改设置即刻作废旧轮：与切歌同待遇，不再等它跑完（2026-09-24）

- 构建预览时改排版设置（字号 / 和弦缩放）或编辑内容，在途那一轮**立刻**作废并中断渲染线程上那一笔，新一轮仍由 150ms 防抖开跑 —— 此前防抖只延后「开新一轮」，旧轮在这段窗口里继续画它注定被 token 丢掉的页、还占着渲染线程把新一轮挡在后面，表现为「改了设置，旧构建照常跑完才开始新的重建」；
- 「显示页脚」开关在构建在途时同样按新值重开一轮：在途轮次是按**发起那一刻**的开关值派发的（`embedFooterPages`），开关一变它剩下的页要么白算页脚层、要么永远拿不到页码（另起一笔合成只能排在同一队列的它后面）。重开那一轮起手把已在位的页交给
  `havePages` 跳过，缺页脚的那几页由起手的 `ensureFooterComposed`
  先排进队列（同一条队列 FIFO，合成先跑）——页码逐页到位，而不是等整谱构建完再补一遍；
- 作废与 UI 状态解耦：新增
  `invalidateInFlightRender`（只掐掉已无人要的那一轮，骨架格 / 计划页数 /「更新中」提示原样留着，因为调用方紧接着就开新一轮），与切歌 / 切走 / 卸载用的
  `cancelPendingExport` （连骨架与提示一并收掉）分工明确；
- 改设置那一轮改为**逐页覆盖**上屏：屏上挂着另一内容键的旧图时此前一律「整批换新」（等整篇重建完才换图），而旧图是按旧设置画的、留着没有意义 —— 现在这一条来路逐格换成新页（旧页留到该格被替换，不清页流、不闪骨架），页数变少时按新总数截掉尾巴。切回预览标签（编辑内容后）那条来路仍保持整批换新：那份旧图是上一版**完整**的图，留着比半新半旧可读。

### 修复 · 页码随页出现：页脚合成并入渲染循环逐页顺带产出（2026-09-24）

- 打开乐谱时页码不再等整谱渲染结束才出现：新增
  `WorkerExportPayload.embedFooterPages`，预览开着页脚时渲染循环每画完一页**就地**合成该页页脚层，两个 blob 分两条消息回传（`page`
  先发、页面立刻上屏， `footer-page`
  随后到、页码随即补上）—— 此前「另一笔」合成任务只能排在整谱渲染之后（两者共用同一条串行队列、且共用同一张整页画布，不可能并行），页码因此要等全部页画完才开始出现；
- 该字段**不参与内容键**：页图与页脚层照旧各存一份，开关页脚仍不触发整谱重渲、来回切零开销；导出路径恒为 false（要的是无页脚页图，页脚由
  `composePageFooter`
  显式合成）。**代价是一档可关的选项、不是固定成本**：页码的及时性拿「开着页脚时整轮的耗时」换 —— 实测（14 页 / 794×1123
  / PIXEL_RATIO
  2.0）单页热渲染 16.6ms（编码占 15.5ms）、页脚合成单页 ~22ms，置真后每页多一次「解码 + 重编码」，本轮渲染约慢一倍（14 页：整轮 233ms
  → 合成那 400ms 被摊进渲染）；关掉「显示页脚」即回到原耗时，因为页脚层不进内容键、关掉不触发重渲；
- 合成层抽出单页实现 `composeFooterPage`，渲染循环与页脚合成分支共用同一份（此前只有整批入口）；
- 页脚合成结果改为**逐页**回传（`onFooterPage` 回调，替代原先的整批
  `onPage`）：开关打开 / 命中缓存等仍需单独合成的路径上，页码也逐页出现而非整批跳出 —— 14 页整批实测 ≈
  400ms，单页只有 ~22ms；
- 中断语义随之更省：本笔被作废时**已回传的页留在条目里**（那几页的解码 + 编码成本已经付过），不再整批丢弃；
- 主线程落账收拢为 `adoptFooterPage`（落账 + 就地换源一格，不做整表重算），并保留一条整批兜底—— 逐页回调一页都没到时才用
  `complete` 的整批结果补齐，且**已落账的页一律跳过**，否则同一页会拿到第二个 object URL、旧的那个再无人回收；
- 消息协议新增 `footer-page`：与 `page` 分开成两条而非加字段，因为两者在缓存里是两份数据（`pages[]` 无页脚页图 /
  `footerPages[]` 叠了页码的合成层），关掉开关时回落前者；
- 关掉「显示页脚」时**丢弃非展示项的合成层**（新增 `dropIdleFooterPages`）：那批字节本来照旧计入条目重量（`weightOf`
  把页图与页脚层相加，开过页脚的条目重量近乎翻倍），在 96MiB /
  48 条两条并列上限下等于把别的歌挤出去 —— 用户「试开一次页脚再关掉」之后，其余歌的命中率会跟着掉。折中：展示项留着（开关再打开零成本切回），其余条目真要用到时重合成一次（~22ms/页），丢时当场回收那批 URL 并重新落账退回占用；
  `tests/ui/scorePreviewCache.test.ts` 补一例盯住「只丢非展示项、URL 当场收回」。

### 重构 · 预览缓存改为真逐页：条目允许有洞，被打断的一轮不再整份作废（2026-09-24）

- 缓存条目的最小单元从「整首歌的一次渲染」下沉到**单页**：`pages`
  允许有洞（未渲染的页 / 被打断的尾巴），排版一结束就建骨架（`ensureEntry`），渲染线程每出一页写一格（`writePage`）——「这一轮被切歌打断」不再等于「已画好的页全部作废」，那些页留在条目里，下一轮同内容键重发时带上
  `havePages` 跳过它们，只补没画完的几页；
- 渲染协议随之改口径：`resumeFrom: number`（前缀「[0, N) 都已有」）→
  `havePages: number[]`（前缀表达不了「除了第 5 页都有」，而条目里允许有洞，逐页化的前提就是「哪些页在手」必须能如实说出来）；`pages-planned`
  顺带回带逐页行范围（此前已算好但主线程零消费），调用方据此在
  **任何一页画出来之前**校验「同键条目里已在位的那几页是否仍属于本次排版」——页数相同但分页边界挪了也能当场发现；`complete`
  的 `resumedFrom` 改为 `renderedPages`（本次实际画出的页序，与 `blobs` 同序），blobs 不再假定从第 0 页起连续；
- 组件里的「半成品登记表」（`partialsByKey` 一族、4 条 /
  32MiB 的平行配额）整体删除：缓存条目自己就是半成品登记表，页 URL 的所有权归一，屏上不再有「两个家」；
- 修掉一处真泄漏：淘汰到**正在屏上展示**的条目时不能即刻撤它的 URL（否则当场破图），而此前跳过之后再没有任何时机回收，那批 URL 就永久悬着 —— 改由
  `setCurrentRender` 在换值那一刻补收， `clearPreviewCache` 与「条目被同键新对象取代」两条路径统一生效；
- 写入路径新增可写性闸（`isWritable`）：条目已被回收、或此键已归新对象所有时拒绝写入并**就地回收**这一页的 URL
  —— 前者写进去只是把死 URL 当有效页供出去，后者还会把真正活着的那条挤掉、连它的页 URL 一并撤掉；
- 顺带修掉 `isComplete` 的稀疏数组陷阱：`new Array(n)` 是稀疏的，`every` 会跳过洞并对 `[,,]`
  直接返回真，等于把「一页都没画」判成完整条目（下一轮再不会去补那几页）；`pages`
  改为恒稠密（`fill(undefined)`），判据也改为显式循环；
- 页脚合成层改为**逐页**补齐：判据从「有没有合成过」改为「缺哪几页」—— 此前一个布尔标志会让一轮渲染补齐的后几页永远拿不到页码；
- 消费方同步改为取值器口径：右键「本页大小」与开发面板明细只列在位页、`TopHeader` 的尺寸预估按在位页累加、PDF /
  ZIP 导出只在条目**完整**时才复用（缺页的条目宁可重渲一次，免得静默少几页）；
- 删除 `readA4PageBlob`：页 Blob 与 URL 同存于条目，按 URL 回读的回落路径已无调用方；
- 新增
  `tests/ui/scorePreviewCache.test.ts`，盯住「一批页 URL 只能有一个主人」的几条不变量（被拒写入就地回收、同键新主时旧条目不得挤掉活条目、淘汰展示项延后回收、清空时展示项一并回收、洞的如实反映）。

### 修复 · 滚动条指令卸载后把父元素永久留成定位容器（2026-09-24）

- 指令在父元素计算值为 `static` 时给它补一条内联
  `position: relative`（overlay 是宿主的兄弟节点，需要定位上下文），但卸载路径只摘自己的 overlay 与宿主内联样式，从不归还这一条：父元素并非指令所有，此后其后代里任何
  `position: absolute` 都会改以它为基准，而宿主元素移除后这条内联样式仍留在页面上；
- 改为按父元素记持有计数（多宿主共用同一父元素时，只有最后一个持有者撤出才摘），卸载时归还。原先「刻意不摘 overflow」的说明只覆盖宿主自身的样式，定位上下文补在父元素上、不随宿主移除而消失，两者不属同一条；
- 顺带修掉一处与注释相反的写阶段回读：`applyAxis` 的契约写着「只做 style /
  class 写入，中间不再读任何布局属性」，但 a11y 分支里又调了两次 `getLength` + 一次
  `getScrollPos`，把整批写入的合帧收益抵消掉。三个数改为取读数阶段的产物（`AxisMetrics` 本就带），注释与实现恢复一致。

### 重构 · 清理一批零引用的导出、字段与配置项（2026-09-24）

- `FretboardCanvas` 的 `lazy` prop：全仓无任何消费方传入、恒为 `false`，于是 `hasDrawn` 门与 `IntersectionObserver`
  首绘路径整体是死分支；连同只为此引入的 `observeVisibility` **整套共享 IntersectionObserver**
  一并删除（`VisibilityCallback` / `SharedVisibilityObserver` / `sharedObservers` /
  `getObserverForRoot`，共 48 行）—— 它当年想服务谱面字符槽与选择器卡片，从未被采用；删后全仓 `new IntersectionObserver`
  只剩 `ScoreInteractiveArea` 自带的那一处 sentinelObserver，`dom.ts` 里指向它的交叉引用一并去掉；
- `FretWindow.trimmed`：零读取（消费方都只取 `drawFretCount` /
  `leadTrim`），其「位图键该放几何量而非开关本身」的设计意图并入 `resolveFretWindowFromUsed`
  的函数文档，不再靠一个恒等于派生式的字段承载；
- 零引用导出：`hideTooltipInside`、`deleteLineSlots`；
- 零引用存储键 9 项：`IS_MULTI_FINGERING` / `MULTI_FINGERING_INDEX` / `MULTI_FINGERING_CHORDS` / `SCORE_SCALE` /
  `SCORE_LINE_HEIGHT_SCALE` / `SCORE_SNAP_TO_GRID` / `SCORE_LINE_GAP` / `SCORE_SECTION_GAP` /
  `SCORE_PAGE_PADDING`（多指法模式与旧谱面排版偏好的遗留键名，源码与测试皆无引用；键值本身仍由前缀转录处理，删除常量不影响历史数据）；
- `transfer.ts` 的 `FieldRule` 把 `required` 与 `requiredMsg` 绑成判别联合：此前必填规则漏写文案会在校验核心的
  `rule.required && !checkValue` 分支里无事可做 —— 静默放行一个空值字段，调用方还拿到 `isValid: true`
  与一份缺字段的数据；现在这种规则表在编译期就写不出来；
- `.gitignore` 补 `worker/.dev.vars`（wrangler 本地开发凭据，不跟随 `.env.*` 通配，漏了即一次 `wrangler dev`
  就被提交）；
- 补上 6 个此前在 `tests/`
  零命中的模块的单测：`fretWindow`（含窗口不变量对全部占用组合的穷举）、`deletionWatermark`、`persistFailure`（含 cause 链下探与冷却去重）、`exitFlush`、`backupCrypto`（含 v1 信封的 150k 回落）、`scoreRenderCacheKey`。

### 修复 · 旧存储转录把历史 Token 抄进了 IndexedDB（2026-09-24）

- localStorage 退役转录按 `CHORD_LAB_`
  前缀圈定作用域，而「不转录」的敏感键名单只列了 WebDAV 密码与服务端 Token 两个**现行**常量名。旧版 GitHub 同步的
  `CHORD_LAB_GH_TOKEN`（`cfdf511`
  起即以明文落 localStorage）同样落在该前缀内，且在现行键表里已无对应项 —— 于是既不被前缀守卫挡下、也不被排除名单命中，被原样抄进 IDB 再删掉 localStorage，等于把凭据从「浏览器可清空的 localStorage」搬进「持久化且随备份链路带走的 IDB」，与本流程「敏感键丢弃」的意图相反；
- 修复分两半：① 排除名单改为按**历史键名字面量**枚举（补 `CHORD_LAB_GH_TOKEN` /
  `CHORD_LAB_GITEE_TOKEN`），挡住将来的转录；② 新增一次启动清扫，删掉**已完成转录**的用户库里那份已躺进去的明文 —— 转录标记落盘后启动即短路，旧代码永远不会再碰它，脏数据会就此固化，故清扫必须早于标记短路执行（恰好是已迁移用户唯一能被扫到的时机）。

### 修复 · 开放和弦被误判为转位，并连带污染排序与重复判定（2026-09-24）

- 最低音是在**音级**（0~11）上取 min 得到的，而音级丢掉了八度，最小值并不是最低音的音级。开放和弦是重灾区：G（320003）各弦音级为 G7
  B11 D2 G7 B11 G7，音级 min 得 D2，而物理最低音是低 E 弦 3 品的 G2；
- 后果沿两条路扩散：`computeIsInverted` 把大量开放和弦判成转位（经 `chordSort`
  影响同名变体排序，并经和弦指纹的转位位影响重复和弦判定），`validateBassConsistency` 则反向漏报 —— `G/D`
  这类**真的**不一致反而因为错误最小值恰好等于标注低音而不报警；
- 改为先按完整 MIDI 取最小、最后再归一成音级返回（对外契约不变）。`chordEngine.collectNoteContext` 的 `bassByPitch`
  是同一处 bug 的另一份实现（重入定弦下的根音锚点走的就是它），借 `NoteInput` 新增的可选 `midi`
  一并修正，两条路恢复同口径 —— 否则修好一边反而制造出注释里警告的那种分叉。

### 修复 · 歌词拖拽的两条收尾兜底从未生效，失焦后拖拽态悬挂（2026-09-24）

- 右键与窗口失焦各自 `new PointerEvent('pointercancel')` 伪造一个事件再走原生取消处理，而伪造事件的 `pointerId`
  恒为 0、`pointerType` 恒为 `''`，过不了「是否属于当前活动指针」的比对（Chromium 鼠标
  `pointerId=1`、触摸 ≥2），两条兜底从未真正执行；
- 拖到一半切走窗口再回来：拖拽态、ghost、自动滚动与 `body` 上的 `is-global-dragging` 全部悬挂，且因 `activeChord`
  仍在，此后 pointermove 被 `preventDefault`，歌词行也滑不动了；
- 取消收尾抽成不接收指针事件的函数，两处兜底直接调用。「只认活动指针」这层过滤只属于原生 `pointercancel`
  监听（多指场景下第二根手指的 cancel 不该杀掉第一根的拖拽），保留在调用侧。

### 修复 · 数字输入框回车提交后不退出行内编辑（2026-09-24）

- 行内 input 是外层 wrapper 的子节点，提交把 `isEditing`
  置 false 之后事件继续冒泡到 wrapper；wrapper 的守卫此刻看到的已不是编辑态，于是落到末尾的「回车 / 空格 → 进入编辑」分支，把刚退出的编辑又开起来 —— 回车后输入框不消失、光标还在，且第二次回车又走同一圈；
- 在源头 `stopPropagation`
  断掉，而非在 wrapper 里补状态判据：wrapper 那层拿不到「这次 keydown 来自行内 input」的信息（`isEditing`
  已被清），任何基于状态的补判都会与「焦点在别处按回车进入编辑」的正常路径相撞。已确认回车没有 window/document 级消费者（全仓的 Enter 处理都是组件内的），断传播无外溢影响；
- **Esc 刻意不断传播**，与回车相反：wrapper 没有 Esc 分支，冒泡过去也不会把编辑重新开起来，故不存在需要断掉的回环；而 Esc 有全局消费者（浮层在 window 上挂了关闭监听，见
  `overlayLifecycle` 的 `onEscape` / `overlayGuards` /
  `escapeDispatcher`），断掉会让「在浮层里编辑数字时按 Esc 关不掉浮层」。保留冒泡才是一次 Esc 取消编辑、两次关闭浮层的常规层级。

### 修复 · 和弦级数与排序把属七降五之类的和弦当成小调 / 减系（2026-09-24）

- `theory.shared` 的两条口味判定各自手写了一套 AST 字段判断，与 `chordQualityAst`
  里的权威判据不一致：小调那条多看了五音（把「大三音 + 减五」的变化属和弦也算成小调），减系那条反过来漏了「三音须为小三度」的前提（把同一个和弦也算成减系）；
- 后果是这类和弦的罗马数字级数被标成小写，且排序元数据的性质分组跟着走偏。两条判定改为直接调用权威实现，不再各自维护一份字段判断；
- 例：`G7b5` 在 C 大调下此前标作 `v`，现为 `V`。

### 修复 · 工作台指板卡与右侧面板列未滚动时顶边不齐（2026-09-24）

- 工作台画布留白改由指板几何派生（上下留白 7 × 本侧 scale 7.4 = 51.8px）之后，右侧面板列宿主盒的纵向内缩仍是按旧的
  `p-2xl` 算的 `inset-y-sm` + 内容 `py-xl`（0.5rem + 1.5rem =
  2rem，根字号 22.25px 下为 44.5px）—— 未滚动时首卡顶边比指板卡高 7.3px；
- 宿主盒的纵向内缩改为「画布留白 − 内容补白」的算式（`calc(edgePad − var(--spacing-xl))`），与内容上的 `py-xl`
  相加恰为画布留白，两条顶边齐平。用算式而非写死像素，是为免把内容补白抄成第二份（spacing token 是 rem，随根字号走）；
- 同处一并下调保存操作栏的贴底位置（3 / 4 / 5 品：5rem / 3.5rem / 2.5rem → 3rem / 2.5rem / 1.5rem）。

### 修复 · 乐谱预览的半成品接续可能把该谱卡成恒红（2026-09-24）

- 续跑结果的「空批」判据原先只看渲染线程回了没有：若上一轮在最后一页出图之后、提交之前被打断（切歌、改内容），登记下来的前段已是整轮页数，下一轮原样接回后渲染线程无事可做（续跑区间为空）、回一个空批 ——这在正常流程里是**预期收尾**，却被当成「未能生成有效的预览数据」抛错；
- 错误态清空页流、收尾又把同一批页登记回去，于是同键重试必然复现，该谱的预览从此只能靠强制重跑恢复。判据改为「既没回新页、手上也没有前段」才算失败；

### 变更 · 乐谱预览改为流式分页渲染，并支持中断后续跑（2026-09-23）

- **排版结束就铺骨架**：渲染线程在纯排版（折行 + 装箱）完成、第 1 页还没画时先把总页数报回来，主线程据此铺出对应数量的虚线占位槽（带「n
  / 总页数」读数）——超长谱的等待从「白屏等整批」变成「N 个槽位逐个填」，而「有 N 页」这件事远早于「第 1 页画好」；
- **逐页流式上屏**：渲染线程每画完一页即单独上报（带页图），主线程就地建 URL 上屏、并把这批 URL 留给随后的缓存条目复用 —— 不在整批完成时重建，重建会让每张图重新取 blob 解码、整屏白闪；
- **页宽改为显式给**：被 `content-visibility:auto` 跳过渲染的页，宽度不再由内容决定，而旧写法
  `contain-intrinsic-size: auto <页高>`
  里那个长度**同时作用于两轴**（等于拿页高当页宽，A4 下约大 40%），于是每出一页页流就长一截、横向滚动条一路缩，骨架占位白铺。现页宽按纸型比例由显示高度换算并显式下发给页图与骨架槽位，`contain-intrinsic-size`
  两轴写实，页流总长恒为「页数 × 单页宽 + 间距」，填充与滚动都不再改变它；
- **中断后续跑**：新增「半成品登记表」（内容键 → 已被打断、但已出图的前段页）。一轮渲染被中断（切歌 / 改内容）时，已画好的前几页在收尾时登记进去；下一轮同键起手把它们接回来当起点，请求带上续跑起点，渲染线程照常重算排版（纯函数、便宜，且页数与逐页内容都由它决定）但**跳过这些页的绘制与 JPEG 编码**（整笔里最贵的一段）。登记表按条数与字节数并列驱逐、内存配额那一路至少留一份，并登记进开发面板的内存读数；
- **前段必须与本次排版同页数**：内容键是「前段还属于这套排版」的唯一凭据。续跑回带的总页数与登记读数不符、或拼装后有空缺，一律判废并从零重跑 —— 宁可重跑，也不能把旧页贴到新谱上；
- **可中断在途渲染**：新增中断请求，渲染线程在 await 边界（字体装载之后、逐页编码前后、页脚合成逐页之间）自查标志位并主动中断。否则切歌时上一首没画完的整谱渲染会把新歌挡在后面整整一轮，这正是「切歌后比首次渲染还慢」的主要来源。只对**声明过作废判据**的任务下发（整谱预览、页脚合成），导出没有「作废」概念、永不受影响；
- **「作废」与「失败」靠一条共用文案区分**：中断点抛的、排队期作废用的，是同一条常量文案。作废不是失败（调用方本就不要这一笔结果），主线程据此静默认领 —— 页脚合成没有 token，靠的就是它，免得切一次歌就弹一句「页脚合成失败」；
- **页脚合成也可作废**：判据是「发起时那首歌已不是当前歌」，同一首改内容不作废（结果仍属该歌、合成完照样能用）；
- **同一内容键只跑一轮**：切歌会同时触发「歌曲 id 变化」与「防抖 watch」两条生成路径，此前第二轮会把第一轮的在途结果整份作废（白跑一整轮、切歌耗时翻倍），还会撤掉第一轮已流式上屏的页（肉眼即「切歌时图片闪一下」）；现同键复用，强制重跑不受此限；
- **加载文案按阶段分档**：渲染线程上报「正在加载字体 / 正在生成预览」两档，且**起手时**若渲染线程尚未建立，首帧就按「正在加载字体」起 —— 字体子集命中 HTTP 缓存时只有几十毫秒，靠线程事后上报往往整段落在同一帧里、一次都画不出来；线程已存在但本次仍需取字体时，才由它补报；
- 页流读数（`当前页 / 总页数`）在流式期间取**计划总数**：骨架也算进页流占位，分母须是最终页数而非已出图页数。

### 变更 · 和弦选择面板的卡片版式改轻、卡角控件统一语汇（2026-09-23）

- **卡片四边留白同宽**：此前上边单给 `pt-4`、其余
  `0.5rem`，是为卡角两枚控件让出一条落脚带 —— 而那一带本就压在画布「名字区块」上半截（= 顶部留白 + 名字字号，字形顶之上只剩空白）。四周同宽后，卡顶到名字字形、卡底到网格底、左右到画布边缘同量级，纵向相邻两卡的净距也随之与横向看齐；虚拟行高的唯一口径（`getPickerCardChromePx`）同步由
  `1.5rem` 改为 `1rem`，两处必须同步改；
- **右上编辑钮改 ghost**：由「描边 + 常态底色 + 圆角」的中性胶囊改为无描边、无常态底色，只在指针落到按钮上时补一层中性软底（前景由 disabled 升到 body），图标内缩同步收小；
- **左上来源分组角注去框去底**：只留一行小字（分组名与 hover 提示都保留，仍是绝对定位、可截断、不吃指针事件）。它此前与编辑钮凑成卡角一对「贴纸」，一张卡上最多同时出现三条框线，而角注底色与卡底本就同档（暗色同为
  `#1c1c1e`），真正构成视觉重量的只有那条 1px 描边 —— 去掉即等于去掉全部重量；
- 分工口径落定：**常驻的最轻（信息），召唤来的才带底（动作）**
  —— 卡面不再出现任何「描边色块」，整张卡只剩自身一条边框，两角都是无线条的轻元素；
- 多指法面板的缩略图外层留白一并去掉，与和弦库 picker 的缩略图口径一致；
- 待确认：角注与名字字形不重叠，但间隙只剩几个像素（角注自 `top-1`
  起、一行小字高，名字字形在其下）——字号或留白再动一档就可能相撞，需实测。

### 变更 · 顶栏文档操作按钮的禁用态改为挂「为什么禁用」的提示（2026-09-23）

- 文档操作区七个按钮（工作台：试听 / 复制 / 粘贴；乐谱：复制文字 / 粘贴 / 复制长图 / 下载）在禁用态下不再把提示摘掉，而是换成**原因**——此前只有同步弹窗这么做，现为本区通例；
- 提示与禁用判据一一配对（每个按钮一个判据 computed + 一个提示 computed）：原因分支按判据的先后顺序逐条列出、只报**当前真正触发**的那一条，故不会出现「按钮已禁用、提示还写着点它会怎样」的自相矛盾，判据加一条时也漏不掉对应的原因；
- 复制长图与下载依赖同一份产物、共用同一条判据，禁用原因因此也只写一份（分开写迟早冒出「长图能复制、下载却禁用」时两处提示各说各话）；
- 下载按钮此前完全没有提示，现已补上，且**只在禁用时**给原因——该菜单 hover 即展开面板，可用时再弹一层提示会与面板叠在一起；
- 该区原先「禁用态不挂 tooltip」的约定改为「tooltip 是按钮的唯一说明位：可用时说动作、禁用时说原因」。

### 重构 · SVG 指板几何全部改由本侧几何派生，线宽成为三处共用的几何量（2026-09-23）

- **网格线宽收进基准几何**（`LINE_WIDTH`）：此前交互侧自带一个线宽常量、画布侧另写一个数，同一张指板的网格粗细有两个来源；现在三处各按自己的 scale 派生，弦枕枕条的横向外扩也随它；
- **弦枕枕条矩形收进几何**（`nutBarRect`）：横向左右各外扩半线宽以盖住零品线的整条线宽、纵向自网格顶向上一条弦枕；交互侧另行补回网格顶的半线宽修正，两侧枕条因此逐像素同形；
- **音符与横按的记号尺寸全部登记到交互侧几何**：圆点的描边宽度、外圈高亮环的半径与线宽、圆点内的音名字号 / 升降号 / 静音叉号、横按梁的描边宽度（此前散在组件里的裸比值与裸字面量）——音名字号一改，圆点内的字、升降号与叉号一起跟；
- **交互指板 SVG 组件按上述口径重写**，视觉口径与 Canvas 侧逐项同源；唯一的差异仍是空弦区更高（本侧空弦位装的是音符圆点而不是基准的小圆圈）；
- **工作台交互卡不再自定几何留白**：`WORKBENCH_CARD_PADDING` 撤销，卡片直接贴着指板本体，外框即「图 × 本侧 scale」；
- **离屏位图的键改由几何产物派生**：不再逐位列出「哪些开关进几何」，而是直接拼布局产物（宽 / 高 / 网格顶 / 首弦 x
  / 空弦标记位）——新增一个几何开关时不必回来补 key，只有「不影响几何、只影响内容」的横按开关仍需显式登记；
- **导出侧的样式纪元同样只取缩放倍数**：几何一律是「基准 × 倍数」，逐个列出派生量等于把这条派生关系抄第二遍 —— 加一个几何项就要回来补一行，漏了还会静默命中旧样式位图；
- 空弦○与静音✕标记的笔触改用几何的线宽（此前在绘制内核里就地写死，不随基准变）；
- 和弦名行高只有一份声明：`Fretboard.vue` 的名字行盒改为消费 `CHORD_NAME_LINE_HEIGHT`，不再用 Tailwind 类另写一遍；
- 可见变化：交互侧的品号字号与左偏移改由几何给出（此前是 Tailwind 的 `text-xl` 与写死的
  `22px`）——字号由 1.5rem（当前根字号下约 33px）增到本侧几何的约 59px，与指板本身的体量相称。

### 重构 · 指板上下/左右留白拆分并收进基准几何（2026-09-23）

- **图的留白按方向拆成两个基类值**：`FRETBOARD_LEFT_PAD`（左右）与 `EDGE_PAD`（上下），三处指板（交互 SVG
  / 主线程离屏 Canvas
  / 导出 Worker）一律「本值 × 自己的 scale」。此前底部、左右、顶部各有一套口径，同一张图的边留白有三个来源，各侧还能自行另定；把上下与左右绑成一个数，又会逼着「要装下品号的横向」与「只作呼吸空间的纵向」互相迁就；
- 两处「各侧特例」随之撤销：交互侧专属的底部留白、导出侧的「底部不留白 =
  0」，改为基准值 ——导出图因此多出一条底部空间（行内容高同步增加）；
- 纵向链固定为**顶部留白 → 和弦名 → 空弦区上 padding → 空弦区域 → 空弦区下 padding
  → 指板（弦枕 + 网格）→ 底部留白**：四段留白全是基准常量，各侧只差「和弦名」与「空弦区域」两段的**内容**高度 ——名字字号、空弦标记体量怎么改都只动那一段，留白与其余各段不动；
- 空弦区的上下 padding 提升为显式基准项 `MARKER_PAD`（上下同值，取弦枕高度的固定倍数），空弦区域高度另立
  `MARKER_AREA_H`（基准取圆圈直径）：交互侧的重载从「整块高度」改成只重载区域高度（音符圆点直径），两侧的几何区别只剩这一个数。此前留白由「块高 − 标记直径」反推，标记一换留白跟着漂；
- **名字下内边距撤销**：名字段 = 顶部留白 + 内容，与空弦区之间那段空白由空弦区的上 padding 单独承担，不再叠两份说不清归属的合成量；
- **弦枕不再参与空弦定位，且画了才占位**：空弦标记中心 = 空弦区上 padding + 区域一半（算式里没有弦枕）；弦枕那一段只在它**真画出来**的那张图里占位 —— 零品窗口有它、偏移品窗没有，不再无条件预留。此前偏移品窗下「空弦区上下 padding 明明同值，下边距却比上边距多出整整一条弦枕」，两张图观感不一致；代价是画布高度随品位窗口差一条弦枕，故离屏位图的键与各侧的几何实例都带上「本图是否画弦枕」；
- 指板顶的墨迹位置在三处对齐：画弦枕时是弦枕条的上沿、不画时是零品线的上沿，两者都落在「空弦区底 + 空弦区下 padding」那条线上（交互侧的半线宽修正随之按是否画弦枕反向）；
- 升降号上标改按**正名字号的比例**给出（基准与导出侧各自一对比值），不再写绝对值：绝对值是贴着当时的字号调的，字号一改就不跟 —— 上标一度反超正名；
- 和弦名字号缩小一档并成为**新基准本身**，而不是留一个缩放入口；交互侧不再自定左右留白与字号，本侧只剩 `scale`
  一个几何声明；
- `FretboardCanvas` 不再接收 `chord-name-scale`，只留
  `scale`（纯 CSS 侧的整体放大/缩小，不参与几何）。picker、乐谱槽位、变体弹窗、导出预览四处各自的缩放一并删除；
- 可见变化：基准指板图的网格顶由固定偏移改为按骨架逐段累加（数值**下移**）、导出侧补回底部留白，图整体**变高**；名字预留高度 = 名字字号（两套布局的顶部留白同为基准值，差额只剩名字内容那一段）；
- 工作台：指板本体宽度改为填满卡片，卡片四边留白全部归零、外框与本体同尺寸；工作台画布的外侧留白随留白拆分改为逐向派生（纵向取上下留白、横向取左右留白）。

### 重构 · 交互指板不再声明品高，只声明 scale（2026-09-23）

- 交互指板的几何声明此前写成「品高 100
  ÷ 基准品高」，等于让基准表里的品高**反过来**决定本侧的放大倍数：基准一动，本侧的弦距 / 留白 / 字号全跟着动，而基准表本该只定义「一张指板长什么样」；
- 现在本侧只留一个
  `scale`（7.4）并消费几何产物 —— 品高与其余尺寸一样是它的产物，本文件也不再读基准表（重载里要基准量时读产物，如
  `super.chordNameBlockH - super.chordNameFontSize`）。屏幕品高 100 →
  99.9px（差 0.1px，不可见），弦距 / 留白 / 卡片尺寸等比跟随，「卡片外框 = 图 × scale」不变。

### 修复 · 浮层归还焦点仍会拽回滚动容器（2026-09-23）

- 上一轮给 `BasePopover.restoreFocus` 加了
  `preventScroll`，但同一缺陷在浮层生命周期的归还路径上还活着（`overlayLifecycle` 的
  `restoreFocus`）：键盘用户在可滚动容器里 Tab 进抽屉 / 模态，关闭后容器被拽回触发器，正是新注释描述的症状；
- 该文件里 `focusPanel`（打开时聚焦面板）早就有
  `preventScroll`，关闭侧的归还漏了 —— 同一个「把焦点还给谁 ≠ 把谁带进视野」的判据只落了一半。两处现已同口径。

### 修复 · 备份包仍可能带着明文凭据导出（2026-09-23）

- `SECRET_FIELD_BY_KIND`
  这张表收拢了「本 kind 的凭据落在哪个字段」，加密与解密两个方向都从它取；但**剥离明文凭据**的分支仍是独立的一份
  `switch`，同一事实在同一个文件里写了两遍；
- 漂移的后果不是丢数据而是**泄漏**：新增一个 kind 时进了表、漏了这个 switch，凭据就会既加密进 secrets、又以明文留在包体里跟着导出。该路径此前也没有任何单测（`grep secrets tests`
  零命中）；
- 改为直接按表取值剥除，结构上不再可能漂移。

### 修复 · 歌词行以反斜杠开头时往返丢字符（2026-09-23）

- 段标记转义（R6）两侧不对称：转义只认「整行 trim 后等于 `CHORDS:` / `SLOTS:` /
  `LYRICS:`」，反转义却剥掉任何「去掉首字符后 trim 等于标记」的行 —— 用户歌词里字面写的 `\CHORDS:`
  往返一次就静默少一个字符；
- 现约定「以 `\` 开头的行一律再补一个
  `\`」，反转义按同一条件对称剥回，任意输入都能原样往返；既有文本（转义标记行与普通行）的解析结果不变。

### 修复 · 冷轮次失败后预览加载文案卡在「正在加载字体」（2026-09-23）

- 「fonts」这一档是**单向闩**：它只在 worker 走到字体 await 之后的那次无条件上报里才会被改回 render。本轮若在到达 worker 之前就失败 ——
  OffscreenCanvas 不可用、排队期间被判作废、或 worker onerror 被丢弃 —— 那次上报永远不会来；
- 改为在本轮终结的失败分支复位到稳态值。只影响加载文案，页面本身不受影响。

### 变更 · 变体删除弹窗收窄、变体列表改为整弹窗滚动（2026-09-23）

- 「删除和弦的指法」弹窗由 `xl` 收窄为 `lg`；
- 变体网格去掉了自己的 `max-h-[52vh]` 滚动区（该限制本就不生效），长列表改为撑开、由弹窗 body 统一滚动；
- 卡片内边距与缩略图外层包裹一并去掉，缩略图占满卡片宽度。

### 清理 · 删除无人消费的渲染进度通道、导出侧补回第 4 项刻意排版差异（2026-09-23）

- worker 每渲染完一页就 post 一条 `progress`、服务层也照转，但已无任何调用方传 `onProgress`（导出与预览都只传 `onStage`
  /
  `isObsolete`）—— 一条热路径上的死消息，且会让下一位做进度 UI 的人面对两个通道。整条通道（worker 三处上报 + 消息联合类型 + 服务层转发与选项）一并删除；
- 导出侧此前声明了四项「相对指板渲染的刻意排版差异」，重载只落了三项，上标垂直偏移静默变成「继承基准」。今天两侧同值，但基准一调导出图就会跟着动 —— 补上第四项重载（同值也重载，正是拆出本侧重载的意义）。

### 重构 · 和弦身份收口、provider 错误处理收敛、两处状态机外提（2026-09-23）

- 和弦「身份判定」此前散落两处：指纹 `computeChordFingerprint` 住在
  `theory/bassConsistency.ts`（该文件其余内容只是斜杠低音一致性与调弦空弦基准），归一化名称键 `nameKeyOf` 住在
  `store/chordGrouping.ts`（一个纯视图构建模块）。两者同迁入新的 `theory/chordIdentity.ts`，由 `theory/theory`
  barrel 统一出口。两处各带一份 WeakMap 缓存与「读前校验输入签名」的防脏读逻辑，随实现一并搬移、注释随行；
  `bassConsistency` 职责因此变纯，`chordGrouping` 只做消费。10 个消费方本来就经 barrel 取用，**import 路径零改动**；
- 同步 providers 的重复守卫收敛：四个 provider 里 27 处「非 ok → 抛
  `REQUEST_FAILED`（状态码 + 可选详情）」的手写块，压成 `syncBase` 的 `buildApiError`（按 `colon` / `paren` / `plain`
  三种既有文案风格参数化，保证错误文案逐字不变）；github 与 gitee 各自重复两遍的「GET 探测远端 sha
  → 带/不带 sha 的 PUT」压成 `probeRemoteSha`
  （保留「探测必须带 ref，否则读默认分支会误判」的原修复）。四个 provider 合计 695 → 616 行，`syncBase.ts` 137 →
  187 行（两个 helper + 注释）；`syncBase.ts` 头注释里「抽走**两个** provider」的陈旧表述同步改为四个；
- `ChordPickerPanel.vue` 892 →
  726 行：底部定位条的分区滚动高亮整块（激活分区推导、点选期间冻结推导的状态机、rAF 合帧调度、分区元素缓存、分区选项）抽成平台 composable
  `useSectionScrollSpy`（289 行），组件只留接线。该块此前与「窗口化」「吸顶头」等平台能力平级，抽出后可与它们并列复用；
- `FretboardSvg.vue` 809 →
  642 行：浮动横按气泡的整套局部状态机（悬停激活键、200ms 延迟隐藏计时器、挂载态、离开动画期间不脱位的几何缓存、箭头取色）抽成
  `domains/fretboard/composables/useBarreBubble`（272 行）。抽出的判据是它自带完整状态机、与指板渲染无关。顺带补上此前缺失的清理：延迟隐藏计时器在组件卸载时未被撤销，现已随模块一并
  `onBeforeUnmount` 撤掉；
- 三份域 `index.ts` 此前被当作「公共门面」，实际全仓零引用、跨域消费一律走深路径。**不删除**，改为在头注释里明确它
  **是模块清单、不是导入入口**，并列出「已对外可用但未 star-export」的模块及原因（`model/fretboardGeometry` 的
  `FretboardGeometry` 与 `renderFretboardCanvas` 的同名再导出撞名，`export *`
  会让该名字在 barrel 里被静默剔除，反而比现状更差）；`CONTRIBUTING.md` 的「目录结构」同步写明该约定；
- `CONTRIBUTING.md` / `ARCHITECTURE.md`
  里「领域之间不直接反向导入」的表述属过度承诺：6 条 zone 只给「纯几何模型」与「乐谱领域」设限，`chord ↔ fretboard`
  双向都在约束之外（实测 `chord → fretboard` 38 条 / 26 文件、`fretboard → chord` 12 条 /
  7 文件）。两处文档改为逐条列出 6 条 zone，并显式标注这两条合法边——照「互不横向依赖」去推断，会把它们当成违规来「修」；
- `runBusyAction` 的头注释如实化：它依赖的是 `@/platform/store/uiStore`，属
  **platform 内部依赖**，六条 zone 一条都不涉及，放在 `platform/composables/`
  不构成违规；真正值得注意的是相反的一面——它是该目录唯一碰 store 的条目，消费方全在 app / domains（7 文件 /
  18 处调用），因此**不能整文件搬到 app 层**（会立刻违反 `domains ↛ app`）。契约与消费方清单一并写入注释；
- 均为内部重构，无用户可感知变化。

### 重构 · 聚焦环切出无状态探针、和弦库持久化独立成层（2026-09-23）

- `focusRingOverlay.ts`（916 行）按**有没有状态**切出
  `focusRingProbe.ts`：禁用判定 / 圆角 / 设备像素吸附 / 矩形相交 / 层级解析（内联与静态两路）/ 裁剪祖先与透明度读数来源的快照 / 可见性判定 / 遮挡物收集全部外提，控制器只留逐帧状态与绘制动作。`readEffectiveAlpha`
  与 `clipRectOf` **刻意不搬**——它们的输入是控制器持有的快照数组，外提等于把控制器状态形状摊进探针接口，而两者又都挂在
  `__focusRing` 调试面上；
- `chordStore.ts`（635 行）目录化为 `chordStore/index.ts` +
  `chordStore/persistence.ts`：整库快照的防抖刷写、失败上报与成功清标记、启动加载独立成与 Pinia 无关的纯模块；水合门禁以
  `canPersist`
  谓词注入，「谁有权写盘」仍只有 store 一处决定（hydrate 读失败时保持门禁关闭的不变量不受拆分影响）。对外路径
  `@/domains/chord/store/chordStore`
  不变（目录 index 解析），31 个消费方零改动。刷写顺带收紧一处：立即刷盘时撤掉挂起的防抖计时器——送的是全量快照，挂起那次已被覆盖，省掉一次重复的整库按引用 diff；
- `useLyricsDragDrop` 的两个入口（外部和弦拖拽 / 谱面槽位按下）此前登记体逐字重复，现合到
  `beginPointerSession(chord, sourceKey | null, e)`，差异只剩「守卫放哪一侧」与 sourceKey 的取值；
- `eslint.config.mjs`
  头注释此前把 6 条 zone 概括成「domain 之间互不横向依赖」，与规则实际语义不符（只给纯几何模型与乐谱领域设限，`chord ↔ fretboard`
  双向都不在约束内），改为逐条列出并写明这一例外。
- 纯等价改写，无用户可感知变化。

### 修复 · 滚动容器里滚走的视口会被拽回浮层锚点（2026-09-23）

- 在工作台右侧面板列这类「滚动即收起区内浮层」的容器里打开调音选择器，再滚动该列：视口会被拽回选择器处，用户那段滚动被整段撤销，滚得越远回弹越明显；
- 根因是浮层关闭后的**焦点归还**用了不带 `preventScroll` 的 `focus()`：面板卸载时焦点掉回 body，`restoreFocus`
  把焦点还给触发器，而浏览器默认会把目标滚进视野，容器的滚动位置于是被一并改写；
- 修法是给这次归还加 `preventScroll`：键盘连续性不变，但不再替用户决定滚动位置；
- 平台内已有同口径先例：`BaseSelector.scrollToSelected` 与 overlayLifecycle 的聚焦都显式 `preventScroll`。

### 修复 · 拖拽排序的右键取消会卡在右键处（2026-09-23）

- 按住排序拖动时按右键本应「取消本次排序并复位」，实测影像会停在右键处不动，要再点一下页面才收尾；
- 根因是 fallback 通道下 sortable 只监听 `pointerup`（没有 `mouseup` 兜底），而右键的原生菜单一弹出，那次 `pointerup`
  就可能不再派发 —— 拖拽于是挂到下一次无关的松手，取消分支根本没被触发；
- 改为在 `contextmenu` 里、菜单弹出**之前**主动结束拖拽：补发一个合成 `pointerup`（button
  2）让 sortable 当场走完收尾，`onEnd` 随即按取消分支复位 —— 复位动画因此能照常启动，影像滑回起拖位置。

### 重构 · 指板几何残留的手算收进几何类（2026-09-23）

- 弦区跨度 `(N − 1) × 弦距` 此前在画布侧、绘制内核、交互 SVG 三处各写一遍，现收进
  `FretboardGeometry.stringsSpan`（`boardWidth` / `sizeOf` 也由它组装）；绘制内核不持有几何实例，仍就地按同式算；
- 「板之上留白」（名字区 + 网格顶）此前在交互侧声明文件与 `useFretboardLayout` 各算一遍，现收进
  `FretboardGeometry.blockAboveBoard`；
- 导出侧位图顶部留白（名字文字实际占用的上边界）收进 `FretboardGeometry.chordNameTopY`；
- 纯等价改写，无用户可感知变化。

### 修复 · 右键菜单换锚点的滑动位移未计入翻转与限位（2026-09-23）

- `BaseMenu.openMenuAt` 换锚点时拿**锚点坐标之差**当 FLIP 位移，而 `flip`（贴视口边缘翻转）与
  `shift`（限位）都会改变「面板相对锚点的偏移」—— 那时锚点差值不再等于面板位移。视口下缘右键、面板翻到光标上方时最明显：面板先从目标点上方整整一个「锚点位移」处起跑，再往下滑到落点；
- 改为量**宿主前后落点之差**（`getBoundingClientRect`）：位移与定位结果解耦，翻转 / 限位下同样成立；
- 位移还必须在**新坐标已写进宿主 style 之后**起跑：原实现只调 fire-and-forget 的
  `update()`，加性位移先叠在旧 transform 上（叠出 2×旧 − 新），要等重算落地才回到正轨，中间闪一下。为此
  `useFloatingPosition` / `BasePopover` 补一个返回 Promise 的 `compute`（与既有的 fire-and-forget `update`
  并列，对应 floatingCore 本就有意保留的两个计算入口），`openMenuAt` 等它 + 一次渲染 flush 之后再量落点；
- 同一实例的换锚点位移最多一条：起新动画前先把在途那条 `finish()` 到终点，否则量到的是动画中间态、位移被重复叠加；
- 同批的内部加固（无用户可感知变化）：`BasePopover` 打开时在**面板上屏后**再显式复算一次定位。面板是 `v-if="isShown"`
  才渲染的，上屏前浮层尺寸为 0，那一次的翻转 / 限位判定并不成立（只为让宿主先落到锚点、避免从 (0,0) 闪入）；此前靠 ResizeObserver 的投递时机纠正，而它的投递发生在渲染步内、内容异步渲染时会晚到，面板会先按「未翻转」的坐标画一帧。改为等一拍让面板进 DOM 再算，这条时序不再依赖 RO；
- 用户可感知的变化：已打开时在别处右键，菜单现在是「从它原先所在的位置」平滑滑到新落点，翻转时不再先跳到另一个位置再滑回来。

### 重构 · 预览页脚收回渲染线程，主线程彻底不再加载 Sarasa 子集（2026-09-23）

- 预览页脚页码此前由主线程叠一张透明画布自绘（`components/ScorePageFooter.vue`），**唯一目的就是画那一行字**，却因此让主线程加载了随包分发的 1MB
  Sarasa 子集；现该组件删除，页脚与导出同路 —— 一律由 Worker 的 `composeFooterPages`
  把页码合成到页图上，主线程 0 绘制、0 字体加载（`scoreFonts` 现仅被 `scoreExportWorker/*` 引用）；
- 预览侧改为**两套展示源按开关切换**：页面栅格仍不含页脚（唯一真源不变），合成层懒生成并按缓存条目存放（`PreviewRenderData.footerUrls / footerBlobs`），开关只在「合成图 / 无页脚原图」间换
  `src` —— **不重渲染乐谱**，首次打开合成一次，之后来回切零 Worker 调用；
- 页流 `v-for`
  的 key 由 url 改为序号：换源会整体改变 URL，按 url 作 key 会让每页节点销毁重建（整屏闪白 + 重新解码），等于把「只换 src」又变回一次整图重绘；
- 「复制 / 下载本页」复用已合成的 `footerBlobs`，与预览所见逐字节一致，并免去重复合成；`revokeAll`
  与内存配额记账同步覆盖合成层（它是同一批页面的第二份 JPEG）；
- 纯等价改写，无用户可感知变化。

### 重构 · 指板绘制收敛为跨线程共享内核（2026-09-23）

- 主线程屏幕指板（`components/renderFretboardCanvas`）与导出 Worker（`scoreExportWorker/scoreExportFretboard`）此前各写一份**逐段相同**的绘制原语（空弦/静音标记、网格线、弦枕、品号、横按梁、按弦圆点）与和弦名分片量宽/绘制；现收敛到
  `domains/fretboard/fretboardDrawCore.ts` —— 与 `footerOverlay` 同一范式：`Pick<CanvasRenderingContext2D, …>`
  取两种 ctx 的公共子集，几何与字体全部由调用方注入；
- **字体刻意不统一**：主线程屏幕指板不参与等宽栅格排版，列宽不依赖字形推进宽，故**不加载**随包分发的 Sarasa 子集（仍走系统字体栈）；导出图的歌词栅格按 Sarasa 实测的 0.5em 推进宽算死，必须装。两侧各自注入字体工厂；
- 两套「缩字号贴合」求解**保留各自实现**（主线程按 `fontScale`
  倍率缩放、Worker 按绝对 px 逐档下探，数值口径不同，合并会静默改变长名字号），只共享它们共同的量宽/绘制叶子；
- 纯等价改写，无用户可感知变化。

### 重构 · 全局 `fonts` 声明收进 d.ts（2026-09-23）

- `scoreFonts.ts`
  取 Worker 字体集时用的内联交叉类型（`globalThis as typeof globalThis & { readonly fonts?: FontFaceSet }`）已删除；改在
  `src/vite-env.d.ts` 的 `declare global` 中声明 `var fonts: FontFaceSet | undefined`，代码直接读 `globalThis.fonts`；
- 必须用 `var` 而非 `const`：只有 `var` / `function` 声明才会成为 `globalThis` 的属性（TS 对经 `globalThis`
  访问 BlockScoped 全局变量直接报错），而本模块**主线程与 Worker 都会加载**，必须经 `globalThis.fonts`
  读取（主线程上该属性不存在、读取得 undefined，据此回落到 `document.fonts`）。

### 优化 · 两处循环冗余收敛（2026-09-23）

- `renderFretboard` 的三层（名字 / 主体 / 品号）此前各自调用 `resolveGeometry`（内含遍历 strings+barres 的
  `resolveFretWindow` 与 `computeFretboardLayout`），一次整图渲染白算 2 遍几何。现由 `renderFretboard`
  算一次，经新增的**可选** `geometry` 形参下传三层（公开签名向后兼容 —— `FretboardCanvas`
  等仍按原方式独立调用各层，行为不变）；
- `extractSongChordSequence` 的排序比较器此前每次比较都做 2 次 `lineIndexMap.get()` + `typePriority` 查表（O(n log
  n) 次）；现先为每步预计算 (行序, 类型序) 排序键，查找降为 O(n) 次、比较器退化为纯数值比较；
- 两处均为纯等价改写，不改变任何输出。

### 修复 · 浮层 body 滚动锁改为模块级引用计数（2026-09-23）

- `overlayLifecycle` 原先每个浮层实例各自建一个 vueuse `useScrollLock`，其 `isLocked`
  无跨实例协调，多浮层叠加时会出现三类问题：① 后开的浮层误以为自己已锁（A 持锁期间 B 创建，immediate
  watch 读到 body 已是 hidden，直接把自己的 `isLocked`
  置 true）；② 先关的浮层把后开的活锁摘掉（B 卸载时 vueuse 的 cleanup 早于本模块
  `onScopeDispose`，先把 body 还原，本模块重算 `isBodyLocked` 置 false）；③ A 关后 B 单独开着时背景仍可滚。
- 改为模块级引用计数：每打开一个 `locksBody` 的浮层 +1、关闭/卸载 -1，仅当计数归零才真正还原 `body` 的
  `overflow`。与 vueuse 同款（只动 `document.body.style.overflow`，无隐藏成本）。计数版比原 `hasActiveOverlays() > 0`
  判定更正确：只数「真正锁 body 的浮层」，因此 Modal 之上叠非遮罩 Drawer、或反之，都不会错误地保持/释放 body 锁。随之删除已无消费的
  `hasActiveOverlays` 导出。

### 修复 · BaseEditableText 的 Esc 真正回滚编辑内容（2026-09-23）

- 此前 `handleInput` 每键都把 `modelValue` 写回，而 Esc 分支用 `setText(modelValue.value)`
  回滚 —— 等于「回滚到已改动的值」，并不还原。现进入编辑时记录 `editSnapshot`，Esc 时据此把 `modelValue`
  与 DOM 一起还原到编辑前文本。组件 emit 的 `cancel` 新增 `changed`
  布尔参数（用户是否真改动了内容），消费方（Fretboard 和弦名）据此决定是否提示「已取消编辑」，不再各自重复回滚。

### 修复 · 歌手名沿用乐谱名的 15 字上限（2026-09-23）

- 「乐谱配置」弹窗里歌手字段此前复用乐谱名的长度上限（15），而两者不是同一量级：歌名通常 2~6 字，乐队名动辄十几字符（The
  Rolling Stones / Simon &
  Garfunkel）—— 真实歌手名会被静默截断。现给歌手单独一档 24 字（展示侧一律走 truncate，不会溢出）；
- 同批的内部加固（无用户可感知变化）：撤销栈的「结算窗口」标记由布尔改为**嵌套计数**。窗口的解除发生在让出宏任务之后，布尔标志会被**先到期的那次**提前清掉，第二次 undo/redo 仍在窗口内派生的写入就可能被记入撤销栈（表现为「跳步 / 幽灵历史」）。计数保证只有最后一层退出时才真正解除；同时把递减放进
  `finally`，避免 `applyState` 抛错时窗口永久留在打开状态（此后所有编辑都不再入栈）。

### 修复 · 浮层 Tab 圈定漏掉 plaintext-only 的可编辑元素（2026-09-23）

- 三处共用的「可聚焦元素」清单（浮层 Tab 焦点圈定、`v-focus` 自动聚焦、Popover 打开时的首焦点）只认
  `[contenteditable="true"]`，而 `BaseEditableText` 用的是
  `plaintext-only`、空值写法（`contenteditable=""`）同样可编辑 —— 两者都不在清单内。现改为
  `[contenteditable]:not([contenteditable="false"])`；
- 同批的内部加固（均无用户可感知的行为变化）：备份包改写**当前**版本号而不是 1（此前每个新构建的包都要重放整条 1→7 迁移链，靠现存各档恰好幂等才没出事）；推送的载荷构建挪进互斥区间（双击/重试时不再白构建一次整包）；和弦库的「撤销删除」补 id 守卫（连删连撤销时不再插入重复 id）；`extractSongChordSequence`
  补 `chordMap` 的 Map 归一（普通对象会在 `for...of` 上抛）。

### 修复 · 拖拽排序按住期间按右键会把拖到一半的顺序确认掉（2026-09-23）

- sortablejs 的松手监听不按鼠标键过滤（`on(ownerDocument, 'pointerup', _onDrop)`），于是按住左键起拖后再按右键时，右键的松手同样会走
  `onEnd` 并**照常落定**
  —— 用户按右键的意图（取消这次排序）被当成「确认落位」，把拖到一半的顺序直接写回数据。现按松手键位识别次要键（右键），视为松手但只**复位**：把子元素按起拖时的顺序放回、不写回数据、也不补派 click；
- 复位后不再解析任何新顺序：DOM 真源与 `oldIndex/newIndex` 兜底两条都跳过 —— `_onDrop` 的 `oldIndex/newIndex`
  是在复位**之前**取样的，拿它做下标运算会把顺序又算回来；
- 另加一层 `contextmenu` 兜底（只置取消标志、不拦右键菜单）：某些平台的原生菜单会吞掉右键的
  `pointerup`，那时拖拽会一直挂到下一次无关的松手，标志能保证那次松手同样只复位、不落定。

### 修复 · 云端 md5 两侧口径不一致，启动比对恒报「有变化」（2026-09-23）

- `computePayloadMd5` 会先剥掉 `dataMd5` / `dataUpdatedAt` / `absentSections` / `deletedAt`
  再算 md5，而 worker 端一直对 POST 的原始 body 整包重算；自备份包开始携带 `deletedAt`
  删除水位线起，那句「body 就是同一个 `serializeForStorage`」的等式不再成立 —— 只要任一设备删过东西，服务端 `/meta`
  回读的 md5 与本地值就必然不等：启动比对每次都判成「云端有变化」（多一次
  `fetchMeta`，正是它当初为限流加的）、`compareBaseline`
  的短路永不触发，且每次推送在服务端打一条 warn。现 worker 端改为与前端同口径：解析 body → 剥掉同四个字段 → 重算。

### 修复 · 和弦库入库判等漏横按、歌词重复行认领被删行的 id（2026-09-23）

- 乐谱文本导入的入库入口（`chordLibraryImport`）判等只比「名称 + 调弦 + 指纹」，而指纹不含横按：同指法不同横按会被判成「已存在」，导入后横按静默丢失。其余三处判等（分享链接落地、草稿校验、读库去重）都补了横按，此处是唯一漏的；
- 同处的降级复用分支（服务「有和弦名、无指法」的歌词谱导入）此前对**任何**未命中的和弦生效，于是携带指法、只是库中暂无同款的和弦会被复用成一条指法完全不同的同名和弦；现限定为「本次载荷确实无指法」；
- 歌词重复行：内容完全相同的行无法从文本区分（删第 0 行与删第 1 行产出的新歌词逐字节相同），而匹配器按旧下标升序认领 id
  —— 删掉靠前那条重复行时，存活行会拿到**被删行**的 id，随后按该 id 平移字符槽、把存活行原有的和弦整条回收。现让「带和弦的旧行」优先被认领（两条都带和弦时仍无法区分，属已知取舍）。

### 修复 · 高对比主题下的渲染缓存与横按可见度（2026-09-23）

- 预览 / 长图 / PDF 的渲染缓存键此前用 `isDark`（= 非 light）作主题维度，而 dark 与 high-contrast 的 `--fbc-*`
  是不同字面色 ⇒ 切到高对比主题后仍命中旧缓存、出图还是旧墨色。现改用生效主题本身（`FretboardCanvas`
  的位图缓存键用的就是完整主题，此处与它对齐）；
- 指板编辑器的横按梁 alpha 同样按 `isDark`
  取值，而高对比主题的横按源色沿用明色档、底色却是近黑，未标记横按几乎不可见（导出侧画的是不透明纯白，两端口径本就差得最远）。现高对比单独一档。

### 修复 · 旧数据转录重跑会回退迁移后的编辑、并波及同源其他应用（2026-09-23）

- 转录失败时保留 localStorage 供下次启动重试，但重试是把那份**陈旧快照**整份写回和弦库：快照里没有的 id 判为删除、同 id 一律覆盖 ⇒ 上次转录之后用户改过的和弦被回退、已删的复活；而回读核验只看数量与主键存在性、察觉不到内容回退，随后退役标记落盘、localStorage 被清，陈旧快照就此固化。现写回前先读当前库并按
  `updatedAt` 合并（同 id 取严格更新者、库中独有的原样保留、绝不删除），重跑只补缺失不回退；
- 其余键的转录此前对**所有**非排除键无差别处理（抄进本应用 kv 并在末尾删掉），而同源共域可能部署了别的应用（子路径）—— 这正是同处拒绝
  `localStorage.clear()` 的理由。现按本应用键前缀限定作用域。

### 修复 · 配额熔断期间连删除都写不进去（2026-09-23）

- `runTx` 对读写事务一律抛错，于是配额熔断期间「删数据腾空间」这条自愈路径也断了（用户只能刷新页面），而 `idbKv`
  里那句「删除类操作放行以释放空间」与 `persistFailure`
  的「删除/清空类操作不受阻断」都成了空话（回调内的熔断分支永不可达：守卫在进入回调前就抛了）。现把守卫下移到**单个操作**：
  `put` / `add` 照旧抛错让调用方感知失败（否则内存与 IDB 会永久分叉），`delete` / `clear` 放行。

### 修复 · 菜单子面板对键盘与读屏不可达、浮层关闭后焦点丢失（2026-09-23）

- 级联子面板缺 `role="menu"`（菜单项本身已有 `menuitem` /
  `menuitemradio`，容器这一层漏了），且面板经 Teleport 到 body 后不再落在 BaseMenu 的键盘处理之内 ⇒ 子菜单项对读屏与键盘双双不可达。现子面板补
  `role="menu"` 与归属名，并支持 → 展开子面板（焦点交给首个可用项）、← 收起并归还焦点；
- 菜单的「打开后自动聚焦首个可用项」一直是空转：BasePopover 的打开 watcher 也要等一次 `nextTick` 才置
  `isShown`，而面板要到再下一拍才渲染，只等一拍时拿到的菜单项引用恒为 null。于是键盘打开菜单后焦点留在触发器上，而 ↑↓ 处理挂在面板上（收不到事件），菜单对纯键盘用户等于不可操作。现等两拍；
- 浮层关闭后不归还焦点（焦点掉到 body，键盘用户每开一次都要从头 Tab）。现打开时记录前一焦点元素、面板卸载后归还，且只在「焦点已丢或仍在面板内」时归还，不抢用户已主动移开的焦点。

### 修复 · 滚动条拇指与滚轮交接的可达性（2026-09-23）

- 滚动条拇指带 `tabindex` 与方向键处理，却用 `visibility: hidden`
  隐藏 —— 它因此被移出 Tab 序，那套键盘支持永远不可达。现改用 `opacity: 0` +
  `pointer-events: none`（与轨道同一处置），并在键盘聚焦时显形；
- 滚轮「让位」在交接失败时仍无条件 `preventDefault`，而文档级滚动容器又因 computed overflow 判定（`body` 是
  `overflow-y: hidden`）永不入选 ⇒ 滚轮压在无可滚内容的条带上什么都不动。现文档级节点按实际可滚性判定，且只在真的交出去时才拦默认行为。

### 修复 · 输入法合成期抢键、滑块滚轮作用错拇指（2026-09-23）

- 搜索结果面板的键盘导航只读 `e.isComposing`，而宿主 BaseInput 读的是 `e.isComposing || 组件内合成态`
  （个别输入法不置事件字段），注释自称「两处同口径」实际只读了一半 —— 合成期 ↓↑ 仍会被拦成翻页/选中。现把宿主的合成态传进面板，两处真正同口径；
- `BaseNumberInput` 的行内编辑 Enter /
  Esc 没有任何合成守卫（兄弟 BaseInput、BaseEditableText 都有）：合成期按 Enter 确认候选词会拿**未上屏的旧值**提交并退出编辑。现补上同款守卫；
- 区间滑块滚轮步进固定作用于 0 号拇指，而指针与键盘路径都会先挑拇指 ⇒ 聚焦上限拇指滚动滚轮时动的却是下限、数值气泡也跳到错的拇指上。现按聚焦拇指作用，气泡下标同步。

### 修复 · ChordPro 行首连续和弦只保留最后一个（2026-09-23）

- 行首连续和弦（`[C][G]歌词`）清出的歌词长度恒为 0，发射端于是给每个行首和弦都发
  `type:'start', index:0`；重放端用追加语义落位，而该语义只在**越界**分支与「行首前插」有别，第二个和弦因此落进「按索引覆盖」把第一个改写掉 —— 粘贴 ChordPro 后每行只剩最后一个行首和弦。现行首和弦按序号发 0,1,2…（与导出侧 SLOTS 段写 start 槽位下标的既有口径一致）。

### 修复 · 配置弹窗改选调不进撤销栈、若干空操作触发整页重渲染（2026-09-23）

- 「乐谱配置」弹窗写的 `playKey` / `capo`
  属撤销维度，却没记历史 ⇒ 配置里改的选调会被之后任意一次 undo 静默回退到变更前的快照。现与清空和弦 / 改歌词同款：仅当前激活歌曲入栈，且只在值真的变化时记录；
- 槽位交换（拖拽重排）此前无条件标脏，而 `song.version`
  是渲染缓存键的维度 ⇒ 一次失败的拖拽也会让整页重渲染。现与设置/移除槽位同款，空操作（同键、源槽位为空、落位未变）不 touch、不标脏；
- 删空字符槽 / 边和弦槽后不再留下空的行容器：`chordMapsEqual` 先比
  `size`，留着空容器会让「删空后」与「从未有过该行」判成两份不同状态，产生幽灵撤销条目；
- 删除**空分组**时补抬删除水位线：`removeChordsSnapshot`
  在空集时提前返回、不抬水位线，而分组本身照样被删，于是「刚新建/刚改名的空分组」恰为全库最新时，一次「拉取云端」会把已删分组复活；
- 和弦分组折叠此前只清展开态、由两个调用方各自补清选中态（注释却写「都置空」）。现由函数统一清，调用方不再各自补救；
- 多指法变体切换改为与「加载和弦 / 重置编辑器」同款：整体替换草稿时挂程序性标记，避免变体自带的横按被当作「用户改弦」而重算/清除。

### 优化 · 首屏剔除 zod、清理无消费者的令牌与不实注释（2026-09-23）

- 乐谱页的 URL 参数校验改用两个极简判定，不再静态引入 zod：该模块被顶栏静态引用（属首屏闭包），而 zod 是几十 KB 级依赖，为一个「非空串」与「三值枚举」把它拖进首屏不值得（备份包校验仍需 zod，那里本就是动态 import）；
- `tokens/` 下 `--theme-btn-color` / `--theme-btn-bg` / `--root-glow`
  全仓零消费者，删除声明（高对比主题此前还专门加了一句「这里没有这三项」，等于给三个死声明补了第三次文档）；
- 清库动作的 `map(name => void idb.clear(name))` 让 `Promise.all` 收到一串
  `undefined`：「已清空」提示早于删除落地，各次删除的 rejection 还成为游离 Promise、外层 `try/catch` 永不捕获；
- 修正若干与实现相反或已过期的注释：导出质量设置并未移除、`lineEdgeChords`
  返回的是活数组而非副本、转录退役标记的「重跑幂等」此前并不成立（见上）、`duration-slow`
  已是 0.35s 而清理延时与之等长（安全余量归零）、 `sanitizePersistedData` 已无生产调用方、兜底 UUID 的时间戳被 `slice`
  整段切掉（时间维度从未参与）。

### 修复 · 分段控件的「选中项滚进视窗」从不生效（2026-09-23）

- 根因在 `v-scroll-into-view` 的**对象形式绑定**：`isActive()` 认对象为激活（`active !== false`），而
  `normalizeOptions()` 直接展开对象、`active` 留 `undefined`，`executeScroll()` 首行 `if (!opts.active) return`
  随即早退——三处口径不一致，且与类型注释「`active` 默认
  `true`」相悖。于是**所有对象形式的绑定都静默不滚动**。现对象形式默认 `active: true`（显式 `active: false` 仍可覆盖）。
- 分段控件是当时唯一传对象形式的消费方：选中靠后的选项时滑块移过去了、选项却停在视窗之外，即由此而来。其余消费方都传布尔值，故未暴露。

### 优化 · 滚动位置记忆收敛为 useScrollMemory 组合式函数（2026-09-22）

- 左栏与设置弹层此前各写一套「会话级滚动位置记忆」：左栏用实例内的 `Map`
  按路由路径手动存取（切走时保存、切回时恢复），设置弹层用模块作用域的 `<script>` 里两个 `ref`
  按路由维度分档、并在滚动事件里逐个维护 —— 两处的记忆落点（一个实例内、一个模块作用域）、触发时机、恢复时机各不相同，改动时极易只改一处；
- 现收敛为 `platform/composables/useScrollMemory.ts`：按
  `scope` + 档位键把位置记在模块级缓存里，容器上挂 scroll 监听持续记录，容器换绑与换档后贴回，并暴露 `restore()`
  供「容器几何被外部时机破坏后又恢复」的场景补一次（左栏收起→重开即走这条）；
- 记忆必须落在模块级而非组件实例里：设置弹层所在的面板是 BasePopover 的 `v-if="isShown"`，关闭即销毁面板子树、
  **消费方组件本身被卸载**，记忆写在 `<script setup>`
  里会随实例消失；左栏两个 section 也共用同一个滚动容器，位置无法随 DOM 天然保持；
- 记录方式取「滚动时持续记录」而非「换档时现读」：v-scrollbar 卸载摘掉内联 overflow-y 会让 scrolling
  box 被销毁、scrollTop 静默归零且**不派发 scroll**，持续记录保住的是销毁前最后一个真实位置；
- 行为差异只有一处窄路径：弹层被钉住（pinPopover）时切换和弦/乐谱，此前不贴回、现在会贴回该维度自己的记忆位置；
- 记忆档位按**容器内容**划分而非只按路由：乐谱页「排列和弦」与「预览」两个 tab 的设置面板内容并不相同（预览多出对齐 / 忽略空格 / 页脚 / 版面几组），共用一份记忆时切到矮的那个 tab 会把容器钳到它的上限、把另一个 tab 记的位置写坏，现象是「切个 tab 位置就丢了」；现两个 tab 各记一份（与折叠分组展开态的分档口径一致）；
- 换档时**先结算旧档位、再贴回新档位**：新内容一挂上就会把容器钳到自己的上限，若等渲染完才读旧档位，读到的是被新内容钳过的值；
- 档位声明收敛为 `keys` + `activeKey` 两半：`keys` 显式列出「一共要保存几份」，`activeKey` 给出当前在哪一份。声明 `keys`
  后 `activeKey`
  的类型被收窄成这几把键的联合，「漏了某个会改变容器内容的维度」在编译期就过不去；声明过的档位在记忆表里先建出槽位，调试时能一眼看全量；重复键在声明时报一条警告（按一份处理，类型层看不见重复——`K`
  取的是元素联合，`['a','a']` 与 `['a']` 同型）。档位类型只从 `keys` 推（`activeKey` 处套了
  `NoInfer`），否则传个没标类型的 `computed` 就会把档位类型推成 `string`、把约束悄悄架空；因此消费方给 `activeKey` 传
  `computed` 时要标出档位类型。档位空间开放的场景（左栏按任意路由路径分档）不写 `keys`，`activeKey` 收 `string`；
- 贴回写入会被浏览器按当前可滚动量钳位（折叠分组高度过渡期间尤其明显），该钳位值及其派发的 `scroll`
  不再计入记忆 —— 此前会把上一次的真实位置覆盖成钳位值，且不可自愈；同时贴回后逐帧补写直到落位，避免只在内容长高之前写一次。

### 优化 · v-scrollbar 的样式从 TS 注入串搬为独立 SCSS（2026-09-22）

- `scrollbarCore.ts` 里那段 `style.textContent = …`（53 个片段、约 5KB，其中 36% 是注释）搬入
  `vScrollbar/vScrollbar.scss`：此前它原样进 JS 产物、不经压缩与 autoprefixer，首次挂载时还要被 CSS 解析器逐字解析一遍，prettier
  / 编辑器语法高亮 / Tailwind 扫描都看不到它；现交由构建管线处理，说明性注释也不再随产物下发；
- 三个数字（轨道粗细 / 交互热区外扩 / 逐字符翻页时长）仍以 TS 为唯一来源 —— 它们同时参与运行时逻辑（粗细参与轨道与拇指的贴边偏移计算，翻页时长参与定时与节流判定），由
  `ensureGlobalStyle` 注入成 `--v-scrollbar-thickness` / `-hit-area` / `-roll-duration`，SCSS 侧一律 `var()`
  消费，不写第二份字面量；
- 注入点随之只剩这一行变量桥（style 的 id 由 `v-scrollbar-style` 改为 `v-scrollbar-vars`），且必须在
  `createAxisOverlays` 之前执行 —— 缺变量时 `calc(var(…))` 整条声明失效，轨道宽度与交互热区会静默归零；
- 观感逐像素不变：搬运后逐条核对了 21 个类选择器与全部常量消费点，无遗漏、无残留字面量。

### 修复 · 滚动条拇指配色补齐高对比档、主题令牌归位 tokens.scss（2026-09-22）

- `--v-scrollbar-thumb` / `--v-scrollbar-thumb-hover` 此前只写在 `scrollbarCore.ts` 运行时注入的样式串里，且只有
  `:root`（亮色）与 `.dark` 两档 —— 高对比主题因此回落亮色取值（`#c7c7cc`，悬停
  `#8e8e93`），在近黑底上表现为「悬停反而变暗」，与暗色主题的方向（悬停变亮）相反；
- 现移入 `tokens.scss` 并补齐三档：亮色与暗色沿用原值，高对比取本主题既有的 `--border-base` / `--text-muted`
  取值（`#6b6b76`，悬停 `#b9b9c4`），比暗色亮一档、悬停方向与暗色一致；
- 注入的样式串里不再出现 `:root` / `.dark` 选择器，只留类规则 —— 主题令牌一律归
  `tokens.scss`，避免再绕开「三档齐备」这条约束（原先正是「写在注入串里」让高对比档漏了）。

### 修复 · 指板横按气泡的箭头取色与过渡改与面板同源（2026-09-22）

- 未标记态的箭头描边此前取指板主题蓝的半透明分量（`rgba(59,130,246,0.4)`），而面板自身的描边是
  `--tint-primary-60`：合成到面板底色后浅色下是 `#aecbfa` vs `#91c2fa`、深色下是 `#375376` vs `#144477`
  （红通道差 35），楔形两条斜边与面板描边在接缝处会阶跃变色 —— 与该处注释自称的「与面板同源 0 色差」不符；现改取
  `--tint-primary-60`。那套 rgba 分量本就是给 canvas 与 SVG 横按梁准备的（那两处读不到
  `var()`），DOM 侧的箭头没有这个限制，不再借用；
- 箭头的变色过渡此前写死 150ms / `ease`，面板走的是
  `duration-fast`（100ms）——悬停与标记变色时接缝处有50ms 的异色窗口；现改为与面板**同一组工具类**（`transition-[…] duration-fast`），时长与曲线不可能再各自漂移；
- `BARRE_ARROW_TRANSITION_MS` 随之零引用，已删除（留着会让人以为箭头过渡仍是独立时长）。

### 优化 · 气泡与箭头的装配收敛为三处单一来源（2026-09-22）

- 气泡表面收敛为 `--bubble-*` 语义层（`tokens.scss`）：`v-tooltip` 的 compact 档与 `v-scrollbar`
  的读数气泡此前各持一份字面量（后者是逐值手抄，注释里自认「逐值对齐」），现共用同一组令牌 —— 底色 / 描边 / 阴影 / 字重 / 行高两档共用，sm
  / md 档只差留白 / 圆角 / 字号，度量档取自 SCSS 刻度层、不在令牌里重复写死数字。观感逐像素不变；
- 浮层定位收敛为 `floatingCore` 的 `createFloatingController`：`computePosition`
  调用、竞态守卫（结果落地前再核一次元素身份）与 `autoUpdate` 的挂接/摘除此前在 `useFloatingPosition` 与 `vTooltip`
  各写一份，现只有一处实现 —— `useFloatingPosition` 成为它的薄包装，`vTooltip` 手写的那份定位与跟随随之删除；
- 箭头样式写入收敛为 `applyFloatingArrowStyle`：两个命令式消费方（`vTooltip` 单例、`v-scrollbar`
  读数气泡）此前各写一份逐字相同的赋值循环，现共用；箭头取色改走 `--bubble-*`，与气泡表面同源，接缝处不再可能出现异色；
- 顺带清掉两处会误导的残留：`vTooltip` 箭头基础样式里过期的 `width/height: 8px`（实际每帧都被 `buildFloatingArrowStyle`
  的默认 12px 覆盖，只在首次显示前生效），以及 `vTooltip.scss` 里 `.v-tooltip-arrow`
  那条空规则（箭头样式全在内联，空规则让人误以为定义在此处，改记为指向单一来源的注释）。

### 修复 · 滚动气泡落点按气泡实测尺寸钳制在滚动容器范围内（2026-09-22）

- 气泡落点此前只钳制「沿轨道轴」，且两轴一律按固定上界（16px）算：横向滚动条上的长读数（如乐谱预览的页码「12 /
  120」）宽度远超该上界，滚到两端时会越出滚动容器、被父元素的 `overflow:hidden`
  裁掉；纵向滚动条上的宽读数同理会丢掉文字开头；
- 现两轴**各自**钳制在滚动容器（宿主盒子）的范围内，钳制量取气泡在该轴上的实测尺寸——读数阶段顺带量一次气泡的
  `offsetWidth/offsetHeight`，与其它读数同批，不额外触发回流；整边落在落点上的轴用整宽/整高，以落点居中的轴用一半；
- 纵向原先按固定 16px 上界留白，现同样按实测半高收敛；钳制边界两端各留 4px 视觉间隙，滚到顶/底时气泡既不越界被裁、也不贴死容器边缘。

### 修复 · 切回工作台偶现丢侧栏滚动位置（2026-09-22）

- 根因在工作台的 URL↔Store 同步：`onActivated` 那次同步晚于 pre 冲刷的路由 watcher 运行，而两者共用同一个模块级
  `currentPath`，于是激活这次必然读到
  `freshEntry === false`，被当成「页内 URL 编辑」走到「URL 无 group 地址即清空选中」的分支，把刚切回时仍有效的展开分组误清 ——而这条分支本意正是要挡掉的情形（导航清空 query 时以内存选中为权威）；
- 后果链：分组塌缩 → 折叠体高度过渡把侧栏可滚动量压小 → 浏览器与折叠补偿的逐帧钳位把宿主刚写入的 `scrollTop`
  钳到当时的偏小上限 → 镜像回灌随后又展开该分组、重启分块补挂（首批 12 张），高度迟迟不回来 → 位置就此丢失且无人回写；
- 现把 KeepAlive 重激活也算作「进入本页」（`syncRouteToStore(true)`），清空分支不再被激活路径放出；镜像回灌的判据改用「路由 path 变化」，避免重激活时重复发起一次同址 replace（该次回灌已由 pre 冲刷的 watcher 发起）。

### 优化 · 右键菜单接线收敛为 useTargetMenu、过滤菜单的选项态归一（2026-09-22）

- 新增
  `useTargetMenu`（`src/platform/ui/menu/useTargetMenu.ts`）：把「右键命中哪个目标 → 该目标的菜单项 → 在光标处打开」收成一处，集中三个此前在四个实例里各写一遍、且机制只存在于注释中的不变量 ——
  ① **无目标即空数组**（`BaseMenu.openMenuAt` 的 `!items?.length`
  据此拒绝打开，故「目标未命中」与「菜单不可用」天然同义，不需要额外的可用性开关）；② **打开前必须等一拍**（`items`
  是 prop，目标写进 ref 后要等响应式更新把它同步进 props，否则会被上一次或空的 items 拦下）；③
  **关闭后保留目标**（避免淡出途中菜单项被清空导致内容闪断，打开态另由 `isOpen`
  跟踪，供「菜单正针对我」的高亮判据使用）；
- 已接入四个右键单例：和弦分组头、组内和弦卡（`GroupSection`）、乐谱卡（`SongSection`）、预览页（`ScorePreviewPane`）。四处的「目标 ref +
  items computed + nextTick 打开 + 手写 `@close` 赋值」逐段替换为 composable 的 `target` / `items` / `openAt` /
  `close`，`@close` 一律改走 `close()`；
- 预览页顺带修正一处隐式耦合：`pageMenuItems` 的 `action`
  原先回头读「当前目标」，现在捕获**打开时**的页码，不再依赖「目标在菜单打开后不被改写」这一未成文前提；
- 三处「菜单正针对我」的高亮判据统一为「打开态 + 目标相符」。预览页原先只比对目标，靠关闭时把目标重置为 `-1`
  才使描边消失 —— 而主动关闭（预览滚动时收起菜单）走的是 `BaseMenu.closeMenu`，不经该重置路径；
- 侧栏过滤菜单的「全部乐谱」去掉 `checked`：它与 `disabled`
  的条件完全相同（都是无过滤时），即同一判据同时驱动「选中」与「不可点」两个语义，而「当前无过滤」已由「按歌手 / 按拍号」两个子菜单各自的「全部」子项勾选态表达。该项是**动作**（同时清两维，没有单一
  `model` 值可绑）而非选项，故状态只用 `disabled` 表达。至此选项态在项目里只剩 `model` + `onPick` 一条路。

### 更新 · 菜单支持「单选组」：勾选与点击由菜单层派生（2026-09-22）

- `MenuItem` 新增 `value`（本项代表的值），`BaseMenu` / `MenuItems` 新增 `model`（本层当前值）与 `pick` 事件：给出
  `model` 后，带 `value` 的项勾选态一律由 `item.value === model` 现算、点击时抛
  `pick`，调用方只描述「有哪些项」，不必逐项写 `checked` /
  `action`。单选组因此可以直接写成字面量数组，读代码即读菜单，而不必「选项表 + map 派生成 MenuItem」绕一跳；
- 级联子菜单那一层同样可声明单选组：`MenuItem` 另带 `model` / `onPick`（作用于自己的 `children`），由 `MenuSubmenu`
  透传给内层 —— 子层的选中值就地回调，不上抛到调用方；
- 归一化只覆盖带 `value` 的项：同层的普通项（显式 `checked`、或压根不勾选）原样保留，单选项与普通项可同层混排；
- 不传 `model` 即完全退回原语义，既有调用方逐字不变；
- 已接入：顶栏主题菜单与「同步目标」子菜单、侧栏排序菜单（一份数据两用 —— 既是菜单项、也是排序按钮图标的来源，取代此前菜单项内联 icon 与另一张
  `SORT_ICON_MAP`
  各存一份的重复映射）、侧栏「按歌手 / 按拍号」两个过滤子菜单（子项构造从此只剩 label/value，不必再把当前值与回写回调传进去）。

### 更新 · 工作台面板卡片补轻微阴影（2026-09-22）

- 右侧面板列的四张卡片（指板设置 / 多指法 / 和弦分析 / 导出图片）此前只有描边与底色，与左侧带 `shadow-panel`
  的指板卡片并排显得扁平；现统一补 `shadow-md`（三档主题各有对应取值），只加一点层次，描边与底色不变；
- 面板列表补 `px-xs` / `pb-lg`：滚动宿主只注入 `overflow-y: auto`，而 CSS 规范下另一轴的 `visible` 会 **计算为 `auto`**
  —— 横向同样裁剪，而卡片 `w-full` 与宿主同宽，阴影左右必被切掉；横向取 Tailwind 的 6px（`--spacing-xs`；注意 SCSS
  `$space-xs` 是同名不同值的 4px），已覆盖 `shadow-md`
  那 12px 模糊的可见段（基底 alpha 仅 0.06，6px 外已衰减到不可见）。纵向只在底部留
  `pb-lg`（16px）：末卡阴影往下走 offset-y
  4px + 模糊 12px，不留就是被 overflow 硬切一刀，而滚到底时底部遮罩已取消、切口是裸的；
- 这 16px 由卡片列的宿主**下沿同步下沉**消化（`inset-y-2xl` →
  `top-2xl bottom-lg`），而不是记在滚动范围上 —— 滚动容器把后代绘制裁到自己的 padding
  box，宿主一旦能滚动，裁剪边界就恒等于可见边界，所以「末卡阴影可见」与「宿主内部多出 16px」本是同一件事。内容 +16px 与宿主 +16px 相抵，滚动范围与末卡停位才逐字不变；代价是羽化边界与自定义滚动条的轨道随之低 16px（轨道从宿主两端对称内缩
  `endInset` 铺出，宿主要高它就得跟着长）。顶部刻意不留（列顶与指板顶同高），且首卡向上的阴影本就很淡。

### 更新 · v-tooltip 的触发宿主可委托上级节点（2026-09-22）

- 新增 `trigger` 选项（`'self'` 默认 / CSS 选择器），与 `v-marquee`
  同构。tooltip 常挂在图标或截断文字本体上，命中面只有那一小块；委托后鼠标停在整行 / 整卡任意位置即显示。**定位锚点仍是元素自身**
  —— 提示描述的是它，内容与箭头都该贴着它，被放大的只有触发范围；找不到匹配祖先时回退自身，不会静默失去触发；
- 一处实现细节：委托宿主是**容器**，焦点通常落在其后代上，而 `focus` / `blur`
  **不冒泡**、容器上永远收不到 —— 故委托时改用冒泡版 `focusin` / `focusout`；`'self'`
  场景沿用原事件，行为与接入前逐字一致（不因换成冒泡版而把「后代聚焦」也纳入触发）。初始的 `:hover`
  检查同样改判宿主，否则「鼠标已停在行上时组件才挂载」会漏掉首次显示；
- 当前**没有任何业务位点接入**：委托会让同一容器内的多个 tooltip 同时弹出，只在该容器内 tooltip 唯一时才可用，需逐个判断后按需接入。

### 更新 · 抓手的消失也走过渡、跑马灯可委托上级节点触发（2026-09-22）

- **抓手显隐改由 opacity 驱动，不再用 `v-if`**：`v-if`
  是瞬间增删节点，展开分组（或切换排序方式）时抓手会当场消失、没有任何淡出，而 hover 淡入是平滑的 —— 同一处线索两个方向观感对不上。改用条件 class 后，消失与出现走同一条过渡；代价是图标恒占位，正好让计数徽标 / 歌手徽标在开合分组、切换排序方式之间不再左右挪。不可拖时补
  `pointer-events-none`：图标虽不可见仍会吃掉命中测试、把光标变成 `grab`，等于承诺一个不存在的拖拽；
- **跑马灯新增 `trigger` 选项**（`src/platform/directives/vMarquee.ts`）：此前 `mouseenter` / `focusin`
  一律绑在指令元素自身，于是「悬停才开始滚动」的判定范围就是那一条文字 —— 列表项里文字只占一行的一小截，鼠标停在同行空白处不会触发。现
  `trigger` 接受 `'self'`（默认）或 CSS 选择器，后者改用自元素向上 `closest()`
  命中的最近祖先作为宿主；找不到匹配祖先时回退自身，不会静默失去触发。宿主变更（含 DOM 结构变化）在 `updated`
  里检测并重挂监听；
- 已接入的场景（悬停整行 / 整卡任意位置即开始滚动）：侧栏乐谱卡（`trigger: '.song-card-item'`）、分组头（`trigger: '.group-title-row'`）、和弦卡（`trigger: '.chord-thumb-card'`）、侧栏搜索下拉的和弦名与分组名、以及分组选择行的两处弹窗（`trigger: 'button'`
  —— 行外壳分别是 BaseDropdownItem 与原生按钮）。`BaseSelector`
  的触发器标签与下拉选项未动（文字基本占满可用宽度，委托收益有限）；`GlobalNotification` 走 `always`
  模式、不依赖 hover。

### 修复 · 拖拽抓手的 hover 位移从未真正过渡（2026-09-22）

- 三处抓手图标（乐谱卡、分组头、工作台面板头）此前都写 `translate-x-1 → translate-x-0` 做「从右滑入」，但 Tailwind v4 的
  `translate-x-*` 落到的是 `translate` 独立属性，而过渡写的是 `transition-[opacity,transform]`（只含
  `transform`）—— 位移从头到尾**没有过渡过**，hover 时是瞬间跳 4px：淡入是平滑的、位置却突跳，观感就像掉帧；
- 现**直接去掉位移**，只保留 `opacity`
  过渡。零视觉损失：非 hover 态本就不可见，且 hover 后的落位与非 hover 态完全一致，去掉的只是一个从未生效的跳变；而过渡属性从两个收窄为一个合成属性，是这类「悬停淡入」线索最省的写法。

### 更新 · 左侧栏的可拖拽行补上抓手线索（2026-09-22）

- 左侧栏两处列表都能拖拽排序（乐谱列表整卡即把手；分组列表以分组头为把手），但此前**没有任何视觉线索**：分组头只在 tooltip 里用文字提过一句，乐谱列表连提示都没有，用户无从得知能拖。现按工作台面板列表既有的写法补上 —— 悬停行时在行尾淡入
  `grip-vertical` 抓手图标，图标占位始终保留、不产生布局跳动（过渡写法见上方同日修复条目）；
- 线索跟随**可拖条件**显隐，而不是仅跟随悬停：乐谱列表只在「手动排序且无筛选」时可拖，分组列表只在「全部分组收起」时可拖，其余状态下拖动是静默失效的 —— 挂一个拖不动的把手比不挂更糟。乐谱列表的判定抽成 SongSection 的具名 computed
  `isDragEnabled` 并下发给卡片组件，与 `useSortableList` 的 `enabled` 同源，避免两处条件分叉；
- 不能拖时的说明仍由分组头 tooltip 承担（既有行为，本次未改）。注：触屏没有 hover 状态，此线索对触屏无效，触屏仍依赖长按拖拽。

### 修复 · 关闭和弦面板后字符槽的虚线高亮不即时消失（2026-09-22）

- 排列区每个歌词行都带
  `v-memo`（只让内容真正变化的行重渲染，避免长谱面全表刷新），但依赖数组里漏了「面板目标槽位」这一项。于是面板关闭时状态其实已经归零，`is-picker-target`
  的虚线框却不消失 —— 要等鼠标移出该行（`hoveredLineKey` 在依赖里）触发一次重渲染才跟着没。现补上该项；
- 补的方式是**按行归约**而非把整个槽位键塞进依赖：新增
  `linePickerTargetKey(lineId)`（目标属于本行时给出槽位键，否则为空），与既有的拖拽落点归约 `lineDropTargetKey`
  同构 —— 只有目标所在行的依赖值会变，其余行继续命中 memo，开面板 / 切目标都不会退化成全表重渲染；
- 归约值必须带上**槽位键本身**、不能只给行号：面板开着时在同一行内把目标从一个字符切到另一个字符，只比行号会让本行 memo 继续命中，高亮不跟着挪窝。

### 修复 · 聚焦环对已隐藏的滚动条 / 骑缝装饰仍挖孔（2026-09-22）

- 环的两处「擦除」—— 挖孔（让骑缝装饰从环上透出）与按遮挡物矩形清零 —— 此前都只判几何：「还在 DOM + 盒子尺寸非零 + 相交」，没判元素**当前是否可见**。而本仓的「不可见」普遍不是
  `display:none` 表达的，盒子仍在文档流里、`getBoundingClientRect` 照旧返回非零矩形，于是环上会平白缺一块；
- 两个现场：遮挡物侧是自绘滚动条 —— 它用 `opacity:0; visibility:hidden` 隐藏（overlay 挂在宿主**兄弟**位置，不能用
  `display:none`，那样连 hover 都收不到），几何还停在最后一次几何刷新写入的位置，于是容器根本没有可滚内容、或滚动条已自动淡出之后，环仍会在滚动条的位置被挖掉一块；挖孔侧是骑缝装饰（如和弦卡片右上角的变体徽标）—— 被 CSS 隐藏却仍留在 DOM 里时，挖出的孔对不上任何东西；
- 现两条路径共用一道可见性判定（`visibility === 'visible'` 且 `opacity` 高于
  `ALPHA_EPSILON`）。两个属性都要判：本仓存在「只把 opacity 归零、visibility 保留好继续收 hover」的隐藏方式（滚动条轨道即如此），只判 visibility 会漏；
- 阈值取 `ALPHA_EPSILON`
  而不是「小于 1 即不可见」：滚动条有 250ms 淡出过渡，这期间它是半透明**可见**的，环压在正在淡出的滚动条上同样是穿帮，照擦才对，等它淡到看不出时才停手；
- 遮挡物侧的判定落在**收集侧**而非擦除侧：收集本就逐帧重来，两处判据同帧生效，不存在「收的时候可见、擦的时候已淡出」的窗口，顺带把不可见的挡在列表之外、省掉每帧一次多余的矩形读取与相交判定；挖孔侧判在尺寸之后 ——
  `display:none` 的装饰盒子为零、在那一步就被挡掉，不必为它多读一次样式。

### 修复 · 聚焦环画在浮动按钮 / 浮动胶囊之上（2026-09-22）

- 外扩聚焦环挂在 body 顶层，层号取「目标所在浮层层号 + 1」（页面内容则退到浮层基准层 9999 之下），而 `BaseFab` /
  `BaseFloatingPill` 是**内容层**的覆盖元件（默认 `z-fab`
  40），层号越不过环 —— 于是环会直接画在它们身上：键盘 Tab 到靠边的卡片时，环从压在内容上的滚动按钮上面穿过去。现给两者标上
  `data-ring-occluder`，环按「显式声明的遮挡物」把它们的矩形从环上擦掉（与自绘滚动条的拇指 / 滚动气泡同一套动作，见
  `focusRingOverlay` 的「遮挡物策略」）；
- 声明在容器上不影响它们自己（或胶囊内按钮）聚焦：环的遮挡物收集只扫目标的**同层兄弟**，目标自身子树与它所在的那条祖先链天然排除在扫描之外，故不会出现「环被自己所属的容器擦掉」。

### 更新 · 和弦选择面板的分区标题吸顶（2026-09-22）

- 面板按根音类别分区（最多 12 段）、全库 775 张卡片，此前滚到列表中段就看不出当前落在哪个根音分区，底部的分区定位条只能事后跳。现每段标题行**吸在滚动区可视上沿**：宿主环境相关的能力（发现滚动容器、一次滚动/尺寸监听、判定哪些头被顶在吸附线上、按吸附头实测高度让开容器顶部羽化带）与侧栏和弦库分组、设置弹层、开发者面板同源，统一交给
  `useStickyHeads`，本面板只提供类名钩子与 id 钩子 —— id 用 `data-head-section-id`，刻意不复用分区定位与滚动高亮的
  `data-section-id`，否则那两处选择器会多匹配一批元素；
- 标题行补不透明底色（`bg-surface-panel`），卡片从标题底下滚过时被正常遮住；吸附中不被顶部羽化冲淡由 `fadeOffset` 负责。

### 优化 · 和弦选择面板的滚动帧与搜索路径（2026-09-22）

- **滚动帧不再做 DOM 查询**：分区壳常驻，元素集合只在「分区增删 / 列表被重建」时变，却原本每滚动帧各查一遍（窗口计算查
  `.picker-cards-grid`、高亮计算查
  `[data-section-id]`，两次都要遍历含已挂载卡片的整棵子树）。现查一次即缓存、计数守卫兜底重查；`useRowWindowing`
  为此新增可选的 `getGridEls` 提供者，不传时行为与改造前逐字一致；
- **卡片 aria-label 的和弦名改为按需解析**：此前每次键入都要为**全库**每个和弦拼一次名称（构建整屏 `id → 名称`
  映射），而唯一消费方只是当前挂载的那十几张卡片；改为引用级缓存后，开销随真正渲染出的卡片数增长，而非库容量；
- **两处关闭态残留**：关闭面板时补 `cancelActiveSectionUpdate()`（原本关闭后仍会跑一次合帧回调，读的是 `display:none`
  下的零矩形）；打开分支在 `await nextTick()` 后复检可见性，避免快速「开 → 关」把 scroll 监听补挂到已关闭的面板上。

### 更新 · 顶部 Toast / 通知的离场位移收短（2026-09-22）

- 顶部浮层（瞬时 Toast 与常驻通知共用同一过渡）的离场此前是
  `translateY(-120%)`——整卡向上飞出视口。在顶部堆叠里这条位移明显过冲：矮的 Toast 胶囊要飞自身 1.2 倍高，高的通知卡（标题 + 描述 + 操作按钮）更是上百像素，观感拖沓。现收到
  `translateY(-16px)`，与入场位移同值 —— 入场自 -16px 落下、出场回 -16px 淡出，一来一回走同一条轨迹，「向上飘走」的方向感由方向本身给出，不再靠距离堆；
- 只改 `v-transition-fly-up-leave-to` 的位移：入场（`enter-from` 的 -16px +
  `scale(0.96)`）、时长（`--duration-fast`）与透明度过渡均不变。该过渡类当前唯一消费方是
  `GlobalNotification`，覆盖右上 / 左上 / 顶部居中三档方位；底部方位走 `v-transition-slide-up`，不受影响。

### 更新 · 搜索结果标出「当前编辑中」的和弦（2026-09-22）

- 和弦搜索的结果行此前只标**键盘/悬停的活跃项**，选过一次后再搜同一关键词，看不出哪一项是当前正在编辑的那个。现
  `BaseInput` 新增 `searchItemSelected` 判定，命中即**常驻高亮**并经 `#search-item` 的 `selected`
  下发给插槽。它与活跃项刻意相互独立：活跃项在鼠标移出面板时会重置为 `-1`，而「当前选中」是宿主的常驻状态；
- 侧栏和弦搜索传入
  `isCardActive`（主和弦或任一变体命中编辑器草稿），并在结果行行尾补一枚对勾 ——与右键菜单里「当前编辑中」用的是同一判定，两处口径一致。

### 修复 · 乐谱左栏数量徽标报全量，与筛选后的列表不一致（2026-09-22）

- 左栏标题旁的「乐谱数量」徽标读的是 `songs.length`（全量），而列表渲染的是 `filteredSongs`
  —— 筛选生效后列表只剩几条、徽标却纹丝不动。现改读
  `filteredSongs.length`，与列表同源、筛选即同步；徽标 tooltip 在筛选生效时同步改为「当前筛选结果数量」，与「没有符合筛选条件的乐谱」空态口径一致。

### 更新 · 折叠头底色内聚到组件（2026-09-22）

- **`BaseCollapse` 的头部自带底色**（`bg-surface-panel`；悬停仍是 `bg-surface-panel-hover`），展开态叠主题 tint
  —— 组件自己就知道
  `expanded`，不必每个消费方各判一次。此前这两项都要业务经 class 下发：5 个消费方各写一遍，吸附态还得按「是否被顶在吸附线上」条件切换，展开态 tint 还必须带
  `!` 才能压过 hover 基底（同工具类里 hover 变体在样式表靠后）；
- **清理各消费方手写颜色**：`DevPanel` 8 处常驻 `bg-surface-panel`、设置弹层 5 处展开态
  `bg-tint-panelhover-50!`、`GroupSection` 的展开态与吸附态两项、工作台面板的吸附态一项，全部移除。`GroupSection`
  只保留「本组右键菜单开着」的 tint —— 它属消费方状态，折叠组件无从得知；- 吸附（`sticky` / `top` /
  `z`）等**布局**属性仍由业务下发，`BaseCollapse` 不假设宿主布局 —— 这条契约只收窄到「底色」一项。

### 更新 · 设置弹层的折叠头支持吸附（2026-09-22）

- **设置弹层五个分组的标题行，滚动时都会吸在容器可视上沿**：与侧栏和弦库分组、开发者面板同源 —— 宿主环境相关的能力（发现滚动容器、**一次**滚动/尺寸监听、批量判定哪些头被顶在吸附线上、按吸附头实测高度让开容器顶部羽化带）统一交给
  `useStickyHeads`；定位几何（`sticky` / `top` / `z` / 底色）仍由各宿主经 class 与 style 下发，折叠组件不假设宿主布局；
- **吸附线取容器 padding 的负值**（`useStickyHeads` 新增回传 `insetTop`）：sticky 以滚动容器的内容盒为原点，容器自带
  `padding-top` 时头用 `top:0`
  会停在 padding 之下、滚过的内容从头顶那条带里漏出来。该派生原先在两个消费方里逐字重复（连注释都重复），现收进 composable，三个消费方共用；
- **设置弹层的可见区留白拆成两处承担**：**纵向** `py-md` 与尺寸（`max-h-80` / `w-[360px]`）放在**不滚动**的祖先上，
  **横向** `px-md`
  留在滚动宿主自己身上 —— 纵向 padding 落在滚动容器里属于可滚动区（顶部那条随内容滚走、底部那条只在滚到底时才出现），横向没有滚动、天然恒定；若横向也提到外层，滚动宿主右缘会内缩，而滚动条的横向位置是从**宿主右缘**算的（`edgeOffset`，默认 4），滚动条会被一起推进去、不再贴面板边。尺寸本就含留白，故外部几何逐像素不变。该层的
  `relative` 是必需的：滚动条 overlay 挂在滚动宿主的**父元素**上，其几何沿 `offsetParent` 链累加、必须终止于该父元素。

### 修复 · 「忽略空格」设置未进备份，跨设备恢复静默丢失（2026-09-22）

- 显示组的「忽略空格」（`scoreIgnoreEmptySpace`）此前**四处只对齐了零处**：`AppPreferencesBackup`
  类型、`buildBackupPayload` 导出、`PREFERENCE_BOOLEAN_FIELDS` 白名单、`applyPreferencesBackup`
  恢复读全部缺失 —— 导出包不带该字段、外来包也会被 zod 白名单 strip 掉，于是该偏好跨设备恢复必然静默丢失，与 P2 审计 #15 同一类（那次修的是
  `scoreShowBarre` / `scoreShowFooter` / `scoreLyricsFontWeight` 三项）。现四处补齐并逐字对齐。

### 新增 · 指板图可忽略首末的空品格（2026-09-22）

- **新增显示设置「忽略空品格」**（排列和弦 / 预览两个 tab 的显示组，缺省关闭）：开启后指板位图按**实际用到的品位**收紧品窗，首末无按弦的空品格不再占位，指板更紧凑；列数下限取
  `MIN_FRET_COUNT`（3 列），避免单列指板显得残缺。关闭时仍画满 `fretCount`
  列的全指板，与既有视觉零差异 —— 该能力**必须由消费方显式传入才生效**，不会自动收紧；
- **实现落在共享渲染器**：`resolveFretWindow` 给出「实际列数 + 首列右移量」，布局、绘制、位图键三处共用同一份。由于
  `chord.strings[].fret`
  是**窗口内相对品位**，收紧时列数与窗口起点必须同步右移，否则圆点与横按梁会落到错误的品上；品号层按「原窗口起点 + 右移量」标注绝对品位，故收紧到不再从第 1 品开始时会自动改画品号而非弦枕；
- **位图键里放的是收紧结果而不是开关本身**：几何本就无空列可裁的指法（首末都无空品格）在切换开关时键不变、不重渲 —— 即「阻止本身没有空品格的指法重渲染」；
- **排列和弦与 A4 预览 / 导出两侧都已接入**：预览 / 导出的指板是 Worker 内另一套矢量绘制（`scoreExportFretboard.ts` 的
  `drawFretboardVector`），故把收紧口径从 `Chord` 形态里解耦为
  `resolveFretWindowFromUsed(storedFretCount, usedFrets, trim)`，主线程与 Worker 共用同一份规则（Worker 侧由紧凑元组形态抽出占用列号后调用），避免两处规则分叉；两侧的位图 / 栅格键同样记「收紧结果」而非开关本身；
- **切换即时生效**：`FretboardCanvas` 的重绘 watcher 补上了本开关 —— 缺它时位图键已变但无人触发
  `draw()`，表现为「刷新后才生效」；预览侧的 `scoreRenderCacheKey` 也纳入本项，故切开关会重渲染 A4 页；
- **收紧会同时改变排版**：品窗列数决定**行内容高**（`computeLineContentHeight`）与**指板绘制的 Y**，三处必须取同一个品窗 —— 否则出现「位图变矮但垂直位置不动」（行高与 Y 按原列数算、绘制按收紧列数画，位图底边被钉在原地、与歌词之间留缝）。导出侧因此把收紧档位做成与
  `LAYOUT` 同生命周期的**模块级渲染状态**（渲染消息入口设定一次，与 `applyLayoutScales`
  同一时机），装箱链与绘制读同一份，而不是逐层透传（那要动整条装箱链的 5 处调用点）；
- 设置已纳入备份导出与偏好白名单（`PREFERENCE_BOOLEAN_FIELDS`），避免 P2 审计 #15 那类「跨设备恢复静默丢失」。

### 修复 · 排列和弦拖到占用槽位改为交换（2026-09-22）

- **拖到已有和弦的槽位改为交换，源槽位不再被清空**：此前只有「同行同类边和弦」走交换 / 重排分支，其余落点一律走「目标覆盖 + 源清空」，于是把和弦拖到别的占用槽会把源槽位清掉。现槽位间拖拽统一走
  `swapOrMoveSlotChords`，由它按落点分派：占用 → 两处互换（**源不落空**）、空槽 → 移动（源清空）、同行同类边和弦 → 列表内插入式重排（保持边和弦列表不被缩短）。

### 修复 · 下拉/搜索面板的输入法抢键与面板高度失效（2026-09-22）

- **输入法合成期不再抢键**：和弦下拉的过滤框此前对 ↓/Enter 无条件 `preventDefault`
  —— 中文输入法下 ↓ 翻候选词会被整段吞掉，Enter 确认候选词时还会顺带选中首个选项。现与搜索面板同口径，合成期一律放行；
- **搜索结果面板的「自定义封顶」恢复生效**：`searchMaxHeightClass` 与自动估算的内联 `maxHeight`
  同时下发时，内联样式优先级更高，传入的类被压成空转。现传入该类即整体交回类控制；
- **搜索结果行补上 listbox 属主**：结果行声明 `role="option"` 却无 `listbox` 祖先，属无效 ARIA；同时选中态恢复恒输出
  `aria-selected`（缺该属性在 listbox 里的语义是「不可选中」，与「未选中」不同）。现仅在渲染托管结果行时由容器下发
  `role="listbox"`；
- **下拉项字号跟随尺寸档位**：此前下拉项字号被写死 `text-xs`，`size` 只影响行高，与触发器（sm 档用
  `text-2xs`）口径分叉。现两者共用同一份字号档位表，sm 档下拉项字号随之变为 `text-2xs`（md/lg 不变）；
- **搜索结果面板封顶高度不再多算内边距**：封顶按「行数 × 行高 + 行距 + 内边距」估算，但内边距沿用了下拉面板的
  `p-xs`（0.75rem），而结果面板内层是
  `p-1`（0.5rem）——多算 0.25rem，结果数超过可见行数时下一行会露出 4px。现内边距改为调用方显式给出（不留默认值，避免任一处静默多算）。

### 修复 · 外扩聚焦环遮住自绘滚动条（2026-09-22）

- **聚焦环不再糊掉滚动条拇指与滚动气泡**：外扩聚焦环挂在 body 顶层、层号高于内容层，而自绘滚动条的拇指 / 气泡是内容层的覆盖元素（z-index
  29-31），环压上去就把它们盖住了。现给这两类覆盖元素打
  `data-ring-occluder`，由环侧从环上擦除（与 sticky 遮挡物共用同一套 destination-out 动作）。轨道**不标**——它是贴边整条的长条，擦了会把环的整条边吃掉，比「被环压住」更刺眼。

### 修复 · 乐谱预览的横向滚动、滚动条与缩放胶囊一并消失（2026-09-22）

- **现象**：切到「预览」页后三样东西同时不见 —— 页流横向滚不动、自绘滚动条不出现、右下角缩放胶囊（`BaseFloatingPill`）也看不到，像是被一起删掉了；
- **根因**：`score-main-content` 改为单行网格后四个面板成了**网格项**，而网格项的 `min-width: auto` / `min-height: auto`
  在**两个轴**上都是「内容最小尺寸」语义（flex 项只在主轴如此）。预览页的页流是 `w-max`（12 页 ≈ 9500px），于是隐式
  `auto` 轨道被顶到内容宽度 → 面板与滚动宿主同宽、`clientWidth === scrollWidth`
  → 被判定为「无横向溢出」：滚不动、不出滚动条；胶囊又以面板根为绝对定位锚点，一并被推到视口右侧之外。此前 `flex-col`
  布局下横向属交叉轴、`min-width: auto` 退化为 0，故各面板只需纵向的 `min-h-0`，横向从未暴露；
- **修法**：`stack-slot` 补 `min-width: 0` /
  `min-height: 0`，把「槽位不得撑破所在网格单元」收进槽位类本身，四个面板共用一处，而非在每个面板根上各写一遍（`ScoreInteractiveArea`
  此前自己写了 `min-w-0`，故是唯一未受影响的页）。补 `grid-cols-1` **不能**替代 —— 它只钉住轨道，网格项自身的
  `min-width` 仍是内容最小尺寸，项照旧溢出轨道；
- 原「布局经脚本逐帧校验（5/5 通过）：容器盒子零变化」的结论**只对容器成立**：容器盒子确实没变（它有 `min-w-0` +
  `overflow-hidden`），变的是网格项的宽度。后续同类校验的口径应补上「面板 `clientWidth` 与容器一致」与「宿主
  `scrollWidth > clientWidth`」两条。

### 更新 · 工作台与排列和弦的可用性补强（2026-09-22）

- **指板设置面板区分两类设置的作用域**：品数 / 品位偏移 / 调音三项绑定和弦草稿（随草稿走、切和弦即换），而自动横按 / 符号简写是全局偏好（改一次影响所有和弦）——此前五行同构、外观无差，用户无从判断「改了这一项会不会影响别的和弦」。现拆成「当前和弦」「全局偏好」两组，各带一条分区栏（短标签 + 尾部横线），组间另有一条通栏分隔线；
- **工作台面板的拖拽把手有了视觉线索**：面板排序的拖拽把手就是折叠头本身（`handle: '.panel-title-row'`），但折叠头外观与普通折叠头毫无差别，用户无从得知标题栏可以拖。现悬停整张面板卡片时在标题后淡入抓手图标（`opacity` + 右移 4px 双通道过渡，进出场都可见）。触屏没有 hover，该线索对触屏无效；
- **多指法面板的折叠头显示候选总数**：该面板是横向滚动列表，边缘渐隐提示很弱——变体数只比可视区宽一点点时几乎看不出来，用户会以为「就这么多」而漏看后面的变体。现标题小字显示为「候选把位 · 共 N 个」，与列表渲染共用同一份判定，避免标题数与卡片数漂移；
- **排列和弦：点击和弦卡片即可填入槽位**：此前点击卡片在该视图下完全没有反应（只注入了拖拽起手，从未接
  `select`），新用户面对「点开一个面板、然后要去拖东西」的两步操作无从下手。现「点槽位 → 点卡片」直接落位并收起面板，拖拽仍是「移动到别的槽位」的主路径；
- **排列和弦：触摸端的添加槽可发现了**：行首 / 行尾的「+」默认
  `opacity-0`、只在悬停或聚焦时显现，而触屏没有悬停——用户只能靠「点一下试试看」才发现那里可以加和弦。现在无悬停能力的设备上常驻半透明可见；
- **排列和弦：删除钮的触控目标变大**：删除钮视觉边长保持 24px（放大到控件标尺会盖住指板图），但 24px 远小于触屏建议的最小可点尺寸。现用伪元素把命中面外扩 6px（24
  →
  36px），视觉尺寸不变。只扩 6px 而不补到 44px，是因为槽位是密集网格，热区向右扩会吃掉相邻槽的指针事件，把「点不中」换成「点错」。

### 重构 · 三处全局行为收敛为单一注册点（2026-09-21）

- **级联子菜单的「祖先滚动即收起」**：此前由每个菜单实例各挂一条常驻 window 捕获滚动监听——每个和弦卡片都带一个菜单，监听数随卡片数线性增长，而绝大多数实例当时并没有展开的子面板，handler 首行就空转返回。现收敛为
  `platform/ui/menu/submenuScrollGuard`
  的全局唯一监听 + 「当前已展开子面板」登记表：只在展开期间登记、收起即注销，登记表清空后连监听本身也一并摘除，没有子面板展开时页面上不存在任何空转监听；
- **浮层面板的 Esc 关闭**：此前每个可见面板各挂一条 window
  keydown，多条同时可见时「谁响应 Esc」取决于监听注册顺序、而非视觉层叠顺序。现由
  `platform/ui/floating-panel/escapeDispatcher`
  统一裁决：在「包含当前焦点」的登记面板中取**内联层号最高**者响应（层号即与 Popover
  / 抽屉共享的浮层池号），与视觉层叠一致；嵌套场景下只关最上层（此前外层面板因 `contains(focus)`
  同样成立会被一并关掉）。「非模态面板不抢占宿主页面 Esc」的语义不变；
- **退出落盘兜底**：`storage/idbKv`、`chord/store/chordStore`、`score/library/store/songStore` 此前各自挂一对 pagehide +
  visibilitychange，同一个全局关注点被三处分散注册（其中 idbKv 还是 import 副作用）。现收敛为
  `platform/services/lifecycle/exitFlush` 的唯一一对监听 + 回调登记表，装配层显式
  `setupExitFlush()`；单个回调抛错只记日志、不再阻断其余回调。

### 更新 · 页面与面板切换过渡改为并行（2026-09-21）

- **路由切换不再串行等待**：`RouterView` 的过渡此前是 `<Transition mode="out-in">`
  —— 必须等旧页 leave 动画整段跑完才开始挂载新页，切换耗时 = 旧页淡出 + 新页淡入两段相加。现改为默认（并行）模式，两段同时进行，耗时收敛为两者取较长者。之所以能直接重叠，是因为被路由的组件根元素本身已铺满定位（`WorkbenchView`
  是 `absolute inset-0`、`ScoreView` 是 `relative size-full`），无需额外叠层容器；`out-in` 的串行在这里纯属白等；
- **乐谱编辑区四个面板同样并行**：`score-main-content` 由 `flex-col` 改为「单行网格」
  `grid grid-rows-1`，四个面板（空态 / 歌词编辑 / 排列和弦 / 预览）各自无条件挂
  `stack-slot`（`grid-area: 1 / 1`），过渡期间两个面板叠在同一格，而非两个 `flex-1`
  各占半高把内容压扁并上下跳动。空闲态只有一个子元素，落在 1/1 格按网格默认 `stretch` 铺满整行，与原 `flex-1` 等效；
- **叠层类必须挂在子元素自身，不能写成 `enter-active-class` /
  `leave-active-class`**：enter 与 leave 的类生命周期不保证同时结束（`transitionend`
  到达时刻不同），先摘掉类的那一个会立刻掉到下一行 —— 实测就是在过渡尾部抖一下；
- 布局经脚本逐帧校验（5/5 通过）：容器盒子零变化、过渡期两面板重叠、稳定后单面板铺满。

### 修复 · 播放起振丢失与文本谱横按指法往返失真（2026-09-21）

- **序进播放迟到不再丢起振**：lookahead 排程器把步按绝对音频时间戳排入引擎，但 tick 迟到（主线程卡顿 / 后台节流）时该时间戳可能已早于当下，而引擎包络是按绝对时刻排程的（`setValueAtTime`
  / `linearRampToValueAtTime`），过去时刻会被立刻求值完 ——
  attack 段整段丢失，听感从拨弦起振变成硬起音爆点。现将起播时刻钳到当下；节拍真相源仍是原时间戳（不被钳位改写），故迟到不累积漂移；
- **排程 tick 抛错不再永久卡住「播放中」**：tick 体内任何抛出（引擎内部异常、序列数据异常）都会让「下一轮 tick 的
  `setTimeout`」执行不到，而 `isScorePlaying` 已停在 true、定时器句柄已置 null ——
  UI 永久卡在播放中、高亮不再推进且无法再取消。现统一兜底：记日志并走 `stopScorePlayback` 落定全部状态与定时器；
- **启动失败不再逃逸成未处理拒绝**：`startScorePlayback` 中 `ensureAudioReady()` 是唯一没有 `try`
  包住的调用点，音频引擎因自动播放策略拒绝 `resume()` 时会返回 rejected promise，而调用方（顶栏）不接 ——现显式兜底；
- **文本谱横按指法往返不再改变和弦身份**：横按条目编码在指法缺失时此前兜底写成 1，而解析端对非 [1,4] 的指法本就省略
  `finger`，于是「无指序」在文本往返一次后变成「指序 1」。`finger` 参与横按签名（`computeBarresSignature`
  withFinger），该签名又是 `areBarresEqual` 与 `chordRepository`
  重复判定的口径（标指不同即不同和弦），故往返一次就可能被去重静默丢一条。现改为写空字段，原样还原无指序。

### 更新 · 左栏分组展开的分块挂载批量收敛（2026-09-21）

- **分组展开不再整批掉帧**：左栏分组内容的分块补挂批量原为 36 张/帧（3 列 ×
  12 行），但打点实测单张卡片热态约 1.25ms、冷态约 3.3ms（每卡常驻 `ChordCard` + `BaseMenu` + `BasePopover`
  三个组件），一帧 16.7ms 只容得下约 5~~13 张——首批 36 张实测构成单个 111~~120ms 主线程长任务 +
  116~~124ms 掉帧帧，分块机制实际没起到摊平作用。批量收敛到 12 张/帧（3 列 ×
  4 行）后：**切换分组与重复展开的掉帧完全消失**（原 42~~48ms/帧），冷展开长任务 111/120ms → 80/88ms、最差帧 116/124ms →
  85/92ms；填充由 2 帧变 4 帧（补挂发生在高度过渡未揭示到的行，视觉无感），卡片挂载总数与收起行为不变。
- 残余的冷展开 ~80ms 经成本模型反推为「约 65ms 一次性暖机固定成本 +
  1.3ms/张」，与批量无关，属首次执行的 JIT 与组件链初始化（dev 构建读数）。

### 更新 · 乐谱首屏渲染窗口自适应与导航路径去重（2026-09-21）

- **首屏不再一次性挂载 30 行**：渐进式视口渲染的初始行数由固定 30 行改为「同步挂载最小行数 → 按实测行高补齐到填满视口 → 其余交给滚动哨兵按需扩容」，扩容批大小同步收窄。实测冷切「排列和弦」首屏挂载节点由 422 字符槽 /
  54 指板画布降至 103 / 16，主线程长任务 349ms → 140ms、最差单帧 335ms → 154ms、手势总耗时 623ms →
  450ms；滚动全程无露白，仍可按需渲染至全部行；
- **顶栏「乐谱」与和弦引用弹窗直接落到带参完整 URL**：此前推裸路径 `/score`
  会立刻触发镜像回写补参数而产生一次多余导航，「已在乐谱页时再点乐谱」更会先把 URL 打回裸路径（丢掉
  `id`/`tab`）再由镜像恢复。现由导航入口直接写入完整 URL，URL 形状规则与镜像共用同一份实现。实测进乐谱页 `afterEach`
  由 2 次降为 1 次、镜像回写归零，路由切换 440ms → 273ms，长任务与掉帧归零；
- **落点提示层不再每槽位挂一个 `<Transition>`**：拖拽落点的那圈主题色边框，此前每个字符槽/和弦槽都用一个 `<Transition>`
  包裹（每个槽位多实例化 `Transition` + `BaseTransition` 两个组件）。纯装饰性提示不值得付组件开销，改为常驻元素 +
  `opacity`/`visibility` 类切换（`transition-property` 由 `opacity,scale` 收敛为
  `opacity,visibility`——原 enter/leave 的 scale 两端都是 100，实际只有透明度在变；`visibility`
  同过渡保证淡出结束后才转 hidden）。实测冷切「排列和弦」挂载的组件实例由 922 降至 454（−51%），主线程长任务 140ms →
  90ms、最差单帧 154ms → 110ms、手势总耗时 450ms → 380ms（两次独立运行 386 /
  375ms）；提示层行为经脚本验证：静止全隐藏、拖拽悬停时恰好一个可见、松手回落。

### 修复 · 全工程逐行审计落地的行为缺陷（2026-09-21）

- **迁移失败可重试**：localStorage 退役标记改到「持久化熔断 + 回读核验」两道守门之后才写入——此前回读核验失败时标记已落库，下次启动被顶部短路直接跳过重试，半截迁移的库永久不再补迁（完整副本留在已无人读取的 localStorage 里）；
- **导入坏数据不再崩栈**：备份导入 / 云同步 pull / 分享链接 / 启动转录四条入口在边界统一补 `Array.isArray` 守卫，
  `chords`/`songs` 为非数组或 `strings` 含 `null` 时按校验失败给出可读提示，不再以 `TypeError` 逃逸成未处理拒绝；
- **乐谱读库失败不覆盖真数据**：`song` 域改用 `chord`
  域既有的协议——加载失败即本会话不落库，而不是吞成空列表后照常写回，避免一次读失败就把云端/本地索引覆盖成空；
- **工作台面板折叠状态读对**：旧 `*_COLLAPSED` 布尔键的历史极性（`true`
  = 收起）此前被读成「展开」，升级后首次进入会看到与离开前相反的面板开合态，现已纠正；
- **导出图与屏幕预览品位一致**：指板品数兜底收成单一真源 `clampDrawFretCount`，缺 `fretCount`
  的和弦导出长图 4 品、屏上 3 品的分叉消除（两侧注释本就要求逐像素一致）；
- **长图缓存随拍号失效**：长图缓存键补上 `timeSignature` 并预览/导出共用同一份键构造，改拍号后不再复用陈旧长图；
- **移调撤销不留僵尸和弦**：移调自动新建的和弦纳入撤销快照——撤销被新编辑截断（redo 分支失效）时回收这些和弦，且仍被其他乐谱引用的和弦不会被误删；
- **自建服务端配置补校验**：`server` provider 接上 `validateServerSettings`，四个同步后端现在走同一道配置校验；
- **重复点击分享不再并发写剪贴板**：`runBusyAction` 支持 `toRef(state, key)`
  形态的 busy，弹窗与和弦传输侧统一走互斥管线，双击「分享和弦」不会再触发两次剪贴板写入；
- **无障碍焦点口径统一**：浮层焦点元素选择器收成一份（含 `a[href]` 与 `[contenteditable]`），修掉「弹层里链接能 Tab 到但
  `vFocus` 进不去」；
- **GitHub 同步失败给出诊断**：四个 provider 的错误面统一走 `describeError`，失败提示不再只给 HTTP 状态码；
- **设置项文案不再越权承诺**：「忽略空行」补「仅预览 / 导出生效」限定，与同区块其他项写法一致；
- **小调导音不再冒充调内七级**：小调调性下音级 11（如 Am 调的 G#/Ab）此前与大调共用一张表，标成调内
  `VII`——现按自然小调为基准标为 `#VII`
  且判定为非调内（和声 / 旋律小调的升七级导音），分析面板的级数标注与「调内 / 借用」着色随之纠正；斜杠低音的级数同样改按调性选用小调度数表；
- **小调「按级数排序」不再错判调外**：调内音级掩码补齐自然小调一套（3/6/7 级比大调低半音），小调组的 III / VI /
  VII 此前被大调掩码判成调外而排到调外堆里，现在与其余调内和弦同组同序；
- **导出长图的横按与屏幕同判据**：长图渲染补上屏幕渲染器既有的失效校验——越出可视品位窗口、端点弦被移走或覆盖区间内出现空弦 / 静音的横按不再画成横梁（此前同一和弦屏上无梁、长图有梁）；
- **文本谱 capo 越界值归一**：从文本导入 / 解析乐谱时 capo 统一收敛为 0–12 整数（非有限值归 0），小数品位不再一路带到品位坐标计算才炸，报错点回到解析入口；
- **全量覆盖歌曲先换内存再扫存储**：`overwriteSongs` 的孤立记录清理要在歌曲替换之后执行——此前先 `await`
  存储扫描，调用方（导入 / 云端应用为 fire-and-forget）拿到的仍是旧列表，扫描期间的写入会被随后的替换丢掉；
- **配置弹窗标签弱化真正生效**：`label-tone` 的有效取值是 `muted`，设置弹窗五处写的是从不命中任何样式分支的
  `title`，「让分组标题更突出」的标签弱化一直没生效；令牌统一为 `body | muted` 后视觉与设计意图一致。

### 变更 · 云同步分支列表能力下线（2026-09-21）

- **分支拉取链路删除**：`fetchGithubBranches` / 两个 provider 的 `listBranches()` / `supportsBranches` 可选能力标记 /
  `isFetchingBranches`
  状态一并移除——全项目无任何 UI 消费这条链路，同步始终按配置里填写的分支读写单个 contents 文件，拉取分支名单从未影响过实际落点；
- **随附本地缓存键移除**：`settingsStore.githubBranches` / `giteeBranches` 及其 `GH_BRANCHES` / `GE_BRANCHES`
  存储键删除（旧键里的残留数据不再读取，属一次性失效，不影响和弦 / 乐谱 / 同步配置本体）。

### 变更 · 命名与对外契约统一（2026-09-21）

- **DOM 钩子全名化**：歌词行元素属性 `data-line-idx` → `data-line-index`，DevPanel 分段 `data-dev-sec` →
  `data-dev-section` （依赖这两个属性做外部脚本定位的话需要同步改名）；
- **导出模块改名**：状态壳 `useScoreExportActions` → `useScoreExport`、懒加载实现 `scoreExportHandlers.ts` →
  `scoreExportActions.ts`，与 `useSyncService` + `syncActions` / `useBackupModals` + `backupModalActions`
  同一种壳/实后缀；
- **本地落盘不再叫 sync**：面板顺序的本地写入函数 `syncToStorage` → `persistToStorage`，与推云端的 `syncToRemote`
  不再共用同一个方向词；和弦库的 `flushChordsToStorage` 纯别名删除，统一调 `persistAll`；
- **主题令牌去双拼**：删除 `--color-color-{primary,success,warning,danger}` 与 `--color-surface-surface`
  （破本文件「颜色名不带属性角色词」的规矩），调用点改用 `text-primary` / `text-warning` 与 `dark:bg-(--bg-surface)`；
- **分组展开判定改正向**：`chordStore.isGroupCollapsed` → `isGroupExpanded`、`toggleGroupCollapsed` →
  `toggleGroupExpansion`，与 score/workbench 侧的 `*GroupOpen` 同极性；
- **错误词汇表收口**：`platform/services/errors` 只保留实际落地的存储层错误（`AppError` +
  `errors.storage`），删除零调用的 `toAppError` 与 6 个未用错误码；同步层继续用 `SyncError`，其余业务代码抛原生
  `Error`。

### 变更 · 全局通知默认方位改为右上角（2026-09-20）

- **通知位置**：迁移后的全局通知（`GlobalNotification`）默认方位由原 Toast 的「顶部居中」调整为「右上角」——属用户可感知的视觉变化，避免与顶部标题栏 / 模态框重叠。

### 修复 · 乐谱拖拽撑开/收拢过渡（2026-09-20）

- **拖拽落点行收拢平滑**：`min-width`/`min-height` 过渡固化在字符槽基类 `transition: all`，字符槽/歌词行基类均显式归零
  `min-width/min-height`
  为数字——让所有撑开/收拢（落点行宽高、空行、行首/尾添加槽）都是「长度↔长度」可插值，松手后被撑开的行从宽收回到正常宽度有过渡，不再瞬间跳变（`auto`
  不可插值，故必须给数字基线）；
- **空行落点高度平滑**：歌词行基类 `min-height` 显式归零为 `0`，避免空行随 `body.is-global-dragging`
  撑到 116px、松手回落到 `auto` 时因 `auto` 无法插值而瞬间跳变。

### 修复 · 五处结构性缺陷（2026-09-20）

- **`chordMap` 按行分组嵌套**：乐谱槽位从扁平字符串 key（`line_{lineId}_{type}_{index}`）改为
  `Map<LineId, ChordLineSlots>`（`char` 下标 Map + `start`/`end`
  有序列表）。删除歌词行即删除整条行键，僵尸槽位在结构上不可能产生（旧 N5 补丁简化为按行+下标钳制）；解析器/前缀扫描/全表重写收敛为按行 O(1) 访问，三态兼容（旧扁平/新嵌套/空）并新增 v6→v7 迁移；`SLOTS`
  文本导出格式逐字节不变；
- **琴弦实体拆对象型**：`GuitarStringEntity` 由 `[fret, preferFlat]` 元组改为 `{ fret, preferFlat }`
  对象，物理品位与显示偏好解耦——指纹不再因升降号偏好不同而判重；移调 `shift_frets` 补上界钳制（越 `fretCount`
  不再静默丢弦）；v6→v7 迁移把旧二维元组迁为对象数组，文本编解码往返格式不变；
- **`fretOffset`/`capo` 收口**：清洗层承诺（载入必有 `fretOffset`、无 `capo`）落地到类型——理论/实体/导出 worker 删除
  `capo` 签名与 `?? capo ?? 0` 兜底，消费方直读 `fretOffset`；
- **`SyncSettingsBackup` 判别联合**：19 个平铺字段改为 `{ kind: 'github'|'gitee'|'webdav'|'server', ... }`
  四分支联合，编译器强制各分支字段配套；旧扁平备份经 `syncTarget` 归一化兼容；`syncTargetLabel` 改查表 + `未知`
  兜底，不再静默误标 GitHub；
- **`collectEdgeChordIds` 等解析路径收拢**：多处手写 `startsWith + slice + parseInt` 归一到 `parseSlotKey`
  单一真相源（已在 chordMap 嵌套化中一并消除）。

### 新增 · 云同步数据校验和与启动一致性提示（2026-09-19）

- **校验元数据与数据源分开**：上传时把 MD5（`dataMd5`）与最新修改时间戳（`dataUpdatedAt`）作为最小校验数据独立保存——GitHub/Gitee 存
  `${path}.meta.json`、WebDAV 存 `chords.meta.json`、server 经 POST 的 query 提交由后端 `/meta`
  端点返回，数据源正文保持干净；
- **启动一致性检测**：应用启动后非阻塞按「只拉最小校验数据」比对（git/webdav/server 走 `fetchMeta`
  读独立 meta，不再下载全量数据源），内容不一致时按时间戳判定「本地有未同步改动 / 云端较新」给出方向性提示；云端无校验数据（旧数据 / 从未上传）时引导先行上传建立校验基准（目标未配置 / 探测异常则静默跳过，懒加载不进首屏闭包）；
- **全局轻提示更名**：Toast 全链路语义改名为 Message（组件 `GlobalMessage`、`uiStore.message.*`、类型
  `Message/MessageType/MessageOptions`），各调用方命名同步更新；设计令牌层 `--z-toast` 等保持不变。

### 新增 · 云同步后端 Worker 纳入仓库并一键部署（2026-09-19）

- 后端源码与配置入库 `worker/`（`index.js` + 独立 `wrangler.jsonc`，含 D1 绑定与 `SERVER_TOKEN` 鉴权说明）；
- 新增 `scripts/deploy-worker.mjs` 与 `pnpm deploy:worker`：从开发凭据文件 `.env.development`
  读取（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `SERVER_TOKEN`），经 `npx wrangler` 部署，不引入重量级依赖；
- `.env.development` 已加入 `.gitignore`（开发/部署凭据），项目数据 `.env` 正常跟踪；
- 新增 GitHub Actions `deploy-worker.yml`：仅当 `worker/**` 变更时，push 自动部署至 Cloudflare（凭据走 Repo Secrets）。

### 重构 · 存储架构迁移：localStorage 退役、IndexedDB 唯一权威（2026-09-18）

- **IDB 转正**：IndexedDB 由「纯备份」升为唯一持久化权威，新增 `idbKv`（kv 镜像 + 50ms 微批落盘 + `pagehide` 强刷）与
  `useStorage`（同步读后端，默认走 idbKv），localStorage 读写路径退役；
- **旧数据一次性转录**：启动时 `transcribeLegacyLocalStorage`
  把旧 localStorage 的实体与偏好宽容清洗后单事务原子写入 IDB；转录幂等（镜像标记防重放）、失败不阻塞启动、实体先落库成功才清旧数据（防丢失）、敏感键（WebDAV 密码）直接丢弃不转录；
- **跨标签页同步**：IDB 无 storage 事件，自建 BroadcastChannel——写入方广播变更键、接收方回读 IDB 更新内存镜像并刷新已挂载的
  `useStorage`，语义与旧 storage 事件对齐；
- **写失败上报 + 配额熔断**：新增 `persistFailure`（跨层事件上报，同键去重）与
  `persistFailureNotice`（app 订阅呈现）；识别 `QuotaExceededError` 后熔断短路写入、删除类操作不受阻断、刷新即复位；
- **清空策略不跨应用**：迁移清理仅删本应用消费过的键，对同域共存的其它应用安全。

### 新增 · 备份导出敏感凭据加密（2026-09-18）

- **备份加密**：`backupCrypto` 用用户提供 passphrase 经 PBKDF2-SHA256（150k 迭代 +
  16B 随机盐）派生 AES-256-GCM 密钥加密同步设置中的 Token / 密码等敏感字段（12B 随机 IV），备份文件中不再明文携带凭据；
- **未提供密码拒绝导出**：导出备份未填加密密码时取消导出并提示；解密失败走异常捕获，不吞错误。

### 更新 · 乐谱编辑字符槽位重映射（2026-09-18）

- **编辑一致性**：`scoreModel`
  新增行匹配（`matchLineIds`）与字符下标重映射（`buildCharIndexRemap`），编辑后和弦槽位随字符移动正确复用；`chordSlots`
  配套槽位平移（`shiftCharSlotsForEditedLines`）与孤儿引用清理（`pruneOrphanChordRefs`），大段粘贴不再丢失原有和弦绑定；
- 配套 `tests/utils/chordMap.test.ts` 覆盖槽位解析 / 平移 / 清理契约。

### 修复 · 扫弦时序与音频上下文生命周期（2026-09-18）

- **扫弦 humanize 策略修正**：改为「固定基准时间戳 + 本弦局部抖动」，随机项不再逐弦累进累积，长扫弦总跨度不再漂移；
- **dispose 彻底关闭 AudioContext**：节点断开后置空上下文，下次播放重建全新实例（移动端 iOS
  WebKit 长期挂起会占音频硬件通路、增加功耗）；引擎新增 `getAudioTime` 供播放器 lookahead 排程。

### 重构 · 平台 UI 交互逻辑下沉为组合式函数（2026-09-18）

- **BasePopover 拆分**：hover 开关时序 → `usePopoverHover`、浮层层级池 → `usePopoverZLayer`、指针跟踪 →
  `popoverPointerTracking`、定位内核 → `floatingCore`，组件侧保留几何判定与事件绑定，行为不变；
- **BaseSegmentedControl 拆分**：拖拽切换 → `useSegmentedDrag` +
  `segmentOption`（纯数据模型），宿主保留指示器测量与 model 写回；
- **BaseSlider 拆分**：拖拽/键盘/滚轮/轨道点击时序 → `useSliderInteraction`，取值计算与事件派发留在宿主；
- **BaseInput 拆分**：搜索结果面板 → `useSearchResultsPanel`；
- 全部为平台内组合式函数，零业务依赖，base 层保持纯净。

### 更新 · 构建产物相对 base，兼容任意静态托管（2026-09-18）

- **`vite base` 改为相对路径 `./`**：构建产物可在 GitHub Pages 子路径、EdgeOne 等任意根路径托管下正确解析资源（PWA
  manifest 图标与 `start_url` 同步相对化），无需平台专用构建脚本；
- **`packageManager` 固定 pnpm 版本**：与 lockfile 哈希对齐，修复 CI（EdgeOne）冻结安装的
  `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`。

### 更新 · 长列表与指板渲染性能优化 + 分享链接与打印（2026-09-17）

- **渲染性能**：长列表视口窗口化、分块挂载、位图分层与驻留渲染线程，滚动与指板绘制开销显著降低；
- **分享链接**：新增乐谱分享链接（`shareLink` 协议 + URL 组装），跨实例流转与打印（`print` 导出）打通；
- **和弦模板「三音可省」修复**：三音（三和弦第三音）可按需省略，乐理判定修正；
- **滚动气泡**：滚动位置提示气泡，页脚合成层随导出呈现。

### 重构 · 浮层生命周期收敛与预览渲染载荷下沉（2026-09-16）

- **overlayLifecycle / overlayGuards**：浮层生命周期统一收敛，关闭守卫一致化；
- **runBusyAction**：异步动作统一加忙态（loading 互斥），避免并发重复执行；
- **useScoreRenderPayload**：预览渲染载荷计算下沉，新增 LRU 缓存复用已渲染谱面；
- **BaseFloatingBar → BaseFloatingPill 更名**，命名与用途对齐。

### 更新 · 拖拽 FLIP 接管与 BaseRollingText 逐字翻页（2026-09-16）

- **拖拽位移动画统一 useSortableList 接管 FLIP**：列表重排平滑位移，替换各宿主手写过渡；
- **BaseRollingText**：新增逐字翻页组件（滚动字幕类展示），支持浮层钉住；
- **指板滑动绘制**：滑弦/滑音效果绘制，导出面板背景过渡与配色修复。

### 重构 · store 领域化拆分与组件下沉（2026-09-15）

- **四大 store 拆分为领域模块**：按 chord / score / platform 边界收敛状态，依赖流向更清晰；
- **平台组件下沉**：通用组件归位 `platform/ui`，导出动作收敛至 app 服务层；
- **工作台 / 和弦库小组件合并回宿主**，减少无谓拆层；
- **格式脚本崩溃自动重试**：prettier 格式化异常时自动重试，CI 稳定性提升。

### 新增 · 下载下拉标题展示预估文件尺寸（2026-09-14）

- **Worker 新增 `estimate`
  模式**：复用长图真实渲染管线（同一布局/质量/边距），仅回传 JPEG 字节数不产出 Blob，预估值与实际下载文件一致（仅取整误差）；主线程零阻塞；
- **下载下拉顶部标题行**：Hover 展开即显示「预估文件大小 X MB」（计算中/未就绪给出占位文案）；
- **按需估算 + 指纹去重**：聚合歌词/歌手/和弦映射与全部影响尺寸的设定作为指纹，输入未变不重复渲染；`immediate`
  覆盖「刷新后已停在预览 tab 且歌曲同步水合」时 watch 不触发的场景。

### 修复 · Toast 消失动画丢失（2026-09-14）

- **根因**：TransitionGroup 的 FLIP 会把 flex 容器中转为 `absolute`
  的离场元素（静态位置存在亚像素偏移）误判为位移项并追加 `-move` 类；`.v-transition-slide-down-move` 原排在
  `-leave-active` 之后，同特异性下按源顺序覆盖其 `transition`，过渡属性只剩 `transform`，`opacity` 瞬间跳变；
- **修复**：`slide-up` / `slide-down` / `list` 三组 `-move` 规则统一前移至 `-enter-active/-leave-active`
  之前（附注释说明顺序约束）；`list` 组（和弦选择器网格）属同类隐患一并修复。

### 修复 · 排列和弦拖拽时字符撑开无过渡（2026-09-14）

- **根因**：`.is-drop-widened` 的 `min-width/min-height` 过渡从初始值 `auto` 出发，`auto ↔ 长度`
  不可插值，过渡按离散翻转表现为瞬间跳变；
- **修复**：`ChordSlotCell` 与 `ScoreInteractiveArea` 的 `.char-box`
  基线显式归零（`min-width/min-height: 0`），撑开/收拢双向平滑；静止态视觉零变化。

### 修复 · 指板横按气泡进出场动画失效（2026-09-14）

- **修复**：`FretboardSvg` 气泡过渡样式块转 `scoped`，选择器特异性提升后压过气泡元素自带的 Tailwind 过渡工具类（此前
  `opacity+transform` 过渡被覆盖，进出场瞬移）；同时横按气泡阴影收敛为 token 化轻投影。

### 更新 · 预览导出「忽略空格」开关与设置面板重分组（2026-09-14）

- **新增「忽略空格」设置**（`scoreIgnoreEmptySpace`，持久化）：开启后歌词中未挂和弦的空格不占列宽，整行更紧凑；打通设置面板 →
  `WorkerExportPayload.ignoreEmptySpace` → Worker
  `getCharColumnWidth`（测量与绘制共用）→ 预览内容键，长图/分页/Zip/PDF 四种导出全部生效；
- **Header 设置弹窗重分组**：乐谱对齐 / 歌词字重 / 忽略空格 / 显示页脚归入仅预览 tab 可见的分组；「试听音量」移入音频组（音量条目旁）；移除「编辑歌词」tab 顶栏的歌词复制/粘贴按钮（歌词取用与写入都在编辑区内完成），同步删除
  `copyLyricsText` / `pasteLyricsToEditor`；
- **导出排版微调**：`CHORD_COLUMN_EXTRA_PAD` 8→4、`INLINE_CHORD_GAP` 10→0。

### 更新 · Server 同步推送 Token 与 WebDAV 密码必填（2026-09-14）

- **Server 同步新增 Token 鉴权**：同步设置面板新增 Token 输入（密码态，仅驻留内存不落盘），推送（push）请求携带
  `Authorization: Bearer`，拉取与探测保持公开；配置面板文案同步更新；
- **WebDAV 推送需密码**：同步禁用判断与提示文案补齐密码校验；新增 provider 测试覆盖「push 带 Token / pull 不带」。

### 更新 · 乐谱空态支持剪贴板粘贴建谱（2026-09-14）

- **空打开状态粘贴**：乐谱路由未选中任何乐谱时，`Ctrl/⌘+V`
  与空态「从剪切板粘贴」按钮可直接导入剪贴板中的乐谱；带结构直接建谱，纯歌词无结构时免二次确认直接落地（用户本就主动粘贴）；有乐谱时放行原生输入（编辑区由
  `ignoreEditable` 守卫）。

### 更新 · BaseSlider 数值气泡改全局浮层与滚轮续显（2026-09-14）

- **气泡迁移**：滑块数值气泡由内联 `Transition` 改为 `v-tooltip`（`manual` + `compact`
  驱动）teleport 到 body 的全局浮层，彻底摆脱折叠容器 `overflow` 裁剪/遮挡，观感由指令内建 `v-tooltip-compact` 复刻；
- **滚轮续显**：滚轮步进改值后气泡短延时（700ms）续显，`wheelable` 场景改值可见当前数值。

### 更新 · 通用组件能力补全（2026-09-14）

- **BaseBadge / ActionButton 原生 `title`**：新增 title prop，缺省按「显式 title >
  label/content > 默认插槽纯文本」回退（新增 `slotText` 工具），多处徽标与按钮补充悬停说明；
- **BaseBadge 新增 `2xs` 微型尺寸档**，密集列表行内徽标与角标改用；
- **指令修饰符统一连字符拼写**：`v-focus` / `v-grid-nav` 的 `preventScroll` / `prevent_scroll` 统一为
  `.prevent-scroll`；
- **BaseModal 尺寸改固定像素**：预设宽高不再携带 vw/vh 上限（弹窗尺寸不随视口变化），未居中弹窗顶部间距 10vh →
  96px，自适应高度上限 `85vh` → `calc(800px-8rem)`。

### 更新 · 乐谱文本协议和弦去重语义（2026-09-14）

- **序列化按和弦 id 去重**：同一和弦复用共享一个 alias；不同和弦即使同名同指法也各自独立条目（此前按序列化字段去重会错误合并）；旧格式文本解析不受影响，往返测试覆盖。

### 修复 · 冷启动「最近乐谱」指针在取消选中时清除（2026-09-14）

- **修复**：取消选中乐谱（id 置空）时同步清除 `localStorage` 指针，用户主动取消的选择不再在刷新后被回灌复活。

### 更新 · 备份导入/导出弹窗关闭时清空勾选（2026-09-14）

- **状态复位**：模块级共享的 `modalData`
  在弹窗关闭时把勾选归位到打开时的默认值（导出默认不含同步设置），不再残留上次勾选；解析载荷与文件名一并清空。

### 新增 · 乐谱歌手属性（singer）（2026-09-13）

- **`Song` 新增 `singer` 字段**：纯展示元数据（空串表示无），旧持久化数据经清洗层自动补齐空串，无迁移成本；
- **乐谱配置弹窗新增「歌手」输入行**（乐谱名称下方，选填），保存进 `updateSongMeta`；
- **乐谱列表卡片**：歌名下以次要文字展示歌手（为空不渲染）；
- **canvas 导出表头**：singer 非空时在标题下绘制居中副标题行（新增 `SINGER_SUBTITLE_FONT_SIZE` / `SINGER_SUBTITLE_GAP`
  常量），无 singer 时表头高度与既有排版完全一致；预览内容键纳入 singer 以响应刷新；
- **文本协议扩展**：`FLSONG` header 段新增 `SINGER:`
  行（仅在非空时序列化），旧格式文本解析 singer 为空串、新格式文本可被旧实例正常导入（未知 header 行被静默忽略）；智能导入同步支持 ChordPro
  `{artist:}` / `{singer:}` 指令与首行 `歌手：xxx` 模式（计入结构信号）。

### 更新 · 新建和弦弹分组选择 + 抽屉内置和弦候选（2026-09-13）

- **构建和弦编辑抽屉移除「作为新和弦保存」**：删除抽屉底部该入口，编辑现有和弦不再支持一键另存为新和弦；
- **新建和弦改为分组选择弹窗**：点「确认保存」新建时弹出目标分组选择弹窗（交互复刻「移动至新分组」分组网格），预选当前已生效分组，确认后按所选分组落盘；无任何分组时不弹窗，沿用既有的「请先新建分组」校验提示；
- **弹窗层级与阻断协调修正**：
  - **z 层号**：抽屉自身走动态浮层池（≥9999）而 `BaseModal` 默认静态
    `z-overlay`（2000），弹窗会被压在抽屉之下；现从浮动层池动态分配高于抽屉的层号注入弹窗（打开分配、关闭释放），保证分组选择弹窗盖在抽屉之上；
  - **inert 协调**：`BaseModal` 与 `BaseDrawer`
    原先各自维护独立的激活层栈，跨类型层叠（抽屉之上再开弹窗）关闭后会把仍被抽屉挡住的元素误判为可交互，导致抽屉被永久
    `inert` 挡住而点不动；现抽出统一的
    `overlayStack`（`src/platform/ui/overlay/overlayStack.ts`），Modal 与 Drawer 共享同一登记栈与 inert 同步，无论如何层叠都只允许栈顶一层可交互，关闭任意层正确回退到下一层；
- **抽屉新增和弦候选**：抽屉指板下方复用工作台 `ChordAnalysisPanel` 新增「和弦候选」区（新增 `candidatesOnly`
  模式，仅渲染候选、隐藏按音分析列表），点选候选即写入和弦名与根音标记，与指板编辑共享同一草稿；候选区与指板同处 `w-fit`
  列，宽度与指板一致。

### 更新 · 空态组件升级为通用反馈组件 `Feedback`（2026-09-09）

- **`EmptyState` → `Feedback`**：原空态组件升级为全项目通用的反馈组件，在保留既有空态能力（`empty` / `404` / `network` /
  `search` 预设、图标 / 图片 / 标题 / 描述 / 操作按钮、sm / md / lg 三档尺寸、虚线 `bordered`
  边框）基础上，新增两类状态预设：
  - **`loading` 加载态**：自动渲染旋转图标（`animate-spin`）+ 默认「加载中...」文案，可覆盖 `description`；
  - **`error` 错误态**：危险色强调图标 + 默认「请求失败，请重试」文案，配合 `action-text` + `@action` 可渲染重试按钮；
- **全项目替换**：12 处 `EmptyState` 引用统一重命名为 `Feedback`（导入路径与标签同步），并删除旧 `EmptyState.vue`；
- **乐谱预览收敛**：乐谱「预览」首帧「正在生成预览...」加载态与「渲染失败 + 重试」错误态由裸 markup 改为 `Feedback` 的
  `loading` / `error` 预设。

### 更新 · 乐谱预览下载下拉新增「分页 PDF」（2026-09-09）

- **新增分页 PDF 导出**：在预览下载下拉（长图 / 分页 Zip）基础上增加「下载为分页 PDF」；经 Worker 离屏渲染为 A4 分页图片后，手写一个零依赖极简 PDF 图像容器（`platform/utils/pdf.ts`），把各页 JPEG 以
  `/DCTDecode` 原样字节嵌入（不二次编码）、铺满对应 MediaBox，尺寸由所选页型（A4/A5/Letter，96dpi px → 72dpi pt）换算；
- **零依赖控体积**：`pdf-lib`
  仅用于「JPEG 装箱」这一窄用途，整体约 700KB 偏重，故改为约百行自研生成器，剔除该依赖；PDF 下载同样懒加载（不进首屏）。另补充字节级单元测试（校验 xref 偏移 / 流长度 /
  `/Kids` 页序），用于防止逐字节结构回归；
- **沿用预览排版**：与长图 / Zip 一致，沿用页脚、页尺寸、页边距等设置，页脚开关同样生效。

### 更新 · 乐谱预览下载改为 Hover 下拉（长图 / 分页 Zip）（2026-09-09）

- **下载按钮收敛为下拉菜单**：乐谱「预览」tab 原「下载整曲长图」按钮改为
  `BaseMenu`（Hover 触发）下拉，提供「下载为长图」「下载为分页 Zip」两个选项；「复制整曲长图」按钮保留；
- **新增分页 Zip 导出**：经 Worker 离屏渲染为 A4 分页图片后打包为 zip（条目命名
  `<曲名>_第N页.jpg`），各页已是 JPEG，Zip 内以 store 归档避免二次压缩；依赖引入
  `fflate`。两种下载均沿用预览的页脚/尺寸/边距等排版设置；
- **行为边界**：无歌词或导出进行中时下拉禁用，zip 仅分页（A4）模式产出，长图仍走 `normal` 模式单图。

### 新增 · 预览页脚页码开关（2026-09-09）

- **可选的页脚页码**：A4 分页预览/导出在每页底部页边距内水平居中绘制「第 X 页」，可通过乐谱设置「版面 → 显示页脚」开关控制显隐；关闭后页脚不渲染；
- **配置链路与缓存**：新增 `scoreShowFooter` 偏好（跟随偏好备份同步），worker 透传 `showFooter`，预览缓存键拼接 `ft`
  标记，切换开关即时重渲染且不复用旧页。

### 修复 · Header 设置弹窗关闭后滚动位置丢失（2026-09-08）

- **会话级滚动记忆**：设置弹窗以 `v-if` 销毁/重建面板容器，重新打开后浏览器默认回到顶部；现按乐谱 / 工作台两路由维度记忆
  `scrollTop`，容器重建后立即恢复，关闭并重开弹窗仍停留上次滚动位置，不再「闪回顶部」。滚动位置与会话级折叠展开组一致，作为会话内记忆（切换路由或刷新后重置）；
- **关闭动画期间的滚动位置保持**：排查确认关闭动画仅为 transform 缩放、不重排布局，但浏览器仍可能在关闭瞬间把滚动容器
  `scrollTop` 静默钳回 0 且未必派发 scroll 事件，导致内容「闪回顶部再消失」。现以 `MutationObserver` 监听面板 `-leave-`
  过渡类（在动画首帧之前触发），进入离场即启动 `requestAnimationFrame` 循环，每一帧把 `scrollTop`
  重贴回记忆值，离场结束即停止；同时离场阶段不再把浏览器的「钳 0 假滚动」写入会话值，避免污染重开位置。

### 重构 · 按钮菜单与右键菜单合并为统一 `BaseMenu`（2026-09-08）

- **三组件收敛为一件**：`PopoverMenu.vue`（按钮下拉）与 `ContextMenu.vue`（右键菜单）共享同一「BasePopover +
  MenuItems 列表 + onSelect」骨架，现合并为 `platform/ui/menu/BaseMenu`，触发器完全由业务层通过 `#trigger` /
  default 插槽自定义，不再内置固定触发按钮；两旧组件删除、全部消费者迁移；
- **三态统一**：`trigger` 支持 `hover` / `click` / `contextmenu`
  三种触发，统一启用「菜单组互斥关闭（开新关旧）」、「↑↓ 循环导航 + Tab 关闭」与「打开自动聚焦首项」；右键仍支持
  `openMenuAt(x, y)` 跨元素定位（乐谱预览单页右键菜单用）；
- **可见行为变化**：右键上下文菜单面板头部标题（乐谱预览单页菜单的 `pageMenuTitle`）首次实际渲染；菜单选中统一尊重
  `keepOpen` 语义。

### 重构 · 菜单组件语义拆分：`MenuItems`（纯列表）与 `MenuSubmenu`（级联子菜单）（2026-09-08）

- **新语义拆出 `platform/ui/menu/`**：原 `ContextMenuItems` 职责混杂（既渲染普通项又内嵌级联子菜单），且被 `ContextMenu`
  与 `PopoverMenu` 共用、语义割裂。现收敛为三件套——`MenuItem`（`menu/types.ts`，纯数据模型）、
  `MenuItems`（纯列表骨架：标题/分割线/普通项渲染，仅负责收集键盘导航焦点）、`MenuSubmenu`（独立的级联子菜单触发项）；
  `MenuItems` 遇到含 `children` 的项按 `expandChildren ?? children?.length` 委托给 `MenuSubmenu`，`ContextMenu` /
  `PopoverMenu` 各自组合这两件基础件，消除「组件名带 Context 却被 PopoverMenu 复用」的语义歧义；
- **行为不变**：普通项/勾选/颜色/危险色/快捷键/分割线、级联展开判定、键盘上下导航与首项聚焦、子菜单浮层样式均沿用原实现，仅常量
  `MENU_SUBMENU_OFFSET_DISTANCE`（4px）与行样式 `menuRowStyle.ts`（`menuRowSizeClass` / `getItemStyle`）抽为共享工具。

### 更新 · 选择器下拉滚动条自绘与调弦面板连续切换（2026-09-08）

- **选择器下拉滚动条自绘**：`BaseSelector` 下拉选项列表接入 `v-scrollbar`
  覆盖式滚动条，统一浮层滚动视觉（原生滚动条不再显示），空选项态保持不可滚动；
- **选项项圆角与面板对齐**：下拉选项项圆角由 `rounded-lg` 收敛为 `rounded-md`，与面板圆角一致；
- **调弦选择器连续切换**：工作台「音色」面板调弦下拉新增
  `keep-open-on-select`——选中后面板保持展开，便于连续试听多套调弦，Esc / 点击外部仍可关闭。

### 新增 · 乐谱预览「页边距」档位切换（2026-09-08）

- **「页边距」分段选择**：Header 设置弹窗导出组新增「页边距」切换（窄 38px / 标准 56px
  / 宽 76px，对应 A4 标准 10/15/20mm 边距，默认标准），用于调节预览与导出版面的四周留白；持久化于设备级偏好；
- **渲染能力扩展**：预览导出 Worker 将硬编码页边距改为可配置的 `pageMargin`
  选项（缺省沿用原 56px），A4 分页与普通长图两条渲染路径同步生效；预览缓存 key 纳入页边距、调整即重绘，整曲长图「复制/下载」同步透传。

### 更新 · 乐谱预览「单页尺寸」档位、导出组更名「版面」与分组展开态会话级记忆（2026-09-08）

- **「单页尺寸」分段选择**：Header 设置弹窗新增「单页尺寸」切换（A4 / A5 /
  Letter，默认 A4），标准档位随打印需求切换预览与导出的单页宽高；持久化于设备级偏好，预览自适应缩放与超高判定同步按当前档位换算，缓存 key 纳入档位、调整即重绘；
- **导出组更名「版面」**：乐谱页原「导出」分组标题改为「版面」，更贴合页边距 / 单页尺寸 / 导出质量三项版面类设置的实际作用；
- **分组展开态会话级记忆**：设置弹窗折叠分组（乐谱页「排版 / 显示 / 版面」、工作台页「音色 / 效果 / 显示」）的展开状态改为会话级记忆——重开设置弹窗仍停留上次展开的分组；乐谱 / 工作台两页各自独立，且乐谱页内「排列和弦」与「预览」两 tab 的展开态也分维度记忆互不干扰；收起当前组即回到全部折叠；
- **分组内容重新归类**：乐谱页按「编辑排版 / 预览导出 / 显示开关」职责收拢——「排版」组仅保留编辑态的字号缩放 / 和弦缩放，「版面」组收拢全部预览与导出类设置（乐谱对齐 / 歌词字重 / 单页尺寸 / 页边距 / 导出质量，仅预览 tab 显示），「显示」组仅保留符号简写 / 显示横按开关，消除原先「歌词字重挂显示、导出质量挤版面」的边界渗透；
- **修复：分段控制选中高亮在弹层打开动画期间偏移**：`BaseSegmentedControl` 祖先存在 scale 进场动画（`BaseModal` /
  `BasePopover`）时回退测量，但 left/top 仍取含缩放的 rect 坐标、与宽高混用，弹层动画结束后（transform 不触发 ResizeObserver）滑块相对选中项偏左不回正。修复为缩放路径的 left/top 用「rect 差值 ÷ 缩放比」还原布局坐标（与宽高同源），缩放全程自洽、动画结束无需重测；scale=1 时与常规公式严格等价，非弹层场景不受影响。

### 通用 UI：新增 `BaseCollapse` 折叠分组，Header 设置弹窗分组收纳（2026-09-07）

- **新增通用折叠组件
  `BaseCollapse`**：平台 UI 库新增可折叠分组（标题/说明 + 内容 slot，含展开/折叠动画与无障碍 aria），已注册至
  `@/platform/ui` 门面；
- **设置弹窗分组收纳**：Header 设置弹窗由平铺改为分区折叠——乐谱页分「排版 / 显示 / 导出」三组，工作台页分「音色 / 效果 / 显示」三组。各页采用排他手风琴交互（后续演进：可全部收起、展开态会话级记忆、导出组更名「版面」，见 09-08 条目）；设置项未增删、行为不变；
- **BaseCollapse 支持受控展开**：`BaseCollapse` 暴露 `v-model:expanded`
  受控接口（未绑定时内部自持），箭头由「右→下」图标切换（替代旋转），配合父级约束实现互斥展开。

### 新增 · 乐谱预览「导出质量」设置（2026-09-07）

- **Header 设置弹窗「导出质量」滑块**：设置弹窗导出组新增「导出质量」滑杆（30~100，默认 95），调节 JPEG 压缩质量以平衡清晰度与文件体积；持久化于设备级偏好；
- **渲染能力扩展**：预览导出 Worker 新增 `exportQuality` 选项并按 `[0.3, 1]`
  区间约束，预览缓存 key 纳入质量，调整即重绘；整曲长图「复制/下载」同步透传该质量。

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
