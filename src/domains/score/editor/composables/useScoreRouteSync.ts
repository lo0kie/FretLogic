import { effectScope, onActivated, watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { useUiStore } from '@/platform/store/uiStore';
import { ROUTE_PATHS, STORAGE_KEYS } from '@/platform/utils/constants';

import type { ScoreActiveTab } from '@/domains/score/editor/store/scoreEditorStore';
import type { EffectScope } from 'vue';

/**
 * 乐谱页 URL ↔ Store 状态同构：#/score?id=xxx&tab=interactive
 * 职责分界：URL 承载「可寻址状态」（选歌 / 主 Tab），Store 是运行时真相源。
 * - Store → URL：镜像 watcher 统一收口（任何路径的选歌/切 Tab 变化都以 replace 镜像，
 *   不产生历史条目）；switchTab 例外，先 push 再写 Store 以产生可后退的历史；
 * - URL → Store：前进/后退、首屏直达、KeepAlive 重激活时回灌；URL 无选中参数时，仅首次以「最近编辑
 *   乐谱」指针冷启动回灌一次（服务仍然走 URL），此后缺参即回到未选中（URL 与 UI 保持一致）；非法参数纠偏移除。
 * 视口呈现（列表滚动对焦）由组件上的 v-scroll-into-view 声明式承担，本模块不做任何 DOM 操作。
 */

/** URL tab 参数合法值域（edit 为默认态，镜像 URL 时省略） */
const TAB_QUERY_VALUES = ['edit', 'interactive', 'preview'] as const satisfies readonly ScoreActiveTab[];

interface ScoreRouteSyncApi {
  syncRouteToStore: () => void;
  selectSong: (songId: string | null) => void;
  switchTab: (tab: ScoreActiveTab) => Promise<void>;
}

/** 单例缓存：watcher 全局只注册一份，避免多组件实例重复镜像 / 重复 toast */
let singleton: ScoreRouteSyncApi | null = null;
/** 单例的 watcher 作用域：HMR 重挂载宿主组件后旧作用域被销毁，需据此重建单例（生产环境永不触发） */
let singletonScope: EffectScope | null = null;
/** 本页会话内是否已完成冷启动回灌（防重入：避免用户取消选择后被回灌复活） */
let resumed = false;
/** 上一次 sync 观察到的路由 path：用于判断「是刚进入本页」还是「页内 URL 编辑」 */
let currentPath = '';

/** 创建 watcher 与同步逻辑（仅在首次调用时执行，绑定独立 effectScope 而非宿主组件作用域） */
function createScoreRouteSync(): ScoreRouteSyncApi {
  const scope = effectScope();
  singletonScope = scope;
  const api = scope.run(() => {
    const route = useRoute();
    const router = useRouter();
    const scoreEditor = useScoreEditorStore();
    const songStore = useSongStore();
    const uiStore = useUiStore();

    // 测试环境可能未注入路由：无路由时所有 URL 能力降级为直写 Store
    const hasRouter = Boolean(route && router);

    /** 用 query 子集与当前 URL 比对，避免同值 replace 造成路由抖动 */
    const isQuerySame = (patch: Record<string, string | undefined>): boolean =>
      Object.entries(patch).every(([k, v]) => (route.query[k] ?? undefined) === v);

    // ==================== Store → URL（replace 镜像，统一收口所有选中路径） ====================

    const mirrorStoreToUrl = () => {
      if (!hasRouter || route.path !== ROUTE_PATHS.SCORE) return;
      const patch = {
        id: scoreEditor.activeSongId ?? undefined,
        // edit 为默认态从 URL 省略；未选歌时 tab 参数失去意义一并移除
        tab: scoreEditor.activeSongId && scoreEditor.activeTab !== 'edit' ? scoreEditor.activeTab : undefined,
      };
      if (isQuerySame(patch)) return;
      void router.replace({ query: { ...route.query, ...patch } });
    };

    // ==================== URL → Store（前进 / 后退 / 首屏直达回灌） ====================

    /** URL → Store 回灌；无效参数纠偏回 URL（无路由环境降级为空操作） */
    const syncRouteToStore = () => {
      // 始终记录 path：无路由环境（组件单测）先判 hasRouter 再读 route，避免 setup 期同步回灌抛错
      if (!hasRouter) return;
      const prevPath = currentPath;
      currentPath = route.path;
      if (route.path !== ROUTE_PATHS.SCORE) return;
      const freshEntry = route.path !== prevPath;
      const queryId = route.query['id'];
      const queryTab = route.query['tab'];

      // 中段重新进入本页（resumed 已置位 = 非冷启动）：导航清空 query 时，以内存选中为权威回灌 URL，
      // 令「URL=状态」延续，避免下面的「缺 id 即清空」把仍有效的选中误清（丢 URL 根因）。
      // 冷启动（resumed=false）跳过此回灌，让深链参数与 LAST_SONG 回灌先说话，绝不覆盖深链。
      if (freshEntry && resumed) mirrorStoreToUrl();

      // 0. 冷启动回灌（本页会话仅首次，resumed 置位后不再回灌）：仅当 URL 无选歌参数时，用「最近编辑乐谱」
      //    指针补位一次，令 URL 仍是唯一数据源；URL 已有 id 时直接消耗本次回灌机会，避免指针覆盖显式传入的
      //    id，也避免用户取消选择后被回灌复活。
      if (!resumed) {
        resumed = true;
        const hasNoAddress = typeof queryId !== 'string' || !queryId;
        if (hasNoAddress) {
          const lastSongId =
            typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.LAST_SONG_ID) : null;
          if (lastSongId) {
            if (songStore.songs.some(s => s.id === lastSongId)) {
              // 随「最近乐谱」一并回灌最近的 Tab（镜像省略 edit 时 URL 即无 tab），保证裸入口刷新后
              // 回到上次的主 Tab（例：预览页）而非回退到默认编辑态；tab 合法性由下方 Tab 同步分支兜底
              const patch: Record<string, string> = { id: lastSongId };
              const lastTab =
                typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.LAST_ACTIVE_TAB) : null;
              if (lastTab && TAB_QUERY_VALUES.includes(lastTab as ScoreActiveTab)) patch['tab'] = lastTab;
              void router.replace({ query: { ...route.query, ...patch } });
              return;
            }
            // 失效指针：清理，避免每次激活重复补位失败
            localStorage.removeItem(STORAGE_KEYS.LAST_SONG_ID);
          }
        }
      }

      // 1. 同步选歌：URL 有 id 时 URL 优先；不存在的 id 从 URL 移除；URL 无 id 时回到未选中——
      //    但仅限「页内编辑」（freshEntry=false）：刚进入本页时导航已清空 query，中段是由上方回灌恢复，
      //    此刻绝不清空内存中仍有效的选中（否则切页就丢选歌/丢 URL）。
      if (typeof queryId === 'string' && queryId) {
        if (songStore.songs.some(s => s.id === queryId)) {
          if (scoreEditor.activeSongId !== queryId) scoreEditor.setActiveSong(queryId);
        } else {
          void router.replace({ query: { ...route.query, id: undefined } });
        }
      } else if (!freshEntry && scoreEditor.activeSongId !== null) {
        scoreEditor.setActiveSong(null);
      }

      // 2. 同步主 Tab：合法性结合「是否有歌词」守卫；tab=edit 为默认态，从 URL 中省略
      if (typeof queryTab === 'string' && TAB_QUERY_VALUES.includes(queryTab as ScoreActiveTab)) {
        const tab = queryTab as ScoreActiveTab;
        if (tab !== 'edit' && !scoreEditor.hasLyrics) {
          // toast 仅在 tab 实际被纠正时弹出：同一次导航内多触发源（路由 watcher / onActivated）重入时不再重复提示
          if (scoreEditor.activeTab !== 'edit') {
            scoreEditor.activeTab = 'edit';
            uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
          }
          void router.replace({ query: { ...route.query, tab: undefined } });
        } else if (scoreEditor.activeTab !== tab) {
          scoreEditor.activeTab = tab;
        }
      }
    };

    /**
     * 用户主动选歌 / 取消选中（传 null）：写 Store 后由镜像 watcher 以 replace 同步 URL。
     */
    const selectSong = (songId: string | null) => {
      if (scoreEditor.activeSongId !== songId) scoreEditor.setActiveSong(songId);
    };

    /**
     * 用户主动切主 Tab：先 push URL（产生历史，后退可在 Tab 间回放），Store 随后写入，
     * 镜像 watcher 检测到 URL 已同值自动跳过，不会二次 replace。
     */
    const switchTab = async (tab: ScoreActiveTab) => {
      if (tab !== 'edit' && !scoreEditor.hasLyrics) {
        uiStore.toast.warning('请先在“编辑歌词”模式下输入歌词内容');
        return;
      }
      if (hasRouter) await router.push({ query: { ...route.query, tab: tab === 'edit' ? undefined : tab } });
      scoreEditor.activeTab = tab;
    };

    // 前进/后退与跨页跳转回灌：路由 query 变化且当前在乐谱页时同步（源函数判空以兼容无路由环境）
    watch(
      () => (hasRouter ? ([route.path, route.query] as const) : null),
      () => syncRouteToStore()
    );

    /** 时序保证：先做一次 URL→Store 回灌，再启动 Store→URL 镜像 watcher，
     *  避免镜像在回灌前用持久化状态覆盖深链参数（如 #/score?id=X 被改回旧值） */
    syncRouteToStore();
    watch(() => [scoreEditor.activeSongId, scoreEditor.activeTab] as const, mirrorStoreToUrl);

    return { syncRouteToStore, selectSong, switchTab };
  });
  // run() 仅在 scope 已停止时返回 undefined；新建 scope 必然执行成功，此守卫仅为类型收窄
  if (!api) throw new Error('useScoreRouteSync: effectScope 已停止，无法创建同步 watcher');
  return api;
}

export function useScoreRouteSync(): ScoreRouteSyncApi {
  // HMR 场景下宿主组件重挂载会销毁旧 effectScope（active 翻转为 false），此时重建单例；生产环境永不触发
  if (!singleton || !singletonScope?.active) {
    singleton = createScoreRouteSync();
    resumed = false;
  }
  // 每个调用组件各自注册 KeepAlive 重激活同步（随组件生命周期自动清理）
  onActivated(singleton.syncRouteToStore);
  return singleton;
}
