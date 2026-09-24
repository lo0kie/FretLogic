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
