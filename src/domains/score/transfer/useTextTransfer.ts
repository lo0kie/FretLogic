/**
 * 乐谱域文字传递服务**状态壳**（对外 API 与拆分前完全一致）：
 * 复制乐谱到剪贴板、从剪贴板导入、生成分享链接，以及单和弦复制/粘贴（委托和弦域）。
 *
 * 四条入口共用**一种载体**（token：载荷文本 + 压缩编码）：
 * - 生成侧：`buildSongPayload`（载荷）→ `buildSongToken`（载体）是唯一来源，复制与分享都调它，
 *   差别只是分享在 token 外套了一层地址；
 * - 消费侧：`resolveTransferPayload` 把「地址 / 裸 token / 手写歌词 / 旧版纯文本」归一成同一份文本，
 *   再由 `importPortableSong` 这一个落地实现建谱。
 * 入口宽容度的唯一分叉在**载体之外**：剪贴板里可能是用户手写的**无结构纯歌词**（放行，由调用方弹确认框），
 * 而 URL 载荷必定出自本应用的序列化器，半截/篡改的参数必须判无效，不能兜底成一堆乱码歌词
 * （该判定在 app/services/shareLinkBridge）。
 *
 * 实现体（textCodec / useChordTransfer / shareLink 压缩编码链路）在 textTransferActions.ts，
 * 经动态 import 懒加载：这些模块只在用户触发复制/粘贴/分享时才需要，不进首屏闭包。
 * 文字中未入库的和弦自动生成并归入「{乐谱名}」分组。
 */
import type { Chord } from '@/domains/chord/types';
import type { PortableSong } from '@/domains/score/transfer/textCodec';
import type { Song } from '@/domains/score/types';

/** 乐谱粘贴结果：imported 已建谱 | needsConfirm 无结构纯歌词需用户确认 | none 无操作（读取失败/无法识别） */
export type PasteSongOutcome =
  { status: 'imported' } | { status: 'needsConfirm'; portable: PortableSong } | { status: 'none' };

/** 懒加载传递实现（见 textTransferActions.ts 文件头注释） */
const loadActions = () => import('./textTransferActions');

/**
 * 预取传递实现模块（只拉取不执行）：
 * 供宿主 UI 挂载 / 空闲时机调用，把 chunk 下载提前到用户触发复制/粘贴之前，消除反馈死区。
 */
export const preloadTextTransferActions = (): Promise<unknown> => loadActions();

export function useTextTransfer() {
  return {
    copyChordText: (chord: Chord) => loadActions().then(m => m.copyChordText(chord)),
    copyChordCardText: (chord: Chord) => loadActions().then(m => m.copyChordCardText(chord)),
    pasteChordFromClipboard: () => loadActions().then(m => m.pasteChordFromClipboard()),
    copySongText: (song: Song | null) => loadActions().then(m => m.copySongText(song)),
    pasteSongFromClipboard: (): Promise<PasteSongOutcome> => loadActions().then(m => m.pasteSongFromClipboard()),
    importPortableSong: (p: PortableSong) => loadActions().then(m => m.importPortableSong(p)),
    shareSongLink: (song: Song | null) => loadActions().then(m => m.shareSongLink(song)),
  };
}
