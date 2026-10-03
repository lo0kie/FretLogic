/**
 * 工作台 URL ↔ Store 状态同构：#/workbench?group=xxx&chord=xxx
 * - group：聚焦分组（无 chord 时镜像 selectedGroupId；有 chord 时镜像草稿所属分组）
 * - chord：正在编辑的既有和弦 id（新建/未保存草稿不上 URL）。
 *   多指法变体**不需要单独的地址**：草稿被切换成变体后 `draft.id` 就是那条变体自己的 id，
 *   故 ?chord=<变体id> 已能精确还原到该变体。原先另有一个 ?v=N 记「变体在列表里的位置索引」，
 *   而变体表由排序规则派生 —— 排序判据一变（例如最低音改按 MIDI 取）同一个 N 就指向另一条指法，
 *   收藏/分享出去的链接会静默换成别的变体。该参数已移除（见 buildMirrorPatch 的说明）。
 *
 * 同步策略（replace 为主）：
 * - 用户在工作台内的任何选中（点和弦卡 / 搜索结果 / 切变体）都只改 Store，
 *   由镜像 watcher 以 replace 镜像，不产生历史条目；
 * - 浏览器前进/后退、首屏直达、KeepAlive 重激活时由 URL→store watcher 回灌；
 *   遇到未保存的脏草稿时静默忽略回灌，并把 chord/v 参数从 URL 纠偏移除。
 * 视口对焦由侧边栏分组行 / 变体卡片上的 v-scroll-into-view 声明式承担。
 *
 * 共享骨架（单例状态、query 比对/replace、中段重进回灌、冷启动指针补位、watcher 接线）
 * 已下沉到 platform 的 createRouteStoreSync；本模块只注入工作台的业务差异：
 * zod 校验、group/chord 参数语义、LAST_GROUP_ID 指针与脏草稿守卫。
 */
import { onActivated } from 'vue';

import { getActivePinia } from 'pinia';
import { z } from 'zod';

import { areChordContentsEqual } from '@/domains/chord/model/chordContentSignature';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { createRouteStoreSync } from '@/platform/composables/useRouteStoreSync';
import { ROUTE_PATHS, STORAGE_KEYS } from '@/platform/utils/constants';

import type { RouteStoreSyncApi } from '@/platform/composables/useRouteStoreSync';

// URL query 参数 schema（替代手写 typeof 守卫）：group / chord 均为非空 id 串
const QUERY_ID = z.string().min(1);

/**
 * 同步引擎单例（每页面一份）：原实现的 resumed / currentPath 是本模块的模块级单例 ——
 * 「每页面一份、跨组件重挂载存活、与其他页面互不串扰」。骨架下沉后该状态由引擎闭包承载，
 * 故引擎同样只在本模块缓存一份（首次进入 setup 时创建，createRouteStoreSync 内部的
 * useRoute/useRouter 因此能拿到注入上下文），组件重挂载只重注册 watcher、复用同一份状态。
 */
let engine: RouteStoreSyncApi | null = null;
/**
 * 引擎所属的 pinia 实例。跨实例（测试里每个用例新建 pinia、宿主重建应用）即重建引擎 ——
 * 否则它会一直用**第一代** store 闭包：状态读的是旧库、写的也是旧库，而调用方看的是新库。
 * 与 useScoreLinesData 的 `lastPinia` 是同一道守卫（那里也是模块级单例 + 跨实例重建）。
 */
let enginePinia: unknown = null;

export function useWorkbenchRouteSync() {
  const chordStore = useChordStore();
  const editorStore = useChordEditorStore();
  const currentPinia = getActivePinia();

  if (engine === null || enginePinia !== currentPinia) {
    enginePinia = currentPinia;
    /** 草稿是否携带未保存内容（脏草稿守卫）：
     * - 新建态（isCreating）：指板非空即脏（空白新建草稿可安全覆盖）；
     * - 编辑态（isEditing）：草稿与库中原始实体指纹/名称/横按不一致即脏。
     *   内容键（判等口径，见 chordContentSignature）含横按，横按改动因此也在比较范围内，否则
     *   仅调横按的未保存草稿会被误判干净而被 URL 回灌覆盖。
     */
    const isDraftDirty = (): boolean => {
      if (editorStore.isCreating) return !editorStore.isFretBoardEmpty;
      if (!editorStore.isEditing) return false;
      const draft = editorStore.draftChord;
      if (!draft.id) return !editorStore.isFretBoardEmpty;
      const saved = chordStore.savedChordsList.find(c => c.id === draft.id);
      // 库里查不到这条（该和弦已被删）：草稿若还有内容就算脏 —— 判成「干净」会让 URL 回灌
      // 无提示覆盖掉用户未保存的改动，与上面这条脏草稿守卫的立意相反。
      if (!saved) return !editorStore.isFretBoardEmpty;
      return !areChordContentsEqual(draft, saved) || getChordName(draft) !== getChordName(saved);
    };

    /** 应用 URL 的 chord 参数：目标合法且草稿不脏时载入编辑器；返回是否已应用。
     *  变体无需单独处理 —— 变体在库里就是一条独立和弦，`chord` 给的是哪条就载入哪条。 */
    const applyChordParam = (chordId: string): boolean => {
      const target = chordStore.savedChordsList.find(c => c.id === chordId);
      if (!target) return false;
      // 脏草稿守卫：静默忽略回灌；同和弦视为已应用（URL 有效，不覆盖未保存修改）
      if (isDraftDirty()) return editorStore.draftChord.id === target.id;

      // 聚焦所在分组（单展开模式），视口对焦交给侧边栏的 v-scroll-into-view
      chordStore.selectAndExpandGroup(target.groupId);
      if (editorStore.draftChord.id !== target.id) editorStore.setEditor(target);
      return true;
    };

    engine = createRouteStoreSync({
      routePath: ROUTE_PATHS.WORKBENCH,
      hasNoAddress: query => !QUERY_ID.safeParse(query['chord']).success && !QUERY_ID.safeParse(query['group']).success,
      lastPointerKey: STORAGE_KEYS.LAST_GROUP_ID,
      isPointerValid: lastGroup => chordStore.groups.some(g => g.id === lastGroup),
      buildColdStartPatch: lastGroup => ({ group: lastGroup }),
      buildMirrorPatch: () => {
        const draft = editorStore.draftChord;
        return {
          group: (draft.id ? draft.groupId : chordStore.selectedGroupId) || undefined,
          chord: draft.id || undefined,
          // 变体由 chord 自身寻址（见文件头），故不再镜像 v。这里**显式写 undefined** 是为了把旧链接里
          // 遗留的 ?v=N 从 URL 上摘掉 —— replaceQuery 只合并 patch，未列出的键会被原样保留。
          v: undefined,
        };
      },
      applyParams: ({ query, freshEntry, replaceQuery }) => {
        // 1. chord 参数优先：合法目标且草稿不脏时载入（多指法变体在库里就是独立实体，故这一个参数就够）
        const chordResult = QUERY_ID.safeParse(query['chord']);
        if (chordResult.success) {
          if (applyChordParam(chordResult.data)) return;
          replaceQuery({ chord: undefined, v: undefined });
          return;
        }

        // 2. 分组参数：聚焦分组；无效 id 纠偏移除。URL 完全无 group 地址时回到「无选中分组」
        //    （空态保底）：正常路径下 group 参数由镜像 watcher 持续维持；只有存在未保存草稿时，草稿
        //    镜像才会以 draft.groupId 写回 URL，因此本分支不会误伤「正在编辑草稿」所在的组。
        const groupResult = QUERY_ID.safeParse(query['group']);
        if (groupResult.success) {
          const groupId = groupResult.data;
          if (chordStore.groups.some(g => g.id === groupId)) {
            if (chordStore.selectedGroupId !== groupId) chordStore.selectAndExpandGroup(groupId);
          } else replaceQuery({ group: undefined });
        } else if (!freshEntry && chordStore.selectedGroupId !== null) chordStore.selectAndExpandGroup(null);
      },
    });
  }
  const sync = engine;

  sync.registerWatchers([
    // groupId 单列进源数组：和弦编辑抽屉（ChordEditorDrawer）存在对 draftChord.groupId 的就地写入（引用不变），
    // 仅浅监听 draftChord 引用会漏掉该路径导致 URL group 参数失镜
    () => [editorStore.draftChord, editorStore.draftChord.groupId] as const,
    () => [chordStore.selectedGroupId, editorStore.currentMultiFingeringIndex, editorStore.isMultiFingering] as const,
  ]);
  // 重激活同样算「进入本页」，否则会走到「缺 group 即清空」（见框架 syncRouteToStore 的 activated 注释）
  onActivated(() => sync.syncRouteToStore(true));

  return { syncRouteToStore: sync.syncRouteToStore };
}
