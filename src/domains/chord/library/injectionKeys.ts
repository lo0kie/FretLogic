import type { InjectionKey } from 'vue';

/**
 * 和弦引用反查能力注入键：返回「引用了这些和弦 id 的乐谱数量」。
 * 由应用层提供实现（内部桥接乐谱域 songStore），和弦域组件保持零 score 依赖；
 * 未注入时按无引用处理（引用反查菜单项置灰）。
 */
export const CHORD_REFERENCE_LOOKUP: InjectionKey<(chordIds: string[]) => number> = Symbol('chord-reference-lookup');
