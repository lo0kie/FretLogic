// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { Tuning } from '@/domains/chord/theory/theory';

import type { Chord } from '@/domains/chord/types';

vi.mock('tone', () => ({
  start: vi.fn().mockResolvedValue(undefined),
  now: vi.fn(() => 0),
  getContext: vi.fn(() => ({ state: 'running' })),
  Frequency: vi.fn(() => ({ toFrequency: () => 440 })),
  Destination: {},
  Reverb: class {
    generate = vi.fn().mockResolvedValue(undefined);
    dispose = vi.fn();
  },
  Compressor: class {
    dispose = vi.fn();
  },
  Chorus: class {
    wet = { value: 0 };
    start = vi.fn();
    dispose = vi.fn();
  },
  Panner: class {
    pan = { value: 0 };
    dispose = vi.fn();
  },
  FMSynth: class {
    volume = { value: 0 };
    chain = vi.fn();
    triggerRelease = vi.fn();
    triggerAttack = vi.fn();
    triggerAttackRelease = vi.fn();
    dispose = vi.fn();
  },
  PolySynth: class {
    volume = { value: 0 };
    chain = vi.fn();
    releaseAll = vi.fn();
    triggerAttackRelease = vi.fn();
    dispose = vi.fn();
  },
}));

describe('全曲乐谱音频播放调度引擎 (useAudioPlayer Score Playback)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
