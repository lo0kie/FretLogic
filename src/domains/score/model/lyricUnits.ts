/**
 * 歌词行的**槽位单元**口径：一个用户感知的字符算一个槽位，而不是一个 UTF-16 码元。
 *
 * 为什么单独立成叶子模块（零 import）：同一口径有四处落点，分居两条线程、三个模块 ——
 * 排列区/预览的行模型（scoreExportCanvas 的 buildChars）、导出线程的字符收集（workerExportService）、
 * 便携文本格式的字符下标（textCodec）、导入端的越界守卫（textTransferActions）。此前四处各写
 * `split('')` 与 `.length`，任一处与其余三处口径不同，都会让「和弦挂在哪个字上」在预览、导出、
 * 文本往返三条路径之间静默错位（历史上就出现过「仅导出复现、预览正常」的那一类）。
 *
 * 口径：按**码点**切（`Array.from`），不按码元。代理对（emoji、CJK 扩展 B 及以后的汉字，
 * 如 U+2EE5D）在码元口径下占两个槽位，绘制端会把两个孤立半字各画成一个缺字框 ——
 * 观感是「一个字乱码成两个方框」，且该字之后的和弦整体错开一位。
 *
 * 已知边界：只处理到码点。组合序列（基字 + 组合符、ZWJ 连接的 emoji）仍会拆成多个槽位 ——
 * 那需要字素簇切分（Intl.Segmenter），而排版模型本就是「一格一字、推进宽恒为 1em」，
 * 字素簇的变宽会先破坏栅格，故不在本口径内解决。
 */

/** 按槽位单元切分一行歌词（码点口径） */
export const splitLyricUnits = (text: string): string[] => Array.from(text);

/** 槽位单元数：与 splitLyricUnits 同口径（直接复用其实现，避免两处各自演化） */
export const countLyricUnits = (text: string): number => splitLyricUnits(text).length;
