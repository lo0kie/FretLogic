/**
 * 渲染缓存键的唯一口径：A4 预览与整曲长图/分页导出必须共用同一份失效维度清单。
 *
 * 为什么收成一处：此前 `ScorePreviewPane.buildContentKey` 与 `scoreExportActions.buildLongImageCacheKey`
 * 各写一遍拼接，导出侧先后漏过横按签名与拍号——同一类缺陷（「画进图里的东西改了、键却没变」）
 * 表现为预览 / PDF / ZIP 全部刷新、唯独长图回吐旧 blob，只在其中一个入口复现，最难归因。
 * 键维度一旦分叉就没有第二条线索，故只允许存在一处定义。
 *
 * 维度清单：歌曲内容与元数据（id / 标题 / 歌者 / 选调 / 原调 / 拍号 / 变调夹 / 版本 / 歌词）
 * + 全部影响排版的导出设置 + 预览缩放档位 + **生效主题** + 各槽位引用和弦的「指纹:横按签名」。
 * 刻意不含「显示页脚」：页脚是独立合成层（见 services/footerOverlay），开关只是在页流的两套展示源
 * 之间切换（渲染线程合成好的带页码页图 / 无页脚原图），既不触发乐谱重渲染，也不为同一首歌多存一份缓存。
 */
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { activeTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/**
 * 乐谱内容键；`song` 为空（未选中乐谱）时返回空串，调用方据此判定「无缓存可复用」。
 *
 * 和弦维度取「当前乐谱各槽位实际引用的和弦指纹」而非整个和弦库：库内已有和弦的重新排列不会改变
 * 库数量，按数量判定会命中旧的渲染结果。`computeChordFingerprint` 不含横按，必须并拼
 * `computeBarresSignature`，否则仅改横按时键不变；查不到的引用以 `?<id>` 占位兜底。
 */
export const buildScoreRenderCacheKey = (song: Song | null, chordLookup: Map<string, Chord>): string => {
  if (!song) return '';

  const refSignatures: string[] = [];
  for (const slots of song.chordMap.values())
    for (const chordId of [...slots.char.values(), ...slots.start, ...slots.end]) {
      const chord = chordLookup.get(chordId ?? '');
      refSignatures.push(
        chord ? `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres)}` : `?${chordId}`
      );
    }

  // 排序后再拼接：槽位顺序不影响渲染结果，键也不应因顺序而分裂成两份
  refSignatures.sort();

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
    song.version,
    song.lyrics,
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
    refSignatures.join('|'),
  ].join('\u0001');
};
