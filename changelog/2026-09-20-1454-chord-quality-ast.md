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
