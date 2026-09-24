/**
 * 渲染缓存键的唯一口径：A4 预览与整曲长图/分页导出必须共用同一份失效维度清单。
 *
 * 为什么收成一处：此前 `ScorePreviewPane.buildContentKey` 与 `scoreExportActions.buildLongImageCacheKey`
 * 各写一遍拼接，导出侧先后漏过横按签名与拍号——同一类缺陷（「画进图里的东西改了、键却没变」）
 * 表现为预览 / PDF / ZIP 全部刷新、唯独长图回吐旧 blob，只在其中一个入口复现，最难归因。
 * 键维度一旦分叉就没有第二条线索，故只允许存在一处定义。
 *
 * 维度清单：歌曲内容与元数据（id / 标题 / 歌者 / 选调 / 原调 / 拍号 / 变调夹 / 版本 / 歌词）
 * + 全部影响排版的导出设置 + 预览缩放档位 + **生效主题** + 各槽位引用和弦的「位置=指纹:横按签名」。
 * 刻意不含「显示页脚」：页脚是独立合成层（见 services/footerOverlay），开关只是在页流的两套展示源
 * 之间切换（渲染线程合成好的带页码页图 / 无页脚原图），既不触发乐谱重渲染，也不为同一首歌多存一份缓存。
 *
 * 【同一个维度清点，三个投影】除键本身，这里还导出 `buildScorePageLevelKey`（键去掉
 * version / 歌词 / 槽位和弦指纹后的「页级段」），而**逐行**指纹在 scoreLineFingerprints。
 * 三者是同一次清点的三个粒度，供「编辑歌词后按页最小重建」判定上一版的哪几页还能原样复用
 * （见 ScorePreviewPane 的继承分支与 scorePreviewCache 的 movePages）：
 * 页级段不同 ⇒ 标题 / 设置 / 主题这类**整页共有**的输入变了，一页都不能信；页级段相同 ⇒
 * 再按行指纹找出内容变了的行，与上一版的 pageLineRanges 求交即得必须重画的页。
 * 这两个投影必须与键**同源**：任何「画进图里」的字段若只进了键、没进它们，继承就会把旧页
 * 当成新页贴出去（键已换代，再没有任何机制会纠正那一屏）。
 */
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { activeTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/**
 * 键的「页级段」：除 `version` / 歌词 / 槽位和弦指纹之外的**全部**渲染输入，即
 * 「整页共有、与具体某一行无关」的那一批维度。
 *
 * 【为什么 version 不在其中】version 是乐观锁版本号，任何一次编辑（含纯元数据）都会自增。
 * 它对键的意义是「发生过编辑，宁可重渲」这一粗暴兜底；但它并不描述**画出来的东西**，
 * 放进页级段等于「任何编辑都不许按页继承」——那正是本投影要拆开的东西。
 *
 * 【为什么和弦引用不在其中】整曲级的槽位和弦指纹留在键里（和弦库改了形状而槽位引用没变时，
 * 只有它能发现），但它是**逐行**的信息，交给 scoreLineFingerprints 按行承载才够精确：
 * 放这里会让「改一个和弦」把整谱的继承资格一并作废。
 */
/**
 * 页级段的原始值清单。各段只用于拼成键、不做语义解析，故允许混着原始类型
 * （number / boolean / 联合字面量）：统一由 `buildScorePageLevelKey` 的 `map(String)` 转换，
 * 不必逐个 `String()` —— 那只是把「join 会隐式转换」从隐式搬到显式，并不增加任何约束力。
 */
const buildPageLevelSegments = (song: Song): (string | number | boolean)[] => {
  const settingsStore = useSettingsStore();
  const scoreEditor = useScoreEditorStore();

  return [
    song.id,
    song.title,
    song.singer,
    song.playKey,
    song.originalKey,
    song.timeSignature,
    song.capo,
    // 主题维度必须取**生效主题**而不是 isDark：isDark = activeTheme !== 'light'，dark 与
    // high-contrast 同为 true ⇒ 切到高对比主题时键不变、命中旧缓存，预览/长图/PDF 仍是旧墨色
    // （--fbc-* 在 dark 与 HC 下是不同字面色：dark.ts vs high-contrast.ts）。
    // FretboardCanvas 的位图缓存键用的就是完整 activeTheme，此处与它同口径。
    activeTheme.value,
    settingsStore.scoreChordShorthand,
    settingsStore.scoreShowBarre,
    settingsStore.scoreTrimEmptyEdgeFrets,
    settingsStore.scoreLayoutAlign,
    settingsStore.scoreLyricsFontWeight,
    settingsStore.scoreExportQuality,
    settingsStore.scorePageMargin,
    settingsStore.scorePageSize,
    settingsStore.scoreIgnoreEmptySpace,
    scoreEditor.previewFontScale,
    scoreEditor.previewFretboardScale,
  ];
};

/**
 * 各槽位实际引用的和弦的「位置=指纹:横按签名」集合（排序后拼接）。
 *
 * 取「当前乐谱各槽位实际引用的和弦指纹」而非整个和弦库：库内已有和弦的重新排列不会改变
 * 库数量，按数量判定会命中旧的渲染结果。`computeChordFingerprint` 不含横按，必须并拼
 * `computeBarresSignature`，否则仅改横按时键不变；查不到的引用以 `?<id>` 占位兜底。
 *
 * 【为什么位置必须进签名】和弦引用是**逐槽位**的渲染输入：同一对和弦在相邻两个槽位上对调，
 * 画在第 1 / 第 2 个字上方的和弦名就换了人。只收「这批和弦长什么样」，这种对调会被判成同一份
 * 内容、键不变 ⇒ 回吐旧图。位置维度此前只被 `song.version` 兜着（任何编辑都自增），
 * 但那是乐观锁的兜底、不是这一维度的凭据。排序仍保留，用来抵消 chordMap 的插入顺序差异。
 */
const buildChordRefSignatures = (song: Song, chordLookup: Map<string, Chord>): string => {
  /** 单个和弦引用的签名；查不到的引用以 `?<id>` 占位（与逐行指纹同口径，不静默当「没有和弦」） */
  const chordSignature = (chordId: string | null | undefined): string => {
    const chord = chordLookup.get(chordId ?? '');
    return chord ? `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres)}` : `?${chordId}`;
  };

  const refSignatures: string[] = [];
  for (const [lineId, slots] of song.chordMap) {
    // 行首 / 行尾和弦按出现顺序编号：下标同样决定它画在第几个字符上方
    slots.start.forEach((chordId, k) => refSignatures.push(`${lineId}:s${k}=${chordSignature(chordId)}`));
    for (const [charIndex, chordId] of slots.char)
      refSignatures.push(`${lineId}:c${charIndex}=${chordSignature(chordId)}`);
    slots.end.forEach((chordId, k) => refSignatures.push(`${lineId}:e${k}=${chordSignature(chordId)}`));
  }

  // 排序后再拼接：chordMap 的插入顺序不影响渲染结果，键也不应因顺序而分裂成两份
  refSignatures.sort();
  return refSignatures.join('|');
};

/**
 * 键的页级段（见上方说明）。「编辑歌词后按页最小重建」的第一道判据：与上一版条目记录的
 * 页级段逐字相同，才谈得上继承它的页。
 *
 * `song` 为空（未选中乐谱）时返回空串，调用方据此判定「无可比较对象」。
 * 刻意不接和弦查找表：和弦是**逐行**的维度，归 scoreLineFingerprints 承载（见上方说明）。
 */
export const buildScorePageLevelKey = (song: Song | null): string => {
  if (!song) return '';
  return buildPageLevelSegments(song).map(String).join('\u0001');
};

/**
 * 乐谱内容键；`song` 为空（未选中乐谱）时返回空串，调用方据此判定「无缓存可复用」。
 *
 * 结构＝页级段 + version + 歌词整串 + 槽位和弦指纹：后三段是「页级段之外」的那三块信息，
 * 各自负责 version（编辑兜底）/ 行文本 / 行内和弦。四段定长定序拼接，分隔符不会产生歧义。
 */
export const buildScoreRenderCacheKey = (song: Song | null, chordLookup: Map<string, Chord>): string => {
  if (!song) return '';
  return [buildScorePageLevelKey(song), song.version, song.lyrics, buildChordRefSignatures(song, chordLookup)]
    .map(String)
    .join('\u0001');
};
