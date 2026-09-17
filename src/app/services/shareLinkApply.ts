/**
 * 分享载荷落地实现（懒加载模块，由 shareLinkBridge 动态 import）：
 * 按魔数分诊载荷类型 → 交给对应域的导入能力（乐谱 / 分组 / 和弦）落地。
 *
 * 独立成模块的原因：落地依赖 textCodec / chordTextCodec / useTextTransfer / useChordTransfer
 * 整条编解码链，只在 URL 上真的出现分享参数时才需要；App.vue 装配的桥接器
 * （shareLinkBridge）保持轻量（路由监听 + token 去重），不把这些链路拖进首屏闭包。
 */
import { parseChordFromText, parseGroupFromText } from '@/domains/chord/transfer/chordTextCodec';
import { useChordTransfer } from '@/domains/chord/transfer/useChordTransfer';
import { parseSongFromText } from '@/domains/score/transfer/textCodec';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { TEXT_FORMAT } from '@/platform/utils/constants';

/** 分享载荷类型：与 TEXT_FORMAT 的三个魔数一一对应 */
type SharePayloadKind = 'song' | 'group' | 'chord';

/**
 * 按首行魔数严格判定载荷类型。
 * 刻意不走解析器的宽容匹配：`parseSongFromText` 对任意散文文本都会尝试「纯歌词兜底」，
 * 若凭它分流，一条被篡改/截断的参数会被静默吞成一堆乱码歌词。
 */
const detectPayloadKind = (text: string): SharePayloadKind | null => {
  const header = text.split('\n')[0]?.trim() ?? '';
  if (header.startsWith(TEXT_FORMAT.SONG)) return 'song';
  if (header.startsWith(TEXT_FORMAT.GROUP)) return 'group';
  if (header.startsWith(TEXT_FORMAT.CHORD)) return 'chord';
  return null;
};

const { importPortableSong } = useTextTransfer();
const { importSharedChord, importSharedGroup } = useChordTransfer();

/** 载体落地：按类型分发到对应域的导入能力；返回是否成功（各域内部自带成功提示） */
export const applyPayload = (text: string): boolean => {
  const kind = detectPayloadKind(text);
  if (!kind) return false;

  if (kind === 'song') {
    const result = parseSongFromText(text);
    // needsConfirm 为 true 说明走的不是结构化解析、而是「纯文本兜底」（版本不匹配 / 载荷被破坏），
    // 分享链路一律判为无效，免得把半截载荷当成一堆歌词导进库里
    if (!result.ok || result.data.needsConfirm) return false;
    importPortableSong(result.data);
    return true;
  }

  if (kind === 'group') {
    const result = parseGroupFromText(text);
    if (!result.ok) return false;
    importSharedGroup(result.data);
    return true;
  }

  const result = parseChordFromText(text);
  if (!result.ok) return false;
  importSharedChord(result.data);
  return true;
};
