# 🎸 Fret Logic (指板逻辑)

![Vue.js](https://img.shields.io/badge/Vue%203-323330?style=for-the-badge&logo=vue.js&logoColor=4FC08D)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Pinia](https://img.shields.io/badge/Pinia-F6D365?style=for-the-badge&logo=vue.js&logoColor=white)

**Fret Logic** 是一个为现代指弹吉他手、编曲人及吉他讲师打造的**高精度乐理与指板可视化 Web 工具**。

它不仅仅是一个画图工具，更是一个基于纯数学公式驱动和真实乐理引擎构建的沙盒。无论你是需要记录复杂的 Neo-Soul 和弦指型、探索特殊调弦，还是需要导出透明底色的高清指板图嵌入到 PPT 或文档中，Fret
Logic 都能提供像素级的完美体验。

## ✨ 核心特性 (Core Features)

- 🎯 **纯数学驱动的自适应指板**：支持 3品 / 4品 /
  5品 动态无缝切换。指板网格、音符半径、文字大小均采用底层物理数学公式联动计算，极窄弦距下依然保持像素级居中与严丝合缝，彻底告别写死的魔法数字 (Magic
  Numbers)。
- 🧠 **硬核乐理引擎**：
  - 内置支持 **Standard, Drop D, DADGAD, Open G** 等多种特殊调弦。
  - 完美支持 **Capo（变调夹）** 偏移运算。
  - 智能推导并切换等音名（如 `A#` ⇆ `Bb`）。
- 🎧 **原生 Web Audio 物理合成器**：零外部音频文件依赖。通过前端 `AudioContext`
  实时合成三角波与正弦波，结合动态压缩器 (Compressor) 与空间混响 (Convolver)，还原最真实的吉他下拨扫弦听感。
- 📸
  **生产力级高清导出**：利用离屏渲染与沙箱样式重写，支持一键生成**完美剥离底色的全透明 PNG 指板图**或**带精致暗黑/高光质感底板的实底图**。
- 📂 **丝滑的工作流管理**：
  - 支持和弦卡片的无限分组与 **HTML5 原生拖拽排序**。
  - 所有数据通过 LocalStorage 实时本地持久化。
  - 支持 JSON 格式的全量数据导出备份与安全校验导入。
- 🌓 **极致的双端 UI/UX**：Tailwind CSS +
  Less 构筑。深度适配 Dark/Light 暗黑模式，融入精致的弹性果冻动画与全局快捷键逻辑。

## 🕹️ 交互指南 (How to use)

在中央的指板工作区，鼠标是你的最佳画笔：

- **左键点击/滑动**：在琴弦上添加或取消按压音符；在顶部琴枕处切换空弦或静音 (`✕`)。
- **右键点击**：将当前音符设定为/取消 **根音 (Root Note)**，自动高亮为特殊醒目色彩。
- **鼠标中键**：对已按压的音符进行**等音名切换**（用于修正复杂和弦的命名逻辑）。
- **鼠标滚轮**：在指板区或 Capo 面板滚动，可全局快捷平移变调夹或吉他把位。

## 🛠️ 技术栈 (Tech Stack)

- **框架**：Vue 3 (Composition API & `<script setup>`)
- **语言**：TypeScript
- **状态管理**：Pinia + VueUse (`useStorage`, `useRefHistory` 等)
- **样式工程**：Tailwind CSS + Less 预处理器
- **构建工具**：Vite
- **核心库**：`html-to-image` (用于纯前端 DOM 矢量快照导出)

## 📦 本地开发 (Getting Started)

1. **克隆项目**
   ```bash
   git clone [https://github.com/lo0kie/fret-logic.git](https://github.com/lo0kie/fret-logic.git)
   cd fret-logic
   ```
