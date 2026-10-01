import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';
import { prepareWorkerExportPayload } from '@/domains/score/preview/services/workerExportService';

import type { Chord } from '@/domains/chord/types';
import type { WorkerExportPayloadInput } from '@/domains/score/preview/services/workerExportService';
import type { WorkerExportPayload } from '@/domains/score/preview/workers/scoreExportWorker';
import type { ChordLineSlots, LineId, Song, SongId } from '@/domains/score/types';

describe('workerExportService', () => {
  it('正确将 Song 数据转换为 Worker 渲染所需的轻量 Payload（含指板图数据）', () => {
    const mockChord: Chord = createChord({
      id: 'chord_c',
      nameSegments: { root: ['C', 0] },
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: Tuning.STANDARD,
    });

    const chordsLookupMap = new Map<string, Chord>([[mockChord.id, mockChord]]);

    const chordMap = new Map<LineId, ChordLineSlots>();
    chordMap.set('line_0' as LineId, { char: new Map([[0, mockChord.id]]), start: [], end: [] });

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '故事的小黄花\n从出生那年就飘着',
      lineIds: ['line_0' as LineId, 'line_1' as LineId],
      playKey: 'G',
      capo: 2,
      chordMap,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const payload = prepareWorkerExportPayload({ song, selectedIndices: [0, 1], chordsLookupMap, mode: 'a4' });

    // 注：原先此处还有 title / mode / lines.length 三条「透传回声」断言——输出即输入的字段，
    // 删掉实现里的赋值也照样为绿；实质覆盖在下方 chars / chord 的结构断言
    expect(payload.lines[0]?.chars[0]?.char).toBe('故');
    expect(payload.lines[0]?.chars[0]?.chord?.chordName).toBe('C');
    expect(payload.lines[0]?.chars[0]?.chord?.strings[1]?.[0]).toBe(3);
  });

  it('开启 shorthand 时能正确将和弦转为简写符号（如 maj7 -> M7）', () => {
    const mockMaj7Chord: Chord = createChord({
      id: 'chord_cmaj7',
      nameSegments: { root: ['C', 0], quality: 'maj7' },
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: Tuning.STANDARD,
    });

    const chordsLookupMap = new Map<string, Chord>([[mockMaj7Chord.id, mockMaj7Chord]]);
    const chordMap = new Map<LineId, ChordLineSlots>();
    chordMap.set('line_0' as LineId, { char: new Map([[0, mockMaj7Chord.id]]), start: [], end: [] });

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '故事的小黄花',
      lineIds: ['line_0' as LineId],
      playKey: 'G',
      capo: 0,
      chordMap,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const base: WorkerExportPayloadInput = { song, selectedIndices: [0], chordsLookupMap, mode: 'a4' };

    const fullPayload = prepareWorkerExportPayload({ ...base, shorthand: false });
    expect(fullPayload.lines[0]?.chars[0]?.chord?.chordName).toBe('Cmaj7');
    // 完整名那一档**同时带上简写名**：指板图内名字放不下图列宽时的第一级降级（见
    // scoreExportLayout 的 drawFormattedChordName）——装不装得下要量过宽度才知道，故两个候选都过线程
    expect(fullPayload.lines[0]?.chars[0]?.chord?.shorthandName).toBe('CM7');

    const shortPayload = prepareWorkerExportPayload({ ...base, shorthand: true });
    expect(shortPayload.lines[0]?.chars[0]?.chord?.chordName).toBe('CM7');
    // 用户已选简写：两个候选同值，不再重复带一份
    expect(shortPayload.lines[0]?.chars[0]?.chord?.shorthandName).toBeUndefined();

    // 只保留缺省值断言（未传 layoutAlign 时回落到 'start' 是真实分支，有区分度）；
    // 原先紧随其后的 layoutAlign:'center' → 'center' 属透传回声，已删
    const defaultAlignPayload = prepareWorkerExportPayload({ ...base });
    expect(defaultAlignPayload.layoutAlign).toBe('start');
  });

  it('chordMap 是普通对象（持久化 / 同步链路形态）时先归一化为嵌套 Map，而不是逐槽位取值直接抛错', () => {
    const chord = createChord({
      id: 'chord_c',
      nameSegments: { root: ['C', 0] },
      strings: [
        { fret: -1, preferFlat: false },
        { fret: 3, preferFlat: false },
        { fret: 2, preferFlat: false },
        { fret: 0, preferFlat: false },
        { fret: 1, preferFlat: false },
        { fret: 0, preferFlat: false },
      ],
      rootStringIndex: 1,
      fretCount: 4,
      fretOffset: 0,
      groupId: 'g1',
      tuning: Tuning.STANDARD,
    });

    const song: Song = {
      id: 'song_1' as SongId,
      title: '晴天',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '故事的小黄花',
      lineIds: ['line_0' as LineId],
      playKey: 'G',
      capo: 0,
      // 普通对象形态（v7 嵌套结构：char 以对象下标落盘），正是持久化 / 同步链路的落地形态
      chordMap: { line_0: { char: { 0: 'chord_c' }, start: [], end: [] } } as unknown as Map<LineId, ChordLineSlots>,
      version: 1,
      createdAt: 0,
      updatedAt: 0,
    };

    const payload = prepareWorkerExportPayload({
      song,
      selectedIndices: [0],
      chordsLookupMap: new Map([[chord.id, chord]]),
      mode: 'a4',
    });

    // 缺这道归一化时，下面逐槽位取值会直接抛 `chordMap.get is not a function`，整笔预览 / 导出失败
    expect(payload.lines[0]?.chars[0]?.chord?.chordName).toBe('C');
  });
});

/**
 * 队列与看门狗：这一组必须把 Worker 换成桩 —— 真实的渲染线程在 vitest 里起不来（OffscreenCanvas /
 * 模块 worker），而这里要验的恰恰是**主线程侧的排队与判死**，与线程内部的绘制实现无关。
 */
describe('workerExportService 队列与看门狗', () => {
  /** Worker 桩：只记下发过什么、可手动回消息，terminate 记账供断言 */
  class FakeWorker {
    static instances: FakeWorker[] = [];
    static terminated = 0;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    sent: unknown[] = [];
    constructor() {
      FakeWorker.instances.push(this);
    }
    postMessage(payload: unknown) {
      this.sent.push(payload);
    }
    terminate() {
      FakeWorker.terminated++;
    }
  }

  /** 每个用例都重新加载模块：队列、在途任务、Worker 单例都是模块级状态，跨用例会串味 */
  const loadService = async () => {
    vi.resetModules();
    return import('@/domains/score/preview/services/workerExportService');
  };

  /** 载荷只要满足协议即可：它只会被下发给桩，不会真的渲染 */
  const makePayload = () =>
    ({
      kind: 'export',
      title: 't',
      keyText: '',
      capoText: '',
      lines: [],
      mode: 'a4',
      colors: {},
    }) as unknown as WorkerExportPayload;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWorker.instances = [];
    FakeWorker.terminated = 0;
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('渲染线程既不回报也不报错时，看门狗判死并推进队列（否则预览与导出会一起永久停摆）', async () => {
    const { runWorkerExport, RENDER_WATCHDOG_MS } = await loadService();

    const first = runWorkerExport(makePayload());
    // 第二笔只能排队：线程是串行的，第一笔不落地它一笔都开不了跑
    const second = runWorkerExport(makePayload());
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0]?.sent).toHaveLength(1);

    // 先挂上拒绝处理再推进时钟，免得判死那一刻变成未处理的 rejection
    const rejection = expect(first).rejects.toThrow('无响应');
    await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + 1);
    await rejection;

    // 线程已废弃，队列被推着往前走：第二笔在新线程上起跑，且能正常跑完（判死只落在该死的那一笔上）
    expect(FakeWorker.terminated).toBe(1);
    const secondWorker = FakeWorker.instances[1]!;
    expect(secondWorker.sent).toHaveLength(1);
    secondWorker.onmessage?.({ data: { type: 'complete', blobs: [], renderedPages: [] } });
    await expect(second).resolves.toMatchObject({ renderedPages: [] });
  });

  it('看门狗看的是静默而不是总时长：还在出页的长谱不会被判死', async () => {
    const { runWorkerExport, RENDER_WATCHDOG_MS } = await loadService();

    const task = runWorkerExport(makePayload());
    const worker = FakeWorker.instances[0]!;
    // 逐段推进，每段都在到点之前回一条过程消息（长谱整轮远超 30s，但它一直在出页）
    for (let index = 0; index < 3; index++) {
      await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS - 1);
      worker.onmessage?.({ data: { type: 'page', index, blob: new Blob() } });
    }
    expect(FakeWorker.terminated).toBe(0);

    // 随后彻底静默：到点即判死
    const rejection = expect(task).rejects.toThrow('无响应');
    await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + 1);
    await rejection;
  });
});
