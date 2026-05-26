<template>
  <div class="helper-action-box flex flex-col gap-2">
    <label class="plate-label text-xs font-black tracking-widest uppercase text-subtitle">系统辅助</label>

    <div class="flex flex-col gap-4">
      <ActionButton @click="playCurrentChord" :disabled="chordLabStore.isFretBoardEmpty || isPlaying">
        <span v-if="chordLabStore.isFretBoardEmpty">请添加指板音</span>
        <template v-else>
          <span class="text-sm leading-none mr-2">{{ isPlaying ? '⏳' : '🔊' }}</span>
          <span>{{ isPlaying ? '正在试听...' : '试听当前和弦' }}</span>
        </template>
      </ActionButton>

      <div class="fret-shift flex flex-col gap-2 p-3 rounded-xl border bg-panel-fallback">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-subtitle tracking-wider">指型整体平移</span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <ActionButton @click="handleShiftFret('down')" :disabled="isShiftDownDisabled" class="h-8 rounded-lg text-xs">
            <span class="text-xs leading-none rotate-90 mr-1">◀</span>
            <span>上移</span>
          </ActionButton>

          <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled" class="h-8 rounded-lg text-xs">
            <span>下移</span>
            <span class="text-xs leading-none rotate-90 ml-1">▶</span>
          </ActionButton>
        </div>
      </div>

      <ActionButton @click="uiStore.copyFretBoardToClipboard('#fretBoard-capture-area')" :disabled="uiStore.isCopying">
        <span class="text-sm leading-none mr-2">{{ uiStore.isCopying ? '⏳' : '📸' }}</span>
        <span>{{ uiStore.isCopying ? '正在导出...' : '复制当前到剪切板' }}</span>
      </ActionButton>

      <ActionButton @click="chordLabStore.isDarkMode = !chordLabStore.isDarkMode">
        <span class="text-sm leading-none mr-2">
          {{ chordLabStore.isDarkMode ? '🌙' : '☀️' }}
        </span>
        <span>
          {{ chordLabStore.isDarkMode ? '深色模式' : '浅色模式' }}
        </span>
      </ActionButton>
    </div>
  </div>
</template>

<script lang="ts">
let sharedCtx: AudioContext | null = null;
let sharedMainMixer: GainNode | null = null;
let sharedConvolver: ConvolverNode | null = null;

// 固化 6 根弦的独立硬件管道，避免每次点击在循环内频繁申请分配内存
const staticStringGains: GainNode[] = [];
const staticModGains: GainNode[] = [];

// 全局唯一的看门狗定时器句柄，专门斩断高频连续点击时的状态闪烁与闭包冲突
let playTimer: ReturnType<typeof setTimeout> | null | null = null;
</script>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { computed, onBeforeUnmount, ref } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();

const isPlaying = ref(false);

const hasNoPressedFrets = computed(() => !chordLabStore.selectedFrets.some(fret => fret > 0));

const isShiftDownDisabled = computed(
  () =>
    chordLabStore.isFretBoardEmpty || hasNoPressedFrets.value || chordLabStore.selectedFrets.some(fret => fret === 1)
);

const isShiftUpDisabled = computed(
  () =>
    chordLabStore.isFretBoardEmpty ||
    hasNoPressedFrets.value ||
    chordLabStore.selectedFrets.some(fret => fret === chordLabStore.fretCount)
);

const handleShiftFret = (direction: 'up' | 'down') => {
  if (chordLabStore.isFretBoardEmpty || hasNoPressedFrets.value) return;

  if (direction === 'up') {
    if (chordLabStore.selectedFrets.some(fret => fret === chordLabStore.fretCount)) return;
    chordLabStore.selectedFrets = chordLabStore.selectedFrets.map(fret => (fret > 0 ? fret + 1 : fret));
  } else {
    if (chordLabStore.selectedFrets.some(fret => fret === 1)) return;
    chordLabStore.selectedFrets = chordLabStore.selectedFrets.map(fret => (fret > 0 ? fret - 1 : fret));
  }
  uiStore.showToast(`🎵 和弦指型已完成整体平移`);
};

// ==========================================================================
// 🔊 听觉试听引擎核心逻辑
// ==========================================================================

const getReverbBuffer = (ctx: AudioContext, seconds: number): AudioBuffer => {
  const rate = ctx.sampleRate;
  const len = rate * seconds;
  const buffer = ctx.createBuffer(2, len, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return buffer;
};

const initAudioEngine = () => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  const ctx = new AudioContextClass();
  const mainMixer = ctx.createGain();
  mainMixer.gain.setValueAtTime(0.4, ctx.currentTime);

  const convolver = ctx.createConvolver();
  convolver.buffer = getReverbBuffer(ctx, 2.0);

  const wetGain = ctx.createGain();
  wetGain.gain.setValueAtTime(0.3, ctx.currentTime);

  mainMixer.connect(ctx.destination);
  mainMixer.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(ctx.destination);

  // 提前初始化并焊接 6 条乐轨的并联包络中枢
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
  sharedConvolver = convolver;
  return ctx;
};

const playCurrentChord = async () => {
  if (isPlaying.value) return;

  let ctx = sharedCtx;
  if (!ctx || ctx.state === 'closed') {
    ctx = initAudioEngine();
  }
  if (!ctx || !sharedMainMixer) return;

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  isPlaying.value = true;
  const fretsSnapshot = [...chordLabStore.selectedFrets].reverse();
  const capoOffset = chordLabStore.capo > 0 ? chordLabStore.capo : 0;
  let strumDelay = 0;

  for (let sIdx = 5; sIdx >= 0; sIdx--) {
    const fretVal = fretsSnapshot[sIdx];
    if ((fretVal ?? -1) < 0) continue;

    const guitarMidiBase = [64, 59, 55, 50, 45, 40][sIdx];
    const actualCapoOffset = fretVal > 0 ? capoOffset : 0;
    const absoluteHalfTones = guitarMidiBase + fretVal + actualCapoOffset;
    const frequency = 440 * Math.pow(2, (absoluteHalfTones - 69) / 12);
    const triggerTime = ctx.currentTime + strumDelay;

    const oscMain = ctx.createOscillator();
    const oscMod = ctx.createOscillator();

    // 从模块级单例数组中精准拉取长连接总线
    const stringGain = staticStringGains[sIdx];
    const modGain = staticModGains[sIdx];

    oscMain.type = 'triangle';
    oscMain.frequency.setValueAtTime(frequency, triggerTime);
    oscMod.type = 'sine';
    oscMod.frequency.setValueAtTime(frequency * 1.5, triggerTime);

    modGain.gain.setValueAtTime(frequency * 2.5, triggerTime);

    const attackTime = 0.005;
    const decayTime = 0.15;
    const sustainLevel = 0.3;
    const holdDuration = 0.2;
    const releaseTime = 1.0;

    const envStartTime = triggerTime;
    const envAttackEndTime = envStartTime + attackTime;
    const envDecayEndTime = envAttackEndTime + decayTime;
    const envReleaseStartTime = envStartTime + holdDuration;
    const envReleaseEndTime = envReleaseStartTime + releaseTime;

    stringGain.gain.setValueAtTime(0, envStartTime);
    stringGain.gain.linearRampToValueAtTime(1.0, envAttackEndTime);
    stringGain.gain.linearRampToValueAtTime(sustainLevel, envDecayEndTime);
    stringGain.gain.setValueAtTime(sustainLevel, envReleaseStartTime);
    stringGain.gain.exponentialRampToValueAtTime(0.0001, envReleaseEndTime);

    oscMod.connect(modGain);
    modGain.connect(oscMain.frequency);
    oscMain.connect(stringGain);

    oscMain.start(envStartTime);
    oscMod.start(envStartTime);
    oscMain.stop(envReleaseEndTime);
    oscMod.stop(envReleaseEndTime);

    strumDelay += 0.2;
  }

  const totalChordDuration = (strumDelay + 1.2) * 1000;

  // 🌟 核心改良 2：每次扫弦起航前，强制核熔摧毁前任定时器，确保状态指示绝不闪烁
  if (playTimer) clearTimeout(playTimer);

  playTimer = setTimeout(() => {
    isPlaying.value = false;
  }, totalChordDuration);
};

onBeforeUnmount(() => {
  if (playTimer) clearTimeout(playTimer);
  // 🌟 注意：这里不再粗暴地 ctx.close() 清空整个单例，否则下次挂载会引发硬件断层。
  // 模块作用域中的资产将持续为应用常驻服务，直到页面完全关闭。
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.fret-shift {
  border-color: var(--control-border);
}

.bg-panel-fallback {
  background-color: var(--bg-panel);
}

.helper-action-box {
  button:not(:disabled):hover {
    border-color: @brand-primary;
    color: @brand-primary;
  }
}
</style>
