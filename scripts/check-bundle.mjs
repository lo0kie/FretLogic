import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = 'dist/assets';
const INITIAL_BUDGET_KB = 220;
const CHUNK_BUDGET_KB = 160;

const gzipSize = async path => {
  const content = await readFile(path);
  return gzipSync(content).length;
};

const files = (await readdir(distDir)).filter(file => file.endsWith('.js')).map(file => join(distDir, file));
const sizes = await Promise.all(files.map(async file => ({ file, bytes: await gzipSize(file) })));
const oversizedChunks = sizes.filter(({ bytes }) => bytes > CHUNK_BUDGET_KB * 1024);

// 当前 Rollup 入口图由多个初始 chunk 组成；以所有非异步 vendor 大块的总和近似首屏。
const initialCandidates = sizes.filter(({ file }) => /index-|vue-|vueuse-/.test(file));
const initialBytes = initialCandidates.reduce((total, { bytes }) => total + bytes, 0);
const initialKb = Math.round(initialBytes / 10.24) / 100;

console.log('JavaScript chunk budgets');
sizes.forEach(({ file, bytes }) => console.log(`${file}: ${(bytes / 1024).toFixed(2)} KB gzip`));
console.log(`Approximate initial JS: ${initialKb} KB gzip`);

if (oversizedChunks.length > 0) {
  console.error('\nOversized chunks:');
  oversizedChunks.forEach(({ file, bytes }) => console.error(`${file}: ${(bytes / 1024).toFixed(2)} KB`));
}

if (initialBytes > INITIAL_BUDGET_KB * 1024) {
  console.error(`Initial bundle exceeds ${INITIAL_BUDGET_KB} KB gzip.`);
  process.exit(1);
}
