/**
 * 落点解析的两条路径与它们的合帧分派。
 *
 * 内部源（有源槽位）走 `elementFromPoint` 精确命中；外部源（选器和弦浮动面板等）走几何就近，
 * 刻意绕过命中测试 —— 浮层会干扰它。两条路径的落点由同一个 `dragOverSlotKey` 承载，
 * 故更新入口必须一起分派（见 `scheduleBySource` 的注释）。
 *
 * 两条路径都按帧合帧，且**合帧的只是「什么时候找落点」，不是「怎么找」**：
 * 外部源同样是「先读几何、后写状态」，而且读得更重（行矩形逐个读、槽位吸附再读一遍），
 * 写入的状态（撑开行 / 落点边框）又会让整行样式失效。同步执行 = 在指针事件里读脏样式：
 * 起拖那一次尤其贵，那一刻刚给 body 挂上 is-global-dragging（该标记命中 `& *`，整篇样式失效），
 * 而外部源的第一句就是 `elementFromPoint`（实测一次强制重排 ~36ms）。
 */
import { useRafThrottle } from '@/platform/composables/useRafThrottle';

import { createExternalDropResolver } from './externalDropTarget';

import type { SetExternalDropTarget } from './externalDropTarget';
import type { Ref } from 'vue';

export interface DropTargetRouterOptions {
  /** 谱面滚动容器：外部源的几何就近要按它换算 */
  scrollContainerRef?: Ref<HTMLElement | null>;
  /** 当前源槽位键的读取器：非空 = 内部源（精确命中），空 = 外部源（几何就近） */
  getSourceSlotKey: () => string | null;
  /** 取消区判据：命中即跳过落点解析（两条路径共用同一条判据） */
  applyCancelZone: (x: number, y: number) => boolean;
  /** 内部源的落点写入 */
  updateDropTarget: (x: number, y: number) => void;
  /** 外部源的落点写入。**签名与内部源不同**：外部源解析出的是「槽位键 + 行 id」（行内空白处
   *  键为 null、行 id 仍有效，供撑开该行），不是坐标 —— 类型直接取解析器那边的
   *  `SetExternalDropTarget`，避免两处各写一遍签名后分叉。 */
  setExternalDropTarget: SetExternalDropTarget;
}

export interface DropTargetRouterApi {
  /**
   * 落点更新按拖拽源分派。自动滚动的每帧回调此前固定走内部源那条，外部拖拽一旦滚起来就切回
   * 命中测试 —— 指针下方是浮动面板时命中不到槽位，落点被清空，松手无处可落。
   */
  scheduleBySource: (x: number, y: number) => void;
  /** 外部源快照当前已渲染的歌词行，供几何就近计算使用（起拖时调一次） */
  snapshotExternalLineEls: () => void;
  /** 抬起时的两条 flush：起拖 / 最后一次 move 的落点若还排在帧里，松手就按空落点落地 */
  flushAll: () => void;
  /** 丢弃两条节流里排队的帧 */
  discardPendingFrames: () => void;
}

export const createDropTargetRouter = (options: DropTargetRouterOptions): DropTargetRouterApi => {
  const {
    schedule: scheduleDropFrame,
    flush: flushDropTargetUpdate,
    cancel: cancelDropTargetUpdate,
  } = useRafThrottle<{ x: number; y: number }>(pos => {
    if (!options.applyCancelZone(pos.x, pos.y)) options.updateDropTarget(pos.x, pos.y);
  });

  const externalDropResolver = createExternalDropResolver(options.scrollContainerRef);

  const {
    schedule: scheduleExternalDropFrame,
    flush: flushExternalDropTargetUpdate,
    cancel: cancelExternalDropTargetUpdate,
  } = useRafThrottle<{ x: number; y: number }>(pos => {
    if (!options.applyCancelZone(pos.x, pos.y))
      externalDropResolver.resolve(pos.x, pos.y, options.setExternalDropTarget);
  });

  const scheduleBySource = (x: number, y: number) => {
    if (options.getSourceSlotKey()) void scheduleDropFrame({ x, y });
    else void scheduleExternalDropFrame({ x, y });
  };

  return {
    scheduleBySource,
    snapshotExternalLineEls: () => externalDropResolver.snapshotLineEls(),
    flushAll: () => {
      flushDropTargetUpdate();
      flushExternalDropTargetUpdate();
    },
    discardPendingFrames: () => {
      cancelDropTargetUpdate();
      cancelExternalDropTargetUpdate();
    },
  };
};
