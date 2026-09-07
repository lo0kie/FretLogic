/**
 * 浮层（BasePopover）全局注册表：
 * 登记当前所有打开中浮层的关闭函数，供容器滚动、路由切换等场景的联动关闭。
 * 与右键菜单互斥注册表不同：浮层允许多实例（含嵌套子浮层）并存，全局关闭即全部关闭。
 */

/** 打开中浮层的关闭函数集合 */
const openPopoverCloseFns = new Set<() => void>();

/** 登记打开中浮层的关闭函数 */
export const registerOpenPopover = (close: () => void) => {
  openPopoverCloseFns.add(close);
};

/** 移除登记（关闭或卸载时调用） */
export const unregisterOpenPopover = (close: () => void) => {
  openPopoverCloseFns.delete(close);
};

/** 关闭全局所有打开中的浮层（无打开浮层时空操作；close 自带幂等守卫，父子嵌套重复关闭安全） */
export const closeAllPopovers = () => {
  for (const close of [...openPopoverCloseFns]) {
    close();
  }
};
