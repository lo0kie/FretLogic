/**
 * 乐谱字体的**度量契约**（Chromium 下的真实字体栈）。
 *
 * 为什么必须有这条：`scoreExportLayout` 的列宽模型是硬编码的两档 —— ASCII 走 0.5em、汉字走 1em，
 * 而 `data/fonts/*.woff2` 是**有损子集**（见 `scripts/build-font-subset.py`）。子集一旦重建错
 * （少切一段、换上游版本后推进宽变了），栅格会整体错位，而这种错位在单测里看不出来：它只在真机的
 * 字体度量里成立（jsdom 的 `measureText` 恒为 0，量不到任何东西）。
 *
 * 【两条必须按真机事实写，否则这条用例会「本地绿、CI 红」】
 * 1. **先钉住量的是谁**：字体没装上时下面量到的全是系统回落字体的数字，而回落的等宽族（Windows 的
 *    SimSun、Linux 上的 Unifont / 文泉驿之类）往往**恰好也是半角 0.5em、全角 1em** —— 四条断言会
 *    照过，契约变成一句空话（本机实测 `monospace` 与落地字体量出的四个值逐位相同）。故先断言登记进
 *    `document.fonts` 的那张 face 处于 loaded。
 * 2. **量宽在 Linux / headless Chromium 上被量化到整设备像素**（Windows 不量化：本机 23px 下量出的
 *    0.5em 就是 11.5）。同一份字体、同一个字号，CI 上量出来是 12 —— 于是 `toBeCloseTo(x, 1)`
 *    （容差 0.05px）必红。解法是把探测字号放大 10 倍再量：0.5em / 1em 在 230px 下都是**整数**
 *    （115 / 230），量化误差归零，而 ±1px 的绝对容差落到相对值上只有 0.9% —— 与原先「23px 下
 *    0.05px」的 0.4% 同一量级，真正的度量漂移照样拦得住。别把这两条改回紧容差。
 *
 * 附带记下两条实测事实（不作为断言，因为它们取决于机器上的系统回落字体）：
 * - 子集之外、系统字体也没有的汉字（如 CJK 扩展 I 的 U+2EE5D）渲染成**一个 1em 的方框** ——
 *   栅格不坏，但导出图里就是方框；这也说明「检测缺字形」不能靠 `document.fonts.check()`，
 *   它对任何码位都返回 true（连 U+FFFF 也是），判不出缺字形、也判不出字体有没有装上。
 * - 私用区 / 非字符（U+E000 / U+FFFF）的推进宽是 0.5em，而模型按码位 > 127 当全角 —— 这类码位
 *   本就不该出现在歌词里，差异不影响正常输入。
 *
 * ⚠️ 首次运行需要浏览器二进制：`npx playwright install chromium`。
 * 本文件不并进 `pnpm test`（`test` 脚本只列 logic + ui 两个 project），单跑 `pnpm test:browser`。
 */
import { describe, expect, it } from 'vitest';

import { ensureScoreFontsReady, SCORE_FONT_FACE, scoreFont } from '@/domains/score/preview/services/scoreFonts';

/** 歌词的实际渲染字号（见 build-font-subset.py 的说明） */
const FONT_PX = 23;

/** 量宽用的探测字号：渲染字号的 10 倍（理由见文件头第 2 条 —— 放大后期望值都是整数，量化误差归零） */
const PROBE_PX = FONT_PX * 10;

/**
 * ±1 个设备像素的容差。刻意不用 `toBeCloseTo`：它的第二参是「小数位」，表达不了「一个像素」这个
 * **绝对**容差 —— 传 0 恰好是严格 `< 0.5`（边界值 12 vs 11.5 会被判失败），传 1 又松到 0.05px 的十分之一。
 */
const expectWithinPixel = (actual: number, expected: number, label: string): void => {
  expect(actual, label).toBeGreaterThanOrEqual(expected - 1);
  expect(actual, label).toBeLessThanOrEqual(expected + 1);
};

describe('乐谱字体的度量契约', () => {
  it('ASCII 走 0.5em、汉字走 1em —— 列宽模型的两档假设', async () => {
    await ensureScoreFontsReady([400]);

    // 先钉住「量的是谁」：字体没装上时下面全是回落字体的数字，而回落的等宽族往往也满足 0.5em / 1em，
    // 断言照过 —— 这条契约就成了空话。故先要求登记进 document.fonts 的那张 face 真的处于 loaded。
    // family 在 CSSOM 里带引号（实测 `"Sarasa Mono SC"`），比较前去掉。
    const scoreFaces = Array.from(document.fonts).filter(face => face.family.replace(/"/g, '') === SCORE_FONT_FACE);
    expect(scoreFaces.length, `document.fonts 里没有 ${SCORE_FONT_FACE} 的 face（字体未登记）`).toBeGreaterThan(0);
    expect(
      scoreFaces.map(face => face.status),
      `${SCORE_FONT_FACE} 未装载成功，下面的度量会量到系统回落字体，契约不成立`
    ).toContain('loaded');

    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('当前环境没有 2d context');
    ctx.font = scoreFont(400, PROBE_PX);
    const widthOf = (ch: string): number => ctx.measureText(ch).width;

    // 半角档：取一个字母与一个数字，避免「碰巧命中某个字形」的假绿
    expectWithinPixel(widthOf('A'), PROBE_PX * 0.5, 'ASCII 字母推进宽必须为 0.5em');
    expectWithinPixel(widthOf('5'), PROBE_PX * 0.5, 'ASCII 数字推进宽必须为 0.5em');

    // 全角档：GB2312 汉字与全角标点（后者即便不在子集里也会回落到中文族，同为 1em）
    expectWithinPixel(widthOf('我'), PROBE_PX, '汉字推进宽必须为 1em');
    expectWithinPixel(widthOf('。'), PROBE_PX, '全角标点推进宽必须为 1em');

    // 子集之外的汉字也必须占到一格（弱断言：具体宽度取决于系统回落字体，本机实测为 1em）——
    // 若它塌成 0 宽，该字所在的那一格会连同和弦卡片一起错位
    const outsideSubset = String.fromCodePoint(0x2ee5d);
    expect(widthOf(outsideSubset), '子集外的汉字仍应占一格（不为 0 宽）').toBeGreaterThan(0);
  });
});
