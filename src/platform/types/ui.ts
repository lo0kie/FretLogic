/** Toast 提示类型 */
export enum ToastType {
  INFO = 'info',
  SUCCESS = 'success',
  ERROR = 'error',
  LOADING = 'loading',
  WARNING = 'warning',
  /** 常驻中性提示：与 LOADING 一样不自动销毁，但无转圈（用于交互引导等「过程进行中但非后台任务」的提示） */
  NEUTRAL = 'neutral',
}

export interface Toast {
  id: number;
  msg: string;
  type: ToastType;
  description?: string;
  /** 操作按钮回调；存在即渲染按钮（取代原先冗余的 hasAction 布尔标记） */
  onAction?: () => void | Promise<void>;
  /** 操作按钮文案；缺省由展示层兜底 */
  actionText?: string;
  duration: number;
  closable?: boolean;
  customClass?: string;
  /** LOADING 型是否显示转圈图标；false 时退化为中性静态图标（用于非后台异步的常驻提示） */
  spinner?: boolean;
}

/** 创建 toast 的入参：id / msg / type 由 store 生成，duration 可缺省 */
export type ToastOptions = Omit<Toast, 'id' | 'msg' | 'type' | 'duration'> & { duration?: number };

/** 主题语义色：ActionButton / BaseModal 等基础组件共用的 color 联合（新增语义色只改这里） */
export type ThemeColor = 'default' | 'primary' | 'danger' | 'warning' | 'success';

/**
 * 基础组件尺寸档位：UI 原语统一语义（sm / md / lg）。
 *
 * ⚠️ 与图标尺寸档位 `IconSizePreset` 是**两套不同语义**，严禁混用：
 * - `ComponentSize` 描述控件本体大小（高度/内边距/字号）；
 * - `IconSizePreset` 描述图标边长（px）。
 * 组件内部需把 `ComponentSize` 显式映射为 `IconSizePreset`，不得直接透传。
 */
export type ComponentSize = 'sm' | 'md' | 'lg';
