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
