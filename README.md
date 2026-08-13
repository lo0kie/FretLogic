# FretLogic

吉他和弦推导与交互式歌词排版 Web 应用。

👉 **在线体验**：[lo0kie.github.io/FretLogic](https://lo0kie.github.io/FretLogic/#/workbench)

## 💡 主要功能

- **指板交互与和弦推导**：支持 3/4 品指板切换、Capo 变调夹、特殊调音与智能和弦推导，自动识别转位与根音。
- **歌词和弦排版**：支持歌词编辑与和弦拖拽挂载（字符级 / 行首行尾），支持撤销重做历史栈。
- **高清乐谱导出**：一键导出长图/PDF，内置 A4 智能分页与剪贴板复制。
- **真实扫弦试听**：基于 Tone.js 实现吉他扫弦模拟与混响效果。
- **数据云同步**：支持 JSON 本地导入导出与 GitHub API 云端无缝备份。

## 🛠️ 技术栈

- Vue 3 / TypeScript / Vite / Pinia
- Tone.js / html-to-image / jsPDF / Floating UI

## 🚀 本地运行

```bash
# 安装依赖
pnpm install

# 启动开发服务
pnpm dev

# 打包构建
pnpm build
```

## License

[MIT](https://www.google.com/search?q=LICENSE)
