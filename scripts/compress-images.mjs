import path from 'node:path';
import { existsSync, statSync } from 'node:fs';

import sharp from 'sharp';

// raw-icon.png 是构建期源图，放在 scripts/assets 下（不进 public，避免被原样拷进 dist）
const SOURCE = path.resolve(import.meta.dirname, './assets/raw-icon.png');
const TARGETS = [
  [path.resolve(import.meta.dirname, '../public/favicon.png'), 128],
  [path.resolve(import.meta.dirname, '../public/pwa-192x192.png'), 192],
  [path.resolve(import.meta.dirname, '../public/pwa-512x512.png'), 512],
];

// --force：无条件重生成（源图换了但时间戳不可靠时的兜底）
const FORCE = process.argv.includes('--force');

if (!existsSync(SOURCE)) {
  // 非零退出：源图缺失时**一个产物都没生成**，脚本的职责并未完成。
  // 此前 exit(0) 让「缺源图」与「全部生成成功」在调用方（CI / 手工串联的命令行）眼里毫无区别。
  console.error(`${SOURCE} 不存在，请确保文件已放入 scripts/assets 目录`);
  process.exit(1);
}

/**
 * 目标是否比源图新。
 *
 * 旧的「目标存在即跳过」让重跑彻底失效——换了 raw-icon.png 再执行本脚本也什么都不做，
 * 只能手工删掉三张图才生效。改为按 mtime 比较（源图更新才重生成），--force 可强制覆盖。
 */
const isUpToDate = targetPath => {
  if (FORCE || !existsSync(targetPath)) return false;
  return statSync(targetPath).mtimeMs >= statSync(SOURCE).mtimeMs;
};

for (const [targetPath, pixel] of TARGETS) {
  if (isUpToDate(targetPath)) {
    console.log(`${targetPath} 已是最新，跳过（需要强制重建请加 --force）`);
    continue;
  }
  console.log(`正在生成 ${targetPath}`);
  // 必须输出真 PNG：文件名是 .png，index.html 与 manifest 均声明 image/png。
  // 此前这里写的是 .webp()，产物字节头为 RIFF....WEBP 却挂 .png 扩展名，
  // 与声明不符（PWA 安装校验/部分平台按声明类型解码会拒收）。
  await sharp(SOURCE).resize(pixel, pixel).png({ compressionLevel: 9, palette: true }).toFile(targetPath);
}

console.log('图标处理完成');
