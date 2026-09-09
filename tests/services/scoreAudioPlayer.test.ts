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
      [-1, false],
      [0, false],
      [2, false],
      [2, false],
      [2, false],
      [0, false],
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

    // 启动乐谱播放
    await player.startScorePlayback(sequence, {
      bpm: 120,
      beatsPerChord: 2,
      onStep: idx => stepsTriggered.push(idx),
    });

    // 暂停
    player.pauseScorePlayback();
    expect(player.isScorePlaying.value).toBe(false);

    // 停止并复位
    player.stopScorePlayback();
    expect(player.isScorePlaying.value).toBe(false);
    expect(player.currentPlayingStepIndex.value).toBe(-1);

    player.disposeAudioEngine();
  });
});
