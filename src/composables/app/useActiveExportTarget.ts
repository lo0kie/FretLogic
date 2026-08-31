/**
 * 将元素挂载到 uiStore.activeExportTarget（供导出预览 / 顶部操作定位容器使用）。
 * 自动在元素就绪或 KeepAlive 重新激活时注册；组件停用或卸载时若仍指向该元素则清除，
 * 收敛各视图中重复的 watch + 生命周期注册逻辑。
 */
import { useUiStore } from '@/stores/uiStore';
import { onActivated, onBeforeUnmount, onDeactivated, watch, type Ref } from 'vue';

export const useActiveExportTarget = (el: Ref<HTMLElement | null>) => {
  const uiStore = useUiStore();

  watch(
    el,
    target => {
      if (target) uiStore.activeExportTarget = target;
    },
    { immediate: true }
  );

  onActivated(() => {
    if (el.value) uiStore.activeExportTarget = el.value;
  });

  const clearIfOwned = () => {
    if (uiStore.activeExportTarget === el.value) uiStore.activeExportTarget = null;
  };

  onDeactivated(clearIfOwned);
  onBeforeUnmount(clearIfOwned);
};
