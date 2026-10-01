/**
 * 粘贴链路的共享前端：读剪贴板 → 载体归一 → empty/broken 两级提示 → 交给调用方的「末段解析器」。
 *
 * useChordTransfer（和弦/分组粘贴）与 score/transfer/textTransferActions（乐谱粘贴）的这段前置流程
 * 近逐字重复，且警告文案与触发条件是**用户体验契约**（同一仓库两种粘贴理应同一句话），故收在这里
 * —— score → chord 的依赖方向合法（textTransferActions 本就 import useChordTransfer）。
 * 末段解析交给回调：和弦侧要把 FLGROUP 魔数转投分组解析器、乐谱侧要区分 needsConfirm，
 * 两者返回形状不同，不适合再往里收。
 */
import { readTextFromClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';
import { resolveTransferPayload } from '@/platform/utils/transfer';

/**
 * 读取剪贴板并归一为载荷文本；empty / broken / 读不到三种情形各自提示后返回 null。
 * 归一成功时把载荷交给 handlePayload（末段解析器）收尾，其返回值原样上浮。
 */
export const pasteFromClipboard = async <T>(handlePayload: (payload: string) => Promise<T> | T): Promise<T | null> => {
  const uiStore = useUiStore();
  let raw: string;
  try {
    raw = await readTextFromClipboard();
  } catch (err) {
    uiStore.message.error(err instanceof Error ? err.message : '读取剪贴板失败');
    return null;
  }
  // 载体归一：分享地址 / 裸 token / 旧版纯文本都收敛成同一份载荷文本，之后一律按纯文本处理
  const resolved = await resolveTransferPayload(raw);
  if (resolved.status === 'empty') {
    uiStore.message.warning('剪贴板为空');
    return null;
  }
  if (resolved.status === 'broken') {
    uiStore.message.warning('传递内容已损坏，无法解析');
    return null;
  }
  return handlePayload(resolved.payload);
};
