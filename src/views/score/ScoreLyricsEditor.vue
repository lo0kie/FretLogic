<template>
  <div class="flex-1 p-xl px-2xl box-border relative">
    <textarea
      v-model="localLyrics"
      class="no-scrollbar w-full h-full bg-bg-panel border border-glass-border rounded-lg p-xl text-base leading-relaxed text-text-title outline-none resize-none box-border font-inherit transition-all duration-base focus:border-primary focus:ring-2 focus:ring-primary/70"
      placeholder="在此处输入或粘贴歌词文本..."
    />
    <div
      class="absolute right-9 bottom-9 text-sm text-text-muted py-0.5 px-2 rounded-sm pointer-events-none opacity-80"
    >
      {{ localLyrics.length }} 字
    </div>
  </div>
</template>

<script setup lang="ts">
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useDebounceFn } from '@vueuse/core';
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

defineOptions({ name: 'ScoreLyricsEditor' });

const MAX_LINE_LENGTH = 100;

const scoreEditor = useScoreEditorStore();
const songStore = useSongStore();
const localLyrics = ref(scoreEditor.activeSong?.lyrics ?? '');

// 锁定本编辑器实例绑定到的歌曲 id：ScoreView 用 :key 按 activeSong 重挂载本组件，
// 因此实例生命周期内绑定的就是创建时的 current activeSong。卸载/切歌时 activeSongId 已变为新歌，
// 直接读 live 值会把本曲歌词串写进新歌（删空本曲后切歌即清空他曲的根因）。
// 这里在挂载时快照绑定 id，所有提交/flush 都只对本歌定向。
const boundSongId = scoreEditor.activeSong?.id ?? null;
// 与存储的"同步基线"：最近一次从 store 读取到的歌词。任何提交仅允许在 store 仍等于该基线时落地，
// 避免用陈旧的本地文本覆盖中途被「导入 / 下拉同步」更新过的最新歌词（"打开着导入不生效"的根因）。
const baseline = ref(localLyrics.value);
// 本地是否有未提交的用户编辑：为 true 时卸载/失活才允许定向提交；外部改动会被基线守卫拦截。
const dirty = ref(false);

const clampLinesLength = (text: string): string =>
  text
    .split('\n')
    .map(line => (line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) : line))
    .join('\n');

// 防抖提交：调度时锁定目标歌曲 id，触发时再读 live store 做基线守卫。
// 若触发前 store 已被外部改动，直接丢弃本次提交，杜绝陈旧文本覆盖新数据。
const commitLyrics = useDebounceFn((songId: string, value: string) => {
  if (!songId) return;
  const target = songStore.songs.find(s => s.id === songId);
  if (!target) return;
  // 写前守卫：仅当 store 仍是本编辑器的基线时才落地；被外部改动则作废。
  if (target.lyrics !== baseline.value || value === target.lyrics) {
    dirty.value = false;
    return;
  }
  dirty.value = false;
  scoreEditor.updateLyrics(value, songId);
}, 300);

watch(localLyrics, value => {
  const clamped = clampLinesLength(value);
  if (clamped !== value) {
    localLyrics.value = clamped;
    return;
  }
  // 与基线一致的值视为来自 store 的同步回写，无需再调度提交。
  if (value === baseline.value) return;
  dirty.value = true;
  commitLyrics(boundSongId ?? '', value);
});

// 外部（导入 / 云同步）或自家提交使 store 歌词变化时，以 store 为权威：
// - 与本地显示不一致说明发生了外部改动，取消挂起的防抖提交、重置本地缓冲；
// - 统一刷新本地显示、基线，并清除脏标记。
watch(
  () => [scoreEditor.activeSongId, scoreEditor.activeSong?.lyrics] as const,
  ([newId, lyrics]) => {
    if (!boundSongId || newId !== boundSongId) return;
    const next = lyrics ?? '';
    if (next !== localLyrics.value) {
      commitLyrics.cancel();
      localLyrics.value = next;
    }
    baseline.value = next;
    dirty.value = false;
  }
);

const flushLyrics = () => {
  if (!boundSongId) return;
  const current = songStore.songs.find(s => s.id === boundSongId)?.lyrics;
  // 无未提交编辑、或 store 已被外部改动（不再是基线）时，丢弃本地陈旧文本，不覆盖。
  if (!dirty.value || current === undefined || current !== baseline.value) return;
  if (localLyrics.value === current) return;
  scoreEditor.updateLyrics(localLyrics.value, boundSongId);
};

onDeactivated(flushLyrics);
onBeforeUnmount(flushLyrics);
</script>
