/**
 * Fret Logic 云同步后端（Cloudflare Worker + D1）
 *
 * 路由用 Hono 组织：API 形态与 Express 一致（app.get / app.post / app.use 中间件），
 * 但 Hono 是 Workers 原生框架，不需要 nodejs_compat、也不依赖 Node 的 http 原语，
 * 因此 D1 绑定与现有部署方式完全不变。
 *
 * - 读操作（GET 数据 / GET /meta / HEAD）保持公开，与前端「仅推送需 Token」一致；
 * - 写操作 POST 校验 `Authorization: Bearer <SERVER_TOKEN>`（环境变量 / secret），防止他人覆盖云端数据；
 * - GET /auth-check 仅做写鉴权探测、不落库，供前端「测试连接」区分有无 Token（避免真实 POST 污染历史版本）；
 * - 附带永久历史版本归档（sync_history）与轻量校验元数据（data_md5 + data_updated_at，供前端启动时只拉最小数据比对）。
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// 内联 MD5（见 worker/lib/md5.mjs 文件头）：不用 js-md5 是因其顶层 require('crypto')/('buffer')，
// 在 esbuild --platform=neutral 下会解析失败；内联实现与前端 js-md5 逐字节等价（已交叉验证）。
import { md5 } from './lib/md5.mjs';

/** POST 载荷体积上限：超过即 413，避免超大 body 一次性落库 / 撑爆 D1 配额 */
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
/** sync_history 保留的历史版本数：超出即裁掉最旧的，避免无限累积撑配额 */
const SYNC_HISTORY_LIMIT = 50;

const app = new Hono();

// CORS 与 OPTIONS 预检统一交给中间件：原先手写的 CORS_HEADERS 与 OPTIONS 分支整段省掉
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Environment'],
    maxAge: 86400,
  })
);

// 最新快照表（含 data_md5 / data_updated_at 校验列）+ 永久历史表
// 两个时间戳分开放，语义不同、不可互相替代：
//  - updated_at      = 服务端写入时刻（谁在什么时候推的）
//  - data_updated_at = 载荷自身的 maxUpdatedAt（数据内容最后被修改的时间，客户端随 POST 提交）
// 前端「推送前冲突防线」要拿后者与本地 maxUpdatedAt 做同口径比较，用写入时刻会误判。
async function ensureTable(db) {
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS sync_data (id TEXT PRIMARY KEY, data TEXT NOT NULL, data_md5 TEXT, data_updated_at INTEGER, updated_at INTEGER NOT NULL)'
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS sync_history (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created_at INTEGER NOT NULL)'
    ),
  ]);
  // 兼容旧表：给已存在的 sync_data 补校验列（幂等，忽略「列已存在」错误）
  try {
    await db.prepare('ALTER TABLE sync_data ADD COLUMN data_md5 TEXT').run();
  } catch {
    /* 列已存在 */
  }
  try {
    await db.prepare('ALTER TABLE sync_data ADD COLUMN data_updated_at INTEGER').run();
  } catch {
    /* 列已存在 */
  }
}

// D1 绑定校验 + 建表：每个请求都过一遍（ensureTable 内部幂等）。
// 抽成中间件后各路由不再重复这几行，等价于原 fetch 开头那段。
app.use('*', async (c, next) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'D1 数据库未绑定！请在 Worker -> Settings -> Bindings 中添加 D1 绑定' }, 500);
  }
  await ensureTable(db);
  await next();
});

// POST 写操作鉴权：fail-closed——未配置 SERVER_TOKEN 时拒绝一切写操作（含 /auth-check），
// 绝不因「未配置」而放行，否则任何人都能覆盖云端数据（P0 审计 #4）。读操作（GET/HEAD）保持公开。
function isAuthorized(c) {
  const expected = c.env.SERVER_TOKEN;
  if (!expected) return false;
  const token = (c.req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  return token === expected;
}

// GET /history：查看所有历史版本列表
app.get('/history', async c => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, created_at, datetime(created_at/1000, "unixepoch", "localtime") as time, length(data) as size FROM sync_history ORDER BY id DESC'
  ).all();
  return c.json({ total: results.length, history: results });
});

// GET /meta：轻量校验元数据 {md5, updatedAt}，前端启动检测只拉这份
app.get('/meta', async c => {
  const row = await c.env.DB.prepare('SELECT data_md5, updated_at, data_updated_at FROM sync_data WHERE id = ?')
    .bind('latest_backup')
    .first();
  if (!row || !row.data_md5) {
    return c.json({ message: '暂无校验元数据' }, 404);
  }
  // 优先返回载荷自身的 maxUpdatedAt（与前端本地值同口径）；
  // 该列上线前写入的旧记录为 NULL，回退到服务端写入时刻，避免历史数据拿不到时间戳
  const updatedAt = row.data_updated_at ?? row.updated_at;
  return c.json({ md5: row.data_md5, updatedAt }, 200);
});

// GET /auth-check：轻量写鉴权探测（不落库），供前端「测试连接」校验 Token 有效性
app.get('/auth-check', async c => {
  if (!isAuthorized(c)) {
    return c.json({ error: '鉴权失败：Token 无效或缺失' }, 401);
  }
  return c.json({ authorized: true }, 200);
});

// GET / HEAD 任意路径：拉取最新数据（完整数据源，公开）。
// 必须排在 /history、/meta、/auth-check 之后——Hono 按注册顺序匹配，否则会被通配吃掉。
const readSnapshot = async c => {
  const row = await c.env.DB.prepare('SELECT data, updated_at FROM sync_data WHERE id = ?')
    .bind('latest_backup')
    .first();
  if (!row) {
    return c.json({ message: '暂无数据存档' }, 404);
  }
  c.header('ETag', `"${row.updated_at}"`);
  // HEAD 只回 ETag 不带体：前端拿它做存在性探测与 If-Match 条件写的基线
  if (c.req.method === 'HEAD') return c.body('', 200);
  return c.body(row.data, 200, { 'Content-Type': 'application/json; charset=utf-8' });
};
app.get('*', readSnapshot);
app.on('HEAD', '*', readSnapshot);

// POST 任意路径：同步（写操作，需鉴权），md5 与载荷 maxUpdatedAt 经 query 提交落库
app.post('*', async c => {
  if (!isAuthorized(c)) {
    return c.json({ error: '鉴权失败：Token 无效或缺失' }, 401);
  }
  const payloadText = await c.req.text();
  // 体积上限：超过即拒绝，避免超大 body 一次性落库 / 撑爆 D1 配额
  if (payloadText.length > MAX_PAYLOAD_BYTES) {
    return c.json({ error: `载荷过大（上限 ${Math.floor(MAX_PAYLOAD_BYTES / 1024 / 1024)}MB）` }, 413);
  }
  const now = Date.now();
  JSON.parse(payloadText);
  // data_md5 不再信任客户端提交值：用落库 payload 文本现场重算。前端 computePayloadMd5 即
  // md5(serializeForStorage(payload))，而 push 的 body 正是同一 serializeForStorage(payload)，
  // 故服务端 md5(body) 与前端值逐字节一致。客户端值仅用于比对，不一致时记日志，落库以重算为准。
  const serverMd5 = md5(payloadText);
  const clientMd5 = c.req.query('md5') || null;
  if (clientMd5 && clientMd5 !== serverMd5) {
    console.warn(`[sync] 客户端 md5 与重算不一致：client=${clientMd5} server=${serverMd5}`);
  }
  const dataMd5 = serverMd5;
  // 载荷自身的 maxUpdatedAt（客户端随 query 提交）：与前端本地值同口径，供冲突防线比较。
  // 不能直接 Number(param)：Number(null) 与 Number('') 都是 0，会把「缺失」误存成一个合法时间戳；
  // 先判空再转数值，非法/缺失一律存 null，读取时回退到服务端写入时刻。
  const updatedAtRaw = c.req.query('updatedAt');
  const updatedAtNum = updatedAtRaw ? Number(updatedAtRaw) : NaN;
  const dataUpdatedAt = Number.isFinite(updatedAtNum) ? updatedAtNum : null;

  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        'INSERT INTO sync_data (id, data, data_md5, data_updated_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, data_md5 = excluded.data_md5, data_updated_at = excluded.data_updated_at, updated_at = excluded.updated_at'
      )
      .bind('latest_backup', payloadText, dataMd5, dataUpdatedAt, now),
    db.prepare('INSERT INTO sync_history (data, created_at) VALUES (?, ?)').bind(payloadText, now),
    // 历史归档裁剪：batch 在同一事务内顺序执行，此语句能看到上方刚插入的行；只留最近 N 条
    db
      .prepare('DELETE FROM sync_history WHERE id NOT IN (SELECT id FROM sync_history ORDER BY id DESC LIMIT ?)')
      .bind(SYNC_HISTORY_LIMIT),
  ]);

  return c.json({ success: true, updatedAt: now }, 200);
});

// 未匹配（PUT / DELETE 等不支持的方法）统一 405，对应原「不支持的请求方法」分支
app.notFound(c => c.json({ error: '不支持的请求方法' }, 405));

// 兜底异常处理：等价于原 fetch 的 try/catch，但绝不把内部错误详情/堆栈回显给调用方（脱敏，P0 审计 #4）
app.onError((_err, c) => c.json({ error: '服务器内部错误' }, 500));

export default app;
