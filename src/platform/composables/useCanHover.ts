/**
 * 「这台设备有没有悬停能力」的**响应式**单例。
 *
 * 模块级常量而非工厂函数：`(hover: hover)` 是设备属性，一个页面只有一份答案，
 * 消费方各调一次 `useMediaQuery` 就是同一个问题建三条 MQL 监听 —— 监听数随消费方增长，
 * 而它们永远同值。查询串本身来自 `platform/utils/motion` 的 `HOVER_MEDIA_QUERY`（唯一出处）；
 * 需要**非响应式**的一次性查询（如 v-tooltip 的指令内判据）用同模块的 `hasHoverCapability()`。
 *
 * 消费方（`TopHeader` 的浮层触发方式、`FretboardSvg` 的横按气泡常驻、`ScorePreviewPane` 的页角菜单角标）
 * 都是「有 / 无」的二值分支，故这里给出的是 `Ref<boolean>` 而不是 computed 派生量。
 *
 * 与 `useTheme` 的 `prefersDark` 同形（同为模块级 `useMediaQuery` 单例），
 * 生命周期即模块生命周期 —— 应用启动到结束，不需要注销。
 */
import { useMediaQuery } from '@vueuse/core';

import { HOVER_MEDIA_QUERY } from '@/platform/utils/motion';

/** 本机是否有悬停能力；无 `matchMedia` 的环境（jsdom）为 false —— vueuse 的既有语义 */
export const canHover = useMediaQuery(HOVER_MEDIA_QUERY);
