/**
 * 控件尺寸标尺（高度）——全工程基础输入与交互控件的**唯一真理源**。
 *
 * 桌面密集型 UI 中，按钮 / 分段控制 / 选择器 / 输入框等在同一行排布时必须分毫不差同高，
 * 因此控件高度是一个强约束的「设计标尺契约」，集中于此，禁止各组件私抄任意值。
 *
 * 档位语义（由小到大）：
 * - sm (1.6rem / 25.6px): 紧凑型 —— 浮层内工具、徽标栏、小尺寸分段器、面板折叠栏
 * - md (1.9rem / 30.4px): 标准型 —— 顶栏控件、常规表单行、菜单选项、标准按钮
 * - lg (2.3rem / 36.8px): 重点型 —— 模态底栏主操作、触控优先场景
 *
 * 模板一律通过档位名引用（CONTROL_HEIGHT_CLASSES 等），需要微调整体密度时只改本表。
 */
import type { ComponentSize } from '@/platform/types';

/**
 * 控件尺寸档位。**与 `ComponentSize` 是同一个联合，只在这里取个别名** ——
 * 原先两处各写一遍 `'sm' | 'md' | 'lg'`，加档位时漏改一处就静默分叉
 * （KeySelector 正在两者之间直传）。定义留在 `platform/types/ui.ts`（叶子模块，不反向依赖 ui），
 * 本模块只取别名。
 */
export type ControlSize = ComponentSize;

export const CONTROL_HEIGHT_PRESETS: Record<ControlSize, string> = {
  sm: '1.6rem',
  md: '1.9rem',
  lg: '2.3rem',
};

/**
 * 高度类名字典（h-[...]），供组件 size→class 映射直接使用。
 *
 * ⚠️ 这三份字典**必须写成字面量**，不能由 CONTROL_HEIGHT_PRESETS 拼出来：Tailwind 靠扫描源码
 * 取字面量生成工具类，拼字符串不会产出对应 CSS。所以「三份与标尺同源」这件事由
 * `tests/platform/controlSizes.test.ts` 逐档断言来保证 —— 改标尺而漏改字典会当场红，
 * 不靠人记得三处一起改。
 */
export const CONTROL_HEIGHT_CLASSES: Record<ControlSize, string> = {
  sm: 'h-[1.6rem]',
  md: 'h-[1.9rem]',
  lg: 'h-[2.3rem]',
};

/** 方形尺寸类名字典（h-[...] w-[...]），供 icon-only 按钮 / 悬浮按钮等方块控件使用 */
export const CONTROL_SQUARE_CLASSES: Record<ControlSize, string> = {
  sm: 'h-[1.6rem] w-[1.6rem]',
  md: 'h-[1.9rem] w-[1.9rem]',
  lg: 'h-[2.3rem] w-[2.3rem]',
};

/**
 * 最小高度类名字典（min-h-[...]）。
 *
 * 供「高度由内容决定、但不得低于控件标尺」的容器使用（模态 / 抽屉头部右侧的操作区：
 * 里面是 icon-only 按钮，标尺高度由按钮给出，容器只要不塌即可）。此前这两处各写一遍
 * `min-h-[1.6rem]`，与标尺的 sm 档是同值不同源，改标尺不会带着它们改。
 */
export const CONTROL_MIN_HEIGHT_CLASSES: Record<ControlSize, string> = {
  sm: 'min-h-[1.6rem]',
  md: 'min-h-[1.9rem]',
  lg: 'min-h-[2.3rem]',
};
