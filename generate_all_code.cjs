const fs = require('fs');
const path = require('path');

// ======== 配置 ========
const SOURCE_DIR = 'src';
const OUTPUT_FILE = 'all_code.txt';
const EXCLUDED_DIRS = ['node_modules'];
const EXCLUDED_FILES = ['all_code.txt'];
const EXCLUDED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];
// =====================

/**
 * 递归收集文件路径
 */
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

/**
 * 删除代码中的注释（单行 // 和多行 /* ... * /）
 * 然后过滤掉所有空白行（只含空格/制表符的行）
 */
function removeCommentsAndBlankLines(content) {
  // 1. 删除多行注释 /* ... */ （可跨行，非贪婪匹配）
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // 2. 删除单行注释 // （从 // 到行尾）
  content = content.replace(/\/\/.*$/gm, '');
  // 3. 按行分割，过滤掉空行或只含空白字符的行
  const lines = content.split('\n');
  const filtered = lines.filter(line => line.trim() !== '');
  // 重新合并，保留换行
  return filtered.join('\n');
}

function main() {
  const srcPath = path.resolve(process.cwd(), SOURCE_DIR);
  if (!fs.existsSync(srcPath)) {
    console.error(`目录 "${srcPath}" 不存在`);
    process.exit(1);
  }

  console.log(`扫描 ${srcPath} ...`);
  const files = collectFiles(srcPath);
  console.log(`找到 ${files.length} 个文件`);

  const writeStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
  let isFirstFile = true;

  for (const file of files) {
    try {
      let content = fs.readFileSync(file, 'utf8');

      // 移除开头的 BOM
      if (content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
      }

      // 统一换行符为 \n
      content = content.replace(/\r\n/g, '\n');

      // 删除注释并清理空行（仅当不是 .d.ts 文件）
      if (!file.endsWith('.d.ts')) {
        content = removeCommentsAndBlankLines(content);
      }

      // 压缩连续换行（多个空行合并为一个）
      content = content.replace(/\n{2,}/g, '\n');

      // 生成相对路径
      let relPath = path.relative(process.cwd(), file);
      relPath = relPath.replace(/\\/g, '/');

      // 文件间分隔
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

if (require.main === module) {
  main();
}
