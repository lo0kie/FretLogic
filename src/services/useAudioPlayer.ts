import { AUDIO_CONFIG } from '@/constants/audio';
import { useEditorStore } from '@/stores/chordEditorStore';
import * as Tone from 'tone';
import { ref } from 'vue';

const isPlaying = ref(false);
let isEngineInitialized = false;
let guitarSynth: Tone.PolySynth | null = null;
let playTimer: ReturnType<typeof setTimeout> | null = null;

const MIDI_TO_FREQ_CACHE = new Map<number, number>();

const getFrequencyFromMidi = (midiNote: number, toneInstance: typeof Tone): number => {
  let freq = MIDI_TO_FREQ_CACHE.get(midiNote);
  if (freq === undefined) {
    freq = toneInstance.Frequency(midiNote, 'midi').toFrequency();
    MIDI_TO_FREQ_CACHE.set(midiNote, freq);
  }
  return freq;
};

export function useAudioPlayer() {
  const editorStore = useEditorStore();

  const initAudioEngine = async () => {
    if (isEngineInitialized) return;

    const reverb = new Tone.Reverb({
      decay: AUDIO_CONFIG.REVERB_DURATION,
      wet: AUDIO_CONFIG.REVERB_WET_GAIN,
    });

    await reverb.generate();

    const compressor = new Tone.Compressor({
      threshold: AUDIO_CONFIG.COMPRESSOR_THRESHOLD,
      knee: AUDIO_CONFIG.COMPRESSOR_KNEE,
      ratio: AUDIO_CONFIG.COMPRESSOR_RATIO,
      attack: AUDIO_CONFIG.COMPRESSOR_ATTACK,
      release: AUDIO_CONFIG.COMPRESSOR_RELEASE,
    });

    guitarSynth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: AUDIO_CONFIG.SYNTH_HARMONICITY,
      modulationIndex: AUDIO_CONFIG.SYNTH_MODULATION_INDEX,
      oscillator: { type: 'triangle' },
      modulation: { type: 'sine' },
      envelope: {
        attack: AUDIO_CONFIG.ENV_ATTACK,
        decay: AUDIO_CONFIG.ENV_DECAY,
        sustain: AUDIO_CONFIG.ENV_SUSTAIN,
        release: AUDIO_CONFIG.ENV_RELEASE,
      },
    });

    guitarSynth.volume.value = AUDIO_CONFIG.MAIN_VOLUME_DB;
    guitarSynth.chain(compressor, reverb, Tone.Destination);

    isEngineInitialized = true;
  };

  const playCurrentChord = async () => {
    if (isPlaying.value) return;

    // 🌟 核心修复：必须在任何异步操作（await）之前，在用户点击的同步回调中立即唤醒 AudioContext
    if (Tone.getContext().state !== 'running') {
      Tone.start();
    }

    isPlaying.value = true;

    try {
      await initAudioEngine();

      if (!guitarSynth) {
        isPlaying.value = false;
        return;
      }

      guitarSynth.releaseAll();

      const stringsSnapshot = editorStore.strings.map(s => ({ fret: s.fret, preferFlat: s.preferFlat }));
      const capoOffset = editorStore.capo > 0 ? editorStore.capo : 0;

      let strumDelay = 0;
      const now = Tone.now();

      for (let sIdx = 0; sIdx <= 5; sIdx++) {
        const targetStr = stringsSnapshot[sIdx];

        if (targetStr.fret < 0) continue;

        const guitarMidiBase = editorStore.activeBaseStrings[sIdx];
        const actualOffset = targetStr.fret > 0 ? capoOffset : 0;
        const currentMidiNote = guitarMidiBase + targetStr.fret + actualOffset;

        const frequency = getFrequencyFromMidi(currentMidiNote, Tone);

        const triggerTime = now + strumDelay;
        const humanizeVelocity = 0.78 + Math.random() * 0.22;

        guitarSynth.triggerAttackRelease(frequency, AUDIO_CONFIG.ENV_RELEASE, triggerTime, humanizeVelocity);

        strumDelay += AUDIO_CONFIG.STRUM_DELAY_STEP;
      }

      if (playTimer) clearTimeout(playTimer);

      playTimer = setTimeout(
        () => {
          isPlaying.value = false;
        },
        (strumDelay + AUDIO_CONFIG.AUDIO_RELEASE_TAIL) * 1000
      );
    } catch (error) {
      console.error('和弦音频引擎调度失败:', error);
      isPlaying.value = false;
    }
  };

  return { isPlaying, playCurrentChord };
}
