/**
 * 级联子菜单的「祖先滚动即收起」全局守卫。
 *
 * 为什么需要：滚轮滚动不派发 mouseover / mouseleave —— 指针停在原地、列表内容滚走，已展开的子面板
 * 会跟着它的触发元素被 floating-ui 重新定位到视口上/下边缘之外，直到指针移到另一个条目才被互斥关闭。
 * 故需在捕获阶段监听滚动（scroll 不冒泡，但捕获阶段会沿祖先链传播），命中「滚动容器是本层菜单面板的
 * 祖先」时立即收起。
 *
 * 为什么收敛成全局唯一监听：此前由**每个菜单实例**各挂一条常驻 window 监听，而每个和弦卡片都带一个
 * 菜单，监听数随卡片数线性增长；且绝大多数实例当时并没有展开的子面板，handler 第一行就空转返回。
 * 现改为「全局唯一监听 + 当前已展开子面板的登记表」：只在子面板展开期间登记、收起即注销，
 * 登记表清空后连监听本身也一并摘掉，因此没有子面板展开时页面上不存在任何空转监听。
 *
 * 与 `platform/ui/focus-ring/focusRingOverlay.ts` 同模式（全局行为只接线一处、消费方只做声明），
 * 差别是**不在装配层主动挂接**：它只在「有子面板展开」时才有意义，惰性挂接比常驻更贴合其生命周期。
 */
interface SubmenuScrollGuard {
  /** 本层菜单面板根节点：滚动事件的 target 包含它，才说明这次滚动会带动本层菜单 */
  root: HTMLElement;
  /** 收起本层已展开的子面板 */
  close: () => void;
}

const guards = new Set<SubmenuScrollGuard>();
/** 当前那条全局监听的摘除函数；null 表示未挂接 */
let detachScrollGuard: (() => void) | null = null;

const onScrollCapture = (e: Event) => {
  const { target } = e;
  if (!(target instanceof Node)) return;
  // 快照后遍历：close() 会顺带注销自己（改的是同一个 Set），快照可避免遍历期间结构变化
  for (const guard of [...guards]) {
    if (!guard.root.isConnected) continue;
    if (target.contains(guard.root)) guard.close();
  }
};

const attachScrollGuard = () => {
  if (detachScrollGuard || typeof window === 'undefined') return;
  window.addEventListener('scroll', onScrollCapture, true);
  detachScrollGuard = () => {
    window.removeEventListener('scroll', onScrollCapture, true);
    detachScrollGuard = null;
  };
};

/**
 * 登记一个「本层菜单有子面板展开」的守卫，返回注销函数（收起 / 卸载时调用）。
 * 首次登记挂接全局监听；最后一名注销后监听随之摘除。
 */
export const registerSubmenuScrollGuard = (guard: SubmenuScrollGuard): (() => void) => {
  guards.add(guard);
  attachScrollGuard();
  return () => {
    guards.delete(guard);
    if (guards.size === 0) detachScrollGuard?.();
  };
};
