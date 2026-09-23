import type { useSongModals } from '@/domains/score/library/composables/useSongModals';
import type { InjectionKey } from 'vue';

/**
 * 乐谱模态控制器注入键：由应用层（`app/layouts/SidebarLeft.vue`）provide 具体实现，
 * `SongModalsContainer` inject。
 *
 * 键定义在**下层**是刻意的：app 可以 import domains、反之不行，键必须住在注入方也够得着的那一层。
 * 此前是字符串 `'songModals'` —— 两端各自写字面量，拼错不报错，属无保障的隐式契约。
 */
export const SONG_MODALS: InjectionKey<ReturnType<typeof useSongModals>> = Symbol('song-modals');
