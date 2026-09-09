// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AUDIO_CONFIG, CHORUS_CONFIG, TIMBRE_PRESETS } from '@/app/services/audio/constants';
import {
  applyChorusEnabled,
  applyTimbre,
  buildStrumOrder,
  disposeSynthEngine,
  ensureAudioReady,
  initAudioEngine,
  releaseSynthNotes,
  setReverbWet,
  setSynthVolume,
  triggerChordStrum,
  triggerChordSustain,
} from '@/app/services/audio/synthEngine';
import { Tuning } from '@/domains/chord/theory/theory';

import type { TimbrePreset } from '@/app/services/audio/constants';
import type { AudioTimbreId, StrumDirection } from '@/platform/types';

// ---- 最小 Web Audio mock ----
// 记录：节点创建、连接拓扑（edges）、AudioParam 调度调用与 .value 写入次数。
// 拓扑记录用于按「语义」定位 masterGain / 混响 wet-dry / 合唱 wet-dry，
// 避免依赖节点创建顺序这类易碎断言（AGENTS.md §7.2）。

interface Edge {
  from: unknown;
  to: unknown;
}

class MockAudioParam {
  private _value = 0;
  /** 直接赋值 .value 的次数（用于断言「同值重复设置 → 早退」这类分支） */
  writes = 0;
  calls: [string, ...number[]][] = [];

  get value(): number {
    return this._value;
  }
  set value(v: number) {
    this._value = v;
    this.writes += 1;
  }

  setValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push(['setValueAtTime', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push(['linearRampToValueAtTime', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.value = v;
    this.calls.push(['exponentialRampToValueAtTime', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    this.value = v;
    this.calls.push(['setTargetAtTime', v, t, tc]);
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.calls.push(['cancelScheduledValues', t]);
    return this;
  }

  /** 指定调度方法的目标值序列（调用元组的 [1] 恒为目标值） */
  valuesOf(kind: string): number[] {
    return this.calls.filter(c => c[0] === kind).map(c => c[1]);
  }
  countOf(kind: string): number {
    return this.calls.filter(c => c[0] === kind).length;
  }
}

class MockNode {
  onended: (() => void) | null = null;
  disconnected = false;
  connect(target: unknown): unknown {
    edges.push({ from: this, to: target });
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}
class MockGain extends MockNode {
  gain = new MockAudioParam();
}
class MockOsc extends MockNode {
  type = 'sine';
  frequency = new MockAudioParam();
  startTime: number | null = null;
  stopTime: number | null = null;
  start(t?: number): void {
    this.startTime = t ?? null;
  }
  stop(t?: number): void {
    this.stopTime = t ?? null;
  }
}
class MockDelay extends MockNode {
  delayTime = new MockAudioParam();
}
class MockComp extends MockNode {
  threshold = new MockAudioParam();
  knee = new MockAudioParam();
  ratio = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
}
class MockConv extends MockNode {
  buffer: AudioBuffer | null = null;
}
class MockPanner extends MockNode {
  pan = new MockAudioParam();
}

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;
  destination = new MockNode();
  resumeCount = 0;

  constructor() {
    trackContext(this);
  }
  createGain(): MockGain {
    const n = new MockGain();
    gains.push(n);
    return n;
  }
  createOscillator(): MockOsc {
    const n = new MockOsc();
    oscillators.push(n);
    return n;
  }
  createDelay(): MockDelay {
    const n = new MockDelay();
    delays.push(n);
    return n;
  }
  createDynamicsCompressor(): MockComp {
    const n = new MockComp();
    compressors.push(n);
    return n;
  }
  createConvolver(): MockConv {
    const n = new MockConv();
    convolvers.push(n);
    return n;
  }
  createStereoPanner(): MockPanner {
    const n = new MockPanner();
    panners.push(n);
    return n;
  }
  createBuffer(channels: number, length: number, rate: number): AudioBuffer {
    const data = new Float32Array(length);
    buffers.push({ channels, length, rate, data });
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }
  resume(): Promise<void> {
    this.resumeCount += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

// ---- 记录表 ----
const oscillators: MockOsc[] = [];
const gains: MockGain[] = [];
const delays: MockDelay[] = [];
const compressors: MockComp[] = [];
const convolvers: MockConv[] = [];
const panners: MockPanner[] = [];
const buffers: { channels: number; length: number; rate: number; data: Float32Array }[] = [];
const edges: Edge[] = [];
let ctxInstance: MockAudioContext | null = null;

/** 记录当前活动的 AudioContext 实例（供顶层断言读取） */
const trackContext = (ctx: MockAudioContext): void => {
  ctxInstance = ctx;
};

const resetSpies = (): void => {
  oscillators.length = 0;
  gains.length = 0;
  delays.length = 0;
  compressors.length = 0;
  convolvers.length = 0;
  panners.length = 0;
  buffers.length = 0;
  edges.length = 0;
};

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

/** 连向指定节点的全部上游节点 */
const findUpstream = (target: unknown): MockNode[] => edges.filter(e => e.to === target).map(e => e.from as MockNode);

/** 主音量 = 唯一接入 destination 的增益节点（取最新一条链，dispose 后可重建） */
const findMasterGain = (): MockGain =>
  gains.filter(g => edges.some(e => e.from === g && e.to === ctxInstance?.destination)).pop() as MockGain;

/** 混响 wet/dry：卷积节点只连向 wet，另一路即 dry */
const findReverbWetDry = (): { wet: MockGain; dry: MockGain } => {
  const conv = convolvers[convolvers.length - 1]!;
  const reverbOutput = findUpstream(findMasterGain()).pop()!;
  const pair = findUpstream(reverbOutput) as MockGain[];
  const wet = pair.find(g => edges.some(e => e.from === conv && e.to === g))!;
  const dry = pair.find(g => g !== wet)!;
  return { wet, dry };
};

/** 合唱 wet/dry：延迟节点只连向 wet，另一路即 dry */
const findChorusWetDry = (): { wet: MockGain; dry: MockGain } => {
  const delay = delays[delays.length - 1]!;
  const chorusOutput = findUpstream(compressors[compressors.length - 1]!).pop()!;
  const pair = findUpstream(chorusOutput) as MockGain[];
  const wet = pair.find(g => edges.some(e => e.from === delay && e.to === g))!;
  const dry = pair.find(g => g !== wet)!;
  return { wet, dry };
};

/** 触发产生的声部（合唱 LFO 调用 start() 不传时间，据此区分） */
const triggeredOscs = (): MockOsc[] => oscillators.filter(o => o.startTime !== null);

const splitVoices = (preset: TimbrePreset): { carriers: MockOsc[]; modulators: MockOsc[] } => {
  const voices = triggeredOscs();
  return {
    carriers: voices.filter(o => o.type === preset.oscillatorType),
    modulators: voices.filter(o => o.type === preset.modulationType),
  };
};

/** 仅取幅度包络节点：只有 ampEnv 会走 linearRamp */
const ampEnvelopes = (): MockGain[] => gains.filter(g => g.gain.countOf('linearRampToValueAtTime') > 0);

const SIX_STRING_CHORD = {
  strings: [
    [0, false],
    [1, false],
    [2, false],
    [3, false],
    [4, false],
    [5, false],
  ] as [number, boolean][],
  fretOffset: 0,
  tuning: Tuning.STANDARD,
};

const FOUR_STRING_CHORD = {
  strings: [
    [0, false],
    [2, false],
    [2, false],
    [0, false],
  ] as [number, boolean][],
  fretOffset: 0,
  tuning: Tuning.STANDARD,
};

beforeAll(() => {
  (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
  (globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
});

afterEach(() => {
  disposeSynthEngine();
  resetSpies();
});

// buildStrumOrder 的常规方向已由 tests/app/audio/synthEngine.test.ts 覆盖，
// 此处仅补齐其未涉及的分支，避免重复用例。
describe('buildStrumOrder 边界补充（与 synthEngine.test.ts 互补）', () => {
  it('单弦时三个方向均返回唯一弦', () => {
    expect(buildStrumOrder(1, 'low')).toEqual([0]);
    expect(buildStrumOrder(1, 'high')).toEqual([0]);
    expect(buildStrumOrder(1, 'inside-out')).toEqual([0]);
  });

  it('未收录的方向回退为 low 顺序', () => {
    expect(buildStrumOrder(3, 'unknown' as StrumDirection)).toEqual([0, 1, 2]);
  });
});

describe('引擎初始化与共享效果链', () => {
  it('ensureAudioReady 完成初始化并返回就绪状态', async () => {
    const ready = await ensureAudioReady();
    expect(ready).toBe(true);
    expect(compressors.length).toBe(1);
  });

  it('重复初始化复用同一条效果链（不重复建节点）', async () => {
    await initAudioEngine();
    await initAudioEngine();
    expect(compressors.length).toBe(1);
    expect(convolvers.length).toBe(1);
    expect(delays.length).toBe(1);
  });

  it('压缩器五项参数取自 AUDIO_CONFIG', async () => {
    await initAudioEngine();
    const comp = compressors[0]!;
    expect(comp.threshold.value).toBe(AUDIO_CONFIG.COMPRESSOR_THRESHOLD);
    expect(comp.knee.value).toBe(AUDIO_CONFIG.COMPRESSOR_KNEE);
    expect(comp.ratio.value).toBe(AUDIO_CONFIG.COMPRESSOR_RATIO);
    expect(comp.attack.value).toBe(AUDIO_CONFIG.COMPRESSOR_ATTACK);
    expect(comp.release.value).toBe(AUDIO_CONFIG.COMPRESSOR_RELEASE);
  });

  it('主音量节点接入 destination，增益按 dB → 线性换算', async () => {
    await initAudioEngine();
    const master = findMasterGain();
    expect(master).toBeDefined();
    expect(master.gain.value).toBeCloseTo(Math.pow(10, AUDIO_CONFIG.MAIN_VOLUME_DB / 20), 10);
  });

  it('生成双声道指数衰减混响 IR 并挂载到卷积节点', async () => {
    await initAudioEngine();
    expect(buffers.length).toBe(1);
    const ir = buffers[0]!;
    expect(ir.channels).toBe(2);
    expect(ir.length).toBe(Math.floor(ctxInstance!.sampleRate * AUDIO_CONFIG.REVERB_DURATION));
    // IR 为白噪声×衰减包络，首样本附近必然有非零值
    expect(ir.data.some(v => v !== 0)).toBe(true);
    expect(convolvers[0]!.buffer).not.toBeNull();
  });

  it('混响 wet/dry 按默认干湿比互补', async () => {
    await initAudioEngine();
    const { wet, dry } = findReverbWetDry();
    expect(wet.gain.value).toBeCloseTo(AUDIO_CONFIG.REVERB_WET_GAIN, 10);
    expect(dry.gain.value).toBeCloseTo(1 - AUDIO_CONFIG.REVERB_WET_GAIN, 10);
  });

  it('合唱链路按 CHORUS_CONFIG 配置延迟与 LFO，默认关闭', async () => {
    await initAudioEngine();
    expect(delays[0]!.delayTime.value).toBeCloseTo(CHORUS_CONFIG.DELAY_MS / 1000, 10);
    const lfo = oscillators.find(o => o.startTime === null);
    expect(lfo).toBeDefined();
    expect(lfo!.frequency.value).toBe(CHORUS_CONFIG.FREQUENCY);
    const { wet, dry } = findChorusWetDry();
    expect(wet.gain.value).toBe(0);
    expect(dry.gain.value).toBe(1);
  });

  it('按弦数创建声像节点，摆幅左右对称', async () => {
    await initAudioEngine();
    expect(panners.length).toBe(6);
    expect(panners[0]!.pan.value).toBeCloseTo(-AUDIO_CONFIG.PAN_SPREAD, 10);
    expect(panners[5]!.pan.value).toBeCloseTo(AUDIO_CONFIG.PAN_SPREAD, 10);
    for (let i = 0; i < 6; i++) {
      expect(panners[i]!.pan.value + panners[5 - i]!.pan.value).toBeCloseTo(0, 10);
    }
  });

  it('上下文处于 suspended 时初始化会尝试恢复', async () => {
    await initAudioEngine();
    disposeSynthEngine(); // 复位就绪标记，使下次 init 重走状态检查
    ctxInstance!.state = 'suspended';
    const before = ctxInstance!.resumeCount;
    await initAudioEngine();
    expect(ctxInstance!.resumeCount).toBe(before + 1);
  });
});

describe('扫弦触发与 FM 调度', () => {
  it('引擎未就绪时触发返回 0 且不产生声部', () => {
    expect(triggerChordStrum(SIX_STRING_CHORD)).toBe(0);
    expect(oscillators.length).toBe(0);
  });

  it('每根发声弦各建一个 FM 声部（载波 + 调制）', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    const { carriers, modulators } = splitVoices(TIMBRE_PRESETS.standard);
    expect(carriers.length).toBe(6);
    expect(modulators.length).toBe(6);
  });

  it('调制频率为载波频率的 harmonicity 倍', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    const { carriers, modulators } = splitVoices(TIMBRE_PRESETS.standard);
    const carrierFreqs = carriers.map(c => c.frequency.valuesOf('setValueAtTime')[0]!).sort((a, b) => a - b);
    const modFreqs = modulators.map(m => m.frequency.valuesOf('setValueAtTime')[0]!).sort((a, b) => a - b);
    expect(modFreqs.length).toBe(carrierFreqs.length);
    for (let i = 0; i < carrierFreqs.length; i++) {
      expect(modFreqs[i]! / carrierFreqs[i]!).toBeCloseTo(TIMBRE_PRESETS.standard.harmonicity, 6);
    }
  });

  it('ADSR：关闭力度随机时峰值等于下限，并衰减到延音电平', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    const envs = ampEnvelopes();
    expect(envs.length).toBe(6);
    const peak = AUDIO_CONFIG.STRUM_VELOCITY_MIN;
    for (const env of envs) {
      const ramps = env.gain.valuesOf('linearRampToValueAtTime');
      expect(ramps[0]).toBeCloseTo(peak, 6);
      expect(ramps[1]).toBeCloseTo(TIMBRE_PRESETS.standard.envelope.sustain * peak, 6);
    }
  });

  it('存在调制衰减预设时，调制指数走指数滑落', async () => {
    await initAudioEngine();
    applyTimbre('pluck');
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    const modGains = gains.filter(g => g.gain.countOf('exponentialRampToValueAtTime') > 0);
    expect(modGains.length).toBe(6);
    for (const g of modGains) {
      const ramps = g.gain.valuesOf('exponentialRampToValueAtTime');
      expect(ramps[0]).toBeCloseTo(TIMBRE_PRESETS.pluck.modulationDecay!.floor, 6);
    }
  });

  it('关闭抖动时相邻弦严格等间隔触发', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    const starts = splitVoices(TIMBRE_PRESETS.standard)
      .carriers.map(c => c.startTime!)
      .sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeCloseTo(AUDIO_CONFIG.STRUM_DELAY_STEP, 6);
    }
  });

  it('开启抖动时相邻弦间隔不再相等（humanize 生效）', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, {
      timingJitter: AUDIO_CONFIG.STRUM_TIMING_JITTER,
      velocityRange: 0,
    });
    const starts = splitVoices(TIMBRE_PRESETS.standard)
      .carriers.map(c => c.startTime!)
      .sort((a, b) => a - b);
    const gaps = starts.slice(1).map((t, i) => t - starts[i]!);
    expect(gaps.every(g => near(g, gaps[0]!))).toBe(false);
  });

  it('静音弦（品位 < 0）不触发声部', async () => {
    await initAudioEngine();
    const chord = {
      strings: [
        [-1, false],
        [0, false],
        [2, false],
        [-1, false],
        [2, false],
        [0, false],
      ] as [number, boolean][],
      fretOffset: 0,
      tuning: Tuning.STANDARD,
    };
    const elapsed = triggerChordStrum(chord, { timingJitter: 0, velocityRange: 0 });
    expect(splitVoices(TIMBRE_PRESETS.standard).carriers.length).toBe(4);
    expect(elapsed).toBeGreaterThan(0);
  });

  it('触发少于初始化弦数的和弦时按实际弦数重算声像，多余声像归零', async () => {
    await initAudioEngine();
    triggerChordStrum(FOUR_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    expect(panners[0]!.pan.value).toBeCloseTo(-AUDIO_CONFIG.PAN_SPREAD, 10);
    expect(panners[3]!.pan.value).toBeCloseTo(AUDIO_CONFIG.PAN_SPREAD, 10);
    expect(panners[4]!.pan.value).toBe(0);
    expect(panners[5]!.pan.value).toBe(0);
  });
});

describe('延音触发与释放', () => {
  it('延音触发返回发声弦数，且不排定自动停止', async () => {
    await initAudioEngine();
    const count = triggerChordSustain(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    expect(count).toBe(6);
    for (const c of splitVoices(TIMBRE_PRESETS.standard).carriers) {
      expect(c.stopTime! - c.startTime!).toBeGreaterThan(1e6);
    }
  });

  it('扫弦（非延音）按包络排出有限停止时刻', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    for (const c of splitVoices(TIMBRE_PRESETS.standard).carriers) {
      const life = c.stopTime! - c.startTime!;
      expect(life).toBeGreaterThan(0);
      expect(life).toBeLessThan(1e6);
    }
  });

  it('releaseSynthNotes 取消排定并把活跃音趋零停止', async () => {
    await initAudioEngine();
    triggerChordSustain(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    const envs = ampEnvelopes();
    expect(envs.length).toBe(6);
    releaseSynthNotes();
    const released = envs.filter(g => g.gain.valuesOf('setTargetAtTime').some(v => v <= 0.0001));
    expect(released.length).toBe(6);
    for (const env of envs) {
      expect(env.gain.countOf('cancelScheduledValues')).toBe(1);
    }
  });

  it('释放后活跃音清空，再次释放为空操作', async () => {
    await initAudioEngine();
    triggerChordSustain(SIX_STRING_CHORD, { timingJitter: 0, velocityRange: 0 });
    releaseSynthNotes();
    const countTargets = (): number => gains.reduce((n, g) => n + g.gain.countOf('setTargetAtTime'), 0);
    const afterFirst = countTargets();
    releaseSynthNotes();
    expect(countTargets()).toBe(afterFirst);
  });

  it('未初始化时释放为空操作', () => {
    expect(() => releaseSynthNotes()).not.toThrow();
  });
});

describe('热更新：音色 / 音量 / 混响 / 合唱', () => {
  it('切换音色后按新预设起音（调制波形随之改变）', async () => {
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0 });
    expect(triggeredOscs().some(o => o.type === TIMBRE_PRESETS.bright.modulationType)).toBe(false);
    applyTimbre('bright');
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0 });
    expect(triggeredOscs().some(o => o.type === TIMBRE_PRESETS.bright.modulationType)).toBe(true);
  });

  it('引擎未就绪时切换音色不生效（初始化后仍为出厂音色）', async () => {
    applyTimbre('bright');
    await initAudioEngine();
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0 });
    expect(triggeredOscs().some(o => o.type === TIMBRE_PRESETS.bright.modulationType)).toBe(false);
  });

  it('未知音色 id 被忽略，保持当前音色', async () => {
    await initAudioEngine();
    applyTimbre('bright');
    applyTimbre('nonexistent' as AudioTimbreId);
    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0 });
    expect(triggeredOscs().some(o => o.type === TIMBRE_PRESETS.bright.modulationType)).toBe(true);
  });

  it('设置音量后主音量增益按 dB 换算生效', async () => {
    await initAudioEngine();
    const master = findMasterGain();
    const targetDb = AUDIO_CONFIG.MAIN_VOLUME_DB - 6;
    setSynthVolume(targetDb);
    expect(master.gain.value).toBeCloseTo(Math.pow(10, targetDb / 20), 10);
  });

  it('音量与当前值相同时为空操作（不重复写增益）', async () => {
    await initAudioEngine();
    const master = findMasterGain();
    setSynthVolume(AUDIO_CONFIG.MAIN_VOLUME_DB - 6);
    const writes = master.gain.writes;
    setSynthVolume(AUDIO_CONFIG.MAIN_VOLUME_DB - 6);
    expect(master.gain.writes).toBe(writes);
  });

  it('引擎未就绪时设置音量为空操作（不建节点）', () => {
    setSynthVolume(AUDIO_CONFIG.MAIN_VOLUME_DB - 6);
    expect(gains.length).toBe(0);
  });

  it('设置混响干湿比后 wet/dry 互补更新', async () => {
    await initAudioEngine();
    const { wet, dry } = findReverbWetDry();
    const target = 0.65;
    setReverbWet(target);
    expect(wet.gain.value).toBeCloseTo(target, 10);
    expect(dry.gain.value).toBeCloseTo(1 - target, 10);
  });

  it('非法干湿比（NaN / 越界）被忽略', async () => {
    await initAudioEngine();
    const { wet, dry } = findReverbWetDry();
    const beforeWet = wet.gain.value;
    const beforeDry = dry.gain.value;
    setReverbWet(Number.NaN);
    setReverbWet(-0.1);
    setReverbWet(1.5);
    expect(wet.gain.value).toBe(beforeWet);
    expect(dry.gain.value).toBe(beforeDry);
  });

  it('合唱开关在 wet/dry 间切换，同值重复设置为空操作', async () => {
    await initAudioEngine();
    const { wet, dry } = findChorusWetDry();
    applyChorusEnabled(true);
    expect(wet.gain.value).toBe(1);
    expect(dry.gain.value).toBe(0);
    const writes = wet.gain.writes + dry.gain.writes;
    applyChorusEnabled(true);
    expect(wet.gain.writes + dry.gain.writes).toBe(writes);
    applyChorusEnabled(false);
    expect(wet.gain.value).toBe(0);
    expect(dry.gain.value).toBe(1);
  });
});

describe('销毁与状态复位', () => {
  it('未初始化时销毁为空操作', () => {
    expect(() => disposeSynthEngine()).not.toThrow();
  });

  it('销毁后引擎不再就绪，触发返回 0', async () => {
    await initAudioEngine();
    disposeSynthEngine();
    expect(triggerChordStrum(SIX_STRING_CHORD)).toBe(0);
  });

  it('销毁断开全部效果链节点', async () => {
    await initAudioEngine();
    const chain = [...gains];
    disposeSynthEngine();
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.every(g => g.disconnected)).toBe(true);
  });

  it('销毁后重建：音色 / 合唱 / 混响 / 音量 均复位为默认值', async () => {
    await initAudioEngine();
    applyTimbre('bright');
    applyChorusEnabled(true);
    setReverbWet(0.9);
    setSynthVolume(AUDIO_CONFIG.MAIN_VOLUME_DB - 10);
    disposeSynthEngine();
    await initAudioEngine();

    const chorus = findChorusWetDry();
    expect(chorus.wet.gain.value).toBe(0);
    expect(chorus.dry.gain.value).toBe(1);

    const reverb = findReverbWetDry();
    expect(reverb.wet.gain.value).toBeCloseTo(AUDIO_CONFIG.REVERB_WET_GAIN, 10);
    expect(reverb.dry.gain.value).toBeCloseTo(1 - AUDIO_CONFIG.REVERB_WET_GAIN, 10);

    expect(findMasterGain().gain.value).toBeCloseTo(Math.pow(10, AUDIO_CONFIG.MAIN_VOLUME_DB / 20), 10);

    triggerChordStrum(SIX_STRING_CHORD, { timingJitter: 0 });
    expect(triggeredOscs().some(o => o.type === TIMBRE_PRESETS.bright.modulationType)).toBe(false);
  });
});
