import { computeChordFingerprint } from '@/services/music/theory';
import type { Chord, SlotKey } from '@/types';
import { plainToChordMap } from '@/utils/score/chordSlots';
import { charKey, chordSlotKey, collectEdgeChordIds } from '@/utils/score/scoreModel';

// ===== scoreLines: 谱面行数据与缓存 =====

export interface EdgeChordItem {
  slotKey: SlotKey;
  chord: Chord;
}

export interface CharItem {
  char: string;
  slotKey: SlotKey;
}

export interface LineData {
  lineIdx: number;
  lineId: string;
  chars: CharItem[];
  startChords: EdgeChordItem[];
  endChords: EdgeChordItem[];
  nextStartKey: SlotKey;
  nextEndKey: SlotKey;
}

const prevCharsByLineId = new Map<string, { text: string; chars: CharItem[] }>();
const prevEdgeChordsCache = new Map<string, { sig: string; chords: EdgeChordItem[] }>();

/** 读取某行某侧的边和弦（含缓存）：签名含和弦内容，和弦编辑后能正确失效缓存；同时给出下一个可用槽位键。 */
function getEdgeChordsWithNextKey(
  chordMap: Map<string, string>,
  lineId: string,
  type: 'start' | 'end',
  chordsLookupMap: Map<string, Chord>
) {
  const ids = collectEdgeChordIds(chordMap, lineId, type);
  // 签名必须包含和弦内容（指纹 + barres），否则编辑同一 id 的和弦后缓存命中旧对象，乐谱行首/行尾不刷新
  const sig = ids
    .map((id, idx) => {
      const chord = chordsLookupMap.get(id);
      const contentSig = chord ? `${computeChordFingerprint(chord)}:${JSON.stringify(chord.barres ?? null)}` : '-';
      return `${idx}:${id}:${contentSig}|`;
    })
    .join('');
  const cacheKey = `${lineId}_${type}`;
  const cached = prevEdgeChordsCache.get(cacheKey);
  if (cached && cached.sig === sig) {
    return { chords: cached.chords, nextKey: chordSlotKey(lineId, type, ids.length) };
  }

  const chords: EdgeChordItem[] = [];
  ids.forEach((chordId, idx) => {
    const foundChord = chordsLookupMap.get(chordId);
    if (foundChord) {
      chords.push({ slotKey: chordSlotKey(lineId, type, idx), chord: foundChord });
    }
  });
  prevEdgeChordsCache.set(cacheKey, { sig, chords });
  return { chords, nextKey: chordSlotKey(lineId, type, ids.length) };
}

/** 构建一行歌词的字符槽位序列，行文本未变化时复用缓存。 */
function buildChars(lineId: string, lineText: string): CharItem[] {
  const cached = prevCharsByLineId.get(lineId);
  if (cached && cached.text === lineText) {
    return cached.chars;
  }
  const chars = lineText.split('').map((char, charIdx) => ({
    char,
    slotKey: charKey(lineId, charIdx),
  }));
  prevCharsByLineId.set(lineId, { text: lineText, chars });
  return chars;
}

/** 构建乐谱行数据（歌词字符 + 行首/行尾和弦），并清理已消失行的缓存条目。 */
export function buildLyricsLinesWithEdges(
  lyrics: string,
  chordMap: Map<string, string>,
  chordsLookupMap: Map<string, Chord>,
  existingLineIds: string[] = []
): LineData[] {
  // 序列化边界守卫：内存契约要求 chordMap 为 Map；若从持久化/同步链路拿到普通对象，
  // 在此归一化为 Map，避免 collectEdgeChordIds 迭代直接抛错。纯等价转换，不改语义。
  const normalizedChordMap = chordMap instanceof Map ? chordMap : plainToChordMap(chordMap);
  const rawLines = lyrics.split('\n');
  const activeIds = new Set<string>();
  const result = rawLines.map((lineText, lineIdx) => {
    const lineId = existingLineIds[lineIdx] || String(lineIdx);
    activeIds.add(lineId);
    const { chords: startChords, nextKey: nextStartKey } = getEdgeChordsWithNextKey(
      normalizedChordMap,
      lineId,
      'start',
      chordsLookupMap
    );
    const { chords: endChords, nextKey: nextEndKey } = getEdgeChordsWithNextKey(
      normalizedChordMap,
      lineId,
      'end',
      chordsLookupMap
    );
    return {
      lineIdx,
      lineId,
      chars: buildChars(lineId, lineText),
      startChords,
      endChords,
      nextStartKey,
      nextEndKey,
    };
  });
  for (const id of prevCharsByLineId.keys()) {
    if (!activeIds.has(id)) {
      prevCharsByLineId.delete(id);
      prevEdgeChordsCache.delete(`${id}_start`);
      prevEdgeChordsCache.delete(`${id}_end`);
    }
  }
  return result;
}

/** 清空歌词行字符与边和弦的全部缓存（和弦库整体替换等场景调用）。 */
export function clearLyricsLineCharsCache() {
  prevCharsByLineId.clear();
  prevEdgeChordsCache.clear();
}

/** Canvas 转 Blob 的 Promise 封装。 */
export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas 转 Blob 失败'))), type, quality);
  });

/** 将任意图片 Blob 解码后重编码为 PNG Blob（JPEG→PNG 剪贴板降级用），失败保留原始异常。 */
const reencodeAsPng = async (blob: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化画布上下文');
    ctx.drawImage(bitmap, 0, 0);
    return await canvasToBlob(canvas, 'image/png');
  } finally {
    bitmap.close();
  }
};

/**
 * 复制图片 Blob 到剪贴板；环境不支持或页面失焦时抛错。
 * 注意：ClipboardItem 的键必须与 blob.type 完全一致，浏览器会校验类型匹配，
 * 伪造 MIME 键只会得到 NotAllowedError（类型不匹配）。因此当首选 MIME 写入失败时，
 * 唯一可靠的降级是把图片真正转码为 PNG（剪贴板事实标准）再重试，而非改声明。
 */
export const writeBlobToClipboard = async (blob: Blob): Promise<void> => {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器环境不支持复制图片到剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }

  const writeItem = (item: Blob, mime: string) => navigator.clipboard.write([new ClipboardItem({ [mime]: item })]);

  const mimeType = blob.type || 'image/png';
  try {
    await writeItem(blob, mimeType);
    return;
  } catch (originalErr) {
    // 已是最兼容的 PNG 且写入仍失败（权限/焦点等），无可降级空间，直接抛出
    if (mimeType === 'image/png') {
      throw originalErr;
    }
    // 非 PNG（如 Worker 导出的 image/jpeg）且首选写入被拒：转码为 PNG 后重试一次
    try {
      const pngBlob = await reencodeAsPng(blob);
      await writeItem(pngBlob, 'image/png');
    } catch {
      throw originalErr;
    }
  }
};

/** 延时工具（默认 0ms），用于导出前等待一帧渲染。 */
export const wait = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** 标题转安全文件名：剔除路径非法字符与多余空白，供下载命名使用。 */
export const buildExportFileName = (title: string): string => {
  const cleaned = title
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || 'score';
};

/** 触发单个 Blob 的浏览器下载，稍后释放对象 URL。 */
export const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};
