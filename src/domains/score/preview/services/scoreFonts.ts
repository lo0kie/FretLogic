/**
 * 乐谱字体（随包分发的 Sarasa Mono SC 子集）：**族栈与字重表的唯一来源**，外加按环境装载。
 *
 * 【为什么两个环境共用这一个模块】同一份族栈字符串要同时服务于预览层（页面 canvas）与导出线程
 *  （Worker 的 OffscreenCanvas）。分头各写一份，迟早出现「一边换了、另一边没换」的静默漂移；更要紧
 *  的是：**同一条代码路径不等于同一个字体环境**，两边必须装同一份子集才能字形同源（见下条）。
 *
 * 【两个字体环境，各自都要注册】HTML 规范把「哪些字体可用」绑定在 font style source object 上：
 *  页面的 @font-face / document.fonts 属于页面文档，Worker 有独立的 FontFaceSet（WorkerGlobalScope
 *  的 fonts，即 self.fonts），两者不共享。canvas 属于哪个 source 就只认哪份字体，所以注册必须发生在
 *  **绘制所在的那个环境里**：本模块按环境取 FontFaceSet，于是预览层与导出线程装的是同一份子集、
 *  同一个族名，绘制端又只用 scoreFont 拼出的同一个字符串 —— 两条路径的字形因此同源。
 *
 * 【为什么随包分发，而不是要求用户装系统字体】回落字体不是「同一个东西的另一种样子」：Consolas 的
 *  ASCII 推进宽是 0.55em、Menlo / SF Mono 是 0.6em，而 scoreExportLayout 的半角列宽是按 Sarasa 实测
 *  的 0.5em 推进宽 + 与汉字相同的字间隙算死的。让用户自行安装，等于让「装了的机器好看、没装的机器
 *  字距乱」成为不可控差异；随包分发才能让每台机器渲染同一张图。
 *
 * 【族名与系统字体同名是有意为之】FontFaceSet 里注册的 face 优先于系统同名字体，所以用户即使另外装
 *  了 Sarasa 也不会改变结果（可复现）；而一旦加载失败，字体栈会自然落到 ui-monospace / Consolas 等
 *  系统等宽族，渲染照常完成。
 *
 * 【按需装载】只请求调用方点名会用到的字重：Light（300）仅在歌词字重选 light 时才会用到，默认导出
 *  不必为它多下 1MB、多解一份字体。三个字重各约 1MB（子集 + 去 hinting，见
 *  scripts/build-font-subset.py：ASCII 与拉丁取全量、汉字取 GB2312 全集）。每个字重在每个环境只加载
 *  一次，此后零等待；**失败也记入缓存、不重试** —— 一次必然失败的请求没有重打的理由。渲染 Worker 是
 *  常驻的（见 workerExportService 的 idle 回收），故「一次」按 Worker 的生命周期算。
 *
 * 【加载形式】三个子集用裸导入取得 URL（woff2 属 Vite 的已知 asset 类型，不需要 ?url 修饰符）。Vite
 *  会把该 URL 按 base 渲染成相对当前脚本的绝对地址（vite.config.ts 里 base 为 ./），运行时不需要再做
 *  路径拼接。URL 只是字符串，字体文件在 FontFace.load() 时才真正发起请求。
 */

import boldFontUrl from '@data/fonts/SarasaMonoSC-Bold.woff2';
import lightFontUrl from '@data/fonts/SarasaMonoSC-Light.woff2';
import regularFontUrl from '@data/fonts/SarasaMonoSC-Regular.woff2';

import { logger } from '@/platform/utils/logger';

const SCOPE = 'scoreFont';

/** 乐谱字体族名。注册（页面 document.fonts / 渲染 Worker 的 self.fonts）与引用都必须用这一个名字：
 *  注册失败时字体栈自然落到后面的系统等宽族，渲染照常完成，只是不再与注册那套同源。 */
export const SCORE_FONT_FACE = 'Sarasa Mono SC';

/** 乐谱字体栈：**Sarasa Mono SC（等距更纱黑体 SC）优先**，其余为等宽回落，汉字再回落中文族。
 *  整张乐谱共用这一份 —— 标题 / 歌手 / 元信息 / 和弦名 / capo 与品号 / 歌词 / 页脚页码，全部走 scoreFont。
 *
 *  【为什么等宽族排在中文字体之前】一条普遍理由 + 一条歌词特有的理由：
 *  1. 歌词是「每字一格、字形在格内居中」的栅格排法：列宽由 getCharColumnWidth 给定，绘制端按
 *     currentX + colW / 2 居中，每字上方的指板图按同一列居中（两者必须共用这一列）。栅格里的
 *     字距 = 列宽 − 字形推进宽，**只有推进宽恒定时才逐字相等**：比例字体下 'i' / 'j' / '1' 这类
 *     窄字形左右各空一大块、'm' / 'w' 几乎顶到格边，观感就是「字母间距忽大忽小」。等宽族普遍
 *     没有汉字字形，字符级回落会走到末尾中文族（其全角推进宽恒为 1em，与列宽模型的假设一致）；
 *     反过来把中文族排前面，带拉丁字形的中文字体会把 ASCII 也一并接走，等宽就白换了。
 *  2. 全谱共用一份栈，Sarasa 取不到时（离线且缓存未命中）整张图统一落到同一族系统等宽，风格
 *     仍然自洽；若各处各写一份栈，就会退化成「标题 sans、歌词 mono」的混搭。
 *
 *  Sarasa Mono SC（SIL OFL 1.1，Iosevka + 思源黑体）排第一，因为它一次命中本模型的两条假设：
 *  upem=1000 下 ASCII 推进宽恒为 500（0.5em）、汉字与全角标点恒为 1000（1em，即字号本身）。
 *  中英出自同一套设计，不必再靠回落混搭两种风格；Light / Regular / Bold 三个字重正好对应下面
 *  FONT_FACES 里的 300 / 400 / 700。
 */
// 下一行是 CSS 字体栈而非 Tailwind 类名：本项目把变量里的字符串一律按空白切成类名 token
//（eslint.config.mjs 的 variables: [['.*', …]]），"SF Mono" / "Cascadia Mono" / "DejaVu Sans Mono"
// 会切出三个相同的 token，重复类名检查在此为误报。该规则带 autofix，若被自动修复会直接删掉
// 这些 token、削坏字体栈 —— 故必须显式豁免，而不是把字体栈拆成不重复的形式去迎合它。
// eslint-disable-next-line better-tailwindcss/no-duplicate-classes
const SCORE_FONT_FAMILY = `"${SCORE_FONT_FACE}", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Cascadia Mono", "DejaVu Sans Mono", monospace, "PingFang SC", "Microsoft YaHei", sans-serif`;

/** 拼乐谱字体串：族栈只在上面定义一次，调用方只给「字重 + 字号」，换族时改一处即全谱生效，
 *  不会出现「标题换了、元信息还是旧栈」的局部漂移。字重可用数字（400 / 700）或 CSS 关键字（'bold'）。 */
export const scoreFont = (weight: number | string, size: number): string => `${weight} ${size}px ${SCORE_FONT_FAMILY}`;

/** 一个字重对应的子集文件 */
interface FontFaceEntry {
  readonly url: string;
  readonly weight: number;
}

/** 三个字重各自的子集文件。**500 没有文件**：歌手与元信息正文取 500，按 CSS 字体匹配规则（500 无
 *  候选时先向下取更轻档）落到 Regular —— 与子集只有三档的事实一致，不必补第四份。 */
const FONT_FACES: readonly FontFaceEntry[] = [
  { url: lightFontUrl, weight: 300 },
  { url: regularFontUrl, weight: 400 },
  { url: boldFontUrl, weight: 700 },
];

const faceOfWeight = (weight: number): FontFaceEntry | undefined => FONT_FACES.find(face => face.weight === weight);

/** 不支持 FontFace 的环境只提示一次：否则每次渲染都会重打一遍同样的 warn */
let unsupportedWarned = false;

/**
 * 取本环境的 FontFaceSet：渲染 Worker 走 globalThis.fonts（即 self.fonts），页面走 document.fonts；
 * 都不支持时返回 null（调用方按「字体不可用」降级）。
 *
 * globalThis.fonts 的类型由 src/vite-env.d.ts 的 declare global 补上（DOM lib 里字体集是 Document
 * 的成员、Window 上没有；Worker 的字体集挂在 WorkerGlobalScope 上，而本项目不引 webworker lib）。
 * 取成局部常量而非直接属性访问：收窄跨不过闭包边界。
 */
const fontSetOf = (): FontFaceSet | null => {
  // 解构默认值：Worker 取 globalThis.fonts（self.fonts）；主线程上该属性为 undefined，回落到 document.fonts
  const { fonts = globalThis.document?.fonts } = globalThis;
  if (globalThis.FontFace && fonts) return fonts;

  if (!unsupportedWarned) {
    unsupportedWarned = true;
    logger.warn(SCOPE, '当前环境不支持 FontFace API，乐谱按系统字体栈回落');
  }
  return null;
};

/** 字重 → 加载任务（含已失败并已 warn 的那次）：同一字重只请求一次，重复请求直接复用 */
const weightTasks = new Map<number, Promise<void>>();

/**
 * 装载单个字重。**承诺不 reject**，故可直接丢进 Promise.all。
 *
 * 错误边界是刻意的：字体只影响字形风格，拿不到就按字体栈回落、渲染照常完成，没有理由让整次渲染失败。
 * 单个字重失败也不影响其余字重（各自独立的任务），失败的 face 仍留在 FontFaceSet 里（状态为 error，
 * 不参与匹配），该档会落到后面的系统等宽族。
 */
const loadWeight = (fonts: FontFaceSet, weight: number, url: string): Promise<void> => {
  const cached = weightTasks.get(weight);
  if (cached) return cached;

  const task = (async () => {
    try {
      const face = new FontFace(SCORE_FONT_FACE, `url("${url}")`, { weight: String(weight) });
      // 先 add 再 load：add 是同步的，load 的结果（成功/失败）都在本函数里收敛，
      // 顺序反过来会漏掉「face 未进集合但已经在加载」这个中间态
      fonts.add(face);
      await face.load();
    } catch (err) {
      logger.warn(SCOPE, `字重 ${weight} 的乐谱字体加载失败，该档按系统字体栈回落`, err);
    }
  })();

  weightTasks.set(weight, task);
  return task;
};

/**
 * 装载这批字重（幂等）。调用方必须在**首次量宽 / 绘制之前** await 一次：量宽（measureText）与绘制必须
 * 用同一份字体，否则会按回落字体量宽、再按注册后的字体绘制，列宽与字形对不上。**承诺不 reject**。
 *
 * 未登记的字重直接跳过：它本就没有对应文件，交给字体栈按 CSS 匹配规则回落（例如 500 → 400）。
 */
export const ensureScoreFontsReady = async (weights: readonly number[]): Promise<void> => {
  const fonts = fontSetOf();
  if (!fonts) return;

  await Promise.all(
    weights.map(weight => {
      const face = faceOfWeight(weight);
      return face ? loadWeight(fonts, face.weight, face.url) : undefined;
    })
  );
};
