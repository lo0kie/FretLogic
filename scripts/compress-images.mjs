import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// raw-icon.png 是构建期源图，放在 scripts/assets 下（不进 public，避免被原样拷进 dist）
const SOURCE = path.resolve(__dirname, './assets/raw-icon.png');
const TARGETS = [
  [path.resolve(__dirname, '../public/favicon.png'), 128],
  [path.resolve(__dirname, '../public/pwa-192x192.png'), 192],
  [path.resolve(__dirname, '../public/pwa-512x512.png'), 512],
];

if (!existsSync(SOURCE)) {
  console.warn(`${SOURCE} 不存在，请确保文件已放入 scripts/assets 目录`);
  process.exit(0);
}

for (const [targetPath, pixel] of TARGETS) {
  if (existsSync(targetPath)) {
    console.log(`${targetPath} 已存在，跳过`);
    continue;
  }
  console.log(`正在生成 ${targetPath}`);
  await sharp(SOURCE).resize(pixel, pixel).webp({ quality: 50, effort: 6 }).toFile(targetPath);
}

console.log('图标处理完成');
