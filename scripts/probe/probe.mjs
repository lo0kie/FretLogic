/**
 * 通用探针 · Chromium 真渲染档 —— 写一次，反复用。
 *
 * 为什么有它：验证 UI 几何 / 计算样式 / 断点行为，此前每次都要现写一份 `.temp/` 一次性脚本，而其中
 * 九成是同一套样板（起 Chromium → 注入 dist 的真样式表 → 复刻 DOM 链 → 扫视口 → 量 → 打印 → 收摊）。
 * 样板抄错一次就得到一个**看着正常的假读数**，比不量更坏。这里把样板固化，case 文件里只留
 * 「这一次要量什么」。
 *
 * 用法：
 *   pnpm probe cases/<name>.mjs [选项]
 *   （等价写法 node scripts/probe/probe.mjs …；case 路径先按当前目录解析、再按 scripts/probe/ 解析，
 *     故从仓库根与从 scripts/probe 目录敲都能用）
 *
 * 选项：
 *   --viewport 1440x900,390x844   覆盖 case 的视口列表（可多组，逗号分隔）
 *   --shot                        每个视口存一张截图到 .pp-probe/out/（该目录被 git 忽略，只放产物）
 *   --headful                     开有头窗口（默认无头）
 *   --keep                        量完不关浏览器，停在现场等回车（配合 --headful 用）
 *
 * case 文件（ESM，default 导出一个对象）：
 *
 *   export default {
 *     title: '分段控件的高度档',              // 可选，只用于打印
 *     theme: 'dark',                          // 'dark'（默认）| 'light' | 'high-contrast'
 *     viewports: [[1440, 900], [390, 844]],   // 默认 [[1440, 900]]
 *     css: 'app',                             // 'app'（默认，注入 dist 真样式表）| 'none' | 自定义 CSS 文本
 *     body: '<div class="p-4">…</div>',       // 页面内容（塞进真实的 #app 里）
 *     url: 'http://localhost:5173/#/score',   // 给了它就 goto 真机页面；此时 body / css 都被忽略
 *     async setup(page) {},                   // 可选：注入后、测量前（点开面板、等一帧…）
 *     async measure(page) {                   // 必填：返回**一行读数**，键即表格列
 *       return { '卡片宽': await page.$eval('.card', el => el.getBoundingClientRect().width) };
 *     },
 *   };
 *
 * 契约（刻意留窄，为的是读数可比）：
 * - `setup` / `measure` 里的代码**在浏览器里执行**（`page.evaluate` 的同一个上下文），直接用
 *   `document` / `getComputedStyle` 即可 —— eslint 已为 `scripts/probe/**` 并入浏览器全局。
 * - `measure` 返回**纯数据**（数字 / 字符串 / 布尔），排版成表由探针负责；要断言就在 case 里断言并
 *   `throw`（探针会原样报出，并指出该视口的截图路径）。
 * - 视口之间**互不继承**：每组都重新 setContent / goto，上一组的 DOM 状态不会漏到下一组。
 * - 真样式表来自 `dist/`：**改了源码必须先 `pnpm build`**，否则量的是旧产物。探针启动时会打印产物
 *   时间戳 —— 读数与源码对不上时，第一个要看的就是它。
 * - 主题按真实应用的方式挂：`<html data-theme="…" class="dark">`（见 index.html 的首帧脚本与
 *   useTheme.apply）。goto 真机页面时也照此覆写 documentElement，否则量的是系统偏好那套。
 *
 * 探针代码本身在 `scripts/probe/`（**入库**，属于仓库工装）；`--shot` 的图落在 `.pp-probe/out/`
 * （被 `.gitignore` 忽略，那里只放可再生的产物）。别把探针代码写进 `.pp-probe/` —— 那份会被忽略。
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { loadAppCss } from './lib/appCss.mjs';

const OUT_DIR = path.resolve(import.meta.dirname, '..', '..', '.pp-probe', 'out');
const DEFAULT_VIEWPORT = [1440, 900];
const USAGE =
  '用法：pnpm probe cases/<name>.mjs [--viewport 1440x900] [--shot] [--headful] [--keep]\n' +
  '  （等价写法：node scripts/probe/probe.mjs …；case 路径先按当前目录解析、再按 scripts/probe/ 解析）';

/** `1440x900,390x844` → `[[1440, 900], [390, 844]]` */
const parseViewports = (raw, flag) => {
  if (!raw) throw new Error(`${flag} 后面要跟尺寸，如 --viewport 1440x900（多组用逗号分隔）`);
  return raw.split(',').map(part => {
    const matched = /^(\d+)x(\d+)$/.exec(part.trim());
    if (!matched) throw new Error(`视口「${part.trim()}」不是 WxH 形式（如 1440x900）`);
    return [Number(matched[1]), Number(matched[2])];
  });
};

/**
 * 命令行解析。未知参数**直接报错**：静默忽略一个拼错的开关（`--shot` 写成 `--shots`），探针会按
 * 默认档跑完、表格看着也正常，只是少存了图 —— 那种失败最难发现。
 */
const parseArgs = argv => {
  const opts = { casePath: '', viewports: null, shot: false, headful: false, keep: false };
  const unknown = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--shot') opts.shot = true;
    else if (arg === '--headful') opts.headful = true;
    else if (arg === '--keep') opts.keep = true;
    else if (arg === '--viewport') opts.viewports = parseViewports(argv[++i], arg);
    else if (arg.startsWith('--')) unknown.push(arg);
    else if (opts.casePath === '') opts.casePath = arg;
    else unknown.push(arg);
  }
  if (unknown.length > 0) throw new Error(`不认识的参数：${unknown.join(' ')}\n${USAGE}`);
  return opts;
};

/** CJK / 全角按 2 格算：终端按等宽字形排版，按码点数算宽度会让表头与读数错位 */
const CJK = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/;
const widthOf = value => [...String(value)].reduce((sum, ch) => sum + (CJK.test(ch) ? 2 : 1), 0);
const padTo = (value, width) => `${value}${' '.repeat(Math.max(0, width - widthOf(value)))}`;

/** 打印读数表：列 = 各行键的并集（按首行顺序），列宽取该列最长值 */
const printTable = rows => {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const widths = columns.map(col =>
    Math.max(widthOf(col), ...rows.map(row => widthOf(row[col] === undefined ? '' : row[col])))
  );
  console.log(columns.map((col, i) => padTo(col, widths[i])).join('  '));
  console.log(widths.map(width => '-'.repeat(width)).join('  '));
  for (const row of rows)
    console.log(columns.map((col, i) => padTo(row[col] === undefined ? '' : row[col], widths[i])).join('  '));
};

/** 主题属性：与 index.html 首帧脚本、useTheme.apply 同一口径（dark 同时挂 .dark class） */
const themeAttrs = theme => (theme === 'dark' ? ' data-theme="dark" class="dark"' : ` data-theme="${theme}"`);

/** 复刻 index.html 的骨架（lang / 视口 meta / #app 容器），只把脚本换成样式与 case 的 body */
const buildHtml = (css, body, theme) =>
  `<!doctype html><html lang="zh-CN"${themeAttrs(theme)}><head><meta charset="UTF-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${css}</style></head>` +
  `<body><div id="app">${body}</div></body></html>`;

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.casePath) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  // case 路径先按当前目录解析，找不到再按探针目录解析 —— 于是「从仓库根敲
  // `node scripts/probe/probe.mjs cases/xxx.mjs`」与「cd 进 scripts/probe 再敲」两种习惯都能用
  const givenPath = path.resolve(process.cwd(), opts.casePath);
  const casePath = existsSync(givenPath) ? givenPath : path.resolve(import.meta.dirname, opts.casePath);
  const { default: spec } = await import(pathToFileURL(casePath).href);
  if (!spec || typeof spec.measure !== 'function')
    throw new Error(`${opts.casePath} 必须 default 导出一个带 measure(page) 的对象（契约见本文件头部注释）`);

  const viewports = opts.viewports ?? spec.viewports ?? [DEFAULT_VIEWPORT];
  const theme = spec.theme ?? 'dark';
  const caseName = path.basename(casePath, path.extname(casePath));

  // 样式：url 档不动样式（真机页面自带），'app' 取产物，字符串当自定义 CSS，'none' 什么都不注入
  let css = '';
  const cssSpec = spec.css ?? 'app';
  if (!spec.url && cssSpec === 'app') {
    const app = await loadAppCss();
    css = app.css;
    console.log(`样式表：${app.files.length} 份 dist 产物，最后写入 ${app.builtAt.toLocaleString('zh-CN')}`);
  } else if (!spec.url && typeof cssSpec === 'string' && cssSpec !== 'none') {
    css = cssSpec;
  }

  if (opts.shot) await mkdir(OUT_DIR, { recursive: true });
  console.log(`${spec.title ? `${spec.title} · ` : ''}${caseName} · 主题 ${theme} · ${viewports.length} 个视口\n`);

  const browser = await chromium.launch({ headless: !opts.headful });
  const rows = [];
  let failed = 0;

  try {
    for (const [width, height] of viewports) {
      const page = await browser.newPage({ viewport: { width, height } });
      const row = { 视口: `${width}x${height}` };
      try {
        if (spec.url) {
          await page.goto(spec.url, { waitUntil: 'load' });
          // 真机页面的主题由应用自己决定：探针照 case 覆写，否则量到的是系统偏好那一套
          await page.evaluate(t => {
            const root = document.documentElement;
            root.setAttribute('data-theme', t);
            root.classList.toggle('dark', t === 'dark');
          }, theme);
        } else {
          await page.setContent(buildHtml(css, spec.body ?? '', theme), { waitUntil: 'load' });
        }
        // 字体就绪前量文字宽高会拿到回落字形的读数（本仓带自定义字体子集），故先等一次
        await page.evaluate(() => document.fonts?.ready);
        if (spec.setup) await spec.setup(page);

        Object.assign(row, await spec.measure(page));
        if (opts.shot) {
          const shotPath = path.join(OUT_DIR, `${caseName}-${width}x${height}.png`);
          await page.screenshot({ path: shotPath });
          row['截图'] = path.relative(process.cwd(), shotPath);
        }
      } catch (error) {
        failed++;
        row['错误'] = String(error.message ?? error).split('\n')[0];
      }
      rows.push(row);
      await page.close();
    }
  } finally {
    if (opts.keep) {
      console.log('\n--keep：浏览器保持打开，按回车结束…');
      await new Promise(resolve => process.stdin.once('data', resolve));
    }
    await browser.close();
  }

  printTable(rows);
  if (failed > 0) {
    console.error(`\n${failed}/${viewports.length} 个视口报错（见上表「错误」列）`);
    process.exitCode = 1;
  }
};

await main();
