import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIRS = ['src'];
// 项目根配置文件清单：与 src 一起打进 all_code.txt，便于把构建/类型/Lint/部署等配置一并带入上下文
const CONFIG_FILES = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.node.json',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierignore',
  'pnpm-workspace.yaml',
  'index.html',
];
const OUTPUT_FILE = 'all_code.txt';
const EXCLUDED_DIRS = ['node_modules'];
const EXCLUDED_FILES = ['all_code.txt'];
const EXCLUDED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];

// 默认剥离注释：dump 更紧凑，token 占用更低。
// 加 --keep-comments 保留注释，用于需要看到设计意图、取舍说明与"为什么这么写"的场合
// （剥离模式下这类信息全部丢失，阅读方容易把刻意决策误判成疏漏）。
const KEEP_COMMENTS = process.argv.includes('--keep-comments');

function collectFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      collectFiles(fullPath, fileList);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDED_FILES.includes(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (EXCLUDED_EXT.includes(ext)) continue;
    fileList.push(fullPath);
  }
  return fileList;
}

function stripComments(content) {
  let result = '';
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];
    const next = content[i + 1];

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = ch;
      i++;
      while (i < len) {
        if (content[i] === '\\' && i + 1 < len) {
          str += content[i] + content[i + 1];
          i += 2;
          continue;
        }
        if (content[i] === quote) {
          str += content[i];
          i++;
          break;
        }
        if (content[i] === '\n') break;
        str += content[i];
        i++;
      }
      result += str;
      continue;
    }

    if (ch === '`') {
      let str = ch;
      i++;
      while (i < len) {
        if (content[i] === '\\' && i + 1 < len) {
          str += content[i] + content[i + 1];
          i += 2;
          continue;
        }
        if (content[i] === '`') {
          str += content[i];
          i++;
          break;
        }
        str += content[i];
        i++;
      }
      result += str;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(content[i] === '*' && content[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < len && content[i] !== '\n') {
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/** 去掉空行（注释去留由调用方决定，两种模式都压缩空行以控制 dump 体积） */
function collapseBlankLines(content) {
  const lines = content.split('\n');
  const filtered = lines.filter(line => line.trim() !== '');
  return filtered.join('\n');
}

function removeCommentsAndBlankLines(content) {
  content = content.replace(/<!--[\s\S]*?-->/g, '');
  content = stripComments(content);
  return collapseBlankLines(content);
}

function main() {
  const allFiles = [];

  for (const dir of SOURCE_DIRS) {
    const srcPath = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(srcPath)) {
      console.warn(`目录 "${srcPath}" 不存在，已跳过`);
      continue;
    }
    console.log(`扫描 ${srcPath} ...`);
    const files = collectFiles(srcPath);
    allFiles.push(...files);
  }

  // 追加项目根配置文件（不存在则跳过，避免因缺失导致整个输出中断）
  for (const rel of CONFIG_FILES) {
    const cfgPath = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(cfgPath)) {
      console.warn(`配置不存在，已跳过: ${rel}`);
      continue;
    }
    if (!allFiles.includes(cfgPath)) allFiles.push(cfgPath);
  }

  const files = Array.from(new Set(allFiles));
  console.log(`找到 ${files.length} 个文件`);
  console.log(KEEP_COMMENTS ? '模式：保留注释' : '模式：剥离注释（加 --keep-comments 可保留）');

  const writeStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
  let isFirstFile = true;

  for (const file of files) {
    try {
      let content = fs.readFileSync(file, 'utf8');

      if (content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
      }

      content = content.replace(/\r\n/g, '\n');
      content = KEEP_COMMENTS ? collapseBlankLines(content) : removeCommentsAndBlankLines(content);
      content = content.replace(/\n{2,}/g, '\n');

      let relPath = path.relative(process.cwd(), file);
      relPath = relPath.replace(/\\/g, '/');

      if (!isFirstFile) {
        writeStream.write('\n');
      }
      isFirstFile = false;

      writeStream.write(`=== FILE: ${relPath} ===\n\n`);
      writeStream.write(content);
    } catch (err) {
      console.warn(`读取失败: ${file} - ${err.message}`);
    }
  }

  writeStream.end(() => {
    console.log(`输出完成: ${path.resolve(OUTPUT_FILE)}`);
  });

  writeStream.on('error', err => {
    console.error(`写入失败: ${err.message}`);
    process.exit(1);
  });
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
