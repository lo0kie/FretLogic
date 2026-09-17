/**
 * 浮层（BasePopover）全局注册表：
 * 登记当前所有打开中浮层的关闭函数，供容器滚动、路由切换等场景的联动关闭。
 * 与右键菜单互斥注册表不同：浮层允许多实例（含嵌套子浮层）并存，全局关闭即全部关闭。
 */

/** 调试日志开关（仅开发期）：生产构建替换为字面量 false，下方日志分支被摇掉 */
const IS_DEV = import.meta.env.DEV;

interface OpenPopoverEntry {
  close: (reason?: string) => void;
  /**
   * 该浮层的锚点元素（触发器；虚拟锚点模式下则是承载右键的真实触发元素）。
   * 登记时取不到最终元素（浮层挂载前后引用会变），故存取值函数而非元素本身。
   */
  getAnchor: () => HTMLElement | null;
}

/** 打开中浮层的条目集合 */
const openPopovers = new Set<OpenPopoverEntry>();

/** 登记打开中浮层；getAnchor 省略时该浮层不参与「按容器」的精确关闭 */
export const registerOpenPopover = (close: (reason?: string) => void, getAnchor?: () => HTMLElement | null) => {
  openPopovers.add({ close, getAnchor: getAnchor ?? (() => null) });
};

/** 移除登记（关闭或卸载时调用）：按关闭函数身份删除，与是否登记锚点无关 */
export const unregisterOpenPopover = (close: (reason?: string) => void) => {
  for (const entry of openPopovers) {
    if (entry.close === close) openPopovers.delete(entry);
  }
};

/** 关闭全局所有打开中的浮层（无打开浮层时空操作；close 自带幂等守卫，父子嵌套重复关闭安全） */
export const closeAllPopovers = () => {
  if (IS_DEV && openPopovers.size) console.debug(`[popoverRegistry] closeAllPopovers，关闭 ${openPopovers.size} 个`);
  for (const entry of [...openPopovers]) {
    entry.close('registry:close-all');
  }
};

/**
 * 只关闭**锚点落在指定容器内**的浮层。
 *
 * 「滚动即关闭」必须是这个语义，而不是关掉所有浮层：浮层锚在滚动容器**之外**的常驻元素上时
 * （例如侧边栏顶部的排序/筛选菜单，锚点在工具栏、与滚动区是兄弟节点），内容滚动根本不会
 * 让它错位，无差别关闭却会把它一起收掉 —— 表现为「鼠标压根没移出，菜单自己关了」。
 *
 * 锚点取不到（虚拟锚点且无 contextTriggerEl）时不关闭：宁可留着，也不误伤。
 */
export const closePopoversWithin = (container: HTMLElement | null | undefined) => {
  if (!container) return;
  for (const entry of [...openPopovers]) {
    const anchor = entry.getAnchor();
    if (anchor && container.contains(anchor)) {
      if (IS_DEV) {
        console.debug('[popoverRegistry] 滚动容器联动关闭：锚点落在容器内', {
          container: `${container.tagName}.${String(container.className).slice(0, 60)}`,
          anchor: `${anchor.tagName}.${String(anchor.className).slice(0, 60)}`,
        });
      }
      entry.close('registry:scroll-within');
    }
  }
};
