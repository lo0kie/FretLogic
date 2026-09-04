import { spawnSync } from 'node:child_process';

console.log('📦 正在为 Gitee Pages 构建 (base: /fret-logic/)...');

const env = {
  ...process.env,
  BUILD_TARGET: 'gitee',
  VITE_BASE: '/fret-logic/',
};

const result = spawnSync('pnpm', ['exec', 'vite', 'build'], {
  stdio: 'inherit',
  shell: true,
  env,
});

if (result.status !== 0) {
  console.error('❌ Gitee Pages 构建失败');
  process.exit(result.status ?? 1);
}

console.log('✅ Gitee Pages 构建成功！产物目录: dist/');
