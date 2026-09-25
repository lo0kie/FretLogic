/**
 * pre-push 的全量关卡（pnpm verify）要跑 9 步、动辄数分钟。推送因网络等原因失败后重推，
 * 要推的内容一字未改却得再等一遍 —— 本脚本给这种「原样重试」发一张免检凭证。
 *
 * 判据是 **HEAD 的树哈希**（`git rev-parse HEAD^{tree}`），即「这次要推的提交内容」，不是工作区：
 * 推送失败后继续改工作区、写新草稿、清理临时文件，都不该让重推再等一遍。
 * 为什么用树哈希而不是 HEAD 的 commit sha：改提交信息、rebase 挪位这类不动文件内容的操作
 * 同样不该触发重跑，`^{tree}` 正好只看内容。
 *
 * ⚠️ 由此带来的一条口径：verify 读的是工作区，凭证说的却是「这份提交内容跑过一次完整关卡」。
 * 工作区里未提交的改动不在本次推送范围内，也就不参与判定 —— 想让 WIP 也过一遍关卡，别靠凭证，
 * 直接跑 `pnpm verify`（它读的仍是工作区）。pre-push 在跳过时会提示工作区是否干净。
 *
 * 凭证落在 `<git-dir>/verify-stamp`，是**单机状态**：换机器、重新 clone 都不会带过去，符合预期。
 *
 * 用法（钩子调用，也可手动跑）：
 *   node scripts/verify-stamp.mjs check   # 退出码 0 = 凭证有效，可跳过 verify
 *   node scripts/verify-stamp.mjs write   # verify 全绿后落凭证
 *   node scripts/verify-stamp.mjs clear   # verify 失败时作废，下次老老实实重跑
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const STAMP = path.join(ROOT, git(['rev-parse', '--git-dir']).trim(), 'verify-stamp');

/** HEAD 的树哈希。空仓库 / HEAD 不可解析时返回空串 —— 调用方据此判定「没有可比的内容，不认凭证」。 */
const headTree = () => {
  try {
    return git(['rev-parse', 'HEAD^{tree}']).trim();
  } catch {
    return '';
  }
};

const action = process.argv[2] ?? 'check';

if (action === 'clear') {
  await rm(STAMP, { force: true });
  process.exit(0);
}

if (action !== 'check' && action !== 'write') {
  process.stderr.write(`未知动作：${action}（可用：check / write / clear）\n`);
  process.exit(1);
}

const tree = headTree();

if (action === 'check') {
  let stamped = '';
  try {
    stamped = (await readFile(STAMP, 'utf8')).split('\n')[0].trim();
  } catch {
    // 还没有凭证：按「需要跑 verify」处理
  }
  // tree 为空时一律不认凭证，免得「两边都空」被当成一致
  process.exit(tree !== '' && stamped === tree ? 0 : 1);
}

await writeFile(STAMP, `${tree}\n${new Date().toISOString()}\n`);
