import { computed } from 'vue';

import { getActivePinia } from 'pinia';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import {
  buildLyricsLinesWithEdges,
  clearLyricsLineCharsCache,
} from '@/domains/score/preview/services/scoreExportCanvas';

import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';

// 模块级单例：ScoreView 与 ScoreInteractiveArea 共享同一套 computed，
// 避免 chordsLookupMap / lyricsLinesWithEdges 各自重复构建与双份依赖追踪
let singleton: ReturnType<typeof buildSingleton> | null = null;
let lastPinia: unknown = null;

/**
 * 上一次清缓存时所处的歌曲 id。换歌即清，**读时自检、不用 `watch`**。
 *
 * 原先是在单例里注册 `watch(() => activeSongId, clearLyricsLineCharsCache)`：watch 绑在
 * **首个调用方**的作用域上，而单例是模块级的 —— 那个组件被真销毁（KeepAlive `:max` 淘汰 / v-if）
 * 后 watch 一并停止，单例仍被后续调用方使用，字符缓存的清理却永久停摆（换歌后缓存不再失效）。
 * 自检与作用域彻底解耦，成本只是一次引用比较。
 */
let charsCacheSongId: string | null = null;
const syncLyricsCharsCache = (songId: string | null): void => {
  if (charsCacheSongId === songId) return;
  charsCacheSongId = songId;
  clearLyricsLineCharsCache();
};

/** 构建共享的谱面行数据 computed（模块级单例的实际内容） */
function buildSingleton() {
  const scoreEditor = useScoreEditorStore();
  const chordStore = useChordStore();

  // 查找表下沉到 chordStore（id/指纹双键，computed 常驻）：谱面/预览/选器共用同一份，
  // 不再各自 O(库) 重建（见 chordStore.chordsLookupMap 注释）。
  // store 实例会解包 ref，这里再包一层 computed 维持「.value」消费签名不变
  const chordsLookupMap = computed(() => chordStore.chordsLookupMap);

  const lyricsLinesWithEdges = computed<LineData[]>(() => {
    if (!scoreEditor.activeSong) return [];
    // 换歌即清字符缓存（读时自检，理由见 syncLyricsCharsCache 的说明）
    syncLyricsCharsCache(scoreEditor.activeSongId);

    return buildLyricsLinesWithEdges(
      scoreEditor.activeSong.lyrics,
      scoreEditor.activeSong.chordMap,
      chordsLookupMap.value,
      scoreEditor.activeSong.lineIds
    );
  });

  return { lyricsLinesWithEdges, chordsLookupMap };
}

/** 获取谱面行数据单例：和弦查找表与逐行歌词/和弦数据，全局共享一份 */
export function useScoreLinesData() {
  const currentPinia = getActivePinia();
  if (!singleton || lastPinia !== currentPinia) {
    lastPinia = currentPinia;
    singleton = buildSingleton();
  }
  return singleton;
}
