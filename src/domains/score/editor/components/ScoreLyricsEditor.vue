<template>
  <!-- 窄屏收窄留白：桌面 1.5rem/2rem 的四周留白在手机上要吃掉近四分之一屏宽，
       与互动面板的窄屏档（`ScoreInteractiveArea` 的 `max-md:pt-sm max-md:pl-sm`）对齐到 0.5rem。
       输入框**自身**的内边距（`BaseTextarea` 的可见盒写死 `p-xl` = 1.5rem ≈ 33.4px）在窄屏同样要收一档 ——
       它与本层留白是两圈独立的内边距，只收外层的话文字四周仍留着 1.5rem 的空白。
       收的是**整档 `p-sm`**（0.5rem ≈ 11.1px，与本层窄屏档同值），四边等宽：原先只收 px / pt、
       下边距仍留着 `p-xl`（为右下角字数统计让位），于是下方那段空白是左右与上方的三倍，文字块
       整体偏上、看着像没对齐。改成整档后四边同宽，代价是字数统计（`bottom-2` + 约 22px 高）会与
       最后一行歌词的右下角重叠 —— 只在长文本滚到底时撞上，且它只有约 44px 宽。
       这三条类落在 `BaseTextarea` 的**根元素**上 —— 内边距如今就画在那一层（可见盒），
       与 `size-full` 同属一个节点，故窄屏覆盖直接写即可，不必再用后代变体打进去。
       `max-md:` 在本项目里是**浏览器初始字号**的 48rem = 768px（媒体查询里的 rem 不认应用根字号
       22.25px，见 assets/tailwind.css 的 `--breakpoint-md`），与 `useResponsive` 的 md 同值；
       宽档（≥ 768px）本来就是 `p-xl` 四边等宽，不需要覆盖。 -->
  <div class="relative flex-1 px-2xl py-xl max-md:px-sm max-md:py-sm">
    <!-- 窄屏字号降到 text-xs（0.75rem ≈ 16.7px）：文本域自带的是 `text-base/relaxed`（1rem ≈ 22.25px），
         在手机上只装得下十来个字一行。两个理由定在 text-xs 这一档：① 与本项目其它输入控件同档
         （`BaseInput` 的 `FONT_SIZE_CLASS` md 档就是 text-xs）；② 它略高于 16px —— iOS Safari
         对字号 < 16px 的输入框会在聚焦时把整页放大，这一档正好不触发。
         字号落在文本域自身（组件根是包裹层、字号写死在 textarea 上），故用后代变体打到它；
         带 `/relaxed` 是**刻意保留**原来的行高比（text-xs 自带 1.333 的行高会顺带把歌词行压紧）。 -->
    <BaseTextarea
      v-model="localLyrics"
      @compositionend="handleCompositionEnd()"
      @compositionstart="isComposing = true"
      show-count
      appearance="glass"
      class="size-full max-md:p-sm max-md:[&_textarea]:text-xs/relaxed"
      placeholder="在此处输入或粘贴歌词文本..."
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';

import BaseTextarea from '@/platform/ui/input/BaseTextarea.vue';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { splitLyricUnits } from '@/domains/score/model/lyricUnits';
import { sanitizeLyricsText } from '@/domains/score/model/scoreModel';
import { useUiStore } from '@/platform/store/uiStore';

defineOptions({ name: 'ScoreLyricsEditor' });

const MAX_LINE_LENGTH = 100;
/** 超长截断提示的节流间隔：连续输入超长文本时每次按键都会触发截断，逐次提示会刷爆 message */
const CLAMP_WARN_INTERVAL = 3000;

const scoreEditor = useScoreEditorStore();
const songStore = useSongStore();
const uiStore = useUiStore();
const localLyrics = ref(scoreEditor.activeSong?.lyrics ?? '');
let lastClampWarnAt = 0;
/**
 * IME（输入法）组合中标记。Chrome/Safari 在组合过程中同样派发 input 事件，若此时把
 * localLyrics 改写成截断值，组合会被中断（候选词丢失 / 已上屏文字重复）。组合期间挂起
 * 处理，由 compositionend 补做一次。
 */
const isComposing = ref(false);

// 锁定本编辑器实例绑定到的歌曲 id：ScoreView 用 :key 按 activeSong 重挂载本组件，
// 因此实例生命周期内绑定的就是创建时的 current activeSong。卸载/切歌时 activeSongId 已变为新歌，
// 直接读 live 值会把本曲歌词串写进新歌（删空本曲后切歌即清空他曲的根因）。
// 这里在挂载时快照绑定 id，所有提交/flush 都只对本歌定向。
const boundSongId = scoreEditor.activeSong?.id ?? null;
// 与存储的"同步基线"：最近一次从 store 读取到的歌词。任何提交仅允许在 store 仍等于该基线时落地，
// 避免用陈旧的本地文本覆盖中途被「导入 / 下拉同步」更新过的最新歌词（"打开着导入不生效"的根因）。
// 有意取一次初始快照作为同步基线，后续提交以该基线守卫；对 AST 规则的误报行内豁免
// eslint-disable-next-line vue/no-ref-object-reactivity-loss
const baseline = ref(localLyrics.value);
// 本地是否有未提交的用户编辑：为 true 时卸载/失活才允许定向提交；外部改动会被基线守卫拦截。
const dirty = ref(false);

/** 逐行截断超长行，保证单行不超过最大长度限制。
 *  按**槽位单元**（码点）数：`slice` 按码元截会把代理对切成两半、留下一个孤立半字
 *（渲染成缺字框，与「一个字乱码成两个方框」同源），且「100 字」的口径本就是用户看到的字数。 */
const clampLinesLength = (text: string): string =>
  text
    .split('\n')
    .map(line => {
      const units = splitLyricUnits(line);
      return units.length > MAX_LINE_LENGTH ? units.slice(0, MAX_LINE_LENGTH).join('') : line;
    })
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
  const result = scoreEditor.updateLyrics(value, songId);
  // 未匹配行数超阈值时整行会拿到新 id、原有和弦被回收（大段粘贴场景），静默丢和弦不可接受
  if (result.skippedSimilarMatch)
    uiStore.message.warning('大段歌词未能与原有行对齐，相关行的和弦已一并清除', {
      description: '可立即撤销恢复，或分批粘贴以保留原有和弦。',
    });
}, 300);

/**
 * 处理本地文本变化：截断超长行并按需调度提交。
 * 抽成函数而非内联在 watch 里，是为了让 compositionend 能补做一次被挂起的处理。
 */
const processLyrics = (value: string) => {
  const clamped = clampLinesLength(value);
  if (clamped !== value) {
    localLyrics.value = clamped;
    // 截断是静默丢字，必须告知；但超长输入期间每次按键都会触发，按时间节流只提示一次
    const now = Date.now();
    if (now - lastClampWarnAt > CLAMP_WARN_INTERVAL) {
      lastClampWarnAt = now;
      uiStore.message.warning(`单行最多 ${MAX_LINE_LENGTH} 字，超出已截断`);
    }
    return;
  }
  // 与基线一致的值视为来自 store 的同步回写，无需再调度提交。
  // 但必须**同时撤掉挂起的那次提交**：用户「打字 → 300ms 内删回基线」时，防抖里挂着的是旧值，
  // 撤销后它仍会在尾沿触发并落盘，把刚被删掉的文字自己送回来（外部 watch 再把它拉回 textarea）。
  if (value === baseline.value) {
    commitLyrics.cancel();
    dirty.value = false;
    return;
  }
  dirty.value = true;
  commitLyrics(boundSongId ?? '', value);
};

watch(localLyrics, value => {
  // IME 组合期间挂起：组合中改写 v-model 值会打断候选词（见 isComposing 的说明）。
  // 组合结束后由 handleCompositionEnd 补做，这段编辑不会丢。
  if (isComposing.value) return;
  processLyrics(value);
});

/** 组合结束：补做一次被挂起的截断与提交，否则这一段编辑要等下一次按键才生效 */
const handleCompositionEnd = () => {
  isComposing.value = false;
  processLyrics(localLyrics.value);
};

// 外部（导入 / 云同步）或自家提交使 store 歌词变化时，以 store 为权威：
// - 与本地显示不一致说明发生了外部改动，取消挂起的防抖提交、重置本地缓冲；
// - 统一刷新本地显示、基线，并清除脏标记。
watch(
  () => [scoreEditor.activeSongId, scoreEditor.activeSong?.lyrics] as const,
  ([newId, lyrics]) => {
    if (!boundSongId || newId !== boundSongId) return;
    const next = lyrics ?? '';
    if (next !== localLyrics.value) {
      // 自家提交的回灌：store 侧会按行 trim、去制表符/回车、全角空格转半角（见 sanitizeLyricsText），
      // 于是规范化前后不同是**正常**的，不是外部改动。此时若整体重写 textarea，用户刚敲的行尾空格
      // 会被抹掉、光标跳到全文末尾（后续输入全落进最后一行）。判据与 store 同一把尺子：规范化后
      // 与来值相等即「其实没变」，保留本地缓冲、只把基线推齐。
      if (sanitizeLyricsText(localLyrics.value) === next) {
        baseline.value = next;
        dirty.value = false;
        return;
      }
      commitLyrics.cancel();
      localLyrics.value = next;
    }
    baseline.value = next;
    dirty.value = false;
  }
);

/** 组件失活/卸载前把未提交的本地编辑定向写入本曲；store 已被外部改动时丢弃陈旧文本 */
const flushLyrics = () => {
  if (!boundSongId) return;
  const current = songStore.songs.find(s => s.id === boundSongId)?.lyrics;
  // 无未提交编辑、或 store 已被外部改动（不再是基线）时，丢弃本地陈旧文本，不覆盖。
  if (!dirty.value || current === undefined || current !== baseline.value) return;
  if (localLyrics.value === current) return;
  const result = scoreEditor.updateLyrics(localLyrics.value, boundSongId);
  // 与防抖提交同口径：skippedSimilarMatch 不能吞掉，否则同一次编辑在「切 tab」与
  // 「原地输入」两条路径下结局不同（一个有警告可撤销、一个静默丢和弦）
  if (result.skippedSimilarMatch)
    uiStore.message.warning('大段歌词未能与原有行对齐，相关行的和弦已一并清除', {
      description: '可立即撤销恢复，或分批粘贴以保留原有和弦。',
    });
};

onDeactivated(flushLyrics);
onBeforeUnmount(flushLyrics);
</script>
