// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';

import type { Chord } from '@/domains/chord/types';

// 原生 Web Audio 引擎下，jsdom 不提供 AudioContext；注入最小 mock 供 initAudioEngine 使用。
// （旧实现依赖 tone.js 并在此 vi.mock('tone')，移除依赖后改为直连 Web Audio API。）
class MockAudioParam {
  value = 0;
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}
class MockAudioContext {
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;
  destination = {
    connect() {
      return this;
    },
    disconnect() {},
  };
  createGain() {
    return {
      gain: new MockAudioParam(),
      connect() {
        return this;
      },
      disconnect() {},
    } as unknown as GainNode;
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: new MockAudioParam(),
      connect() {
        return this;
      },
      disconnect() {},
      start() {},
      stop() {},
    } as unknown as OscillatorNode;
  }
  createDelay() {
    return {
      delayTime: new MockAudioParam(),
      connect() {
        return this;
      },
      disconnect() {},
    } as unknown as DelayNode;
  }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(),
      knee: new MockAudioParam(),
      ratio: new MockAudioParam(),
      attack: new MockAudioParam(),
      release: new MockAudioParam(),
      connect() {
        return this;
      },
      disconnect() {},
    } as unknown as DynamicsCompressorNode;
  }
  createConvolver() {
    return {
      buffer: null,
      connect() {
        return this;
      },
      disconnect() {},
    } as unknown as ConvolverNode;
  }
  createStereoPanner() {
    return {
      pan: new MockAudioParam(),
      connect() {
        return this;
      },
      disconnect() {},
    } as unknown as StereoPannerNode;
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
  }
  resume() {
    return Promise.resolve();
  }
}

const installAudioContextMock = (): void => {
  (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
};

describe('全曲乐谱音频播放调度引擎 (useAudioPlayer Score Playback)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installAudioContextMock();
    vi.useFakeTimers();
  });

  const chordA: Chord = {
    id: toChordId('c_a'),
    groupId: toGroupId('g1'),
    nameSegments: null,
    strings: [
      { fret: -1, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
    ],
    fretCount: 4,
    fretOffset: 0,
    tuning: Tuning.STANDARD,
    rootStringIndex: 1,
    createdAt: 100,
    updatedAt: 100,
  };

  const chordB: Chord = {
    ...chordA,
    id: toChordId('c_b'),
  };

  it('播放调度器状态管理与生命周期控制 (start, step, pause, stop)', async () => {
    const player = useAudioPlayer();
    expect(player.isScorePlaying.value).toBe(false);
    expect(player.currentPlayingStepIndex.value).toBe(-1);

    const stepsTriggered: number[] = [];
    const sequence = [chordA, chordB];

    // 启动乐谱播放（bpm 120 × 2 拍 = 每步 1s；首步起振余量 120ms）
    await player.startScorePlayback(sequence, {
      bpm: 120,
      beatsPerChord: 2,
      onStep: idx => stepsTriggered.push(idx),
    });
    // start 必须真实生效：此前没有任何断言验证 isScorePlaying 翻转，引擎初始化失败也会「全绿」
    expect(player.isScorePlaying.value).toBe(true);

    // 推进 fake 时间触发 lookahead 窗口内 step 0 的 UI 高亮定时器。
    // 分两段推进，而不是一次跳一个凑出来的大数：先推到「首步起振余量」之前（该余量未导出，
    // 这里取一个明显小于它的值），断言还没步进；再推过它，断言首步触发。
    // 这样余量本身也进了断言，而不只是靠 250 这个数恰好跨过它。
    await vi.advanceTimersByTimeAsync(60);
    expect(stepsTriggered).toEqual([]);
    await vi.advanceTimersByTimeAsync(190);
    expect(stepsTriggered).toEqual([0]);
    expect(player.currentPlayingStepIndex.value).toBe(0);

    // 暂停（壳层动作经动态 import 懒加载实现，需 await 保证状态已翻转）
    await player.pauseScorePlayback();
    expect(player.isScorePlaying.value).toBe(false);

    // 停止并复位
    await player.stopScorePlayback();
    expect(player.isScorePlaying.value).toBe(false);
    expect(player.currentPlayingStepIndex.value).toBe(-1);

    player.disposeAudioEngine();
  });
});

describe('试听动作的「已受理」反馈 (useAudioPlayer isAudioPreparing)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installAudioContextMock();
    vi.useFakeTimers();
  });

  it('标志在动作发起当刻同步置位、结算后复位（首次点击的反馈不依赖懒加载 chunk）', async () => {
    const player = useAudioPlayer();
    expect(player.isAudioPreparing.value).toBe(false);

    // 刻意不 await：置位必须发生在动态 import 结算**之前** —— 这正是「首次点击不再有反馈死区」的判据。
    // 把置位挪进懒加载实现里、或挪进 .then 回调里，这条断言都会红。
    const pending = player.playCurrentChord();
    expect(player.isAudioPreparing.value).toBe(true);

    await pending;
    expect(player.isAudioPreparing.value).toBe(false);
  });
});
