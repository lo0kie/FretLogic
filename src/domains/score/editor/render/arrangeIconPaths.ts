/* eslint-disable better-tailwindcss/no-duplicate-classes -- 本文件只有 SVG 路径数据（见下）。
   该规则把字符串按空白切开后逐段当类名比对，而路径指令里 `2` / `0` / `1` 反复出现、必然判重。
   路径只能写成一条完整指令串（拆开就画不出连续路径），故整文件关掉这条规则 —— 边界很清楚：
   本文件不产出任何 class。 */
/**
 * 排列区 canvas 用到的图标路径（lucide 的 24×24 视口、stroke-width 2 口径）。
 *
 * 与 DOM 版用的是**同一套字形**（`plus` / `trash-2`），这样从 DOM 换成 canvas 之后图标不会变形。
 * 单独成文件而不是写在 painter 里：路径数据是一长串指令，夹在绘制逻辑中间既难读，
 * 也会让上面那条「路径不是 class 串」的例外注释跟着到处跑。
 */

/** `plus`：加号（行首 / 行尾添加槽） */
export const PLUS_ICON_PATH = 'M5 12h14M12 5v14';

/** `trash-2`：垃圾桶（行末删除钮与槽上的清除钮共用） */
export const TRASH_ICON_PATH =
  'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6';
