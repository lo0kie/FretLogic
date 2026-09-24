/**
 * 可形变图标的**原始 SVG 正文**（即 `@iconify-json/lucide` 里 `icons[name].body` 的原文）
 * —— flubber 形变引擎的几何来源。
 *
 * 为什么需要：`ICON_REGISTRY` 里存的是 unplugin-icons 编译出的 **Vue 组件**，只剩渲染函数、
 * 取不到几何；而线条级形变要拿每条子路径的 `d` 去逐帧插值，只能从原始 SVG 正文里解析。
 *
 * ⚠️ 为什么是**内联**而不是 `import ... from '~icons/lucide/check?raw'`：
 * Vite 6 的 fs 访问守卫（`isFileLoadingAllowed`）在 Windows 上会拒绝**任何含 `~` 的 `?raw` id**，
 * 而 unplugin-icons 的 `resolveId` 恰好把 `~icons/…` 原样返回（其 `case 'vue3'` 不在返回扩展名的
 * 分支里）—— 于是 `?raw` 在本项目的 Windows 环境下一律 "Denied ID"。内联正文零构建魔法、
 * 零插件风险，代价是正文与上游成了两份拷贝。
 *
 * ⚠️ 因此正文与上游是两份拷贝，且**目前没有任何自动兜底**：此前有一条用例逐条断言这里的字符串与
 * `@iconify-json/lucide` 的 `body` 完全相等，该用例已删。上游改图标而这里没跟不会有任何提示 ——
 * 升级 `@iconify-json/lucide` 之后要人工比一遍本表。
 *
 * ⚠️ 增删条目时必须**同步** `icons.registry.ts` 的 `MORPHABLE_ICON_NAMES`：名表在首屏（决定要不要预热
 * 异步 chunk），正文在 chunk 里（决定能不能真补间），**两者错位只会表现成「某些图标永远不形变」，
 * 不会有任何报错**。
 * 只登记 **Lucide 描边类**图标：`filled` 图标没有可描边的轮廓，与描边图标形变会出现「实心 → 空心」的
 * 风格跳变，故一律不登记（缺登记退化为直接切换）。registry 现无实心标 —— `github` 原先取的是
 * simple-icons 的实心版、因此长期在名表外，2026-09-25 换成 Lucide 的描边版后才并入；将来若要引入
 * 实心标，先看它会不会与描边图标互相切换，会则不要登记。
 *
 * ⚠️ 本模块**只允许被 `iconMorphFlubber.ts` 引用**（后者又只经 `BaseIcon` 的动态 `import()` 进入），
 * 这样这些正文才会落进**异步 chunk**、不进首屏 —— 首屏预算（220KB）只剩约 30KB，
 * 18.6KB gzip 的 flubber 必须懒加载，正文自然跟着它走。若从别处静态 import 本模块，
 * 会把正文拖进首屏（`pnpm build:budget` 会拦下）。
 *
 * ⚠️ 下方整表豁免 `better-tailwindcss/no-duplicate-classes`：该规则按
 * `eslint.config.mjs` 的 `variables: [['.*', …]]` 把变量里的字符串**一律**按空白切成类名 token，
 * 于是两个 `<rect width="20" …>` 的 `width="20"` / `x="2"` 会被读成"重复类名"。这里通篇是 SVG
 * 属性串、不存在任何 Tailwind 类名；而该规则带 autofix，一旦被自动修复会直接删掉这些属性、
 * 把图标削坏 —— 故显式豁免，而不是把属性改写成不重复的形式去迎合它（先例见
 * `domains/score/preview/services/scoreFonts.ts`）。
 */
import type { IconName } from './icons.registry';

/* eslint-disable better-tailwindcss/no-duplicate-classes -- 本文件通篇是原始 SVG 正文，非 Tailwind 类名列表 */
export const ICON_MORPH_BODIES: Partial<Record<IconName, string>> = {
  'check':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5"/>',
  'plus':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14"/>',
  'x': '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/>',
  'chevron-down':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"/>',
  'server':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><path d="M6 6h.01M6 18h.01"/></g>',
  'git-branch':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/></g>',
  // 同步目标四枚之一：与 `server` / `git-branch` / `folder-sync` / `check` 在同一处菜单里互相切换，
  // 故必须与它们同画法（描边）。此前取的是 simple-icons 的**实心标**，与描边图标形变会被掏空成轮廓
  // （引擎固定 fill="none" + stroke），只能不登记；换成 Lucide 的描边版后并入。
  'github':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5c.08-1.25-.27-2.48-1-3.5c.28-1.15.28-2.35 0-3.5c0 0-1 0-3 1.5c-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5c-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></g>',
  'folder-sync':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5"/><path d="M12 10v4h4"/><path d="m12 14l1.535-1.605a5 5 0 0 1 8 1.5M22 22v-4h-4"/><path d="m22 18l-1.535 1.605a5 5 0 0 1-8-1.5"/></g>',
  // 乐谱列表排序方式的四种状态（`SidebarLeft.vue` 的排序菜单）：四个图标共用一个 <BaseIcon>，
  // 登记后才在换 name 时有补间。`list` 是纯折线（无该测量的环境里也能补间），另三个含曲线。
  'list':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/>',
  'type':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2M9 20h6"/>',
  'clock':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></g>',
  'pencil':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/>',
  // 外观设置（顶栏主题菜单）：`sun` / `moon` 是触发器那一枚的两种状态（`TopHeader.vue` 按当前主题换
  // name），`laptop` 只出现在菜单项里（跟随系统），三者在菜单内还会与勾选态的 `check` 互相切换。
  // 三个都含曲线，只有真机看得到补间。
  'sun':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></g>',
  'moon':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  'laptop':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2zm2.054 10.987H3.946"/>',
  // 密码框的明文/密文切换（`BaseInput.vue` 的眼睛按钮）：同一枚 <BaseIcon> 在 `eye` / `eye-off`
  // 之间换 name。两个都含曲线（眼形轮廓 + 瞳孔圆），只能走本档 —— 曲线靠 `<path>.getTotalLength()`
  // 采样，jsdom 里取不到该测量、退化为直接切换，只有真机看得到补间。
  // `eye-off` 比 `eye` 多一条斜杠子路径（3 条 vs 2 条），多出来的那条由引擎按文档顺序配对到
  // 「就地折叠的退化点」—— 折叠点取斜杠自身的起笔 (2,2)，故斜杠是从自己左上端点向外抻开的。
  'eye':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></g>',
  'eye-off':
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575a1 1 0 0 1 0 .696a10.8 10.8 0 0 1-1.444 2.49m-6.41-.679a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 4.446-5.143M2 2l20 20"/></g>',
  // 顶栏工作台的试听/停止（`TopHeader.vue` 的播放按钮）：`:icon` 在 `play` / `square` 之间换，
  // 落到 `ActionButton` 内容区那一枚 <BaseIcon> 的 name 上。
  // 两个都是**闭合环**（`play` 原文以 `z` 收尾、`square` 是 `<rect rx="2">` → 引擎转成带 A 弧的闭合 d），
  // 故不走「开口笔画 → 退化闭环」那条改写，直接交给 flubber 的成环插值；`play` 的圆角由 A 弧给出，
  // 按弧长采样（同前：只有真机看得到补间）。
  'play':
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  'square':
    '<rect width="18" height="18" x="3" y="3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" rx="2"/>',
};
