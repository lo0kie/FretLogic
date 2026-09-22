/**
 * 备份包版本迁移链：把任意旧版本 payload 逐级抬升到当前版本。
 *
 * 从 payload.ts 抽出（原 28~159 行）。拆出的理由：每次结构变更都会在这里追加一档，
 * 它是全文件最常改动的一块，且与「schema 校验 / 实体清洗」互不依赖——
 * 迁移只做旧字段的原地改写，不认识 zod schema，也不碰 persistedData 的实体清洗。
 */

import { parseSlotKey } from '@/domains/score/model/chordSlots';

import type { RawRecord, RawSong } from './payloadRawShapes';
import type { ImportExportPayload } from '@/app/types';
import type { Chord } from '@/domains/chord/types';

/** 备份包结构版本：每次结构变更（字段迁移/删除/语义调整）递增 */
export const CURRENT_PAYLOAD_VERSION = 7;

/**
 * 迁移只遍历「确实是数组」的集合。
 *
 * `payload.chords` / `payload.songs` 的数组类型来自 payload.ts 里 `raw as unknown as ImportExportPayload`
 * 的收窄，而这份数据是外部 JSON——运行时完全可能是对象或字符串，此时 `?.forEach` 直接 TypeError，
 * 把「校验层返回 issues」的契约打成未捕获异常（云同步 pull / 备份导入 / shareLink / 启动转录四个调用方都不 catch）。
 * 这里刻意**不改写原值**：非法集合原样留给 sanitizeChords / sanitizeSongs，由它们落 `… 字段必须为数组` 的 issue。
 */
const forEachRecord = <T>(list: readonly T[] | undefined, visit: (item: T) => void): void => {
  if (Array.isArray(list)) list.forEach(visit);
};

/**
 * 版本迁移：把任意旧版本 payload 逐级升级到当前版本。
 * 每档迁移负责一个具体结构变更，结构稳定后保留空实现作为版本标记。
 */
const PAYLOAD_MIGRATIONS: Record<number, (payload: ImportExportPayload) => void> = {
  1: () => {
    // v1 -> v2：isRoot/label/isAccidental/isInverted/fingerprint 等派生字段已移除，
    // 由 normalizeChord 在 sanitize 阶段统一清理，此处无需额外处理。
  },
  2: (payload: ImportExportPayload) =>
    // v2 -> v3：把历史混合写法（元组 / 对象 / 缺字段）统一收敛为对象数组 [{fret, preferFlat}]，
    // 同时把历史遗留的数字 id 规范化为字符串（songs.chordMap 引用均为字符串，需保持匹配）
    void forEachRecord(payload.chords, chord => {
      if (!chord || typeof chord !== 'object') return;
      const legacyChord = chord as { id?: unknown };
      if (typeof legacyChord.id === 'number') legacyChord.id = String(legacyChord.id);

      if (
        Array.isArray(chord.strings) &&
        chord.strings.length >= 3 &&
        chord.strings.length <= 10 &&
        chord.strings.some(s => !Array.isArray(s))
      )
        chord.strings = chord.strings.map(s => {
          // 元素本身可能是 null / 非对象（外部 JSON），直接取属性会 TypeError
          const legacy = (s !== null && typeof s === 'object' ? s : {}) as { fret?: unknown; preferFlat?: unknown };
          return { fret: typeof legacy.fret === 'number' ? legacy.fret : -1, preferFlat: Boolean(legacy.preferFlat) };
        }) as Chord['strings'];
    }),
  3: (payload: ImportExportPayload) =>
    // v3 -> v4：song.key 移除，改由 playKey + capo 实时派生。
    // sanitizeSongs 会兜底 playKey 并丢弃 key，此处防御性清理旧数据。
    void forEachRecord(payload.songs, song => {
      if (song && typeof song === 'object' && 'key' in song) {
        const legacy = song as unknown as RawSong;
        if (typeof legacy.playKey !== 'string' || !legacy.playKey)
          legacy.playKey = typeof legacy['key'] === 'string' && legacy['key'] ? legacy['key'] : 'C';

        delete legacy['key'];
      }
    }),
  4: () => {
    // v4 -> v5：新增可选 syncSettings（云端同步配置随备份导出/导入），旧包无此字段，无需处理。
  },
  5: () => {
    // v5 -> v6：新增可选 preferences（偏好设置随备份导出/导入），旧包无此字段，无需处理。
  },
  6: (payload: ImportExportPayload) => {
    // v6 -> v7：琴弦由二维元组 [[fret, preferFlat]] 改为对象 {fret, preferFlat}，
    // 物理品位与显示偏好解耦（chordMap 的 v7 迁移见下方子迁移，同一档内追加）。
    forEachRecord(payload.chords, chord => {
      if (!chord || typeof chord !== 'object') return;
      if (Array.isArray(chord.strings) && chord.strings.some(s => Array.isArray(s)))
        chord.strings = chord.strings.map(s => {
          // 非数组元素（null / 对象混入）退化为空元组，交给下面两个 typeof / Boolean 兜底成 -1、false
          const tuple = Array.isArray(s) ? (s as unknown as [number, boolean]) : [];
          return { fret: typeof tuple[0] === 'number' ? tuple[0] : -1, preferFlat: Boolean(tuple[1]) };
        }) as Chord['strings'];
    });

    // chordMap 子迁移：旧扁平对象（key 形如 line_{lineId}_{char|start|end}_{index}）→ 按行分组的
    // 嵌套结构 { [lineId]: { char: { [idx]: id }, start: [], end: [] } }；已为嵌套结构的包跳过。
    forEachRecord(payload.songs, song => {
      if (!song || typeof song !== 'object') return;
      const rawMap = (song as unknown as RawRecord)['chordMap'];
      if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return;
      const entries = Object.entries(rawMap as Record<string, unknown>);
      // 嵌套结构的值是 { char, start, end } 对象，扁平结构的值是字符串和弦 id
      if (entries.some(([, v]) => Boolean(v) && typeof v === 'object' && !Array.isArray(v))) return;
      const nested: Record<string, { char: Record<string, string>; start: string[]; end: string[] }> = {};
      const pendingEdges = new Map<string, { type: 'start' | 'end'; index: number; id: string }[]>();
      for (const [key, id] of entries) {
        if (typeof key !== 'string' || typeof id !== 'string' || !id) continue;
        const parsed = parseSlotKey(key);
        if (!parsed) continue;
        const slots = (nested[parsed.lineId] ??= { char: {}, start: [], end: [] });
        if (parsed.type === 'char') slots.char[String(parsed.index)] = id;
        else {
          const list = pendingEdges.get(parsed.lineId) ?? [];
          list.push({ type: parsed.type, index: parsed.index, id });
          pendingEdges.set(parsed.lineId, list);
        }
      }
      // 边和弦按 index 排序落位，缺失 index 不留空洞
      for (const [lineId, list] of pendingEdges) {
        const slots = nested[lineId];
        if (!slots) continue;
        const startIds = list
          .filter(e => e.type === 'start')
          .sort((a, b) => a.index - b.index)
          .map(e => e.id);
        const endIds = list
          .filter(e => e.type === 'end')
          .sort((a, b) => a.index - b.index)
          .map(e => e.id);
        if (startIds.length > 0) slots.start = startIds;
        if (endIds.length > 0) slots.end = endIds;
      }
      (song as unknown as RawRecord)['chordMap'] = nested;
    });
  },
};

/**
 * 把输入 payload 版本抬升到当前版本（原地修改 + 返回新 version）。
 *
 * `version` 是外部 JSON 读来的，运行时类型不受 `PayloadVersion` 声明约束，
 * 进 while 前必须归一化——旧实现直接 `payload.version ?? 1` 就丢进 `version += 1` 的循环：
 * 字符串走的是**拼接**而非自增，`version: "-5"` 时 `"-5" + 1 === "-51"`、`"-51" + 1 === "-511"`，
 * 永远小于当前版本，是真正的死循环（且字符串无界增长，最终 OOM）；
 * 负数如 `-1e9` 则是十亿次空转，主线程当场冻结。
 *
 * 归一化规则：只接受 `>= 1` 的整数；字符串 / NaN / 小数 / 负数一律回落到 1
 * （最小可信版本，从链头完整走一遍最安全）。上侧越界收口到 CURRENT（跳过迁移）——与旧行为一致。
 */
export const migratePayloadVersion = (payload: ImportExportPayload): ImportExportPayload => {
  const raw = payload.version;
  const declared = typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : 1;
  let version = Math.min(declared, CURRENT_PAYLOAD_VERSION);
  while (version < CURRENT_PAYLOAD_VERSION) {
    PAYLOAD_MIGRATIONS[version]?.(payload);
    version += 1;
  }
  return { ...payload, version: CURRENT_PAYLOAD_VERSION };
};
