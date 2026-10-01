/**
 * 歌词字符的两条判定：**空格**与**换行分隔符**。
 *
 * 单独立成叶子模块（零 import）：三个消费方分居两处线程 —— 排列区行画布（主线程），以及乐谱导出的
 * 排版端与绘制端（Worker 线程，各一处）。此前是三份实现：一份具名 `isLyricSeparator`、一份同义改名
 * `isLyricBarChar`、一份内联的 `char === '|' || char === '｜'`；`scoreExportLayout` 的注释里自己
 * 记着「绘制端另有一份内联同义判定，未一并收拢 —— 留待下次碰那条路径时合并」，就是这里。
 *
 * 两条判定的口径都必须唯一：
 * - 空格（半角 / 全角）在排版上同为「一格空位」——列宽分档、连续空格判定、分词都读它；
 * - 分隔符（半角 / 全角竖线）视觉上当标点、不当正文字（绘制端给弱化次级色），同时打断一个词。
 * 任何一处漏改一个变体，都会让「量到的宽」与「画出来的宽」分叉，且不会报错。
 */

/** 是否空格（半角 / 全角）。入参收 `string | undefined`：调用方常直接递 `char?: string` 的槽位字段 */
export const isLyricSpace = (char: string | undefined): boolean => char === ' ' || char === '　';

/** 是否歌词换行分隔符（半角 / 全角竖线）。入参收 `string | undefined` 的理由同上 */
export const isLyricSeparator = (char: string | undefined): boolean => char === '|' || char === '｜';
