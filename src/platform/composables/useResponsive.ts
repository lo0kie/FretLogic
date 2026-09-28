import { breakpointsTailwind, useBreakpoints } from '@vueuse/core';

/**
 * 全局统一响应式断点状态组合式函数
 *
 * 状态：**①③ 已接入视图，② 仍未开工**（①③ 落地于 2026-09-27，见下）。
 *
 * 到期条件（判一次就够，别每轮审计重新论证一遍）：下面三项**全部**未开工时本文件保持现状；
 * 任一项落地则改为「按该项接入 + 补单测」；三项都已明确不做（或改用纯 CSS 断点方案）时，
 * 本文件应被**删除**，而不是继续留白。
 *  ① 顶栏图标在窄屏的收纳 → 已接入：`TopHeader` 按 `< lg`（1024px）驱动「品牌文字与左右分隔线收起、
 *     导航转 icon-only、右侧偏好图标并入「更多」菜单」；乐谱 Tab 栏另按**实测**判「顶栏装不装得下它」，
 *     装不下才流内独占一行（见该组件的 isTabRowOwnLine）；
 *     右组还有更窄的一档折叠（< 480px，把非主操作的按钮也收进「更多」，见 isActionFold）——
 *     那个阈值同样留在 TopHeader 内：Tailwind 标准断点在 sm(640) 之下没有档位，而它是几何算出来的
 *     「这一行装不下」的结果、不是布局断点。
 *     收纳档取 lg 而非 `isMobile` 的 md（2026-09-28 改）：宽档下两组各占半幅、而右组内容实测 490px，
 *     半幅 ≥ 490 要到 ≈1025px 才成立 —— 768~900px 那一段两组会正面压在一起（用户报的「按钮和分段控制
 *     重叠」），且这一段本就是抽屉模式。改后 `< md` 只管 `isMobile`（浮层 / 表单 / 预览缩放等）。
 *  ② 工作台右侧面板从固定 w-72 改为可收起 → **仍未开工**。
 *  ③ 侧栏在小屏切抽屉模式 → 已接入：`SidebarLeft` 用 `isDrawerMode`（< lg，1024px）切覆盖式浮层 +
 *     遮罩 + 点外部 / Esc 关闭，`App.vue` 的 `main` 在同一判据下不再让位。
 * 覆盖见 `tests/ui/composables/useResponsive.test.ts`（阈值是项目决策，值得钉住）。
 *
 * 2026-09-27 审计补记（免得下次又论证一遍）：**工作台指板区**的窄屏适配**没有走本文件**，改用量实测画布宽度
 * 判「并排装不下就堆叠」。原因：主内容区 = 视口 − 左侧栏（344px），同一个视口宽度下侧栏开着与否
 * 差 344px，媒体查询看不见这个差 —— 1024px 视口开着侧栏时主区只剩 680px，按 lg 判并排会把指板卡
 * 压到 87px。故上面第 ② 项**仍未开工**（用户手动收起面板列是另一件事，本次只做了自动堆叠）；
 * 真要做 ② 时，判据同样得用量而不是断点。
 *
 * 与①③的区别在于**判据的性质**：侧栏宽度是「相对视口」的量（侧栏恒占 344px 视口宽度、与内容区多宽无关），
 * 媒体查询正好量得准；指板卡要装的是**内容区**的宽度，视口量不到，只能实测。
 * ① 夹在两者之间：顶栏横跨的是**应用宽度**，而应用宽度 = max(视口, `body` 的 `min-width`
 * ——见 src/assets/token-vars.scss 的 $app-min-width，语义是「低于此宽度不再收缩、改为横向滚动」）。
 * 这个 min-width **2026-09-27 已从 1024px 放开到 320px**：此前手机视口（390px 上下）会拿到一份 1024px 宽的
 * 文档，浏览器按「内容宽于视口」把整页缩到约 0.38× 显示，控件跟着缩到 ~16px（现象即「移动端控件都太小了」）。
 * 放开后应用宽度与视口宽度在 ≥ 320px 时**恒等**（320 是手机视口的下限），媒体查询量到的视口宽度因此
 * 就等于顶栏宽度 —— ① 这一项的判据可以放心用断点，不必像②那样改成实测。
 * 反过来，这也正是乐谱 Tab 栏曾被误判成「装不下、该落到第二行」的根因：当时判据按视口取，而顶栏实际
 * 有 1024px 可用，前提根本不成立。判据本身没错，错在 min-width 让「视口 ≠ 应用宽度」。
 *
 * 基于 Tailwind 标准断点：
 * - sm: 640px
 * - md: 768px
 * - lg: 1024px
 * - xl: 1280px
 * - 2xl: 1536px
 */
export function useResponsive() {
  const breakpoints = useBreakpoints(breakpointsTailwind);

  /** 是否移动端窄屏视口（< 768px） */
  const isMobile = breakpoints.smaller('md');

  /** 是否平板/中等视口（768px ~ 1023px） */
  const isTablet = breakpoints.between('md', 'lg');

  /** 是否桌面普通及以上视口（>= 1024px） */
  const isDesktop = breakpoints.greaterOrEqual('lg');

  /** 是否宽屏桌面视口（>= 1280px） */
  const isWide = breakpoints.greaterOrEqual('xl');

  /** 是否小于桌面断点（< 1024px，用于触发侧边栏抽屉模式与移动布局） */
  const isDrawerMode = breakpoints.smaller('lg');

  return {
    breakpoints,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    isDrawerMode,
  };
}
