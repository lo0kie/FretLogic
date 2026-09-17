import { onActivated, onDeactivated, ref } from 'vue';

/**
 * KeepAlive 激活态可见性：宿主被 KeepAlive 缓存切走时隐藏、切回时恢复。
 * 与组件自身的 visible prop 共同决定最终显示（各组件自行 computed 合并）。
 */
export function useKeepAliveVisible() {
  // 初始为 true：保证首次挂载（含 KeepAlive 初始激活）即可见
  const isViewActive = ref(true);
  onActivated(() => {
    isViewActive.value = true;
  });
  onDeactivated(() => {
    isViewActive.value = false;
  });
  return isViewActive;
}
