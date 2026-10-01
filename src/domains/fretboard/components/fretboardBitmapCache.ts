/**
 * 指板位图缓存 —— 必须活在**模块作用域**，不能写进组件的 `<script setup>`：
 * `<script setup>` 的每条语句都会被编译进 setup()，在那里声明会退化成「每个组件实例各持一份缓存」，
 * 而实例卸载时既不反注册也不清空 → 注册表按同名聚合成百上千条、位图被闭包钉住无法回收。
 * 放在独立模块里，所有实例共享同一份。
 *
 * 缓存内容是**主体层**（网格线 / 空弦静音标记 / 横按梁 / 按弦圆点，见 renderFretboardBody）。
 * 它的 key 里没有和弦名、简写，也没有显示尺寸，因为：
 *  1. 名字属「名字层」、品号与弦枕属「品号层」，每次绘制现画。改名、切「符号简写」、
 *     换品位窗口都不再作废位图 —— 原先「切简写整屏重画、128 名额被死条目吃满」
 *     就是这么来的；
 *  2. **「画不画名字」与「名字占不占位」是两件事**：前者属名字层，后者才是几何。要隐藏名字的
 *     消费方（变体面板 / 和弦库模态框）传 hide-chord-name + reserve-chord-name，几何便与
 *     picker 完全一致 → 命中同一批条目；FretboardCanvas 再按 layout.nameReserveH 裁掉预留段，
 *     视觉不变。（不传 reserve-chord-name 时缺省跟随「和弦名是否显示」，即改造前的紧凑几何，
 *     故既有调用零影响。）
 *     **几何类开关（含品位窗口）不必逐列进 key**：key 的几何段直接由布局产物拼出（见
 *     FretboardCanvas 的 getCacheKey），弦枕位就是几何 —— 弦枕画了才占位（判据见 nutIsDrawn），
 *     零品窗口那张图比偏移窗口那张多一条弦枕、网格顶与整图高度都不同，布局值随之变、key 自然
 *     跟着变。这是「空弦标记上下两段留白在所有窗口里都同值」的代价：换来的是偏移窗口不再凭空
 *     多出一整条弦枕的空白；
 *  3. 位图按固定参考分辨率（CACHE_PX_PER_UNIT）渲染，显示时由 drawImage 缩放到目标尺寸。
 *     于是同一指板状态只有一张位图：picker（1.6×）/ 乐谱**编辑器槽位**（1.4×缩放）/ 工作台导出
 *     面板与变体面板，无论各自显示多大都命中同一批条目 —— 条目数 = 指法数，而不是
 *     「指法 × 尺寸档数」，尺寸维度带来的整屏换血（拖缩放滑杆 = 120 写 + 120 淘汰）随之消失。
 *     （唯一例外：工作台导出面板把配色钉死在背景上，应用主题与背景明暗不一致时是另一张图。）
 * 容量 256：条目数 = 指法数（尺寸维度已被合并掉），故这里实际是「同时被画过的指法数上限」。
 * 单个乐库的指法量级（几百）之下留足余量，配合固定参考分辨率，稳态即命中全满、不再抖动。
 * 代价是内存上限随容量线性上升：单条 5 品指板约 0.38MB（口径见 REFERENCE_DISPLAY_SCALE），
 * 256 条封顶约 98MB（实测平均指板更小，约 280KB/条 → 约 70MB）。本参数是「抗淘汰」的、
 * 不是「省内存」的；要压内存请动 REFERENCE_DISPLAY_SCALE，不要靠缩小容量去换 churn。
 *
 * 【只服务主线程 DOM 侧，与乐谱「导出 / 分页预览」不是同一实例】
 * 乐谱分页预览与导出由渲染线程整页渲染（scoreExportWorker 的 fretboardRasterCache），
 * 那边位图是「主体 + 和弦名 + 品号」整条光栅，键里必须带和弦名、fretOffset 与「和弦缩放」后的
 * 几何，再与页面 PIXEL_RATIO 1:1 贴图；本缓存相反 —— 只存主体层（名字层/品号层每次现画）、
 * 固定参考分辨率存一份、显示时缩放。两者粒度都不同，故同一指板在两侧各光栅化一次、各占一份内存，
 * 互不命中，这是当前设计的结果。主线程消费方：ChordPickerPanel / ChordModalsContainer /
 * WorkbenchExportPanel / WorkbenchVariantsPanel。
 *
 * ⚠️ 乐谱排列区**不在**这份清单里：它自 2026-10-01 起改为逐行 canvas 直接绘制
 *（`renderFretboard`，不经 `FretboardCanvas` 组件），故不消费本位图缓存 —— 每行 canvas 自己持有
 * 位图，并只在行内容 / 缩放 / 状态变化时重绘。
 *
 * 【内存配额】位图缓存另设一条字节口径上限，与上面的条数上限**并列**生效，任一先到即驱逐。
 *
 * 补这条口径的原因：条数只说得出「同时画过多少张」，说不出「占了多少内存」。单条按 w×h×4 算，
 * 5 品指板约 0.38MB、24 品指板能到 2MB 以上（差一个量级），于是同样 256 条，真实占用可在
 * 70MB 到 500MB 之间漂 —— 配额把天花板钉在字节上，条目多大都不越界。
 *
 * 96MiB 的来由：约等于上面「容量 256」那段估出的最坏值（256 条 × 单条 5 品 0.38MB ≈ 98MB）。
 * 实测平均约 280KB/条（256 条 ≈ 70MB），故常规尺寸下配额**不介入**、不新增淘汰；
 * 只有条目显著偏大（长品窗 / 高 DPR）时才提前挡一刀。它是一道显式的内存天花板，
 * 不是一次「顺手压内存」的收紧 —— 要主动降内存仍请动 REFERENCE_DISPLAY_SCALE，
 * 不要靠调小本值去换 churn（理由见上）。
 */
import { createLruCache } from '@/platform/utils/cache';
import { isFunction } from '@/platform/utils/common';

import { renderFretboardBody } from './renderFretboardCanvas';

import type { RenderFretboardOptions } from './renderFretboardCanvas';

const BITMAP_CACHE_MAX_BYTES = 96 * 1024 * 1024;

const bitmapCache = createLruCache<ImageBitmap | HTMLCanvasElement>(256, {
  name: '指板位图',
  // 位图本体即解码后的 RGBA 像素：w×h×4 字节（开发面板字节读数 + 内存配额口径）
  weigh: (_, item) => item.width * item.height * 4,
  maxBytes: BITMAP_CACHE_MAX_BYTES,
  onEvict: (_key, item) => {
    if ('close' in item && isFunction(item.close)) item.close();
  },
});

// 本模块被 HMR 替换时即刻归还旧缓存里的位图（close 底层内存），但**不反注册**：
// HMR 未必会让已挂载的组件实例重建（找不到实例时 reload 被跳过），它可能继续用旧模块闭包里的
// 这份缓存读写 —— 一旦反注册，那之后的写入就全部进不了开发面板（表现为「指板位图永远是 0」）。
// 注册表那边刻意**保留**同名多份（`registerCache` 的注释：登记时移出旧条目会让在用的那份
// 在面板上彻底消失），由 `listCaches` 挑「最近活跃」的一份展示、`clear` 逐份下发，
// 故热替换残留不会让读数错位，也不需要这里去替它收尾。
if (import.meta.hot) import.meta.hot.dispose(() => bitmapCache.clear());

/** 设备像素比下限：低于此值的屏幕也按此倍数渲染，保证 1x 屏的线条不发虚 */
export const DPR_FLOOR = 2.5;
/**
 * 位图参考分辨率（物理像素 / 逻辑像素）：与「当前显示多大」无关，显示时再缩放到目标尺寸。
 *
 * **这是全模块唯一一处「用清晰度换内存」的旋钮**，因为位图内存按本值的**平方**增长：
 * 由 1.6（4.0 px/单位）降到 1.4（3.5）后，单张 5 品指板 0.5MB → 0.38MB，
 * 256 条封顶 128MB → 98MB，**省 23%**；代价是各消费方由「接近 1:1」转为轻量上采样：
 *  - 乐谱编辑器槽位（1.4）：恰好 1:1，零重采样；
 *  - picker（1.6，唯一「一屏 120 张」的消费方）：约 1.14 倍；
 *  - 工作台（变体面板 / 导出预览）与「指法删除」弹窗（1.8）：约 1.29 倍；
 *  - 乐谱槽位到「和弦缩放 150%」时（1.4 × 1.5 = 2.1）：约 1.5 倍 —— 线条略软，肉眼基本无感。
 *
 * **继续往下只有一档可走（1.2 / 3.0 px/单位，再省 26%），之后就得不偿失**：
 * 判据是「缓存分辨率 ≥ DPR_FLOOR × 消费方缩放」，低于即全线上采样。
 * 最细的元素是**网格线（1 逻辑px）**，它在本值下只有 3.5 物理px；
 * 降到 1.2 后 picker 要放大 1.33 倍、工作台 1.5 倍，网格线的抗锯齿过渡带开始被肉眼分辨
 * （圆点 7.6px 直径、横按梁、弦枕都还富余 2 倍以上，不受影响）；
 * 降到 1.0（2.5）时槽位也要放大 1.4 倍，线条会出现「雾感」，不建议。
 * 上采样本身走的是高质量插值（合成时 imageSmoothingQuality='high'），不会出现断裂或锯齿。
 * 若哪天觉出糊，把本值调回 1.6（内存 +31%）或 1.8（+65%）。
 */
const REFERENCE_DISPLAY_SCALE = 1.4;
const CACHE_PX_PER_UNIT = DPR_FLOOR * REFERENCE_DISPLAY_SCALE;

/**
 * 取主体层位图源：命中直接返回；未命中则按参考分辨率新画一张离屏画布，
 * 本次绘制先用这张画布（与随后落地的位图逐像素同源，故无闪烁），
 * 同时异步转成 ImageBitmap 入缓存 —— ImageBitmap 更利于反复 drawImage，
 * 且淘汰时 onEvict 的 close() 能立即归还底层内存。
 *
 * @param cacheKey 由调用方按「主体层输入」拼出（见 FretboardCanvas 的 getCacheKey）
 * @param bodyOptions 主体层选项，必须带 reserveChordName —— 位图始终按「预留名字位」的几何
 *   存档，无论本消费方画不画名字，这是与 picker 共用同一批条目的关键
 */
export function getFretboardBoardLayer({
  cacheKey,
  baseWidth,
  baseHeight,
  bodyOptions,
}: {
  cacheKey: string;
  baseWidth: number;
  baseHeight: number;
  bodyOptions: RenderFretboardOptions;
}): CanvasImageSource | null {
  const cached = bitmapCache.get(cacheKey);
  if (cached) return cached;

  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.round(baseWidth * CACHE_PX_PER_UNIT));
  layer.height = Math.max(1, Math.round(baseHeight * CACHE_PX_PER_UNIT));
  const ctx = layer.getContext('2d');
  if (!ctx) return null;

  ctx.scale(CACHE_PX_PER_UNIT, CACHE_PX_PER_UNIT);
  renderFretboardBody(ctx, bodyOptions);

  if (isFunction(createImageBitmap))
    // 离屏画布在此之后不再被本实例引用的内容改写，故无需复核 key：它与 key 一一对应。
    // 但要防「同一 key 有两个 promise 在途」（同一帧内该实例被绘制两次，前一张位图尚未落地）：
    // 若后落地者直接覆盖，LRU 会 onEvict 掉前一张 —— 而前一张可能已被别的命中路径 drawImage 过，
    // 已 close 的 ImageBitmap 再用于绘制会抛 InvalidStateError（指板整块不显示）。
    // 保留先落地者、把后来者关掉。用 has 判断（不计数），免得把这类探测算进面板的命中率。
    void createImageBitmap(layer)
      .then(bmp => {
        if (bitmapCache.has(cacheKey)) {
          bmp.close();
          return;
        }
        bitmapCache.set(cacheKey, bmp);
      })
      .catch(() => {
        if (!bitmapCache.has(cacheKey)) bitmapCache.set(cacheKey, layer);
      });
  else
    // 不支持 createImageBitmap 的环境（如部分老浏览器）：直接把画布当位图源
    bitmapCache.set(cacheKey, layer);

  return layer;
}
