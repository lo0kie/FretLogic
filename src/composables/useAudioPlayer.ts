import { useChordLabStore } from '@/stores/chordLabStore';
import { onBeforeUnmount, ref } from 'vue';

let sharedCtx: AudioContext | null = null;
let sharedMainMixer: GainNode | null = null;
const staticStringGains: GainNode[] = [];
const staticModGains: GainNode[] = [];
let playTimer: ReturnType<typeof setTimeout> | null = null;
let cachedReverbBuffer: AudioBuffer | null = null;

export function useAudioPlayer() {
  const chordLabStore = useChordLabStore();
  const isPlaying = ref(false);

  const getReverbBuffer = (ctx: AudioContext, seconds: number): AudioBuffer => {
    if (cachedReverbBuffer) return cachedReverbBuffer;
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buffer = ctx.createBuffer(2, len, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    cachedReverbBuffer = buffer;
    return buffer;
  };

  const initAudioEngine = async () => {
    if (sharedCtx && sharedCtx.state !== 'closed') await sharedCtx.close();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    const ctx = new AudioContextClass();

    const mainMixer = ctx.createGain();
    mainMixer.gain.setValueAtTime(0.4, ctx.currentTime);

    const convolver = ctx.createConvolver();
    convolver.buffer = getReverbBuffer(ctx, 2.0);

    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(0.3, ctx.currentTime);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-12, ctx.currentTime);
    compressor.knee.setValueAtTime(30, ctx.currentTime);
    compressor.ratio.setValueAtTime(10, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);

    mainMixer.connect(compressor);
    mainMixer.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(compressor);
    compressor.connect(ctx.destination);

    staticStringGains.length = 0;
    staticModGains.length = 0;

    for (let i = 0; i < 6; i++) {
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0, ctx.currentTime);
      sGain.connect(mainMixer);
      staticStringGains.push(sGain);

      const mGain = ctx.createGain();
      mGain.gain.setValueAtTime(0, ctx.currentTime);
      staticModGains.push(mGain);
    }

    sharedCtx = ctx;
    sharedMainMixer = mainMixer;
    return ctx;
  };

  const playCurrentChord = async () => {
    if (isPlaying.value) return;
    let ctx = sharedCtx;
    if (!ctx || ctx.state === 'closed') ctx = await initAudioEngine();
    if (!ctx || !sharedMainMixer) return;
    if (ctx.state === 'suspended') await ctx.resume();

    isPlaying.value = true;
    const now = ctx.currentTime;

    staticStringGains.forEach(gainNode => {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(0, now, 0.015);
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
      const oscMain = ctx.createOscillator();
      const oscMod = ctx.createOscillator();
      const stringGain = staticStringGains[sIdx];
      const modGain = staticModGains[sIdx];

      oscMain.type = 'triangle';
      oscMain.frequency.setValueAtTime(frequency, triggerTime);
      oscMod.type = 'sine';
      oscMod.frequency.setValueAtTime(frequency * 1.5, triggerTime);
      modGain.gain.setValueAtTime(frequency * 2.5, triggerTime);

      const envStartTime = triggerTime;
      const envReleaseEndTime = envStartTime + 0.2 + 1.0;
      const humanizeVelocity = 0.85 + Math.random() * 0.15;

      stringGain.gain.setValueAtTime(0, envStartTime);
      stringGain.gain.linearRampToValueAtTime(1.0 * humanizeVelocity, envStartTime + 0.005);
      stringGain.gain.linearRampToValueAtTime(0.3 * humanizeVelocity, envStartTime + 0.005 + 0.15);
      stringGain.gain.setValueAtTime(0.3 * humanizeVelocity, envStartTime + 0.2);
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
      };

      strumDelay += 0.2;
    }

    if (playTimer) clearTimeout(playTimer);
    playTimer = setTimeout(
      () => {
        isPlaying.value = false;
      },
      (strumDelay + 1.2) * 1000
    );
  };

  onBeforeUnmount(() => {
    if (playTimer) clearTimeout(playTimer);
  });

  return { isPlaying, playCurrentChord };
}
