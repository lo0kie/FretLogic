import { AUDIO_CONFIG } from '@/constants/fretboard'; // 馃专 引入常数配置
import { useChordLabStore } from '@/stores/chordLabStore';
import { onBeforeUnmount, ref } from 'vue';

// 🌟 工业级常驻物理隔离单例：确保整个 Web 生命周期音频节点仅创建编译一次
let sharedCtx: AudioContext | null = null;
let sharedMainMixer: GainNode | null = null;
const staticStringGains: GainNode[] = [];
let playTimer: ReturnType<typeof setTimeout> | null = null;
let cachedReverbBuffer: AudioBuffer | null = null;

export function useAudioPlayer() {
  const chordLabStore = useChordLabStore();
  const isPlaying = ref(false);

  // 生成衰减率平滑的白噪原声吉他空间卷积混响 Buffer
  const generateReverbBuffer = (ctx: AudioContext, seconds: number): AudioBuffer => {
    if (cachedReverbBuffer) return cachedReverbBuffer;
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buffer = ctx.createBuffer(2, len, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    cachedReverbBuffer = buffer;
    return buffer;
  };

  // 核心单例拓扑搭建
  const initAudioEngine = () => {
    if (sharedCtx) return sharedCtx;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;

    const ctx = new AudioContextClass();
    const mainMixer = ctx.createGain();
    mainMixer.gain.setValueAtTime(AUDIO_CONFIG.MAIN_VOLUME, ctx.currentTime);

    const convolver = ctx.createConvolver();
    convolver.buffer = generateReverbBuffer(ctx, AUDIO_CONFIG.REVERB_DURATION);

    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(AUDIO_CONFIG.REVERB_WET_GAIN, ctx.currentTime);

    // 动态限幅压缩器 (Compressor)：强制拦截多弦爆发引起的硬性剪切和耳机爆音
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(AUDIO_CONFIG.COMPRESSOR_THRESHOLD, ctx.currentTime);
    compressor.knee.setValueAtTime(AUDIO_CONFIG.COMPRESSOR_KNEE, ctx.currentTime);
    compressor.ratio.setValueAtTime(AUDIO_CONFIG.COMPRESSOR_RATIO, ctx.currentTime);
    compressor.attack.setValueAtTime(AUDIO_CONFIG.COMPRESSOR_ATTACK || 0.003, ctx.currentTime);
    compressor.release.setValueAtTime(AUDIO_CONFIG.COMPRESSOR_RELEASE || 0.25, ctx.currentTime);

    // 连接音频通道网
    mainMixer.connect(compressor);
    mainMixer.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(compressor);
    compressor.connect(ctx.destination);

    // 预先建立常驻 6 根物理弦控增益池
    staticStringGains.length = 0;
    for (let i = 0; i < 6; i++) {
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0, ctx.currentTime);
      sGain.connect(mainMixer);
      staticStringGains.push(sGain);
    }

    sharedCtx = ctx;
    sharedMainMixer = mainMixer;
    return ctx;
  };

  const playCurrentChord = async () => {
    if (isPlaying.value) return;

    let ctx = sharedCtx;
    if (!ctx) ctx = initAudioEngine();
    if (!ctx || !sharedMainMixer) return;

    if (ctx.state === 'suspended') await ctx.resume();

    isPlaying.value = true;
    const now = ctx.currentTime;

    // 清理并在 10 毫秒内淡出历史试听音源计划
    staticStringGains.forEach(gainNode => {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(0, now, 0.01);
    });

    const fretsSnapshot = [...chordLabStore.selectedFrets];
    const capoOffset = chordLabStore.capo > 0 ? chordLabStore.capo : 0;
    let strumDelay = 0;

    for (let sIdx = 0; sIdx <= 5; sIdx++) {
      const fretVal = fretsSnapshot[sIdx];
      if ((fretVal ?? -1) < 0) continue;

      const guitarMidiBase = chordLabStore.activeBaseStrings[sIdx];
      const actualOffset = fretVal > 0 ? capoOffset : 0;
      const frequency = 440 * Math.pow(2, (guitarMidiBase + fretVal + actualOffset - 69) / 12);
      const triggerTime = now + strumDelay;

      // 动态轻量化生成试听高频振荡组件
      const oscMain = ctx.createOscillator();
      const oscMod = ctx.createOscillator();
      const stringGain = staticStringGains[sIdx];

      oscMain.type = 'triangle';
      oscMain.frequency.setValueAtTime(frequency, triggerTime);
      oscMod.type = 'sine';
      oscMod.frequency.setValueAtTime(frequency * 1.5, triggerTime);

      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(frequency * 2.5, triggerTime);

      // ADSR 原声木吉他物理拨弦包络还原
      const envStartTime = triggerTime;
      const envReleaseEndTime = envStartTime + 0.2 + 1.2;
      const humanizeVelocity = 0.82 + Math.random() * 0.18; // 增加动态拟真力度感

      stringGain.gain.setValueAtTime(0, envStartTime);
      stringGain.gain.linearRampToValueAtTime(1.0 * humanizeVelocity, envStartTime + 0.004);
      stringGain.gain.linearRampToValueAtTime(0.28 * humanizeVelocity, envStartTime + 0.004 + 0.12);
      stringGain.gain.setValueAtTime(0.28 * humanizeVelocity, envStartTime + 0.18);
      stringGain.gain.exponentialRampToValueAtTime(0.0001, envReleaseEndTime);

      oscMod.connect(modGain);
      modGain.connect(oscMain.frequency);
      oscMain.connect(stringGain);

      oscMain.start(envStartTime);
      oscMod.start(envStartTime);
      oscMain.stop(envReleaseEndTime);
      oscMod.stop(envReleaseEndTime);

      oscMain.onended = () => {
        oscMain.disconnect();
        oscMod.disconnect();
        modGain.disconnect();
      };

      strumDelay += AUDIO_CONFIG.STRUM_DELAY_STEP; // 调度时间指针平移
    }

    if (playTimer) clearTimeout(playTimer);
    playTimer = setTimeout(
      () => {
        isPlaying.value = false;
      },
      (strumDelay + AUDIO_CONFIG.AUDIO_RELEASE_TAIL) * 1000
    );
  };

  onBeforeUnmount(() => {
    if (playTimer) clearTimeout(playTimer);
  });

  return { isPlaying, playCurrentChord };
}
