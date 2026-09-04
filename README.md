<div align="center">

# 🎸 Fret-Logic

**吉他指板 · 和弦库 · 交互谱 一体化工作台**

现代化的吉他学习与编配工具：可视化指板、和弦识别引擎、歌词和弦谱编辑器、音频试听、PDF/PNG 导出与 GitHub 云同步。

</div>

---

## ✨ 特性

- **可视化指板工作台**：点按指板即时出音、和弦识别引擎给出最匹配的指法
- **智能和弦引擎**：从音符集合识别三和弦 / 七和弦 / 挂留 / 强力和弦，支持转位与低音弦
- **歌词和弦谱编辑器**：逐字对齐的歌词行 + 和弦槽位，支持拖拽、撤销重做、自动滚动
- **音频试听**：基于 WebAudio 的和弦弹奏预览
- **导出预览**：整曲 Web Worker 离屏渲染为 PNG 长图，可拆分上下两半并排查看
- **云同步**：把和弦库与曲库备份到 GitHub 仓库或 WebDAV 服务器（支持 CORS 代理）
- **多主题**：浅色 / 深色 / 高对比，可跟随系统

## 🚀 快速开始

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`。

### 🌐 云同步四种 Provider 本地联调指南

系统支持将和弦库与曲谱同步至外部云端存储，涵盖四种后端 Provider：

#### 1. GitHub 仓库同步

- **原理**：基于 GitHub REST API v3，通过 Base64 信封读写指定仓库与分支下的单个 JSON 文件。
- **本地联调步骤**：
  1. 在 GitHub Settings → Developer settings → Personal access tokens (classic) 生成 Token，勾选 `repo` 作用域；
  2. 在系统右上角「设置 → 云端同步 → 目标选择 GitHub」；
  3. 填入 Token、Owner（用户名/组织）、Repo（仓库名）、Branch（默认 `main`）和 Path（如 `fretlogic-backup.json`）；
  4. 点击「测试连接」，提示连通后即可在顶部执行推送（Push）与拉取（Pull）。

#### 2. Gitee 仓库同步

- **原理**：基于 Gitee OpenAPI v5 进行分支探测与文件读写。
- **本地联调步骤**：
  1. 在 Gitee 设置 → 安全设置 → 私人令牌 生成 Token，勾选 `projects` 权限；
  2. 在系统设置中选择目标为「Gitee」，填入 Token、Owner、Repo、Branch 与 Path；
  3. 注意：Gitee 鉴权需要 query 参数携带 `access_token`，联调时避免使用不安全的公用代理。

#### 3. WebDAV（坚果云 / Nextcloud / 本地 Nginx）

- **原理**：基于标准 WebDAV 协议（PROPFIND / GET / PUT）进行目录扫描与备份文件上传。
- **本地联调步骤（CORS 处理）**：由于浏览器直连多数 WebDAV 服务器受跨域（CORS）限制，开发环境随仓库附带了 Node 转发代理：
  ```bash
  # 终端 A：启动开发代理服务器（监听 8787 端口）
  pnpm dev:proxy

  # 终端 B：启动前端开发服务器
  pnpm dev
  ```
  在系统设置「WebDAV」配置面板中：
  - **服务器地址**：填写实际 WebDAV 地址（例如坚果云 `https://dav.jianguoyun.com/dav/`）；
  - **用户名 / 密码**：填写应用授权密码；
  - **CORS 代理**：填入 `http://localhost:8787`（勾选“启用代理转发”）；
  - 点击「测试连接」验证连通性。

#### 4. 自建 HTTP 服务器（Server Sync）

- **原理**：轻量标准 RESTful JSON 接口（GET / PUT），适合自建私人 API 服务。
- **接口契约**：
  - `GET {serverUrl}`：Header 携带 `Authorization: Bearer {serverToken}`，返回备份 JSON 载荷；
  - `PUT {serverUrl}`：Header 携带 `Authorization: Bearer {serverToken}` 与
    `Content-Type: application/json`，Body 为全量备份载荷。
- **本地联调步骤**：可使用本地简易 Express / Fastify / Python 脚本监听本地端口（如
  `http://localhost:3000/api/sync`），并在系统设置中填入 Server URL 与任意测试 Token 即可联调。

## 🛠️ 技术栈

| 层       | 技术                                         |
| -------- | -------------------------------------------- |
| 框架     | Vue 3.5（组合式 API）+ TypeScript 5.4        |
| 构建     | Vite 5                                       |
| 状态     | Pinia                                        |
| 样式     | Tailwind CSS v4 + SCSS 设计令牌（三主题）    |
| 存储     | IndexedDB（v2 契约）+ 旧数据迁移             |
| 音频     | WebAudio（tone.js）                          |
| 导出     | Web Worker 离屏渲染（OffscreenCanvas → PNG） |
| 测试     | Vitest（单元）+ Playwright（E2E）            |
| 代码质量 | ESLint（含架构约束）+ Prettier + vue-tsc     |

## 📂 项目结构

```
src/
  components/   # 可复用 Vue 组件（.vue）
  views/        # 页面级视图（TopHeader、ScoreView、SidebarLeft、WorkbenchView、各 Modal）
  composables/  # Vue 组合式函数（use*）
  services/     # 服务层：sync providers、repositories、领域逻辑、errors、storage、data bootstrap
  stores/       # Pinia stores
  router/       # 路由
  directives/   # 指令（vTooltip）
  assets/       # 静态资源与样式
  types/        # 全局类型
  utils/        # 通用工具与全局常量（constants.ts）
```

## 📦 脚本

| 命令             | 说明                                         |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | 开发服务器                                   |
| `pnpm dev:proxy` | WebDAV CORS 转发代理                         |
| `pnpm build`     | 生产构建（GitHub Pages 路径：`/FretLogic/`） |
| `pnpm verify`    | 全量质检（Lint + Typecheck + Test + Build）  |
| `pnpm typecheck` | 类型检查                                     |
| `pnpm lint`      | ESLint                                       |
| `pnpm test`      | 单元测试                                     |
| `pnpm coverage`  | 覆盖率                                       |

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。详见 [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)。

## 📄 许可

[MIT](LICENSE)
