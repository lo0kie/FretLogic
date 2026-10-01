import { effectScope, onActivated } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { createRouteStoreSync } from '@/platform/composables/useRouteStoreSync';
import { kvGet } from '@/platform/services/storage/idbKv';
import { useUiStore } from '@/platform/store/uiStore';
import { isString } from '@/platform/utils/common';
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
 *
 * 共享骨架（单例状态、query 比对/replace、中段重进回灌、冷启动指针补位、watcher 接线）
 * 已下沉到 platform 的 createRouteStoreSync；本模块只注入乐谱页的业务差异：
 * 手写校验（见下）、id/tab 参数语义、LAST_SONG_ID/LAST_ACTIVE_TAB 指针与歌词守卫。
 */

/** URL tab 参数合法值域（edit 为默认态，镜像 URL 时省略） */
const TAB_QUERY_VALUES = ['edit', 'interactive', 'preview'] as const satisfies readonly ScoreActiveTab[];

/**
 * 由 Store 当前状态推导乐谱页 URL 的 query 子集：`edit` 为默认态省略；未选歌时 `tab` 一并移除。
 *
 * 导出为纯函数（不依赖 router / 组件实例），供两处共用同一条 URL 形状规则：
 * - 本模块的镜像 watcher（Store → URL）；
 * - 顶栏「乐谱」导航入口——直接落到完整 URL，而不是先推裸路径再由镜像回写补参数
 *   （后者会产生一次多余导航，且「已在乐谱页时再点乐谱」会先把 URL 打回裸路径再恢复）。
 */
export const buildScoreQuery = (songId: string | null, tab: ScoreActiveTab): Record<string, string | undefined> => ({
  id: songId ?? undefined,
  tab: songId && tab !== 'edit' ? tab : undefined,
});

/**
 * URL query 参数校验：id 为非空串；tab 限定合法值域。
 *
 * 手写而不用 zod：本模块被 TopHeader 静态引用（属首屏闭包，见 check-bundle 的 220KB 预算），
 * 而 zod 是几十 KB 级依赖——为一个「非空串」与「三值枚举」把它拖进首屏不值得。
 * 真正需要 zod 的是备份包校验（app/services/validation/payload.ts），那里本就是动态 import。
 * 保留 `{ success, data }` 的返回形状，故全部调用点无需改动。
 */
type QueryParseResult<T> = { success: true; data: T } | { success: false };

const QUERY_ID = {
  safeParse: (value: unknown): QueryParseResult<string> =>
    isString(value) && value.length > 0 ? { success: true, data: value } : { success: false },
};

const QUERY_TAB = {
  safeParse: (value: unknown): QueryParseResult<ScoreActiveTab> =>
    isString(value) && (TAB_QUERY_VALUES as readonly string[]).includes(value)
      ? { success: true, data: value as ScoreActiveTab }
      : { success: false },
};

interface ScoreRouteSyncApi {
  syncRouteToStore: () => void;
  selectSong: (songId: string | null) => void;
  switchTab: (tab: ScoreActiveTab) => Promise<void>;
}

/** 单例缓存：watcher 全局只注册一份，避免多组件实例重复镜像 / 重复 message */
let singleton: ScoreRouteSyncApi | null = null;
/** 单例的 watcher 作用域：HMR 重挂载宿主组件后旧作用域被销毁，需据此重建单例（生产环境永不触发） */
let singletonScope: EffectScope | null = null;
// resumed / currentPath 原为本模块的模块级单例；下沉后由引擎闭包承载（每引擎一份），
// 引擎随 effectScope 单例重建而新建 —— 原先「重建单例时把 resumed 置回 false」的语义由此自然保持。

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

    const engine = createRouteStoreSync({
      routePath: ROUTE_PATHS.SCORE,
      hasNoAddress: query => !QUERY_ID.safeParse(query['id']).success,
      lastPointerKey: STORAGE_KEYS.LAST_SONG_ID,
      isPointerValid: lastSongId => songStore.songs.some(s => s.id === lastSongId),
      buildColdStartPatch: lastSongId => {
        // 随「最近乐谱」一并回灌最近的 Tab（镜像省略 edit 时 URL 即无 tab），保证裸入口刷新后
        // 回到上次的主 Tab（例：预览页）而非回退到默认编辑态；tab 合法性由 QUERY_TAB 兜底
        const patch: Record<string, string> = { id: lastSongId };
        const lastTab = QUERY_TAB.safeParse(kvGet(STORAGE_KEYS.LAST_ACTIVE_TAB));
        if (lastTab.success) patch['tab'] = lastTab.data;
        return patch;
      },
      buildMirrorPatch: () => buildScoreQuery(scoreEditor.activeSongId, scoreEditor.activeTab),
      applyParams: ({ query, freshEntry }) => {
        // 1. 同步选歌：URL 有 id 时 URL 优先；不存在的 id 从 URL 移除；URL 无 id 时回到未选中——
        //    但仅限「页内编辑」（freshEntry=false）：刚进入本页时导航已清空 query，中段是由上方回灌恢复，
        //    此刻绝不清空内存中仍有效的选中（否则切页就丢选歌/丢 URL）。
        const idResult = QUERY_ID.safeParse(query['id']);
        if (idResult.success) {
          const songId = idResult.data;
          if (songStore.songs.some(s => s.id === songId)) {
            if (scoreEditor.activeSongId !== songId) scoreEditor.setActiveSong(songId);
          } else void router.replace({ query: { ...route.query, id: undefined } });
        } else if (!freshEntry && scoreEditor.activeSongId !== null) scoreEditor.setActiveSong(null);

        // 2. 同步主 Tab：合法性结合「是否有歌词」守卫；tab=edit 为默认态，从 URL 中省略
        const tabResult = QUERY_TAB.safeParse(query['tab']);
        if (tabResult.success) {
          const tab = tabResult.data;
          if (tab !== 'edit' && !scoreEditor.hasLyrics) {
            // message 仅在 tab 实际被纠正时弹出：同一次导航内多触发源（路由 watcher / onActivated）重入时不再重复提示
            if (scoreEditor.activeTab !== 'edit') {
              scoreEditor.activeTab = 'edit';
              uiStore.message.warning('请先在“编辑歌词”模式下输入歌词内容');
            }
            void router.replace({ query: { ...route.query, tab: undefined } });
          } else if (scoreEditor.activeTab !== tab) scoreEditor.activeTab = tab;
        }
      },
    });

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
        uiStore.message.warning('请先在“编辑歌词”模式下输入歌词内容');
        return;
      }
      if (hasRouter) await router.push({ query: { ...route.query, tab: tab === 'edit' ? undefined : tab } });
      scoreEditor.activeTab = tab;
    };

    // 前进/后退与跨页跳转回灌、首次回灌、镜像 watcher 的接线顺序由框架统一保证
    engine.registerWatchers([() => [scoreEditor.activeSongId, scoreEditor.activeTab] as const]);

    return { syncRouteToStore: engine.syncRouteToStore, selectSong, switchTab };
  });
  // run() 仅在 scope 已停止时返回 undefined；新建 scope 必然执行成功，此守卫仅为类型收窄
  if (!api) throw new Error('useScoreRouteSync: effectScope 已停止，无法创建同步 watcher');
  return api;
}

export function useScoreRouteSync(): ScoreRouteSyncApi {
  // HMR 场景下宿主组件重挂载会销毁旧 effectScope（active 翻转为 false），此时重建单例；生产环境永不触发
  // （引擎随单例重建而新建，其闭包内的冷启动回灌状态一并复位，与原模块级 resumed=false 等价）
  if (!singleton || !singletonScope?.active) singleton = createScoreRouteSync();
  // 每个调用组件各自注册 KeepAlive 重激活同步（随组件生命周期自动清理）
  onActivated(singleton.syncRouteToStore);
  return singleton;
}
