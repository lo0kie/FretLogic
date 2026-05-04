import type { ModalHandle, ModalOptions } from '@/types/chord';
import { defineStore } from 'pinia';
import { markRaw, ref, type Ref } from 'vue';

// 定义 Store 的公开接口，避免 TS 自动推导那些“不可导出”的私有类型
interface ModalStore {
  visible: Ref<boolean>;
  options: Ref<ModalOptions>;
  show: (config: ModalOptions) => ModalHandle;
  hide: () => void;
  _triggerConfirm: () => void;
  _triggerCancel: () => void;
}

// 标注返回类型为 () => ModalStore
const useModalStore = defineStore('modal', (): ModalStore => {
  const visible = ref(false);
  const options = ref<ModalOptions>({ title: '', message: '' });

  const state = {
    onConfirm: undefined as (() => void) | undefined,
    onCancel: undefined as (() => void) | undefined,
  };

  const hide = () => {
    visible.value = false;
    state.onConfirm = undefined;
    state.onCancel = undefined;
  };

  const show = (config: ModalOptions): ModalHandle => {
    options.value = {
      confirmText: '确认',
      danger: false,
      autoFocus: false,
      ...config,
      message: typeof config.message === 'object' ? markRaw(config.message as object) : config.message,
    };
    visible.value = true;

    const handle: ModalHandle = {
      confirm: fn => {
        state.onConfirm = fn;
        return handle;
      },
      cancel: fn => {
        state.onCancel = fn;
        return handle;
      },
      hide,
    };
    return handle;
  };

  const _triggerConfirm = () => state.onConfirm?.();
  const _triggerCancel = () => state.onCancel?.();

  return {
    visible,
    options,
    show,
    hide,
    _triggerConfirm,
    _triggerCancel,
  };
});

export default useModalStore;
