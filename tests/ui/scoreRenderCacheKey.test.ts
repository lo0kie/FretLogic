import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { toSongId } from '@/domains/score/model/scoreModel';
import { buildScoreLineFingerprints } from '@/domains/score/preview/scoreLineFingerprints';
import { buildScorePageLevelKey, buildScoreRenderCacheKey } from '@/domains/score/preview/scoreRenderCacheKey';
import { activeTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';

/** 夹具窄化：源码里槽位键是 branded ChordId，测试按字面量书写后集中转换 */
const slotsOf = (...chordIds: string[]): ChordLineSlots => ({
  char: new Map(chordIds.map((id, index) => [index, id as ChordId])),
  start: [],
  end: [],
});

/** 夹具窄化：chordMap 的**键**同样是 branded（LineId），测试按字面量书写后集中转换 —— 同 slotsOf 的理由 */
const chordMapOf = (entries: [string, ChordLineSlots][]): Map<LineId, ChordLineSlots> =>
  new Map(entries.map(([lineId, slots]): [LineId, ChordLineSlots] => [lineId as LineId, slots]));

const buildSong = (overrides: Partial<Song> = {}): Song => ({
  id: toSongId('s1'),
  title: 'Song',
  singer: '',
  originalKey: '',
  timeSignature: '',
  lyrics: '',
  lineIds: [],
  playKey: 'C',
  capo: 0,
  chordMap: new Map(),
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('渲染缓存键口径', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeTheme.value = 'light';
  });

  it('未选中乐谱时返回空串（调用方据此判定无缓存可复用）', () => {
    expect(buildScoreRenderCacheKey(null, new Map())).toBe('');
  });

  it('乐谱内容变化会改变键', () => {
    const base = buildScoreRenderCacheKey(buildSong(), new Map());
    expect(buildScoreRenderCacheKey(buildSong({ title: '另一首' }), new Map())).not.toBe(base);
    expect(buildScoreRenderCacheKey(buildSong({ capo: 3 }), new Map())).not.toBe(base);
    expect(buildScoreRenderCacheKey(buildSong({ lyrics: 'la' }), new Map())).not.toBe(base);
  });

  it('槽位顺序不影响渲染结果，键也不应因顺序分裂成两份', () => {
    const ordered = buildSong({
      chordMap: chordMapOf([
        ['l1', slotsOf('c1', 'c2')],
        ['l2', slotsOf('c3')],
      ]),
    });
    const reversed = buildSong({
      chordMap: chordMapOf([
        ['l2', slotsOf('c3')],
        ['l1', slotsOf('c2', 'c1')],
      ]),
    });
    expect(buildScoreRenderCacheKey(reversed, new Map())).toBe(buildScoreRenderCacheKey(ordered, new Map()));
  });

  it('槽位引用的和弦集合变化会改变键', () => {
    const one = buildSong({ chordMap: chordMapOf([['l1', slotsOf('c1')]]) });
    const two = buildSong({ chordMap: chordMapOf([['l1', slotsOf('c1', 'c2')]]) });
    expect(buildScoreRenderCacheKey(two, new Map())).not.toBe(buildScoreRenderCacheKey(one, new Map()));
  });

  it('查不到的槽位引用以占位符兜底，且同一引用稳定', () => {
    const song = buildSong({ chordMap: chordMapOf([['l1', slotsOf('missing')]]) });
    const key = buildScoreRenderCacheKey(song, new Map());
    expect(key).toContain('?missing');
    expect(buildScoreRenderCacheKey(song, new Map())).toBe(key);
  });

  it('影响排版的导出设置与预览缩放进键', () => {
    const settings = useSettingsStore();
    const editor = useScoreEditorStore();
    const song = buildSong();

    const base = buildScoreRenderCacheKey(song, new Map());
    settings.scoreShowBarre = !settings.scoreShowBarre;
    const afterBarre = buildScoreRenderCacheKey(song, new Map());
    expect(afterBarre).not.toBe(base);

    editor.previewFontScale += 1;
    expect(buildScoreRenderCacheKey(song, new Map())).not.toBe(afterBarre);
  });

  it('生效主题进键：dark 与 high-contrast 不能共用同一份缓存', () => {
    const song = buildSong();
    activeTheme.value = 'dark';
    const dark = buildScoreRenderCacheKey(song, new Map());
    activeTheme.value = 'high-contrast';
    expect(buildScoreRenderCacheKey(song, new Map())).not.toBe(dark);
  });

  it('「显示页脚」刻意不进键：页脚是独立合成层，不触发乐谱重渲染', () => {
    const settings = useSettingsStore();
    const song = buildSong();
    const base = buildScoreRenderCacheKey(song, new Map());
    settings.scoreShowFooter = !settings.scoreShowFooter;
    expect(buildScoreRenderCacheKey(song, new Map())).toBe(base);
  });
});

/**
 * 键的两个投影（页级段 / 逐行指纹）是「编辑歌词后按页最小重建」的判据：判据把内容真的变了的页
 * 判成没变，屏上就会留着上一版的旧图，而键已经换代、没有任何机制会纠正它。故这里盯的是
 * 「哪些维度必须进、哪些必须不进」这条边界本身。
 */
describe('页级段与逐行指纹口径', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    activeTheme.value = 'light';
  });

  it('页级段：整页共有的维度进它，version / 歌词 / 槽位和弦不进', () => {
    const base = buildScorePageLevelKey(buildSong());

    // 标题这类整页共有的输入变了 ⇒ 一页都不能继承
    expect(buildScorePageLevelKey(buildSong({ title: '另一首' }))).not.toBe(base);
    // version 只是「发生过编辑」的粗暴标记，不描述画出来的东西：放进页级段等于任何编辑都不许继承
    expect(buildScorePageLevelKey(buildSong({ version: 9 }))).toBe(base);
    // 歌词与槽位和弦是**行级**信息，归逐行指纹承载（放这里会让「改一个字」把整谱的继承资格作废）
    expect(buildScorePageLevelKey(buildSong({ lyrics: 'la\nla' }))).toBe(base);
    expect(buildScorePageLevelKey(buildSong({ chordMap: chordMapOf([['l1', slotsOf('c1')]]) }))).toBe(base);
    // 未选中乐谱
    expect(buildScorePageLevelKey(null)).toBe('');
  });

  it('行指纹：下标即行号，只有内容变了的那些行会变', () => {
    const before = buildScoreLineFingerprints(buildSong({ lyrics: '甲\n乙\n丙' }), new Map());
    expect(before).toHaveLength(3);

    const after = buildScoreLineFingerprints(buildSong({ lyrics: '甲\n乙改\n丙' }), new Map());
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
  });

  it('行指纹：行内槽位引用的和弦参与指纹（只改和弦引用，该行也算变脏）', () => {
    const plain = buildScoreLineFingerprints(buildSong({ lyrics: 'ab' }), new Map());
    const withChord = buildScoreLineFingerprints(
      buildSong({ lyrics: 'ab', lineIds: ['l1' as LineId], chordMap: chordMapOf([['l1', slotsOf('c1')]]) }),
      new Map()
    );

    expect(withChord[0]).not.toBe(plain[0]);
    // 同一份数据重复求值必须稳定，否则每次渲染都会把整谱判成脏
    expect(buildScoreLineFingerprints(buildSong({ lyrics: 'ab' }), new Map())[0]).toBe(plain[0]);
  });

  it('行指纹：空歌词也是一行（与渲染侧的 split 口径一致），无谱时为空数组', () => {
    expect(buildScoreLineFingerprints(buildSong({ lyrics: '' }), new Map())).toHaveLength(1);
    expect(buildScoreLineFingerprints(null, new Map())).toEqual([]);
  });
});
