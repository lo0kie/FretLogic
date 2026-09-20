import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const distRoot = 'dist';
const assetsDir = join(distRoot, 'assets');
const INITIAL_BUDGET_KB = 220;
const CHUNK_BUDGET_KB = 160;

const gzipSize = async path => {
  const content = await readFile(path);
  return gzipSync(content).length;
};

// Rollup 产物的静态依赖只有两种写法：`import{a}from"./x.js"` 与裸 `import"./x.js"`。
// 动态 `import("./x.js")` 不会命中：`from` 形态不成立，且 `import` 与引号之间隔着括号。
const STATIC_DEP_PATTERNS = [/\bfrom\s*["'](\.\/[^"']+\.js)["']/g, /\bimport\s*["'](\.\/[^"']+\.js)["']/g];

const collectStaticDeps = async file => {
  const source = await readFile(file, 'utf8');
  const deps = new Set();
  for (const pattern of STATIC_DEP_PATTERNS) {
    for (const match of source.matchAll(pattern)) deps.add(basename(match[1]));
  }
  return deps;
};

// 首屏 = index.html 的 module 入口 chunk 及其静态依赖闭包。
// 产物名已纯哈希化（vite.config.ts 的 entryFileNames / chunkFileNames），无法再靠文件名特征推断，
// 只能沿真实 import 图求闭包；动态 import 的懒加载 chunk 不计入首屏。
const findInitialChunks = async () => {
  const html = await readFile(join(distRoot, 'index.html'), 'utf8');
  const entries = [];
  for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
    if (!/\btype=["']module["']/.test(tag)) continue;
    const src = tag.match(/\bsrc=["']\.\/assets\/([^"']+\.js)["']/);
    if (src) entries.push(src[1]);
  }
  if (entries.length === 0) {
    throw new Error('dist/index.html 中未找到 module 入口 chunk，首屏预算无法计算');
  }

  const initial = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const current = queue.shift();
    if (initial.has(current)) continue;
    initial.add(current);
    queue.push(...(await collectStaticDeps(join(assetsDir, current))));
  }
  return initial;
};

const initialChunks = await findInitialChunks();

const files = (await readdir(assetsDir)).filter(file => file.endsWith('.js'));
const sizes = await Promise.all(files.map(async file => ({ file, bytes: await gzipSize(join(assetsDir, file)) })));
const sizesByFile = new Map(sizes.map(entry => [entry.file, entry]));

const oversizedChunks = sizes.filter(({ bytes }) => bytes > CHUNK_BUDGET_KB * 1024);
const initialSizes = [...initialChunks].map(file => {
  const size = sizesByFile.get(file);
  if (!size) throw new Error(`首屏依赖 ${file} 不在 dist/assets 中，产物依赖图不完整`);
  return size;
});
const initialBytes = initialSizes.reduce((total, { bytes }) => total + bytes, 0);
const initialKb = Math.round(initialBytes / 10.24) / 100;

console.log('JavaScript chunk budgets');
sizes.forEach(({ file, bytes }) => {
  const marker = initialChunks.has(file) ? '  [initial]' : '';
  console.log(`${join(assetsDir, file)}: ${(bytes / 1024).toFixed(2)} KB gzip${marker}`);
});
console.log(`Approximate initial JS: ${initialKb} KB gzip (${initialSizes.length} chunks)`);

if (oversizedChunks.length > 0) {
  console.error(`\nOversized chunks (> ${CHUNK_BUDGET_KB} KB gzip)：`);
  oversizedChunks.forEach(({ file, bytes }) => console.error(`${file}: ${(bytes / 1024).toFixed(2)} KB`));
  // 必须失败退出：预算只打印不拦截就只是日志（此前如此，超预算的懒加载 chunk 照样上线）。
  // 若某个 chunk 合法地大（如重依赖导出链），正确动作是调高 CHUNK_BUDGET_KB 并在注释写明理由，
  // 而不是让这条门槛永远哑火。
  process.exitCode = 1;
}

if (initialBytes > INITIAL_BUDGET_KB * 1024) {
  console.error(`Initial bundle exceeds ${INITIAL_BUDGET_KB} KB gzip.`);
  process.exit(1);
}
