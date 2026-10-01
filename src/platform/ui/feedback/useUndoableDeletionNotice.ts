/**
 * 「可撤销的删除」通知：常驻通知 + 一键撤销，撤销成功后回一条提示。
 *
 * 四处删除共用这一份（删指法 / 删分组 / 删乐谱 / 排列区的删行与清槽和弦）。三件事值得在这里说一次：
 *
 * 1. **为什么是常驻通知而非常驻 Message**：撤销入口随 toast 飘走就没了，用户必须能回看并补做。
 *    常驻的代价由调用方承担 —— 撤销动作必须是**按精确快照还原那一次删除**，不能是「弹撤销历史栈顶」：
 *    通知挂在那里，用户完全可能先做别的编辑、隔一会儿再回来点它，那时栈顶早已不是这次删除，弹栈顶
 *    会撤掉那次编辑、而这次删除照旧。四处实现都各记精确快照（`chordStore.removeChordsSnapshot` /
 *    `chordStore.deleteGroup`、`songStore.deleteSong` + 原始下标、`scoreEditorStore.restoreDeleted*`）。
 * 2. **文案分两段**：`title` 是「删掉了什么」（通知标题），`restoredTip` 是「撤回了什么」（成功提示）。
 *    两者措辞不同（「已删除 2 个指法」/「已恢复刚才删除的和弦」），故不合并成一句。
 * 3. **形态是 composable**：调用方在 setup 里取一次，拿到的是**已绑定 store 的通知函数**。
 *    与 `app/services/persistFailureNotice` 同一条口径 —— store 实例在「已知有活跃 pinia」的那一刻解析
 *    一次、被闭包捕获，而不是每次调用时再去问「现在谁是活跃 pinia」：后者能跑，但把依赖藏进了环境状态。
 */
import { useUiStore } from '@/platform/store/uiStore';

export interface UndoableDeletionNotice {
  /** 通知标题：删掉了什么，如「已删除 2 个指法」 */
  title: string;
  /** 撤销成功后的提示：撤回了什么，如「已恢复刚才删除的和弦」 */
  restoredTip: string;
  /**
   * 撤销**未能**还原时的提示（如「该乐谱已被删除」）；缺省则静默不提示。
   *
   * 只在 `undo` 返回 `false` 时使用：常驻通知可能在目标已消失之后才被点到（先切歌、再删谱），
   * 此时无条件报 `restoredTip` 就是假提示。
   */
  failedTip?: string;
  /** 按精确快照还原这一次删除（见文件头第 1 条）；返回 `false` 表示未能还原，调用方据此不报成功提示 */
  undo: () => boolean | void;
}

export const useUndoableDeletionNotice = (): ((notice: UndoableDeletionNotice) => void) => {
  const uiStore = useUiStore();

  return ({ title, restoredTip, failedTip, undo }) =>
    void uiStore.notice.info({
      title,
      actionText: '撤销',
      onAction: () => {
        // `false` 是「没能还原」的唯一信号（`void` 视为已还原，兼容不判失败的调用方）
        if (undo() === false) {
          if (failedTip) uiStore.message.warning(failedTip);
          return;
        }
        uiStore.message.success(restoredTip);
      },
    });
};
