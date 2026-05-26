# 🎸 Fret Logic (指板乐理实验室)

一个为吉他手与音乐人打造的高端交互式和弦指板推演工具。项目采用现代前端硬核技术栈，打通了复杂的乐理状态机计算、跨端大拇指热区交互，并沉淀了工业级自适应工程优化。

![Vue3](https://img.shields.io/badge/Vue-3.x-4fc08d?logo=vue.js)
![Vite](https://img.shields.io/badge/Vite-5.x-646cff?logo=vite)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-38bdf8?logo=tailwind-css)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)

---

## ⚡ 核心硬核特性

### 1. 🛡️ 精密乐理状态机与核心防线
* **幽灵状态熔断**：指板网格与空弦控制区深度联动，当按点音高资产在跨品、跨维重组时，手动主音（Root Note）状态秒级解绑卸载，物理闭环消除幽灵继承 Bug。
* **物理冰封安全框架**：组件支持变体（Primary / Danger / Warning / Default）的高阶自定义状态，对置灰禁用态（Disabled）执行物理防穿帮拦截。
* **Pointer 事件手势防抖**：底层基于统一的 `PointerEvent` 安全总线，支持物理手势高频横滑顺畅抹音、点按按弦，并内置 `MUTING_COOL_DOWN` 冷却锁死防抖机制。

### 2. 🖨️ 离屏转录沙箱抗裁剪优化
* **DOM 抗裁剪剥离**：利用绝对定位状态机与局部溢出放行策略（`overflow: visible`），在不破坏面板基础滚动约束的同时，确保高阶 Tooltip 在极限边缘不被切断。
* **硬编码抗色变防线**：针对 `html-to-image` 的 Canvas 离屏克隆沙箱机制，通过实体状态类（`.is-empty`）与物理 Hex 色值硬编码死锁，彻底规避了克隆 DOM 树丢失 CSS 全局变量导致的图片褪色与黑屏偏色 Bug。

### 3. 📦 编译期二进制压榨与分包
* **无损平滑分包（Code Splitting）**：在 Rollup 编译层定制 `manualChunks` 函数颗粒化拆包，将 `html-to-image` 等非首屏核心大件剥离，顺着血脉闭环合并核心 Vendor，斩断循环依赖死锁。
* **0 依赖线上 console 剥离**：摒弃厚重的 Terser，利用内置的 `esbuild.drop` 在生产环境无感蒸发调试日志，兼顾极速编译与极致瘦身。

---

## 🛠️ 技术栈母带池

* **核心框架**：Vue 3 (Setup + TypeScript 5)
* **构建工具**：Vite 5 (现代化原生 ESM URL 路径别名解析)
* **状态管理**：Pinia (主脑全局乐理资产托管)
* **样式工程**：Tailwind CSS (原子化行内解耦) + Less (核心资产 Mixin 自适应托管)
* **自动化生态**：GitHub Actions 流水线 + `gh-pages` 本地手动一键双向发布

---

## 🚀 极速本地拉起

### 1. 安装全量资产
```bash
npm install
