import type { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import type { InjectionKey } from 'vue';

/**
 * 和弦引用反查能力注入键：返回「引用了这些和弦 id 的乐谱数量」。
 * 由应用层提供实现（内部桥接乐谱域 songStore），和弦域组件保持零 score 依赖；
 * 未注入时按无引用处理（引用反查菜单项置灰）。
 */
export const CHORD_REFERENCE_LOOKUP: InjectionKey<(chordIds: string[]) => number> = Symbol('chord-reference-lookup');

/**
 * 和弦分组模态控制器注入键：由应用层（`app/layouts/SidebarLeft.vue`）provide 具体实现，
 * 和弦库各容器组件 inject。
 *
 * 键定义在**下层**是刻意的：app 可以 import domains、反之不行，键必须住在注入方也够得着的那一层
 * （与上面的 CHORD_REFERENCE_LOOKUP 同理由）。此前这里是字符串 `'groupModals'` ——
 * provide/inject 两端各自写字面量，拼错不报错、类型靠调用方手写泛型断言，属无保障的隐式契约。
 */
export const CHORD_GROUP_MODALS: InjectionKey<ReturnType<typeof useChordGroupModals>> = Symbol('chord-group-modals');
