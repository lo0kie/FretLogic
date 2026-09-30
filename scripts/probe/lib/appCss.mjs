/**
 * 取构建产物（`dist/`）里的**真样式表** —— 探针只做渲染，不自己编译样式。
 *
 * 为什么不去读源码里的 CSS / SCSS：本仓的类名大量来自 Tailwind 的**构建期扫描**（`@tailwindcss/vite`
 * 扫源码里出现的完整字面量），源码里的 class 串本身不等于最终规则；只有产物里才有「这个类到底编译
 * 成了什么」。此前的一次性探针一律写着「复用 dist 的真样式表」，就是这个原因。
 *
 * 注入顺序：入口表（`dist/index.html` 引的那份，含 `:root` 令牌与 reset）在最前，其余分包表随后。
 * 组件级 scoped 样式落在分包里，只注入入口表会漏掉它们；顺序反过来则分包可能盖住令牌。
 *
 * ⚠️ 产物是**快照**：改了源码没重跑 `pnpm build`，量到的就是旧规则。故本函数把产物时间戳一并返回，
 * 由调用方打印出来 —— 读数与源码不符时，第一个要看的就是它。
 */
import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';

// 本文件在 scripts/probe/lib/，往上三层即仓库根（不依赖 cwd：探针允许从任意目录调用）
const DIST = path.resolve(import.meta.dirname, '..', '..', '..', 'dist');
const ASSETS = path.join(DIST, 'assets');

const BUILD_HINT = '先跑一次 `pnpm build` 出产物（探针只读产物，不自己编译样式）。';

/** 入口表的文件名：从 `dist/index.html` 的 `<link rel="stylesheet">` 里取（不按体积猜哪份是入口） */
const entryNames = async () => {
  const html = await readFile(path.join(DIST, 'index.html'), 'utf8').catch(() => '');
  return [...html.matchAll(/href="[^"]*?([^"/]+\.css)"/g)].map(m => m[1]);
};

/**
 * @returns `{ css, files, builtAt }`：拼好的样式文本、参与拼接的文件名（按注入序）、产物最后写入时间
 */
export const loadAppCss = async () => {
  const names = await readdir(ASSETS).catch(() => null);
  if (!names) throw new Error(`找不到 ${ASSETS} —— ${BUILD_HINT}`);
  const cssNames = names.filter(name => name.endsWith('.css'));
  if (cssNames.length === 0) throw new Error(`${ASSETS} 里没有任何 .css —— ${BUILD_HINT}`);

  const entry = await entryNames();
  const ordered = [...cssNames.filter(name => entry.includes(name)), ...cssNames.filter(name => !entry.includes(name))];

  const paths = ordered.map(name => path.join(ASSETS, name));
  const [texts, stats] = await Promise.all([
    Promise.all(paths.map(file => readFile(file, 'utf8'))),
    Promise.all(paths.map(file => stat(file))),
  ]);

  return {
    css: texts.map((text, i) => `/* ${ordered[i]} */\n${text}`).join('\n'),
    files: ordered,
    builtAt: new Date(Math.max(...stats.map(s => s.mtimeMs))),
  };
};

/**
 * 在构建产物里取指定工具类的规则原文（Tailwind 产物里一条工具类就是一条独立规则）。
 *
 * 用途是「这个类编译出来到底是什么」这类问题 —— 比如确认 `touch-pan-y` 展开成了
 * `touch-action: var(--tw-pan-x,) …`。**不重新编译**：产物里的就是真规则，重编译还得复刻
 * 本仓的入口与扫描范围，多一层口径反而更容易答错。
 *
 * 类名按 Tailwind 自己的转义取（`:` → `\:`、`[` → `\[`、`.` → `\.` 等），故传**源码里写的那个
 * 类名**即可（`md:px-3`、`max-md:h-[1.6rem]` 都照原样传）。
 *
 * 取值必须**认得出媒体查询里那一档**：响应式类的规则形如
 * `@media (width<48rem){.max-md\:w-2{width:…}}` —— 按 `}` 朴素切块会把选择器切成 `@media (…)`
 * 而漏掉它们，而「断点下这个类是什么」恰恰是探针最常问的一个。故这里按花括号配对取「选择器 +
 * 规则体」：选择器起点取 needle 之前最近的那个 `{` / `}` 之后。
 *
 * 取到的规则还会**把外层 at-rule 条件接回前面**（`@media (width<48rem) { .max-md\:w-2{…} }`）——
 * 条件本身才是「断点下生效」这句话的全部信息，只留 `.max-md\:w-2{…}` 会让 `max-md:` 与 `md:`
 * 两档在读数里长得一样。
 *
 * @param classes 类名数组，如 `['touch-pan-y', 'md:px-3']`
 * @returns 类名 → 命中的规则文本数组（没命中即空数组，代表产物里没有这条规则 —— Tailwind 按用量
 *          裁剪，源码没写过的类产物里就不会有）
 */
export const tailwindRules = async classes => {
  const { css } = await loadAppCss();
  const escapeClass = name => name.replace(/[.:/%[\]()#,>~+*='"!$&^]/g, ch => `\\${ch}`);

  /** needle 处**外层未闭合的 at-rule 条件**（如 `@media (width<48rem)`），由外到内；按花括号栈回溯 */
  const enclosingAtRules = (text, at) => {
    const stack = [];
    for (let i = 0; i < at; i++) {
      if (text[i] === '{') stack.push(i);
      else if (text[i] === '}') stack.pop();
    }
    return stack
      .map(open => {
        // 声明起点取 open 之前最近的 `}` / `{` / `;` 之后（`lastIndexOf` 的 fromIndex 是闭区间，
        // 传 open 会命中 open 自己那个 `{`，必须传 open - 1）
        const from =
          Math.max(text.lastIndexOf('}', open), text.lastIndexOf('{', open - 1), text.lastIndexOf(';', open)) + 1;
        return text.slice(from, open).trim();
      })
      .filter(declaration => declaration.startsWith('@'));
  };

  /** 取 needle 处那条规则的选择器 + 规则体，并接回外层 at-rule 条件（产物已压缩、规则不嵌套，故按花括号配对即可） */
  const ruleAt = (text, at, needleLength) => {
    const open = text.indexOf('{', at + needleLength);
    if (open === -1) return null;
    const close = text.indexOf('}', open);
    if (close === -1) return null;
    const start = Math.max(text.lastIndexOf('}', at), text.lastIndexOf('{', at)) + 1;
    const rule = text.slice(start, close + 1);
    const atRules = enclosingAtRules(text, at);
    return atRules.length === 0 ? rule : `${atRules.join(' ')} { ${rule} }`;
  };

  const result = {};
  for (const name of classes) {
    const needle = `.${escapeClass(name)}`;
    const hits = [];
    for (let from = 0; ;) {
      const at = css.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;
      const rule = ruleAt(css, at, needle.length);
      if (rule !== null && !hits.includes(rule)) hits.push(rule);
    }
    result[name] = hits;
  }
  return result;
};
