import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';

import { useMediaQuery } from '@vueuse/core';

import { canHover } from '@/platform/composables/useCanHover';
import { useResponsive } from '@/platform/composables/useResponsive';
import { observeResizeTree } from '@/platform/utils/dom';

/**
 * 顶栏的**几何判据**：三个宽度档 + 一个实测判据。
 *
 * 四条不变量（改动本文件前先读这四条）：
 * 1. **「装不装得下」是几何结果，不是断点** —— `isTabRowOwnLine` 由实测宽度得出，宽屏也逐帧响应式。
 * 2. **`isNarrow` 取 lg（1024px）而不是 `useResponsive` 的 `isMobile`（768px）**：理由见其 JSDoc。
 * 3. **初值必须显式取 `.value`** —— `breakpoints.smaller()` 返回只读 computed，`ref()` 收到 ref 时
 *    原样返回它，写成 `ref(breakpoints.smaller('lg'))` 会得到一个只读 ref，赋值被静默拒绝。
 * 4. **观察时机**：`observeResizeTree(header)` 之外还补一次 `document.fonts.ready`，理由见 measureTabRow 上方。
 */
export function useHeaderLayout() {
  /**
   * 设置浮层的触发方式：仅在设备**有悬停能力**时才用 hover。
   * 触屏上不存在 hover 态，hover 触发只能靠浏览器在 tap 时合成的 mouseenter 侥幸生效，
   * 而"钉住/关闭"还依赖合成的 mouseleave——不同内核表现不一致，设置入口可能根本进不去。
   * 用 (hover: hover) 而不是 (pointer: coarse)：二合一设备接上鼠标后是 hover，不会误降级。
   *
   * 判据与查询串都走单一来源（platform/composables/useCanHover ← platform/utils/motion 的
   * `HOVER_MEDIA_QUERY`），不在本文件另写 —— 全站「这台设备有没有悬停能力」只有一个答案。
   */

  /**
   * 顶栏**紧凑档**判据（< lg，1024px）：顶栏收起装饰与低频入口 —— 品牌文字、左右两条分隔线、导航转 icon-only、
   * 右侧偏好图标并入「更多」菜单。
   *
   * 取 lg，而**不是** `useResponsive` 的 `isMobile`（< md，768px）：装不装得下是**几何结果**，与「是不是移动端」
   * 无关。宽档（品牌文字 + 导航文字标签 + 右组 8 枚图标 + 两条分隔线）下两组各占半幅（`basis-1/2`，
   * 理由见模板里那两处宽度档的注释），而右组内容实测 **490px**（8 × 42.3 图标 + 2 条分隔线 + 9 × `gap-xs` 16.4）、
   * 左组 374px —— 半幅只给（视口 − 2 × `px-4`）/ 2，于是 768~900px 这一段两组各自越出半幅、正面压在一起：
   * 2026-09-28 逐宽度实测「左组内容右缘 − 右组内容左缘」= 768px **+140.2**、800px +108.2、850px +58.2、
   * 880px +28.2、900px 仍 +8.2，≈910px 才归零（截图即用户报的「按钮和分段控制重叠」）。
   * 半幅 ≥ 490 要到 ≈1025px 才成立，故宽档真正安全的起点就是 lg；1024px 时两组内容间距实测余量 115.8px。
   * 与 `isDrawerMode`（< lg 切侧栏抽屉）同档也是好事：这一段的侧栏已是浮层、整体本就是移动式布局，
   * 导航转 icon-only 与之一致，不必再引第二个魔法数。
   * 紧凑档下两组内容合计 ≈ 416px（左 134.7 + 右 281.4），到 320px（`$app-min-width`）都装得下。
   *
   * 判据取**视口**宽度即可：`body` 的最小宽度已放开到 320px（src/assets/token-vars.scss 的
   * $app-min-width），故视口 ≥ 320 时应用宽度就等于视口宽度，顶栏亦然（它横跨应用宽、不受侧栏占位影响）。
   */
  const { breakpoints } = useResponsive();

  const isNarrow = breakpoints.smaller('lg');

  /**
   * 乐谱 Tab 栏**独占一行**的判据：顶栏装不下「左组 + 居中 Tab 栏 + 右组」时。
   *
   * 判据是**量出来的**，不是断点。历史上这里取 `lg`（1024px），依据是三段自然宽的估算
   * （左组 279px、右组 312px（dev 构建多两枚图标 ≈ 359px）、Tab 栏 284px → 阈值 ≈ 952~1000px，
   * 正好落在 lg 上）；但估算与真实渲染对不上 —— dev 构建 1024~1100px 这一段居中就会把 Tab 压在图标上，
   * 而右组的宽度还会随路由（工作台 / 乐谱的动作按钮不同）与构建档变化，断点看不见这些。
   * 故改为量出来再定：**宽屏也逐帧响应式**，宁落一行也不把 Tab 压到图标上。
   *
   * 量的是「Tab 控件实际占的横向区间」与「左右两组各自**内容**的边缘」——量内容而不是组的盒：
   * 宽档下两组都是 `basis-1/2`、各占半幅，盒宽与内容宽无关，量盒宽得不出「装得下装不下」。
   * 控件取它自己的 rect 而不是本栏的：本栏居中态是绝对铺满、独占一行时是 `basis-full`，量它没有意义；
   * 而控件两态都由 `justify-center` 居中、锚点相同，故判据在两种布局之间自洽
   * （不会「落一行之后又觉得自己装得下」来回翻）。
   *
   * 初值仍取 `lg`：首帧在测量之前先按它铺一帧，而 `lg` 是标准断点里最接近真实阈值（dev 构建实测
   * 约 1341px）的一档；`onMounted` 里同步量一次并在同一批微任务内落定 —— 首屏不会闪一次错布局。
   *
   * **初值必须显式取 `.value`**：`breakpoints.smaller('lg')` 返回的是只读 `ComputedRef`，
   * 而 `ref()` 收到一个 ref 时**原样返回它**（不另包装）—— 写成 `ref(breakpoints.smaller('lg'))`
   * 拿到的仍是那个只读 computed，`measureTabRow` 的赋值会被 Vue 静默拒绝（控制台只留一条
   * 「Write operation failed: computed value is readonly」），判据于是永远停在 `lg` 上、实测形同虚设。
   * 这条坑没有类型错误、没有运行时报错，只有那一行 warning —— 改这里时别把 `.value` 去掉。
   */
  const TAB_ROW_MIN_GAP = 16;

  const headerRef = useTemplateRef<HTMLElement>('headerRef');
  const leftGroupRef = useTemplateRef<HTMLElement>('leftGroupRef');
  const rightGroupRef = useTemplateRef<HTMLElement>('rightGroupRef');
  const tabRowRef = useTemplateRef<HTMLElement>('tabRowRef');

  const isTabRowOwnLine = ref(breakpoints.smaller('lg').value);

  /**
   * 一组**内容**在横向上的边缘（视口坐标 px）：取它最靠边那个成员的边，跳过零尺寸成员
   * （`v-if` 关掉的分隔线会留在 children 里）。返回 null 表示这一组量不出内容。
   */
  const groupContentEdge = (group: HTMLElement, side: 'start' | 'end'): number | null => {
    let edge: number | null = null;
    for (const child of group.children) {
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const value = side === 'start' ? rect.right : rect.left;
      edge = edge === null ? value : side === 'start' ? Math.max(edge, value) : Math.min(edge, value);
    }
    return edge;
  };

  /**
   * 重测「Tab 栏该不该独占一行」。
   *
   * Tab 栏不在本路由（非乐谱页）时直接返回，**保留上一次的判定**：那几帧里量不到 Tab 宽度，
   * 若按「量不出 = 装得下」落定，切回乐谱页的首帧就会先按居中铺一帧再翻。
   */
  const measureTabRowNow = () => {
    const header = headerRef.value;
    const left = leftGroupRef.value;
    const right = rightGroupRef.value;
    const row = tabRowRef.value;
    // 控件是本栏唯一的流内子项：量它才是量 Tab 本身
    const control = row?.firstElementChild as HTMLElement | null | undefined;
    if (!header || !left || !right || !control) return;

    const controlRect = control.getBoundingClientRect();
    const leftEdge = groupContentEdge(left, 'start');
    const rightEdge = groupContentEdge(right, 'end');
    if (controlRect.width <= 0 || leftEdge === null || rightEdge === null) return;

    const center = controlRect.left + controlRect.width / 2;
    const half = controlRect.width / 2 + TAB_ROW_MIN_GAP;
    isTabRowOwnLine.value = center - leftEdge < half || rightEdge - center < half;
  };

  /**
   * 合帧版重测：`observeResizeTree` 一帧内可能回调多次（顶栏盒宽 + 三个直接子元素 + 子树增删
   * 可能同批到达），而每次重测都要读一串 `getBoundingClientRect`（强制同步布局）——
   * 合并到一帧只测一次，避免滚动/缩放时在同一帧里反复触发重排。
   */
  let measureRaf = 0;
  const measureTabRow = () => {
    if (measureRaf !== 0) return;
    measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      measureTabRowNow();
    });
  };

  // 重测时机：`observeResizeTree(header)` —— 顶栏盒宽（窗口缩放、侧栏让位）、三个直接子元素（两组 + Tab 栏）
  // 的盒尺寸，以及子树里的增删 / 文本变化。后两者覆盖「路由切换换了动作按钮」「dev 构建多两枚图标」这类
  // **不改顶栏宽度**的变化 —— 只观察顶栏会漏掉它们（组的盒宽由 flex-basis 定死、不随内容动）。
  // 另补一次 `document.fonts.ready`：Tab 控件与导航标签的宽度都随字体变（首帧可能还在用回退字体），
  // 而控件是「组的孙元素」、不在观察集里（observeResizeTree 只到直接子元素一层），字体到位不会自动触发。
  // 收敛性：翻转只改类名（不产生 childList / 盒尺寸之外的新信号），且判据在两种布局间自洽，
  // 故顶栏高度变化带来的那一次复测会得到同一结论，不会来回翻。
  let stopHeaderObserve: (() => void) | null = null;

  onMounted(() => {
    const header = headerRef.value;
    if (!header) return;
    // 同步量一次：此刻 DOM 已落定、浏览器尚未绘制，写回的值与首帧渲染在同一批微任务里生效
    measureTabRowNow();
    stopHeaderObserve = observeResizeTree(header, measureTabRow);
    // 字体到位后补测一次（理由见上）；组件已卸载时 measureTabRow 会因 ref 为 null 直接返回
    void document.fonts?.ready.then(() => measureTabRow());
  });

  onBeforeUnmount(() => {
    stopHeaderObserve?.();
    stopHeaderObserve = null;
    if (measureRaf !== 0) {
      cancelAnimationFrame(measureRaf);
      measureRaf = 0;
    }
  });

  /**
   * 右组**折叠**的判据（< 480px）：顶栏「左组 + 右组」这一行装不下时，把右组里非主操作的动作
   * 收进「更多」菜单 —— 否则两组会各自占一行，连乐谱 Tab 栏一起把顶栏撑成三层（2026-09-27 的现象）。
   *
   * 阈值同样是算出来的，不是随手取的断点：左组（侧栏开关 1.9rem + gap-xs + 导航分段器，
   * 分段器自带 `p-1` 与 1px 描边）≈ 138px，顶栏左右留白 `px-md` × 2 ≈ 33px，
   * 右组每枚图标钮 1.9rem ≈ 42.3px、项间 `gap-2xs` ≈ 5.6px。
   * 未折叠时右组最多 6 枚（乐谱路由）→ 6 × 42.3 + 5 × 5.6 ≈ 281px，合计 ≈ 452px；工作台 5 枚 ≈ 405px。
   * 取 480px 作阈值，给最宽的那一档留 ~28px 余量。
   * 折叠后右组恒为 3 枚（页内主操作 + 设置 + 更多）→ ≈ 309px，于是到 320px（`$app-min-width`）都装得下。
   *
   * 不走 useResponsive：Tailwind 标准断点里 640(sm) 之下没有更窄的档，而 480 是「这一行装不下」
   * 的几何结果、不是布局断点 —— 与 isTabRowOwnLine 同理，都留在本 composable 内，不去扩 useResponsive 的契约。
   * 也不写成 rem：媒体查询里的 rem 认的是浏览器初始字号（16px），与项目根字号 22.25px 无关，写 px 更直白。
   */
  const isActionFold = useMediaQuery('(max-width: 480px)');

  return { canHover, isNarrow, isActionFold, isTabRowOwnLine, headerRef, leftGroupRef, rightGroupRef, tabRowRef };
}
