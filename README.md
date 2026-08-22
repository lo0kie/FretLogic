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
- **导出**：PDF / PNG（html-to-image + jsPDF）
- **GitHub 云同步**：把和弦库与曲库备份到你的 GitHub 仓库
- **多主题**：浅色 / 深色 / 高对比，可跟随系统

## 🚀 快速开始

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`。

## 🛠️ 技术栈

| 层       | 技术                                     |
| -------- | ---------------------------------------- |
| 框架     | Vue 3.5（组合式 API）+ TypeScript 5.4    |
| 构建     | Vite 5                                   |
| 状态     | Pinia                                    |
| 样式     | LESS + CSS 设计令牌（三主题）            |
| 存储     | IndexedDB（v2 契约）+ 旧数据迁移         |
| 音频     | WebAudio（tone.js）                      |
| 导出     | html-to-image + jsPDF                    |
| 测试     | Vitest（单元）+ Playwright（E2E）        |
| 代码质量 | ESLint（含架构约束）+ Prettier + vue-tsc |

## 📂 项目结构

```
src/
  app/          # 应用壳（main、AppShell、路由）
  core/         # 跨特性基础设施（tokens、基础组件、composables、errors、storage）
  features/     # 业务特性（chords/songs/score/fretboard/audio/export/sync）
  domain/       # 领域逻辑（乐理、和弦引擎、校验）
  data/         # 数据访问层
  ui/           # 视图组件与 composables
  utils/        # 通用工具
```

## 📦 脚本

| 命令             | 说明       |
| ---------------- | ---------- |
| `pnpm dev`       | 开发服务器 |
| `pnpm build`     | 生产构建   |
| `pnpm typecheck` | 类型检查   |
| `pnpm lint`      | ESLint     |
| `pnpm test`      | 单元测试   |
| `pnpm test:e2e`  | E2E 测试   |
| `pnpm coverage`  | 覆盖率     |

## 🤝 贡献

欢迎提交 Issue 与 Pull Request。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可

[MIT](LICENSE)
