import type { Song } from '@/domains/score/types';

/**
 * 乐谱列表的「歌曲行」视图模型：派生量在列表构建期一次算完（`computeSongKey` 此前每行被调 3 次）。
 * 调性串与三段 aria/title 只依赖 song 自身字段，纯派生；「当前选中」与「右键命中」依赖响应式状态，
 * 且只是字符串比较，故不在这里预计算 —— 前者归 SongCard 自己（读 scoreEditor.activeSongId），
 * 后者是列表级状态，由 SongSection 经 menuTarget 下发。
 *
 * 单独成模块的原因：SongCard 需要这个类型，而 SFC 的 `<script setup>` 无法对外导出类型。
 */
export interface SongItemRow {
  key: string;
  type: 'song';
  song: Song;
  songKeyText: string;
  cardAriaLabel: string;
  keyAriaLabel: string;
  keyTitle: string;
}
