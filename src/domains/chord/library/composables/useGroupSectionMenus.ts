import { inject } from 'vue';

import { CHORD_REFERENCE_LOOKUP } from '@/domains/chord/library/injectionKeys';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useChordTransfer } from '@/domains/chord/transfer/useChordTransfer';
import { useTargetMenu } from '@/platform/ui/menu/useTargetMenu';

import type BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import type { Chord, Group, GroupedChordCard } from '@/domains/chord/types';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { Ref } from 'vue';

/** 本组件对外的事件契约：菜单项里的「改名 / 删除分组 / 移动 / 排序 / 删除变体 / 引用反查」一律上抛 */
export interface GroupSectionEmits {
  (e: 'open-rename', group: Group): void;
  (e: 'open-delete', group: Group): void;
  (e: 'open-move', chord: Chord): void;
  (e: 'open-sort', group: Group): void;
  (e: 'open-delete-variants', cardData: GroupedChordCard): void;
  (e: 'open-references', cardData: GroupedChordCard): void;
}

/** 菜单侧要用到的只读视图能力（来自 useGroupSectionView），只取这两项 */
interface GroupSectionMenuView {
  cardsOf: (group: Group) => GroupedChordCard[];
  getGroupChordsCount: (groupId: string) => number;
}

/**
 * 分组列表的右键菜单（列表级委托，两个单例）。
 *
 * 分组头与组内卡片各一个 BaseMenu 实例，都由列表容器上的 contextmenu 委托驱动（见
 * handleListContextMenu）—— 取代原先「每张卡 / 每分组各包一个」的写法（整库渲染时那是数百个
 * BaseMenu + BasePopover 实例，各带 watcher / 浮层注册表 / 卸载钩子）。
 * 两者刻意分开：一个实例只做一件事，两种目标的菜单项互不牵连；同时打开时的互斥由 BaseMenu 的
 * 模块级登记保证。
 * 目标一律从事件目标反查：分组头读 data-group-id，卡片读 data-chord-id / data-variant-index，
 * 卡片所属分组再由分组行上的 data-group-id 反查。
 *
 * 三条不变量：
 * ① **两个模板 ref 由组件持有**：它们同时被 useSortableList 的 longPressMenu.onDismiss 使用，
 *    归属组件而非本 composable；这里只接收（类型是 useTargetMenu 要的最小契约）。
 * ② **菜单项按 id 现查分组**：不缓存分组对象 —— 分组在重命名等路径下会被整体替换
 *    （`renameGroup` 走 map + 展开），缓存引用会拿到陈旧的名字与排序规则。
 * ③ **打开统一走 useTargetMenu**：「写目标 → 等一拍 → openMenuAt」的三段式收在它里面
 *    （见其注释 ②），这里只负责把命中的目标交给它。
 */
export function useGroupSectionMenus({
  view,
  headerMenuRef,
  cardMenuRef,
  handleLocalDeleteChord,
  emit,
}: {
  view: GroupSectionMenuView;
  headerMenuRef: Readonly<Ref<InstanceType<typeof BaseMenu> | null>>;
  cardMenuRef: Readonly<Ref<InstanceType<typeof BaseMenu> | null>>;
  handleLocalDeleteChord: (chord: Chord) => void;
  emit: GroupSectionEmits;
}) {
  const { cardsOf, getGroupChordsCount } = view;
  const chordStore = useChordStore();
  const { copyChordCardText, copyGroupText, shareChordLink, shareGroupLink } = useChordTransfer();
  // 引用反查能力由应用层注入（桥接乐谱域）；未注入时按无引用处理
  const lookupChordReferences = inject(CHORD_REFERENCE_LOOKUP, () => 0);

  /** 分组 id → 分组（委托反查用；分组数量级远小于卡片数，线性查找足够） */
  const groupById = (id: string | undefined): Group | undefined =>
    id ? chordStore.groups.find(g => g.id === id) : undefined;

  /* ---------- 分组头菜单 ---------- */

  /** 分组右键菜单项：按目标分组构建一次，由 useTargetMenu 的 computed 缓存 */
  const getGroupMenuItems = (group: Group): MenuItem[] => [
    {
      label: '修改名称',
      icon: 'square-pen',
      action: () => void emit('open-rename', group),
    },
    {
      label: '复制分组',
      icon: 'copy',
      action: () => void copyGroupText(group),
    },
    {
      // 分享：与「复制分组」同一份载体（token：分组名 + 排序规则 + 组内全部和弦），只是外面套了一条地址，对方打开即自动建组导入
      label: '分享分组',
      icon: 'share-2',
      disabled: getGroupChordsCount(group.id) === 0,
      action: () => void shareGroupLink(group),
    },
    {
      label: '和弦排序',
      icon: 'arrow-up-down',
      disabled: getGroupChordsCount(group.id) === 0,
      action: () => void emit('open-sort', group),
    },
    {
      label: '删除分组',
      icon: 'trash-2',
      danger: true,
      action: () => void emit('open-delete', group),
    },
  ];

  /** 分组头右键菜单：目标为**分组 id**，菜单项由 getGroupMenuItems 按 id 现查分组构建 ——
   *  不缓存分组对象，因为分组在重命名等路径下会被整体替换（`renameGroup` 走 map + 展开），
   *  缓存引用会拿到陈旧的名字与排序规则。
   *  目标未命中（或分组已不存在）时 builder 返回空数组，BaseMenu 据此拒绝打开；
   *  「必须等 nextTick」「关闭后保留目标」两个不变量由 useTargetMenu 统一保证。 */
  const {
    target: headerMenuTargetId,
    isOpen: isHeaderMenuOpen,
    items: headerMenuItems,
    openAt: openHeaderMenuAt,
    close: closeHeaderMenu,
  } = useTargetMenu<string>(groupId => {
    const group = groupById(groupId);
    return group ? getGroupMenuItems(group) : [];
  }, headerMenuRef);

  /** 分组头「菜单正针对我」的样式判据 */
  const isHeaderMenuTargetFor = (groupId: string): boolean =>
    isHeaderMenuOpen.value && headerMenuTargetId.value === groupId;

  /* ---------- 组内卡片菜单 ---------- */

  /** 和弦卡片的右键菜单项（原在 ChordCard 内；委托后由列表侧按目标卡构建） */
  const getChordCardMenuItems = (cardData: GroupedChordCard, variantIndex: number): MenuItem[] => {
    const activeChord = cardData.variants[variantIndex] ?? cardData.mainChord;
    const hasReferences = lookupChordReferences(cardData.variants.map(v => v.id)) > 0;
    // 复制 / 分享：多指法时展开为级联子菜单逐指法操作，单指法不展开直接操作当前展示的指法
    return [
      {
        label: '复制和弦',
        icon: 'copy',
        expandChildren: cardData.hasVariants,
        action: () => void copyChordCardText(activeChord),
        children: cardData.variants.map((variant, index) => ({
          label: `指法 ${index + 1}`,
          icon: 'copy',
          action: () => void copyChordCardText(variant),
        })),
      },
      {
        label: '分享和弦',
        icon: 'share-2',
        expandChildren: cardData.hasVariants,
        action: () => void shareChordLink(activeChord),
        children: cardData.variants.map((variant, index) => ({
          label: `指法 ${index + 1}`,
          icon: 'share-2',
          action: () => void shareChordLink(variant),
        })),
      },
      {
        label: '移动分组',
        icon: 'move',
        action: () => emit('open-move', activeChord),
      },
      {
        label: '引用反查',
        icon: 'link-2',
        disabled: !hasReferences,
        action: () => emit('open-references', cardData),
      },
      {
        label: '删除和弦',
        icon: 'trash-2',
        danger: true,
        action: () => {
          if (cardData.hasVariants) emit('open-delete-variants', cardData);
          else handleLocalDeleteChord(cardData.mainChord);
        },
      },
    ];
  };

  /** 卡片右键菜单：目标为「组内该卡 + 它当时展示的指法下标」。
   *  getChordCardMenuItems 内含 lookupChordReferences 的全库引用反查，交给 useTargetMenu 的
   *  computed 缓存 —— 否则模板里的函数调用**每次重渲染**都会重跑一遍全库反查。 */
  const {
    target: cardMenuTarget,
    isOpen: isCardMenuOpen,
    items: cardMenuItems,
    openAt: openCardMenuAt,
    close: closeCardMenu,
  } = useTargetMenu<{ cardData: GroupedChordCard; variantIndex: number }>(
    ({ cardData, variantIndex }) => getChordCardMenuItems(cardData, variantIndex),
    cardMenuRef
  );

  /** 卡片「菜单正针对我」的样式判据（下发给 ChordCard 的 menu-target） */
  const isCardMenuTarget = (cardId: string): boolean =>
    isCardMenuOpen.value && cardMenuTarget.value?.cardData.mainChord.id === cardId;

  /**
   * 右键委托（挂在列表容器上，**捕获阶段**，一次判定两种目标）：
   *
   * ① **捕获阶段** —— 挂在容器捕获期即先于组内一切监听执行，因此不必依赖「组内没有哪一层截住右键
   *    冒泡」这一前提；同时也免去「每个分组行各挂一条等价监听」。组内容外层原先挂过一条
   *    @contextmenu.stop（挡的是冒泡期的分组菜单），现在右键判定统一收在这里，那条 .stop 已随
   *    分组菜单的包裹层一并删除。
   * ② **只认两种目标** —— 分组头 → 分组菜单；组内卡片 → 卡片菜单；其余（组内空白、分组间隙）
   *    直接返回、不拦事件，浏览器原生菜单照旧。
   * ③ **打开统一走 useTargetMenu** —— 「写目标 → 等一拍 → openMenuAt」的三段式已收进 composable
   *    （见 useTargetMenu 的 ②），这里只负责把命中的目标交给它。
   */
  const handleListContextMenu = (e: MouseEvent): void => {
    const el = e.target as HTMLElement | null;
    if (!el) return;

    // 分组头：目标落在折叠头本体上（data-group-id 由 useStickyHeads 的 headBind 挂在头上）
    const headHost = el.closest<HTMLElement>('[data-collapse-head]');
    if (headHost) {
      const { groupId } = headHost.dataset;
      if (!groupId) return;
      e.preventDefault();
      e.stopPropagation();
      openHeaderMenuAt(e, groupId);
      return;
    }

    // 组内卡片：卡片自带 data-chord-id，所属分组由分组行上的 data-group-id 反查
    const cardHost = el.closest<HTMLElement>('[data-chord-id]');
    const cardId = cardHost?.dataset['chordId'];
    if (!cardHost || !cardId) return;
    const group = groupById(el.closest<HTMLElement>('[data-group-id]')?.dataset['groupId']);
    const cardData = group ? cardsOf(group).find(c => c.mainChord.id === cardId) : undefined;
    if (!cardData) return;

    const raw = Number(cardHost.dataset['variantIndex'] ?? 0);
    e.preventDefault();
    e.stopPropagation();
    openCardMenuAt(e, { cardData, variantIndex: Number.isFinite(raw) ? raw : 0 });
  };

  return {
    headerMenuItems,
    cardMenuItems,
    isHeaderMenuTargetFor,
    isCardMenuTarget,
    handleListContextMenu,
    closeHeaderMenu,
    closeCardMenu,
  };
}
