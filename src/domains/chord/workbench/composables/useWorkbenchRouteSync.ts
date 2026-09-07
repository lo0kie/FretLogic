/**
 * 工作台 URL ↔ Store 状态同构：#/workbench?group=xxx&chord=xxx&v=N
 * - group：聚焦分组（无 chord 时镜像 selectedGroupId；有 chord 时镜像草稿所属分组）
 * - chord：正在编辑的既有和弦 id（新建/未保存草稿不上 URL）
 * - v：多指法变体索引（0 基，主指法省略；越界时回退主指法）
 *
 * 同步策略（replace 为主）：
 * - 用户在工作台内的任何选中（点和弦卡 / 搜索结果 / 切变体）都只改 Store，
 *   由本模块的 store→URL watcher 以 replace 镜像，不产生历史条目；
 * - 浏览器前进/后退、首屏直达、KeepAlive 重激活时由 URL→store watcher 回灌；
 *   遇到未保存的脏草稿时静默忽略回灌，并把 chord/v 参数从 URL 纠偏移除。
 * 视口对焦由侧边栏分组行 / 变体卡片上的 v-scroll-into-view 声明式承担。
 */
import { onActivated, watch } from 'vue';

import { useRoute, useRouter } from 'vue-router';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { computeChordFingerprint, getChordName } from '@/domains/chord/theory/theory';
import { ROUTE_PATHS, STORAGE_KEYS } from '@/platform/utils/constants';

/** 本页会话内是否已完成冷启动回灌（防重入：避免用户取消选择后被回灌复活） */
let resumed = false;
/** 上一次 sync 观察到的路由 path：用于判断「是刚进入本页」还是「页内 URL 编辑」 */
let currentPath = '';

export function useWorkbenchRouteSync() {
  const route = useRoute();
  const router = useRouter();
  const chordStore = useChordStore();
  const editorStore = useChordEditorStore();

  // 测试环境可能未注入路由：无路由时所有 URL 能力降级（watcher 直接过、回灌不动作）
  const hasRouter = Boolean(route && router);

  /** 工作台是否处于激活路由（watcher 与镜像写入的统一前置守卫） */
  const isOnWorkbench = () => hasRouter && route.path === ROUTE_PATHS.WORKBENCH;

  /** 用 query 子集与当前 URL 比对，避免同值 replace 造成路由抖动 */
  const isQuerySame = (patch: Record<string, string | undefined>): boolean =>
    Object.entries(patch).every(([k, v]) => (route.query[k] ?? undefined) === v);

  /** 以 patch 合并当前 query 发起 replace（同值时跳过） */
  const replaceQuery = (patch: Record<string, string | undefined>) => {
    if (isQuerySame(patch)) return;
    void router.replace({ query: { ...route.query, ...patch } });
  };

  /**
   * 草稿是否携带未保存内容（脏草稿守卫）：
   * - 新建态（isCreating）：指板非空即脏（空白新建草稿可安全覆盖）；
   * - 编辑态（isEditing）：草稿与库中原始实体指纹/名称不一致即脏。
   */
  const isDraftDirty = (): boolean => {
    if (editorStore.isCreating) return !editorStore.isFretBoardEmpty;
    if (!editorStore.isEditing) return false;
    const draft = editorStore.draftChord;
    if (!draft.id) return !editorStore.isFretBoardEmpty;
    const saved = chordStore.savedChordsList.find(c => c.id === draft.id);
    if (!saved) return false;
    return (
      computeChordFingerprint(draft) !== computeChordFingerprint(saved) || getChordName(draft) !== getChordName(saved)
    );
  };

  // ==================== Store → URL（用户选中动作的 replace 镜像） ====================

  const mirrorStoreToUrl = () => {
    if (!isOnWorkbench()) return;
    const draft = editorStore.draftChord;
    const patch: Record<string, string | undefined> = {
      group: (draft.id ? draft.groupId : chordStore.selectedGroupId) || undefined,
      chord: draft.id || undefined,
      // 主指法（索引 0）或多指法面板收起时省略 v
      v:
        draft.id && editorStore.isMultiFingering && editorStore.currentMultiFingeringIndex > 0
          ? String(editorStore.currentMultiFingeringIndex)
          : undefined,
    };
    replaceQuery(patch);
  };

  // ==================== URL → Store（前进 / 后退 / 首屏直达回灌） ====================

  /** 应用 URL 的 chord/v 参数：目标合法且草稿不脏时载入编辑器；返回是否已应用 */
  const applyChordParam = (chordId: string, rawV: string | undefined): boolean => {
    const target = chordStore.savedChordsList.find(c => c.id === chordId);
    if (!target) return false;
    // 脏草稿守卫：静默忽略回灌；同和弦视为已应用（URL 有效，不覆盖未保存修改）
    const sameId = editorStore.draftChord.id === target.id;
    if (isDraftDirty()) return sameId;

    // 聚焦所在分组（单展开模式），视口对焦交给侧边栏的 v-scroll-into-view
    chordStore.selectAndExpandGroup(target.groupId);

    if (!sameId) {
      editorStore.setEditor(target);
      return true;
    }

    // 同一和弦：v 指向其他变体时切换（越界/主指法不动作）；草稿与目标同源时才允许
    const vNum = Number(rawV);
    if (Number.isInteger(vNum) && vNum > 0) {
      const variants = chordStore.getMultiFingering(target.groupId, getChordName(target))?.variants ?? [];
      // 索引寻址「尽力而为」：越界回退主指法
      const variant = variants[vNum] ?? variants[0];
      if (variant && variant.id !== editorStore.draftChord.id) editorStore.setEditor(variant);
    }
    return true;
  };

  /** URL → Store 回灌；无效参数与被脏草稿拒绝的参数都从 URL 纠偏移除 */
  const syncRouteToStore = () => {
    // 无路由环境（组件单测）不触碰 route，与 score 侧守卫顺序一致
    if (!hasRouter) return;
    const prevPath = currentPath;
    currentPath = route.path;
    if (route.path !== ROUTE_PATHS.WORKBENCH) return;
    const freshEntry = route.path !== prevPath;
    const queryGroup = route.query['group'];
    const queryChord = route.query['chord'];
    const queryV = route.query['v'];

    // 中段重新进入本页（resumed 已置位 = 非冷启动）：导航清空 query 时，以内存选中为权威回灌 URL，
    // 令「URL=状态」延续，避免下面的「缺 group 即清空」把仍有效的选中误清（丢 URL 根因）。
    // 冷启动（resumed=false）跳过此回灌，让深链参数与 LAST_GROUP 回灌先说话，绝不覆盖深链。
    if (freshEntry && resumed) mirrorStoreToUrl();

    // 0. 冷启动回灌（本页会话仅首次，resumed 置位后不再回灌）：仅当 URL 完全没有 group/chord 地址时，
    //    用「最近编辑分组」指针补位一次，令 URL 仍是唯一数据源；URL 已有地址时直接消耗本次回灌机会，
    //    避免指针覆盖显式传入的 group 参数，也避免用户取消选择后被回灌复活。
    if (!resumed) {
      resumed = true;
      const hasNoAddress =
        (typeof queryChord !== 'string' || !queryChord) && (typeof queryGroup !== 'string' || !queryGroup);
      if (hasNoAddress) {
        const lastGroup = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.LAST_GROUP_ID) : null;
        if (lastGroup) {
          if (chordStore.groups.some(g => g.id === lastGroup)) {
            replaceQuery({ group: lastGroup });
            return;
          }
          // 失效指针：清理，避免每次激活重复补位失败
          localStorage.removeItem(STORAGE_KEYS.LAST_GROUP_ID);
        }
      }
    }

    // 1. chord 参数优先：合法目标且草稿不脏时载入（含变体切换）
    if (typeof queryChord === 'string' && queryChord) {
      if (applyChordParam(queryChord, typeof queryV === 'string' ? queryV : undefined)) return;
      replaceQuery({ chord: undefined, v: undefined });
      return;
    }

    // 2. 分组参数：聚焦分组；无效 id 纠偏移除。URL 完全无 group 地址时回到「无选中分组」
    //    （空态保底）：正常路径下 group 参数由镜像 watcher 持续维持；只有存在未保存草稿时，草稿
    //    镜像才会以 draft.groupId 写回 URL，因此本分支不会误伤「正在编辑草稿」所在的组。
    if (typeof queryGroup === 'string' && queryGroup) {
      if (chordStore.groups.some(g => g.id === queryGroup)) {
        if (chordStore.selectedGroupId !== queryGroup) chordStore.selectAndExpandGroup(queryGroup);
      } else {
        replaceQuery({ group: undefined });
      }
    } else if (!freshEntry && chordStore.selectedGroupId !== null) {
      chordStore.selectAndExpandGroup(null);
    }
  };

  watch(
    () => (hasRouter ? ([route.path, route.query] as const) : null),
    () => syncRouteToStore()
  );
  onActivated(syncRouteToStore);

  /** 时序保证：先做一次 URL→Store 回灌，再启动 Store→URL 镜像 watcher，
   *  避免镜像在回灌前用持久化草稿覆盖深链参数（如 #/workbench?chord=x 被改回旧值） */
  syncRouteToStore();
  // groupId 单列进源数组：ChordPickerModal 存在对 draftChord.groupId 的就地写入（引用不变），
  // 仅浅监听 draftChord 引用会漏掉该路径导致 URL group 参数失镜
  watch(() => [editorStore.draftChord, editorStore.draftChord.groupId] as const, mirrorStoreToUrl);
  watch(
    () => [chordStore.selectedGroupId, editorStore.currentMultiFingeringIndex, editorStore.isMultiFingering] as const,
    mirrorStoreToUrl
  );

  return { syncRouteToStore };
}
