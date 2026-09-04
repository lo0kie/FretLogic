import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const TARGET_BRANCH = process.env.GITEE_PAGES_BRANCH || 'gitee-pages';

console.log('🚀 准备部署到 Gitee Pages...');

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const isCi = args.includes('--ci');

if (!skipBuild) {
  console.log('📦 执行 Gitee 生产构建 (base: /fret-logic/)...');
  execSync('node ./scripts/build-gitee.mjs', { stdio: 'inherit' });
}

if (!existsSync(distDir) || !existsSync(resolve(distDir, 'index.html'))) {
  console.error('❌ dist 目录或 index.html 不存在，构建可能未成功');
  process.exit(1);
}

// 探测/组装 Gitee 仓库地址
let remoteUrl = process.env.GITEE_REPO_URL;
const token = process.env.GITEE_TOKEN;

if (!remoteUrl) {
  if (token) {
    remoteUrl = `https://look1e:${token}@gitee.com/look1e/fret-logic.git`;
  } else {
    try {
      remoteUrl = execSync('git remote get-url gitee', { encoding: 'utf-8' }).trim();
    } catch {
      try {
        const remotes = execSync('git remote -v', { encoding: 'utf-8' });
        const match = remotes.match(/(https:\/\/gitee\.com\/[^\s]+|git@gitee\.com:[^\s]+)/);
        if (match) remoteUrl = match[1];
      } catch (err) {
        void err;
      }
    }
  }
}

if (!remoteUrl) {
  remoteUrl = 'https://gitee.com/look1e/fret-logic.git';
}

if (isCi && !token && !process.env.GITEE_PRIVATE_KEY && remoteUrl.startsWith('https://')) {
  console.warn('⚠️ CI 环境中未检测到 GITEE_TOKEN 或 GITEE_RSA_PRIVATE_KEY，跳过推送。');
  console.warn('💡 如需 GitHub Actions 自动推送到 Gitee Pages，请在 GitHub 仓库添加 Secrets: GITEE_TOKEN');
  process.exit(0);
}

const maskedUrl = remoteUrl.replace(/:[^:@]+@/, ':***@');
console.log(`🔗 目标仓库: ${maskedUrl}`);
console.log(`🌿 目标分支: ${TARGET_BRANCH}`);

const gitDir = resolve(distDir, '.git');
if (existsSync(gitDir)) {
  rmSync(gitDir, { recursive: true, force: true });
}

try {
  let commitHash = 'manual';
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch (err) {
    void err;
  }

  const runInDist = cmd => execSync(cmd, { cwd: distDir, stdio: 'inherit' });

  runInDist('git init');
  runInDist('git config user.name "deploy-bot"');
  runInDist('git config user.email "deploy-bot@fret-logic.local"');
  runInDist(`git checkout -b ${TARGET_BRANCH}`);
  runInDist('git add -A');
  runInDist(`git commit -m "deploy(gitee-pages): ${commitHash} (${new Date().toISOString()})"`);

  console.log(`📤 推送产物至 Gitee (${TARGET_BRANCH})...`);
  runInDist(`git push -f ${remoteUrl} ${TARGET_BRANCH}:${TARGET_BRANCH}`);

  console.log('\n🎉 Gitee Pages 产物推送成功！');
  console.log('👉 Gitee Pages 访问地址: https://look1e.gitee.io/fret-logic/');
  console.log('📌 若首次部署或未开启自动更新，请前往 Gitee 仓库设置页面:');
  console.log('   https://gitee.com/look1e/fret-logic/pages');
  console.log(`   选择分支 [${TARGET_BRANCH}]，部署目录填 [/]，点击「启动」或「更新」即可。`);
} catch (err) {
  console.error('❌ 推送至 Gitee 失败:', err.message);
  process.exit(1);
} finally {
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true });
  }
}
