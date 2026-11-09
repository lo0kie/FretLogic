/**
 * 分片生成与同步生成必须产出**同构**的数据。
 *
 * 背景：顶满规模下同步生成是一个数秒的不可打断长任务（页面整段僵住），故新增了
 * `buildDevTestDataAsync`（片间让出事件循环）。分片只该改变「什么时候让出」，**不该改变产出** ——
 * 一旦两者漂移，同一套规模参数在开发面板（走 async）与其它调用点（走 sync）下会得到不同的库，
 * 而这种漂移在界面上只表现为「数据看着不太一样」，极难归因。
 *
 * 比较口径：随机源（RNG 种子）决定了每首歌的歌词、行数、槽位绑定与各短字段，那是**必须**逐字段
 * 相同的主体；而 `generateUUID()` 与 `baseTime = Date.now() - …` 本来就随时间变，两次调用必然不同
 * （同步版连跑两遍也一样），故按「结构 + 随机产物」比较：id 与时间戳只校验**形态**；lineId / chordId
 * 由 UUID 派生，也随时间变，故把**结构位次**保留、把具体 id 归一成占位符再比（绑定关系与顺序仍在
 * 比较范围内——那才是分片可能打乱的东西）。
 */
import { describe, expect, it } from 'vitest';

import { buildDevTestData, buildDevTestDataAsync } from '@/app/modals/devSeedData';

import type { DevTestDataScale } from '@/app/modals/devSeedData';

const scale: DevTestDataScale = {
  variantsPerQuality: 2,
  songCount: 37,
  linesPerSong: [4, 9],
  shortLineWords: [2, 5],
  longLineWords: [6, 14],
  chordsPerLyricLine: [1, 3],
  chordsPerChordLine: [2, 6],
  groupCount: 3,
};

/**
 * 抽出一首歌里「由 RNG 决定、且不随 UUID/时钟变」的部分。
 *
 * lineId 与 chordId 都是随机 UUID，故归一成「按首次出现顺序编号」的占位符：这样**结构**（哪一行绑了
 * 哪个和弦、绑在第几个字符、顺序如何）仍被严格比较，而 id 的具体取值不参与。
 */
const randomPartOf = (song: ReturnType<typeof buildDevTestData>['songs'][number]) => {
  const lineIdAlias = new Map<string, string>();
  const chordIdAlias = new Map<string, string>();
  const alias = (map: Map<string, string>, id: string, prefix: string) => {
    if (!map.has(id)) map.set(id, `${prefix}#${map.size}`);
    return map.get(id)!;
  };

  return {
    title: song.title,
    singer: song.singer,
    originalKey: song.originalKey,
    timeSignature: song.timeSignature,
    playKey: song.playKey,
    capo: song.capo,
    lyrics: song.lyrics,
    lineIds: [...song.lineIds].map(id => alias(lineIdAlias, id, 'line')),
    // Map 跨实例不被 toEqual 按内容语义比较，展开成可比较的数组
    chordMap: [...song.chordMap.entries()].map(([lineId, slots]) => [
      alias(lineIdAlias, lineId, 'line'),
      [...slots.char.entries()].map(([position, chordId]) => [position, alias(chordIdAlias, chordId, 'chord')]),
    ]),
  };
};

describe('buildDevTestDataAsync 与 buildDevTestData 同构', () => {
  it('规模、估算值与逐首歌的随机产物完全一致', async () => {
    const sync = buildDevTestData(scale);
    const asyncData = await buildDevTestDataAsync(scale);

    expect(asyncData.songs.length).toBe(sync.songs.length);
    expect(asyncData.chords.length).toBe(sync.chords.length);
    expect(asyncData.groups.length).toBe(sync.groups.length);
    expect(asyncData.estimatedBytes).toBe(sync.estimatedBytes);

    for (let i = 0; i < sync.songs.length; i++)
      expect(randomPartOf(asyncData.songs[i]!)).toEqual(randomPartOf(sync.songs[i]!));
  });

  it('id 与时间戳形态合法（取值本身随时间变，不参与比较）', async () => {
    const { songs } = await buildDevTestDataAsync(scale);
    expect(songs.every(s => /^s_[0-9a-f]{12}$/.test(s.id))).toBe(true);
    expect(songs.every(s => s.createdAt > 0 && s.updatedAt === s.createdAt)).toBe(true);
    // createdAt 逐首 +1000：分片不得打乱序号
    expect(songs.map(s => s.createdAt)).toEqual(songs.map((_, i) => songs[0]!.createdAt + i * 1000));
  });

  it('onProgress 走到总数且单调递增', async () => {
    const seen: number[] = [];
    await buildDevTestDataAsync(scale, done => seen.push(done));
    expect(seen.at(-1)).toBe(scale.songCount);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });

  it('无和弦时不崩、返回空歌曲集', async () => {
    const empty = await buildDevTestDataAsync({ ...scale, groupCount: 0, variantsPerQuality: 0 });
    expect(empty.songs).toEqual([]);
  });
});
