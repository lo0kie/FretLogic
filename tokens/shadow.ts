/**
 * 多层盒阴影 → CSS 值。
 *
 * 层间用 `, ` 分隔；几何与颜色同格式产出——阴影里的 rgba 也是颜色，与其他颜色走同一个 formatRgba，
 * 于是「改投影浓度」只需改 alpha 数字，不必去拼字符串。
 */
import { formatRgba, parseRgb } from './color';

import type { ShadowLayer } from './types';

/** 长度输出：0 不带单位（现状写作 `0 1px 3px` / `0 0 0 1px`，非 0 才带 px） */
const length = (value: number): string => (value === 0 ? '0' : `${value}px`);

export const formatShadow = (layers: readonly ShadowLayer[]): string =>
  layers
    .map(layer => {
      const geometry =
        layer.spread === undefined
          ? `${length(layer.x)} ${length(layer.y)} ${length(layer.blur)}`
          : `${length(layer.x)} ${length(layer.y)} ${length(layer.blur)} ${length(layer.spread)}`;
      return `${geometry} ${formatRgba(parseRgb(layer.color), layer.alpha)}`;
    })
    .join(', ');
