import { type Component, type VNode } from 'vue';

export interface ChordGroup {
  id: string;
  name: string;
  chords: ChordData[];
}

export interface ModalOptions {
  title: string;
  message?: string | VNode | Component | (() => VNode);
  confirmText?: string;
  danger?: boolean;
  autoFocus?: boolean;
}

// 链式调用句柄接口
export interface ModalHandle {
  confirm: (fn: () => void) => ModalHandle;
  cancel: (fn: () => void) => ModalHandle;
  hide: () => void;
}

/**
 * 单个和弦的数据结构
 * 直接存储指法点位和元数据，不再依赖外部 Store 索引
 */
export interface ChordData {
  /** 临时唯一标识，用于渲染时的 :key，建议使用 Date.now() 或 nanoid */
  _localId: string;
  /** 和弦名称，如 "Cmaj7", "Dadd9" */
  name: string;
  /**
   * 选中的指法点位
   * 数组长度通常为 6（对应 6 根弦），值表示品格位置
   */
  selectedFrets: number[];
  /** 变调夹位置 */
  capo: number;
  /** 录入时间，方便后续做排序或筛选 */
  createdAt: number;
}
