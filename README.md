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

### WebDAV 同步（开发期）

浏览器直连多数 WebDAV 服务器（如坚果云）受跨域（CORS）限制。开发时可用随仓库附带的 Node 代理转发请求：

```bash
# 终端 A：启动转发代理
pnpm dev:proxy

# 终端 B：启动开发服务器
pnpm dev
```

然后在「云端同步设置 → WebDAV」中将 **CORS 代理** 填为
`http://localhost:8787`，其余（服务器地址 / 账号 / 密码 / 远程路径）照常填写。生产环境需自行部署一个返回 CORS 头的服务端转发。

## 🛠️ 技术栈

| 层       | 技术                                         |
| -------- | -------------------------------------------- |
| 框架     | Vue 3.5（组合式 API）+ TypeScript 5.4        |
| 构建     | Vite 5                                       |
| 状态     | Pinia                                        |
| 样式     | LESS + CSS 设计令牌（三主题）                |
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

| 命令             | 说明                 |
| ---------------- | -------------------- |
| `pnpm dev`       | 开发服务器           |
| `pnpm dev:proxy` | WebDAV CORS 转发代理 |
| `pnpm build`     | 生产构建             |
| `pnpm typecheck` | 类型检查             |
| `pnpm lint`      | ESLint               |
| `pnpm test`      | 单元测试             |
| `pnpm test:e2e`  | E2E 测试             |
| `pnpm coverage`  | 覆盖率               |

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可

[MIT](LICENSE)
